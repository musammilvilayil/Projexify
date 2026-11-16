/**
 * Socket.io module for Virtual Lab sessions (namespace /virtual-lab) and notifications (/notifications).
 *
 * Security model
 * --------------
 * - socket.userId / userRoles come from the verified JWT (middleware/auth.js socketioJWTAuth).
 * - A user joins a room only after the database says they belong to it:
 *     * mentor-created sessions (Session): the mentor or one of session.studentIds
 *     * group sessions (VirtualLabSession + StudentGroup): group members / the group's mentor
 * - Roles inside a room (mentor / student) are derived on the server, never taken from the client.
 * - Mentor-only actions (feedback, end session, hints) check that server-derived role.
 */
const VirtualLabSession = require('../models/VirtualLabSession');
const Session = require('../models/Session');
const StudentGroup = require('../models/StudentGroup');
const Progress = require('../models/Progress');
const Project = require('../models/Project');
const User = require('../models/User');

const isObjectId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const MAX_CODE_CHARS = 500000;
const MAX_TERMINAL_CHARS = 10000;
const MAX_ACTIVITY_ENTRIES = 200;
const PERSIST_DEBOUNCE_MS = 1500;

const HINTS = {
  'undefined': 'Variable is not defined. Check if you declared it before using it.',
  'not a function': "You're trying to call something that isn't a function. Check the type.",
  'cannot read propert': "Property doesn't exist. Make sure the object is initialized.",
  'syntaxerror': 'Check your code syntax - missing brackets, semicolons, or quotes.',
  'referenceerror': 'Variable is referenced before declaration. Move declaration above usage.',
  'typeerror': 'Type mismatch. Check if the value type matches expected type.',
};

