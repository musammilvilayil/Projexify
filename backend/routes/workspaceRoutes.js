const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');
const ProjectWorkspace = require('../models/ProjectWorkspace');
const Project = require('../models/Project');
const Center = require('../models/Center');
const Progress = require('../models/Progress');
const { verifyToken } = require('../middleware/auth');

// Configure multer for ZIP uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

// Generic single-file upload handler (for multipart/form-data)
const uploadSingle = multer({ storage });

/**
 * POST /api/workspaces/:projectId/upload-zip
 * Upload ZIP file and extract into workspace
 */
router.post('/:projectId/upload-zip', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    // Verify project exists and user is authorized
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Authorization:
    // - center_admin can upload for projects under their center (shared workspace)
    // - mentor can upload for projects assigned to them (shared workspace)
    // - student can upload if enrolled in project (personal workspace)
    let isAuthorized = false;

    if (req.user.role === 'center_admin') {
      const center = await Center.findById(project.centerId).select('admin_id');
      isAuthorized = !!center && String(center.admin_id) === String(req.user.id);
    } else if (req.user.role === 'mentor') {
      isAuthorized = !!project.mentor_id && String(project.mentor_id) === String(req.user.id);
      if (!isAuthorized) {
        const mentorProgress = await Progress.findOne({ projectId, assignedMentorId: req.user.id }).select('_id');
        isAuthorized = !!mentorProgress;
      }
    } else if (req.user.role === 'student') {
      const enrollment = await Progress.findOne({ projectId, studentId: req.user.id }).select('_id');
      isAuthorized = !!enrollment;
    }

    if (!isAuthorized) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const isPersonalWorkspace = req.user.role === 'student';
    const targetStudentId = isPersonalWorkspace ? req.user.id : null;
    const workspacePath = isPersonalWorkspace
      ? path.join(__dirname, `../uploads/workspaces/${projectId}/students/${req.user.id}`)
      : path.join(__dirname, `../uploads/workspaces/${projectId}`);

    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    // Extract ZIP to workspace
    await new Promise((resolve, reject) => {
      const stream = require('stream');
      stream.Readable.from([file.buffer])
        .pipe(unzipper.Extract({ path: workspacePath }))
        .on('close', resolve)
        .on('error', reject);
    });

    // Scan workspace and create manifest
    const fileTree = scanDirectory(workspacePath);
    const totalSize = calculateDirectorySize(workspacePath);
    const fileCount = countFiles(workspacePath);

    // Shared workspace uses studentId: null, personal uses studentId: current student
    let workspace = await ProjectWorkspace.findOne({ projectId, studentId: targetStudentId });
    if (workspace) {
      workspace.files = fileTree;
      workspace.workspacePath = workspacePath;
      workspace.metadata = {
        zipFileName: file.originalname,
        originalZipSize: file.size,
        extractedSize: totalSize,
        fileCount,
        uploadedAt: new Date(),
      };
      workspace.updated_at = new Date();
    } else {
      // Create workspace record (shared or personal depending on role)
      workspace = new ProjectWorkspace({
        projectId,
        studentId: targetStudentId,
        workspacePath,
        files: fileTree,
        metadata: {
          zipFileName: file.originalname,
          originalZipSize: file.size,
          extractedSize: totalSize,
          fileCount,
          uploadedAt: new Date(),
        },
      });
    }

    await workspace.save();

    res.json({
      message: 'Workspace created successfully',
      workspace: {
        projectId,
        fileCount: workspace.files.length,
        totalSize,
        status: workspace.status,
      },
    });
  } catch (error) {
    console.error('Error uploading workspace:', error);
    res.status(500).json({ message: 'Error uploading workspace', error: error.message });
  }
});

/**
 * GET /api/workspaces/:projectId/files
 * Get file tree for workspace
 */
router.get('/:projectId/files', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    // First try to find student's personal workspace, then fall back to shared workspace (studentId: null)
    let workspace = await ProjectWorkspace.findOne({ projectId, studentId: req.user.id }).select('files metadata');
    
    if (!workspace) {
      // Try shared workspace uploaded by center admin
      workspace = await ProjectWorkspace.findOne({ projectId, studentId: null }).select('files metadata');
    }
    
    if (!workspace) {
      // Return empty workspace structure instead of 404
      return res.json({
        files: [],
        metadata: {
          lastModified: new Date(),
          totalFiles: 0,
          totalSize: 0
        }
      });
    }

    // Map file entries to include size for frontend rendering
    const files = (workspace.files || []).map(f => ({
      path: f.path,
      type: f.type || 'file',
      size: f.size_bytes !== undefined ? f.size_bytes : (f.size || 0)
    }));

    res.json({
      files,
      metadata: workspace.metadata,
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ message: 'Error fetching files' });
  }
});

/**
 * GET /api/workspaces/:projectId/files/:filePath
 * Get file content
 */
