const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { FakeIo, mockModule, thenable } = require('./helpers/fakeIo');

const id = (c) => c.repeat(24);
const MENTOR = id('a'), S1 = id('b'), S2 = id('c'), STRANGER = id('d'), PROJECT = id('e'), SESSION = id('f'), GROUP = id('1'), LABSESSION = id('2'), ENDED = id('3');

// ---- in-memory data + model fakes ----
const calls = { sessionUpdates: [], vlsUpdates: [], progressMany: [], progressOne: [] };
const sessions = {
  [SESSION]: { _id: SESSION, mentorId: MENTOR, studentIds: [S1, S2], projectId: PROJECT, status: 'active', isInstant: true, groupId: null, labCode: '// saved earlier\n' },
  [ENDED]: { _id: ENDED, mentorId: MENTOR, studentIds: [S1], projectId: PROJECT, status: 'completed' },
};
const groups = {
  [GROUP]: { _id: GROUP, projectId: PROJECT, mentorId: null, students: [S1] }, // no mentor yet: used to crash on .toString()
};
const labSessions = { [LABSESSION]: { _id: LABSESSION, groupId: GROUP, projectId: PROJECT, status: 'active' } };
const model = (store) => ({ findById: (i) => thenable(store[String(i)] || null) });

const base = path.join(__dirname, '../../backend');
mockModule(`${base}/models/Session.js`, { ...model(sessions), findByIdAndUpdate: (i, u) => { calls.sessionUpdates.push({ id: i, u }); return thenable({}); } });
mockModule(`${base}/models/VirtualLabSession.js`, { ...model(labSessions), findByIdAndUpdate: (i, u) => { calls.vlsUpdates.push({ id: i, u }); return thenable({}); } });
mockModule(`${base}/models/StudentGroup.js`, model(groups));
mockModule(`${base}/models/Project.js`, model({ [PROJECT]: { _id: PROJECT, status: 'active' } }));
mockModule(`${base}/models/User.js`, { findById: () => thenable({ _id: MENTOR }) });
mockModule(`${base}/models/Progress.js`, {
  findOne: () => thenable({ _id: 'p1' }),
  updateOne: (f, u) => { calls.progressOne.push({ f, u }); return thenable({}); },
  updateMany: (f, u) => { calls.progressMany.push({ f, u }); return thenable({}); },
});

const labSocket = require(`${base}/sockets/labSocket.js`);

const setup = () => {
  Object.values(calls).forEach((a) => (a.length = 0));
  const io = new FakeIo();
  const mod = labSocket(io);
  const ns = io.of('/virtual-lab');
  return { io, mod, ns };
};
const user = (uid, ...roles) => ({ id: uid, roles });

test('mentor and invited students join a mentor session; roles come from the database', async () => {
  const { ns } = setup();
  const m = ns.connect(user(MENTOR, 'mentor'));
  const s = ns.connect(user(S1, 'student'));
  await m.trigger('join-session', { sessionId: SESSION });
  await s.trigger('join-session', { sessionId: SESSION, role: 'mentor' /* client lies */ });
  assert.equal(m.got('session-joined')[0].payload.role, 'mentor');
  assert.equal(s.got('session-joined')[0].payload.role, 'student');
  assert.equal(s.got('session-joined')[0].payload.code, '// saved earlier\n');
  assert.equal(m.got('user-joined').length, 1); // mentor was told the student arrived
  assert.ok(calls.progressOne.length >= 1); // student's enrollment moved to in_progress
});

test('strangers, ended sessions, bad ids and individual-* ids are rejected (individual path was an open hole)', async () => {
  const { ns } = setup();
  const x = ns.connect(user(STRANGER, 'student'));
  await x.trigger('join-session', { sessionId: SESSION });
  await x.trigger('join-session', { sessionId: SESSION, groupId: `individual-${STRANGER}` });
  await x.trigger('join-session', { sessionId: 'not-an-id' });
  const s = ns.connect(user(S1, 'student'));
  await s.trigger('join-session', { sessionId: ENDED });
  assert.equal(x.got('join-session-failed').length, 3);
  assert.equal(x.got('session-joined').length, 0);
  assert.equal(s.got('join-session-failed')[0].payload.message, 'This session has ended');
});

test('code relays to others (not back to sender), persists debounced to the Session, and outsiders cannot inject', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { ns } = setup();
  const m = ns.connect(user(MENTOR, 'mentor'));
  const s = ns.connect(user(S1, 'student'));
  const outsider = ns.connect(user(STRANGER, 'student'));
  await m.trigger('join-session', { sessionId: SESSION });
  await s.trigger('join-session', { sessionId: SESSION });
  await s.trigger('code-change', { code: 'let a = 1;', filePath: 'index.js' });
  await s.trigger('code-change', { code: 'let a = 2;', filePath: 'index.js' });
  await outsider.trigger('code-change', { code: 'hacked' });
  assert.equal(m.got('code-update').length, 2);
  assert.equal(m.got('code-update')[1].payload.code, 'let a = 2;');
  assert.equal(m.got('code-update')[1].payload.role, 'student');
  assert.equal(s.got('code-update').length, 0);
  assert.equal(calls.sessionUpdates.length, 0); // debounced
  t.mock.timers.tick(1600);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.sessionUpdates.length, 1);
  assert.equal(calls.sessionUpdates[0].id, SESSION);
  assert.equal(calls.sessionUpdates[0].u.labCode, 'let a = 2;'); // last write wins, one DB write
  assert.equal(calls.vlsUpdates.length, 0); // previously wrote to the wrong collection (silent no-op)
});

