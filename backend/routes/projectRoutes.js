const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const Center = require('../models/Center');
const StudentGroup = require('../models/StudentGroup');
const User = require('../models/User');
const Progress = require('../models/Progress');
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/auth');
const { uploadProject } = require('../middleware/upload');
const { extractZipAndProcessFiles, cleanupExtractedFiles } = require('../utils/zipExtractor');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function normalizeProjectStatus(status) {
  const mapped = {
    pending: 'inactive',
    completed: 'archived',
    draft: 'inactive',
  };

  const normalized = mapped[status] || status;
  const allowed = ['active', 'inactive', 'archived'];
  return allowed.includes(normalized) ? normalized : 'inactive';
}

// POST /api/projects - Create new project (center admin only)
router.post('/', verifyToken, checkRole('center_admin'), uploadProject.array('projectFiles', 10), async (req, res) => {
  try {
    const { centerId, title, description, abstract, techStack, difficulty, duration, price, maxStudents, capacity, status, category, mentorId } = req.body;

    console.log('Create project request:', {
      centerId,
      title,
      userid: req.user.id,
      filesCount: req.files ? req.files.length : 0,
      mentorId: mentorId,
      capacity: capacity,
      category: category
    });

    // Verify user is admin of this center
    const center = await Center.findOne({ _id: centerId, admin_id: req.user.id });

    if (!center) {
      console.log('Center not found or user not admin:', { centerId, userId: req.user.id });
      return res.status(403).json({ 
        message: 'Not authorized to create projects for this center. Make sure the center exists and you are the admin.',
        details: { centerId, userId: req.user.id }
      });
    }

    // Verify center is approved
    if (center.status !== 'approved') {
      return res.status(400).json({ 
        message: `Cannot create projects for center with status: ${center.status}. Center must be approved.`,
        centerStatus: center.status
      });
    }

    const slug = title.toLowerCase().replace(/\s+/g, '-');

    // Process uploaded files - extract ZIPs and store as assets
    let assets = [];
    let tempExtractDirs = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const fileExt = path.extname(file.filename).toLowerCase();
          
          if (fileExt === '.zip') {
            // Extract ZIP file
            const extractDir = path.join(__dirname, '../uploads/projects/extracted', path.basename(file.filename, path.extname(file.filename)));
            tempExtractDirs.push(extractDir);
            
            const extractedFiles = await extractZipAndProcessFiles(file.path, extractDir);
            
            // Add extracted files as assets
            assets.push(...extractedFiles.files.map(f => ({
              ...f,
              uploaded_at: new Date()
            })));
            
            console.log(`[ProjectCreate] Extracted ${extractedFiles.files.length} files from ZIP: ${file.originalname}`);
          } else {
            // Regular file
            const fileAsset = {
              originalName: file.originalname,
              filename: file.filename,
              title: file.originalname,
              url: `/uploads/projects/${file.filename}`,
              type: getAssetType(fileExt),
              mimeType: file.mimetype,
              size: file.size,
              extension: fileExt,
              uploaded_at: new Date()
            };
            assets.push(fileAsset);
            console.log(`[ProjectCreate] Added file asset: ${file.originalname}`);
          }
        } catch (extractError) {
          console.error(`[ProjectCreate] Error processing file ${file.originalname}:`, extractError);
          throw new Error(`Failed to process file ${file.originalname}: ${extractError.message}`);
        }
      }
    }

    const project = new Project({
      centerId,
      title,
      slug,
      description: description || '',
      abstract: abstract || '',
      tech_stack: techStack ? JSON.parse(techStack) : [],
      difficulty_level: difficulty || 'intermediate',
      duration_weeks: duration || 12,
      price: price || 0,
      max_students: maxStudents || capacity || 3,
      capacity: capacity || maxStudents || 3,
      category: category || 'general',
      status: normalizeProjectStatus(status),
      content_shield_enabled: true,
      watermark_text: 'Projexify™',
      assets,
      mentor_id: mentorId || null
    });

    await project.save();

    // Clean up temporary extraction directories
    tempExtractDirs.forEach(dir => {
      cleanupExtractedFiles(dir);
    });

    console.log('Project created successfully:', {
      _id: project._id,
      title: project.title,
      mentor_id: project.mentor_id,
      capacity: project.capacity,
      category: project.category
    });

    res.status(201).json({
      message: 'Project created successfully',
      project,
      assetsProcessed: assets.length
    });
  } catch (error) {
    console.error('Error creating project:', error);
    
    // Clean up temporary directories on error
    let tempExtractDirs = [];
    if (req.files) {
      req.files.forEach(file => {
        const extractDir = path.join(__dirname, '../uploads/projects/extracted', path.basename(file.path, path.extname(file.path)));
        if (extractDir) tempExtractDirs.push(extractDir);
      });
    }
    tempExtractDirs.forEach(dir => {
      cleanupExtractedFiles(dir);
    });

    res.status(500).json({ message: 'Error creating project', error: error.message });
  }
});

