const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/auth');
const Progress = require('../models/Progress');
const Project = require('../models/Project');
const User = require('../models/User');
const Center = require('../models/Center');
const Notification = require('../models/Notification');

const StudentGroup = require('../models/StudentGroup');

// POST /api/enrollment/free - Free project enrollment OR mock paid enrollment
router.post('/free', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const { projectId, enrollmentType = 'solo', groupName } = req.body;
    const studentId = req.user.id;

    console.log('Enrollment attempt:', {
      projectId,
      enrollmentType,
      groupName,
      studentId
    });

    // Validate enrollmentType
    if (!['solo', 'group'].includes(enrollmentType)) {
      return res.status(400).json({ message: 'Invalid enrollment type. Must be solo or group.' });
    }

    // Verify project exists
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (project.status !== 'active') {
      return res.status(409).json({ message: 'This project is not open for enrollment.' });
    }

    const capacity = Number(project.capacity || project.max_students || 0);
    if (capacity > 0 && Number(project.current_students || 0) >= capacity) {
      return res.status(409).json({ message: 'This project has reached its enrollment capacity.' });
    }

    const demoPaidEnabled = process.env.ENABLE_DEMO_PAYMENTS === 'true';
    if (Number(project.price || 0) > 0 && !demoPaidEnabled) {
      return res.status(402).json({
        message: 'Paid enrollment is not enabled. Choose a free project or configure the payment flow.'
      });
    }

    // Reject duplicates before changing mentor load or project counters.
    const existingEnrollment = await Progress.findOne({ studentId, projectId });
    if (existingEnrollment) {
      return res.status(409).json({
        message: 'You are already enrolled in this project.',
        enrolled: true,
        progressId: existingEnrollment._id
      });
    }

    if (enrollmentType === 'group') {
      const existingGroupLead = await StudentGroup.findOne({ projectId, leaderId: studentId });
      if (existingGroupLead) {
        return res.status(409).json({
          message: 'You already lead a squad for this project.',
          enrolled: true,
          groupId: existingGroupLead._id
        });
      }
    }

    const student = await User.findById(studentId).select('firstName lastName');
    if (!student) {
      return res.status(404).json({ message: 'Student account not found.' });
    }

    // Smart mentor assignment. Prefer the project's mentor, otherwise choose the lowest-load mentor.
    let autoAssignedMentor = null;
    if (project.mentor_id) {
      const projectMentor = await User.findOne({
        _id: project.mentor_id,
        roles: 'mentor',
        centerId: project.centerId
      });
      if (projectMentor && projectMentor.mentor_load < projectMentor.mentor_capacity) {
        autoAssignedMentor = projectMentor._id;
      }
    }

    if (!autoAssignedMentor) {
      const mentors = await User.find({
        roles: 'mentor',
        centerId: project.centerId,
        $expr: { $lt: ['$mentor_load', '$mentor_capacity'] }
      }).sort({ mentor_load: 1, created_at: 1 });

      if (mentors.length > 0) {
        autoAssignedMentor = mentors[0]._id;
        if (!project.mentor_id) {
          project.mentor_id = autoAssignedMentor;
          await project.save();
        }
      }
    }

    let groupId = null;
    if (enrollmentType === 'group') {
      const newGroup = new StudentGroup({
        projectId,
        name: groupName || `${student.firstName}'s Squad`,
        leaderId: studentId,
        students: [studentId],
        mentorId: autoAssignedMentor || project.mentor_id,
        status: 'active'
      });
      await newGroup.save();
      groupId = newGroup._id;

      console.log('Squad created:', {
        groupId: newGroup._id,
        leader: studentId,
        name: newGroup.name
      });
    }

    // Create progress record. Paid demo mode is explicit and disabled by default.
    const progress = new Progress({
      studentId,
      projectId,
      groupId,
      assignedMentorId: autoAssignedMentor || null,
      enrollment_type: enrollmentType,
      status: autoAssignedMentor ? 'in_progress' : 'pending_mentor', 
      completion_percentage: 0,
      payment_status: 'completed',
      transaction_id: (Number(project.price || 0) > 0 ? 'DEMO_TXN_' : 'FREE_TXN_') + Math.random().toString(36).slice(2, 11).toUpperCase(),
      enrolled_at: new Date(),
    });

    await progress.save();

    if (autoAssignedMentor) {
      await User.findByIdAndUpdate(autoAssignedMentor, { $inc: { mentor_load: 1 } });
    }

    console.log('Progress created:', {
      progressId: progress._id,
      enrollmentType: progress.enrollment_type,
      groupId: progress.groupId
    });

    // Notify mentor if auto-assigned
    if (autoAssignedMentor) {
      await Notification.create({
        userId: autoAssignedMentor,
        type: 'general',
        title: 'New Student Auto-Assigned',
        message: `You have been automatically assigned to mentor ${student.firstName} for ${project.title}.`,
        relatedId: progress._id,
        relatedModel: 'Progress'
      });
    }

    // Update project student count
    await Project.findByIdAndUpdate(projectId, {
      $inc: { current_students: 1 },
    });

    // Notify center admin about new enrollment
    const center = await Center.findById(project.centerId);
    if (center && center.admin_id) {
      await Notification.create({
        userId: center.admin_id,
        type: 'enrollment',
        title: `New ${enrollmentType.toUpperCase()} Enrollment`,
        message: autoAssignedMentor 
          ? `Student ${student.firstName} enrolled in "${project.title}" (${enrollmentType}). Mentor automatically assigned.`
          : `A student has enrolled in "${project.title}" as ${enrollmentType}. Please assign a mentor.`,
        relatedId: progress._id,
        relatedModel: 'Progress',
        actionUrl: `/pages/center/dashboard.html`,
      });
    }

    res.json({
      success: true,
      enrolled: true,
      message: autoAssignedMentor 
        ? `Successfully enrolled and mentor assigned!`
        : (enrollmentType === 'group' 
          ? 'Squad Created Successfully! Invite your friends now.' 
          : 'Enrollment successful! Your center will assign a mentor soon.'),
      progressId: progress._id,
      transactionId: progress.transaction_id,
      groupId,
      progress: {
        _id: progress._id,
        status: progress.status,
        completion_percentage: progress.completion_percentage,
        groupId: progress.groupId || null,
        enrollment_type: progress.enrollment_type
      },
    });
  } catch (error) {
    console.error('Error enrolling in project:', error);
    res.status(500).json({ message: 'Error enrolling in project', error: error.message });
  }
});


