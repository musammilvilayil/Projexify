const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const Notification = require('../models/Notification');
const Progress = require('../models/Progress');
const { verifyToken, checkRole } = require('../middleware/auth');

// POST /api/sessions/create-instant - Create instant session (no scheduling)
router.post('/create-instant', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    let { studentIds, title, description, recordingEnabled } = req.body;
    
    console.log('[create-instant] Request body:', { studentIds, title, description, recordingEnabled });
    console.log('[create-instant] User:', req.user);
    
    // Validate required fields
    if (!studentIds || studentIds.length === 0) {
      return res.status(400).json({ message: 'At least one student is required' });
    }
    
    if (!title) {
      return res.status(400).json({ message: 'Session title is required' });
    }

    // Get projectId from first student's progress
    const mentorId = req.user.id || req.user._id;
    console.log('[create-instant] Looking for progress with studentId:', studentIds[0], 'mentorId:', mentorId);
    
    const studentProgress = await Progress.findOne({ 
      studentId: studentIds[0],
      assignedMentorId: mentorId 
    }).select('projectId');
    
    console.log('[create-instant] Found progress:', studentProgress);
    
    if (!studentProgress) {
      return res.status(400).json({ message: 'No assigned project found for selected student' });
    }

    const now = new Date();
    const sessionData = {
      projectId: studentProgress.projectId,
      mentorId: mentorId,
      studentIds: studentIds,
      title: title,
      description: description || '',
      scheduledDate: now,
      startTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), // 2 hour default
      duration: 120,
      status: 'active',
      isInstant: true,
      recordingEnabled: recordingEnabled || false,
      recordingPath: null,
      startedAt: now
    };
    
    console.log('[create-instant] Creating session with data:', sessionData);
    
    const session = new Session(sessionData);
    await session.save();

    console.log('[create-instant] Session created:', session._id);

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

    // Get the project mentor
    const Project = require('../models/Project');
    const project = await Project.findById(projectId).select('mentor_id');
    
    if (!project || !project.mentor_id) {
      return res.json({ isOnline: false, message: 'No mentor assigned to this project' });
    }

    const mentorId = project.mentor_id;
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes

    // Find active sessions for this student with this mentor
    const activeSessions = await Session.find({
      projectId,
      mentorId,
      studentIds: userId,
      scheduledDate: {
        $gte: new Date(now.setHours(0, 0, 0, 0)),
        $lt: new Date(now.setHours(23, 59, 59, 999))
      },
      status: { $in: ['scheduled', 'in_progress'] }
    });

    // Check if current time is within any session window
    let isOnline = false;
    let currentSession = null;

    for (const session of activeSessions) {
      const [startHour, startMin] = session.startTime.split(':').map(Number);
      const [endHour, endMin] = session.endTime.split(':').map(Number);
      const sessionStart = startHour * 60 + startMin;
      const sessionEnd = endHour * 60 + endMin;

      if (currentTime >= sessionStart && currentTime <= sessionEnd) {
        isOnline = true;
        currentSession = {
          id: session._id,
          title: session.title,
          startTime: session.startTime,
          endTime: session.endTime
        };
        break;
      }
    }

    res.json({
      isOnline,
      mentorId,
      currentSession,
      nextSessions: activeSessions.filter(s => {
        const [startHour, startMin] = s.startTime.split(':').map(Number);
        const sessionStart = startHour * 60 + startMin;
        return sessionStart > currentTime;
      }).map(s => ({
        id: s._id,
        title: s.title,
        startTime: s.startTime,
        endTime: s.endTime,
        scheduledDate: s.scheduledDate
      }))
    });

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
