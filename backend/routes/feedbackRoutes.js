const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/auth');
const MentorFeedback = require('../models/MentorFeedback');
const Progress = require('../models/Progress');
const Project = require('../models/Project');

// POST /api/feedback/send - Send feedback from mentor
router.post('/send', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { studentId, projectId, groupId, feedbackType, message, codeSnippet, suggestions, score, isRealTime } = req.body;
    const mentorId = req.user.id;

    // Verify project exists and mentor owns it
    const project = await Project.findById(projectId);
    if (!project || project.mentor_id.toString() !== mentorId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Create feedback
    const feedback = new MentorFeedback({
      studentId,
      mentorId,
      projectId,
      groupId,
      feedbackType,
      message,
      codeSnippet,
      suggestions,
      score,
      isRealTime,
    });

    await feedback.save();

    res.json({
      success: true,
      message: 'Feedback sent successfully',
      feedback,
      feedbackId: feedback._id,
    });
  } catch (error) {
    console.error('Error sending feedback:', error);
    res.status(500).json({ message: 'Error sending feedback' });
  }
});

// GET /api/feedback/student/:studentId/:projectId - Get all feedback for student on project
router.get('/student/:studentId/:projectId', verifyToken, async (req, res) => {
  try {
    const { studentId, projectId } = req.params;

    // Allow student to view their own feedback
    if (req.user.id !== studentId && req.user.role !== 'mentor') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const feedback = await MentorFeedback.find({ studentId, projectId })
      .populate('mentorId', 'firstName lastName avatar_url')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      feedback,
      total: feedback.length,
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ message: 'Error fetching feedback' });
  }
});

// GET /api/feedback/unread/:studentId - Get unread feedback count
router.get('/unread/:studentId', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    if (req.user.id !== studentId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const unreadCount = await MentorFeedback.countDocuments({
      studentId,
      read: false,
    });

    res.json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error('Error counting unread feedback:', error);
    res.status(500).json({ message: 'Error counting unread feedback' });
  }
});

// PUT /api/feedback/:feedbackId/read - Mark feedback as read
router.put('/:feedbackId/read', verifyToken, async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const studentId = req.user.id;

    const feedback = await MentorFeedback.findOneAndUpdate(
      { _id: feedbackId, studentId },
      { read: true, read_at: new Date() },
      { new: true }
    );

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    res.json({
      success: true,
      message: 'Feedback marked as read',
      feedback,
    });
  } catch (error) {
    console.error('Error marking feedback as read:', error);
    res.status(500).json({ message: 'Error marking feedback as read' });
  }
});

// GET /api/feedback/mentor/:mentorId - Get all feedback given by mentor
router.get('/mentor/:mentorId', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { mentorId } = req.params;

    if (req.user.id !== mentorId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const feedback = await MentorFeedback.find({ mentorId })
      .populate('studentId', 'firstName lastName email')
      .populate('projectId', 'title')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      feedback,
      total: feedback.length,
    });
  } catch (error) {
    console.error('Error fetching mentor feedback:', error);
    res.status(500).json({ message: 'Error fetching mentor feedback' });
  }
});

// DELETE /api/feedback/:feedbackId - Delete feedback
router.delete('/:feedbackId', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const mentorId = req.user.id;

    const feedback = await MentorFeedback.findOneAndDelete({
      _id: feedbackId,
      mentorId,
    });

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    res.json({
      success: true,
      message: 'Feedback deleted',
    });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({ message: 'Error deleting feedback' });
  }
});

module.exports = router;
