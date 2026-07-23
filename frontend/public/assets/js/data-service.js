/**
 * PROJEXIFY DATA SERVICE - API Communication Layer
 * Handles all backend communication, loading states, and error handling
 */

class NexusDataService {
  constructor() {
    this.baseURL = window.location.origin;
    this.apiPrefix = '/api';
    this.cache = new Map();
    this.pendingRequests = new Map();
  }

  /**
   * Get auth headers
   */
  getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${this.apiPrefix}${endpoint}`;
    
    // Default options
    const config = {
      method: options.method || 'GET',
      headers: this.getAuthHeaders(),
      ...options
    };

    // Add body if present
    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);
      
      // Handle different status codes
      if (response.status === 401) {
        // Unauthorized - redirect to login
        window.nexusRouter?.logout();
        throw new Error('Session expired. Please login again.');
      }
      
      if (response.status === 403) {
        throw new Error('You do not have permission to perform this action.');
      }
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ 
          message: `HTTP ${response.status}: ${response.statusText}` 
        }));
        throw new Error(error.message || 'Request failed');
      }

      // Parse response
      const data = await response.json();
      return data;
      
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  /**
   * GET request
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, { method: 'GET', ...options });
  }

  /**
   * POST request
   */
  async post(endpoint, body, options = {}) {
    return this.request(endpoint, { method: 'POST', body, ...options });
  }

  /**
   * PUT request
   */
  async put(endpoint, body, options = {}) {
    return this.request(endpoint, { method: 'PUT', body, ...options });
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, { method: 'DELETE', ...options });
  }

  // ============================================================
  // PROJECT ENDPOINTS
  // ============================================================

  /**
   * Get all projects with filters
   */
  async getProjects(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.category) params.append('category', filters.category);
    if (filters.difficulty) params.append('difficulty', filters.difficulty);
    if (filters.search) params.append('search', filters.search);
    if (filters.minPrice !== undefined) params.append('minPrice', filters.minPrice);
    if (filters.maxPrice !== undefined) params.append('maxPrice', filters.maxPrice);
    
    const queryString = params.toString();
    const endpoint = `/projects${queryString ? '?' + queryString : ''}`;
    
    return this.get(endpoint);
  }

  /**
   * Get single project by ID
   */
  async getProject(projectId) {
    return this.get(`/projects/${projectId}`);
  }

  /**
   * Create new project (mentor only)
   */
  async createProject(projectData) {
    return this.post('/projects', projectData);
  }

  /**
   * Update project
   */
  async updateProject(projectId, updates) {
    return this.put(`/projects/${projectId}`, updates);
  }

  /**
   * Delete project
   */
  async deleteProject(projectId) {
    return this.delete(`/projects/${projectId}`);
  }

  /**
   * Enroll in project (free or mock paid enrollment)
   */
  async enrollInProject(projectId, enrollmentType = 'solo', groupName = null) {
    return this.post(`/enrollment/free`, { projectId, enrollmentType, groupName });
  }

  /**
   * Get enrolled projects for student
   */
  async getEnrolledProjects() {
    return this.get('/enrollment/my-projects');
  }

  /**
   * Get enrollment status for a project
   */
  async getEnrollmentStatus(projectId) {
    return this.get(`/enrollment/status/${projectId}`);
  }

  /**
   * Add mentor to project
   */
  async addMentorToProject(projectId, mentorId) {
    return this.put(`/projects/${projectId}`, { mentor_id: mentorId });
  }

  // ============================================================
  // USER ENDPOINTS
  // ============================================================

  /**
   * Get users with filters (for directories)
   */
  async getUsers(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.role) params.append('role', filters.role);
    if (filters.expertise) params.append('expertise', filters.expertise);
    if (filters.search) params.append('search', filters.search);
    
    const queryString = params.toString();
    const endpoint = `/users${queryString ? '?' + queryString : ''}`;
    
    return this.get(endpoint);
  }

  /**
   * Get single user profile
   */
  async getUser(userId) {
    return this.get(`/users/${userId}`);
  }

  /**
   * Update user profile
   */
  async updateProfile(updates) {
    return this.put('/users/profile', updates);
  }

  // ============================================================
  // MENTOR ENDPOINTS
  // ============================================================

  /**
   * Get all mentors
   */
  async getMentors(filters = {}) {
    const params = new URLSearchParams();
    if (filters.centerId) params.append('centerId', filters.centerId);
    const qs = params.toString();
    return this.get(`/centers/mentor/list${qs ? `?${qs}` : ''}`);
  }

  /**
   * Get mentor's projects
   */
  async getMentorProjects(mentorId) {
    return this.get(`/mentors/${mentorId}/projects`);
  }

  // ============================================================
  // CENTER ENDPOINTS
  // ============================================================

  /**
   * Get all learning centers
   */
  async getCenters(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    const queryString = params.toString();
    const endpoint = `/centers${queryString ? '?' + queryString : ''}`;
    return this.get(endpoint);
  }

  /**
   * Get center details
   */
  async getCenter(centerId) {
    return this.get(`/centers/${centerId}`);
  }

  /**
   * Create new center registration
   */
  async registerCenter(centerData) {
    return this.post('/centers/register', centerData);
  }

  /**
   * Update center details
   */
  async updateCenter(centerId, updates) {
    return this.put(`/centers/${centerId}`, updates);
  }

  /**
   * Approve center registration (admin only)
   */
  async approveCenterRegistration(centerId, approved = true) {
    return this.put(`/centers/${centerId}/approve`, { approved });
  }

  /**
   * Get pending centers for approval (admin only)
   */
  async getPendingCenters() {
    return this.get('/centers/admin/pending');
  }

  // ============================================================
  // MILESTONE ENDPOINTS
  // ============================================================

  /**
   * Get milestones for a project
   */
  async getMilestones(projectId) {
    return this.get(`/projects/${projectId}/milestones`);
  }

  /**
   * Submit milestone
   */
  async submitMilestone(milestoneId, submission) {
    return this.post(`/milestones/${milestoneId}/submit`, submission);
  }

  /**
   * Grade milestone (mentor only)
   */
  async gradeMilestone(milestoneId, grade) {
    return this.post(`/milestones/${milestoneId}/grade`, grade);
  }

  // ============================================================
  // GROUP ENDPOINTS
  // ============================================================

  /**
   * Get user's groups
   */
  async getMyGroups() {
    return this.get('/groups/student/my-groups');
  }

  /**
   * Get groups for a project
   */
  async getProjectGroups(projectId) {
    return this.get(`/groups/${projectId}`);
  }

  /**
   * Create group
   */
  async createGroup(groupData) {
    return this.post('/groups', groupData);
  }

  /**
   * Update group details
   */
  async updateGroup(groupId, updates) {
    return this.put(`/groups/${groupId}`, updates);
  }

  /**
   * Add student to group
   */
  async addStudentToGroup(groupId, studentId) {
    return this.post(`/groups/${groupId}/students`, { studentId });
  }

  /**
   * Remove student from group
   */
  async removeStudentFromGroup(groupId, studentId) {
    return this.delete(`/groups/${groupId}/students/${studentId}`);
  }

  /**
   * Get group progress
   */
  async getGroupProgress(groupId) {
    return this.get(`/groups/${groupId}/progress`);
  }

  /**
   * Add funds to group wallet (if feature exists)
   */
  async addGroupFunds(groupId, amount) {
    return this.post(`/groups/${groupId}/wallet/add`, { amount });
  }

  /**
   * Withdraw from group wallet (if feature exists)
   */
  async withdrawGroupFunds(groupId, amount) {
    return this.post(`/groups/${groupId}/wallet/withdraw`, { amount });
  }

  // ============================================================
  // CERTIFICATE ENDPOINTS
  // ============================================================

  /**
   * Verify certificate by hash
   */
  async verifyCertificate(hash) {
    return this.get(`/certificates/verify/${hash}`);
  }

  /**
   * Get user's certificates
   */
  async getMyCertificates() {
    return this.get('/certificates/my');
  }

  // ============================================================
  // DASHBOARD ENDPOINTS
  // ============================================================

  /**
   * Get student dashboard data
   */
  async getStudentDashboard() {
    return this.get('/dashboard/student');
  }

  /**
   * Get mentor dashboard data
   */
  async getMentorDashboard() {
    return this.get('/dashboard/mentor');
  }

  /**
   * Get center dashboard data
   */
  async getCenterDashboard() {
    return this.get('/dashboard/center');
  }

  /**
   * Get admin dashboard data
   */
  async getAdminDashboard() {
    return this.get('/dashboard/admin');
  }

  // ============================================================
  // AUTH ENDPOINTS
  // ============================================================

  /**
   * Login
   */
  async login(email, password) {
    return this.post('/auth/login', { email, password });
  }

  /**
   * Register
   */
  async register(userData) {
    return this.post('/auth/register', userData);
  }

  /**
   * Validate token
   */
  async validateToken() {
    return this.get('/auth/validate');
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Upload file
   */
  async uploadFile(file, type = 'document') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const token = localStorage.getItem('authToken');
    const response = await fetch(`${this.baseURL}${this.apiPrefix}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    return response.json();
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// ============================================================
// UI HELPER FUNCTIONS
// ============================================================

/**
 * Show loading skeleton
 */
function showLoading(containerId, type = 'card') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const skeletonTemplates = {
    card: `
      <div class="skeleton skeleton-card"></div>
    `,
    list: `
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text" style="width: 80%"></div>
      <div class="skeleton skeleton-text" style="width: 60%"></div>
    `,
    grid: `
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    `
  };

