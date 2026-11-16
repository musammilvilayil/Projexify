const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsx = require('../../backend/utils/workspaceFs');

const A = 'a'.repeat(24); // student A
const B = 'b'.repeat(24); // student B
const P = 'c'.repeat(24); // project
const M = 'd'.repeat(24); // mentor
const OTHER_M = 'e'.repeat(24);
const CA = 'f'.repeat(24); // center admin

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wsfs-'));

test('cleanRelativePath normalises and rejects unsafe input', () => {
  assert.equal(fsx.cleanRelativePath('src\\app.js'), 'src/app.js');
  assert.equal(fsx.cleanRelativePath('./a/../b.js'), 'b.js');
  for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:/win', '..', '', null, 'a\0b']) {
    assert.throws(() => fsx.cleanRelativePath(bad), (e) => e instanceof fsx.HttpError, `should reject ${JSON.stringify(bad)}`);
  }
});

test('safeResolve blocks traversal and sibling-prefix tricks', () => {
  const base = tmp();
  const root = path.join(base, '123');
  const sibling = path.join(base, '1234');
  fs.mkdirSync(root); fs.mkdirSync(sibling);
  assert.ok(fsx.safeResolve(root, 'ok/file.js').full.startsWith(root + path.sep));
  // old code used startsWith(root) so ../1234/x slipped through
  assert.throws(() => fsx.safeResolve(root, '../1234/x'), fsx.HttpError);
  assert.throws(() => fsx.safeResolve(root, 'students/x', { reserveStudents: true }), fsx.HttpError);
  assert.doesNotThrow(() => fsx.safeResolve(root, 'students/x'));
});

test('safeResolve blocks symlink escapes', () => {
  const base = tmp();
  const root = path.join(base, 'ws'); const outside = path.join(base, 'secret');
  fs.mkdirSync(root); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, 'link'));
  assert.throws(() => fsx.safeResolve(root, 'link/passwd'), fsx.HttpError);
});

test('workspaceRoots validates project id (no ../ in URL params)', () => {
  assert.throws(() => fsx.workspaceRoots('/tmp/ws', '../../etc', null), fsx.HttpError);
  const r = fsx.workspaceRoots('/tmp/ws', P, A);
  assert.equal(r.personal, path.join('/tmp/ws', P, 'students', A));
});

test('students get isolated copies: edits by A never reach B or the baseline', () => {
  const base = tmp();
  const { shared, personal: pa } = fsx.workspaceRoots(base, P, A);
  const { personal: pb } = fsx.workspaceRoots(base, P, B);
  fs.mkdirSync(shared, { recursive: true });
  fs.writeFileSync(path.join(shared, 'index.js'), 'baseline');

  fsx.ensurePersonalRoot(shared, pa);
  fs.writeFileSync(path.join(pa, 'index.js'), 'A edit');
  fsx.ensurePersonalRoot(shared, pb);

  assert.equal(fs.readFileSync(path.join(shared, 'index.js'), 'utf8'), 'baseline');
  assert.equal(fs.readFileSync(path.join(pb, 'index.js'), 'utf8'), 'baseline');
  // B's copy must not contain A's private folder
  assert.equal(fs.existsSync(path.join(pb, 'students')), false);
  // baseline listing hides every private workspace
  const names = fsx.listTree(shared, { skipStudents: true }).map((e) => e.path);
  assert.deepEqual(names, ['index.js']);
});

test('extractZipBuffer rejects zip-slip entries and extracts safe ones', () => {
  const mkZip = (entries) => function FakeZip() {
    this.getEntries = () => entries;
  };
  const entry = (name, data = 'x', dir = false) => ({
    entryName: name, isDirectory: dir, header: { size: data.length }, getData: () => Buffer.from(data),
  });
  const dest = tmp();
  const res = fsx.extractZipBuffer(mkZip([entry('src/', '', true), entry('src/a.js', 'hi')]), Buffer.from(''), dest);
  assert.equal(res.fileCount, 1);
  assert.equal(fs.readFileSync(path.join(dest, 'src/a.js'), 'utf8'), 'hi');
  assert.throws(() => fsx.extractZipBuffer(mkZip([entry('../evil.js')]), Buffer.from(''), tmp()), fsx.HttpError);
  assert.throws(() => fsx.extractZipBuffer(mkZip([entry('/abs.js')]), Buffer.from(''), tmp()), fsx.HttpError);
  assert.throws(() => fsx.extractZipBuffer(mkZip([entry('students/x.js')]), Buffer.from(''), tmp(), { reserveStudents: true }), fsx.HttpError);
  const bomb = { entryName: 'big.bin', isDirectory: false, header: { size: 300 * 1024 * 1024 }, getData: () => Buffer.alloc(1) };
  assert.throws(() => fsx.extractZipBuffer(mkZip([bomb]), Buffer.from(''), tmp()), (e) => e.status === 413);
});

