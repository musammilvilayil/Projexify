const Razorpay = require('razorpay');
const crypto = require('crypto');
const EscrowTransaction = require('../models/EscrowTransaction');
const Progress = require('../models/Progress');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_mock',
});

// Create Razorpay order for project enrollment
const createRazorpayOrder = async (studentId, projectId, centerId, amount) => {
  try {
    // Create a short receipt ID (max 40 chars)
    const shortReceipt = `R${Date.now().toString().slice(-8)}${Math.random().toString(36).substr(2, 5)}`.substring(0, 40);
    
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: shortReceipt,
      notes: {
        studentId,
        projectId,
        centerId,
        type: 'project_enrollment',
      },
    };

    console.log('Creating Razorpay order with options:', JSON.stringify(options, null, 2));
    const order = await razorpay.orders.create(options);
    console.log('Razorpay order created:', order.id, 'Amount:', order.amount);

    // Record escrow transaction as HELD
    const escrow = new EscrowTransaction({
      studentId,
      projectId,
      centerId,
      amount,
      status: 'held',
      razorpay_order_id: order.id,
      hold_reason: 'Project enrollment - funds held in escrow',
    });

    await escrow.save();

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      escrowId: escrow._id,
    };
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    throw error;
  }
};

// Verify Razorpay payment
const verifyRazorpayPayment = async (orderId, paymentId, signature) => {
  try {
    const hmac = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'secret_mock')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (hmac !== signature) {
      throw new Error('Invalid signature - payment verification failed');
    }

    return true;
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    throw error;
  }
};

// Complete enrollment payment
const completeEnrollmentPayment = async (studentId, projectId, centerId, orderId, paymentId, signature, groupId = null) => {
  try {
    // Verify payment signature
    await verifyRazorpayPayment(orderId, paymentId, signature);

    // Find and update escrow transaction
    const escrow = await EscrowTransaction.findOne({ razorpay_order_id: orderId });

    if (!escrow) {
      throw new Error('Escrow transaction not found');
    }

    escrow.status = 'confirmed';
    escrow.razorpay_payment_id = paymentId;
    escrow.razorpay_signature = signature;
    escrow.payment_confirmed_at = new Date();
    await escrow.save();

    // Create progress record for student
    const progress = new Progress({
      studentId,
      projectId,
      groupId,
      status: 'enrolled',
      completion_percentage: 0,
    });

    await progress.save();

    return {
      success: true,
      message: 'Payment confirmed and enrollment complete',
      escrowId: escrow._id,
      progressId: progress._id,
    };
  } catch (error) {
    console.error('Error completing enrollment payment:', error);
    throw error;
  }
};

// Release escrow funds when project is completed
const releaseEscrowFunds = async (escrowId, mentorId, reason = 'Project completed') => {
  try {
    const escrow = await EscrowTransaction.findById(escrowId);

    if (!escrow) {
      throw new Error('Escrow transaction not found');
    }

    if (escrow.status !== 'confirmed') {
      throw new Error('Funds are not in CONFIRMED status');
    }

    // In a real app, you would trigger a Razorpay transfer here
    escrow.status = 'released';
    escrow.release_reason = reason;
    escrow.released_by = mentorId;
    escrow.release_date = new Date();
    await escrow.save();

    return {
      message: 'Funds released successfully',
      transaction: escrow,
    };
  } catch (error) {
    console.error('Error releasing escrow funds:', error);
    throw error;
  }
};

// Refund payment
const refundPayment = async (escrowId, reason) => {
  try {
    const escrow = await EscrowTransaction.findById(escrowId);

    if (!escrow) {
      throw new Error('Escrow transaction not found');
    }

    // In a real app, you would trigger a Razorpay refund here
    escrow.status = 'refunded';
    escrow.refund_reason = reason;
    escrow.refund_date = new Date();
    await escrow.save();

    return {
      message: 'Refund processed successfully',
      transaction: escrow,
    };
  } catch (error) {
    console.error('Error processing refund:', error);
    throw error;
  }
};

// Get payment status
const getPaymentStatus = async (orderId) => {
  try {
    const order = await razorpay.orders.fetch(orderId);
    return {
      orderId: order.id,
      status: order.status,
      amount: order.amount / 100,
      currency: order.currency,
      createdAt: new Date(order.created_at * 1000),
    };
  } catch (error) {
    console.error('Error fetching payment status:', error);
    throw error;
  }
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  completeEnrollmentPayment,
  releaseEscrowFunds,
  refundPayment,
  getPaymentStatus,
};
