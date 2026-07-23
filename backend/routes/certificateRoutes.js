const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/auth');
const Certificate = require('../models/Certificate');
const Progress = require('../models/Progress');
const Project = require('../models/Project');
const Center = require('../models/Center');
const User = require('../models/User');

// POST /api/certificates/generate - Generate certificate after project completion
router.post('/generate', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { studentId, projectId, score, skills } = req.body;
    const mentorId = req.user.id;

    // Get project details
    const project = await Project.findById(projectId).populate('centerId');
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Verify mentor owns project
    if (project.mentor_id.toString() !== mentorId) {
      return res.status(403).json({ message: 'Not authorized to generate certificates for this project' });
    }

    // Get student and center info
    const student = await User.findById(studentId);
    const center = await Center.findById(project.centerId);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if certificate already exists
    const existingCert = await Certificate.findOne({ studentId, projectId });
    if (existingCert) {
      return res.status(400).json({ message: 'Certificate already generated for this student and project' });
    }

    // Get progress record
    const progress = await Progress.findOne({ studentId, projectId });

    // Create certificate
    const certificate = new Certificate({
      studentId,
      projectId,
      centerId: project.centerId,
      mentorId,
      completion_date: new Date(),
      duration_weeks: project.duration_weeks,
      skills_acquired: skills || [],
      final_score: score || 0,
      metadata: {
        project_title: project.title,
        student_name: `${student.firstName} ${student.lastName}`,
        center_name: center ? center.name : 'Projexify',
        mentor_name: `${req.user.firstName} ${req.user.lastName}`,
      },
    });

    await certificate.save();

    // Update progress status
    if (progress) {
      progress.status = 'completed';
      progress.completed_at = new Date();
      await progress.save();
    }

    res.json({
      success: true,
      message: 'Certificate generated successfully',
      certificate,
      certificateId: certificate.certificate_id,
      verificationCode: certificate.verification_code,
    });
  } catch (error) {
    console.error('Error generating certificate:', error);
    res.status(500).json({ message: 'Error generating certificate', error: error.message });
  }
});

// GET /api/certificates/student/:studentId - Get all certificates for a student
router.get('/student/:studentId', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;

    // Allow students to view their own certificates or mentors/admins to view
    if (req.user.id !== studentId && !['mentor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const certificates = await Certificate.find({ studentId })
      .populate('projectId', 'title description')
      .populate('centerId', 'name')
      .populate('mentorId', 'firstName lastName')
      .sort({ issue_date: -1 });

    res.json({
      success: true,
      certificates,
      total: certificates.length,
    });
  } catch (error) {
    console.error('Error fetching certificates:', error);
    res.status(500).json({ message: 'Error fetching certificates' });
  }
});

// GET /api/certificates/:certificateId - Get certificate by ID
router.get('/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;

    const certificate = await Certificate.findOne({ certificate_id: certificateId })
      .populate('projectId', 'title description')
      .populate('centerId', 'name logo_url')
      .populate('studentId', 'firstName lastName email')
      .populate('mentorId', 'firstName lastName');

    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    res.json({
      success: true,
      certificate,
    });
  } catch (error) {
    console.error('Error fetching certificate:', error);
    res.status(500).json({ message: 'Error fetching certificate' });
  }
});

// POST /api/certificates/verify - Verify certificate with code
router.post('/verify', async (req, res) => {
  try {
    const { certificateId, verificationCode } = req.body;

    const certificate = await Certificate.findOne({
      certificate_id: certificateId,
      verification_code: verificationCode,
    })
      .populate('projectId', 'title')
      .populate('centerId', 'name')
      .populate('studentId', 'firstName lastName');

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found or invalid verification code',
      });
    }

    // Mark as verified
    certificate.is_verified = true;
    certificate.verification_date = new Date();
    await certificate.save();

    res.json({
      success: true,
      message: 'Certificate verified successfully',
      certificate,
    });
  } catch (error) {
    console.error('Error verifying certificate:', error);
    res.status(500).json({ message: 'Error verifying certificate' });
  }
});

// GET /api/certificates/verify/:certificateId - Check certificate verification status
router.get('/check/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;

    const certificate = await Certificate.findOne({ certificate_id: certificateId })
      .populate('studentId', 'firstName lastName');

    if (!certificate) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Certificate not found',
      });
    }

    res.json({
      success: true,
      verified: certificate.is_verified,
      certificate: {
        certificateId: certificate.certificate_id,
        studentName: `${certificate.studentId.firstName} ${certificate.studentId.lastName}`,
        projectTitle: certificate.metadata.project_title,
        issueDate: certificate.issue_date,
        verificationDate: certificate.verification_date,
        completionDate: certificate.completion_date,
        skills: certificate.skills_acquired,
        score: certificate.final_score,
      },
    });
  } catch (error) {
    console.error('Error checking certificate verification:', error);
    res.status(500).json({ message: 'Error checking certificate' });
  }
});

// GET /api/certificates/download/:certificateId - Download certificate (PDF)
router.get('/download/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;

    const certificate = await Certificate.findOne({ certificate_id: certificateId });

    if (!certificate) {
      return res.status(404).json({ message: 'Certificate not found' });
    }

    // In production, generate PDF here
    // For now, return certificate data
    res.json({
      success: true,
      message: 'Certificate download ready',
      certificate,
      // In real implementation:
      // res.contentType('application/pdf');
      // res.send(pdfBuffer);
    });
  } catch (error) {
    console.error('Error downloading certificate:', error);
    res.status(500).json({ message: 'Error downloading certificate' });
  }
});

module.exports = router;
