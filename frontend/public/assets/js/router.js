/**
 * PROJEXIFY ROUTER - Centralized Navigation & Auth Guard
 * Handles role-based routing, active state tracking, and auth validation
 */

class NexusRouter {
  constructor() {
    this.currentUser = null;
    this.authToken = null;
    this.initialized = false;
    
    // Route configurations with role restrictions
    this.routes = {
      // Public routes
      '/': { public: true, title: 'Projexify - Home' },
      '/login.html': { public: true, title: 'Login' },
      '/index.html': { public: true, title: 'Projexify - Home' },
      '/marketplace.html': { public: true, title: 'Project Marketplace' },
      '/pages/centers-directory.html': { public: true, title: 'Learning Centers' },
      '/pages/mentor-directory.html': { public: true, title: 'Find Mentors' },
      '/pages/project-details.html': { public: true, title: 'Project Details' },
      '/pages/verify-certificate.html': { public: true, title: 'Verify Certificate' },
      
      // Student routes
      '/pages/student/dashboard.html': { roles: ['student'], title: 'Student Dashboard' },
      '/pages/student/group-manager.html': { roles: ['student'], title: 'Group Manager' },
      '/pages/virtual-lab.html': { roles: ['student', 'mentor'], title: 'Virtual Lab' },
      
      // Mentor routes
      '/pages/mentor/dashboard.html': { roles: ['mentor'], title: 'Mentor Dashboard' },
      
      // Center routes
      '/pages/center/dashboard.html': { roles: ['center'], title: 'Center Dashboard' },
      
      // Admin routes
      '/pages/admin/dashboard.html': { roles: ['admin'], title: 'Admin Dashboard' }
    };
    
    this.init();
  }

  /**
   * Initialize the router
   */
  async init() {
    if (this.initialized) return;
    
    // Check for existing session
    await this.checkAuth();
    
    // Set up navigation listeners
    this.setupNavigationListeners();
    
    // Mark active nav items
    this.updateActiveNavigation();
    
    // Protect current route if needed
    this.protectCurrentRoute();
    
    this.initialized = true;
    
    console.log('🔗 NexusRouter initialized', {
      authenticated: !!this.currentUser,
      role: this.currentUser?.role,
      currentPath: window.location.pathname
    });
  }

