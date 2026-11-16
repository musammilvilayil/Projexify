const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { verifyToken } = require('../middleware/auth');
const fsx = require('../utils/workspaceFs');
const { prepare, syncRecord } = require('../services/workspaceService');

const { HttpError, MAX_FILE_BYTES } = fsx;

// ZIP uploads (kept in memory, validated before extraction)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || /\.zip$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Only ZIP files are allowed'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Single file uploads from the file manager
const uploadSingle = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const maybeMultipart = (req, res, next) =>
  req.is('multipart/form-data') ? uploadSingle.single('file')(req, res, next) : next();

/** Wrap an async handler so HttpErrors become JSON responses instead of 500s. */
const handle = (label, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error(`[Workspace] ${label}:`, error);
    res.status(500).json({ message: `Error ${label}` });
  }
};

const toClientEntry = (e) => ({ path: e.path, type: e.type, size: e.size });

/**
 * POST /api/workspaces/:projectId/upload-zip
 * Staff upload to the shared baseline; students upload into their private workspace.
 */
router.post('/:projectId/upload-zip', verifyToken, upload.single('file'), handle('uploading workspace', async (req, res) => {
  const roles = (req.user && req.user.roles) || [];
  if (!roles.some((r) => ['admin', 'center_admin', 'mentor'].includes(r))) throw new HttpError(403, 'Only staff can upload a workspace ZIP');
  if (!req.file) throw new HttpError(400, 'No file provided');
  const ctx = await prepare(req, { write: true });
  const { fileCount, totalBytes } = fsx.extractZipBuffer(AdmZip, req.file.buffer, ctx.root, {
    reserveStudents: ctx.isShared,
  });
  const summary = await syncRecord(ctx, {
    zipFileName: req.file.originalname,
    originalZipSize: req.file.size,
    uploadedAt: new Date(),
  });
  res.json({
    message: 'Workspace created successfully',
    workspace: {
      projectId: ctx.projectId,
      fileCount: summary ? summary.fileCount : fileCount,
      totalSize: summary ? summary.totalSize : totalBytes,
      status: 'active',
      scope: ctx.isShared ? 'shared' : 'personal',
    },
  });
}));

/**
 * GET /api/workspaces/:projectId/files
 * File tree. Students see their own copy (or the shared baseline until they edit);
 * assigned mentors / center admins can add ?studentId= to view one student's work (read only).
 */
router.get('/:projectId/files', verifyToken, handle('fetching files', async (req, res) => {
  const ctx = await prepare(req);
  const entries = fsx.listTree(ctx.root, { skipStudents: ctx.isShared });
  res.json({
    files: entries.map(toClientEntry),
    metadata: {
      lastModified: new Date(),
      totalFiles: entries.filter((e) => e.type === 'file').length,
      totalSize: entries.reduce((n, e) => n + e.size, 0),
      scope: ctx.isShared ? 'shared' : 'personal',
      readOnly: ctx.readOnly,
    },
  });
}));

/** GET /api/workspaces/:projectId/files/* - file content */
router.get('/:projectId/files/*', verifyToken, handle('reading file', async (req, res) => {
  const ctx = await prepare(req);
  const { full, clean } = fsx.safeResolve(ctx.root, req.params[0], { reserveStudents: ctx.isShared });
  if (!fs.existsSync(full)) throw new HttpError(404, 'File not found');

  const stats = fs.statSync(full);
  if (stats.isDirectory()) {
    return res.json({ isDirectory: true, files: fs.readdirSync(full).filter((n) => !(ctx.isShared && clean === '' && n === 'students')) });
  }
  if (stats.size > 5 * 1024 * 1024) throw new HttpError(413, 'File is too large to open in the editor');
  res.json({
    filePath: clean,
    content: fs.readFileSync(full, 'utf-8'),
    size: stats.size,
    modified: stats.mtime,
    readOnly: ctx.readOnly,
  });
}));

/**
 * PUT /api/workspaces/:projectId/files/*\/rename
 * NOTE: must be registered before the generic PUT .../files/* route, otherwise the
 * wildcard swallows it and the "rename" request would overwrite a file.
 */