// POST /api/projects/:id/assign-mentor - Assign a mentor to a project
router.post('/:id/assign-mentor', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { mentorId } = req.body;

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Verify user is admin of the center that owns this project
    const center = await Center.findOne({ _id: project.centerId, admin_id: req.user.id });
    if (!center) {
      return res.status(403).json({ message: 'Not authorized to manage this project' });
    }

    // Verify mentor belongs to this center
    const mentor = await User.findOne({ _id: mentorId, roles: 'mentor', centerId: center._id });
    if (!mentor) {
      return res.status(400).json({ message: 'Mentor not found or does not belong to your center' });
    }

    project.mentor_id = mentorId;
    await project.save();

    res.json({
      message: 'Mentor assigned successfully',
      project
    });
  } catch (error) {
    console.error('Error assigning mentor:', error);
    res.status(500).json({ message: 'Error assigning mentor' });
  }
});

// POST /api/projects/:id/assets - Add asset to project
router.post('/:id/assets', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, url, type, content, language } = req.body;

    const project = await Project.findById(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Verify center admin authority
    const center = await Center.findOne({ _id: project.centerId, admin_id: req.user.id });
    if (!center) return res.status(403).json({ message: 'Access denied' });

    const assetData = { title, type };
    
    // For code files, store content directly
    if (['html', 'js', 'css', 'json', 'txt'].includes(type) && content) {
      assetData.content = content;
      assetData.language = language || type;
    }
    // For other files, store URL
    else if (url) {
      assetData.url = url;
    }

    project.assets.push(assetData);
    await project.save();

    res.json({ message: 'Asset added successfully', assets: project.assets });
  } catch (error) {
    console.error('Error adding asset:', error);
    res.status(500).json({ message: 'Error adding asset' });
  }
});

// GET /api/projects/:id/assets - Get project assets (protected by enrollment)
router.get('/:id/assets', verifyToken, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.id;

    // Check if user is enrolled
    const isEnrolled = await Progress.findOne({ studentId: userId, projectId, payment_status: 'completed' });
    const isMentor = await Project.findOne({ _id: projectId, mentor_id: userId });
    const isCenterAdmin = await Center.findOne({ admin_id: userId }); // Should strictly check if it's the center owning the project, but simplifying for now

    if (!isEnrolled && !isMentor && !isCenterAdmin) {
      return res.status(403).json({ message: 'You must be enrolled to access project assets.' });
    }

    const project = await Project.findById(projectId).select('assets title');
    res.json({ assets: project.assets, projectTitle: project.title });
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ message: 'Error fetching assets' });
  }
});

// GET /api/projects/:id/assets/download - Download all project assets as ZIP
router.get('/:id/assets/download', verifyToken, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.id;

    // Check if user is enrolled
    const isEnrolled = await Progress.findOne({ studentId: userId, projectId, payment_status: 'completed' });
    const isMentor = await Project.findOne({ _id: projectId, mentor_id: userId });
    const isCenterAdmin = await Center.findOne({ admin_id: userId });

    if (!isEnrolled && !isMentor && !isCenterAdmin) {
      return res.status(403).json({ message: 'You must be enrolled to download project assets.' });
    }

    const project = await Project.findById(projectId).select('assets title');
    
    if (!project.assets || project.assets.length === 0) {
      return res.status(404).json({ message: 'No assets found for this project' });
    }

    const AdmZip = require('adm-zip');
    const fs = require('fs');
    const path = require('path');
    
    const zip = new AdmZip();
    
    console.log('Creating ZIP for project:', project.title);
    console.log('Total assets:', project.assets.length);
    
    // Add each asset file to the ZIP
    for (const asset of project.assets) {
      console.log('Processing asset:', asset.title, 'URL:', asset.url);
      
      if (asset.url) {
        // Extract the file path from the URL (remove /uploads/ prefix)
        let filePath;
        
        if (asset.url.startsWith('/uploads/')) {
          const urlPath = asset.url.replace('/uploads/', '');
          filePath = path.join(__dirname, '../uploads', urlPath);
        } else if (asset.url.startsWith('http')) {
          // Skip external URLs
          console.log('Skipping external URL:', asset.url);
          continue;
        } else {
          // Assume it's a relative path from uploads
          filePath = path.join(__dirname, '../uploads', asset.url);
        }
        
        console.log('Looking for file at:', filePath);
        
        try {
          if (fs.existsSync(filePath)) {
            console.log('File exists, adding to ZIP');
            const fileName = asset.originalName || asset.filename || path.basename(filePath);
            
            // Check if it's a file or directory
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              zip.addLocalFile(filePath, '', fileName);
            } else if (stats.isDirectory()) {
              // Add directory recursively
              zip.addLocalFolder(filePath, path.basename(filePath));
            }
          } else {
            console.log('File not found:', filePath);
          }
        } catch (err) {
          console.error(`Error adding file to zip: ${filePath}`, err);
        }
      }
    }
    
    const zipBuffer = zip.toBuffer();
    console.log('ZIP created, size:', zipBuffer.length, 'bytes');
    
    const safeTitle = project.title.replace(/[^a-z0-9]/gi, '_');
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_assets.zip"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (error) {
    console.error('Error creating assets ZIP:', error);
    res.status(500).json({ message: 'Error creating assets ZIP file' });
  }
});