test('oversized / non-string code and terminal payloads are ignored', async () => {
  const { ns } = setup();
  const m = ns.connect(user(MENTOR, 'mentor'));
  const s = ns.connect(user(S1, 'student'));
  await m.trigger('join-session', { sessionId: SESSION });
  await s.trigger('join-session', { sessionId: SESSION });
  await s.trigger('code-change', { code: 'x'.repeat(600000) });
  await s.trigger('code-change', { code: { evil: true } });
  await s.trigger('terminal-output', { output: 'y'.repeat(50000) });
  assert.equal(m.got('code-update').length, 0);
  assert.equal(m.got('terminal-update')[0].payload.output.length, 10000);
});

test('students cannot send mentor feedback, request hints or end the session; mentors can', async () => {
  const { ns } = setup();
  const m = ns.connect(user(MENTOR, 'mentor'));
  const s = ns.connect(user(S1, 'student'));
  await m.trigger('join-session', { sessionId: SESSION });
  await s.trigger('join-session', { sessionId: SESSION });

  await s.trigger('send-feedback', { message: 'fake mentor note' });
  await s.trigger('request-hint', { error: 'x' });
  await s.trigger('end-session', {});
  assert.equal(s.got('error').length, 2);
  assert.equal(s.got('hint-error').length, 1);
  assert.equal(m.got('feedback-received').length, 0);
  assert.equal(calls.progressMany.length, 0);

  await m.trigger('send-feedback', { message: 'Nice work', lineNumber: 3, filePath: 'index.js' });
  assert.equal(s.got('feedback-received')[0].payload.message, 'Nice work');
  assert.equal(calls.sessionUpdates.at(-1).u.$push.labFeedback.message, 'Nice work');

  await m.trigger('request-hint', {}); // no error text: used to throw on error.substring
  assert.equal(m.got('hint-response').length, 1);
});

test('ending a session saves state, credits only attending students, caps progress at 100 and notifies the room', async () => {
  const { ns } = setup();
  const m = ns.connect(user(MENTOR, 'mentor'));
  const s = ns.connect(user(S1, 'student')); // S2 never joins
  await m.trigger('join-session', { sessionId: SESSION });
  await s.trigger('join-session', { sessionId: SESSION });
  await s.trigger('code-change', { code: 'final();' });
  await m.trigger('end-session', {});

  const end = calls.sessionUpdates.at(-1).u;
  assert.equal(end.status, 'completed');
  assert.equal(end.labCode, 'final();');
  const credit = calls.progressMany[0];
  assert.deepEqual(credit.f.studentId.$in, [S1]);
  assert.equal(credit.f.groupId, undefined); // no group for mentor sessions (individual-... used to break the cast)
  assert.ok(Array.isArray(credit.u), 'pipeline update so $min can cap at 100');
  assert.deepEqual(credit.u[0].$set.completion_percentage.$min[0], 100);
  assert.equal(s.got('session-ended').length, 1);
  assert.equal(m.got('session-ended').length, 1);
});

test('group sessions: members join (even with no mentor yet); outsiders and mismatched groups are rejected', async () => {
  const { ns } = setup();
  const member = ns.connect(user(S1, 'student'));
  const outsider = ns.connect(user(S2, 'student'));
  await member.trigger('join-session', { sessionId: LABSESSION, groupId: GROUP });
  await outsider.trigger('join-session', { sessionId: LABSESSION, groupId: GROUP });
  await member.trigger('join-session', { sessionId: LABSESSION, groupId: id('9') });
  assert.equal(member.got('session-joined').length, 1);
  assert.equal(member.got('session-joined')[0].payload.role, 'student');
  assert.equal(outsider.got('join-session-failed')[0].payload.message, 'You are not a member of this group');
  assert.equal(member.got('join-session-failed')[0].payload.message, 'Session not found');
  await member.trigger('code-change', { code: 'group code' });
});

test('notifications namespace only ever subscribes a user to their own room', async () => {
  const { io } = setup();
  const ns = io.of('/notifications');
  const a = ns.connect(user(S1, 'student'));
  const spy = ns.connect(user(STRANGER, 'student'));
  await spy.trigger('subscribe-user', S1); // used to let anyone listen to anyone
  ns.to(`user-${S1}`).emit('notification', { secret: true });
  assert.equal(a.got('notification').length, 1);
  assert.equal(spy.got('notification').length, 0);
});

test('cleanupOrphanedSessions is null-safe (admin deleting a mentor passes groupId=null)', async () => {
  const { ns, mod } = setup();
  const m = ns.connect(user(MENTOR, 'mentor'));
  const s = ns.connect(user(S1, 'student'));
  await m.trigger('join-session', { sessionId: SESSION });
  await s.trigger('join-session', { sessionId: SESSION });
  assert.equal(mod.cleanupOrphanedSessions(MENTOR, null), 1);
  assert.equal(s.got('session-terminated-admin').length, 1);
  assert.equal(mod.cleanupOrphanedSessions(null, null), 0);
});
