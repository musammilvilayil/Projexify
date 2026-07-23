const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
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
  centerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Center',
    required: true,
  },
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  certificate_id: {
    type: String,
    unique: true,
    required: true,
  },
  certificate_url: String,
  pdf_url: String,
  issue_date: {
    type: Date,
    default: Date.now,
  },
  completion_date: Date,
  duration_weeks: Number,
  skills_acquired: [String],
  final_score: {
    type: Number,
    min: 0,
    max: 100,
  },
  verification_code: {
    type: String,
    unique: true,
  },
  is_verified: {
    type: Boolean,
    default: false,
  },
  verification_date: Date,
  metadata: {
    project_title: String,
    student_name: String,
    center_name: String,
    mentor_name: String,
  },
}, { timestamps: true });

// Generate unique certificate ID
certificateSchema.pre('save', async function(next) {
  if (!this.certificate_id) {
    const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).substr(2);
    this.certificate_id = `CERT-${this.centerId}-${this.studentId}-${uniqueSuffix}`.toUpperCase();
  }
  if (!this.verification_code) {
    this.verification_code = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  next();
});

// Index for faster queries
certificateSchema.index({ studentId: 1 });
certificateSchema.index({ certificate_id: 1 });
certificateSchema.index({ verification_code: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);
