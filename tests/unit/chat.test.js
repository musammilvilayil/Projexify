const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { express, withStubs } = require('./helpers/fakeExpress');
const { FakeIo, mockModule, thenable } = require('./helpers/fakeIo');

const id = (c) => c.repeat(24);
const P = id('1'), S1 = id('a'), S2 = id('b'), M = id('c'), M2 = id('d');
const base = path.join(__dirname, '../../backend');
const saved = [];

const progressRows = [{ projectId: P, studentId: S1, assignedMentorId: M }];
const Progress = {
  findOne: (q) => thenable(progressRows.find((p) => Object.entries(q).every(([k, v]) => String(p[k]) === String(v))) || null),
  find: (q) => thenable(progressRows.filter((p) => String(p.assignedMentorId) === String(q.assignedMentorId))),
};
const Project = { findById: () => thenable({ _id: P, centerId: 'ce', mentor_id: M }) };
const Center = { findById: () => thenable({ admin_id: id('f') }) };
mockModule(`${base}/middleware/auth.js`, { verifyToken: (req, res, next) => next() });
mockModule(`${base}/models/Message.js`, { create: async (d) => { const m = { _id: id('9'), createdAt: new Date(), ...d }; saved.push(m); return m; }, find: () => ({ sort: () => ({ limit: async () => saved }) }) });
mockModule(`${base}/models/Progress.js`, Progress);
mockModule(`${base}/models/Project.js`, Project);
mockModule(`${base}/models/Center.js`, Center);

const router = withStubs({ express }, () => require(`${base}/routes/messageRoutes.js`));
const chatSocket = require(`${base}/sockets/chatSocket.js`);
const as = (uid, ...roles) => ({ id: uid, roles });

test('REST: only the student, their mentor (and staff) can read/post; strangers could post into any thread before', async () => {
  const body = { projectId: P, studentId: S1, message: 'hi' };
  assert.equal((await router.dispatch('POST', '/send', { user: as(S1, 'student'), body })).status, 200);
  assert.equal((await router.dispatch('POST', '/send', { user: as(M, 'mentor'), body })).status, 200);
  assert.equal((await router.dispatch('POST', '/send', { user: as(S2, 'student'), body })).status, 403);
  assert.equal((await router.dispatch('POST', '/send', { user: as(M2, 'mentor'), body })).status, 403);
  assert.equal((await router.dispatch('GET', `/project/${P}/student/${S1}`, { user: as(S2, 'student') })).status, 403);
  assert.equal((await router.dispatch('GET', `/project/${P}/student/${S1}`, { user: as(S1, 'student') })).status, 200);
  assert.equal((await router.dispatch('POST', '/send', { user: as(S1, 'student'), body: { ...body, message: '   ' } })).status, 400);
  assert.equal((await router.dispatch('POST', '/send', { user: as(S1, 'student'), body: { ...body, message: 'x'.repeat(6000) } })).status, 413);
  assert.equal((await router.dispatch('POST', '/send', { user: as(S1, 'student'), body: { ...body, projectId: 'x' } })).status, 400);
  assert.equal(saved.at(-1).senderId, M); // sender is always the authenticated user
});

test('REST send pushes real time to the authorized thread room only', async () => {
  const io = new FakeIo();
  chatSocket(io, { Project, Center, Progress });
  const ns = io.of('/');
  const student = ns.connect(as(S1, 'student'));
  const mentor = ns.connect(as(M, 'mentor'));
  const other = ns.connect(as(S2, 'student'));
  await student.trigger('join-project-room', { projectId: P, studentId: S1 });
  await mentor.trigger('join-project-room', { projectId: P, studentId: S1 });
  await other.trigger('join-project-room', { projectId: P, studentId: S1 }); // tries to join someone else's thread
  assert.equal(other.got('chat-error').length, 1);

  const app = { get: (k) => (k === 'io' ? io : null) };
  await router.dispatch('POST', '/send', { user: as(S1, 'student'), body: { projectId: P, studentId: S1, message: 'help' }, app });
  assert.equal(mentor.got('new-message').length, 1);
  assert.equal(mentor.got('student-message').length, 1); // mentor dashboard listens to this one
  assert.equal(student.got('new-message')[0].payload.senderId, S1);
  assert.equal(other.got('new-message').length, 0);
  assert.equal(other.got('student-message').length, 0);

  await router.dispatch('POST', '/send', { user: as(M, 'mentor'), body: { projectId: P, studentId: S1, message: 'ok' }, app });
  assert.equal(student.got('new-message').length, 2);
  assert.equal(mentor.got('student-message').length, 1); // mentor messages are not "student-message"
});

test('a student cannot open another student thread even by sending that id', async () => {
  const io = new FakeIo(); chatSocket(io, { Project, Center, Progress });
  const s2 = io.of('/').connect(as(S2, 'student'));
  await s2.trigger('join-project-room', { projectId: P, studentId: S1 });
  assert.equal(s2.got('joined-project-room').length, 0);
});

test('mentor presence: students are told when their mentor goes online/offline and can ask for status', async () => {
  const io = new FakeIo(); chatSocket(io, { Project, Center, Progress });
  const ns = io.of('/');
  const student = ns.connect(as(S1, 'student'));
  await student.trigger('request-mentor-status', { projectId: P });
  assert.equal(student.got('mentor-status').at(-1).payload.isOnline, false);

  const mentor = ns.connect(as(M, 'mentor'));
  await new Promise((r) => setImmediate(r));
  assert.equal(student.got('mentor-online').length, 1);
  await student.trigger('request-mentor-status', { projectId: P });
  assert.equal(student.got('mentor-status').at(-1).payload.isOnline, true);

  const second = ns.connect(as(M, 'mentor')); // second tab: still online after one closes
  ns.disconnect(mentor);
  await new Promise((r) => setImmediate(r));
  assert.equal(student.got('mentor-offline').length, 0);
  ns.disconnect(second);
  await new Promise((r) => setImmediate(r));
  assert.equal(student.got('mentor-offline').length, 1);
});
