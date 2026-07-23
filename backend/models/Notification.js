const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['enrollment', 'mentor_assigned', 'session_scheduled', 'session_reminder', 'session_started', 'session_ended', 'session_notification', 'milestone_completed', 'feedback_received', 'general'],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    // Can reference Project, Session, Progress, etc.
  },
  relatedModel: {
    type: String,
    enum: ['Project', 'Session', 'Progress', 'StudentGroup', 'User'],
  },
  read: {
    type: Boolean,
    default: false,
  },
  actionUrl: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for faster queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
