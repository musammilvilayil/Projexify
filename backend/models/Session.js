const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  studentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentGroup',
  },
  // Link to milestone (CRITICAL)
  milestone_index: {
    type: Number,
    min: 0,
    max: 5
  },
  milestone_title: String,
  session_number: {
    type: Number,
    min: 1,
    max: 6
  },
  // Type
  session_type: {
    type: String,
    enum: ['milestone_review', 'problem_solving', 'code_review'],
    default: 'milestone_review'
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  scheduledDate: {
    type: Date,
    required: true,
  },
  startTime: {
    type: String, // Format: "HH:MM"
    required: true,
  },
  endTime: {
    type: String, // Format: "HH:MM"
    required: true,
  },
  duration: {
    type: Number, // in minutes
    required: true,
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  },
  status: {
    type: String,
    enum: ['scheduled', 'in-progress', 'in_progress', 'active', 'completed', 'cancelled'],
    default: 'scheduled',
  },
  meetingLink: {
    type: String,
  },
  jitsi_room_name: String,
  google_calendar_event_id: String,
  // Agenda
  agenda: [{
    type: String
  }],
  // Pre-session requirements
  student_prep_tasks: [{
    task: String,
    completed: { type: Boolean, default: false }
  }],
  // Attendance tracking
  attendance: [{
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'excused'],
      default: 'absent',
    },
    joinedAt: Date,
    leftAt: Date,
    duration_minutes: Number,
    late_by_minutes: { type: Number, default: 0 },
    notes: String
  }],
  // Session outcomes
  outcomes: {
    milestone_status: {
      type: String,
      enum: ['approved', 'needs_work', 'requires_resubmission'],
    },
    topics_covered: [String],
    issues_resolved: [String],
    homework_assigned: [{
      task: String,
      due_date: Date,
      priority: {
        type: String,
        enum: ['high', 'medium', 'low'],
        default: 'medium'
      }
    }],
    next_steps: [String],
    mentor_feedback: String,
    code_reviewed: [{
      file_path: String,
      feedback: String,
      rating: { type: Number, min: 1, max: 5 }
    }]
  },
  // Recording
  recording: {
    available: { type: Boolean, default: false },
    url: String,
    duration_minutes: Number,
    size_mb: Number,
    expires_at: Date
  },
  // Session notes (shared)
  shared_notes: {
    mentor_notes: String,
    student_notes: String,
    code_snippets: [{
      title: String,
      code: String,
      language: String
    }],
    links_shared: [{
      title: String,
      url: String
    }]
  },
  // Old notes field (keep for backward compatibility)
  notes: {
    type: String,
  },
  // Completion validation
  is_completed: { type: Boolean, default: false },
  completed_at: Date,
  completion_criteria_met: {
    minimum_duration_met: Boolean,
    attendance_threshold_met: Boolean,
    milestone_reviewed: Boolean,
    homework_assigned: Boolean
  },
  // Cancellation
  cancellation: {
    cancelled_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    cancelled_at: Date,
    rescheduled_to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session'
    }
  },
  // Feedback
  mentor_rating: {
    from_students: [{
      student_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      rating: { type: Number, min: 1, max: 5 },
      comment: String,
      rated_at: Date
    }],
    average: Number
  },
  // Instant session
  isInstant: {
    type: Boolean,
    default: false
  },
  startedAt: Date,
  endedAt: Date,
  // Recording configuration
  recordingEnabled: {
    type: Boolean,
    default: false
  },
  recordingStartedAt: Date,
  recordingEndedAt: Date,
  recordingPath: String,
  // Session active status
  active: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp before saving
sessionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method to check if session is currently active
sessionSchema.methods.isActive = function() {
  const now = new Date();
  const sessionDate = new Date(this.scheduledDate);
  
  // Parse start and end times
  const [startHour, startMin] = this.startTime.split(':').map(Number);
  const [endHour, endMin] = this.endTime.split(':').map(Number);
  
  const startDateTime = new Date(sessionDate);
  startDateTime.setHours(startHour, startMin, 0, 0);
  
  const endDateTime = new Date(sessionDate);
  endDateTime.setHours(endHour, endMin, 0, 0);
  
  return now >= startDateTime && now <= endDateTime && this.status === 'scheduled';
};

module.exports = mongoose.model('Session', sessionSchema);