  /**
   * Check authentication status
   */
  async checkAuth() {
    try {
      // Check localStorage for auth token
      this.authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      if (!this.authToken) {
        this.currentUser = null;
        return false;
      }

      // Validate token with backend
      // Backend exposes /api/auth/me (not /api/auth/validate)
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // Token invalid, clear it
        this.logout();
        return false;
      }

      const data = await response.json();
      // Normalize backend user shape: roles[] -> role
      const roles = data?.user?.roles || [];
      const role = Array.isArray(roles) ? roles[0] : roles;
      this.currentUser = {
        ...data.user,
        role
      };

      // Persist normalized user for UI modules that read localStorage.user
      localStorage.setItem('user', JSON.stringify(this.currentUser));
      localStorage.setItem('token', this.authToken);

      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      return false;
    }
  }

  /**
   * Get the role-specific dashboard path
   */
  getDashboardPath(role) {
    const dashboardPaths = {
      'student': '/pages/student/dashboard.html',
      'mentor': '/pages/mentor/dashboard.html',
      'center': '/pages/center/dashboard.html',
      'admin': '/pages/admin/dashboard.html'
    };
    return dashboardPaths[role] || '/marketplace.html';
  }

  /**
   * Check if user has access to a route
   */
  hasAccess(path) {
    const route = this.routes[path];
    
    // Route doesn't exist
    if (!route) return false;
    
    // Public route - always accessible
    if (route.public) return true;
    
    // Protected route - need auth
    if (!this.currentUser) return false;
    
    // Check role requirements
    if (route.roles && !route.roles.includes(this.currentUser.role)) {
      return false;
    }
    
    return true;
  }

  /**
   * Protect the current route - redirect if unauthorized
   */
  protectCurrentRoute() {
    const currentPath = window.location.pathname;
    const normalizedPath = this.normalizePath(currentPath);
    
    if (!this.hasAccess(normalizedPath)) {
      console.warn('🚫 Access denied to:', normalizedPath);
      
      if (!this.currentUser) {
        // Not logged in - go to login
        this.navigate('/login.html', { 
          redirect: currentPath,
          message: 'Please log in to access this page'
        });
      } else {
        // Logged in but wrong role - go to their dashboard
        const dashboardPath = this.getDashboardPath(this.currentUser.role);
        this.navigate(dashboardPath, {
          message: 'You do not have permission to access that page'
        });
      }
    }
  }

  /**
   * Navigate to a new page
   */
  navigate(path, options = {}) {
    // Normalize path
    const targetPath = this.normalizePath(path);
    
    // Check access
    if (!this.hasAccess(targetPath)) {
      console.warn('🚫 Navigation blocked:', targetPath);
      return false;
    }

    // Build URL with query params if needed
    let url = targetPath;
    if (options.redirect) {
      url += `?redirect=${encodeURIComponent(options.redirect)}`;
    }
    if (options.message) {
      sessionStorage.setItem('flashMessage', options.message);
    }

    // Navigate
    window.location.href = url;
    return true;
  }

  /**
   * Handle login success
   */
  handleLoginSuccess(user, token) {
    this.currentUser = user;
    this.authToken = token;
    
    // Store auth token
    localStorage.setItem('authToken', token);
    localStorage.setItem('userRole', user.role);
    localStorage.setItem('userId', user._id);
    
    // Check for redirect
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    
    if (redirect && this.hasAccess(redirect)) {
      this.navigate(redirect);
    } else {
      // Go to role-specific dashboard
      const dashboardPath = this.getDashboardPath(user.role);
      this.navigate(dashboardPath);
    }
  }

  /**
   * Logout user
   */
  logout() {
    this.currentUser = null;
    this.authToken = null;
    
    // Clear storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    sessionStorage.clear();
    
    // Redirect to login
    window.location.href = '/login.html';
  }

  /**
   * Set up event listeners for navigation
   */
  setupNavigationListeners() {
    // Intercept all link clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      
      if (!link) return;
      
      const href = link.getAttribute('href');
      
      // Skip external links and hash links
      if (href.startsWith('http') || href.startsWith('#')) return;
      
      // Skip if it's a download link
      if (link.hasAttribute('download')) return;
      
      // Check if we should intercept this navigation
      const normalizedHref = this.normalizePath(href);
      
      if (this.routes[normalizedHref]) {
        // Only intercept if we need to check permissions
        const route = this.routes[normalizedHref];
        
        if (!route.public && !this.hasAccess(normalizedHref)) {
          e.preventDefault();
          this.navigate(normalizedHref);
        }
      }
    });

    // Handle logout buttons
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-action="logout"]') || 
          e.target.closest('[data-action="logout"]')) {
        e.preventDefault();
        this.logout();
      }
    });

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      this.protectCurrentRoute();
      this.updateActiveNavigation();
    });
  }

  /**
   * Update active navigation items
   */
  updateActiveNavigation() {
    const currentPath = window.location.pathname;
    
    // Remove all active classes
    document.querySelectorAll('.nav-link.active, [data-nav-link].active')
      .forEach(link => link.classList.remove('active'));
    
    // Find and mark matching nav links
    document.querySelectorAll('.nav-link, [data-nav-link]').forEach(link => {
      const href = link.getAttribute('href');
      
      if (!href) return;
      
      // Exact match
      if (href === currentPath) {
        link.classList.add('active');
        return;
      }
      
      // Partial match for dashboard sections
      if (currentPath.includes(href) && href.length > 1) {
        link.classList.add('active');
      }
      
      // Role-based matching (e.g., all student pages)
      if (this.currentUser) {
        const role = this.currentUser.role;
        if (currentPath.includes(`/${role}/`) && href.includes(`/${role}/`)) {
          link.classList.add('active');
        }
      }
    });
  }

  /**
   * Normalize path for comparison
   */
  normalizePath(path) {
    // Remove leading slash if path starts with /frontend/public
    if (path.startsWith('/frontend/public')) {
      path = path.replace('/frontend/public', '');
    }
    
    // Ensure leading slash
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    
    // Convert index.html to /
    if (path === '/index.html') {
      path = '/';
    }
    
    return path;
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.currentUser;
  }

  /**
   * Check if user has a specific role
   */
  hasRole(role) {
    return this.currentUser?.role === role;
  }

  /**
   * Display flash messages
   */
  showFlashMessage() {
    const message = sessionStorage.getItem('flashMessage');
    
    if (message) {
      // Create toast notification
      const toast = document.createElement('div');
      toast.className = 'toast-notification glass-elevated';
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        z-index: 9999;
        max-width: 400px;
        animation: slideInRight 0.3s ease;
      `;
      toast.textContent = message;
      
      document.body.appendChild(toast);
      
      // Remove after 5 seconds
      setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 5000);
      
      // Clear the message
      sessionStorage.removeItem('flashMessage');
    }
  }
}

// Global instance
window.nexusRouter = new NexusRouter();

// Show flash messages on page load
document.addEventListener('DOMContentLoaded', () => {
  window.nexusRouter.showFlashMessage();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NexusRouter;
}