router.put('/:projectId/files/*/rename', verifyToken, handle('renaming file', async (req, res) => {
  const ctx = await prepare(req, { write: true });
  const { newPath } = req.body || {};
  const from = fsx.safeResolve(ctx.root, req.params[0], { reserveStudents: ctx.isShared });
  const to = fsx.safeResolve(ctx.root, newPath, { reserveStudents: ctx.isShared });

  if (!fs.existsSync(from.full)) throw new HttpError(404, 'File not found');
  if (fs.existsSync(to.full)) throw new HttpError(409, 'A file with that name already exists');
  fs.mkdirSync(path.dirname(to.full), { recursive: true });
  fs.renameSync(from.full, to.full);
  await syncRecord(ctx);
  res.json({ message: 'File renamed', oldPath: from.clean, newPath: to.clean });
}));

/** PUT /api/workspaces/:projectId/files/* - save file content */
router.put('/:projectId/files/*', verifyToken, handle('updating file', async (req, res) => {
  const content = req.body && req.body.content !== undefined ? req.body.content : '';
  if (typeof content !== 'string') throw new HttpError(400, 'File content must be text');
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new HttpError(413, 'File is too large (max 2 MB)');

  const ctx = await prepare(req, { write: true });
  const { full, clean } = fsx.safeResolve(ctx.root, req.params[0], { reserveStudents: ctx.isShared });
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) throw new HttpError(400, 'Path is a folder');

  const isNew = !fs.existsSync(full);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  if (isNew) await syncRecord(ctx);
  res.json({ message: 'File updated', filePath: clean });
}));

/** POST /api/workspaces/:projectId/files - create a file/folder (JSON) or upload one file (multipart) */
router.post('/:projectId/files', verifyToken, maybeMultipart, handle('creating file', async (req, res) => {
  const ctx = await prepare(req, { write: true });

  if (req.is('multipart/form-data')) {
    if (!req.file) throw new HttpError(400, 'No file provided');
    const folder = req.body.path ? fsx.cleanRelativePath(req.body.path) : '';
    const target = fsx.safeResolve(ctx.root, folder ? `${folder}/${path.basename(req.file.originalname)}` : path.basename(req.file.originalname), { reserveStudents: ctx.isShared });
    fs.mkdirSync(path.dirname(target.full), { recursive: true });
    fs.writeFileSync(target.full, req.file.buffer);
    await syncRecord(ctx);
    return res.json({ message: 'File uploaded', filePath: target.clean });
  }

  // Accept both payload shapes (path/type) and (filePath/isFolder)
  const filePath = req.body.filePath || req.body.path;
  const content = req.body.content === undefined ? '' : req.body.content;
  const isFolder = req.body.isFolder !== undefined ? !!req.body.isFolder : req.body.type === 'folder';
  if (typeof content !== 'string') throw new HttpError(400, 'File content must be text');
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new HttpError(413, 'File is too large (max 2 MB)');

  const target = fsx.safeResolve(ctx.root, filePath, { reserveStudents: ctx.isShared });
  if (fs.existsSync(target.full)) throw new HttpError(409, 'A file or folder with that name already exists');

  if (isFolder) {
    fs.mkdirSync(target.full, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(target.full), { recursive: true });
    fs.writeFileSync(target.full, content, 'utf-8');
  }
  await syncRecord(ctx);
  res.status(201).json({ message: 'File/Folder created', filePath: target.clean });
}));

/** DELETE /api/workspaces/:projectId/files/* */
router.delete('/:projectId/files/*', verifyToken, handle('deleting file', async (req, res) => {
  const ctx = await prepare(req, { write: true });
  const { full, clean } = fsx.safeResolve(ctx.root, req.params[0], { reserveStudents: ctx.isShared });
  if (!fs.existsSync(full)) throw new HttpError(404, 'File not found');

  if (fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true });
  else fs.unlinkSync(full);
  await syncRecord(ctx);
  res.json({ message: 'File deleted', filePath: clean });
}));

module.exports = router;
