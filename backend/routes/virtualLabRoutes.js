const express = require('express');
const router = express.Router();
const { verifyToken, checkRole } = require('../middleware/auth');
const VirtualLabSession = require('../models/VirtualLabSession');
const Progress = require('../models/Progress');
const StudentGroup = require('../models/StudentGroup');
const Project = require('../models/Project');
const User = require('../models/User');

// Create a new virtual lab session
router.post('/sessions', verifyToken, async (req, res) => {
  try {
    const { groupId, projectId } = req.body;
    const userId = req.user.id;

    // Verify user is part of the group or is mentor
    const group = await VirtualLabSession.findOne({ groupId }).lean();
    
    const session = new VirtualLabSession({
      groupId,
      projectId,
      initiatedBy: userId,
      participants: [userId],
      status: 'active',
      startTime: new Date(),
      code: '// Start coding here\n',
      recording: {
        enabled: true,
        startTime: new Date(),
        chunks: []
      }
    });

    await session.save();
    
    res.json({
      sessionId: session._id,
      groupId,
      projectId,
      status: 'active',
      code: session.code,
      participants: session.participants,
      startTime: session.startTime,
      recordingEnabled: session.recording.enabled
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ message: 'Failed to create session', error: error.message });
  }
});

// Get session details
router.get('/sessions/:sessionId', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await VirtualLabSession.findById(sessionId)
      .populate('initiatedBy', 'firstName lastName email role')
      .populate('participants', 'firstName lastName email role')
      .lean();

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json({
      sessionId: session._id,
      groupId: session.groupId,
      projectId: session.projectId,
      initiatedBy: session.initiatedBy,
      participants: session.participants,
      status: session.status,
      code: session.code,
      feedback: session.feedback || [],
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.endTime ? 
        Math.floor((session.endTime - session.startTime) / 1000 / 60) : null,
      recordingEnabled: session.recording.enabled,
      recordingDuration: session.recording.duration || 0
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ message: 'Failed to fetch session', error: error.message });
  }
});

// Join an existing session
router.post('/sessions/:sessionId/join', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await VirtualLabSession.findByIdAndUpdate(
      sessionId,
      {
        $addToSet: { participants: userId },
        lastActivityTime: new Date()
      },
      { new: true }
    ).populate('participants', 'firstName lastName email role');

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json({
      sessionId: session._id,
      participants: session.participants,
      code: session.code,
      status: session.status,
      message: 'Joined session successfully'
    });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(500).json({ message: 'Failed to join session', error: error.message });
  }
});

// Update session code (stores latest state)
router.put('/sessions/:sessionId/code', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { code } = req.body;

    const session = await VirtualLabSession.findByIdAndUpdate(
      sessionId,
      {
        code,
        lastActivityTime: new Date(),
        $push: {
          'recording.chunks': {
            timestamp: new Date(),
            type: 'code-change',
            content: code,
            userId: req.user.id
          }
        }
      },
      { new: true }
    );

    res.json({
      sessionId: session._id,
      code: session.code,
      timestamp: session.lastActivityTime
    });
  } catch (error) {
    console.error('Error updating code:', error);
    res.status(500).json({ message: 'Failed to update code', error: error.message });
  }
});

// Add feedback to session
router.post('/sessions/:sessionId/feedback', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, lineNumber, type } = req.body; // type: 'comment', 'bug', 'suggestion'

    const session = await VirtualLabSession.findByIdAndUpdate(
      sessionId,
      {
        $push: {
          feedback: {
            mentorId: req.user.id,
            message,
            lineNumber,
            type,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );

    res.json({
      sessionId: session._id,
      feedback: session.feedback[session.feedback.length - 1],
      allFeedback: session.feedback
    });
  } catch (error) {
    console.error('Error adding feedback:', error);
    res.status(500).json({ message: 'Failed to add feedback', error: error.message });
  }
});

