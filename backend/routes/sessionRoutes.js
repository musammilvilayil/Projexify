const express = require('express');
const router = express.Router();
const { parseTimeToMinutes, toHHMM, isWithinWindow } = require('../utils/timeUtils');
const Session = require('../models/Session');
const Notification = require('../models/Notification');
const Progress = require('../models/Progress');
const { verifyToken, checkRole } = require('../middleware/auth');

// POST /api/sessions/create-instant - Create instant session (no scheduling)
router.post('/create-instant', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    let { studentIds, title, description, recordingEnabled } = req.body;
    
    
    // Validate required fields
    if (!studentIds || studentIds.length === 0) {
      return res.status(400).json({ message: 'At least one student is required' });
    }
    
    if (!title) {
      return res.status(400).json({ message: 'Session title is required' });
    }

    if (!Array.isArray(studentIds)) {
      return res.status(400).json({ message: 'studentIds must be a list' });
    }
    studentIds = [...new Set(studentIds.map(String))];
    if (studentIds.some((id) => !/^[a-f0-9]{24}$/i.test(id))) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    // Every selected student must be assigned to this mentor (not just the first one)
    const mentorId = req.user.id || req.user._id;
    const assignedProgress = await Progress.find({
      studentId: { $in: studentIds },
      assignedMentorId: mentorId
    }).select('studentId projectId');

    const assignedIds = new Set(assignedProgress.map((p) => String(p.studentId)));
    const notAssigned = studentIds.filter((id) => !assignedIds.has(id));
    if (assignedProgress.length === 0 || notAssigned.length > 0) {
      return res.status(403).json({ message: 'Some selected students are not assigned to you' });
    }
    const studentProgress = assignedProgress.find((p) => String(p.studentId) === studentIds[0]);
    if (new Set(assignedProgress.map((p) => String(p.projectId))).size > 1) {
      return res.status(400).json({ message: 'Selected students belong to different projects. Start one session per project.' });
    }

    const now = new Date();
    const sessionData = {
      projectId: studentProgress.projectId,
      mentorId: mentorId,
      studentIds: studentIds,
      title: title,
      description: description || '',
      scheduledDate: now,
      startTime: toHHMM(now),
      endTime: toHHMM(new Date(now.getTime() + 2 * 60 * 60 * 1000)), // 2 hour default (24h "HH:MM")
      duration: 120,
      status: 'active',
      isInstant: true,
      recordingEnabled: recordingEnabled || false,
      recordingPath: null,
      startedAt: now
    };
    
    
    const session = new Session(sessionData);
    await session.save();


    // Create notifications for all students
    const notifications = studentIds.map(studentId => ({
      userId: studentId,
      type: 'session_started',
      title: 'Session Started',
      message: `Your mentor has started a session: "${title}"`,
      relatedId: session._id,
      relatedModel: 'Session',
      actionUrl: `/pages/virtual-lab-v3.html?sessionId=${session._id}`,
      read: false,
      createdAt: now
    }));

    await Notification.insertMany(notifications);

    res.status(201).json({ 
      message: 'Instant session created successfully', 
      session,
      sessionId: session._id
    });
  } catch (error) {
    console.error('[create-instant] Error:', error);
    res.status(500).json({ message: 'Error creating instant session', error: error.message });
  }
});

// PUT /api/sessions/:id/start-recording - Start recording a session
router.put('/:id/start-recording', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.mentorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    session.recordingEnabled = true;
    session.recordingStartedAt = new Date();
    session.recordingPath = `/recordings/${req.params.id}_${Date.now()}.webm`;
    await session.save();

    res.json({ message: 'Recording started', session });
  } catch (error) {
    console.error('Error starting recording:', error);
    res.status(500).json({ message: 'Error starting recording' });
  }
});

// PUT /api/sessions/:id/stop-recording - Stop recording a session
router.put('/:id/stop-recording', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.mentorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    session.recordingEnabled = false;
    session.recordingEndedAt = new Date();
    await session.save();

    res.json({ message: 'Recording stopped', session });
  } catch (error) {
    console.error('Error stopping recording:', error);
    res.status(500).json({ message: 'Error stopping recording' });
  }
});

