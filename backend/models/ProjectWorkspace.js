const mongoose = require('mongoose');

const projectWorkspaceSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  workspacePath: {
    type: String,
  },
  // File structure (replaces assets)
  files: [{
    file_id: {
      type: String,
      required: true,
      unique: true
    },
    path: {
      type: String,
      required: true,
    },
    name: String,
    type: {
      type: String,
      enum: ['file', 'folder'],
      default: 'file',
    },
    language: String,
    content: String,
    contentType: {
      type: String,
      default: 'text/plain',
    },
    size_bytes: Number,
    // Version control
    version: { type: Number, default: 1 },
    versions: [{
      version: Number,
      content: String,
      saved_at: Date,
      saved_by: {
        type: String,
        enum: ['student', 'mentor', 'system']
      },
      milestone_checkpoint: Number
    }],
    // Mentor annotations
    mentor_comments: [{
      line_number: Number,
      comment: String,
      added_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      added_at: Date,
      resolved: { type: Boolean, default: false }
    }],
    // Metadata
    created_at: {
      type: Date,
      default: Date.now,
    },
    modified_at: {
      type: Date,
      default: Date.now,
    },
    last_modified_by: {
      type: String,
      enum: ['student', 'mentor']
    },
    is_readonly: { type: Boolean, default: false },
    is_starter_file: { type: Boolean, default: false },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  }],
  folders: [{
    folder_id: {
      type: String,
      required: true,
      unique: true
    },
    path: String,
    name: String,
    parent_path: String,
    created_at: { type: Date, default: Date.now }
  }],
  // Milestone snapshots (auto-backup)
  snapshots: [{
    snapshot_id: String,
    milestone_index: Number,
    created_at: Date,
    description: String,
    files_backup: mongoose.Schema.Types.Mixed,
    size_mb: Number,
    commit_hash: String
  }],
  // Active session state
  active_session: {
    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session'
    },
    started_at: Date,
    mentor_connected: Boolean,
    mentor_cursor_position: {
      file: String,
      line: Number,
      column: Number
    },
    live_annotations: [mongoose.Schema.Types.Mixed],
    shared_terminal_output: String
  },
  // Git integration (optional)
  git_repository: {
    provider: String,
    repo_url: String,
    branch: String,
    last_sync_at: Date,
    auto_sync_enabled: { type: Boolean, default: false }
  },
  // Storage
  total_size_mb: { type: Number, default: 0 },
  storage_limit_mb: { type: Number, default: 100 },
  metadata: {
    zipFileName: String,
    originalZipSize: Number,
    extractedSize: Number,
    fileCount: Number,
    uploadedAt: Date,
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active',
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

module.exports = mongoose.model('ProjectWorkspace', projectWorkspaceSchema);