router.get('/:projectId/files/*', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const filePath = req.params[0]; // Gets everything after /files/

    // Verify access - check student's personal workspace first, then shared workspace
    let workspace = await ProjectWorkspace.findOne({ projectId, studentId: req.user.id });
    
    if (!workspace) {
      // Try shared workspace uploaded by center admin
      workspace = await ProjectWorkspace.findOne({ projectId, studentId: null });
    }
    
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const fullPath = path.join(__dirname, `../uploads/workspaces/${projectId}/${filePath}`);

    // Prevent path traversal
    const normalizedPath = path.normalize(fullPath);
    const basePath = path.normalize(path.join(__dirname, `../uploads/workspaces/${projectId}`));
    if (!normalizedPath.startsWith(basePath)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if file or directory
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      const files = fs.readdirSync(fullPath);
      return res.json({ isDirectory: true, files });
    }

    // Read file content
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({
      filePath,
      content,
      size: stats.size,
      modified: stats.mtime,
    });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ message: 'Error reading file' });
  }
});

/**
 * PUT /api/workspaces/:projectId/files/:filePath
 * Update file content
 */
router.put('/:projectId/files/*', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const filePath = req.params[0];
    const { content } = req.body;

    // Find student's personal workspace
    let workspace = await ProjectWorkspace.findOne({ projectId, studentId: req.user.id });
    
    if (!workspace) {
      // Check if there's a shared workspace to copy from
      const sharedWorkspace = await ProjectWorkspace.findOne({ projectId, studentId: null });
      
      // Create student's personal workspace
      const workspacePath = path.join(__dirname, `../uploads/workspaces/${projectId}`);
      if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
      }
      
      workspace = new ProjectWorkspace({
        projectId,
        studentId: req.user.id,
        workspacePath,
        files: sharedWorkspace ? [...sharedWorkspace.files] : [], // Copy files from shared workspace
        metadata: sharedWorkspace ? { ...sharedWorkspace.metadata } : {
          uploadedAt: new Date(),
          fileCount: 0,
        }
      });
      await workspace.save();
    }

    const fullPath = path.join(__dirname, `../uploads/workspaces/${projectId}/${filePath}`);

    // Prevent path traversal
    const normalizedPath = path.normalize(fullPath);
    const basePath = path.normalize(path.join(__dirname, `../uploads/workspaces/${projectId}`));
    if (!normalizedPath.startsWith(basePath)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Write file (create parents if needed)
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');

    // Update modified_at in database
    const existing = workspace.files.find(f => f.path === filePath);
    if (existing) {
      existing.modified_at = new Date();
      existing.size_bytes = Buffer.byteLength(content || '');
    } else {
      const mongoose = require('mongoose');
      workspace.files.push({
        file_id: new mongoose.Types.ObjectId().toString(),
        path: filePath,
        name: filePath.split('/').pop(),
        type: 'file',
        size_bytes: Buffer.byteLength(content || ''),
        createdBy: req.user.id,
        created_at: new Date(),
        modified_at: new Date(),
      });
    }

    await workspace.save();

    res.json({ message: 'File updated', filePath });
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({ message: 'Error updating file' });
  }
});

/**
 * POST /api/workspaces/:projectId/files
 * Create new file
 */
router.post('/:projectId/files', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    // If multipart/form-data, handle a single file upload
    if (req.is('multipart/form-data')) {
      return uploadSingle.single('file')(req, res, async (err) => {
        if (err) {
          console.error('Upload error:', err);
          return res.status(500).json({ message: 'Error uploading file' });
        }

        try {
          const file = req.file;
          const bodyPath = req.body.path || '';

          // Ensure workspace record and directory exist
          let workspace = await ProjectWorkspace.findOne({ projectId });
          const workspacePath = path.join(__dirname, `../uploads/workspaces/${projectId}`);
          if (!workspace) {
            if (!fs.existsSync(workspacePath)) {
              fs.mkdirSync(workspacePath, { recursive: true });
            }
            workspace = new ProjectWorkspace({
              projectId,
              studentId: req.user.id,
              workspacePath,
              files: [],
              metadata: { uploadedAt: new Date(), fileCount: 0 }
            });
          }

          // Determine destination path
          const filename = file.originalname;
          const targetRelPath = bodyPath ? `${bodyPath}/${filename}` : filename;
          const targetFullPath = path.join(workspacePath, targetRelPath);

          // Write file to disk
          fs.mkdirSync(path.dirname(targetFullPath), { recursive: true });
          fs.writeFileSync(targetFullPath, file.buffer);

          // Add file entry to DB
          const mongoose = require('mongoose');
          workspace.files.push({
            file_id: new mongoose.Types.ObjectId().toString(),
            path: targetRelPath,
            name: filename,
            type: 'file',
            size_bytes: file.size,
            createdBy: req.user.id,
            created_at: new Date(),
            modified_at: new Date(),
          });
          await workspace.save();

          return res.json({ message: 'File uploaded', filePath: targetRelPath });
        } catch (error) {
          console.error('Error handling file upload:', error);
          return res.status(500).json({ message: 'Error uploading file' });
        }
      });
    }
    // Accept both payload shapes (path/type) and (filePath/isFolder)
    const filePath = req.body.filePath || req.body.path;
    const content = req.body.content || '';
    const isFolder = (req.body.isFolder !== undefined) ? req.body.isFolder : (req.body.type === 'folder');

    let workspace = await ProjectWorkspace.findOne({ projectId });
    if (!workspace) {
      // Auto-create workspace record and directory on first create
      const workspacePath = path.join(__dirname, `../uploads/workspaces/${projectId}`);
      if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
      }
      workspace = new ProjectWorkspace({
        projectId,
        studentId: req.user.id,
        workspacePath,
        files: [],
        metadata: {
          uploadedAt: new Date(),
          fileCount: 0,
        }
      });
    }

    const fullPath = path.join(__dirname, `../uploads/workspaces/${projectId}/${filePath}`);

    // Prevent path traversal
    const normalizedPath = path.normalize(fullPath);
    const basePath = path.normalize(path.join(__dirname, `../uploads/workspaces/${projectId}`));
    if (!normalizedPath.startsWith(basePath)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (isFolder) {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      // Create parent directories if needed
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
    }

    // Update database
    const mongoose = require('mongoose');
    workspace.files.push({
      file_id: new mongoose.Types.ObjectId().toString(),
      path: filePath,
      name: filePath.split('/').pop(),
      type: isFolder ? 'folder' : 'file',
      size_bytes: isFolder ? 0 : Buffer.byteLength(content),
      createdBy: req.user.id,
      created_at: new Date(),
      modified_at: isFolder ? undefined : new Date(),
    });
    await workspace.save();

    res.json({ message: 'File/Folder created', filePath });
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ message: 'Error creating file' });
  }
});