module.exports = (io) => {
  try {
    const labNamespace = io.of('/virtual-lab');

    // roomId -> { participants, code, terminal, ... }
    const activeRooms = new Map();

    /** Persist lab state to whichever collection owns the session. */
    const persist = (room, kind, payload) => {
      const Model = room.model === 'Session' ? Session : VirtualLabSession;
      const now = new Date();
      let update;

      if (room.model === 'Session') {
        update = {
          code: { labCode: payload.code, labLastActivity: now, $push: { labActivity: { $each: [{ timestamp: now, type: 'code-change', userId: payload.userId, filePath: payload.filePath, contentLength: (payload.code || '').length }], $slice: -MAX_ACTIVITY_ENTRIES } } },
          hint: { labLastActivity: now, $push: { labActivity: { $each: [{ timestamp: now, type: 'hint-request', userId: payload.userId, note: payload.note }], $slice: -MAX_ACTIVITY_ENTRIES } } },
          feedback: { labLastActivity: now, $push: { labFeedback: { mentorId: payload.userId, message: payload.message, lineNumber: payload.lineNumber, filePath: payload.filePath, timestamp: now } } },
          end: { status: 'completed', endedAt: now, active: false, is_completed: true, completed_at: now, labLastActivity: now, ...(payload.code ? { labCode: payload.code } : {}) },
        }[kind];
      } else {
        update = {
          code: { code: payload.code, lastActivityTime: now, $push: { 'recording.chunks': { timestamp: now, type: 'code-change', userId: payload.userId, userEmail: payload.userEmail, contentLength: (payload.code || '').length } } },
          hint: { $push: { 'recording.chunks': { timestamp: now, type: 'hint-request', userId: payload.userId, error: payload.note } } },
          feedback: { $push: { feedback: { mentorId: payload.userId, mentorEmail: payload.userEmail, message: payload.message, lineNumber: payload.lineNumber, type: 'comment', timestamp: now } } },
          end: { status: 'ended', ended_at: now, endTime: now, 'recording.duration': payload.durationMinutes, 'recording.endTime': now },
        }[kind];
      }
      return Model.findByIdAndUpdate(room.sessionId, update).exec();
    };

    /** Debounced save so typing does not write to MongoDB on every keystroke. */
    const schedulePersistCode = (room, userId, userEmail, filePath) => {
      room.pendingCode = { userId, userEmail, filePath };
      if (room.persistTimer) return;
      room.persistTimer = setTimeout(async () => {
        room.persistTimer = null;
        const p = room.pendingCode;
        room.pendingCode = null;
        if (!p) return;
        try {
          await persist(room, 'code', { code: room.code, ...p });
        } catch (error) {
          console.error('[Virtual Lab] Failed to save code:', error.message);
        }
      }, PERSIST_DEBOUNCE_MS);
    };

    const participantList = (room) =>
      Array.from(room.participants.entries()).map(([id, info]) => ({ userId: id, name: info.name, role: info.role }));

    /** Put an already-authorized socket into a room and announce it. */
    const enterRoom = async (socket, ctx) => {
      const { sessionId, groupId, projectId, mentorId, role, model, studentIds, initialCode } = ctx;
      const roomId = `session-${sessionId}`;
      const userId = String(socket.userId);

      socket.join(roomId);
      socket.sessionId = String(sessionId);
      socket.groupId = groupId ? String(groupId) : null;
      socket.projectId = projectId ? String(projectId) : null;
      socket.mentorId = mentorId ? String(mentorId) : null;
      socket.userRole = role; // derived server-side

      if (!activeRooms.has(roomId)) {
        activeRooms.set(roomId, {
          participants: new Map(),
          code: initialCode || '// Start coding here\n',
          terminal: [],
          startTime: new Date(),
          sessionId: String(sessionId),
          groupId: groupId ? String(groupId) : null,
          projectId: projectId ? String(projectId) : null,
          mentorId: mentorId ? String(mentorId) : null,
          studentIds: (studentIds || []).map(String),
          model,
          cursorPositions: new Map(),
          persistTimer: null,
        });
      }
      const room = activeRooms.get(roomId);
      room.participants.set(userId, { name: socket.userEmail || 'Anonymous', role, joinedAt: new Date() });

      socket.to(roomId).emit('user-joined', {
        userId, userName: socket.userEmail, role, participants: participantList(room), timestamp: new Date(),
      });
      socket.emit('session-joined', {
        sessionId: String(sessionId),
        groupId: socket.groupId,
        role,
        code: room.code,
        participants: participantList(room),
        terminal: room.terminal.slice(-10),
        timestamp: new Date(),
      });

      // First activity moves an "enrolled" student to "in_progress"
      if (role === 'student' && projectId) {
        try {
          await Progress.updateOne(
            { studentId: userId, projectId, status: 'enrolled' },
            { status: 'in_progress', started_at: new Date(), last_activity: new Date() }
          ).exec();
        } catch (error) {
          console.error('[Virtual Lab] Failed to update progress on join:', error.message);
        }
      }
    };

    const failJoin = (socket, message) => socket.emit('join-session-failed', { message });

    const projectUnavailable = (project) => !project || project.status === 'archived' || project.status === 'inactive';

    /** Section of the room map the socket is in, or null. Used by every in-session handler. */
    const roomFor = (socket) => {
      if (!socket.sessionId) return null;
      const room = activeRooms.get(`session-${socket.sessionId}`);
      if (!room || !room.participants.has(String(socket.userId))) return null;
      return room;
    };

    labNamespace.on('connection', (socket) => {
      console.log(`[Virtual Lab] User ${socket.userId} connected (socket: ${socket.id})`);

      /**
       * JOIN SESSION
       * data: { sessionId, groupId? }
       *  - mentor sessions: sessionId is a Session id (groupId not needed)
       *  - group lab sessions: sessionId is a VirtualLabSession id and groupId is required
       */
      socket.on('join-session', async (data = {}) => {
        try {
          const userId = String(socket.userId);
          const sessionId = String(data.sessionId || '');
          const groupId = data.groupId ? String(data.groupId) : '';

          if (!isObjectId(sessionId)) return failJoin(socket, 'Invalid session ID');

          // ---- Path 1: session created by a mentor (Session) ----
          const session = await Session.findById(sessionId).lean();
          if (session) {
            const isMentor = String(session.mentorId) === userId;
            const isStudent = (session.studentIds || []).some((s) => String(s) === userId);
            if (!isMentor && !isStudent) return failJoin(socket, 'You are not part of this session');
            if (['completed', 'cancelled'].includes(session.status)) return failJoin(socket, 'This session has ended');

            const project = await Project.findById(session.projectId).lean();
            if (projectUnavailable(project)) return failJoin(socket, 'This project is no longer available');

            const roomId = `session-${sessionId}`;
            return await enterRoom(socket, {
              sessionId,
              groupId: session.groupId,
              projectId: session.projectId,
              mentorId: session.mentorId,
              role: isMentor ? 'mentor' : 'student',
              model: 'Session',
              studentIds: session.studentIds,
              initialCode: activeRooms.has(roomId) ? undefined : session.labCode,
            });
          }

          // ---- Path 2: group lab session (VirtualLabSession + StudentGroup) ----
          if (!isObjectId(groupId)) return failJoin(socket, 'Session not found');

          const labSession = await VirtualLabSession.findById(sessionId).lean();
          if (!labSession || String(labSession.groupId) !== groupId) return failJoin(socket, 'Session not found');
          if (['ended', 'completed', 'terminated'].includes(labSession.status)) return failJoin(socket, 'This session has ended');

          const group = await StudentGroup.findById(groupId).lean();
          if (!group) return failJoin(socket, 'Group not found');

          const isGroupMentor = !!group.mentorId && String(group.mentorId) === userId;
          const isMember = (group.students || []).some((s) => String(s) === userId);
          if (!isMember && !isGroupMentor) return failJoin(socket, 'You are not a member of this group');

          if (!isGroupMentor) {
            const enrollment = await Progress.findOne({ studentId: userId, projectId: group.projectId, groupId }).lean();
            if (!enrollment) return failJoin(socket, 'You are not enrolled in this project');
          }

          const project = await Project.findById(group.projectId).lean();
          if (projectUnavailable(project)) return failJoin(socket, 'This project is no longer available');

          // A group may not have a mentor yet; only reject when one was set but no longer exists
          if (group.mentorId) {
            const mentor = await User.findById(group.mentorId).select('_id').lean();
            if (!mentor) return failJoin(socket, 'Session mentor is no longer available');
          }

          const roomId = `session-${sessionId}`;
          await enterRoom(socket, {
            sessionId,
            groupId,
            projectId: group.projectId,
            mentorId: group.mentorId,
            role: isGroupMentor ? 'mentor' : 'student',
            model: 'VirtualLabSession',
            studentIds: group.students,
            initialCode: activeRooms.has(roomId) ? undefined : labSession.code,
          });
        } catch (error) {
          console.error('[Virtual Lab] Error joining session:', error);
          failJoin(socket, 'Failed to join session. Please try again.');
        }
      });

      /** CODE CHANGE - relayed to everyone else in the room (never trusts client user ids). */
      socket.on('code-change', (data = {}) => {
        try {
          const room = roomFor(socket);
          if (!room) return;
          const { code } = data;
          if (typeof code !== 'string' || code.length > MAX_CODE_CHARS) return;
          const filePath = typeof data.filePath === 'string' ? data.filePath.slice(0, 500) : undefined;

          room.code = code;
          schedulePersistCode(room, socket.userId, socket.userEmail, filePath);

          socket.to(`session-${socket.sessionId}`).emit('code-update', {
            code,
            filePath,
            userId: socket.userId,
            userName: socket.userEmail,
            role: socket.userRole,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error('[Virtual Lab] Error handling code-change:', error);
        }
      });

      socket.on('cursor-move', (data = {}) => {
        const room = roomFor(socket);
        if (!room) return;
        const line = Number(data.line);
        const column = Number(data.column);
        if (!Number.isFinite(line) || !Number.isFinite(column)) return;
        room.cursorPositions.set(String(socket.userId), { line, column });
        socket.to(`session-${socket.sessionId}`).emit('cursor-update', {
          userId: socket.userId, userName: socket.userEmail, line, column, timestamp: new Date(),
        });
      });

      /** HINTS - mentors only (role derived on the server). */
      socket.on('request-hint', async (data = {}) => {
        try {
          const room = roomFor(socket);
          if (!room) return;
          if (socket.userRole !== 'mentor') {
            return socket.emit('hint-error', { message: 'Only mentors can request hints' });
          }
          const errorText = typeof data.error === 'string' ? data.error : '';
          const lower = errorText.toLowerCase();
          let hint = 'Review your code for syntax errors or missing declarations';
          for (const [key, value] of Object.entries(HINTS)) {
            if (lower.includes(key)) { hint = value; break; }
          }
          socket.emit('hint-response', { hint, timestamp: new Date() });
          persist(room, 'hint', { userId: socket.userId, note: errorText.slice(0, 100) }).catch((e) =>
            console.error('[Virtual Lab] Failed to record hint:', e.message));
        } catch (error) {
          console.error('[Virtual Lab] Error handling hint request:', error);
          socket.emit('hint-error', { message: 'Unable to generate hint at this time' });
        }
      });

      /** TERMINAL OUTPUT - shared console for everyone in the session. */
      socket.on('terminal-output', (data = {}) => {
        const room = roomFor(socket);
        if (!room || typeof data.output !== 'string') return;
        const output = data.output.slice(0, MAX_TERMINAL_CHARS);
        room.terminal.push({ timestamp: new Date(), userId: socket.userId, output });
        if (room.terminal.length > 50) room.terminal = room.terminal.slice(-50);
        socket.to(`session-${socket.sessionId}`).emit('terminal-update', {
          output, userId: socket.userId, userName: socket.userEmail, timestamp: new Date(),
        });
      });

      /** MENTOR FEEDBACK - mentors only. */
      socket.on('send-feedback', async (data = {}) => {
        try {
          const room = roomFor(socket);
          if (!room) return;
          if (socket.userRole !== 'mentor') {
            return socket.emit('error', { message: 'Only mentors can provide feedback' });
          }
          const message = typeof data.message === 'string' ? data.message.trim().slice(0, 2000) : '';
          if (!message) return;
          const lineNumber = Number.isFinite(Number(data.lineNumber)) ? Number(data.lineNumber) : undefined;
          const filePath = typeof data.filePath === 'string' ? data.filePath.slice(0, 500) : undefined;

          persist(room, 'feedback', { userId: socket.userId, userEmail: socket.userEmail, message, lineNumber, filePath }).catch((e) =>
            console.error('[Virtual Lab] Failed to save feedback:', e.message));

          labNamespace.to(`session-${socket.sessionId}`).emit('feedback-received', {
            mentorName: socket.userEmail, mentorId: socket.userId, message, lineNumber, filePath, timestamp: new Date(),
          });
        } catch (error) {
          console.error('[Virtual Lab] Error sending feedback:', error);
          socket.emit('error', { message: 'Failed to send feedback' });
        }
      });

      /** STUDENT FEEDBACK REQUEST. */
      socket.on('request-feedback', (data = {}) => {
        const room = roomFor(socket);
        if (!room) return;
        if (!room.mentorId) return socket.emit('error', { message: 'No mentor available in this session' });
        labNamespace.to(`session-${socket.sessionId}`).emit('feedback-requested', {
          studentName: socket.userEmail,
          studentId: socket.userId,
          message: typeof data.message === 'string' ? data.message.slice(0, 2000) : '',
          lineNumber: Number.isFinite(Number(data.lineNumber)) ? Number(data.lineNumber) : undefined,
          type: typeof data.type === 'string' ? data.type.slice(0, 50) : undefined,
          timestamp: new Date(),
        });
        socket.emit('feedback-request-sent', { message: 'Your feedback request has been sent to the mentor', timestamp: new Date() });
      });

      /** END SESSION - mentors only. Saves state and credits attending students. */
      socket.on('end-session', async () => {
        try {
          const roomId = `session-${socket.sessionId}`;
          const room = roomFor(socket);
          if (!room) return;
          if (socket.userRole !== 'mentor') {
            return socket.emit('error', { message: 'Only mentors can end sessions' });
          }

          const durationMinutes = Math.max(0, Math.floor((Date.now() - room.startTime.getTime()) / 60000));
          if (room.persistTimer) { clearTimeout(room.persistTimer); room.persistTimer = null; }

          try {
            await persist(room, 'end', { code: room.code, durationMinutes });
          } catch (error) {
            console.error('[Virtual Lab] Failed to update session:', error.message);
          }

          try {
            const attendeeIds = Array.from(room.participants.entries()).filter(([, p]) => p.role === 'student').map(([id]) => id);
            if (attendeeIds.length && room.projectId) {
              const filter = { studentId: { $in: attendeeIds }, projectId: room.projectId };
              if (isObjectId(room.groupId || '')) filter.groupId = room.groupId;
              // Aggregation-pipeline update: caps progress at 100% and never regresses a finished student
              await Progress.updateMany(filter, [{
                $set: {
                  completion_percentage: { $min: [100, { $add: [{ $ifNull: ['$completion_percentage', 0] }, 2] }] },
                  total_hours_spent: { $add: [{ $ifNull: ['$total_hours_spent', 0] }, durationMinutes / 60] },
                  last_activity: new Date(),
                  status: { $cond: [{ $in: ['$status', ['completed', 'submitted']] }, '$status', 'in_progress'] },
                },
              }]).exec();
            }
          } catch (error) {
            console.error('[Virtual Lab] Failed to update progress:', error.message);
          }

          activeRooms.delete(roomId);
          labNamespace.to(roomId).emit('session-ended', { message: 'Session ended by mentor', durationMinutes, timestamp: new Date() });
        } catch (error) {
          console.error('[Virtual Lab] Error ending session:', error);
          socket.emit('error', { message: 'Failed to end session' });
        }
      });

      socket.on('disconnect', () => {
        const userId = String(socket.userId);
        for (const [roomId, room] of Array.from(activeRooms.entries())) {
          if (!room.participants.has(userId)) continue;
          // Another tab of the same user may still be connected to this room
          const stillThere = Array.from(labNamespace.sockets.values()).some(
            (s) => s.id !== socket.id && String(s.userId) === userId && s.sessionId === room.sessionId);
          if (stillThere) continue;

          room.participants.delete(userId);
          socket.to(roomId).emit('user-left', { userId, participants: participantList(room), timestamp: new Date() });
          if (room.participants.size === 0) {
            if (room.persistTimer) { clearTimeout(room.persistTimer); room.persistTimer = null; }
            // Flush the last code state before dropping the room
            persist(room, 'code', { code: room.code, userId }).catch(() => {});
            activeRooms.delete(roomId);
          }
        }
      });
    });

    /** Terminate rooms owned by a deleted mentor and/or group (null-safe: either argument may be null). */
    const cleanupOrphanedSessions = (mentorId, groupId) => {
      try {
        const m = mentorId ? String(mentorId) : null;
        const g = groupId ? String(groupId) : null;
        const doomed = Array.from(activeRooms.entries())
          .filter(([, room]) => (m && room.mentorId === m) || (g && room.groupId === g))
          .map(([roomId]) => roomId);

        doomed.forEach((roomId) => {
          labNamespace.to(roomId).emit('session-terminated-admin', {
            message: 'This session has been terminated by the system.',
            timestamp: new Date(),
          });
          activeRooms.delete(roomId);
        });
        return doomed.length;
      } catch (error) {
        console.error('[Virtual Lab] Error in cleanup:', error);
        return 0;
      }
    };

    /**
     * NOTIFICATIONS namespace. The JWT middleware runs first; each socket is placed ONLY in its own
     * room. (Previously any client could subscribe to any user's notifications by sending an id.)
     */
    const notificationNamespace = io.of('/notifications');
    notificationNamespace.on('connection', (socket) => {
      socket.join(`user-${socket.userId}`);
      socket.on('subscribe-user', () => socket.join(`user-${socket.userId}`)); // legacy event, id is ignored
    });

    return { labNamespace, notificationNamespace, cleanupOrphanedSessions, activeRooms };
  } catch (error) {
    console.error('[Socket.io] Initialization error:', error);
    return { labNamespace: null, notificationNamespace: null, cleanupOrphanedSessions: null };
  }
};
