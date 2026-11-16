const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { express, withStubs } = require('./helpers/fakeExpress');
const { mockModule, thenable } = require('./helpers/fakeIo');

const id = (c) => c.repeat(24);
const P = id('1'), A = id('a'), B = id('b'), M = id('c'), CA = id('d'), OUT = id('e');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wsroutes-'));
const base = path.join(__dirname, '../../backend');

const records = [];
mockModule(`${base}/middleware/upload.js`, { uploadRoot: root });
mockModule(`${base}/middleware/auth.js`, { verifyToken: (req, res, next) => next() });
mockModule(`${base}/models/Project.js`, { findById: (i) => thenable(String(i) === P ? { _id: P, centerId: 'ce', mentor_id: M } : null) });
mockModule(`${base}/models/Center.js`, { findById: () => thenable({ admin_id: CA }) });
mockModule(`${base}/models/Progress.js`, {
  findOne: (q) => thenable([{ projectId: P, studentId: A, assignedMentorId: M }, { projectId: P, studentId: B, assignedMentorId: M }]
    .find((p) => Object.entries(q).every(([k, v]) => String(p[k]) === String(v))) || null),
});
mockModule(`${base}/models/ProjectWorkspace.js`, { findOneAndUpdate: async (f, u) => { records.push({ f, u }); } });

const multer = () => ({ single: () => (req, res, next) => next() });
multer.memoryStorage = () => ({});
class FakeZip {
  constructor(buf) { this.entries = JSON.parse(buf.toString()); }
  getEntries() { return this.entries.map((e) => ({ entryName: e.name, isDirectory: !!e.dir, header: { size: (e.data || '').length }, getData: () => Buffer.from(e.data || '') })); }
}
const router = withStubs({ express, multer, 'adm-zip': FakeZip }, () => require(`${base}/routes/workspaceRoutes.js`));

const as = (uid, ...roles) => ({ id: uid, roles });
const call = (method, url, user, extra = {}) => router.dispatch(method, url, { user, ...extra });
const zip = (entries) => ({ buffer: Buffer.from(JSON.stringify(entries)), originalname: 'w.zip', size: 10 });