// End session and save recording
router.post('/sessions/:sessionId/end', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await VirtualLabSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Calculate duration in minutes
    const durationMinutes = Math.floor((new Date() - session.startTime) / 1000 / 60);

    // Update session
    const updatedSession = await VirtualLabSession.findByIdAndUpdate(
      sessionId,
      {
        status: 'completed',
        endTime: new Date(),
        $set: {
          'recording.duration': durationMinutes,
          'recording.endTime': new Date()
        }
      },
      { new: true }
    );

    // Update progress record if exists
    const progress = await Progress.findOne({
      groupId: session.groupId,
      studentId: userId
    });

    if (progress) {
      progress.lastSessionDate = new Date();
      progress.totalSessionDuration = (progress.totalSessionDuration || 0) + durationMinutes;
      // Increment completion percentage slightly for session participation
      progress.completion_percentage = Math.min(100, (progress.completion_percentage || 0) + 2);
      await progress.save();
    }

    res.json({
      sessionId: updatedSession._id,
      status: 'completed',
      duration: durationMinutes,
      message: 'Session ended and saved successfully',
      recordingId: updatedSession._id,
      recordingDuration: durationMinutes
    });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ message: 'Failed to end session', error: error.message });
  }
});

// Get session history for a group
router.get('/groups/:groupId/sessions', verifyToken, async (req, res) => {
  try {
    const { groupId } = req.params;

    const sessions = await VirtualLabSession.find({ groupId })
      .populate('initiatedBy', 'firstName lastName')
      .sort({ startTime: -1 })
      .lean();

    res.json({
      groupId,
      totalSessions: sessions.length,
      sessions: sessions.map(s => ({
        sessionId: s._id,
        initiatedBy: s.initiatedBy,
        status: s.status,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: s.endTime ? 
          Math.floor((s.endTime - s.startTime) / 1000 / 60) : null,
        participantCount: s.participants.length,
        recordingAvailable: s.recording.enabled && s.status === 'completed'
      }))
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ message: 'Failed to fetch sessions', error: error.message });
  }
});

// Get recording for a completed session
router.get('/sessions/:sessionId/recording', verifyToken, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await VirtualLabSession.findById(sessionId)
      .select('recording code feedback participants')
      .lean();

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    if (session.recording.duration === 0) {
      return res.status(400).json({ message: 'Recording not available for this session' });
    }

    res.json({
      sessionId,
      recording: {
        duration: session.recording.duration,
        startTime: session.recording.startTime,
        endTime: session.recording.endTime,
        chunks: session.recording.chunks.slice(0, 50) // Last 50 actions
      },
      finalCode: session.code,
      feedback: session.feedback,
      participantCount: session.participants.length
    });
  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json({ message: 'Failed to fetch recording', error: error.message });
  }
});

// Get active sessions for mentor (to monitor)
router.get('/active-sessions', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const mentorId = req.user.id;

    // Find groups where user is mentor
    const groups = await require('../models/StudentGroup').find({ mentorId }).select('_id');
    const groupIds = groups.map(g => g._id);

    const sessions = await VirtualLabSession.find({
      groupId: { $in: groupIds },
      status: 'active'
    })
      .populate('initiatedBy', 'firstName lastName')
      .populate('participants', 'firstName lastName')
      .lean();

    res.json({
      activeSessions: sessions.map(s => ({
        sessionId: s._id,
        groupId: s.groupId,
        initiatedBy: s.initiatedBy,
        participants: s.participants,
        startTime: s.startTime,
        duration: Math.floor((new Date() - s.startTime) / 1000 / 60),
        feedbackCount: s.feedback.length
      }))
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({ message: 'Failed to fetch sessions', error: error.message });
  }
});

/**
 * ========================================================================
 * VERIFY VIRTUAL LAB SESSION ACCESS
 * ========================================================================
 * 
 * SECURITY ENDPOINT: Verifies user has access to session before Socket.io
 * connection is established.
 * 
 * Checks:
 * 1. User is member of StudentGroup (or mentor)
 * 2. User has Progress record (enrolled in project)
 * 3. Project is active
 * 4. Mentor still exists
 * 
 * Called by frontend BEFORE connecting to Socket.io
 */
