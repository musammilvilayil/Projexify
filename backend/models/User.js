const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  phone: String,
  avatar_url: String,
  bio: String,
  roles: {
    type: [String],
    enum: ['admin', 'center_admin', 'mentor', 'student'],
    default: ['student'],
  },
  centerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Center',
  },
  mentor_capacity: {
    type: Number,
    default: 5, // Default capacity for mentors
  },
  mentor_load: {
    type: Number,
    default: 0, // Currently assigned students/groups
  },
  verified: {
    type: Boolean,
    default: false,
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

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  this.updated_at = Date.now();
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
