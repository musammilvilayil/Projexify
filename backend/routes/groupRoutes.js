const express = require('express');
const router = express.Router();
const StudentGroup = require('../models/StudentGroup');
const Progress = require('../models/Progress');
const User = require('../models/User');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const { verifyToken, checkRole } = require('../middleware/auth');

/**
 * POST /api/groups - Create a new student group
 * Accessible by: center_admin, mentor
 */
router.post('/', verifyToken, checkRole('center_admin', 'mentor'), async (req, res) => {
  try {
    const { projectId, name, students = [] } = req.body;
    const { id: userId } = req.user;

    // Verify project exists and user has permission
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Check permission: must be center admin of the center or assigned mentor
    const user = await User.findById(userId);
    const isCenterAdmin = user.roles.includes('center_admin') && 
                         (await Project.findOne({ _id: projectId, centerId: user._id }));
    const isAssignedMentor = project.mentor_id?.toString() === userId;

    if (!isCenterAdmin && !isAssignedMentor) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    // Create group
    const newGroup = new StudentGroup({
      projectId,
      name,
      students,
      mentorId: project.mentor_id,
      status: 'active'
    });

    await newGroup.save();
    await newGroup.populate('students', 'firstName lastName email');
    await newGroup.populate('mentorId', 'firstName lastName email');

    res.status(201).json(newGroup);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ message: 'Error creating group', error: error.message });
  }
});

/**
 * GET /api/groups/available/:projectId - Get open squads for a project that current student can join
 * Accessible by: students only
 * NOTE: This route must come BEFORE /:projectId to be matched first
 */
router.get('/available/:projectId', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const studentId = req.user.id;

    // Check if student is already solo enrolled in this project
    const soloEnrollment = await Progress.findOne({
      studentId,
      projectId,
      enrollment_type: 'solo'
    });

    if (soloEnrollment) {
      return res.json({
        available: [],
        message: 'You are enrolled as solo student and cannot join squads for this project'
      });
    }

    // Get open squads for this project (excluding ones student is already in)
    const openGroups = await StudentGroup.find({
      projectId,
      status: 'open',
      students: { $ne: studentId }, // Not already a member
      leaderId: { $ne: studentId }  // Not the leader
    })
    .populate('leaderId', 'firstName lastName avatar_url')
    .populate('students', 'firstName lastName')
    .select('_id name leaderId students mentorId created_at');

    res.json({
      available: openGroups,
      canJoinSquad: true
    });
  } catch (error) {
    console.error('Error fetching available squads:', error);
    res.status(500).json({ message: 'Error fetching available squads', error: error.message });
  }
});

/**
 * GET /api/groups/:projectId - List all groups for a project
 * Accessible by: All authenticated users
 */
router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const groups = await StudentGroup.find({ projectId })
      .populate('students', 'firstName lastName email avatar_url')
      .populate('mentorId', 'firstName lastName email avatar_url')
      .sort({ created_at: -1 });

    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Error fetching groups', error: error.message });
  }
});

/**
 * POST /api/groups/:groupId/invite - Invite a student to a group
 */
router.post('/:groupId/invite', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const { email } = req.body;
    const { id: userId } = req.user;

    if (!email) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    const group = await StudentGroup.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    
    if (group.leaderId && group.leaderId.toString() !== userId) {
      return res.status(403).json({ message: 'Only the group leader can invite members' });
    }

    // Check if member already exists
    const userToInvite = await User.findOne({ email });
    if (userToInvite && group.students.includes(userToInvite._id)) {
      return res.status(400).json({ message: 'User is already a member of the group' });
    }

    // Check if already invited
    const existingInvitation = group.invitations.find(i => i.email === email);
    if (existingInvitation) {
      if (existingInvitation.status === 'sent') {
        return res.status(400).json({ message: 'User has already been invited' });
      }
      if (existingInvitation.status === 'accepted') {
        return res.status(400).json({ message: 'User has already accepted the invitation' });
      }
    }

    // Check if user is already enrolled solo in this project
    if (userToInvite) {
      const existingSoloEnrollment = await Progress.findOne({
        studentId: userToInvite._id,
        projectId: group.projectId,
        enrollment_type: 'solo'
      });

      if (existingSoloEnrollment) {
        return res.status(400).json({ 
          message: 'This user is already enrolled as a solo student in this project' 
        });
      }
    }

    // Add to invitations
    group.invitations.push({ email, status: 'sent' });
    await group.save();

    console.log('Invitation sent:', {
      groupId: group._id,
      invitedEmail: email,
      leaderId: userId
    });

    // In a real system, send email here. For now, create notification if user exists
    if (userToInvite) {
      await Notification.create({
        userId: userToInvite._id,
        type: 'invitation',
        title: 'Squad Invitation',
        message: `You have been invited to join squad "${group.name}" for a project!`,
        relatedId: group._id,
        relatedModel: 'StudentGroup',
        actionUrl: `/pages/student/group-join.html?groupId=${group._id}`
      });
    }

    res.json({ 
      success: true,
      message: 'Invitation sent successfully',
      invitedEmail: email,
      userExists: !!userToInvite
    });
  } catch (error) {
    console.error('Error inviting to group:', error);
    res.status(500).json({ message: 'Error inviting to group', error: error.message });
  }
});

