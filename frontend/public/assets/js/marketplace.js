/**
 * MARKETPLACE PAGE - Dynamic Project Loading
 * Connects to backend API and renders projects with filters
 */

class MarketplaceController {
  constructor() {
    // Check URL for filters
    const urlParams = new URLSearchParams(window.location.search);
    const mentorId = urlParams.get('mentor');
    const centerId = urlParams.get('center');
    
    this.currentFilters = {
      difficulty: null,
      search: '',
      maxPrice: 30000,
      mentorId: mentorId, // Add mentor filter from URL
      centerId: centerId  // Add center filter from URL
    };
    
    this.currentPage = 1;
    this.itemsPerPage = 24;
    this.allProjects = [];
    this.filteredProjects = [];
    
    this.init();
  }

  async init() {
    console.log('🛒 Initializing Marketplace...');
    
    // Show filter badges
    if (this.currentFilters.mentorId) {
      this.showMentorFilterBadge();
    }
    if (this.currentFilters.centerId) {
      this.showCenterFilterBadge();
    }
    
    // Set up event listeners
    this.setupFilters();
    this.setupSearch();
    
    // Load initial projects
    await this.loadProjects();
  }

  /**
   * Load projects from API
   */
  async loadProjects() {
    const container = document.getElementById('projects-grid');
    if (!container) {
      console.error('❌ Projects grid container not found');
      return;
    }

    try {
      console.log('📡 Fetching ALL projects from /api/projects...');
      
      // Show loading state
      container.innerHTML = `
        <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">⏳</div>
          <h3>Loading Projects...</h3>
        </div>
      `;

      // Fetch ALL projects by setting limit=-1
      const response = await fetch('/api/projects?limit=-1');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('📦 Raw API Response:', data);
      
      this.allProjects = data.projects || [];
      console.log(`✅ Loaded ${this.allProjects.length} projects`);

      // Apply client-side filtering
      this.applyClientFilters();

      // Render projects
      this.renderProjects();
      
    } catch (error) {
      console.error('❌ Failed to load projects:', error);
      console.error('Error details:', error.message, error.stack);
      
      container.innerHTML = `
        <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: rgba(255, 50, 50, 0.1);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
          <h3>Error Loading Projects</h3>
          <p style="color: var(--text-muted); margin-bottom: 1.5rem;">${error.message}</p>
          <button class="btn btn-primary" onclick="window.marketplace.loadProjects()">Retry</button>
        </div>
      `;
    }
  }

