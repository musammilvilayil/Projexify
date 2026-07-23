/**
 * UI Manager - Handles consistent Navbar and Footer across all pages
 */

class UIManager {
  constructor(options = {}) {
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    this.notificationCheckInterval = null;
    this.lastNotificationFetch = 0; // Track last notification fetch time for throttling
    this.cachedNotifications = [];
    this.enableNotifications = options.enableNotifications !== false; // Enable by default, allow opt-out
    this.init();
  }

  init() {
    this.renderNavbar();
    this.renderFooter();
    this.setActiveNavLink();
    
    // Initialize notifications if user is logged in AND notifications are enabled
    // Add delay to ensure API client is fully initialized
    if (this.user && this.enableNotifications) {
      setTimeout(() => {
        const token = localStorage.getItem('token');
        if (token) {
          this.initNotifications();
        }
      }, 500);
    }
  }

  renderNavbar() {
    const nav = document.querySelector('nav.glass-nav') || document.createElement('nav');
    nav.className = 'glass-nav';
    
    let navLinks = `
      <a href="/" class="nav-link" data-path="/">Home</a>
      <a href="/marketplace.html" class="nav-link" data-path="/marketplace.html">Marketplace</a>
      <a href="/pages/centers-directory.html" class="nav-link" data-path="/pages/centers-directory.html">Centers</a>
      <a href="/pages/mentor-directory.html" class="nav-link" data-path="/pages/mentor-directory.html">Mentors</a>
    `;

    let authSection = '';

    if (this.user) {
      // Add role-specific links
      if (this.user.roles.includes('student')) {
        navLinks += `<a href="/pages/student/dashboard.html" class="nav-link" data-path="/pages/student/dashboard.html">My Learning</a>`;
      } else if (this.user.roles.includes('center_admin')) {
        navLinks += `<a href="/pages/center/dashboard.html" class="nav-link" data-path="/pages/center/dashboard.html">Center Admin</a>`;
      } else if (this.user.roles.includes('mentor')) {
        navLinks += `<a href="/pages/mentor/dashboard.html" class="nav-link" data-path="/pages/mentor/dashboard.html">Mentor Panel</a>`;
      } else if (this.user.roles.includes('admin')) {
        navLinks += `<a href="/pages/admin/dashboard.html" class="nav-link" data-path="/pages/admin/dashboard.html">Platform Admin</a>`;
      }

      authSection = `
        <div class="auth-user-info">
          <div id="notificationBell" style="position: relative; cursor: pointer; margin-right: 1rem;">
            <span style="font-size: 1.5rem;">🔔</span>
            <span id="notificationBadge" style="display: none; position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; border-radius: 50%; width: 18px; height: 18px; font-size: 0.7rem; display: flex; align-items: center; justify-content: center; font-weight: 700;">0</span>
          </div>
          <span class="user-name">Hi, ${this.user.firstName || this.user.email || 'User'}</span>
          <button id="logoutBtn" class="btn btn-glass btn-sm">Logout</button>
        </div>
      `;
    } else {
      authSection = `
        <a href="/login.html" class="btn btn-primary btn-sm">Sign In</a>
      `;
    }

    nav.innerHTML = `
      <div class="container nav-container">
        <a href="/" class="nav-logo">
          <img src="/assets/images/nexus-logo.svg" alt="Projexify" style="width: 5rem; height: 5rem;">
          <span class="aurora-text">Projexify</span>
        </a>
        
        <button class="mobile-toggle" aria-label="Toggle Menu">
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div class="nav-menu">
          <div class="nav-links">
            ${navLinks}
          </div>
          <div class="nav-auth">
            ${authSection}
          </div>
        </div>
      </div>
    `;

    if (!document.querySelector('nav.glass-nav')) {
      document.body.prepend(nav);
    }

    // Add event listener for mobile toggle
    const toggle = nav.querySelector('.mobile-toggle');
    const menu = nav.querySelector('.nav-menu');
    if (toggle) {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        menu.classList.toggle('active');
      });
    }

    // Add event listener for logout button
    const logoutBtn = nav.querySelector('#logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.logout();
      });
    }
  }

  renderFooter() {
    if (document.querySelector('footer')) return;

    const footer = document.createElement('footer');
    footer.style.cssText = 'text-align: center; padding: 4rem 0; margin-top: 8rem; border-top: 1px solid var(--glass-border); color: var(--text-dim);';
    footer.innerHTML = `
      <div class="container">
        <p>&copy; 2026 Projexify. All rights reserved. | <a href="/pages/privacy-policy.html" style="color: var(--primary); text-decoration: none;">Privacy Policy</a> | <a href="/pages/terms-of-service.html" style="color: var(--primary); text-decoration: none;">Terms of Service</a></p>
      </div>
    `;
    
    // Find the main container to append footer to, or just append to body
    const mainContent = document.querySelector('main') || document.querySelector('.main-content') || document.body;
    mainContent.appendChild(footer);
  }

  setActiveNavLink() {
    const currentPath = window.location.pathname;
    const links = document.querySelectorAll('.nav-link');
    
    links.forEach(link => {
      link.classList.remove('active');
      const path = link.getAttribute('data-path');
      
      // Exact match for home
      if (path === '/' && currentPath === '/') {
        link.classList.add('active');
        link.style.color = 'var(--text-main)';
        link.style.fontWeight = '700';
      }
      // Prefix match for other pages (but not for home)
      else if (path !== '/' && currentPath.startsWith(path)) {
        link.classList.add('active');
        link.style.color = 'var(--text-main)';
        link.style.fontWeight = '700';
      }
      else {
        link.style.color = 'var(--text-muted)';
        link.style.fontWeight = '500';
      }
      
      link.style.textDecoration = 'none';
      link.style.transition = 'var(--transition)';
    });
  }

  /**
   * Show a toast notification with glassmorphism design
   * @param {string} message - Message to display
   * @param {string} type - Type of notification: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Duration in milliseconds (default: 4000)
   */
  showToast(message, type = 'info', duration = 4000) {
    // Inject toast styles if not already present
    if (!document.getElementById('toast-styles')) {
      const style = document.createElement('style');
      style.id = 'toast-styles';
      style.textContent = `
        @keyframes slideInRight {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(400px);
            opacity: 0;
          }
        }
        .toast-container {
          position: fixed;
          top: 80px;
          right: 20px;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: none;
        }
        .toast {
          min-width: 300px;
          max-width: 450px;
          padding: 16px 20px;
          border-radius: 12px;
          color: white;
          font-weight: 600;
          font-size: 0.95rem;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          animation: slideInRight 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          display: flex;
          align-items: center;
          gap: 12px;
          pointer-events: auto;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .toast.closing {
          animation: slideOutRight 0.3s ease-out forwards;
        }
        .toast-icon {
          font-size: 1.3rem;
          flex-shrink: 0;
        }
        .toast-message {
          flex: 1;
          line-height: 1.4;
        }
        .toast-success {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%);
        }
        .toast-error {
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%);
        }
        .toast-warning {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.95) 0%, rgba(217, 119, 6, 0.95) 100%);
        }
        .toast-info {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(37, 99, 235, 0.95) 100%);
        }
        @media (max-width: 768px) {
          .toast-container {
            right: 10px;
            left: 10px;
            top: 70px;
          }
          .toast {
            min-width: auto;
            max-width: 100%;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Create toast container if it doesn't exist
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    // Icon mapping
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ⓘ'
    };

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
      toast.classList.add('closing');
      setTimeout(() => {
        toast.remove();
        // Remove container if empty
        if (container.children.length === 0) {
          container.remove();
        }
      }, 300);
    }, duration);
  }

  /**
   * Show loading overlay with spinner
   * @param {string} message - Loading message (default: 'Loading...')
   */
  showLoading(message = 'Loading...') {
    // Inject loading styles if not present
    if (!document.getElementById('loading-styles')) {
      const style = document.createElement('style');
      style.id = 'loading-styles';
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 99999;
          animation: fadeIn 0.2s ease;
        }
        .loading-content {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          padding: 2.5rem 3rem;
          border-radius: 16px;
          text-align: center;
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        .loading-spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255, 255, 255, 0.2);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 1rem;
        }
        .loading-text {
          color: white;
          font-size: 1.1rem;
          font-weight: 600;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    // Remove existing loading overlay if present
    this.hideLoading();

    // Create loading overlay
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'app-loading-overlay';
    overlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <div class="loading-text">${message}</div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  /**
   * Hide loading overlay
   */
  hideLoading() {
    const overlay = document.getElementById('app-loading-overlay');
    if (overlay) {
      overlay.style.animation = 'fadeOut 0.2s ease';
      setTimeout(() => overlay.remove(), 200);
    }
  }

  logout() {
    // Clear notification interval
    if (this.notificationCheckInterval) {
      clearInterval(this.notificationCheckInterval);
    }
    
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = '/';
  }
  
  /**
   * Initialize notification system
   * Fetches notifications and shows badge count
   */
  async initNotifications() {
    try {
      // Initial fetch
      await this.fetchNotifications();
      
      // Poll for new notifications every 60 seconds (increased from 30s to reduce rate limiting)
      this.notificationCheckInterval = setInterval(() => {
        this.fetchNotifications();
      }, 60000);

      // Wait for navbar to be rendered, then add the dropdown
      const waitForNavbar = setInterval(() => {
        const bellElement = document.getElementById('notificationBell');
        if (bellElement) {
          clearInterval(waitForNavbar);
          bellElement.addEventListener('click', () => this.toggleNotificationDropdown());
          
          // Create notification dropdown
          this.createNotificationDropdown();
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => clearInterval(waitForNavbar), 5000);
      
    } catch (error) {
      console.error('[UIManager] Error initializing notifications:', error);
    }
  }
  
  /**
   * Fetch notifications from API with throttling
   */
  async fetchNotifications() {
    try {
      // Check if token exists before attempting fetch
      const token = localStorage.getItem('token');
      if (!token || !window.api || !window.api.getNotifications) {
        return; // No token or API not loaded yet
      }
      
      // Throttle notification fetches - only fetch if last fetch was > 10 seconds ago
      const now = Date.now();
      if (this.lastNotificationFetch && (now - this.lastNotificationFetch) < 10000) {
        return; // Skip this fetch, too soon
      }
      
      this.lastNotificationFetch = now;
      
      // Mark as non-critical to prevent auto-logout on failure
      const response = await window.api.request('/notifications', {
        method: 'GET',
        headers: { 'X-Non-Critical-Request': 'true' }
      });
      
      // Handle both array response and object with notifications property
      const notifications = Array.isArray(response) ? response : (response.notifications || []);
      const unreadCount = notifications.filter(n => !n.read).length;
      
      // Check for new session notifications
      const sessionNotifications = notifications.filter(n => 
        (n.type === 'session_started' || n.type === 'session_notification') && !n.read
      );
      
      if (sessionNotifications.length > 0 && this.cachedNotifications.length < notifications.length) {
        // New session notification received - show toast
        for (const notif of sessionNotifications) {
          this.showSessionNotificationToast(notif);
        }
      }
      
      this.updateNotificationBadge(unreadCount);
      this.cachedNotifications = notifications;
      
    } catch (error) {
      console.error('[UIManager] Error fetching notifications:', error);
    }
  }
  
  /**
   * Show a session notification toast
   */
  showSessionNotificationToast(notif) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 1.5rem;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(16, 185, 129, 0.3);
      z-index: 10000;
      max-width: 400px;
      animation: slideInRight 0.3s ease-out;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      cursor: pointer;
    `;
    
    toast.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 0.5rem; font-size: 1rem;">🎬 ${notif.title}</div>
      <div style="font-size: 0.9rem; margin-bottom: 1rem; opacity: 0.95;">${notif.message}</div>
      <button style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%;">
        Join Session →
      </button>
    `;
    
    document.body.appendChild(toast);
    
    // Handle button click
    const btn = toast.querySelector('button');
    if (btn && notif.actionUrl) {
      btn.addEventListener('click', () => {
        window.location.href = notif.actionUrl;
      });
    }
    
    // Auto remove after 10 seconds
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, 10000);
  }
  
  /**
   * Update notification badge count
   */
  updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }
  
  /**
   * Create notification dropdown element
   */
  createNotificationDropdown() {
    const existing = document.getElementById('notificationDropdown');
    if (existing) return;
    
    const dropdown = document.createElement('div');
    dropdown.id = 'notificationDropdown';
    dropdown.style.cssText = `
      display: none;
      position: fixed;
      top: 70px;
      right: 20px;
      width: 400px;
      max-width: 90vw;
      max-height: 500px;
      background: rgba(26, 27, 38, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 1rem;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(20px);
      overflow: hidden;
      z-index: 9999;
      animation: slideInRight 0.3s ease-out;
    `;
    
    dropdown.innerHTML = `
      <div style="padding: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700;">🔔 Notifications</h3>
        <button id="markAllReadBtn" style="background: none; border: none; color: var(--primary); cursor: pointer; font-size: 0.85rem; font-weight: 600; padding: 0.25rem 0.5rem;">Mark all read</button>
      </div>
      <div id="notificationList" style="max-height: 400px; overflow-y: auto; padding: 0.5rem;">
        <p style="text-align: center; color: var(--text-muted); padding: 2rem;">Loading notifications...</p>
      </div>
    `;
    
    document.body.appendChild(dropdown);
    
    // Add event listeners
    document.getElementById('markAllReadBtn').addEventListener('click', () => this.markAllNotificationsRead());
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('notificationDropdown');
      const bell = document.getElementById('notificationBell');
      if (dropdown && bell && !dropdown.contains(e.target) && !bell.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }
  
  /**
   * Toggle notification dropdown visibility
   */
  toggleNotificationDropdown() {
    const dropdown = document.getElementById('notificationDropdown');
    if (!dropdown) return;
    
    if (dropdown.style.display === 'none' || dropdown.style.display === '') {
      dropdown.style.display = 'block';
      this.renderNotifications();
    } else {
      dropdown.style.display = 'none';
    }
  }
  
  /**
   * Render notifications in dropdown
   */
  renderNotifications() {
    const listContainer = document.getElementById('notificationList');
    if (!listContainer) return;
    
    const notifications = this.cachedNotifications || [];
    
    if (notifications.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;">🔕</div>
          <p>No notifications yet</p>
        </div>
      `;
      return;
    }
    
    listContainer.innerHTML = notifications.map(notif => {
      const icon = this.getNotificationIcon(notif.type);
      const time = this.formatNotificationTime(notif.createdAt);
      const bgColor = notif.read ? 'rgba(255,255,255,0.02)' : 'rgba(99,102,241,0.1)';
      const borderLeft = notif.read ? 'transparent' : 'var(--primary)';
      
      // Check if this is a session notification with an action URL
      const isSessionNotification = notif.type === 'session_started' || notif.type === 'session_notification';
      const hasActionUrl = notif.actionUrl && isSessionNotification;
      
      return `
        <div class="notification-item" data-id="${notif._id}" data-action-url="${notif.actionUrl || ''}" style="padding: 1rem; margin-bottom: 0.5rem; background: ${bgColor}; border-left: 3px solid ${borderLeft}; border-radius: 0.5rem; cursor: pointer; transition: var(--transition); ${hasActionUrl ? 'border: 2px solid rgba(16, 185, 129, 0.5);' : ''}">
          <div style="display: flex; gap: 0.75rem;">
            <div style="font-size: 1.5rem; flex-shrink: 0;">${icon}</div>
            <div style="flex: 1;">
              <p style="margin: 0 0 0.25rem 0; font-weight: 600; font-size: 0.9rem; color: var(--text-main);">${notif.title || notif.message}</p>
              ${notif.message && notif.message !== notif.title ? `<p style="margin: 0 0 0.5rem 0; font-size: 0.85rem; color: var(--text-muted);">${notif.message}</p>` : ''}
              <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted);">${time}</p>
              ${hasActionUrl ? `<button style="margin-top: 0.5rem; padding: 0.4rem 0.8rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">Join Session →</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers
    listContainer.querySelectorAll('.notification-item').forEach(item => {
      const actionUrl = item.getAttribute('data-action-url');
      const notifId = item.getAttribute('data-id');
      
      // Check if there's a Join Session button
      const joinBtn = item.querySelector('button');
      if (joinBtn) {
        joinBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.markNotificationRead(notifId);
          if (actionUrl) {
            window.location.href = actionUrl;
          }
        });
      } else {
        // Generic notification click - just mark as read
        item.addEventListener('click', async () => {
          await this.markNotificationRead(notifId);
        });
      }
    });
  }
  
  /**
   * Get icon for notification type
   */
  getNotificationIcon(type) {
    const icons = {
      enrollment: '📚',
      mentor_assigned: '👨‍🏫',
      session_scheduled: '📅',
      session_started: '🎬',
      session_ended: '⏹️',
      session_notification: '🎬',
      session_reminder: '⏰',
      milestone_completed: '🎯',
      project_completed: '🎉',
      feedback_received: '💬',
      payment_received: '💰',
      general: '📢'
    };
    return icons[type] || '🔔';
  }
  
  /**
   * Format notification time
   */
  formatNotificationTime(timestamp) {
    const now = new Date();
    const notifTime = new Date(timestamp);
    const diffMs = now - notifTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return notifTime.toLocaleDateString();
  }
  
  /**
   * Mark single notification as read
   */
  async markNotificationRead(notificationId) {
    try {
      await window.api.markNotificationAsRead(notificationId);
      await this.fetchNotifications();
      this.renderNotifications();
    } catch (error) {
      console.error('[UIManager] Error marking notification as read:', error);
    }
  }
  
  /**
   * Mark all notifications as read
   */
  async markAllNotificationsRead() {
    try {
      await window.api.markAllNotificationsAsRead();
      await this.fetchNotifications();
      this.renderNotifications();
    } catch (error) {
      console.error('[UIManager] Error marking all notifications as read:', error);
    }
  }
}

// Initialize UI Manager
const uiManager = new UIManager();
