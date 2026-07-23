// Form Validation Utility
class FormValidator {
  constructor() {
    this.rules = {
      required: (value) => value.trim() !== '',
      email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      password: (value) => value.length >= 8,
      phone: (value) => /^[\d\s\-\+\(\)]+$/.test(value) && value.replace(/\D/g, '').length >= 10,
      url: (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      number: (value) => !isNaN(parseFloat(value)) && isFinite(value),
      minLength: (value, min) => value.length >= min,
      maxLength: (value, max) => value.length <= max,
      pattern: (value, regex) => new RegExp(regex).test(value),
      match: (value, matchValue) => value === matchValue
    };

    this.messages = {
      required: 'This field is required',
      email: 'Please enter a valid email address',
      password: 'Password must be at least 8 characters long',
      phone: 'Please enter a valid phone number',
      url: 'Please enter a valid URL',
      number: 'Please enter a valid number',
      minLength: (min) => `Must be at least ${min} characters`,
      maxLength: (max) => `Must not exceed ${max} characters`,
      pattern: 'Invalid format',
      match: 'Fields do not match'
    };
  }

  // Validate a single field
  validateField(input, rules = {}) {
    const value = input.value;
    const errors = [];

    // Check each rule
    for (const [rule, param] of Object.entries(rules)) {
      if (this.rules[rule]) {
        const isValid = typeof param === 'boolean' && param
          ? this.rules[rule](value)
          : this.rules[rule](value, param);

        if (!isValid) {
          const message = typeof this.messages[rule] === 'function'
            ? this.messages[rule](param)
            : this.messages[rule];
          errors.push(message);
          break; // Show only first error
        }
      }
    }

    return errors;
  }

  // Show error message
  showError(input, message) {
    // Remove existing error
    this.clearError(input);

    // Add error class to input
    input.classList.add('error');

    // Create error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'validation-error';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      color: #ef4444;
      font-size: 0.875rem;
      margin-top: 0.25rem;
      animation: slideDown 0.2s ease;
    `;

    // Insert error message after input
    input.parentNode.insertBefore(errorDiv, input.nextSibling);

    // Add shake animation to input
    input.style.animation = 'shake 0.3s ease';
    setTimeout(() => {
      input.style.animation = '';
    }, 300);
  }

  // Clear error message
  clearError(input) {
    input.classList.remove('error');
    const existingError = input.parentNode.querySelector('.validation-error');
    if (existingError) {
      existingError.remove();
    }
  }

  // Validate entire form
  validateForm(form, validationRules) {
    let isValid = true;
    const errors = {};

    // Validate each field
    for (const [fieldName, rules] of Object.entries(validationRules)) {
      const input = form.querySelector(`[name="${fieldName}"]`);
      if (!input) continue;

      const fieldErrors = this.validateField(input, rules);
      if (fieldErrors.length > 0) {
        isValid = false;
        errors[fieldName] = fieldErrors;
        this.showError(input, fieldErrors[0]);
      } else {
        this.clearError(input);
      }
    }

    return { isValid, errors };
  }

  // Add real-time validation to input
  addRealTimeValidation(input, rules) {
    // Validate on blur
    input.addEventListener('blur', () => {
      const errors = this.validateField(input, rules);
      if (errors.length > 0) {
        this.showError(input, errors[0]);
      } else {
        this.clearError(input);
        input.classList.add('success');
      }
    });

    // Clear error on focus
    input.addEventListener('focus', () => {
      this.clearError(input);
      input.classList.remove('success');
    });

    // Live validation while typing (debounced)
    let timeout;
    input.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const errors = this.validateField(input, rules);
        if (input.value.length > 0 && errors.length === 0) {
          input.classList.add('success');
        } else {
          input.classList.remove('success');
        }
      }, 500);
    });
  }

  // Initialize form validation
  init(formId, validationRules) {
    const form = document.getElementById(formId);
    if (!form) return;

    // Add CSS for validation states
    this.injectStyles();

    // Add real-time validation to all fields
    for (const [fieldName, rules] of Object.entries(validationRules)) {
      const input = form.querySelector(`[name="${fieldName}"]`);
      if (input) {
        this.addRealTimeValidation(input, rules);
      }
    }

    // Handle form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const { isValid } = this.validateForm(form, validationRules);
      
      if (isValid && form.onvalidsubmit) {
        form.onvalidsubmit(e);
      }
    });

    return form;
  }

  // Inject validation styles
  injectStyles() {
    if (document.getElementById('validator-styles')) return;

    const style = document.createElement('style');
    style.id = 'validator-styles';
    style.textContent = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-5px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      input.error, textarea.error, select.error {
        border-color: #ef4444 !important;
        background-color: rgba(239, 68, 68, 0.05) !important;
      }

      input.success, textarea.success, select.success {
        border-color: #10b981 !important;
      }

      input.success:focus, textarea.success:focus, select.success:focus {
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1) !important;
      }

      input.error:focus, textarea.error:focus, select.error:focus {
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Sanitize input (XSS prevention)
  sanitize(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }
}

// Export for use in other scripts
window.FormValidator = FormValidator;