  /**
   * Apply client-side filters
   */
  applyClientFilters() {
    let filtered = [...this.allProjects];

    // Filter by mentor (if specified)
    if (this.currentFilters.mentorId) {
      console.log('🔍 Filtering by mentor:', this.currentFilters.mentorId);
      console.log('📦 Total projects before filter:', filtered.length);
      
      // Log first project structure for debugging
      if (filtered.length > 0) {
        console.log('📋 Sample project mentor_id:', filtered[0].mentor_id);
      }
      
      filtered = filtered.filter(p => {
        // mentor_id might be populated (object) or just an ObjectId string
        let projectMentorId = null;
        
        if (p.mentor_id) {
          // If populated, mentor_id is an object with _id
          if (typeof p.mentor_id === 'object' && p.mentor_id._id) {
            projectMentorId = p.mentor_id._id;
          } else {
            // If not populated, it's the ObjectId directly
            projectMentorId = p.mentor_id;
          }
        } else if (p.mentorId) {
          projectMentorId = p.mentorId;
        }
        
        // Convert to string for comparison
        const projectMentorStr = String(projectMentorId);
        const filterMentorStr = String(this.currentFilters.mentorId);
        
        const matches = projectMentorStr === filterMentorStr;
        
        if (matches) {
          console.log('✅ Project matched:', p.title);
        }
        return matches;
      });
      console.log(`📊 After mentor filter: ${filtered.length} projects`);
    }

    // Filter by center (if specified)
    if (this.currentFilters.centerId) {
      console.log('🏢 Filtering by center:', this.currentFilters.centerId);
      console.log('📦 Total projects before center filter:', filtered.length);
      
      filtered = filtered.filter(p => {
        // centerId might be populated (object) or just an ObjectId string
        let projectCenterId = null;
        
        if (p.centerId) {
          // If populated, centerId is an object with _id
          if (typeof p.centerId === 'object' && p.centerId._id) {
            projectCenterId = p.centerId._id;
          } else {
            // If not populated, it's the ObjectId directly
            projectCenterId = p.centerId;
          }
        }
        
        // Convert to string for comparison
        const projectCenterStr = String(projectCenterId);
        const filterCenterStr = String(this.currentFilters.centerId);
        
        const matches = projectCenterStr === filterCenterStr;
        
        if (matches) {
          console.log('✅ Project matched:', p.title);
        }
        return matches;
      });
      console.log(`📊 After center filter: ${filtered.length} projects`);
    }

    // Filter by difficulty
    if (this.currentFilters.difficulty) {
      filtered = filtered.filter(p => 
        p.difficulty_level && p.difficulty_level.toLowerCase() === this.currentFilters.difficulty.toLowerCase()
      );
    }

    // Filter by search
    if (this.currentFilters.search) {
      const searchLower = this.currentFilters.search.toLowerCase();
      filtered = filtered.filter(p => 
        (p.title && p.title.toLowerCase().includes(searchLower)) ||
        (p.description && p.description.toLowerCase().includes(searchLower)) ||
        (p.tech_stack && p.tech_stack.some(tech => tech.toLowerCase().includes(searchLower)))
      );
    }

    // Filter by price
    if (this.currentFilters.maxPrice) {
      filtered = filtered.filter(p => (p.price || 0) <= this.currentFilters.maxPrice);
    }

    this.filteredProjects = filtered;
    console.log(`🔍 Filtered to ${this.filteredProjects.length} projects`);
    
    // Update count display
    this.updateProjectCount();
  }

  /**
   * Show badge when filtering by mentor
   */
  showMentorFilterBadge() {
    const header = document.querySelector('.marketplace-header');
    if (header && !document.getElementById('mentor-filter-badge')) {
      const badge = document.createElement('div');
      badge.id = 'mentor-filter-badge';
      badge.style.cssText = 'background: rgba(99, 102, 241, 0.2); border: 1px solid var(--primary); border-radius: var(--radius-lg); padding: 1rem 1.5rem; margin: 1.5rem auto 0; max-width: 600px; display: flex; align-items: center; justify-content: space-between; gap: 1rem;';
      badge.innerHTML = `
        <div>
          <strong style="color: var(--primary);">🎓 Viewing Mentor's Projects</strong>
          <p style="color: var(--text-muted); margin: 0.25rem 0 0 0; font-size: 0.9rem;">Showing projects from this mentor only</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="window.marketplace.clearMentorFilter()" style="white-space: nowrap;">View All Projects</button>
      `;
      header.appendChild(badge);
    }
  }

  /**
   * Clear mentor filter
   */
  clearMentorFilter() {
    window.location.href = '/marketplace.html';
  }

  /**
   * Show badge when filtering by center
   */
  showCenterFilterBadge() {
    const header = document.querySelector('.marketplace-header');
    if (header && !document.getElementById('center-filter-badge')) {
      const badge = document.createElement('div');
      badge.id = 'center-filter-badge';
      badge.style.cssText = 'background: rgba(139, 92, 246, 0.2); border: 1px solid var(--secondary); border-radius: var(--radius-lg); padding: 1rem 1.5rem; margin: 1.5rem auto 0; max-width: 600px; display: flex; align-items: center; justify-content: space-between; gap: 1rem;';
      badge.innerHTML = `
        <div>
          <strong style="color: var(--secondary);">🏢 Viewing Center's Projects</strong>
          <p style="color: var(--text-muted); margin: 0.25rem 0 0 0; font-size: 0.9rem;">Showing projects from this center only</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="window.marketplace.clearCenterFilter()" style="white-space: nowrap;">View All Projects</button>
      `;
      header.appendChild(badge);
    }
  }

  /**
   * Clear center filter
   */
  clearCenterFilter() {
    window.location.href = '/marketplace.html';
  }