// GET /api/enrollment/status/:projectId - Get enrollment status for student
router.get('/status/:projectId', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const studentId = req.user.id;

    const progress = await Progress.findOne({ studentId, projectId })
      .populate('projectId', 'title')
      .populate('groupId', 'name leaderId');

    if (!progress) {
      return res.json({
        enrolled: false,
        message: 'Not enrolled in this project',
      });
    }

    // Check if student can join any existing squads for this project
    let availableSquads = [];
    if (progress.enrollment_type === 'solo') {
      // Solo students can view available squads but not join
      availableSquads = await StudentGroup.find({
        projectId,
        status: 'open'
      }).populate('leaderId', 'firstName lastName');
    }

    res.json({
      enrolled: true,
      enrollment_type: progress.enrollment_type,
      progress,
      isSquadLeader: progress.enrollment_type === 'group' && progress.groupId,
      availableSquads
    });
  } catch (error) {
    console.error('Error checking enrollment status:', error);
    res.status(500).json({ message: 'Error checking enrollment status', error: error.message });
  }
});

// GET /api/enrollment/my-projects - Get all enrolled projects for student
router.get('/my-projects', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    const progressList = await Progress.find({ studentId })
      .populate('projectId', 'title description difficulty_level price thumbnail mentor_id')
      .populate('groupId', 'name')
      .populate('assignedMentorId', 'firstName lastName email avatar_url')
      .sort({ created_at: -1 });

    // Manually populate project's mentor_id since nested populate doesn't work
    for (let progress of progressList) {
      if (progress.projectId && progress.projectId.mentor_id) {
        const projectMentor = await User.findById(progress.projectId.mentor_id).select('firstName lastName email avatar_url');
        progress.projectId.mentor_id = projectMentor;
      }
    }

    res.json({
      success: true,
      projects: progressList,
      total: progressList.length,
    });
  } catch (error) {
    console.error('Error fetching enrolled projects:', error);
    res.status(500).json({ message: 'Error fetching enrolled projects' });
  }
});

module.exports = router;
