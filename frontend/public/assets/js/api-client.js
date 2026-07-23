// API Client - Centralized API communication
class APIClient {
  constructor(baseURL = '/api') {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('token');
    this.requestQueue = {}; // Track pending requests to prevent duplicates
    this.retryConfig = {
      maxRetries: 3,
      initialDelay: 1000, // 1 second
      maxDelay: 10000, // 10 seconds
    };
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  getAuthHeader() {
    return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
  }

  /**
   * Check if user is properly authenticated
   * @returns {boolean} True if user has valid token and user data
   */
  isAuthenticated() {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    const user = localStorage.getItem('user');

    // Update instance token if it exists in localStorage but not in instance
    if (token && !this.token) {
      this.token = token;
      localStorage.setItem('token', token);
    }

    return !!(token && user);
  }

  /**
   * Safely check authentication and redirect if not authenticated
   * @param {string} redirectUrl - URL to redirect to if not authenticated
   * @returns {boolean} True if authenticated
   */
  requireAuth(redirectUrl = '/login.html') {
    if (!this.isAuthenticated()) {
      window.location.href = redirectUrl;
      return false;
    }
    return true;
  }

  /**
   * Delay utility for retries
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get exponential backoff delay
   */
  getBackoffDelay(attempt) {
    const delay = this.retryConfig.initialDelay * Math.pow(2, attempt);
    return Math.min(delay, this.retryConfig.maxDelay);
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
      ...options.headers,
    };

    // Create a cache key for GET requests to prevent duplicate requests
    const cacheKey = `${options.method || 'GET'}:${endpoint}`;
    if ((options.method || 'GET') === 'GET' && this.requestQueue[cacheKey]) {
      return this.requestQueue[cacheKey];
    }

    let lastError;
    let attempt = 0;

    while (attempt <= this.retryConfig.maxRetries) {
      try {
        const response = await fetch(url, {
          ...options,
          headers,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Request failed' }));
          
          // Handle 429 (Too Many Requests) with retry
          if (response.status === 429) {
            if (attempt < this.retryConfig.maxRetries) {
              const backoffDelay = this.getBackoffDelay(attempt);
              console.warn(`[APIClient] Rate limited on ${endpoint}. Retrying in ${backoffDelay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
              await this.delay(backoffDelay);
              attempt++;
              continue;
            }
            lastError = new Error(error.message || 'Too many requests - please try again later');
          } 
          // Handle 401 Unauthorized
          else if (response.status === 401) {
            // Don't auto-logout for non-critical requests (like notifications)
            const isNonCritical = options.headers && options.headers['X-Non-Critical-Request'];
            
            if (!isNonCritical) {
              // Store current page for redirect after re-login
              if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
                sessionStorage.setItem('redirectAfterLogin', window.location.href);
              }
              
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              window.location.href = '/login.html';
            }
            lastError = new Error(error.message || 'Unauthorized');
          }
          // Handle other errors
          else {
            lastError = new Error(error.message || 'Request failed');
          }
          throw lastError;
        }

        const responseData = await response.json();
        
        // Cache successful GET requests
        if ((options.method || 'GET') === 'GET') {
          this.requestQueue[cacheKey] = Promise.resolve(responseData);
          setTimeout(() => delete this.requestQueue[cacheKey], 5000); // Clear cache after 5 seconds
        }

        return responseData;

      } catch (error) {
        lastError = error;
        
        // Don't retry on non-429 errors or if max retries reached
        if (!(error.message && error.message.includes('Too many requests')) || attempt >= this.retryConfig.maxRetries) {
          console.error('API Error:', error);
          throw error;
        }

        attempt++;
      }
    }

    // If we get here, all retries failed
    console.error('API Error:', lastError);
    throw lastError;
  }

  // Auth endpoints
  async register(email, password, firstName, lastName, role = 'student') {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, firstName, lastName, role }),
    });
  }

  async login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getMe() {
    return this.request('/auth/me', { method: 'GET' });
  }

  async updateProfile(updates) {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Project endpoints
  async getProjects(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.request(`/projects?${query}`, { method: 'GET' });
  }

  async getProject(projectId) {
    return this.request(`/projects/${projectId}`, { method: 'GET' });
  }

  async createProject(projectData) {
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(projectData),
    });
  }

  async updateProject(projectId, updates) {
    return this.request(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteProject(projectId) {
    return this.request(`/projects/${projectId}`, {
      method: 'DELETE',
    });
  }

  async assignMentorToProject(projectId, mentorId) {
    return this.request(`/projects/${projectId}/assign-mentor`, {
      method: 'POST',
      body: JSON.stringify({ mentorId }),
    });
  }

  // Milestone endpoints
  async createMilestones(projectId, milestones) {
    return this.request(`/milestones/project/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ milestones }),
    });
  }

  async getProjectMilestones(projectId) {
    return this.request(`/milestones/project/${projectId}`, { method: 'GET' });
  }

  async getGroupMilestones(groupId) {
    return this.request(`/milestones/group/${groupId}`, { method: 'GET' });
  }

  async approveMilestone(milestoneId, groupId, feedback) {
    return this.request(`/milestones/approve/${milestoneId}`, {
      method: 'POST',
      body: JSON.stringify({ groupId, feedback }),
    });
  }

  async getCenters() {
    return this.request('/centers', { method: 'GET' });
  }

  async getMyCenter() {
    return this.request('/centers/my-center', { method: 'GET' });
  }

  async getCenterById(centerId) {
    return this.request(`/centers/${centerId}`, { method: 'GET' });
  }

  async createCenter(centerData) {
    return this.request('/centers/register', {
      method: 'POST',
      body: JSON.stringify(centerData),
    });
  }

  async createCenterAdmin(userData) {
    return this.request('/auth/admin/create-center-admin', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateCenter(centerId, updates) {
    return this.request(`/centers/${centerId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteCenter(centerId) {
    return this.request(`/centers/${centerId}`, {
      method: 'DELETE',
    });
  }

  async createMentor(mentorData) {
    return this.request('/centers/mentors', {
      method: 'POST',
      body: JSON.stringify(mentorData),
    });
  }

  async updateMentor(mentorId, mentorData) {
    return this.request(`/centers/mentors/${mentorId}`, {
      method: 'PUT',
      body: JSON.stringify(mentorData),
    });
  }

  async deleteMentor(mentorId) {
    return this.request(`/centers/mentors/${mentorId}`, {
      method: 'DELETE',
    });
  }

  async approveCenterRegistration(centerId, approved = true) {
    return this.request(`/centers/${centerId}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ approved }),
    });
  }

  async getPendingCenters() {
    return this.request('/centers/admin/pending', { method: 'GET' });
  }

  async getMentors(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.request(`/centers/mentor/list?${query}`, { method: 'GET' });
  }

  async getAdminStats() {
    return this.request('/auth/admin/stats', { method: 'GET' });
  }

  async getUsers() {
    return this.request('/auth/admin/users', { method: 'GET' });
  }

  async deleteUser(userId) {
    return this.request(`/auth/admin/users/${userId}`, { method: 'DELETE' });
  }

  // Enrollment endpoints
  async getEnrolledProjects() {
    return this.request('/enrollment/my-projects', { method: 'GET' });
  }

  async enrollProject(projectId, enrollmentType = 'solo', groupName = null) {
    return this.request('/enrollment/free', {
      method: 'POST',
      body: JSON.stringify({ projectId, enrollmentType, groupName }),
    });
  }

  // Group endpoints
  async createStudentGroup(groupData) {
    return this.request('/groups', {
      method: 'POST',
      body: JSON.stringify(groupData),
    });
  }

  async getProjectGroups(projectId) {
    return this.request(`/groups/${projectId}`, { method: 'GET' });
  }

  async getMyGroups() {
    return this.request('/groups/student/my-groups', { method: 'GET' });
  }

  async addStudentToGroup(groupId, studentId) {
    return this.request(`/groups/${groupId}/students`, {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    });
  }

  async removeStudentFromGroup(groupId, studentId) {
    return this.request(`/groups/${groupId}/students/${studentId}`, {
      method: 'DELETE',
    });
  }

  async updateGroup(groupId, updates) {
    return this.request(`/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async getGroupProgress(groupId) {
    return this.request(`/groups/${groupId}/progress`, { method: 'GET' });
  }

  // Mentor assignment
  async addMentorToProject(projectId, mentorId) {
    return this.request(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify({ mentor_id: mentorId }),
    });
  }

  // Virtual Lab - Session Management
  async createVirtualLabSession(groupId, projectId) {
    return this.request('/virtual-lab/sessions', {
      method: 'POST',
      body: JSON.stringify({ groupId, projectId }),
    });
  }

  async getVirtualLabSession(sessionId) {
    return this.request(`/virtual-lab/sessions/${sessionId}`, { method: 'GET' });
  }

  async joinVirtualLabSession(sessionId) {
    return this.request(`/virtual-lab/sessions/${sessionId}/join`, { method: 'POST' });
  }

  async updateSessionCode(sessionId, code) {
    return this.request(`/virtual-lab/sessions/${sessionId}/code`, {
      method: 'PUT',
      body: JSON.stringify({ code }),
    });
  }

  async addSessionFeedback(sessionId, message, lineNumber, type) {
    return this.request(`/virtual-lab/sessions/${sessionId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ message, lineNumber, type }),
    });
  }