test('center admin uploads a ZIP baseline (this was always 403: code read req.user.role, tokens only have roles)', async () => {
  const r = await call('POST', `/${P}/upload-zip`, as(CA, 'center_admin'), { file: zip([{ name: 'index.js', data: 'baseline' }, { name: 'src/', dir: true }, { name: 'src/util.js', data: 'u' }]) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.workspace.scope, 'shared');
  assert.equal(fs.readFileSync(path.join(root, 'workspaces', P, 'index.js'), 'utf8'), 'baseline');
  assert.equal(records.at(-1).f.studentId, null); // shared record has studentId null (schema used to require it)
});

test('student sees baseline, edits only their own copy; another student and the baseline are unaffected', async () => {
  let list = await call('GET', `/${P}/files`, as(A, 'student'));
  assert.deepEqual(list.body.files.map((f) => f.path).sort(), ['index.js', 'src', 'src/util.js']);

  const save = await call('PUT', `/${P}/files/index.js`, as(A, 'student'), { body: { content: 'A was here' } });
  assert.equal(save.status, 200, JSON.stringify(save.body));

  const a = await call('GET', `/${P}/files/index.js`, as(A, 'student'));
  const b = await call('GET', `/${P}/files/index.js`, as(B, 'student'));
  const shared = await call('GET', `/${P}/files/index.js`, as(CA, 'center_admin'));
  assert.equal(a.body.content, 'A was here');
  assert.equal(b.body.content, 'baseline');      // used to show A's edit (shared path on disk)
  assert.equal(shared.body.content, 'baseline');

  list = await call('GET', `/${P}/files`, as(CA, 'center_admin'));
  assert.ok(!list.body.files.some((f) => f.path.startsWith('students')), 'baseline listing must never expose students/');
});

test('rename works and is not swallowed by the wildcard save route', async () => {
  const create = await call('POST', `/${P}/files`, as(A, 'student'), { body: { filePath: 'notes/todo.txt', content: 'x' } });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const r = await call('PUT', `/${P}/files/notes/todo.txt/rename`, as(A, 'student'), { body: { newPath: 'notes/done.txt' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(String(r.body.message), /renamed/);
  const ls = await call('GET', `/${P}/files`, as(A, 'student'));
  const names = ls.body.files.map((f) => f.path);
  assert.ok(names.includes('notes/done.txt') && !names.includes('notes/todo.txt'));
  assert.ok(!names.includes('notes/todo.txt/rename'), 'old behaviour created a file literally named ".../rename"');
  const clash = await call('PUT', `/${P}/files/notes/done.txt/rename`, as(A, 'student'), { body: { newPath: 'index.js' } });
  assert.equal(clash.status, 409);
});

test('delete only affects the caller copy', async () => {
  const d = await call('DELETE', `/${P}/files/src/util.js`, as(A, 'student'));
  assert.equal(d.status, 200);
  assert.equal((await call('GET', `/${P}/files/src/util.js`, as(A, 'student'))).status, 404);
  assert.equal((await call('GET', `/${P}/files/src/util.js`, as(B, 'student'))).status, 200);
});

test('mentor can read a student workspace read-only; cannot write it; unrelated users are refused', async () => {
  const view = await call('GET', `/${P}/files/index.js?studentId=${A}`, as(M, 'mentor'));
  assert.equal(view.body.content, 'A was here');
  assert.equal(view.body.readOnly, true);
  const sharedWrite = await call('PUT', `/${P}/files/index.js`, as(M, 'mentor'), { body: { content: 'mentor baseline' } });
  assert.equal(sharedWrite.status, 200); // mentors maintain the shared baseline
  assert.equal((await call('GET', `/${P}/files/index.js`, as(A, 'student'))).body.content, 'A was here'); // A's copy untouched
  const viewWrite = await call('PUT', `/${P}/files/index.js?studentId=${A}`, as(M, 'mentor'), { body: { content: 'tamper' } });
  assert.equal(viewWrite.status, 403);
  for (const u of [as(OUT, 'student'), as(OUT, 'mentor'), as(OUT, 'center_admin')]) {
    assert.equal((await call('GET', `/${P}/files`, u)).status, 403);
  }
  assert.equal((await call('GET', `/${P}/files?studentId=${B}`, as(A, 'student'))).status, 403); // student peeking at another student
});

test('path traversal, bad project ids and oversize content are rejected', async () => {
  for (const evil of ['../../../etc/passwd', '..%2F..%2Fsecret', 'students/' + B + '/index.js']) {
    const r = await call('GET', `/${P}/files/${evil}`, as(CA, 'center_admin'));
    assert.ok([403, 404].includes(r.status), `${evil} -> ${r.status}`);
  }
  assert.equal((await call('GET', `/..%2F..%2Fetc/files`, as(A, 'student'))).status, 400);
  const big = await call('PUT', `/${P}/files/big.txt`, as(A, 'student'), { body: { content: 'x'.repeat(3 * 1024 * 1024) } });
  assert.equal(big.status, 413);
  const bad = await call('POST', `/${P}/upload-zip`, as(CA, 'center_admin'), { file: zip([{ name: '../../evil.js', data: 'x' }]) });
  assert.equal(bad.status, 403);
  assert.equal(fs.existsSync(path.join(root, 'evil.js')), false);
});

test('students cannot upload a workspace ZIP (staff only), but can create files and folders (201)', async () => {
  const r = await call('POST', `/${P}/upload-zip`, as(B, 'student'), { file: zip([{ name: 'mine.js', data: 'b' }]) });
  assert.equal(r.status, 403);
  const noFile = await call('POST', `/${P}/upload-zip`, as(B, 'student'), {});
  assert.equal(noFile.status, 403);
  const folder = await call('POST', `/${P}/files`, as(B, 'student'), { body: { path: 'src2', type: 'folder' } });
  assert.equal(folder.status, 201);
});
