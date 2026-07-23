/**
 * Authentication Guard - Ensures user is properly authenticated before accessing pages
 * Include this script on protected pages AFTER api-client.js
 */

(function() {
  'use strict';
  
  /**
   * Check if user is authenticated with both token and user data
   */
  function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (!token || !user) {
      console.warn('[Auth Guard] Missing authentication credentials. Redirecting to login...');
      // Store the current URL to redirect back after login
      sessionStorage.setItem('redirectAfterLogin', window.location.href);
      window.location.href = '/login.html';
      return false;
    }
    
    try {
      // Validate that user data is valid JSON
      JSON.parse(user);
      return true;
    } catch (e) {
      console.error('[Auth Guard] Invalid user data in localStorage. Clearing...');
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      window.location.href = '/login.html';
      return false;
    }
  }
  
  /**
   * Verify API client is loaded and has the token
   */
  function ensureAPIClientReady() {
    if (!window.api) {
      console.error('[Auth Guard] API Client not loaded yet. Waiting...');
      return false;
    }
    
    // Ensure API client has the token
    const token = localStorage.getItem('token');
    if (token && !window.api.token) {
      console.log('[Auth Guard] Syncing token to API client...');
      window.api.token = token;
    }
    
    return true;
  }
  
  /**
   * Initialize auth check
   */
  function init() {
    // Check authentication immediately
    if (!checkAuth()) {
      return;
    }
    
    // Ensure API client is ready
    if (!ensureAPIClientReady()) {
      // Wait for API client to load
      setTimeout(() => {
        if (ensureAPIClientReady()) {
          console.log('[Auth Guard] ✓ Authentication verified');
        } else {
          console.error('[Auth Guard] API Client failed to load');
        }
      }, 100);
    } else {
      console.log('[Auth Guard] ✓ Authentication verified');
    }
  }
  
  // Run auth check when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Export for manual use if needed
  window.authGuard = {
    check: checkAuth,
    ensureReady: ensureAPIClientReady
  };
})();
