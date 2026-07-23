/**
 * PROJECT DETAILS LOADER - Simplified version that works with our API
 */

class ProjectDetailsLoader {
  constructor() {
    this.projectId = null;
    this.project = null;
    this.init();
  }

  async init() {
    console.log('📋 Initializing Project Details...');
    
    // Get project ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.projectId = urlParams.get('id');
    
    if (!this.projectId) {
      this.showError('No project ID provided in URL');
      return;
    }
    
    // Load project data
    await this.loadProject();
  }

  async loadProject() {
    const container = document.getElementById('projectDetails');
    if (!container) {
      console.error('❌ Project details container not found');
      return;
    }

    try {
      console.log(`📡 Fetching project ${this.projectId}...`);
      
      // Show loading
      container.innerHTML = `
        <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 4rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">⏳</div>
          <h3>Loading Project Details...</h3>
        </div>
      `;

      // Fetch project from API
      const response = await fetch(`/api/projects/${this.projectId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.project = data.project || data;
      
      console.log('✅ Loaded project:', this.project);

      // Render project details
      this.renderProject();
      
    } catch (error) {
      console.error('❌ Failed to load project:', error);
      this.showError(error.message);
    }
  }

  renderProject() {
    if (!this.project) return;

    const {
      _id,
      title,
      description,
      abstract,
      price,
      difficulty_level = 'intermediate',
      mentor_id,
      centerId,
      tech_stack = [],
      max_students = 5,
      current_students = 0,
      duration_weeks = 12,
      status = 'active',
      featured = false
    } = this.project;

    // Get mentor and center names
    const mentorName = mentor_id?.firstName ? `${mentor_id.firstName} ${mentor_id.lastName}` : 'Expert Mentor';
    const centerName = centerId?.name || 'Learning Center';
    const priceDisplay = price === 0 || !price ? 'Free' : `₹${price.toLocaleString('en-IN')}`;
    
    // Difficulty colors
    const difficultyColors = {
      beginner: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' },
      intermediate: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' },
      advanced: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }
    };
    
    const diffColor = difficultyColors[difficulty_level.toLowerCase()] || difficultyColors.intermediate;
    
    const container = document.getElementById('projectDetails');
    container.innerHTML = `
      <!-- Back Button -->
      <div style="margin-bottom: 2rem;">
        <a href="/marketplace.html" class="btn btn-glass" style="display: inline-flex; align-items: center; gap: 0.5rem;">
          ← Back to Marketplace
        </a>
      </div>

      <!-- Project Header -->
      <div class="glass-card" style="padding: 4rem; margin-bottom: 3rem; text-align: center; background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));">
        ${featured ? '<div style="display: inline-block; padding: 0.5rem 1.5rem; background: linear-gradient(135deg, #f59e0b, #ef4444); border-radius: 20px; font-size: 0.85rem; font-weight: 700; margin-bottom: 1rem;">⭐ FEATURED PROJECT</div>' : ''}
        
        <h1 style="font-size: clamp(2.5rem, 6vw, 4rem); font-weight: 900; margin-bottom: 1.5rem; background: var(--gradient-primary); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;">
          ${title}
        </h1>
        
        <p style="font-size: 1.3rem; color: var(--text-muted); max-width: 800px; margin: 0 auto 2rem;">${abstract || description}</p>
        
        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-bottom: 2rem;">
          <span style="padding: 0.5rem 1.2rem; background: ${diffColor.bg}; color: ${diffColor.color}; border: ${diffColor.border}; border-radius: 20px; font-size: 0.9rem; font-weight: 700; text-transform: uppercase;">
            ${difficulty_level}
          </span>
          <span style="padding: 0.5rem 1.2rem; background: rgba(99, 102, 241, 0.1); color: #6366f1; border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 20px; font-size: 0.9rem; font-weight: 700;">
            ${duration_weeks} Weeks
          </span>
          <span style="padding: 0.5rem 1.2rem; background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; font-size: 0.9rem; font-weight: 700;">
            ${current_students}/${max_students} Students
          </span>
        </div>

        <div style="display: flex; gap: 2rem; justify-content: center; align-items: center;">
          <div style="text-align: center;">
            <div style="font-size: 0.85rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 0.5rem;">Investment</div>
            <div style="font-size: 2.5rem; font-weight: 900; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;">${priceDisplay}</div>
          </div>
          <button class="btn btn-primary" style="font-size: 1.2rem; padding: 1.25rem 3rem;" onclick="handleEnrollClick('${_id}', ${price}, '${title}')">
            🚀 Enroll Now
          </button>
        </div>
      </div>

      <!-- Main Content Grid -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 3rem; margin-bottom: 3rem;">
        
        <!-- Left Column: Details -->
        <div>
          <!-- Description -->
          <div class="glass-card" style="padding: 2.5rem; margin-bottom: 2rem;">
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 1rem;">
              📋 Project Description
            </h2>
            <p style="font-size: 1.1rem; line-height: 1.8; color: var(--text-muted);">${description}</p>
          </div>

          <!-- Tech Stack -->
          <div class="glass-card" style="padding: 2.5rem; margin-bottom: 2rem;">
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 1rem;">
              🛠️ Technology Stack
            </h2>
            <div style="display: flex; flex-wrap: wrap; gap: 1rem;">
              ${tech_stack.map(tech => `
                <span style="padding: 0.75rem 1.5rem; background: rgba(99, 102, 241, 0.1); color: var(--primary); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 12px; font-size: 0.95rem; font-weight: 600;">
                  ${tech}
                </span>
              `).join('')}
            </div>
          </div>

          <!-- What You'll Learn -->
          <div class="glass-card" style="padding: 2.5rem;">
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 1rem;">
              🎯 What You'll Learn
            </h2>
            <ul style="list-style: none; padding: 0;">
              <li style="padding: 1rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: flex-start; gap: 1rem;">
                <span style="color: var(--primary); font-size: 1.5rem;">✓</span>
                <span style="color: var(--text-muted); line-height: 1.6;">Build production-ready applications using modern technologies</span>
              </li>
              <li style="padding: 1rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: flex-start; gap: 1rem;">
                <span style="color: var(--primary); font-size: 1.5rem;">✓</span>
                <span style="color: var(--text-muted); line-height: 1.6;">Work with experienced mentors on real-world projects</span>
              </li>
              <li style="padding: 1rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: flex-start; gap: 1rem;">
                <span style="color: var(--primary); font-size: 1.5rem;">✓</span>
                <span style="color: var(--text-muted); line-height: 1.6;">Collaborate with peers in a professional development environment</span>
              </li>
              <li style="padding: 1rem 0; display: flex; align-items: flex-start; gap: 1rem;">
                <span style="color: var(--primary); font-size: 1.5rem;">✓</span>
                <span style="color: var(--text-muted); line-height: 1.6;">Receive a verified certificate upon successful completion</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- Right Column: Info Cards -->
        <div>
          <!-- Mentor Card -->
          <div class="glass-card" style="padding: 2rem; margin-bottom: 2rem; text-align: center;">
            <h3 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 1.5rem; color: var(--text-main);">👨‍🏫 Your Mentor</h3>
            <div style="width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 700; color: white; margin: 0 auto 1rem; box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);">
              ${mentorName.charAt(0)}
            </div>
            <div style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem;">${mentorName}</div>
            <div style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 1.5rem;">Industry Expert</div>
            <p style="font-size: 0.95rem; color: var(--text-muted); line-height: 1.6;">Experienced professional with years of expertise in modern software development.</p>
          </div>

          <!-- Center Card -->
          <div class="glass-card" style="padding: 2rem; margin-bottom: 2rem; text-align: center;">
            <h3 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 1.5rem; color: var(--text-main);">🏢 Incubation Center</h3>
            <div style="font-size: 2.5rem; margin-bottom: 1rem;">🏢</div>
            <div style="font-size: 1.2rem; font-weight: 700; margin-bottom: 0.5rem;">${centerName}</div>
            <div style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 1.5rem;">Verified Partner</div>
            <a href="/pages/centers-directory.html" class="btn btn-glass btn-sm" style="width: 100%;">View Center Profile</a>
          </div>

          <!-- Quick Facts -->
          <div class="glass-card" style="padding: 2rem;">
            <h3 style="font-size: 1.2rem; font-weight: 800; margin-bottom: 1.5rem; color: var(--text-main);">📊 Quick Facts</h3>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                <span style="color: var(--text-dim);">Duration</span>
                <span style="font-weight: 700;">${duration_weeks} weeks</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                <span style="color: var(--text-dim);">Difficulty</span>
                <span style="font-weight: 700; color: ${diffColor.color};">${difficulty_level}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                <span style="color: var(--text-dim);">Max Students</span>
                <span style="font-weight: 700;">${max_students}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                <span style="color: var(--text-dim);">Enrolled</span>
                <span style="font-weight: 700; color: var(--primary);">${current_students}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 0.75rem 0;">
                <span style="color: var(--text-dim);">Status</span>
                <span style="font-weight: 700; color: #10b981;">${status === 'active' ? 'Open' : 'Closed'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  showError(message) {
    const container = document.getElementById('projectDetails');
    if (container) {
      container.innerHTML = `
        <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 4rem; background: rgba(255, 50, 50, 0.1);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
          <h3>Error Loading Project</h3>
          <p style="color: var(--text-muted); margin-bottom: 1.5rem;">${message}</p>
          <a href="/marketplace.html" class="btn btn-primary">← Back to Marketplace</a>
        </div>
      `;
    }
  }
}

// Handle enrollment
function handleEnrollClick(projectId, price, title) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!user || !user.id) {
    showNotification('Please login to enroll in this project', 'error');
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    return;
  }

  // If payment modal is available, use it
  if (window.paymentModal) {
    window.paymentModal.open({ projectId, amount: price * 100, projectTitle: title, enrollmentType: 'solo' });
  } else {
    showNotification('Enrollment feature coming soon!', 'info');
  }
}

// Notification helper
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    z-index: 10000;
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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const loader = new ProjectDetailsLoader();
  window.projectLoader = loader;
});
