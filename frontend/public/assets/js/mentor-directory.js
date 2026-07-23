/**
 * MENTOR DIRECTORY PAGE - Dynamic Mentor Loading
 * Connects to backend API and renders mentors with filters
 */

class MentorDirectoryController {
  constructor() {
    this.currentFilters = {
      search: '',
      expertise: null,
      rating: null
    };
    
    this.allMentors = [];
    this.filteredMentors = [];
    
    this.init();
  }

  async init() {
    console.log('👨‍🏫 Initializing Mentor Directory...');
    
    // Set up event listeners
    this.setupFilters();
    this.setupSearch();
    
    // Load initial mentors
    await this.loadMentors();
  }

  /**
   * Load mentors from API
   */
  async loadMentors() {
    const container = document.getElementById('mentors-grid');
    if (!container) {
      console.error('Mentors grid container not found');
      return;
    }

    try {
      // Show loading state
      showLoading('mentors-grid', 'grid');

      // Fetch mentors from API
      const response = await window.nexusData.getMentors(this.currentFilters);
      
      this.allMentors = response.users || response || [];
      this.filteredMentors = this.allMentors;
      
      console.log(`✅ Loaded ${this.allMentors.length} mentors`);

      // Render mentors
      this.renderMentors();
      
    } catch (error) {
      console.error('Failed to load mentors:', error);
      showError('mentors-grid', error);
    }
  }

  /**
   * Render mentors to DOM
   */
  renderMentors() {
    const container = document.getElementById('mentors-grid');
    if (!container) return;

    // Handle empty state
    if (this.filteredMentors.length === 0) {
      showEmptyState('mentors-grid', {
        icon: '👨‍🏫',
        title: 'No mentors found',
        description: 'Try adjusting your filters to discover expert mentors.',
        actionText: 'Clear Filters',
        actionCallback: () => this.clearFilters()
      });
      return;
    }

    // Generate HTML
    container.innerHTML = this.filteredMentors.map(mentor => this.renderMentorCard(mentor)).join('');

    // Add click handlers
    this.attachMentorHandlers();
  }

  /**
   * Render a single mentor card
   */
  renderMentorCard(mentor) {
    const {
      _id,
      firstName,
      lastName,
      email,
      expertise = [],
      bio = 'Experienced mentor passionate about helping students succeed.',
      rating = 4.8,
      projects_count = 0,
      students_mentored = 0,
      verified = true,
      avatar_url = null
    } = mentor;

    const name = firstName ? `${firstName} ${lastName}` : (mentor.name || 'Expert Mentor');

    // Truncate bio
    const shortBio = bio?.substring(0, 120) + (bio?.length > 120 ? '...' : '');

    return `
      <div class="glass-card mentor-card" data-mentor-id="${_id}" style="padding: 0; overflow: hidden; display: flex; flex-direction: column;">
        <div style="height: 100px; background: var(--gradient-primary); opacity: 0.15; position: relative;"></div>
        
        <div style="padding: 0 2rem 2rem; margin-top: -50px; flex-grow: 1; display: flex; flex-direction: column; align-items: center; text-align: center;">
          <div style="width: 100px; height: 100px; border-radius: 50%; background: var(--gradient-primary); border: 4px solid var(--bg-main); box-shadow: var(--shadow-glow); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; font-weight: 800; color: white; margin-bottom: 1.5rem; overflow: hidden;">
            ${avatar_url ? `<img src="${avatar_url}" style="width: 100%; height: 100%; object-fit: cover;">` : name.charAt(0)}
          </div>

          <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--text-main);">${name}</h3>
          
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
            <span style="color: #f59e0b;">★</span>
            <span style="font-weight: 600; font-size: 0.9rem;">${rating.toFixed(1)}</span>
            <span style="color: var(--text-dim); font-size: 0.8rem;">• ${projects_count} Projects</span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-bottom: 1.5rem;">
            ${expertise.slice(0, 3).map(skill => `<span class="tag" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">${skill}</span>`).join('')}
          </div>

          <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; margin-bottom: 2rem;">
            ${shortBio}
          </p>

          <div style="margin-top: auto; width: 100%; display: flex; gap: 1rem;">
            <button class="btn btn-primary view-profile-btn" style="flex: 1;" data-id="${_id}">
              View Profile
            </button>
            <button class="btn btn-secondary" style="padding: 0 1rem;">
              ✉️
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Set up filter dropdowns
   */
  setupFilters() {
    // Add event delegation for view profile buttons
    const container = document.getElementById('mentors-grid');
    if (container) {
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-profile-btn');
        if (btn) {
          const id = btn.getAttribute('data-id');
          window.location.href = `/pages/mentor-details.html?id=${id}`;
        }
      });
    }

    // Expertise filter
    const expertiseFilter = document.getElementById('expertise-filter');
    if (expertiseFilter) {
      expertiseFilter.addEventListener('change', (e) => {
        this.currentFilters.expertise = e.target.value || null;
        this.applyFilters();
      });
    }

    // Rating filter
    const ratingFilter = document.getElementById('rating-filter');
    if (ratingFilter) {
      ratingFilter.addEventListener('change', (e) => {
        this.currentFilters.rating = e.target.value ? parseFloat(e.target.value) : null;
        this.applyFilters();
      });
    }
  }

  /**
   * Set up search
   */
  setupSearch() {
    const searchInput = document.getElementById('search-input');
    
    if (searchInput) {
      const debouncedSearch = debounce((value) => {
        this.currentFilters.search = value;
        this.applyFilters();
      }, 300);

      searchInput.addEventListener('input', (e) => {
        debouncedSearch(e.target.value);
      });
    }
  }

  /**
   * Apply all filters
   */
  async applyFilters() {
    console.log('🔍 Applying filters:', this.currentFilters);
    
    // Reload mentors with filters
    await this.loadMentors();
  }

  /**
   * Clear all filters
   */
  clearFilters() {
    this.currentFilters = {
      search: '',
      expertise: null,
      rating: null
    };
    
    // Reset form inputs
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    
    const expertiseFilter = document.getElementById('expertise-filter');
    if (expertiseFilter) expertiseFilter.value = '';
    
    const ratingFilter = document.getElementById('rating-filter');
    if (ratingFilter) ratingFilter.value = '';
    
    // Reload
    this.applyFilters();
  }

  /**
   * Attach click handlers to mentor cards
   */
  attachMentorHandlers() {
    document.querySelectorAll('[data-action="view-mentor"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mentorId = e.target.dataset.mentorId;
        this.viewMentor(mentorId);
      });
    });

    // Card click (entire card clickable)
    document.querySelectorAll('.mentor-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger if button was clicked
        if (e.target.closest('button')) return;
        
        const mentorId = card.dataset.mentorId;
        this.viewMentor(mentorId);
      });
    });
  }

  /**
   * Navigate to mentor profile
   */
  viewMentor(mentorId) {
    // For now, show a toast - in production, this would go to a detailed profile page
    showToast(`Viewing mentor profile: ${mentorId}`, 'info');
    // window.location.href = `/pages/mentor-profile.html?id=${mentorId}`;
  }
}

// Initialize mentor directory when DOM is ready
let mentorDirectory;

document.addEventListener('DOMContentLoaded', () => {
  // Wait for nexusData to be available
  if (window.nexusData) {
    mentorDirectory = new MentorDirectoryController();
  } else {
    console.error('❌ nexusData service not available');
  }
});

// Make mentorDirectory globally accessible
window.mentorDirectory = mentorDirectory;
