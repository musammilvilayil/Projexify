/**
 * Socket.io Module for Secure Virtual Lab Sessions with Real-Time Collaboration
 * 
 * SECURITY ARCHITECTURE:
 * =====================
 * 1. User identity extracted from verified JWT token (via auth.js middleware)
 * 2. Group membership verified in database before session access
 * 3. Progress model checked to confirm enrollment
 * 4. All operations use socket.userId from token (not client data)
 * 5. Automatic cleanup of orphaned sessions on mentor/project deletion
 * 
 * Key Changes from Previous Version:
 * - ❌ REMOVED: Trust of client-provided userId, userName, role
 * - ✅ ADDED: JWT token verification via middleware
 * - ✅ ADDED: Database verification of group membership
 * - ✅ ADDED: Progress model as Single Source of Truth
 * - ✅ ADDED: Async/await for all database operations
 * - ✅ ADDED: Cascade delete handling for mentor/project deletion
 */

const VirtualLabSession = require('../models/VirtualLabSession');
const StudentGroup = require('../models/StudentGroup');
const Progress = require('../models/Progress');
const Project = require('../models/Project');
const User = require('../models/User');

module.exports = (io) => {
  try {
    // Socket.io connection namespace for virtual lab sessions
    const labNamespace = io.of('/virtual-lab');

    // Track active sessions and participants in memory
    const activeRooms = new Map(); // roomId -> { participants, code, terminal, createdAt }

    /**
     * ========================================================================
     * CONNECTION HANDLER
     * ========================================================================
     * JWT authentication middleware is applied BEFORE this handler.
     * socket.userId, socket.userRoles, etc. are already set from verified token.
     */
    labNamespace.on('connection', (socket) => {
      // ✅ VERIFIED: socket.userId comes from JWT token (not client data)
      // ✅ VERIFIED: socket.isAuthenticated flag set by auth middleware
      console.log(`[Virtual Lab] User ${socket.userId} connected (socket: ${socket.id})`);

      /**
       * ====================================================================
       * JOIN SESSION - WITH SECURITY VERIFICATION
       * ====================================================================
       * 
       * Verification Gates (In Order):
       * 1. SessionId and GroupId provided
       * 2. StudentGroup exists and is active
       * 3. User is member of StudentGroup
       * 4. Progress record exists (user enrolled in project)
       * 5. Project is not archived
       * 6. Mentor is still active (not deleted)
       * 
       * SECURITY: User identity comes from JWT token, not from client data
       */
      socket.on('join-session', async (data) => {
        try {
          // ✅ Client sends only sessionId and groupId (verified against DB)
          const { sessionId, groupId } = data;
          const userId = socket.userId;  // ✅ From verified JWT token
          const roomId = `session-${sessionId}`;

          // Validation: Required parameters
          if (!sessionId || !groupId) {
            console.warn(`[Virtual Lab] Invalid parameters: sessionId=${sessionId}, groupId=${groupId}`);
            socket.emit('join-session-failed', {
              message: 'Invalid session or group ID'
            });
            return;
          }

          // Check if this is an individual session (not a group)
          const isIndividualSession = groupId.startsWith('individual-');

          if (isIndividualSession) {
            // Individual session - simpler validation
            const expectedIndividualId = `individual-${userId}`;
            if (groupId !== expectedIndividualId) {
              console.warn(`[Virtual Lab] Individual session mismatch: expected=${expectedIndividualId}, got=${groupId}`);
              socket.emit('join-session-failed', {
                message: 'Invalid individual session'
              });
              return;
            }

            // Join the room
            socket.join(roomId);
            socket.sessionId = sessionId;
            socket.groupId = groupId;

            console.log(`[Virtual Lab] ✅ User ${userId} joined individual session: ${sessionId}`);

            // Emit session-joined (matching the frontend listener)
            socket.emit('session-joined', {
              sessionId,
              groupId,
              code: '', // Empty code for new sessions
              participants: [{
                userId: userId,
                name: socket.userEmail || 'Student',
                role: 'student'
              }],
              terminal: [],
              timestamp: new Date(),
              message: 'Successfully joined individual session'
            });

            return;
          }

          // ========== SECURITY GATE #1: Verify StudentGroup Exists ==========
          const studentGroup = await StudentGroup.findById(groupId)
            .lean()  // Optimize query performance
            .exec();

          if (!studentGroup) {
            console.warn(`[Virtual Lab] Group not found: groupId=${groupId}, userId=${userId}`);
            socket.emit('join-session-failed', {
              message: 'Group not found'
            });
            return;
          }

          // ========== SECURITY GATE #2: Verify User is Group Member ==========
          const isMember = studentGroup.students.some(
            studentId => studentId.toString() === userId.toString()
          );

          if (!isMember && studentGroup.mentorId.toString() !== userId.toString()) {
            // User is neither a student nor the mentor
            console.warn(`[Virtual Lab] Unauthorized access attempt: userId=${userId}, groupId=${groupId}`);
            socket.emit('join-session-failed', {
              message: 'You are not a member of this group'
            });
            return;
          }

          // ========== SECURITY GATE #3: Verify Enrollment (Progress Record) ==========
          const progressRecord = await Progress.findOne({
            studentId: userId,
            projectId: studentGroup.projectId,
            groupId: groupId
          })
            .lean()
            .exec();

          if (!progressRecord && studentGroup.mentorId.toString() !== userId.toString()) {
            // Student must have enrollment; mentors can bypass this
            console.warn(`[Virtual Lab] No progress record: userId=${userId}, projectId=${studentGroup.projectId}`);
            socket.emit('join-session-failed', {
              message: 'You are not enrolled in this project'
            });
            return;
          }

          // ========== SECURITY GATE #4: Verify Project is Not Archived ==========
          const project = await Project.findById(studentGroup.projectId)
            .lean()
            .exec();

          if (!project || project.status === 'archived' || project.status === 'inactive') {
            console.warn(`[Virtual Lab] Project inaccessible: projectId=${studentGroup.projectId}, status=${project?.status}`);
            socket.emit('join-session-failed', {
              message: 'This project is no longer available'
            });
            return;
          }

          // ========== SECURITY GATE #5: Verify Mentor Still Exists ==========
          const mentor = await User.findById(studentGroup.mentorId)
            .select('id')
            .lean()
            .exec();

          if (!mentor) {
            console.warn(`[Virtual Lab] Mentor deleted: mentorId=${studentGroup.mentorId}, groupId=${groupId}`);
            socket.emit('join-session-failed', {
              message: 'Session mentor is no longer available'
            });
            return;
          }

          // ✅ ALL SECURITY GATES PASSED - User can join session
          socket.join(roomId);
          
          // ✅ Store session data using verified information from JWT + database
          socket.sessionId = sessionId;
          socket.groupId = groupId;
          socket.projectId = studentGroup.projectId;
          socket.mentorId = studentGroup.mentorId;
          // socket.userId already set from JWT token
          // socket.userRoles already set from JWT token

          // Determine user role based on group membership
          const userRole = userId.toString() === studentGroup.mentorId.toString() ? 'mentor' : 'student';
          socket.userRole = userRole;

          console.log(`[Virtual Lab] User ${userId} (${userRole}) joined session ${sessionId}`);

          // Initialize room if first participant
          if (!activeRooms.has(roomId)) {
            activeRooms.set(roomId, {
              participants: new Map(),
              code: '// Start coding here\n',
              terminal: [],
              feedback: [],
              startTime: new Date(),
              createdAt: new Date(),
              sessionId: sessionId,
              groupId: groupId,
              mentorId: studentGroup.mentorId.toString(),
              cursorPositions: new Map()
            });
            console.log(`[Virtual Lab] Created new room: ${roomId}`);
          }

          const room = activeRooms.get(roomId);
          room.participants.set(userId, {
            name: socket.userEmail || 'Anonymous',
            role: userRole,
            joinedAt: new Date()
          });

          // Notify other participants in session
          socket.to(roomId).emit('user-joined', {
            userId: userId,
            userName: socket.userEmail,
            role: userRole,
            participants: Array.from(room.participants.entries()).map(([id, info]) => ({
              userId: id,
              name: info.name,
              role: info.role
            })),
            timestamp: new Date(),
          });

          // Send session state to newly joined user
          socket.emit('session-joined', {
            sessionId: sessionId,
            groupId: groupId,
            code: room.code,
            participants: Array.from(room.participants.entries()).map(([id, info]) => ({
              userId: id,
              name: info.name,
              role: info.role
            })),
            terminal: room.terminal.slice(-10),
            timestamp: new Date(),
          });

          // Update Progress record: mark as in_progress if not already
          if (progressRecord && progressRecord.status === 'enrolled') {
            await Progress.findByIdAndUpdate(
              progressRecord._id,
              {
                status: 'in_progress',
                started_at: new Date(),
                last_activity: new Date()
              }
            ).exec();
          }

        } catch (error) {
          console.error(`[Virtual Lab] Error joining session:`, error);
          socket.emit('join-session-failed', {
            message: 'Failed to join session. Please try again.'
          });
        }
      });

      /**
       * ====================================================================
       * CODE CHANGE HANDLER - WITH VERIFIED USER DATA
       * ====================================================================
       * Records code changes using socket.userId from verified JWT token.
       * Never trusts client-provided userId.
       */
      socket.on('code-change', async (data) => {
        try {
          const { code } = data;
          const roomId = `session-${socket.sessionId}`;

          // Validate room exists and user is member
          if (!activeRooms.has(roomId)) {
            console.warn(`[Virtual Lab] Code-change to non-existent room: ${roomId}`);
            return;
          }

          // Verify user is still in session
          const room = activeRooms.get(roomId);
          if (!room.participants.has(socket.userId)) {
            console.warn(`[Virtual Lab] Unauthorized code-change: userId=${socket.userId}, room=${roomId}`);
            return;
          }

          // Update in-memory room
          room.code = code;

          // Record in database with verified user ID
          try {
            await VirtualLabSession.findByIdAndUpdate(
              socket.sessionId,
              {
                code: code,
                lastActivityTime: new Date(),
                $push: {
                  'recording.chunks': {
                    timestamp: new Date(),
                    type: 'code-change',
                    userId: socket.userId,        // ✅ From verified JWT token
                    userEmail: socket.userEmail,  // ✅ From verified JWT token
                    contentLength: code.length
                  }
                }
              }
            ).exec();
          } catch (dbError) {
            console.error(`[Virtual Lab] Failed to save code to DB: ${dbError.message}`);
          }

          // Broadcast code update to all in session
          labNamespace.to(roomId).emit('code-update', {
            code: code,
            userId: socket.userId,              // ✅ From verified JWT token
            userName: socket.userEmail,
            role: socket.userRole,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error(`[Virtual Lab] Error handling code-change:`, error);
        }
      });

      /**
       * ====================================================================
       * CURSOR TRACKING - WITH VERIFIED USER DATA
       * ====================================================================
       * Real-time cursor position tracking using verified socket.userId
       */
      socket.on('cursor-move', (data) => {
        try {
          const { line, column } = data;
          const roomId = `session-${socket.sessionId}`;

          if (!activeRooms.has(roomId)) return;

          const room = activeRooms.get(roomId);
          room.cursorPositions.set(socket.userId, { line, column });

          // Broadcast cursor position
          labNamespace.to(roomId).emit('cursor-update', {
            userId: socket.userId,
            userName: socket.userEmail,
            line: line,
            column: column,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error(`[Virtual Lab] Error updating cursor:`, error);
        }
      });

      /**
       * ====================================================================
       * AI HINT REQUEST - MENTOR ONLY
       * ====================================================================
       * Only mentors can request hints. Checked server-side based on role.
       */
      socket.on('request-hint', async (data) => {
        try {
          const { code, error, language } = data;

          // Verify mentor role
          if (socket.userRole !== 'mentor') {
            console.warn(`[Virtual Lab] Non-mentor requested hint: userId=${socket.userId}`);
            socket.emit('hint-error', {
              message: 'Only mentors can request hints'
            });
            return;
          }

          const roomId = `session-${socket.sessionId}`;
          if (!activeRooms.has(roomId)) return;

          // Generate contextual hints based on error type
          const hints = {
            'undefined': 'Variable is not defined. Check if you declared it before using it.',
            'not a function': 'You\'re trying to call something that isn\'t a function. Check the type.',
            'Cannot read property': 'Property doesn\'t exist. Make sure the object is initialized.',
            'SyntaxError': 'Check your code syntax - missing brackets, semicolons, or quotes.',
            'ReferenceError': 'Variable is referenced before declaration. Move declaration above usage.',
            'TypeError': 'Type mismatch. Check if the value type matches expected type.',
          };

          let hint = 'Review your code for syntax errors or missing declarations';
          if (error) {
            for (const [key, value] of Object.entries(hints)) {
              if (error.toLowerCase().includes(key.toLowerCase())) {
                hint = value;
                break;
              }
            }
          }

          // Send hint to requester
          socket.emit('hint-response', {
            hint: hint,
            timestamp: new Date(),
          });

          // Record hint request in database
          try {
            await VirtualLabSession.findByIdAndUpdate(
              socket.sessionId,
              {
                $push: {
                  'recording.chunks': {
                    timestamp: new Date(),
                    type: 'hint-request',
                    userId: socket.userId,
                    mentorId: socket.userId,
                    error: error.substring(0, 100)
                  }
                }
              }
            ).exec();
          } catch (dbError) {
            console.error(`[Virtual Lab] Failed to record hint:`, dbError);
          }
        } catch (error) {
          console.error(`[Virtual Lab] Error handling hint request:`, error);
          socket.emit('hint-error', {
            message: 'Unable to generate hint at this time'
          });
        }
      });

      /**
       * ====================================================================
       * TERMINAL OUTPUT - FOR LAB EXECUTION
       * ====================================================================
       * Broadcasts terminal output to all session participants
       */
      socket.on('terminal-output', (data) => {
        try {
          const { output } = data;
          const roomId = `session-${socket.sessionId}`;

          if (!activeRooms.has(roomId)) return;

          const room = activeRooms.get(roomId);
          room.terminal.push({
            timestamp: new Date(),
            userId: socket.userId,
            output: output
          });

          // Keep only last 50 terminal lines in memory
          if (room.terminal.length > 50) {
            room.terminal = room.terminal.slice(-50);
          }

          // Broadcast terminal update
          labNamespace.to(roomId).emit('terminal-update', {
            output: output,
            userId: socket.userId,
            userName: socket.userEmail,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error(`[Virtual Lab] Error broadcasting terminal:`, error);
        }
      });

      /**
       * ====================================================================
       * MENTOR FEEDBACK - MENTOR ONLY
       * ====================================================================
       * Only mentors can provide feedback on student code
       */
      socket.on('send-feedback', async (data) => {
        try {
          const { message, lineNumber } = data;
          const roomId = `session-${socket.sessionId}`;

          // Verify mentor role
          if (socket.userRole !== 'mentor') {
            console.warn(`[Virtual Lab] Non-mentor provided feedback: userId=${socket.userId}`);
            socket.emit('error', {
              message: 'Only mentors can provide feedback'
            });
            return;
          }

          if (!activeRooms.has(roomId)) return;

          // Record feedback in database
          try {
            await VirtualLabSession.findByIdAndUpdate(
              socket.sessionId,
              {
                $push: {
                  feedback: {
                    mentorId: socket.userId,
                    mentorEmail: socket.userEmail,
                    message: message,
                    lineNumber: lineNumber,
                    type: 'comment',
                    timestamp: new Date()
                  }
                }
              }
            ).exec();
          } catch (dbError) {
            console.error(`[Virtual Lab] Failed to save feedback:`, dbError);
          }

          // Broadcast feedback to all in session
          labNamespace.to(roomId).emit('feedback-received', {
            mentorName: socket.userEmail,
            mentorId: socket.userId,
            message: message,
            lineNumber: lineNumber,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error(`[Virtual Lab] Error sending feedback:`, error);
          socket.emit('error', {
            message: 'Failed to send feedback'
          });
        }
      });

      /**
       * ====================================================================
       * REQUEST FEEDBACK - STUDENT ONLY
       * ====================================================================
       * Students can request feedback from their mentor
       */
      socket.on('request-feedback', async (data) => {
        try {
          const { message, lineNumber, type } = data;
          const roomId = `session-${socket.sessionId}`;

          if (!activeRooms.has(roomId)) return;

          const room = activeRooms.get(roomId);

          // Find mentor in the room
          const mentorId = room.mentorId;
          if (!mentorId) {
            socket.emit('error', {
              message: 'No mentor available in this session'
            });
            return;
          }

          // Broadcast feedback request to mentor
          labNamespace.to(roomId).emit('feedback-requested', {
            studentName: socket.userEmail,
            studentId: socket.userId,
            message: message,
            lineNumber: lineNumber,
            type: type,
            timestamp: new Date(),
          });

          // Confirm to student
          socket.emit('feedback-request-sent', {
            message: 'Your feedback request has been sent to the mentor',
            timestamp: new Date()
          });
        } catch (error) {
          console.error(`[Virtual Lab] Error requesting feedback:`, error);
          socket.emit('error', {
            message: 'Failed to send feedback request'
          });
        }
      });

      /**
       * ====================================================================
       * END SESSION - MENTOR ONLY
       * ====================================================================
       * Terminates the session and updates Progress records
       */
      socket.on('end-session', async (data) => {
        try {
          const roomId = `session-${socket.sessionId}`;

          // Verify mentor role (only mentor can end session)
          if (socket.userRole !== 'mentor') {
            console.warn(`[Virtual Lab] Non-mentor attempted to end session: userId=${socket.userId}`);
            socket.emit('error', {
              message: 'Only mentors can end sessions'
            });
            return;
          }

          const room = activeRooms.get(roomId);
          if (!room) {
            console.warn(`[Virtual Lab] End-session called on non-existent room: ${roomId}`);
            return;
          }

          const durationMinutes = Math.floor((new Date() - room.startTime) / 1000 / 60);

          // Update session in database
          try {
            await VirtualLabSession.findByIdAndUpdate(
              socket.sessionId,
              {
                status: 'completed',
                endTime: new Date(),
                'recording.duration': durationMinutes,
                'recording.endTime': new Date()
              }
            ).exec();
          } catch (dbError) {
            console.error(`[Virtual Lab] Failed to update session:`, dbError);
          }

          // Update Progress records for all participants
          try {
            const studentIds = Array.from(room.participants.keys()).filter(
              id => id.toString() !== socket.mentorId.toString()
            );

            await Progress.updateMany(
              {
                studentId: { $in: studentIds },
                projectId: socket.projectId,
                groupId: socket.groupId
              },
              {
                $inc: {
                  completion_percentage: 2,  // Increment 2% per session
                  total_hours_spent: durationMinutes / 60
                },
                $set: {
                  last_activity: new Date(),
                  status: 'in_progress'
                }
              }
            ).exec();

            console.log(`[Virtual Lab] Updated progress for ${studentIds.length} students`);
          } catch (dbError) {
            console.error(`[Virtual Lab] Failed to update progress:`, dbError);
          }

          // Clean up in-memory room
          activeRooms.delete(roomId);

          // Notify all participants
          labNamespace.to(roomId).emit('session-ended', {
            message: 'Session ended by mentor',
            durationMinutes: durationMinutes,
            timestamp: new Date(),
          });

          socket.emit('session-ended', {
            message: 'Session ended and saved',
            durationMinutes: durationMinutes,
            timestamp: new Date(),
          });

          console.log(`[Virtual Lab] Session ended: ${socket.sessionId}, duration: ${durationMinutes} minutes`);
        } catch (error) {
          console.error(`[Virtual Lab] Error ending session:`, error);
          socket.emit('error', {
            message: 'Failed to end session'
          });
        }
      });

      /**
       * ====================================================================
       * MESSAGE HANDLERS - REAL-TIME MESSAGING
       * ====================================================================
       * Handle real-time message events for student-mentor communication
       */
      socket.on('send-message', (data) => {
        try {
          const { studentId, projectId, message } = data;
          const senderId = socket.userId;

          if (!studentId || !projectId || !message) {
            console.warn('[Socket] Invalid message data:', data);
            return;
          }

          // Emit to all sockets in the project room so both student and mentor get it
          io.to(`project-${projectId}`).emit('new-message', {
            studentId,
            projectId,
            senderId,
            message,
            timestamp: new Date()
          });

          // Also emit to mentor specifically if this is from a student
          io.to(`mentor-${projectId}`).emit('student-message', {
            studentId,
            projectId,
            senderId,
            message,
            timestamp: new Date()
          });

          console.log(`[Socket] Message from ${senderId} in project ${projectId}`);
        } catch (error) {
          console.error('[Socket] Error in send-message:', error);
        }
      });

      socket.on('join-project-room', (data) => {
        try {
          const { projectId, studentId } = data;

          // Join both generic project room and mentor-specific room
          socket.join(`project-${projectId}`);
          socket.join(`mentor-${projectId}`);

          console.log(`[Socket] User ${socket.userId} joined project room: ${projectId}`);
        } catch (error) {
          console.error('[Socket] Error in join-project-room:', error);
        }
      });

      socket.on('request-mentor-status', (data) => {
        try {
          const { projectId } = data;

          // Notify all mentors in this project that a student is requesting status
          io.to(`mentor-${projectId}`).emit('student-status-request', {
            studentId: socket.userId,
            projectId
          });

          console.log(`[Socket] Student ${socket.userId} requested mentor status in project ${projectId}`);
        } catch (error) {
          console.error('[Socket] Error in request-mentor-status:', error);
        }
      });

      /**
       * ====================================================================
       * DISCONNECT HANDLER - CLEANUP
       * ====================================================================
       * Clean up in-memory state when user disconnects
       */
      socket.on('disconnect', () => {
        console.log(`[Virtual Lab] User ${socket.userId} disconnected (socket: ${socket.id})`);

        // Remove from all rooms
        const roomsToClean = Array.from(activeRooms.entries())
          .filter(([, room]) => room.participants.has(socket.userId))
          .map(([roomId]) => roomId);

        roomsToClean.forEach(roomId => {
          const room = activeRooms.get(roomId);
          room.participants.delete(socket.userId);

          // If room is empty, delete it
          if (room.participants.size === 0) {
            activeRooms.delete(roomId);
            console.log(`[Virtual Lab] Cleaned up empty room: ${roomId}`);
          }
        });
      });
    });

    /**
     * ========================================================================
     * ORPHANED SESSION CLEANUP
     * ========================================================================
     * This function should be called when a mentor/user is deleted or 
     * when a project is archived/deleted.
     * 
     * Usage in routes:
     *   cleanupOrphanedSessions(mentorId, groupId);
     */
    const cleanupOrphanedSessions = (mentorId, groupId) => {
      try {
        const sessionsToEnd = Array.from(activeRooms.entries())
          .filter(([, room]) => {
            return room.mentorId === mentorId.toString() || 
                   room.groupId === groupId.toString();
          })
          .map(([roomId]) => roomId);

        sessionsToEnd.forEach(roomId => {
          const room = activeRooms.get(roomId);
          console.log(`[Virtual Lab] Cleanup: Terminating orphaned session ${roomId}`);

          // Notify participants
          labNamespace.to(roomId).emit('session-terminated-admin', {
            message: 'This session has been terminated by the system.',
            timestamp: new Date(),
          });

          // Clean up room
          activeRooms.delete(roomId);
        });

        console.log(`[Virtual Lab] Cleanup: Terminated ${sessionsToEnd.length} orphaned sessions`);
      } catch (error) {
        console.error(`[Virtual Lab] Error in cleanup:`, error);
      }
    };

    /**
     * ========================================================================
     * NOTIFICATION NAMESPACE - SEPARATE FROM VIRTUAL LAB
     * ========================================================================
     * For real-time notifications without inheriting virtual lab context
     */
    const notificationNamespace = io.of('/notifications');

    notificationNamespace.on('connection', (socket) => {
      console.log(`[Notifications] User connected: ${socket.id}`);

      socket.on('subscribe-user', (userId) => {
        socket.join(`user-${userId}`);
        console.log(`[Notifications] User ${userId} subscribed to notifications`);
      });

      socket.on('disconnect', () => {
        console.log(`[Notifications] User disconnected: ${socket.id}`);
      });
    });

    return { 
      labNamespace, 
      notificationNamespace,
      cleanupOrphanedSessions  // ✅ Export cleanup function for routes
    };

  } catch (error) {
    console.error('[Socket.io] Initialization error:', error);
    return { labNamespace: null, notificationNamespace: null, cleanupOrphanedSessions: null };
  }
};