  /**
   * Update project count display
   */
  updateProjectCount() {
    const header = document.querySelector('.marketplace-header');
    if (!header) return;
    
    let countElement = document.getElementById('project-count');
    if (!countElement) {
      countElement = document.createElement('div');
      countElement.id = 'project-count';
      countElement.style.cssText = 'margin-top: 1rem; font-size: 1rem; color: var(--text-muted);';
      header.appendChild(countElement);
    }
    
    countElement.innerHTML = `Showing <strong style="color: var(--primary);">${this.filteredProjects.length}</strong> of <strong style="color: var(--primary);">${this.allProjects.length}</strong> projects`;
  }

  /**
   * Render projects to DOM
   */
  renderProjects() {
    const container = document.getElementById('projects-grid');
    if (!container) return;

    // Handle empty state
    if (this.filteredProjects.length === 0) {
      container.innerHTML = `
        <div class="glass-card empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
          <h3>No projects found</h3>
          <p style="color: var(--text-dim); margin-bottom: 1.5rem;">Try adjusting your filters or search to discover amazing projects.</p>
          <button class="btn btn-primary" id="clear-filters-btn">Clear Filters</button>
        </div>
      `;
      document.getElementById('clear-filters-btn')?.addEventListener('click', () => this.clearFilters());
      return;
    }

    // Calculate pagination
    const startIdx = (this.currentPage - 1) * this.itemsPerPage;
    const endIdx = startIdx + this.itemsPerPage;
    const pageProjects = this.filteredProjects.slice(startIdx, endIdx);

    // Generate HTML
    container.innerHTML = pageProjects.map(project => this.renderProjectCard(project)).join('');

    // Render pagination
    this.renderPagination();

    // Add click handlers
    this.attachProjectHandlers();
  }