// GET /api/projects/:id/download-files - Download all project files as ZIP
router.get('/:id/download-files', verifyToken, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.id;

    // Check if user is enrolled
    const isEnrolled = await Progress.findOne({ studentId: userId, projectId, payment_status: 'completed' });
    const isMentor = await Project.findOne({ _id: projectId, mentor_id: userId });
    const isCenterAdmin = await Center.findOne({ admin_id: userId });

    if (!isEnrolled && !isMentor && !isCenterAdmin) {
      return res.status(403).json({ message: 'You must be enrolled to download project files.' });
    }

    const project = await Project.findById(projectId).select('assets title');
    
    // For now, return the list of downloadable assets
    // In a real implementation, you would create a ZIP file here
    const downloadableAssets = project.assets.filter(asset => asset.type === 'zip' || asset.type === 'pdf' || asset.type === 'doc');
    
    res.json({
      success: true,
      projectTitle: project.title,
      assets: downloadableAssets,
      message: 'Project files are available for download',
      // In production, this would be a ZIP file URL
      downloadUrl: `/api/projects/${projectId}/assets`
    });
  } catch (error) {
    console.error('Error preparing download:', error);
    res.status(500).json({ message: 'Error preparing project files for download' });
  }
});

// GET /api/projects - List all active projects (public)
router.get('/', async (req, res) => {
  try {
    const { category, difficulty, search, enrolled, centerAdmin, centerId, mentorId, page = 1, limit = 12 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 12;
    const skip = (pageNum - 1) * limitNum;
    
    // Support fetching all projects when limit is -1
    const usePagination = limitNum !== -1;

    let query = { status: 'active' };

    if (difficulty) {
      query.difficulty_level = difficulty;
    }

    if (centerId) {
      query.centerId = centerId;
      delete query.status; // Show all projects for specific center
    }

    if (centerAdmin) {
      const centers = await Center.find({ admin_id: centerAdmin });
      const centerIds = centers.map(c => c._id);
      query.centerId = { $in: centerIds };
      delete query.status; // Show all projects for admin
    }

    if (mentorId) {
      query.mentor_id = mentorId;
      delete query.status; // Show all projects for mentor
    }

    if (enrolled) {
      // This usually requires auth, but we'll handle it via query for now
      // In a real app, we'd use req.user.id from verifyToken
      const groups = await StudentGroup.find({ students: enrolled });
      const projectIds = groups.map(g => g.projectId);
      query._id = { $in: projectIds };
      delete query.status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Project.countDocuments(query);
    
    let projectsQuery = Project.find(query)
      .populate('centerId', 'name')
      .populate('mentor_id', '_id name firstName lastName')
      .sort({ featured: -1, created_at: -1 });
    
    // Apply pagination only if limit is not -1
    if (usePagination) {
      projectsQuery = projectsQuery.limit(limitNum).skip(skip);
    }
    
    const projects = await projectsQuery;

    res.json({
      projects,
      pagination: {
        total,
        page: pageNum,
        limit: usePagination ? limitNum : total,
        pages: usePagination ? Math.ceil(total / limitNum) : 1,
      },
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ message: 'Error fetching projects' });
  }
});

// GET /api/projects/:id - Get project details
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('centerId', 'name')
      .populate('mentor_id', '_id name firstName lastName bio avatar_url');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ message: 'Error fetching project' });
  }
});

