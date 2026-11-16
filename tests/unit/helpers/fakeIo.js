/** Minimal in-memory Socket.IO stand-in: namespaces, rooms, per-socket handlers and an event log. */
class FakeSocket {
  constructor(ns, { id, userId, email, roles }) {
    this.ns = ns; this.id = id; this.userId = userId; this.userEmail = email; this.userRoles = roles || [];
    this.rooms = new Set(); this.handlers = {}; this.received = []; // events emitted directly to this socket
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  join(room) { this.rooms.add(room); }
  emit(ev, payload) { this.received.push({ ev, payload }); }
  to(room) { return { emit: (ev, payload) => this.ns.deliver(room, ev, payload, this.id) }; }
  async trigger(ev, data) { if (this.handlers[ev]) await this.handlers[ev](data); }
  got(ev) { return this.received.filter((r) => r.ev === ev); }
}

class FakeNamespace {
  constructor(name) { this.name = name; this.sockets = new Map(); this.onConnection = null; }
  on(ev, fn) { if (ev === 'connection') this.onConnection = fn; }
  use() {}
  to(room) { return { emit: (ev, payload) => this.deliver(room, ev, payload, null) }; }
  deliver(room, ev, payload, exceptId) {
    for (const s of this.sockets.values()) {
      if (s.id !== exceptId && s.rooms.has(room)) s.emit(ev, payload);
    }
  }
  connect(user) {
    const socket = new FakeSocket(this, { id: `s${this.sockets.size + 1}-${user.id}`, userId: user.id, email: user.email || `${user.id}@x.io`, roles: user.roles });
    this.sockets.set(socket.id, socket);
    this.onConnection(socket);
    return socket;
  }
  disconnect(socket) { this.sockets.delete(socket.id); socket.handlers.disconnect && socket.handlers.disconnect(); }
}

class FakeIo {
  constructor() { this.nsps = new Map(); }
  of(name) { if (!this.nsps.has(name)) this.nsps.set(name, new FakeNamespace(name)); return this.nsps.get(name); }
  on(ev, fn) { this.of('/').on(ev, fn); }
  to(room) { return this.of('/').to(room); }
}

/** Replace a module in require.cache with a fake (works for files that exist on disk). */
function mockModule(relPathFromTest, exportsObj) {
  const resolved = require.resolve(relPathFromTest);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

const thenable = (val) => {
  const q = { lean: async () => val, select: () => q, exec: async () => val, then: (res, rej) => Promise.resolve(val).then(res, rej) };
  return q;
};

module.exports = { FakeIo, mockModule, thenable };
