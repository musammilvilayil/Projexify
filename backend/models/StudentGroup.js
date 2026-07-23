const mongoose = require('mongoose');

const studentGroupSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  leaderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  invitations: [{
    email: { type: String, required: true },
    status: { type: String, enum: ['sent', 'accepted', 'ignored'], default: 'sent' },
    invited_at: { type: Date, default: Date.now }
  }],
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  total_ai_hints_used: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['open', 'active', 'completed', 'archived'],
    default: 'open',
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

studentGroupSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('StudentGroup', studentGroupSchema);
