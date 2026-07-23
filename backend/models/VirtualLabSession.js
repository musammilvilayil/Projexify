const mongoose = require('mongoose');

const virtualLabSessionSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentGroup',
    required: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
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
    enum: ['active', 'ended'],
    default: 'active',
  },
  started_at: {
    type: Date,
    default: Date.now,
  },
  ended_at: {
    type: Date,
  },
});

module.exports = mongoose.model('VirtualLabSession', virtualLabSessionSchema);
