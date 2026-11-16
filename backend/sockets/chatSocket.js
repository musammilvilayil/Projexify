/**
 * Real-time chat + mentor presence on the DEFAULT namespace ("/"), which is what the
 * student workspace and mentor dashboard pages connect to via io({ auth: { token } }).
 *
 * Security model:
 *  - JWT is verified by socketioJWTAuth before this runs (socket.userId / userRoles come from the token).
 *  - A socket may only join a thread room after canAccessThread() says so (never trusts client ids).
 *  - Messages are persisted/pushed by POST /api/messages/send, so there is no client-to-client relay here.
 */
const { canAccessThread, threadRoom } = require('../services/chatAccess');

module.exports = (io, { Project, Center, Progress }) => {
  const mentorSockets = new Map(); // mentorId -> Set(socketId)

  const announceMentor = async (mentorId, online) => {
    try {
      const rows = await Progress.find({ assignedMentorId: mentorId }).select('studentId').lean();
      const students = new Set(rows.map((r) => String(r.studentId)));
      students.forEach((sid) => io.to(`user:${sid}`).emit(online ? 'mentor-online' : 'mentor-offline', { mentorId: String(mentorId) }));
    } catch (error) {
      console.error('[Chat] Failed to announce mentor presence:', error.message);
    }
  };

  io.on('connection', (socket) => {
    const userId = String(socket.userId);
    const roles = socket.userRoles || [];
    socket.join(`user:${userId}`);

    if (roles.includes('mentor')) {
      if (!mentorSockets.has(userId)) mentorSockets.set(userId, new Set());
      const set = mentorSockets.get(userId);
      set.add(socket.id);
      if (set.size === 1) announceMentor(userId, true);
    }

    socket.on('join-project-room', async (data = {}) => {
      try {
        const projectId = String(data.projectId || '');
        // Students can only ever open their own thread, whatever id the client sends
        const studentId = roles.includes('student') && !roles.includes('mentor') ? userId : String(data.studentId || userId);
        const access = await canAccessThread({ user: { id: userId, roles }, projectId, studentId }, { Project, Center, Progress });
        if (!access.allowed) {
          socket.emit('chat-error', { message: 'You do not have access to this conversation' });
          return;
        }
        socket.join(threadRoom(projectId, studentId));
        socket.emit('joined-project-room', { projectId, studentId });

        if (access.role === 'student') {
          const enrollment = await Progress.findOne({ projectId, studentId }).select('assignedMentorId');
          const mentorId = enrollment && enrollment.assignedMentorId ? String(enrollment.assignedMentorId) : null;
          if (mentorId) {
            io.to(`user:${mentorId}`).emit('student-joined', { studentId, projectId });
            socket.emit('mentor-status', { projectId, isOnline: mentorSockets.has(mentorId) && mentorSockets.get(mentorId).size > 0 });
          } else {
            socket.emit('mentor-status', { projectId, isOnline: false });
          }
        }
      } catch (error) {
        console.error('[Chat] join-project-room failed:', error.message);
        socket.emit('chat-error', { message: 'Could not open the conversation' });
      }
    });

    socket.on('request-mentor-status', async (data = {}) => {
      try {
        const projectId = String(data.projectId || '');
        const enrollment = await Progress.findOne({ projectId, studentId: userId }).select('assignedMentorId');
        const mentorId = enrollment && enrollment.assignedMentorId ? String(enrollment.assignedMentorId) : null;
        socket.emit('mentor-status', {
          projectId,
          isOnline: !!mentorId && mentorSockets.has(mentorId) && mentorSockets.get(mentorId).size > 0,
        });
      } catch (error) {
        socket.emit('mentor-status', { projectId: data.projectId, isOnline: false });
      }
    });

    socket.on('disconnect', () => {
      const set = mentorSockets.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          mentorSockets.delete(userId);
          announceMentor(userId, false);
        }
      }
    });
  });

  return { mentorSockets };
};
