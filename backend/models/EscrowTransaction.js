const mongoose = require('mongoose');

const escrowTransactionSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  groupId: {
    type: String, // Or ObjectId if you have a Group model
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
  amount: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['held', 'confirmed', 'released', 'refunded'],
    default: 'held',
  },
  stripe_charge_id: {
    type: String,
  },
  razorpay_order_id: {
    type: String,
  },
  razorpay_payment_id: {
    type: String,
  },
  razorpay_signature: {
    type: String,
  },
  hold_reason: {
    type: String,
  },
  release_reason: {
    type: String,
  },
  refund_reason: {
    type: String,
  },
  payment_confirmed_at: Date,
  release_date: Date,
  refund_date: Date,
  released_by: {
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

escrowTransactionSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('EscrowTransaction', escrowTransactionSchema);

module.exports = mongoose.model('EscrowTransaction', escrowTransactionSchema);
