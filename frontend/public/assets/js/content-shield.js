// Content Shield - Protects sensitive project content
class ContentShield {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.watermarkText = options.watermarkText || 'Projexify™';
    this.blockDevTools = options.blockDevTools !== false;
    this.blockContextMenu = options.blockContextMenu !== false;
    this.blockCopy = options.blockCopy !== false;
    this.enableWatermark = options.enableWatermark !== false;
    
    if (this.enabled) {
      this.init();
    }
  }

  init() {
    this.blockF12();
    this.blockContextMenu();
    this.blockCopy();
    this.addWatermark();
    this.trackIP();
  }

  // Block F12 and dev tools keyboard shortcuts
  blockF12() {
    document.addEventListener('keydown', (e) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault();
        this.showWarning('Developer tools are disabled on this content');
      }
      // Ctrl+Shift+I
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        this.showWarning('Developer tools are disabled on this content');
      }
      // Ctrl+Shift+J
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        this.showWarning('Developer tools are disabled on this content');
      }
      // Ctrl+Shift+C
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.showWarning('Developer tools are disabled on this content');
      }
    });
  }

  // Block right-click context menu
  blockContextMenu() {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showWarning('Right-click is disabled on this content');
      return false;
    });
  }

  // Block copy/cut operations on sensitive content
  blockCopy() {
    const projectContent = document.querySelector('[data-protected="true"]');
    
    if (projectContent) {
      projectContent.addEventListener('copy', (e) => {
        e.preventDefault();
        this.showWarning('Copying is not allowed for this content');
      });

      projectContent.addEventListener('cut', (e) => {
        e.preventDefault();
        this.showWarning('Cutting is not allowed for this content');
      });

      projectContent.addEventListener('selectstart', (e) => {
        // Allow selection but track it
        this.logActivity('text-selected');
      });
    }
  }

  // Add dynamic watermark canvas
  addWatermark() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = 'rgba(79, 70, 229, 0.05)'; // Indigo with low opacity
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.transform(1, -0.3, 0, 1, 0, 0); // Slight skew
    
    for (let i = 0; i < 20; i++) {
      ctx.fillText(this.watermarkText, window.innerWidth / 2, (window.innerHeight / 4) * i);
    }
    
    const watermarkDiv = document.createElement('div');
    watermarkDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: url('${canvas.toDataURL()}');
      background-repeat: repeat;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.1;
    `;
    watermarkDiv.id = 'nexus-watermark';
    
    document.body.appendChild(watermarkDiv);
  }

  // Inject IP/Email watermark into content
  async injectDynamicWatermark() {
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      
      const userEmail = this.getUserEmail();
      const watermark = `Protected for ${userEmail} | IP: ${ipData.ip} | ${new Date().toLocaleString()}`;
      
      const projContent = document.querySelector('[data-protected="true"]');
      if (projContent) {
        const watermarkEl = document.createElement('div');
        watermarkEl.style.cssText = `
          position: fixed;
          bottom: 10px;
          right: 10px;
          background: rgba(0,0,0,0.7);
          color: #fff;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 11px;
          font-family: monospace;
          z-index: 10000;
        `;
        watermarkEl.textContent = watermark;
        document.body.appendChild(watermarkEl);
      }
    } catch (error) {
      console.log('Could not fetch IP for watermark');
    }
  }

  // Get user email from session/local storage
  getUserEmail() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.email || 'unknown@user.com';
  }

  // Show warning message
  showWarning(message) {
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f97316;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 10000;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    `;
    warning.textContent = message;
    document.body.appendChild(warning);
    
    setTimeout(() => warning.remove(), 3000);
  }

  // Log suspicious activities
  logActivity(action) {
    const logData = {
      action,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      user: this.getUserEmail(),
    };
    
    // Send to backend for audit trail
    fetch('/api/activity-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logData),
    }).catch(err => console.log('Activity logging skipped'));
  }

  // Blur sensitive content
  blurContent() {
    const sensitiveElements = document.querySelectorAll('[data-sensitive="true"]');
    sensitiveElements.forEach(el => {
      el.style.backdropFilter = 'blur(20px)';
      el.style.WebkitBackdropFilter = 'blur(20px)';
    });
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.contentShield = new ContentShield({
      enabled: true,
      watermarkText: 'Projexify™ - Protected Content',
    });
    window.contentShield.injectDynamicWatermark();
    window.contentShield.blurContent();
  });
} else {
  window.contentShield = new ContentShield({
    enabled: true,
    watermarkText: 'Projexify™ - Protected Content',
  });
  window.contentShield.injectDynamicWatermark();
  window.contentShield.blurContent();
}
