const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessThread } = require('../../backend/services/chatAccess');

const P = '1'.repeat(24), S = '2'.repeat(24), S2 = '3'.repeat(24), M = '4'.repeat(24), M2 = '5'.repeat(24), CA = '6'.repeat(24);
const models = (projMentor = M) => ({
  Project: { findById: () => ({ select: async () => ({ _id: P, centerId: 'c1', mentor_id: projMentor }) }) },
  Center: { findById: () => ({ select: async () => ({ admin_id: CA }) }) },
  Progress: { findOne: (q) => ({ select: async () =>
    (q.projectId === P && q.studentId === S) ? { assignedMentorId: M } : null }) },
});
const u = (id, ...roles) => ({ id, roles });
const can = (user, studentId = S, m = models()) => canAccessThread({ user, projectId: P, studentId }, m);

test('the student and their mentor can use the thread', async () => {
  assert.equal((await can(u(S, 'student'))).allowed, true);
  assert.equal((await can(u(M, 'mentor'))).allowed, true);
});
test('other students, unrelated mentors and anonymous are denied (REST POST /send used to allow everyone)', async () => {
  assert.equal((await can(u(S2, 'student'))).allowed, false);
  assert.equal((await can(u(M2, 'mentor'), S, models(M))).allowed, false);
  assert.equal((await canAccessThread({ user: null, projectId: P, studentId: S }, models())).allowed, false);
});
test('a student not enrolled has no thread; bad ids are rejected', async () => {
  assert.equal((await can(u(S2, 'student'), S2)).allowed, false);
  assert.equal((await can(u(S, 'student'), 'nope')).allowed, false);
});
test('center admin only for their own center, admin for all', async () => {
  assert.equal((await can(u(CA, 'center_admin'))).allowed, true);
  assert.equal((await can(u('7'.repeat(24), 'center_admin'))).allowed, false);
  assert.equal((await can(u('8'.repeat(24), 'admin'))).allowed, true);
});
test('a mentor assigned only at project level (no per-student assignment) is allowed', async () => {
  const m = models(M2);
  m.Progress = { findOne: () => ({ select: async () => ({ assignedMentorId: null }) }) };
  assert.equal((await can(u(M2, 'mentor'), S, m)).allowed, true);
});