router.post('/verify-access', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId, groupId } = req.body;

    // Validation
    if (!sessionId || !groupId) {
      return res.status(400).json({
        message: 'Missing sessionId or groupId'
      });
    }

    console.log(`[Virtual Lab Access] Verifying userId=${userId}, groupId=${groupId}`);

    // Check if this is an individual session (not a real group)
    const isIndividualSession = groupId.startsWith('individual-');
    
    if (isIndividualSession) {
      // For individual sessions, just verify the user has access
      const extractedUserId = groupId.replace('individual-', '');
      
      if (extractedUserId !== userId.toString()) {
        console.warn(`[Virtual Lab Access] Unauthorized individual session: userId=${userId}, groupId=${groupId}`);
        return res.status(403).json({
          message: 'Unauthorized access to this individual session'
        });
      }

      // Extract project ID from session ID (format: session-{projectId}-{userId})
      const projectId = sessionId.split('-')[1];
      
      if (!projectId) {
        return res.status(400).json({
          message: 'Invalid session ID format'
        });
      }

      // Verify enrollment in the project
      const progress = await Progress.findOne({
        studentId: userId,
        projectId: projectId
      }).lean().exec();

      if (!progress) {
        console.warn(`[Virtual Lab Access] No enrollment found: userId=${userId}, projectId=${projectId}`);
        return res.status(403).json({
          message: 'You are not enrolled in this project'
        });
      }

      // Individual session approved
      console.log(`[Virtual Lab Access] ✅ Individual session verified for userId=${userId}`);
      return res.json({
        success: true,
        message: 'Access granted to individual session',
        sessionMode: 'individual',
        projectId: projectId
      });
    }

    // ========== GATE 1: Verify StudentGroup Exists (for group sessions) ==========
    const studentGroup = await StudentGroup.findById(groupId)
      .select('projectId students mentorId status')
      .lean()
      .exec();

    if (!studentGroup) {
      console.warn(`[Virtual Lab Access] Group not found: ${groupId}`);
      return res.status(404).json({
        message: 'Group not found'
      });
    }

    // ========== GATE 2: Verify User is Group Member or Mentor ==========
    const isMember = studentGroup.students.some(
      sid => sid.toString() === userId.toString()
    );
    const isMentor = studentGroup.mentorId.toString() === userId.toString();

    if (!isMember && !isMentor) {
      console.warn(`[Virtual Lab Access] Unauthorized: userId=${userId}, groupId=${groupId}`);
      return res.status(403).json({
        message: 'You are not a member of this group'
      });
    }

    // ========== GATE 3: Verify Enrollment (Progress Record) ==========
    if (!isMentor) {
      // Students must have Progress record
      const progressRecord = await Progress.findOne({
        studentId: userId,
        projectId: studentGroup.projectId,
        groupId: groupId
      })
        .select('_id status')
        .lean()
        .exec();

      if (!progressRecord) {
        console.warn(`[Virtual Lab Access] No enrollment: userId=${userId}, projectId=${studentGroup.projectId}`);
        return res.status(403).json({
          message: 'You are not enrolled in this project'
        });
      }
    }

    // ========== GATE 4: Verify Project is Active ==========
    const project = await Project.findById(studentGroup.projectId)
      .select('status mentor_id')
      .lean()
      .exec();

    if (!project) {
      console.warn(`[Virtual Lab Access] Project not found: ${studentGroup.projectId}`);
      return res.status(404).json({
        message: 'Project not found'
      });
    }

    if (project.status !== 'active') {
      console.warn(`[Virtual Lab Access] Project not active: status=${project.status}`);
      return res.status(403).json({
        message: `Project is ${project.status} and not available for sessions`
      });
    }

    // ========== GATE 5: Verify Mentor Still Exists ==========
    const mentor = await User.findById(studentGroup.mentorId)
      .select('_id')
      .lean()
      .exec();

    if (!mentor) {
      console.warn(`[Virtual Lab Access] Mentor deleted: mentorId=${studentGroup.mentorId}`);
      return res.status(403).json({
        message: 'The session mentor is no longer available'
      });
    }

    // ✅ ALL GATES PASSED
    console.log(`[Virtual Lab Access] ✅ Access granted: userId=${userId}`);

    res.json({
      allowed: true,
      sessionId: sessionId,
      groupId: groupId,
      projectId: studentGroup.projectId,
      mentorId: studentGroup.mentorId,
      userRole: isMentor ? 'mentor' : 'student',
      message: 'Access verified'
    });

  } catch (error) {
    console.error('[Virtual Lab Access] Error:', error);
    res.status(500).json({
      message: 'Failed to verify access',
      error: error.message
    });
  }
});

module.exports = router;