  async endVirtualLabSession(sessionId) {
    return this.request(`/virtual-lab/sessions/${sessionId}/end`, { method: 'POST' });
  }

  async getSessionHistory(groupId) {
    return this.request(`/virtual-lab/groups/${groupId}/sessions`, { method: 'GET' });
  }

  async getSessionRecording(sessionId) {
    return this.request(`/virtual-lab/sessions/${sessionId}/recording`, { method: 'GET' });
  }

  async getActiveSessions() {
    return this.request('/virtual-lab/active-sessions', { method: 'GET' });
  }

  // Legacy endpoint support
  async getVirtualLabSessions() {
    return this.getActiveSessions();
  }

  // Session endpoints
  async createSession(sessionData) {
    return this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  async getMySessions() {
    return this.request('/sessions/my-sessions', { method: 'GET' });
  }

  async createInstantSession(sessionData) {
    return this.request('/sessions/create-instant', {
      method: 'POST',
      body: JSON.stringify(sessionData),
    });
  }

  async startSessionRecording(sessionId) {
    return this.request(`/sessions/${sessionId}/start-recording`, {
      method: 'PUT',
    });
  }

  async stopSessionRecording(sessionId) {
    return this.request(`/sessions/${sessionId}/stop-recording`, {
      method: 'PUT',
    });
  }

  async endSession(sessionId) {
    return this.request(`/sessions/${sessionId}/end`, {
      method: 'POST',
    });
  }

  async getSession(sessionId) {
    return this.request(`/sessions/${sessionId}`, { method: 'GET' });
  }

  async isSessionActive(sessionId) {
    return this.request(`/sessions/${sessionId}/is-active`, { method: 'GET' });
  }

  async updateSession(sessionId, updates) {
    return this.request(`/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async cancelSession(sessionId) {
    return this.request(`/sessions/${sessionId}`, { method: 'DELETE' });
  }

  // Notification endpoints
  async getNotifications(unreadOnly = false) {
    return this.request(`/notifications?unreadOnly=${unreadOnly}`, { method: 'GET' });
  }

  async markNotificationAsRead(notificationId) {
    return this.request(`/notifications/${notificationId}/read`, { method: 'PUT' });
  }

  async markAllNotificationsAsRead() {
    return this.request('/notifications/mark-all-read', { method: 'PUT' });
  }

  async deleteNotification(notificationId) {
    return this.request(`/notifications/${notificationId}`, { method: 'DELETE' });
  }

  async notifySessionStarted(studentIds, sessionId, title, message) {
    return this.request('/notifications/session-started', {
      method: 'POST',
      body: JSON.stringify({ studentIds, sessionId, title, message }),
    });
  }

  // Progress/Enrollment endpoints
  async assignMentor(progressId, mentorId) {
    return this.request(`/progress/${progressId}/assign-mentor`, {
      method: 'PUT',
      body: JSON.stringify({ mentorId }),
    });
  }

  async getPendingMentorAssignments() {
    return this.request('/progress/center/pending-mentor', { method: 'GET' });
  }

  async getMentorStudents() {
    return this.request('/progress/mentor/students', { method: 'GET' });
  }

  async getStudentProgress(studentId, projectId) {
    return this.request(`/progress/${studentId}/${projectId}`, { method: 'GET' });
  }

  async evaluateStudent(studentId, projectId, data) {
    return this.request(`/progress/${studentId}/${projectId}/evaluate`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Enrollment endpoints
  async getMyEnrolledProjects() {
    return this.request('/enrollment/my-projects', { method: 'GET' });
  }
}

// Global instance
window.api = new APIClient();
