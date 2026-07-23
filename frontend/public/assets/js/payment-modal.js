// Custom Payment Modal - Demo Payment System
class PaymentModal {
  constructor() {
    this.isOpen = false;
    this.currentOrder = null;
  }

  // Create and show the payment modal
  open(orderData) {
    this.currentOrder = orderData;
    const modal = this.createModal(orderData);
    document.body.appendChild(modal);
    this.isOpen = true;

    // Add event listeners
    this.attachEventListeners(modal);
  }

  createModal(orderData) {
    const { amount, projectId, projectTitle } = orderData;
    const amountInRupees = (amount / 100).toFixed(2);

    const modal = document.createElement('div');
    modal.id = 'payment-modal-overlay';
    modal.className = 'payment-modal-overlay';
    modal.innerHTML = `
      <div class="payment-modal glass-card" style="max-height: 85vh; overflow-y: auto;">
        <!-- Header -->
        <div class="payment-header">
          <h2>Complete Payment</h2>
          <button class="payment-close" id="payment-close">&times;</button>
        </div>

        <!-- Order Summary -->
        <div class="payment-summary">
          <div class="summary-item">
            <span class="summary-label">Project:</span>
            <span class="summary-value">${projectTitle}</span>
          </div>
          <div class="summary-item total">
            <span class="summary-label">Amount to Pay:</span>
            <span class="summary-value amount">₹${amountInRupees}</span>
          </div>
        </div>

        <!-- Payment Form -->
        <form id="payment-form" class="payment-form">
          <!-- Card Number -->
          <div class="form-group">
            <label>Card Number</label>
            <input 
              type="text" 
              id="card-number" 
              placeholder="5104 0600 0000 0008"
              value="5104060000000008"
              maxlength="19"
              class="form-input"
            >
            <small class="form-hint">Test card: 5104 0600 0000 0008</small>
          </div>

          <!-- Cardholder Name -->
          <div class="form-group">
            <label>Cardholder Name</label>
            <input 
              type="text" 
              id="card-name" 
              placeholder="TEST CARD"
              value="TEST CARD"
              class="form-input"
            >
          </div>

          <!-- Expiry & CVV -->
          <div class="form-row">
            <div class="form-group">
              <label>Expiry (MM/YY)</label>
              <input 
                type="text" 
                id="card-expiry" 
                placeholder="01/27"
                value="01/27"
                maxlength="5"
                class="form-input"
              >
            </div>
            <div class="form-group">
              <label>CVV</label>
              <input 
                type="text" 
                id="card-cvv" 
                placeholder="000"
                value="000"
                maxlength="4"
                class="form-input"
              >
            </div>
          </div>

          <!-- OTP (Optional) -->
          <div class="form-group">
            <label>OTP (Enter any 6 digits)</label>
            <input 
              type="text" 
              id="card-otp" 
              placeholder="123456"
              value="123456"
              maxlength="6"
              class="form-input"
            >
          </div>

          <!-- Processing Indicator -->
          <div id="processing" class="processing hidden">
            <div class="spinner"></div>
            <span>Processing Payment...</span>
          </div>

          <!-- Button -->
          <button 
            type="submit" 
            id="pay-button" 
            class="btn btn-primary pay-button"
          >
            Pay ₹${amountInRupees}
          </button>
        </form>

        <!-- Disclaimer -->
        <div class="payment-disclaimer">
          <p>This is a demo payment. No real transaction will occur.</p>
          <p style="color: #10b981; font-weight: 600;">✓ Demo card always succeeds</p>
        </div>
      </div>
    `;

    return modal;
  }

  attachEventListeners(modal) {
    const form = modal.querySelector('#payment-form');
    const closeBtn = modal.querySelector('#payment-close');
    const overlay = modal;

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Close on overlay click (outside modal)
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
    }

    // Form submit
    if (form) {
      form.addEventListener('submit', (e) => this.handlePayment(e, modal));
    }

