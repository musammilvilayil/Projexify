/**
 * Jitsi Meet Integration Module
 * Handles video conferencing for Virtual Lab
 */

class JitsiIntegration {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.projectId = options.projectId;
    this.sessionId = options.sessionId;
    this.roomName = options.roomName || (this.sessionId ? `session-${this.sessionId}` : `nexus-project-${this.projectId}`);
    this.displayName = options.displayName || 'User';
    this.isMentor = options.isMentor || false;
    this.domain = options.domain || 'meet.jit.si'; // or your self-hosted domain
    this.token = options.token || localStorage.getItem('token');
    
    this.api = null;
    this.isInitialized = false;
    this.isRecording = false;
    this.meetingSessionId = null;
    this.cameraFallbackApplied = false;
    
    this.onReady = options.onReady || (() => {});
    this.onJoined = options.onJoined || (() => {});
    this.onLeft = options.onLeft || (() => {});
    this.onRecordingStatusChanged = options.onRecordingStatusChanged || (() => {});
    this.onError = options.onError || console.error;
  }

  /**
   * Initialize and load Jitsi iframe
   */
  async init() {
    try {
      // Load Jitsi External API if not already loaded
      await this.loadJitsiScript();

      // Create Jitsi configuration
      const options = {
        roomName: this.roomName,
        width: '100%',
        height: '100%',
        parentNode: this.container,
        configOverwrite: {
          // Allow both mentors and students to share camera and mic
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          startAudioOnly: false,
          enableWelcomePage: false,
          prejoinPageEnabled: false,
          prejoinConfig: {
            enabled: false
          },
          disableDeepLinking: true,
          defaultLanguage: 'en',
          enableNoisyMicDetection: true,
          enableClosePage: false,
          // Enable audio/video controls for all participants
          disableModeratorIndicator: false,
          enableLipSync: true,
          audioLevelsEnabled: true,
          // Allow students to control their own audio/video
          disableAudioLevels: false,
          toolbarButtons: this.getToolbarButtons(),
          conferenceInfo: {
            alwaysVisible: ['recording', 'participants-count']
          }
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          DEFAULT_BACKGROUND: '#1e1e1e',
          DISABLE_VIDEO_BACKGROUND: false,
          TOOLBAR_ALWAYS_VISIBLE: true,
          FILM_STRIP_MAX_HEIGHT: 120,
          MOBILE_APP_PROMO: false,
          // Show video layout for all participants
          VIDEO_LAYOUT_FIT: 'contain',
          // Allow all users to see and hear each other
          DISABLE_PRESENCE_STATUS: false
        },
        userInfo: {
          displayName: this.displayName
        }
      };

      // Initialize Jitsi API
      this.api = new JitsiMeetExternalAPI(this.domain, options);
      
      // Attach event listeners
      this.attachEventListeners();
      
      this.isInitialized = true;
      this.onReady();

      // If mentor, start session on server
      if (this.isMentor) {
        await this.startMeetingSession();
      }

    } catch (error) {
      this.onError(error);
      console.error('Failed to initialize Jitsi:', error);
    }
  }

  /**
   * Load Jitsi External API script dynamically
   */
  loadJitsiScript() {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.JitsiMeetExternalAPI) {
        console.log('[JitsiIntegration] Jitsi API already loaded');
        resolve();
        return;
      }

      console.log('[JitsiIntegration] Loading Jitsi API from:', `https://${this.domain}/external_api.js`);

      const script = document.createElement('script');
      script.src = `https://${this.domain}/external_api.js`;
      script.async = true;
      script.crossOrigin = 'anonymous';
      
      script.onload = () => {
        console.log('[JitsiIntegration] Script loaded, waiting for JitsiMeetExternalAPI...');
        console.log('[JitsiIntegration] Window keys containing "Jitsi":', Object.keys(window).filter(k => k.toLowerCase().includes('jitsi')));
        
        // Wait for JitsiMeetExternalAPI to be available
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds
        
        const checkInterval = setInterval(() => {
          attempts++;
          console.log(`[JitsiIntegration] Attempt ${attempts}/100: Checking for JitsiMeetExternalAPI...`, !!window.JitsiMeetExternalAPI);
          
          if (window.JitsiMeetExternalAPI) {
            clearInterval(checkInterval);
            console.log('[JitsiIntegration] JitsiMeetExternalAPI is now available');
            resolve();
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.error('[JitsiIntegration] Timeout: JitsiMeetExternalAPI not available after 10 seconds');
            console.error('[JitsiIntegration] Available window properties:', Object.keys(window).slice(0, 50));
            reject(new Error('Jitsi API did not load in time'));
          }
        }, 100);
      };
      
      script.onerror = (error) => {
        console.error('[JitsiIntegration] Script loading error:', error);
        reject(new Error('Failed to load Jitsi API - check CSP and network'));
      };
      
      document.head.appendChild(script);
      console.log('[JitsiIntegration] Script tag appended to head');
    });
  }

  /**
   * Get toolbar buttons based on user role
   */
  getToolbarButtons() {
    const commonButtons = [
      'microphone',
      'camera',
      'closedcaptions',
      'desktop',
      'fullscreen',
      'hangup',
      'chat',
      'raisehand',
      'videoquality',
      'filmstrip',
      'tileview',
      'shortcuts',
      'settings'
    ];

    if (this.isMentor) {
      return [...commonButtons, 'recording', 'livestreaming', 'sharedvideo', 'mute-everyone'];
    }

    return commonButtons;
  }

  /**
   * Attach Jitsi event listeners
   */
  attachEventListeners() {
    // Video conference joined
    this.api.addEventListener('videoConferenceJoined', (data) => {
      console.log('[JitsiIntegration] Joined conference:', data);
      this.onJoined(data);
    });

    // Video conference left
    this.api.addEventListener('videoConferenceLeft', (data) => {
      console.log('[JitsiIntegration] Left conference:', data);
      this.onLeft(data);
      
      // If mentor, end session on server
      if (this.isMentor && (this.meetingSessionId || this.sessionId)) {
        this.endMeetingSession();
      }
    });

    // Recording status changed
    this.api.addEventListener('recordingStatusChanged', (data) => {
      console.log('[JitsiIntegration] Recording status:', data);
      this.isRecording = data.on;
      this.onRecordingStatusChanged(data);
      
      // Update server
      if (this.isMentor && (this.meetingSessionId || this.sessionId)) {
        this.updateRecordingStatus(data.on);
      }
    });

    // Participant joined
    this.api.addEventListener('participantJoined', (data) => {
      console.log('[JitsiIntegration] Participant joined:', data);
    });

    // Participant left
    this.api.addEventListener('participantLeft', (data) => {
      console.log('[JitsiIntegration] Participant left:', data);
    });

    // Error occurred
    this.api.addEventListener('errorOccurred', (error) => {
      const normalized = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
      if (normalized.includes('membersonly') || normalized.includes('lobby')) {
        console.warn('[JitsiIntegration] Lobby/members-only gate active. Waiting for moderator admission.', error);
        this.onError({
          type: 'lobby',
          message: 'Lobby is enabled. Join request may require mentor approval.'
        });
        return;
      }

      if (this.isCameraAccessError(normalized)) {
        this.fallbackToAudioOnly('camera-access-failed');
        return;
      }

      console.error('[JitsiIntegration] Jitsi error:', error);
      this.onError(error);
    });

    // Ready to close
    this.api.addEventListener('readyToClose', () => {
      console.log('[JitsiIntegration] Ready to close');
      this.dispose();
    });
  }

  /**
   * Start meeting session on server (mentor only)
   */
  async startMeetingSession() {
    try {
      // If sessionId is provided, use that instead of creating a new one
      if (this.sessionId) {
        this.meetingSessionId = this.sessionId;
        console.log('[JitsiIntegration] Using existing session:', this.meetingSessionId);
        return;
      }

      const response = await fetch(`/api/meetings/start/${this.projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          roomId: this.roomName
        })
      });

      if (!response.ok) throw new Error('Failed to start meeting session');

      const data = await response.json();
      this.meetingSessionId = data.session._id;
      console.log('[JitsiIntegration] Meeting session started:', this.meetingSessionId);

    } catch (error) {
      console.error('[JitsiIntegration] Failed to start meeting session:', error);
    }
  }

  /**
   * End meeting session on server (mentor only)
   */
  async endMeetingSession() {
    const sessionId = this.meetingSessionId || this.sessionId;
    if (!sessionId) return;

    try {
      let response;

      if (this.sessionId) {
        // Scheduled/instant mentorship session from Session model
        response = await fetch(`/api/sessions/${sessionId}/end`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });
      } else {
        // Standalone meeting session from MeetingSession model
        response = await fetch(`/api/meetings/end/${sessionId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });
      }

      if (!response.ok) throw new Error('Failed to end meeting session');

      console.log('[JitsiIntegration] Meeting session ended');
      this.meetingSessionId = null;

    } catch (error) {
      console.error('[JitsiIntegration] Failed to end meeting session:', error);
    }
  }

  /**
   * Update recording status on server
   */
  async updateRecordingStatus(isRecording) {
    const sessionId = this.meetingSessionId || this.sessionId;
    if (!sessionId) return;

    try {
      let response;

      if (this.sessionId) {
        // Scheduled/instant mentorship session recording endpoints
        response = await fetch(`/api/sessions/${sessionId}/${isRecording ? 'start-recording' : 'stop-recording'}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });
      } else {
        // Standalone meeting session endpoint
        response = await fetch(`/api/meetings/${sessionId}/record`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
          },
          body: JSON.stringify({
            isRecording
          })
        });
      }

      if (!response.ok) throw new Error('Failed to update recording status');

      console.log('[JitsiIntegration] Recording status updated:', isRecording);

    } catch (error) {
      console.error('[JitsiIntegration] Failed to update recording status:', error);
    }
  }

  /**
   * Control methods
   */
  toggleAudio() {
    if (this.api) {
      this.api.executeCommand('toggleAudio');
    }
  }

  toggleVideo() {
    if (this.api) {
      this.api.executeCommand('toggleVideo');
    }
  }

  /**
   * Enable audio for the participant
   */
  enableAudio() {
    if (this.api) {
      this.api.isAudioMuted().then((isMuted) => {
        if (isMuted) {
          this.api.executeCommand('toggleAudio');
        }
      });
    }
  }

  /**
   * Enable video for the participant
   */
  enableVideo() {
    if (this.api) {
      this.api.isVideoMuted().then((isMuted) => {
        if (isMuted) {
          this.api.executeCommand('toggleVideo');
        }
      });
    }
  }

  /**
   * Request permission and enable both audio and video
   */
  async enableAudioVideo() {
    try {
      // Let Jitsi own media capture lifecycle to avoid camera lock conflicts.
      this.enableAudio();

      if (!this.cameraFallbackApplied) {
        this.enableVideo();
        console.log('[JitsiIntegration] Audio and video enabled');
      } else {
        console.log('[JitsiIntegration] Camera disabled, continuing with audio only');
      }
    } catch (error) {
      console.error('[JitsiIntegration] Failed to enable audio/video:', error);
      this.onError(error);
    }
  }

  isCameraAccessError(normalizedMessage) {
    return (
      normalizedMessage.includes('notreadableerror') ||
      normalizedMessage.includes('device in use') ||
      normalizedMessage.includes('gum.general') ||
      normalizedMessage.includes('video track creation failed')
    );
  }

  async fallbackToAudioOnly(reason = 'camera-unavailable') {
    if (!this.api || this.cameraFallbackApplied) return;
    this.cameraFallbackApplied = true;

    try {
      const isVideoMuted = await this.isVideoMuted();
      if (!isVideoMuted) {
        this.toggleVideo();
      }
      this.enableAudio();

      console.warn('[JitsiIntegration] Camera unavailable. Session continues with audio only.');
      this.onError({
        type: 'camera-disabled',
        message: 'Camera access failed. Camera turned off and session continued with audio.',
        reason
      });
    } catch (error) {
      console.error('[JitsiIntegration] Failed to switch to audio-only mode:', error);
    }
  }

  toggleShareScreen() {
    if (this.api) {
      this.api.executeCommand('toggleShareScreen');
    }
  }

  toggleChat() {
    if (this.api) {
      this.api.executeCommand('toggleChat');
    }
  }

  toggleFilmStrip() {
    if (this.api) {
      this.api.executeCommand('toggleFilmStrip');
    }
  }

  toggleTileView() {
    if (this.api) {
      this.api.executeCommand('toggleTileView');
    }
  }

  startRecording() {
    if (this.api && this.isMentor) {
      this.api.executeCommand('startRecording', {
        mode: 'file' // or 'stream' for live streaming
      });
    }
  }

  stopRecording() {
    if (this.api && this.isMentor) {
      this.api.executeCommand('stopRecording', 'file');
    }
  }

  hangup() {
    if (this.api) {
      this.api.executeCommand('hangup');
    }
  }

  sendChatMessage(message) {
    if (this.api) {
      this.api.executeCommand('sendChatMessage', message);
    }
  }

  setDisplayName(name) {
    if (this.api) {
      this.api.executeCommand('displayName', name);
    }
  }

  setSubject(subject) {
    if (this.api && this.isMentor) {
      this.api.executeCommand('subject', subject);
    }
  }

  /**
   * Get current state
   */
  getParticipantsInfo() {
    return new Promise((resolve) => {
      if (!this.api) {
        resolve([]);
        return;
      }
      this.api.getParticipantsInfo().then(resolve);
    });
  }

  getNumberOfParticipants() {
    return this.api ? this.api.getNumberOfParticipants() : 0;
  }

  isAudioMuted() {
    return new Promise((resolve) => {
      if (!this.api) {
        resolve(true);
        return;
      }
      this.api.isAudioMuted().then(resolve);
    });
  }

  isVideoMuted() {
    return new Promise((resolve) => {
      if (!this.api) {
        resolve(true);
        return;
      }
      this.api.isVideoMuted().then(resolve);
    });
  }

  /**
   * Cleanup
   */
  dispose() {
    if (this.api) {
      this.api.dispose();
      this.api = null;
    }
    this.isInitialized = false;
    this.sessionId = null;
    this.container.innerHTML = '';
  }

  /**
   * Check if meeting is active for this project
   */
  static async checkMeetingStatus(projectId, token) {
    try {
      const response = await fetch(`/api/meetings/status/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('token')}`
        }
      });

      if (!response.ok) return { isMentorOnline: false };

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Failed to check meeting status:', error);
      return { isMentorOnline: false };
    }
  }

  /**
   * Get mentor's schedule for project
   */
  static async getMeetingSchedule(projectId, token) {
    try {
      const response = await fetch(`/api/meetings/schedule/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('token')}`
        }
      });

      if (!response.ok) return null;

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('Failed to get meeting schedule:', error);
      return null;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JitsiIntegration;
}
