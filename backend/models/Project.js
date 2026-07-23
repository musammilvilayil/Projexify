const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  centerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Center',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  abstract: {
    type: String,
  },
  tech_stack: {
    type: [String],
    default: [],
  },
  difficulty_level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate',
  },
  duration_weeks: {
    type: Number,
    default: 12,
  },
  price: {
    type: Number,
    default: 0,
  },
  max_students: {
    type: Number,
    default: 5,
  },
  current_students: {
    type: Number,
    default: 0,
  },
  capacity: {
    type: Number,
    default: 5,
  },
  category: {
    type: String,
    default: 'general',
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
  },
  approval_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  // NEW: Session-Milestone Structure
  required_sessions: {
    type: Number,
    default: 6,
  },
  milestones: [{
    week: Number,
    title: String,
    description: String,
    tasks: [{
      title: String,
      description: String,
      priority: {
        type: String,
        enum: ['high', 'medium', 'low'],
        default: 'medium'
      },
      estimated_hours: Number,
      resources: [{
        title: String,
        url: String
      }]
    }],
    // Session requirement (CRITICAL)
    requires_session: {
      type: Boolean,
      default: true
    },
    session_number: Number,
    session_title: String,
    session_duration_minutes: {
      type: Number,
      default: 90
    },
    session_agenda: [String],
    // Completion criteria
    completion_requirements: {
      all_tasks_completed: { type: Boolean, default: true },
      session_attended: { type: Boolean, default: true },
      mentor_approval: { type: Boolean, default: true },
      min_code_quality_score: { type: Number, default: 70 }
    },
    // Unlock logic
    locked_until: {
      previous_milestone_completed: { type: Boolean, default: true },
      previous_session_attended: { type: Boolean, default: true }
    }
  }],
  // Default workspace structure (replaces assets)
  default_workspace_structure: {
    folders: {
      type: [String],
      default: ['src/', 'src/components/', 'src/utils/', 'public/', 'public/assets/']
    },
    starter_files: [{
      path: String,
      content: String,
      language: String,
      editable: { type: Boolean, default: true }
    }]
  },
  // Legacy assets (keep for backward compatibility)
  assets: [{
    title: { type: String, required: true },
    url: { type: String },
    type: { type: String, enum: ['pdf', 'zip', 'doc', 'link', 'html', 'js', 'css', 'json', 'txt', 'image', 'code', 'document', 'design', 'file'], default: 'file' },
    content: { type: String },
    language: { type: String },
    uploaded_at: { type: Date, default: Date.now },
    mimeType: { type: String },
    size: { type: Number },
    extension: { type: String },
    filename: { type: String },
    originalName: { type: String },
    extractedAt: { type: Date }
  }],
  featured: {
    type: Boolean,
    default: false,
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0,
  },
  content_shield_enabled: {
    type: Boolean,
    default: true,
  },
  watermark_text: {
    type: String,
    default: 'Projexify™',
  },
  learning_outcomes: {
    type: [String],
    default: [],
  },
  prerequisites: {
    type: [String],
    default: [],
  },
  mentor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

// Update the updated_at timestamp before saving
projectSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('Project', projectSchema);
