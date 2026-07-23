const express = require('express');
const router = express.Router();
const MeetingSchedule = require('../models/MeetingSchedule');
const MeetingSession = require('../models/MeetingSession');
const Project = require('../models/Project');
const { verifyToken, checkRole } = require('../middleware/auth');

/**
 * POST /api/meetings/schedule
 * Mentor creates a meeting schedule
 */
router.post('/schedule', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { projectId, dayOfWeek, startTime, endTime, timezone } = req.body;
    const mentorId = req.user.id;

    // Verify mentor is assigned to this project
    const project = await Project.findOne({ _id: projectId, mentor_id: mentorId });
    if (!project) {
      return res.status(403).json({ message: 'Not assigned to this project' });
    }

    // Validate time format (HH:MM)
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return res.status(400).json({ message: 'Invalid time format. Use HH:MM' });
    }

    const schedule = new MeetingSchedule({
      projectId,
      mentorId,
      dayOfWeek,
      startTime,
      endTime,
      timezone,
    });

    await schedule.save();

    res.status(201).json({
      message: 'Schedule created',
      schedule,
    });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ message: 'Error creating schedule' });
  }
});

/**
 * GET /api/meetings/schedule/:projectId
 * Get meeting schedule for project
 */
router.get('/schedule/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const schedule = await MeetingSchedule.findOne({
      projectId,
      status: 'active',
    })
      .populate('mentorId', 'firstName lastName email')
      .select('dayOfWeek startTime endTime timezone status');

    if (!schedule) {
      return res.json({ schedule: null, message: 'No schedule found' });
    }

    // Check if mentor is currently online
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const isMentorOnline =
      currentDay === schedule.dayOfWeek && currentTime >= schedule.startTime && currentTime < schedule.endTime;

    res.json({
      schedule: schedule.toObject(),
      isMentorOnline,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ message: 'Error fetching schedule' });
  }
});

/**
 * GET /api/meetings/status/:projectId
 * Check if mentor is currently in session
 */
router.get('/status/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check if there's an active meeting session
    const activeSession = await MeetingSession.findOne({
      projectId,
      status: 'active',
    })
      .populate('mentorId', 'firstName lastName email')
      .select('mentorId startedAt isRecording');

    const schedule = await MeetingSchedule.findOne({
      projectId,
      status: 'active',
    }).select('dayOfWeek startTime endTime');

    // Check if mentor is online right now
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let isMentorOnline = false;
    if (schedule) {
      isMentorOnline =
        currentDay === schedule.dayOfWeek && currentTime >= schedule.startTime && currentTime < schedule.endTime;
    }

    res.json({
      isSessionActive: !!activeSession,
      isMentorOnline,
      session: activeSession
        ? {
            mentorId: activeSession.mentorId._id,
            mentorName: `${activeSession.mentorId.firstName} ${activeSession.mentorId.lastName}`,
            startedAt: activeSession.startedAt,
            isRecording: activeSession.isRecording,
          }
        : null,
      schedule: schedule
        ? {
            dayOfWeek: schedule.dayOfWeek,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
          }
        : null,
    });
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ message: 'Error checking status' });
  }
});

/**
 * POST /api/meetings/start/:projectId
 * Mentor starts a meeting session
 */
router.post('/start/:projectId', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const mentorId = req.user.id;
    const { roomId } = req.body;

    // Verify mentor is assigned to project
    const project = await Project.findOne({ _id: projectId, mentor_id: mentorId });
    if (!project) {
      return res.status(403).json({ message: 'Not assigned to this project' });
    }

    // Check if session already exists
    const existingSession = await MeetingSession.findOne({
      projectId,
      status: 'active',
    });

    if (existingSession) {
      return res.json({ message: 'Session already active', session: existingSession });
    }

    // Create new session
    const session = new MeetingSession({
      projectId,
      mentorId,
      roomId: roomId || `room-${projectId}-${Date.now()}`,
      status: 'active',
    });

    await session.save();

    res.status(201).json({
      message: 'Session started',
      session: {
        id: session._id,
        roomId: session.roomId,
        startedAt: session.startedAt,
      },
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ message: 'Error starting session' });
  }
});

/**
 * PUT /api/meetings/end/:sessionId
 * Mentor ends a meeting session
 */
router.put('/end/:sessionId', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const mentorId = req.user.id;

    const session = await MeetingSession.findOne({
      _id: sessionId,
      mentorId,
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    session.endedAt = new Date();
    session.status = 'ended';
    session.duration = Math.floor((session.endedAt - session.startedAt) / 1000); // in seconds

    await session.save();

    res.json({
      message: 'Session ended',
      session: {
        id: session._id,
        duration: session.duration,
        endedAt: session.endedAt,
      },
    });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ message: 'Error ending session' });
  }
});

/**
 * PUT /api/meetings/:sessionId/record
 * Toggle recording for session
 */
router.put('/:sessionId/record', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { isRecording, recordingUrl } = req.body;
    const mentorId = req.user.id;

    const session = await MeetingSession.findOne({
      _id: sessionId,
      mentorId,
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    session.isRecording = isRecording;
    if (recordingUrl && !isRecording) {
      session.recordingUrl = recordingUrl;
    }

    await session.save();

    res.json({
      message: 'Recording status updated',
      isRecording: session.isRecording,
    });
  } catch (error) {
    console.error('Error updating recording:', error);
    res.status(500).json({ message: 'Error updating recording' });
  }
});

/**
 * GET /api/meetings/mentor/schedules
 * Get all schedules for current mentor
 */
router.get('/mentor/schedules', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const mentorId = req.user.id;

    const schedules = await MeetingSchedule.find({
      mentorId,
      status: 'active',
    })
      .populate('projectId', 'title')
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.json({ schedules });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ message: 'Error fetching schedules' });
  }
});

/**
 * GET /api/meetings/status/:projectId
 * Check if mentor is currently in an active meeting for this project
 */
router.get('/status/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    
    // Check for active meeting sessions
    const activeMeeting = await MeetingSession.findOne({
      projectId,
      status: 'in_progress',
      startedAt: { $gte: new Date(Date.now() - 4 * 60 * 60 * 1000) } // Within last 4 hours
    }).populate('mentorId', 'firstName lastName');

    res.json({
      isMentorOnline: !!activeMeeting,
      meeting: activeMeeting || null
    });
  } catch (error) {
    console.error('Error checking meeting status:', error);
    res.status(500).json({ message: 'Error checking meeting status' });
  }
});

module.exports = router;
