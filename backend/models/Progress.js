const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  studentId: {
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
  assignedMentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  mentorAssignedAt: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['enrolled', 'pending_mentor', 'in_progress', 'submitted', 'completed', 'failed'],
    default: 'pending_mentor',
  },
  completion_percentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  // Current state
  current_milestone_index: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  milestones_completed: [Number], // Array of completed milestone indices
  
  // Session tracking (CRITICAL)
  required_sessions_count: {
    type: Number,
    default: 6
  },
  sessions_completed: {
    type: Number,
    default: 0
  },
  sessions_remaining: {
    type: Number,
    default: 6
  },
  sessions_attended: [{
    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session'
    },
    milestone_index: Number,
    attended_at: Date,
    duration_minutes: Number,
    status: String,
    mentor_feedback: String,
    milestone_approved: Boolean,
    rating_given: Number
  }],
  
  // Milestone progress details
  milestone_progress: [{
    milestone_index: Number,
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'locked'],
      default: 'not_started'
    },
    started_at: Date,
    completed_at: Date,
    time_spent_hours: { type: Number, default: 0 },
    tasks: [{
      title: String,
      status: {
        type: String,
        enum: ['not_started', 'in_progress', 'completed'],
        default: 'not_started'
      },
      completed_at: Date
    }],
    session_attended: { type: Boolean, default: false },
    mentor_approval: {
      approved: Boolean,
      approved_at: Date,
      feedback: String,
      score: Number
    },
    submission: {
      submitted_at: Date,
      github_commit_url: String,
      live_demo_url: String
    },
    progress_percentage: { type: Number, default: 0 }
  }],
  
  // Locked milestones
  locked_milestones: [{
    milestone_index: Number,
    reason: String,
    unlock_conditions: [{
      type: {
        type: String,
        enum: ['milestone_completion', 'session_attendance']
      },
      target: Number
    }]
  }],
  
  // Project completion validation
  can_submit_project: { type: Boolean, default: false },
  submission_blocked_reason: String,
  completion_requirements_met: {
    all_milestones_completed: { type: Boolean, default: false },
    all_sessions_attended: { type: Boolean, default: false },
    all_mentor_approvals: { type: Boolean, default: false },
    minimum_code_quality: { type: Boolean, default: false }
  },
  
  // Time tracking
  total_time_spent_hours: { type: Number, default: 0 },
  time_breakdown: {
    coding: { type: Number, default: 0 },
    debugging: { type: Number, default: 0 },
    research: { type: Number, default: 0 },
    sessions: { type: Number, default: 0 }
  },
  
  // Quality metrics
  code_quality_scores: [{
    milestone_index: Number,
    functionality: Number,
    best_practices: Number,
    documentation: Number,
    overall: Number
  }],
  
  // Overall progress
  overall_progress_percentage: { type: Number, default: 0 },
  estimated_completion_date: Date,
  days_ahead_or_behind: { type: Number, default: 0 },
  
  // Performance
  strengths: [String],
  areas_for_improvement: [String],
  
  // Legacy fields (keep for backward compatibility)
  submission: {
    code_link: String,
    github_url: String,
    submission_date: Date,
    notes: String,
  },
  mentor_evaluations: [{
    mentorId: mongoose.Schema.Types.ObjectId,
    feedback: String,
    score: Number,
    evaluation_date: Date,
  }],
  started_at: {
    type: Date,
    default: Date.now,
  },
  enrolled_at: {
    type: Date,
    default: Date.now,
  },
  enrollment_type: {
    type: String,
    enum: ['solo', 'group'],
    default: 'solo',
  },
  transaction_id: String,
  mentor_report: {
    summary: String,
    score_card: mongoose.Schema.Types.Mixed,
    recommendations: [String],
    submitted_at: Date
  },
  payment_status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  completed_at: Date,
  total_hours_spent: {
    type: Number,
    default: 0,
  },
  last_activity: Date,
}, { timestamps: true });

// Index for faster queries
progressSchema.index({ studentId: 1, projectId: 1 });
progressSchema.index({ groupId: 1 });

module.exports = mongoose.model('Progress', progressSchema);