// ---- access rules with in-memory fakes ----
const fakeModels = ({ project, progress = [], center = { admin_id: CA } }) => ({
  Project: { findById: async (id) => (String(id) === P ? project : null) },
  Center: { findById: () => ({ select: async () => center }) },
  Progress: {
    findOne: (q) => ({
      select: async () => progress.find((p) =>
        Object.entries(q).every(([k, v]) => String(p[k]) === String(v))) || null,
    }),
  },
});
const project = { _id: P, centerId: 'ce', mentor_id: M };
const progress = [{ projectId: P, studentId: A, assignedMentorId: M }, { projectId: P, studentId: B, assignedMentorId: OTHER_M }];
const user = (id, ...roles) => ({ id, roles });

test('access: enrolled student gets own workspace, others are refused', async () => {
  const m = fakeModels({ project, progress });
  const ok = await fsx.resolveWorkspaceAccess({ projectId: P, user: user(A, 'student') }, m);
  assert.equal(ok.kind, 'student'); assert.equal(ok.ownerStudentId, A);
  await assert.rejects(fsx.resolveWorkspaceAccess({ projectId: P, user: user('9'.repeat(24), 'student') }, m), (e) => e.status === 403);
  // cannot peek at another student's files via ?studentId=
  await assert.rejects(fsx.resolveWorkspaceAccess({ projectId: P, user: user(A, 'student'), studentId: B }, m), (e) => e.status === 403);
});

test('access: mentors only see students they are responsible for, read-only', async () => {
  const m = fakeModels({ project, progress });
  const mentor = await fsx.resolveWorkspaceAccess({ projectId: P, user: user(M, 'mentor'), studentId: A }, m);
  assert.equal(mentor.readOnly, true); assert.equal(mentor.ownerStudentId, A);
  const shared = await fsx.resolveWorkspaceAccess({ projectId: P, user: user(M, 'mentor') }, m);
  assert.equal(shared.readOnly, false); assert.equal(shared.ownerStudentId, null);
  // a mentor with no link to the project is refused
  await assert.rejects(fsx.resolveWorkspaceAccess({ projectId: P, user: user('8'.repeat(24), 'mentor') }, m), (e) => e.status === 403);
  // per-student assigned mentor (project.mentor_id missing) is honoured
  const m2 = fakeModels({ project: { ...project, mentor_id: undefined }, progress });
  const viaProgress = await fsx.resolveWorkspaceAccess({ projectId: P, user: user(OTHER_M, 'mentor'), studentId: B }, m2);
  assert.equal(viaProgress.ownerStudentId, B);
  await assert.rejects(fsx.resolveWorkspaceAccess({ projectId: P, user: user(OTHER_M, 'mentor'), studentId: A }, m2), (e) => e.status === 403);
});

test('access: center admin must own the center; admin always allowed; bad ids rejected', async () => {
  const m = fakeModels({ project, progress });
  assert.equal((await fsx.resolveWorkspaceAccess({ projectId: P, user: user(CA, 'center_admin') }, m)).kind, 'center_admin');
  await assert.rejects(fsx.resolveWorkspaceAccess({ projectId: P, user: user('7'.repeat(24), 'center_admin') }, m), (e) => e.status === 403);
  assert.equal((await fsx.resolveWorkspaceAccess({ projectId: P, user: user('6'.repeat(24), 'admin') }, m)).kind, 'admin');
  await assert.rejects(fsx.resolveWorkspaceAccess({ projectId: '../..', user: user(A, 'student') }, m), (e) => e.status === 400);
  await assert.rejects(fsx.resolveWorkspaceAccess({ projectId: 'f'.repeat(24).replace(/f/g, '1'), user: user(A, 'student') }, m), (e) => e.status === 404);
});
