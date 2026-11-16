/**
 * Workspace service: ties access rules (workspaceFs) to the real models and storage root.
 * Shared by workspaceRoutes and aiRoutes so every write goes through the same checks.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const ProjectWorkspace = require('../models/ProjectWorkspace');
const Project = require('../models/Project');
const Center = require('../models/Center');
const Progress = require('../models/Progress');
const { uploadRoot } = require('../middleware/upload');
const fsx = require('../utils/workspaceFs');

const workspacesBase = path.join(uploadRoot, 'workspaces');

/**
 * Resolve who the caller is acting as and which directory to use.
 * write=true  -> returns the directory the caller may modify (students get a private copy)
 * write=false -> returns the directory to read from
 */
async function prepare(req, { write = false } = {}) {
  const { projectId } = req.params.projectId ? req.params : req.body || {};
  const studentId = req.query ? req.query.studentId : undefined;
  const access = await fsx.resolveWorkspaceAccess(
    { projectId, user: req.user, studentId },
    { Project, Center, Progress }
  );
  const { shared, personal } = fsx.workspaceRoots(workspacesBase, projectId, access.ownerStudentId);

  if (write) {
    if (access.readOnly) throw new fsx.HttpError(403, 'You are viewing a read-only copy');
    if (access.kind === 'student') {
      fsx.ensurePersonalRoot(shared, personal);
      return { ...access, projectId, shared, personal, root: personal, isShared: false };
    }
    fs.mkdirSync(shared, { recursive: true });
    return { ...access, projectId, shared, personal: null, root: shared, isShared: true };
  }

  const usePersonal = personal && fs.existsSync(personal);
  return {
    ...access,
    projectId,
    shared,
    personal,
    root: usePersonal ? personal : shared,
    isShared: !usePersonal,
  };
}

/** Keep the ProjectWorkspace record in step with disk (best effort: disk is the source of truth). */
async function syncRecord(ctx, extraMetadata = {}) {
  try {
    const entries = fsx.listTree(ctx.root, { skipStudents: ctx.isShared });
    const files = entries.map((e) => ({
      file_id: randomUUID(),
      path: e.path,
      name: path.posix.basename(e.path),
      type: e.type,
      size_bytes: e.size,
      created_at: e.modified_at,
      modified_at: e.modified_at,
    }));
    const onlyFiles = entries.filter((e) => e.type === 'file');
    const totalSize = onlyFiles.reduce((n, e) => n + e.size, 0);
    const studentId = ctx.kind === 'student' ? ctx.ownerStudentId : null;
    const set = {
      workspacePath: ctx.root,
      files,
      updated_at: new Date(),
      'metadata.fileCount': onlyFiles.length,
      'metadata.extractedSize': totalSize,
    };
    for (const [k, v] of Object.entries(extraMetadata)) set[`metadata.${k}`] = v;
    await ProjectWorkspace.findOneAndUpdate(
      { projectId: ctx.projectId, studentId },
      { $set: set, $setOnInsert: { projectId: ctx.projectId, studentId } },
      { upsert: true }
    );
    return { fileCount: onlyFiles.length, totalSize };
  } catch (error) {
    console.error('[Workspace] Failed to sync workspace record:', error.message);
    return null;
  }
}

module.exports = { prepare, syncRecord, workspacesBase };