  /**
   * Render a single project card
   */
  renderProjectCard(project) {
    const {
      _id,
      title,
      description,
      price,
      difficulty_level = 'intermediate',
      mentor_id,
      centerId,
      tech_stack = [],
      duration_weeks = 12
    } = project;

    // Truncate description
    const shortDesc = description ? (description.substring(0, 120) + (description.length > 120 ? '...' : '')) : 'No description available';

    // Format price
    const priceDisplay = price === 0 || !price ? 'Free' : `₹${price.toLocaleString('en-IN')}`;

    // Difficulty badge colors
    const difficultyColors = {
      beginner: 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);',
      intermediate: 'background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);',
      advanced: 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);'
    };

    const difficultyStyle = difficultyColors[(difficulty_level || 'intermediate').toLowerCase()] || difficultyColors.intermediate;

    // Mentor name
    let mentorName = 'Expert Mentor';
    if (mentor_id) {
      if (mentor_id.firstName && mentor_id.lastName) {
        mentorName = `${mentor_id.firstName} ${mentor_id.lastName}`;
      } else if (typeof mentor_id === 'string') {
        mentorName = mentor_id;
      }
    }

    // Center name
    const centerName = centerId?.name || 'Learning Center';

    // Project emoji based on tech stack
    const getProjectEmoji = (techStack) => {
      if (!techStack || techStack.length === 0) return '💻';
      const stack = techStack.join(' ').toLowerCase();
      if (stack.includes('ai') || stack.includes('ml') || stack.includes('tensorflow')) return '🤖';
      if (stack.includes('blockchain') || stack.includes('ethereum')) return '🔗';
      if (stack.includes('cloud') || stack.includes('aws') || stack.includes('docker')) return '☁️';
      if (stack.includes('react') || stack.includes('vue') || stack.includes('next')) return '⚛️';
      if (stack.includes('mobile') || stack.includes('android') || stack.includes('ios')) return '📱';
      if (stack.includes('iot') || stack.includes('raspberry')) return '🔌';
      if (stack.includes('video') || stack.includes('stream')) return '📹';
      return '💻';
    };

    return `
      <div class="glass-card project-card" data-project-id="${_id}" style="cursor: pointer;">
        <div class="project-image" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1)); position: relative;">
          <div style="font-size: 5rem;">${getProjectEmoji(tech_stack)}</div>
          <div style="position: absolute; top: 1rem; right: 1rem;">
            <span class="tag" style="${difficultyStyle} font-weight: 700; text-transform: uppercase; font-size: 0.7rem; padding: 0.4rem 0.8rem;">
              ${difficulty_level}
            </span>
          </div>
          <div style="position: absolute; bottom: 1rem; left: 1rem;">
            <span class="tag" style="background: rgba(0,0,0,0.5); color: white; border: none; font-size: 0.7rem; padding: 0.3rem 0.7rem;">
              ${duration_weeks} weeks
            </span>
          </div>
        </div>
        <div class="project-info">
          <h3 style="font-size: 1.35rem; margin-bottom: 0.75rem; font-weight: 700; color: var(--text-main); line-height: 1.3;">${title}</h3>
          
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; opacity: 0.8;">
            <span style="font-size: 0.85rem;">🏢</span>
            <span style="font-size: 0.85rem; color: var(--text-muted);">${centerName}</span>
          </div>

          <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; flex-grow: 1;">
            ${shortDesc}
          </p>

          <div class="project-tags" style="margin-bottom: 1.5rem;">
            ${(tech_stack || []).slice(0, 4).map(tech => `<span class="tag">${tech}</span>`).join('')}
          </div>
          
          <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; padding: 0.75rem; background: rgba(99, 102, 241, 0.05); border-radius: var(--radius-md); border: 1px solid rgba(99, 102, 241, 0.1);">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; color: white; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);">
              ${mentorName.charAt(0)}
            </div>
            <div>
              <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em;">Mentor</div>
              <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-main);">${mentorName}</div>
            </div>
          </div>

          <div class="project-meta" style="display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.08);">
            <div>
              <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; margin-bottom: 0.25rem;">Investment</div>
              <div class="price" style="font-size: 1.5rem; font-weight: 800; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;">${priceDisplay}</div>
            </div>
            <button class="btn btn-primary btn-sm" data-action="view-project" data-project-id="${_id}" style="padding: 0.75rem 1.5rem; font-weight: 600;">
              View Details →
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render pagination controls
   */
  renderPagination() {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer) {
      // Create pagination container if it doesn't exist
      const grid = document.getElementById('projects-grid');
      const container = document.createElement('div');
      container.id = 'pagination';
      container.style.marginTop = '3rem';
      container.style.gridColumn = '1 / -1';
      grid.parentNode.insertBefore(container, grid.nextSibling);
    }

    const totalPages = Math.ceil(this.filteredProjects.length / this.itemsPerPage);

    if (totalPages <= 1) {
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    let paginationHTML = '<div class="pagination flex gap-sm items-center justify-center" style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 2rem;">';

    // Previous button
    paginationHTML += `
      <button 
        class="btn btn-glass btn-sm page-btn" 
        data-page="${this.currentPage - 1}"
        ${this.currentPage === 1 ? 'disabled' : ''}>
        ← Previous
      </button>
    `;

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= this.currentPage - 1 && i <= this.currentPage + 1)) {
        paginationHTML += `
          <button 
            class="btn btn-sm page-btn ${i === this.currentPage ? 'btn-primary' : 'btn-glass'}" 
            data-page="${i}">
            ${i}
          </button>
        `;
      } else if (i === this.currentPage - 2 || i === this.currentPage + 2) {
        paginationHTML += '<span style="color: var(--text-tertiary);">...</span>';
      }
    }

    // Next button
    paginationHTML += `
      <button 
        class="btn btn-glass btn-sm page-btn" 
        data-page="${this.currentPage + 1}"
        ${this.currentPage === totalPages ? 'disabled' : ''}>
        Next →
      </button>
    `;

    paginationHTML += '</div>';

    const pagContainer = document.getElementById('pagination');
    pagContainer.innerHTML = paginationHTML;

    // Add event listeners
    pagContainer.querySelectorAll('.page-btn').forEach(btn => {
      if (!btn.disabled) {
        btn.addEventListener('click', () => this.changePage(parseInt(btn.dataset.page)));
      }
    });
  }

  /**
   * Change page
   */
  changePage(page) {
    const totalPages = Math.ceil(this.filteredProjects.length / this.itemsPerPage);
    
    if (page < 1 || page > totalPages) return;
    
    this.currentPage = page;
    this.renderProjects();
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Set up filter buttons
   */
  setupFilters() {
    // Difficulty filter checkboxes
    document.querySelectorAll('.filter-option[data-filter="difficulty"]').forEach(option => {
      const checkbox = option.querySelector('input[type="checkbox"]');
      const value = option.dataset.value;
      
      option.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          checkbox.checked = !checkbox.checked;
        }
        
        if (value === 'all') {
          // Uncheck all others
          document.querySelectorAll('.filter-option[data-filter="difficulty"]').forEach(opt => {
            if (opt !== option) {
              opt.querySelector('input').checked = false;
            }
          });
          this.currentFilters.difficulty = null;
        } else {
          // Uncheck "all"
          document.querySelectorAll('.filter-option[data-filter="difficulty"][data-value="all"]').forEach(opt => {
            opt.querySelector('input').checked = false;
          });
          
          // Get selected difficulty
          const checked = document.querySelectorAll('.filter-option[data-filter="difficulty"]:not([data-value="all"]) input:checked');
          this.currentFilters.difficulty = checked.length > 0 ? checked[0].closest('.filter-option').dataset.value : null;
        }
        
        this.applyFilters();
      });
    });

    // Price Range
    const priceRange = document.getElementById('price-range');
    const priceValue = document.getElementById('price-value');
    if (priceRange && priceValue) {
      priceRange.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        priceValue.textContent = val >= 2000 ? '₹2000+' : `₹${val}`;
      });

      priceRange.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        this.currentFilters.maxPrice = val >= 2000 ? 999999 : val;
        this.applyFilters();
      });
    }

    // Reset filters button
    const resetBtn = document.getElementById('reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.clearFilters();
      });
    }
  }

  /**
   * Set up search
   */
  setupSearch() {
    const searchInput = document.getElementById('search-input');
    
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.currentFilters.search = e.target.value;
          this.applyFilters();
        }, 300);
      });
    }
  }

  /**
   * Apply all filters
   */
  async applyFilters() {
    console.log('🔍 Applying filters:', this.currentFilters);
    
    // Reset to page 1
    this.currentPage = 1;
    
    // Apply client-side filtering
    this.applyClientFilters();
    
    // Re-render
    this.renderProjects();
  }

  /**
   * Clear all filters
   */
  clearFilters() {
    this.currentFilters = {
      difficulty: null,
      search: '',
      maxPrice: 30000
    };
    
    // Reset checkboxes
    document.querySelectorAll('.filter-option[data-filter="difficulty"]').forEach(opt => {
      const checkbox = opt.querySelector('input');
      checkbox.checked = opt.dataset.value === 'all';
    });
    
    // Clear search
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    
    // Reset price
    const priceRange = document.getElementById('price-range');
    const priceValue = document.getElementById('price-value');
    if (priceRange) priceRange.value = 2000;
    if (priceValue) priceValue.textContent = '₹2000+';
    
    // Reload
    this.applyFilters();
  }

  /**
   * Attach click handlers to project cards
   */
  attachProjectHandlers() {
    document.querySelectorAll('[data-action="view-project"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectId = e.target.dataset.projectId;
        this.viewProject(projectId);
      });
    });

    // Card click (entire card clickable)
    document.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger if button was clicked
        if (e.target.closest('button')) return;
        
        const projectId = card.dataset.projectId;
        this.viewProject(projectId);
      });
    });
  }

  /**
   * Navigate to project details
   */
  viewProject(projectId) {
    window.location.href = `/pages/project-details.html?id=${projectId}`;
  }
}

// Initialize marketplace when DOM is ready
let marketplace;

document.addEventListener('DOMContentLoaded', () => {
  // Wait for api to be available
  if (window.api) {
    marketplace = new MarketplaceController();
    window.marketplace = marketplace;
  } else {
    console.error('❌ API service not available');
    // Try again in a bit
    setTimeout(() => {
      if (window.api) {
        marketplace = new MarketplaceController();
        window.marketplace = marketplace;
      }
    }, 500);
  }
});