/**
 * POST /api/groups/:groupId/join - Join a group via invitation
 */
router.post('/:groupId/join', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const { id: userId } = req.user;
    const user = await User.findById(userId);

    const group = await StudentGroup.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Check if user is already in the group
    if (group.students.includes(userId)) {
      return res.status(400).json({ message: 'You are already a member of this squad' });
    }

    // Check if user is already enrolled in the same project (solo)
    const existingSoloEnrollment = await Progress.findOne({
      studentId: userId,
      projectId: group.projectId,
      enrollment_type: 'solo'
    });

    if (existingSoloEnrollment) {
      return res.status(400).json({ 
        message: 'You cannot join a squad because you are already enrolled as a solo student in this project',
        enrolled: true
      });
    }

    // Check if user has an invitation or if group is open for joining
    const invite = group.invitations.find(i => i.email === user.email && i.status === 'sent');
    if (!invite && group.status !== 'open') {
      return res.status(403).json({ 
        message: 'No pending invitation found for this account. Group is not open for joining.',
        hasInvitation: !!invite
      });
    }

    // Join group
    if (invite) {
      invite.status = 'accepted';
    }
    group.students.push(userId);
    await group.save();

    console.log('Student joined squad:', {
      groupId: group._id,
      studentId: userId,
      groupSize: group.students.length
    });

    // Increment project student count
    await Project.findByIdAndUpdate(group.projectId, {
      $inc: { current_students: 1 },
    });

    // Increment mentor load if group has a mentor
    if (group.mentorId) {
      await User.findByIdAndUpdate(group.mentorId, { $inc: { mentor_load: 1 } });
    }

    // Create progress for joining student
    const progress = new Progress({
      studentId: userId,
      projectId: group.projectId,
      groupId: group._id,
      enrollment_type: 'group',
      status: 'in_progress', // Joined mid-way
      payment_status: 'completed', // Assume group leader paid or student joins for free
      enrolled_at: new Date()
    });
    await progress.save();

    console.log('Progress created for group member:', {
      progressId: progress._id,
      studentId: userId,
      groupId: group._id
    });

    // Notify group leader
    await Notification.create({
      userId: group.leaderId,
      type: 'group',
      title: 'Squad Member Joined',
      message: `${user.firstName} has joined your squad "${group.name}"!`,
      relatedId: group._id,
      relatedModel: 'StudentGroup'
    });

    res.json({ 
      success: true,
      message: 'Successfully joined the squad!', 
      group,
      progress: {
        _id: progress._id,
        status: progress.status,
        enrollment_type: progress.enrollment_type
      }
    });
  } catch (error) {
    console.error('Error joining group:', error);
    res.status(500).json({ message: 'Error joining group', error: error.message });
  }
});

/**
 * GET /api/groups/my-groups - Get groups for current student
 * Accessible by: Students
 */
router.get('/student/my-groups', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const { id: userId } = req.user;

    const groups = await StudentGroup.find({ students: userId })
      .populate('students', 'firstName lastName email avatar_url')
      .populate('mentorId', 'firstName lastName email avatar_url')
      .populate('projectId', 'title description tech_stack')
      .sort({ created_at: -1 });

    // Get progress for each group's project
    const groupsWithProgress = await Promise.all(
      groups.map(async (group) => {
        const progress = await Progress.findOne({
          studentId: userId,
          projectId: group.projectId._id,
          groupId: group._id
        });
        return {
          ...group.toObject(),
          progress: progress || { status: 'enrolled', completion_percentage: 0 }
        };
      })
    );

    res.json(groupsWithProgress);
  } catch (error) {
    console.error('Error fetching my groups:', error);
    res.status(500).json({ message: 'Error fetching groups', error: error.message });
  }
});

/**
 * GET /api/groups/mentor/my-groups - Get all groups for current mentor
 * Accessible by: Mentors
 */
router.get('/mentor/my-groups', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { id: mentorId } = req.user;

    const groups = await StudentGroup.find({ mentorId })
      .populate('students', 'firstName lastName email avatar_url')
      .populate('projectId', 'title description tech_stack difficulty_level')
      .sort({ created_at: -1 });

    res.json({ groups });
  } catch (error) {
    console.error('Error fetching mentor groups:', error);
    res.status(500).json({ message: 'Error fetching mentor groups', error: error.message });
  }
});

/**
 * POST /api/groups/:id/students - Add student to group
 * Accessible by: center_admin, mentor
 */
