// Socket.io Client - Real-time communication
class SocketClient {
  constructor(namespace = '/virtual-lab') {
    this.namespace = namespace;
    this.socket = null;
    this.connected = false;
  }

  connect() {
    const token = localStorage.getItem('token');
    this.socket = io(this.namespace, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('Connected to virtual lab');
      this.connected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from virtual lab');
      this.connected = false;
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return this.socket;
  }

  joinSession(sessionId, groupId, userId, role) {
    this.socket.emit('join-session', {
      sessionId,
      groupId,
      userId,
      role,
    });
  }

  sendCodeChange(sessionId, groupId, code, userId, role) {
    this.socket.emit('code-change', {
      sessionId,
      groupId,
      code,
      userId,
      role,
    });
  }

  updateCursorPosition(sessionId, userId, line, column, role) {
    this.socket.emit('cursor-move', {
      sessionId,
      userId,
      line,
      column,
      role,
    });
  }

  requestHint(sessionId, groupId, code, error, language) {
    this.socket.emit('request-hint', {
      sessionId,
      groupId,
      code,
      error,
      language,
    });
  }

  endSession(sessionId, durationMinutes) {
    this.socket.emit('end-session', {
      sessionId,
      durationMinutes,
    });
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Create global instances
window.labSocket = new SocketClient('/virtual-lab');
window.notificationSocket = new SocketClient('/notifications');
