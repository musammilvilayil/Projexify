const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Ensure upload directories exist
const uploadDirs = [
  'backend/uploads/projects',
  'backend/uploads/mentors',
  'backend/uploads/documents',
  'backend/uploads/certificates'
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Configure multer for project file uploads (images, documents, code archives)
 */
const projectStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'backend/uploads/projects');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const projectFileFilter = (req, file, cb) => {
  // Allowed file types for projects: images, PDFs, archives
  const allowedMimes = [
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
    'text/plain'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed for projects`), false);
  }
};

/**
 * Configure multer for mentor profile uploads (avatar, credentials)
 */
const mentorStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'backend/uploads/mentors');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const mentorFileFilter = (req, file, cb) => {
  // Allowed file types for mentor profiles: images, PDFs (credentials)
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed for mentor profiles`), false);
  }
};

/**
 * Configure multer for document uploads (terms, guidelines, agreements)
 */
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'backend/uploads/documents');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const documentFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed for documents`), false);
  }
};

/**
 * Project upload middleware (multiple files: thumbnail, description, code)
 */
const uploadProject = multer({
  storage: projectStorage,
  fileFilter: projectFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max (matches frontend validation)
    files: 10 // Max 10 files (matches project routes)
  }
});

/**
 * Mentor profile upload middleware
 */
const uploadMentorProfile = multer({
  storage: mentorStorage,
  fileFilter: mentorFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 3 // Avatar, credential1, credential2
  }
});

/**
 * Document upload middleware (for center verification, agreements)
 */
const uploadDocuments = multer({
  storage: documentStorage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max
    files: 10
  }
});

/**
 * Generic file upload with custom destination
 */
const uploadGeneric = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = req.query.uploadDir || 'backend/uploads/documents';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max
  }
});

/**
 * Middleware to handle upload errors
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Max allowed is 100MB per file.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Max allowed is 10 files.' });
    }
    return res.status(400).json({ error: err.message });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};

module.exports = {
  uploadProject,
  uploadMentorProfile,
  uploadDocuments,
  uploadGeneric,
  handleUploadError
};