  container.innerHTML = skeletonTemplates[type] || skeletonTemplates.card;
}

/**
 * Show empty state
 */
function showEmptyState(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const {
    icon = '📭',
    title = 'No items found',
    description = 'Try adjusting your filters or search query.',
    actionText = null,
    actionCallback = null
  } = options;

  const actionButton = actionText && actionCallback ? `
    <button class="btn-primary empty-state-action">
      ${actionText}
    </button>
  ` : '';

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h3 class="empty-state-title">${title}</h3>
      <p class="empty-state-description">${description}</p>
      ${actionButton}
    </div>
  `;

  if (actionText && actionCallback) {
    const btn = container.querySelector('.empty-state-action');
    if (btn) {
      btn.addEventListener('click', actionCallback);
    }
  }
}

/**
 * Show error message
 */
function showError(containerId, error) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const errorMessage = error.message || 'An unexpected error occurred';

  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <h3 class="empty-state-title">Something went wrong</h3>
      <p class="empty-state-description">${errorMessage}</p>
      <button class="btn-primary reload-btn">
        Reload Page
      </button>
    </div>
  `;

  const reloadBtn = container.querySelector('.reload-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => window.location.reload());
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const colors = {
    success: 'var(--color-success)',
    error: 'var(--color-danger)',
    warning: 'var(--color-warning)',
    info: 'var(--color-info)'
  };

  const toast = document.createElement('div');
  toast.className = 'toast-notification glass-elevated';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    z-index: 9999;
    max-width: 400px;
    border-left: 4px solid ${colors[type]};
    animation: slideInRight 0.3s ease;
  `;
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

/**
 * Debounce function for search inputs
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Format currency
 */
function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format date
 */
function formatDate(date, format = 'short') {
  const d = new Date(date);
  
  if (format === 'relative') {
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }
  
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: format === 'long' ? 'long' : 'short',
    day: 'numeric'
  });
}

// Add CSS animations for toasts
if (!document.getElementById('toast-animations')) {
  const style = document.createElement('style');
  style.id = 'toast-animations';
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
  `;
  document.head.appendChild(style);
}

// Global instance
window.nexusData = new NexusDataService();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NexusDataService,
    showLoading,
    showEmptyState,
    showError,
    showToast,
    debounce,
    formatCurrency,
    formatDate
  };
}
