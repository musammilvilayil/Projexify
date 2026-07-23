const mongoose = require('mongoose');

const centerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  description: String,
  logo_url: String,
  website: String,
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  phone: String,
  address: String,
  city: String,
  state: String,
  country: String,
  zip_code: String,
  admin_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'suspended'],
    default: 'pending',
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

centerSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

const Center = mongoose.model('Center', centerSchema);

module.exports = Center;