/**
 * DELETE /api/workspaces/:projectId/files/:filePath
 * Delete file or folder
 */
router.delete('/:projectId/files/*', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const filePath = req.params[0];

    const workspace = await ProjectWorkspace.findOne({ projectId, studentId: req.user.id });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const fullPath = path.join(__dirname, `../uploads/workspaces/${projectId}/${filePath}`);

    // Prevent path traversal
    const normalizedPath = path.normalize(fullPath);
    const basePath = path.normalize(path.join(__dirname, `../uploads/workspaces/${projectId}`));
    if (!normalizedPath.startsWith(basePath)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Delete file or folder
    if (fs.statSync(fullPath).isDirectory()) {
      fs.rmSync(fullPath, { recursive: true });
    } else {
      fs.unlinkSync(fullPath);
    }

    // Update database
    await ProjectWorkspace.updateOne({ projectId }, { $pull: { files: { path: filePath } } });

    res.json({ message: 'File deleted', filePath });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ message: 'Error deleting file' });
  }
});

/**
 * PUT /api/workspaces/:projectId/files/:oldPath/rename
 * Rename file
 */
router.put('/:projectId/files/*/rename', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const oldPath = req.params[0];
    const { newPath } = req.body;

    const workspace = await ProjectWorkspace.findOne({ projectId, studentId: req.user.id });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const oldFullPath = path.join(__dirname, `../uploads/workspaces/${projectId}/${oldPath}`);
    const newFullPath = path.join(__dirname, `../uploads/workspaces/${projectId}/${newPath}`);

    // Prevent path traversal
    const normalizedOldPath = path.normalize(oldFullPath);
    const normalizedNewPath = path.normalize(newFullPath);
    const basePath = path.normalize(path.join(__dirname, `../uploads/workspaces/${projectId}`));
    if (!normalizedOldPath.startsWith(basePath) || !normalizedNewPath.startsWith(basePath)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    fs.renameSync(oldFullPath, newFullPath);

    // Update database
    await ProjectWorkspace.updateOne(
      { projectId, 'files.path': oldPath },
      { $set: { 'files.$.path': newPath } }
    );

    res.json({ message: 'File renamed', oldPath, newPath });
  } catch (error) {
    console.error('Error renaming file:', error);
    res.status(500).json({ message: 'Error renaming file' });
  }
});

// ==================== HELPER FUNCTIONS ====================

function scanDirectory(dir, prefix = '') {
  const files = [];
  const items = fs.readdirSync(dir);

  items.forEach((item) => {
    const fullPath = path.join(dir, item);
    const relativePath = prefix ? `${prefix}/${item}` : item;
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      files.push({
        path: relativePath,
        type: 'folder',
        size: 0,
        created_at: stats.birthtime,
        modified_at: stats.mtime,
      });
      files.push(...scanDirectory(fullPath, relativePath));
    } else {
      files.push({
        path: relativePath,
        type: 'file',
        size: stats.size,
        contentType: getContentType(item),
        created_at: stats.birthtime,
        modified_at: stats.mtime,
      });
    }
  });

  return files;
}

function calculateDirectorySize(dir) {
  let size = 0;
  const items = fs.readdirSync(dir);

  items.forEach((item) => {
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      size += calculateDirectorySize(fullPath);
    } else {
      size += stats.size;
    }
  });

  return size;
}

function countFiles(dir) {
  let count = 0;
  const items = fs.readdirSync(dir);

  items.forEach((item) => {
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      count += countFiles(fullPath);
    } else {
      count += 1;
    }
  });

  return count;
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.py': 'text/x-python',
    '.java': 'text/x-java',
    '.cpp': 'text/x-c++src',
  };
  return types[ext] || 'text/plain';
}

module.exports = router;
