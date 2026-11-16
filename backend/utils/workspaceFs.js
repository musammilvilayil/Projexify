/**
 * Workspace filesystem + access helpers.
 *
 * Layout on disk (under <uploadRoot>/workspaces):
 *   <projectId>/                      shared baseline, written by center admins / mentors
 *   <projectId>/students/<studentId>/ a student's private copy (copy-on-first-write)
 *
 * Everything here is free of Express/Mongoose so it can be unit tested.
 */
const fs = require('fs');
const path = require('path');

const RESERVED_TOP_LEVEL = 'students';
const MAX_FILE_BYTES = 2 * 1024 * 1024;        // single file save
const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNCOMPRESSED = 200 * 1024 * 1024; // zip-bomb guard

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isObjectId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

/** Normalise a client supplied relative path ("a\\b/../c" -> "c"). Throws on anything unsafe. */
function cleanRelativePath(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 500) {
    throw new HttpError(400, 'Invalid file path');
  }
  if (rel.includes('\0')) throw new HttpError(400, 'Invalid file path');
  const unified = rel.replace(/\\/g, '/');
  if (unified.startsWith('/') || /^[A-Za-z]:/.test(unified)) {
    throw new HttpError(403, 'Access denied');
  }
  const normalized = path.posix.normalize(unified).replace(/^\.\//, '');
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new HttpError(403, 'Access denied');
  }
  return normalized.replace(/\/+$/, '');
}

/**
 * Resolve a relative path inside `root`, refusing traversal (including sibling-prefix
 * tricks such as /ws/123 vs /ws/1234) and symlink escapes.
 */
function safeResolve(root, rel, { reserveStudents = false } = {}) {
  const clean = cleanRelativePath(rel);
  if (reserveStudents && clean.split('/')[0] === RESERVED_TOP_LEVEL) {
    throw new HttpError(403, 'Access denied');
  }
  const rootAbs = path.resolve(root);
  const full = path.resolve(rootAbs, clean);
  const relation = path.relative(rootAbs, full);
  if (!relation || relation.startsWith('..') || path.isAbsolute(relation)) {
    throw new HttpError(403, 'Access denied');
  }
  // Symlink escape: resolve the deepest existing ancestor
  let probe = full;
  while (!fs.existsSync(probe) && probe !== rootAbs) probe = path.dirname(probe);
  if (fs.existsSync(probe) && fs.existsSync(rootAbs)) {
    const realRoot = fs.realpathSync(rootAbs);
    const realProbe = fs.realpathSync(probe);
    if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) {
      throw new HttpError(403, 'Access denied');
    }
  }
  return { full, clean };
}

function workspaceRoots(workspacesBase, projectId, studentId) {
  if (!isObjectId(String(projectId))) throw new HttpError(400, 'Invalid project id');
  const shared = path.join(path.resolve(workspacesBase), String(projectId));
  const personal = studentId
    ? path.join(shared, RESERVED_TOP_LEVEL, String(studentId))
    : null;
  return { shared, personal };
}

/** Recursively list a directory as [{path,type,size}] (skips the private "students" folder at the top). */
function listTree(root, { skipStudents = false } = {}) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  (function walk(dir, prefix) {
    for (const item of fs.readdirSync(dir)) {
      if (skipStudents && prefix === '' && item === RESERVED_TOP_LEVEL) continue;
      const full = path.join(dir, item);
      const rel = prefix ? `${prefix}/${item}` : item;
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        out.push({ path: rel, type: 'folder', size: 0, modified_at: st.mtime });
        walk(full, rel);
      } else {
        out.push({ path: rel, type: 'file', size: st.size, modified_at: st.mtime });
      }
    }
  })(root, '');
  return out;
}

