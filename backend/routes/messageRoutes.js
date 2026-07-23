const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const Message = require('../models/Message');
const Progress = require('../models/Progress');
const Project = require('../models/Project');
const mongoose = require('mongoose');

// GET /api/messages/project/:projectId/student/:studentId
router.get('/project/:projectId/student/:studentId', verifyToken, async (req, res) => {
  try {
    const { projectId, studentId } = req.params;
    
    // Authorization check
    const userId = req.user.id;
    const userRoles = req.user.roles || [];

    console.log(`[Messages] User ID: ${userId}, Roles: ${JSON.stringify(userRoles)}`);

    // Allow access if:
    // 1. User is the student themselves
    if (userId === studentId) {
      const messages = await Message.find({
        projectId,
        studentId
      }).sort({ createdAt: 1 });
      return res.json(messages);
    }

    // 2. User is center_admin (can see all messages)
    if (userRoles.includes('center_admin')) {
      const messages = await Message.find({
        projectId,
        studentId
      }).sort({ createdAt: 1 });
      return res.json(messages);
    }

    // 3. User is a mentor
    if (userRoles.includes('mentor')) {
      // Check if mentor teaches this project by looking at mentor_id field
      const project = await Project.findById(projectId);
      
      if (!project) {
        console.log(`[Messages] Project ${projectId} not found`);
        return res.status(404).json({ message: 'Project not found' });
      }

      console.log(`[Messages] Project mentor_id: ${project.mentor_id}, User ID: ${userId}`);
      console.log(`[Messages] Project mentor_id type: ${typeof project.mentor_id}, User ID type: ${typeof userId}`);

      // Convert both IDs to strings for comparison (handles ObjectId vs string)
      const projectMentorId = project.mentor_id ? project.mentor_id.toString() : null;
      const currentUserId = userId.toString();

      console.log(`[Messages] After conversion - Project mentor: ${projectMentorId}, Current user: ${currentUserId}`);
      console.log(`[Messages] Match: ${projectMentorId === currentUserId}`);

      if (projectMentorId !== currentUserId) {
        console.log(`[Messages] 403: Mentor ${currentUserId} not assigned to project ${projectId} (mentor is ${projectMentorId})`);
        return res.status(403).json({ message: 'Not assigned to this project' });
      }

      const messages = await Message.find({
        projectId,
        studentId
      }).sort({ createdAt: 1 });
      
      console.log(`[Messages] Success: Returning ${messages.length} messages`);
      return res.json(messages);
    }

    // Default: deny access
    return res.status(403).json({ message: 'Access denied' });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// POST /api/messages/send
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { projectId, studentId, message } = req.body;
    
    if (!projectId || !studentId || !message) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const newMessage = new Message({
      projectId,
      studentId,
      senderId: req.user.id,
      message
    });

    await newMessage.save();

    res.json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Error sending message' });
  }
});

module.exports = router;
