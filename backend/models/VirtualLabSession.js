const mongoose = require('mongoose');

const virtualLabSessionSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentGroup',
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Everyone who has joined (routes and sockets write "participants"; "active_users" kept for older data)
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  active_users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  ai_hints_used: {
    type: Number,
    default: 0,
  },
  code: {
    type: String,
  },
  status: {
    type: String,
    enum: ['active', 'ended', 'completed', 'terminated'],
    default: 'active',
  },
  terminationReason: String,
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  lastActivityTime: Date,
  started_at: {
    type: Date,
    default: Date.now,
  },
  ended_at: {
    type: Date,
  },
  recording: {
    enabled: { type: Boolean, default: true },
    startTime: Date,
    endTime: Date,
    duration: Number,
    url: String,
    chunks: [{ type: mongoose.Schema.Types.Mixed }],
  },
  feedback: [{
    mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    mentorEmail: String,
    message: String,
    lineNumber: Number,
    type: { type: String },
    timestamp: Date,
  }],
});

module.exports = mongoose.model('VirtualLabSession', virtualLabSessionSchema);