// PUT /api/projects/:id - Update project (center admin only)
router.put('/:id', verifyToken, checkRole('center_admin'), uploadProject.array('projectFiles', 10), async (req, res) => {
  try {
    const updates = req.body;
    let tempExtractDirs = [];

    // Normalize status if provided
    if (updates.status) {
      updates.status = normalizeProjectStatus(updates.status);
    }

    // Map field names from frontend to database schema
    if (updates.capacity !== undefined) {
      updates.max_students = updates.capacity;
    }
    if (updates.mentorId !== undefined) {
      updates.mentor_id = updates.mentorId;
      delete updates.mentorId; // Remove old field name
    }
    if (updates.difficulty !== undefined) {
      updates.difficulty_level = updates.difficulty;
      delete updates.difficulty; // Remove old field name
    }
    if (updates.duration !== undefined) {
      updates.duration_weeks = updates.duration;
      delete updates.duration; // Remove old field name
    }
    if (updates.techStack !== undefined) {
      updates.tech_stack = Array.isArray(updates.techStack) ? updates.techStack : (updates.techStack ? [updates.techStack] : []);
      delete updates.techStack; // Remove old field name
    }
    
    // Verify ownership
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const center = await Center.findOne({ _id: project.centerId, admin_id: req.user.id });
    if (!center) {
      return res.status(403).json({ message: 'Not authorized to update this project' });
    }

    // Process uploaded files if any - store uploads as assets to keep update operation stable
    if (req.files && req.files.length > 0) {
      const extractedAssets = [];

      // Extract each file
      for (const file of req.files) {
        try {
          const fileAsset = {
            originalName: file.originalname,
            filename: file.filename,
            title: file.originalname,
            url: `/uploads/projects/${file.filename}`,
            type: getAssetType(path.extname(file.filename)),
            mimeType: file.mimetype,
            size: file.size,
            uploaded_at: new Date()
          };
          extractedAssets.push(fileAsset);
          console.log(`[ProjectUpdate] Added file asset: ${file.originalname}`);
        } catch (extractError) {
          console.error(`[ProjectUpdate] Error processing file ${file.originalname}:`, extractError);
          throw new Error(`Failed to process file ${file.originalname}: ${extractError.message}`);
        }
      }

      // Append new assets to existing ones
      updates.assets = [...(project.assets || []), ...extractedAssets];
      console.log(`[ProjectUpdate] Total assets after processing: ${updates.assets.length}`);
    }

    // Save updates to database
    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    // Clean up temporary extraction directories
    tempExtractDirs.forEach(dir => {
      cleanupExtractedFiles(dir);
    });

    console.log('Project updated successfully:', updatedProject._id, {
      category: updatedProject.category,
      mentor_id: updatedProject.mentor_id,
      capacity: updatedProject.capacity,
      max_students: updatedProject.max_students
    });

    res.json({
      message: 'Project updated successfully',
      project: updatedProject,
      assetsProcessed: updates.assets ? updates.assets.length : 0
    });
  } catch (error) {
    console.error('Error updating project:', error);
    
    // Clean up temporary directories on error
    let tempExtractDirs = [];
    if (req.files) {
      req.files.forEach(file => {
        const extractDir = path.join(__dirname, '../uploads/projects/extracted', path.basename(file.path, path.extname(file.path)));
        if (extractDir) tempExtractDirs.push(extractDir);
      });
    }
    tempExtractDirs.forEach(dir => {
      cleanupExtractedFiles(dir);
    });

    res.status(500).json({ message: 'Error updating project', error: error.message });
  }
});

/**
 * Helper function to determine asset type from file extension
 */
function getAssetType(ext) {
  const typeMap = {
    '.pdf': 'pdf',
    '.doc': 'document',
    '.docx': 'document',
    '.txt': 'document',
    '.md': 'document',
    '.js': 'code',
    '.ts': 'code',
    '.jsx': 'code',
    '.tsx': 'code',
    '.py': 'code',
    '.java': 'code',
    '.cpp': 'code',
    '.c': 'code',
    '.html': 'code',
    '.css': 'code',
    '.json': 'code',
    '.xml': 'code',
    '.sql': 'code',
    '.sh': 'code',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.svg': 'image',
    '.webp': 'image',
  };

  return typeMap[ext.toLowerCase()] || 'file';
}

// DELETE /api/projects/:id - Delete project (center admin only)
router.delete('/:id', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const center = await Center.findOne({ _id: project.centerId, admin_id: req.user.id });
    if (!center) {
      return res.status(403).json({ message: 'Not authorized to delete this project' });
    }

    await Project.findByIdAndDelete(req.params.id);

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ message: 'Error deleting project' });
  }
});

module.exports = router;