/** Copy the shared baseline into a student's private root (never copies other students' data). */
function copyBaseline(sharedRoot, personalRoot) {
  fs.mkdirSync(personalRoot, { recursive: true });
  if (!fs.existsSync(sharedRoot)) return;
  (function walk(src, dst, top) {
    for (const item of fs.readdirSync(src)) {
      if (top && item === RESERVED_TOP_LEVEL) continue;
      const s = path.join(src, item);
      const d = path.join(dst, item);
      const st = fs.lstatSync(s);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        walk(s, d, false);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  })(sharedRoot, personalRoot, true);
}

/** Make sure a student's private copy exists, creating it from the baseline on first write. */
function ensurePersonalRoot(sharedRoot, personalRoot) {
  if (!fs.existsSync(personalRoot)) copyBaseline(sharedRoot, personalRoot);
  return personalRoot;
}

/**
 * Validate and extract a ZIP buffer into `destRoot` (adm-zip is injected so tests can run offline).
 * Rejects traversal, absolute paths, too many entries and oversized archives.
 */
function extractZipBuffer(AdmZip, buffer, destRoot, { reserveStudents = false } = {}) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (e) {
    throw new HttpError(400, 'Invalid or corrupt ZIP file');
  }
  const entries = zip.getEntries();
  if (entries.length > MAX_ZIP_ENTRIES) throw new HttpError(413, 'ZIP contains too many files');
  let total = 0;
  for (const entry of entries) total += entry.header.size || 0;
  if (total > MAX_ZIP_UNCOMPRESSED) throw new HttpError(413, 'ZIP is too large when extracted');

  fs.mkdirSync(destRoot, { recursive: true });
  let count = 0;
  for (const entry of entries) {
    const { full } = safeResolve(destRoot, entry.entryName.replace(/\/+$/, '') || '.', { reserveStudents });
    if (entry.isDirectory) {
      fs.mkdirSync(full, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, entry.getData());
      count += 1;
    }
  }
  return { fileCount: count, totalBytes: total };
}

/**
 * Decide what the caller may do in a project's workspace.
 * Returns { project, kind, ownerStudentId, readOnly }.
 *   kind: 'admin' | 'center_admin' | 'mentor' | 'student'
 *   ownerStudentId: whose private files are targeted (null = shared baseline)
 */
async function resolveWorkspaceAccess({ projectId, user, studentId }, { Project, Center, Progress }) {
  if (!isObjectId(String(projectId))) throw new HttpError(400, 'Invalid project id');
  if (studentId !== undefined && studentId !== null && !isObjectId(String(studentId))) {
    throw new HttpError(400, 'Invalid student id');
  }
  const project = await Project.findById(projectId);
  if (!project) throw new HttpError(404, 'Project not found');

  const uid = String(user.id || user._id);
  const roles = user.roles || [];
  let staffKind = null;

  if (roles.includes('admin')) {
    staffKind = 'admin';
  } else if (roles.includes('center_admin')) {
    const center = await Center.findById(project.centerId).select('admin_id');
    if (center && String(center.admin_id) === uid) staffKind = 'center_admin';
  }
  if (!staffKind && roles.includes('mentor')) {
    const isProjectMentor = project.mentor_id && String(project.mentor_id) === uid;
    const assigned = isProjectMentor ? true : !!(await Progress.findOne({ projectId, assignedMentorId: uid }).select('_id'));
    if (assigned) staffKind = 'mentor';
  }

  if (staffKind) {
    if (!studentId) return { project, kind: staffKind, ownerStudentId: null, readOnly: false };
    // Staff looking at one student's private workspace: read only, student must be in the project
    const enrollment = await Progress.findOne({ projectId, studentId }).select('assignedMentorId');
    if (!enrollment) throw new HttpError(404, 'Student is not enrolled in this project');
    if (staffKind === 'mentor') {
      const projectMentor = project.mentor_id && String(project.mentor_id) === uid;
      const studentMentor = enrollment.assignedMentorId && String(enrollment.assignedMentorId) === uid;
      if (!projectMentor && !studentMentor) throw new HttpError(403, 'Not authorized for this student');
    }
    return { project, kind: staffKind, ownerStudentId: String(studentId), readOnly: true };
  }

  if (roles.includes('student')) {
    const enrollment = await Progress.findOne({ projectId, studentId: uid }).select('_id');
    if (enrollment) {
      if (studentId && String(studentId) !== uid) throw new HttpError(403, 'Access denied');
      return { project, kind: 'student', ownerStudentId: uid, readOnly: false };
    }
  }
  throw new HttpError(403, 'Not authorized for this project workspace');
}

module.exports = {
  HttpError,
  RESERVED_TOP_LEVEL,
  MAX_FILE_BYTES,
  isObjectId,
  cleanRelativePath,
  safeResolve,
  workspaceRoots,
  listTree,
  copyBaseline,
  ensurePersonalRoot,
  extractZipBuffer,
  resolveWorkspaceAccess,
};