// POST /api/sessions/:id/end - End an active session
router.post('/:id/end', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.mentorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    session.status = 'completed';
    session.endedAt = new Date();
    if (session.recordingEnabled) {
      session.recordingEnabled = false;
    }
    await session.save();

    // Notify students that session has ended
    if (session.studentIds && session.studentIds.length > 0) {
      const notifications = session.studentIds.map(studentId => ({
        userId: studentId,
        type: 'session_ended',
        title: 'Session Ended',
        message: `The session "${session.title}" has been completed by your mentor`,
        relatedId: session._id,
        relatedModel: 'Session',
        read: false,
        createdAt: new Date()
      }));

      await Notification.insertMany(notifications);
    }

    res.json({ message: 'Session ended successfully', session });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ message: 'Error ending session' });
  }
});

// POST /api/sessions/notify-students - Notify students about session
router.post('/notify-students', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { studentIds, sessionId, title, message } = req.body;
    
    if (!studentIds || !sessionId || !title || !message) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const notifications = studentIds.map(studentId => ({
      userId: studentId,
      type: 'session_notification',
      title,
      message,
      relatedId: sessionId,
      relatedModel: 'Session',
      actionUrl: `/pages/virtual-lab-v3.html?sessionId=${sessionId}`,
      read: false,
      createdAt: new Date()
    }));

    await Notification.insertMany(notifications);
    res.json({ message: 'Students notified', notificationCount: notifications.length });
  } catch (error) {
    console.error('Error notifying students:', error);
    res.status(500).json({ message: 'Error notifying students' });
  }
});

// POST /api/sessions - Create a session (Mentor only)
router.post('/', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    let { projectId, studentIds, groupId, title, description, scheduledDate, startTime, endTime, duration, agenda } = req.body;
    
    // If projectId is not provided, try to find it from the first student's progress
    if (!projectId && studentIds && studentIds.length > 0) {
      const studentProgress = await Progress.findOne({ 
        studentId: studentIds[0],
        assignedMentorId: req.user.id 
      }).select('projectId');
      
      if (studentProgress) {
        projectId = studentProgress.projectId;
      }
    }
    
    // Validate required fields
    if (!projectId) {
      return res.status(400).json({ message: 'Project ID is required or could not be determined from students' });
    }
    
    if (!title || !scheduledDate || !startTime || !endTime || !duration) {
      return res.status(400).json({ message: 'Missing required fields: title, scheduledDate, startTime, endTime, duration' });
    }
    
    const session = new Session({
      projectId,
      mentorId: req.user.id,
      studentIds,
      groupId,
      title,
      description,
      scheduledDate,
      startTime,
      endTime,
      duration,
      agenda,
      status: 'scheduled',
    });

    await session.save();

    // Create notifications for all students
    if (studentIds && studentIds.length > 0) {
      const notifications = studentIds.map(studentId => ({
        userId: studentId,
        type: 'session_scheduled',
        title: 'New Session Scheduled',
        message: `Your mentor has scheduled a session: "${title}" on ${new Date(scheduledDate).toLocaleDateString()} at ${startTime}`,
        relatedId: session._id,
        relatedModel: 'Session',
        actionUrl: `/pages/virtual-lab-v3.html?sessionId=${session._id}`,
      }));

      await Notification.insertMany(notifications);
    }

    res.status(201).json({ message: 'Session created successfully', session });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ message: 'Error creating session' });
  }
});

// GET /api/sessions/my-sessions - Get sessions for current user
router.get('/my-sessions', verifyToken, async (req, res) => {
  try {
    const user = req.user;
    let query = {};

    if (user.roles.includes('mentor')) {
      query.mentorId = user.id;
    } else if (user.roles.includes('student')) {
      query.studentIds = user.id;
    }

    const sessions = await Session.find(query)
      .populate('projectId', 'title')
      .populate('mentorId', 'firstName lastName')
      .populate('studentIds', 'firstName lastName')
      .sort({ scheduledDate: -1 });

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ message: 'Error fetching sessions' });
  }
});

// GET /api/sessions/:id - Get session details
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id)
      .populate('projectId')
      .populate('mentorId', 'firstName lastName email avatar_url')
      .populate('studentIds', 'firstName lastName email avatar_url');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Only the mentor, the invited students, the owning center admin and admins may read a session
    const uid = String(req.user.id);
    const roles = req.user.roles || [];
    const idOf = (v) => String((v && v._id) || v);
    const isMentor = idOf(session.mentorId) === uid;
    const isStudent = (session.studentIds || []).some((s) => idOf(s) === uid);
    let allowed = isMentor || isStudent || roles.includes('admin');
    if (!allowed && roles.includes('center_admin')) {
      const Center = require('../models/Center');
      const centerId = session.projectId && session.projectId.centerId;
      const center = centerId ? await Center.findById(centerId).select('admin_id') : null;
      allowed = !!center && String(center.admin_id) === uid;
    }
    if (!allowed) {
      return res.status(403).json({ message: 'Not authorized to view this session' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ message: 'Error fetching session' });
  }
});