    // Card number formatting
    const cardInput = modal.querySelector('#card-number');
    if (cardInput) {
      cardInput.addEventListener('input', (e) => {
        e.target.value = this.formatCardNumber(e.target.value);
      });
    }

    // Expiry formatting
    const expiryInput = modal.querySelector('#card-expiry');
    if (expiryInput) {
      expiryInput.addEventListener('input', (e) => {
        e.target.value = this.formatExpiry(e.target.value);
      });
    }

    // CVV - only numbers
    const cvvInput = modal.querySelector('#card-cvv');
    if (cvvInput) {
      cvvInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
      });
    }

    // OTP - only numbers
    const otpInput = modal.querySelector('#card-otp');
    if (otpInput) {
      otpInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
      });
    }
  }

  formatCardNumber(value) {
    const digits = value.replace(/\D/g, '');
    const formatted = digits.replace(/(\d{4})/g, '$1 ').trim();
    return formatted.substring(0, 19);
  }

  formatExpiry(value) {
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 2) {
      return digits.substring(0, 2) + '/' + digits.substring(2, 4);
    }
    return digits;
  }

  async handlePayment(e, modal) {
    e.preventDefault();

    const cardNumber = modal.querySelector('#card-number').value.replace(/\s/g, '');
    const cardName = modal.querySelector('#card-name').value;
    const expiry = modal.querySelector('#card-expiry').value;
    const cvv = modal.querySelector('#card-cvv').value;
    const otp = modal.querySelector('#card-otp').value;

    // Validate
    if (!cardNumber || cardNumber.length < 16) {
      this.showNotification('Please enter a valid card number', 'error', modal);
      return;
    }
    if (!expiry || !expiry.includes('/')) {
      this.showNotification('Please enter valid expiry date (MM/YY)', 'error', modal);
      return;
    }
    if (!cvv || cvv.length < 3) {
      this.showNotification('Please enter valid CVV', 'error', modal);
      return;
    }
    if (!otp || otp.length < 6) {
      this.showNotification('Please enter valid OTP (6 digits)', 'error', modal);
      return;
    }

    // Show processing
    const processing = modal.querySelector('#processing');
    const payButton = modal.querySelector('#pay-button');
    if (processing) {
      processing.classList.remove('hidden');
    }
    if (payButton) {
      payButton.disabled = true;
    }

    // Simulate payment processing (2-3 seconds)
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Call enrollment API to complete enrollment
    try {
      const response = await fetch('/api/enrollment/free', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          projectId: this.currentOrder.projectId,
          enrollmentType: this.currentOrder.enrollmentType || 'solo',
          groupName: this.currentOrder.groupName || ''
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Enrollment failed');
      }

      // Success!
      this.showSuccess(modal);
    } catch (error) {
      if (processing) {
        processing.classList.add('hidden');
      }
      if (payButton) {
        payButton.disabled = false;
      }
      this.showNotification('Error completing enrollment: ' + error.message, 'error', modal);
    }
  }

  showSuccess(modal) {
    const form = modal.querySelector('.payment-form');
    const amount = this.currentOrder.amount / 100;

    form.innerHTML = `
      <div class="payment-success">
        <div class="success-icon">
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="28" stroke="#10b981" stroke-width="2"/>
            <path d="M22 30L27 35L38 24" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        </div>
        <h3>Payment Successful!</h3>
        <p class="success-amount">₹${amount.toFixed(2)}</p>
        <p class="success-message">Your enrollment has been completed.</p>
        <p class="success-note">Redirecting to dashboard...</p>
      </div>
    `;

    // Close and redirect after 3 seconds
    setTimeout(() => {
      this.close();
      window.location.href = '/pages/student/dashboard.html';
    }, 3000);
  }

  close() {
    const overlay = document.getElementById('payment-modal-overlay');
    if (overlay) {
      overlay.remove();
    }
    this.isOpen = false;
  }

  // Toast notification helper
  showNotification(message, type = 'info', modal = null) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      z-index: 10001;
      animation: slideInRight 0.3s ease-out;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

