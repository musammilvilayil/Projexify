const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const Message = require('../models/Message');
const Progress = require('../models/Progress');
const Project = require('../models/Project');
const Center = require('../models/Center');
const { canAccessThread, threadRoom, isObjectId } = require('../services/chatAccess');

const MAX_MESSAGE_LENGTH = 5000;

// GET /api/messages/project/:projectId/student/:studentId
router.get('/project/:projectId/student/:studentId', verifyToken, async (req, res) => {
  try {
    const { projectId, studentId } = req.params;
    const access = await canAccessThread({ user: req.user, projectId, studentId }, { Project, Center, Progress });
    if (!access.allowed) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const messages = await Message.find({ projectId, studentId }).sort({ createdAt: 1 }).limit(500);
    return res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// POST /api/messages/send
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { projectId, studentId } = req.body || {};
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!isObjectId(String(projectId || '')) || !isObjectId(String(studentId || '')) || !message) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(413).json({ message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` });
    }

    // Previously any logged-in user could post into any student's thread
    const access = await canAccessThread({ user: req.user, projectId, studentId }, { Project, Center, Progress });
    if (!access.allowed) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const newMessage = await Message.create({ projectId, studentId, senderId: req.user.id, message });

    // Push to everyone who has this conversation open (authorized rooms only)
    const io = req.app.get('io');
    if (io) {
      const payload = {
        _id: newMessage._id,
        projectId: String(projectId),
        studentId: String(studentId),
        senderId: String(req.user.id),
        message: newMessage.message,
        timestamp: newMessage.createdAt,
      };
      const room = threadRoom(projectId, studentId);
      io.to(room).emit('new-message', payload);
      if (access.role === 'student') io.to(room).emit('student-message', payload);
    }

    res.json({ success: true, message: newMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Error sending message' });
  }
});

module.exports = router;