// GET /api/sessions/:id/is-active - Check if session is currently active
router.get('/:id/is-active', verifyToken, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const isActive = session.isActive();
    res.json({ isActive, session });
  } catch (error) {
    console.error('Error checking session:', error);
    res.status(500).json({ message: 'Error checking session' });
  }
});

// PUT /api/sessions/:id - Update session
router.put('/:id', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.mentorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const updates = req.body;
    Object.assign(session, updates);
    await session.save();

    res.json({ message: 'Session updated successfully', session });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ message: 'Error updating session' });
  }
});

// DELETE /api/sessions/:id - Cancel session
router.delete('/:id', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.mentorId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    session.status = 'cancelled';
    await session.save();

    // Notify students
    if (session.studentIds && session.studentIds.length > 0) {
      const notifications = session.studentIds.map(studentId => ({
        userId: studentId,
        type: 'session_scheduled',
        title: 'Session Cancelled',
        message: `The session "${session.title}" scheduled for ${new Date(session.scheduledDate).toLocaleDateString()} has been cancelled`,
        relatedId: session._id,
        relatedModel: 'Session',
      }));

      await Notification.insertMany(notifications);
    }

    res.json({ message: 'Session cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling session:', error);
    res.status(500).json({ message: 'Error cancelling session' });
  }
});

// GET /api/sessions/mentor-status/:projectId - Check if mentor is available for a project
router.get('/mentor-status/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    if (!/^[a-f0-9]{24}$/i.test(String(projectId))) {
      return res.status(400).json({ message: 'Invalid project id' });
    }

    // The student's own assigned mentor wins; fall back to the project's mentor
    const Project = require('../models/Project');
    const [project, enrollment] = await Promise.all([
      Project.findById(projectId).select('mentor_id'),
      Progress.findOne({ projectId, studentId: userId }).select('assignedMentorId')
    ]);
    const mentorId = (enrollment && enrollment.assignedMentorId) || (project && project.mentor_id);

    if (!mentorId) {
      return res.json({ isOnline: false, message: 'No mentor assigned to this project' });
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);

    // Instant sessions are "active" until the mentor ends them; scheduled ones use their time window
    const sessions = await Session.find({
      projectId,
      mentorId,
      studentIds: userId,
      $or: [
        { status: { $in: ['active', 'in_progress', 'in-progress'] } },
        { status: 'scheduled', scheduledDate: { $gte: dayStart, $lte: dayEnd } }
      ]
    });

    let currentSession = null;
    const upcoming = [];
    for (const session of sessions) {
      const start = parseTimeToMinutes(session.startTime);
      const end = parseTimeToMinutes(session.endTime);
      const running = session.isInstant
        ? session.status === 'active'
        : (['in_progress', 'in-progress', 'active'].includes(session.status) || isWithinWindow(start, end, currentTime));

      if (running && !currentSession) {
        currentSession = { id: session._id, title: session.title, startTime: session.startTime, endTime: session.endTime };
      } else if (!running && start != null && start > currentTime) {
        upcoming.push({ id: session._id, title: session.title, startTime: session.startTime, endTime: session.endTime, scheduledDate: session.scheduledDate });
      }
    }

    res.json({ isOnline: !!currentSession, mentorId, currentSession, nextSessions: upcoming });
  } catch (error) {
    console.error('Error checking mentor status:', error);
    res.status(500).json({ message: 'Error checking mentor availability' });
  }
});

// GET /api/sessions/student/:studentId/project/:projectId - Get student's sessions for a project
router.get('/student/:studentId/project/:projectId', verifyToken, async (req, res) => {
  try {
    const { studentId, projectId } = req.params;

    const sessions = await Session.find({
      projectId,
      studentIds: studentId
    })
      .populate('mentorId', 'firstName lastName')
      .sort({ scheduledDate: -1, startTime: -1 });

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ message: 'Error fetching sessions' });
  }
});

module.exports = router;
