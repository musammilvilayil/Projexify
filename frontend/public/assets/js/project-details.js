/**
 * PROJECT DETAILS PAGE - Dynamic Project Loading
 * Loads single project data with enrollment logic and breadcrumbs
 */

class ProjectDetailsController {
  constructor() {
    this.projectId = null;
    this.project = null;
    this.init();
  }

  async init() {
    console.log('📋 Initializing Project Details...');

    // Prevent hard crashes if helpers are not loaded on the page.
    const safeShowError = (typeof showError === 'function')
      ? showError
      : (containerId, error) => {
          console.error(error);
          const el = document.getElementById(containerId);
          if (el) el.textContent = error?.message ? `Error: ${error.message}` : 'Something went wrong';
        };

    // Get project ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.projectId = urlParams.get('id');

    if (!this.projectId) {
      safeShowError('project-content', new Error('No project ID provided'));
      return;
    }

    // Load project data
    await this.loadProject();
  }


  /**
   * Load project from API
   */
  async loadProject() {
    try {
      // Show loading state (safe even if helper is missing)
      if (typeof showLoading === 'function') {
        showLoading('project-content', 'card');
      } else {
        const el = document.getElementById('project-content');
        if (el) el.innerHTML = '<div style="padding: 2rem; text-align:center;">Loading...</div>';
      }


      // Fetch project from API
      // Most pages use window.api, not window.nexusData.
      const getProjectFn = window.api?.getProject?.bind(window.api) || window.nexusData?.getProject?.bind(window.nexusData);
      if (!getProjectFn) {
        throw new Error('Project API client not found (expected window.api.getProject or window.nexusData.getProject)');
      }

      const response = await getProjectFn(this.projectId);

      
      this.project = response.project || response;
      
      console.log('✅ Loaded project:', this.project);

      // Render project details
      this.renderProject();
      
      // Load milestones
      await this.loadMilestones();
      
    } catch (error) {
      console.error('Failed to load project:', error);
      showError('project-content', error);
    }
  }

