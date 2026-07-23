const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
const EscrowTransaction = require('../models/EscrowTransaction');

// Create payment intent for project enrollment
const createPaymentIntent = async (groupId, projectId, centerId, amount) => {
  try {
    // Mock stripe if key is not provided
    let paymentIntent = { id: 'pi_mock_' + Date.now(), client_secret: 'secret_mock_' + Date.now() };
    
    if (process.env.STRIPE_SECRET_KEY) {
      paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'usd',
        metadata: {
          groupId,
          projectId,
          centerId,
        },
      });
    }

    // Record escrow transaction as HELD
    const escrow = new EscrowTransaction({
      groupId,
      projectId,
      centerId,
      amount,
      status: 'held',
      stripe_charge_id: paymentIntent.id,
      hold_reason: 'Project enrollment - funds held in escrow',
    });

    await escrow.save();

    return {
      clientSecret: paymentIntent.client_secret,
      escrowId: escrow._id,
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

// Release escrow funds when milestone is approved
const releaseEscrowFunds = async (escrowId, mentorId, milestoneId) => {
  try {
    const escrow = await EscrowTransaction.findById(escrowId);

    if (!escrow) {
      throw new Error('Escrow transaction not found');
    }

    if (escrow.status !== 'held') {
      throw new Error('Funds are not in HELD status');
    }

    // In a real app, you would trigger a Stripe transfer here
    // For now, we just update the status
    escrow.status = 'released';
    escrow.release_reason = `Milestone ${milestoneId} approved by mentor ${mentorId}`;
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

module.exports = {
  createPaymentIntent,
  releaseEscrowFunds,
};
