const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const uploadRoot = path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, '../uploads')
);
const maxProjectFileSize = Number(process.env.MAX_FILE_SIZE || 100 * 1024 * 1024);

const dirs = {
  projects: path.join(uploadRoot, 'projects'),
  mentors: path.join(uploadRoot, 'mentors'),
  documents: path.join(uploadRoot, 'documents'),
  certificates: path.join(uploadRoot, 'certificates'),
};

Object.values(dirs).forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const uniqueFilename = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, `${uuidv4()}-${Date.now()}${ext}`);
};

const projectStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dirs.projects),
  filename: uniqueFilename,
});

const mentorStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dirs.mentors),
  filename: uniqueFilename,
});

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dirs.documents),
  filename: uniqueFilename,
});

const projectFileFilter = (_req, file, cb) => {
  const allowedMimes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/json',
    'text/plain',
  ]);
  cb(allowedMimes.has(file.mimetype) ? null : new Error(`File type ${file.mimetype} not allowed for projects`), allowedMimes.has(file.mimetype));
};

const mentorFileFilter = (_req, file, cb) => {
  const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  cb(allowedMimes.has(file.mimetype) ? null : new Error(`File type ${file.mimetype} not allowed for mentor profiles`), allowedMimes.has(file.mimetype));
};

const documentFileFilter = (_req, file, cb) => {
  const allowedMimes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ]);
  cb(allowedMimes.has(file.mimetype) ? null : new Error(`File type ${file.mimetype} not allowed for documents`), allowedMimes.has(file.mimetype));
};

const uploadProject = multer({
  storage: projectStorage,
  fileFilter: projectFileFilter,
  limits: { fileSize: maxProjectFileSize, files: 10 },
});

const uploadMentorProfile = multer({
  storage: mentorStorage,
  fileFilter: mentorFileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 3 },
});

const uploadDocuments = multer({
  storage: documentStorage,
  fileFilter: documentFileFilter,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

// Generic uploads are intentionally confined to the documents directory.
const uploadGeneric = multer({
  storage: documentStorage,
  limits: { fileSize: maxProjectFileSize },
});

const handleUploadError = (err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File exceeds the configured upload limit.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
};

module.exports = {
  uploadProject,
  uploadMentorProfile,
  uploadDocuments,
  uploadGeneric,
  handleUploadError,
  uploadRoot,
};
