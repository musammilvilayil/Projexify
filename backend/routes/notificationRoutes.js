const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { verifyToken } = require('../middleware/auth');

// GET /api/notifications - Get user's notifications
router.get('/', verifyToken, async (req, res) => {
  try {
    const { unreadOnly } = req.query;
    const query = { userId: req.user._id };
    
    if (unreadOnly === 'true') {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({ 
      userId: req.user._id, 
      read: false 
    });

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Error fetching notifications' });
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    notification.read = true;
    await notification.save();

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error updating notification:', error);
    res.status(500).json({ message: 'Error updating notification' });
  }
});

// POST /api/notifications/session-started - Notify students that a session has started
router.post('/session-started', verifyToken, async (req, res) => {
  try {
    const { studentIds, sessionId, title, message } = req.body;
    
    if (!studentIds || !sessionId || !title || !message) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const notifications = studentIds.map(studentId => ({
      userId: studentId,
      type: 'session_started',
      title,
      message,
      relatedId: sessionId,
      relatedModel: 'Session',
      actionUrl: `/pages/virtual-lab-v3.html?sessionId=${sessionId}`,
      read: false,
      createdAt: new Date()
    }));

    const result = await Notification.insertMany(notifications);
    
    res.status(201).json({ 
      message: 'Session start notifications created',
      notificationCount: result.length,
      notifications: result
    });
  } catch (error) {
    console.error('Error creating session notification:', error);
    res.status(500).json({ message: 'Error creating notification' });
  }
});

// PUT /api/notifications/mark-all-read - Mark all as read
router.put('/mark-all-read', verifyToken, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, read: false },
      { read: true }
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error updating notifications:', error);
    res.status(500).json({ message: 'Error updating notifications' });
  }
});

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Error deleting notification' });
  }
});

module.exports = router;