  /**
   * Render project details
   */
  renderProject() {
    if (!this.project) return;

    const {
      title,
      description,
      price,
      difficulty_level = 'intermediate',
      mentor,
      center,
      tech_stack = [],
      category = 'General',
      enrolled_students = [],
      max_students = 30,
      duration_weeks = 8,
      start_date,
      status = 'active'
    } = this.project;

    // Render breadcrumbs
    this.renderBreadcrumbs();

    // Render hero section
    const heroSection = document.getElementById('project-hero');
    if (heroSection) {
      heroSection.innerHTML = `
        <div class="glass-card" style="padding: var(--space-2xl); margin-bottom: var(--space-xl);">
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-2xl); align-items: start;">
            <!-- Left: Project Info -->
            <div>
              <div class="flex gap-sm" style="margin-bottom: var(--space-md);">
                <span class="badge badge-info">${category}</span>
                <span class="badge" style="background: rgba(34, 197, 94, 0.1); color: var(--color-success); border: 1px solid rgba(34, 197, 94, 0.3);">
                  ${difficulty_level}
                </span>
                ${status === 'active' ? '<span class="badge badge-active">Open for Enrollment</span>' : ''}
              </div>
              
              <h1 class="gradient-text" style="font-size: 2.5rem; font-weight: 700; margin-bottom: var(--space-md);">
                ${title}
              </h1>
              
              <p class="text-secondary" style="font-size: 1.125rem; line-height: 1.8; margin-bottom: var(--space-lg);">
                ${description}
              </p>
              
              <div class="flex gap-lg" style="margin-bottom: var(--space-lg);">
                <div>
                  <div class="text-tertiary" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Mentor</div>
                  <div style="font-weight: 600; margin-top: var(--space-xs);">
                    ${mentor?.name || mentor || 'Not assigned'}
                  </div>
                </div>
                <div>
                  <div class="text-tertiary" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Center</div>
                  <div style="font-weight: 600; margin-top: var(--space-xs);">
                    ${center?.name || center || 'Independent'}
                  </div>
                </div>
                <div>
                  <div class="text-tertiary" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Duration</div>
                  <div style="font-weight: 600; margin-top: var(--space-xs);">
                    ${duration_weeks} weeks
                  </div>
                </div>
              </div>
              
              ${tech_stack.length > 0 ? `
                <div>
                  <div class="text-tertiary" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: var(--space-sm);">Tech Stack</div>
                  <div class="flex gap-sm" style="flex-wrap: wrap;">
                    ${tech_stack.map(tech => `
                      <span class="tech-badge" style="background: rgba(99, 102, 241, 0.1); color: var(--accent-indigo); padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-full); font-size: 0.75rem; font-weight: 600; border: 1px solid rgba(99, 102, 241, 0.2);">
                        ${tech}
                      </span>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
            
            <!-- Right: Enrollment Card -->
            <div class="glass-elevated" style="padding: var(--space-xl); text-align: center;">
              <div class="gradient-text" style="font-size: 3rem; font-weight: 700; margin-bottom: var(--space-sm);">
                ${price === 0 ? 'Free' : formatCurrency(price)}
              </div>
              
              <div class="text-secondary" style="margin-bottom: var(--space-lg); font-size: 0.875rem;">
                ${enrolled_students.length} / ${max_students} enrolled
              </div>
              
              <div style="width: 100%; height: 8px; background: var(--bg-elevated); border-radius: var(--radius-full); margin-bottom: var(--space-lg); overflow: hidden;">
                <div style="width: ${(enrolled_students.length / max_students) * 100}%; height: 100%; background: var(--gradient-primary);"></div>
              </div>
              
              <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
                <button 
                  class="btn-primary enroll-btn"
                  style="width: 100%; margin-bottom: 0; font-size: 1rem; padding: var(--space-md);">
                  Enroll Now
                </button>

                <div style="display:flex; gap: var(--space-sm); justify-content: center; align-items: center;">
                  <button 
                    class="btn-secondary group-enroll-btn"
                    style="flex: 1; font-size: 0.95rem; padding: var(--space-sm) var(--space-md);">
                    Create Squad
                  </button>
                </div>
              </div>

              <button 
                class="btn-secondary contact-mentor-btn"
                style="width: 100%;">
                Contact Mentor
              </button>

              ${start_date ? `
                <div style="margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--border-subtle);">
                  <div class="text-tertiary" style="font-size: 0.75rem; margin-bottom: var(--space-xs);">Starts</div>
                  <div style="font-weight: 600;">${formatDate(start_date, 'long')}</div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;

      // Add event listeners
      // NOTE: Some pages use id="enrollBtn" (project-details.html) instead of .enroll-btn
      const enrollBtn = heroSection.querySelector('.enroll-btn') || document.getElementById('enrollBtn');

      if (enrollBtn) {
        enrollBtn.addEventListener('click', () => this.enrollInProject('solo'));
      }

      const groupEnrollBtn = heroSection.querySelector('.group-enroll-btn');
      if (groupEnrollBtn) {
        groupEnrollBtn.addEventListener('click', () => this.enrollInProject('group'));
      }

      const contactBtn = heroSection.querySelector('.contact-mentor-btn');
      if (contactBtn) {
        contactBtn.addEventListener('click', () => this.contactMentor());
      }
    }

    // Render milestones section header
    const milestonesSection = document.getElementById('project-milestones');
    if (milestonesSection) {
      milestonesSection.innerHTML = `
        <h2 style="font-size: 1.75rem; font-weight: 700; margin-bottom: var(--space-lg);">
          📊 Project Milestones
        </h2>
        <div id="milestones-list">
          <!-- Milestones will be loaded here -->
        </div>
      `;
    }
  }

  /**
   * Render breadcrumbs
   */
  renderBreadcrumbs() {
    const breadcrumbContainer = document.getElementById('breadcrumbs');
    if (!breadcrumbContainer || !this.project) return;

    const { category = 'Projects', title } = this.project;

    breadcrumbContainer.innerHTML = `
      <nav style="margin-bottom: var(--space-lg);">
        <ol class="flex gap-sm items-center text-secondary" style="list-style: none; font-size: 0.875rem;">
          <li><a href="/marketplace.html" class="transition" style="color: var(--text-tertiary); text-decoration: none;">Marketplace</a></li>
          <li>→</li>
          <li><a href="/marketplace.html?category=${encodeURIComponent(category)}" class="transition" style="color: var(--text-tertiary); text-decoration: none;">${category}</a></li>
          <li>→</li>
          <li style="color: var(--text-primary); font-weight: 600;">${title}</li>
        </ol>
      </nav>
    `;
  }

  /**
   * Load project milestones
   */
  async loadMilestones() {
    try {
      const getMilestonesFn = window.api?.getProjectMilestones?.bind(window.api);
      if (!getMilestonesFn) {
        throw new Error('Milestones API client not found (expected window.api.getProjectMilestones)');
      }
      const response = await getMilestonesFn(this.projectId);

      const milestones = response.milestones || response || [];
      
      this.renderMilestones(milestones);
      
    } catch (error) {
      console.error('Failed to load milestones:', error);
      const milestonesList = document.getElementById('milestones-list');
      if (milestonesList) {
        milestonesList.innerHTML = `
          <p class="text-secondary">No milestones available yet.</p>
        `;
      }
    }
  }

  /**
   * Render milestones
   */
  renderMilestones(milestones) {
    const container = document.getElementById('milestones-list');
    if (!container) return;

    if (milestones.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <h3 class="empty-state-title">No milestones yet</h3>
          <p class="empty-state-description">Milestones will be added by the mentor once the project starts.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = milestones.map((milestone, index) => `
      <div class="glass-card" style="padding: var(--space-lg); margin-bottom: var(--space-md);">
        <div class="flex justify-between items-start">
          <div style="flex: 1;">
            <div class="flex items-center gap-md" style="margin-bottom: var(--space-sm);">
              <div style="width: 32px; height: 32px; background: var(--gradient-primary); border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center; font-weight: 700; color: white;">
                ${index + 1}
              </div>
              <h3 style="font-size: 1.125rem; font-weight: 600;">${milestone.title}</h3>
            </div>
            <p class="text-secondary" style="margin-bottom: var(--space-md); margin-left: 44px;">
              ${milestone.description}
            </p>
            <div class="flex gap-md" style="margin-left: 44px;">
              <span class="badge badge-info">Week ${milestone.week}</span>
              <span class="badge" style="background: rgba(245, 158, 11, 0.1); color: var(--color-warning); border: 1px solid rgba(245, 158, 11, 0.3);">
                ${milestone.points} points
              </span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Enroll in project
   */
  async enrollInProject(enrollmentType = 'solo') {
    try {
      // Check if user is logged in
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user) {
        window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }

      if (window.uiManager) window.uiManager.showLoading('Processing enrollment...');

      // For group enrollment, backend expects enrollmentType='group'
      // groupName can be null to let backend create default.
      const payload = { enrollmentType };

      await window.api.enrollProject(this.projectId, payload.enrollmentType, null);

      if (window.uiManager) {
        window.uiManager.hideLoading();
        window.uiManager.showToast('Successfully enrolled! Redirecting to dashboard...', 'success');
      }

      setTimeout(() => {
        // If group was created, send user to group-manager (optional but improves UX)
        window.location.href = '/pages/student/dashboard.html';
      }, 2000);
    } catch (error) {
      console.error('Enrollment failed:', error);
      if (window.uiManager) window.uiManager.hideLoading();
      if (window.uiManager) {
        window.uiManager.showToast(error.message || 'Failed to enroll in project', 'error');
      } else {
        console.error(error.message || 'Failed to enroll in project');
      }
    }
  }

  /**
   * Contact mentor
   */
  contactMentor() {
    if (!this.project?.mentor_id) {
      if (window.uiManager) {
        window.uiManager.showToast('Mentor information not available', 'error');
      } else {
        console.error('Mentor information not available');
      }
      return;
    }

    const mentorEmail = this.project.mentor_id.email;
    
    if (mentorEmail) {
      window.location.href = `mailto:${mentorEmail}?subject=Question about ${encodeURIComponent(this.project.title)}`;
    } else {
      if (window.uiManager) {
        window.uiManager.showToast('Mentor contact information not available', 'error');
      } else {
        console.error('Mentor contact information not available');
      }
    }
  }
}

// Initialize project details when DOM is ready
let projectDetails;

document.addEventListener('DOMContentLoaded', () => {
  projectDetails = new ProjectDetailsController();
  window.projectDetails = projectDetails;
});
