const mongoose = require('mongoose');

const mentorFeedbackSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentGroup',
  },
  feedbackType: {
    type: String,
    enum: ['code_review', 'approach', 'performance', 'milestone', 'general'],
    default: 'general',
  },
  message: {
    type: String,
    required: true,
  },
  codeSnippet: String,
  suggestions: [String],
  score: {
    type: Number,
    min: 1,
    max: 5,
  },
  isRealTime: {
    type: Boolean,
    default: false,
  },
  read: {
    type: Boolean,
    default: false,
  },
  read_at: Date,
  attachments: [String], // URLs to files or images
}, { timestamps: true });

// Index for faster queries
mentorFeedbackSchema.index({ studentId: 1, mentorId: 1 });
mentorFeedbackSchema.index({ projectId: 1 });
mentorFeedbackSchema.index({ groupId: 1 });

module.exports = mongoose.model('MentorFeedback', mentorFeedbackSchema);