router.post('/:id/students', verifyToken, checkRole('center_admin', 'mentor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId } = req.body;
    const { id: userId } = req.user;

    // Find group
    const group = await StudentGroup.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check permission
    const project = await Project.findById(group.projectId);
    const user = await User.findById(userId);
    const isCenterAdmin = user.roles.includes('center_admin') && project.centerId?.toString() === user._id;
    const isAssignedMentor = group.mentorId?.toString() === userId;

    if (!isCenterAdmin && !isAssignedMentor) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    // Check if student already in group
    if (group.students.includes(studentId)) {
      return res.status(400).json({ message: 'Student already in group' });
    }

    // Add student to group
    group.students.push(studentId);
    await group.save();

    // Update or create Progress record
    let progress = await Progress.findOne({
      studentId,
      projectId: group.projectId,
      groupId: id
    });

    if (!progress) {
      progress = new Progress({
        studentId,
        projectId: group.projectId,
        groupId: id,
        status: 'enrolled',
        completion_percentage: 0,
        payment_status: 'completed'
      });
      await progress.save();
    }

    await group.populate('students', 'firstName lastName email');
    res.json(group);
  } catch (error) {
    console.error('Error adding student to group:', error);
    res.status(500).json({ message: 'Error adding student', error: error.message });
  }
});

/**
 * DELETE /api/groups/:id/students/:studentId - Remove student from group
 * Accessible by: center_admin, mentor
 */
router.delete('/:id/students/:studentId', verifyToken, checkRole('center_admin', 'mentor'), async (req, res) => {
  try {
    const { id, studentId } = req.params;
    const { id: userId } = req.user;

    // Find group
    const group = await StudentGroup.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check permission
    const project = await Project.findById(group.projectId);
    const user = await User.findById(userId);
    const isCenterAdmin = user.roles.includes('center_admin') && project.centerId?.toString() === user._id;
    const isAssignedMentor = group.mentorId?.toString() === userId;

    if (!isCenterAdmin && !isAssignedMentor) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    // Remove student from group
    group.students = group.students.filter(s => s.toString() !== studentId);
    await group.save();

    // Mark progress as inactive if no groups left
    const otherGroups = await StudentGroup.findOne({
      _id: { $ne: id },
      projectId: group.projectId,
      students: studentId
    });

    if (!otherGroups) {
      await Progress.updateOne(
        { studentId, projectId: group.projectId, groupId: id },
        { status: 'failed' }
      );
    }

    await group.populate('students', 'firstName lastName email');
    res.json(group);
  } catch (error) {
    console.error('Error removing student from group:', error);
    res.status(500).json({ message: 'Error removing student', error: error.message });
  }
});

/**
 * PUT /api/groups/:id - Update group
 * Accessible by: center_admin, mentor
 */
router.put('/:id', verifyToken, checkRole('center_admin', 'mentor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;
    const { id: userId } = req.user;

    // Find group
    const group = await StudentGroup.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Check permission
    const project = await Project.findById(group.projectId);
    const user = await User.findById(userId);
    const isCenterAdmin = user.roles.includes('center_admin') && project.centerId?.toString() === user._id;
    const isAssignedMentor = group.mentorId?.toString() === userId;

    if (!isCenterAdmin && !isAssignedMentor) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    // Update fields
    if (name) group.name = name;
    if (status) group.status = status;

    await group.save();
    await group.populate('students', 'firstName lastName email');
    await group.populate('mentorId', 'firstName lastName email');

    res.json(group);
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ message: 'Error updating group', error: error.message });
  }
});

/**
 * GET /api/groups/:id/progress - Get aggregated progress for a group
 * Accessible by: All authenticated users
 */
router.get('/:id/progress', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const group = await StudentGroup.findById(id)
      .populate('students', 'firstName lastName email')
      .populate('projectId', 'title');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Get progress for all students in group
    const studentProgress = await Promise.all(
      group.students.map(async (student) => {
        const progress = await Progress.findOne({
          studentId: student._id,
          projectId: group.projectId._id,
          groupId: id
        });
        return {
          studentId: student._id,
          studentName: `${student.firstName} ${student.lastName}`,
          status: progress?.status || 'enrolled',
          completion_percentage: progress?.completion_percentage || 0
        };
      })
    );

    // Calculate group averages
    const avgCompletion = studentProgress.length > 0
      ? Math.round(studentProgress.reduce((sum, p) => sum + p.completion_percentage, 0) / studentProgress.length)
      : 0;

    const groupProgress = {
      groupId: group._id,
      groupName: group.name,
      projectTitle: group.projectId.title,
      totalStudents: group.students.length,
      averageCompletion: avgCompletion,
      studentProgress
    };

    res.json(groupProgress);
  } catch (error) {
    console.error('Error fetching group progress:', error);
    res.status(500).json({ message: 'Error fetching progress', error: error.message });
  }
});

module.exports = router;
