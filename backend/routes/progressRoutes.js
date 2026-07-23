const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { checkRole } = require('../middleware/auth');
const Progress = require('../models/Progress');
const Project = require('../models/Project');
const Milestone = require('../models/Milestone');
const Notification = require('../models/Notification');
const User = require('../models/User');

// GET /api/progress/my-enrollments - Get all enrolled projects for current user
router.get('/my-enrollments', verifyToken, async (req, res) => {
  try {
    const studentId = req.user.id;

    const progress = await Progress.find({ studentId })
      .populate('projectId')
      .sort({ enrolled_at: -1 });

    res.json({ projects: progress });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({ message: 'Error fetching enrollments' });
  }
});

// GET /api/progress/:projectId - Get student's project progress
router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const studentId = req.user.id;

    const progress = await Progress.findOne({ studentId, projectId })
      .populate('projectId')
      .populate('milestones_completed.milestoneId');

    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found' });
    }

    res.json(progress);
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ message: 'Error fetching progress' });
  }
});

// PUT /api/progress/:projectId/update - Update progress completion
router.put('/:projectId/update', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { completion_percentage, hours_spent, last_activity_note } = req.body;
    const studentId = req.user.id;

    const progress = await Progress.findOneAndUpdate(
      { studentId, projectId },
      {
        completion_percentage,
        $inc: { total_hours_spent: hours_spent || 0 },
        last_activity: new Date(),
      },
      { new: true }
    );

    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found' });
    }

    res.json({
      success: true,
      message: 'Progress updated',
      progress,
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({ message: 'Error updating progress' });
  }
});

// POST /api/progress/:projectId/milestone-complete - Mark milestone as completed
router.post('/:projectId/milestone-complete', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { milestoneId } = req.body;
    const studentId = req.user.id;

    // Verify milestone exists and belongs to this project
    const milestone = await Milestone.findOne({ _id: milestoneId, projectId });
    if (!milestone) {
      return res.status(404).json({ message: 'Milestone not found' });
    }

    const progress = await Progress.findOne({ studentId, projectId });
    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found' });
    }

    // Check if already completed
    const alreadyCompleted = progress.milestones_completed.find(
      m => m.milestoneId.toString() === milestoneId
    );

    if (alreadyCompleted) {
      return res.status(400).json({ message: 'Milestone already completed' });
    }

    // Add to completed milestones
    progress.milestones_completed.push({
      milestoneId,
      completed_at: new Date(),
    });

    // Calculate new completion percentage
    const totalMilestones = await Milestone.countDocuments({ projectId });
    const newCompletion = Math.round((progress.milestones_completed.length / totalMilestones) * 100);
    progress.completion_percentage = newCompletion;

    await progress.save();

    res.json({
      success: true,
      message: 'Milestone marked as completed',
      progress,
    });
  } catch (error) {
    console.error('Error completing milestone:', error);
    res.status(500).json({ message: 'Error completing milestone' });
  }
});

// PUT /api/progress/:projectId/submission - Submit project work
router.put('/:projectId/submission', verifyToken, checkRole('student'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { code_link, github_url, notes } = req.body;
    const studentId = req.user.id;

    const progress = await Progress.findOneAndUpdate(
      { studentId, projectId },
      {
        submission: {
          code_link,
          github_url,
          submission_date: new Date(),
          notes,
        },
        status: 'submitted',
      },
      { new: true }
    );

    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found' });
    }

    res.json({
      success: true,
      message: 'Project submission successful',
      progress,
    });
  } catch (error) {
    console.error('Error submitting project:', error);
    res.status(500).json({ message: 'Error submitting project' });
  }
});

// POST /api/progress/:progressId/complete-report - Mentor submits final completion report
router.post('/:progressId/complete-report', verifyToken, checkRole(['mentor', 'center_admin']), async (req, res) => {
  try {
    const { progressId } = req.params;
    const { summary, scoreCard, recommendations } = req.body;

    const progress = await Progress.findById(progressId);
    if (!progress) return res.status(404).json({ message: 'Progress record not found' });

    progress.status = 'completed';
    progress.completed_at = new Date();
    progress.completion_percentage = 100;
    progress.mentor_report = {
      summary,
      score_card: scoreCard,
      recommendations,
      submitted_at: new Date()
    };

    await progress.save();

    // Decrement mentor load upon completion
    if (progress.assignedMentorId) {
      await User.findByIdAndUpdate(progress.assignedMentorId, { $inc: { mentor_load: -1 } });
    }

    // Notify student
    await Notification.create({
      userId: progress.studentId,
      type: 'achievement',
      title: 'Project Completed! 🎉',
      message: `Congratulations! Your mentor has approved your completion for the project. You can now download your certificate.`,
      relatedId: progress._id,
      relatedModel: 'Progress',
      actionUrl: '/pages/student/dashboard.html'
    });

    res.json({ success: true, message: 'Completion report submitted and project finalized.', progress });
  } catch (error) {
    console.error('Error submitting completion report:', error);
    res.status(500).json({ message: 'Error submitting completion report' });
  }
});

// GET /api/progress/mentor/project/:projectId - Get all students' progress for a project (mentor)
router.get('/mentor/project/:projectId', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verify mentor owns this project
    const project = await Project.findById(projectId);
    if (!project || project.mentor_id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this project progress' });
    }

    const progressList = await Progress.find({ projectId })
      .populate('studentId', 'firstName lastName email')
      .populate('groupId', 'name')
      .sort({ created_at: -1 });

    res.json({
      success: true,
      students: progressList,
      total: progressList.length,
    });
  } catch (error) {
    console.error('Error fetching project progress:', error);
    res.status(500).json({ message: 'Error fetching project progress' });
  }
});

// PUT /api/progress/:studentId/:projectId/evaluate - Mentor evaluation
router.put('/:studentId/:projectId/evaluate', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { studentId, projectId } = req.params;
    const { feedback, score } = req.body;
    const mentorId = req.user.id;

    // Verify mentor owns this project
    const project = await Project.findById(projectId);
    if (!project || project.mentor_id.toString() !== mentorId) {
      return res.status(403).json({ message: 'Not authorized to evaluate this project' });
    }

    const progress = await Progress.findOneAndUpdate(
      { studentId, projectId },
      {
        $push: {
          mentor_evaluations: {
            mentorId,
            feedback,
            score,
            evaluation_date: new Date(),
          },
        },
        status: 'completed',
      },
      { new: true }
    );

    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found' });
    }

    // Decrement mentor load
    if (progress.assignedMentorId) {
      await User.findByIdAndUpdate(progress.assignedMentorId, { $inc: { mentor_load: -1 } });
    }

    res.json({
      success: true,
      message: 'Evaluation submitted',
      progress,
    });
  } catch (error) {
    console.error('Error submitting evaluation:', error);
    res.status(500).json({ message: 'Error submitting evaluation' });
  }
});

// PUT /api/progress/:progressId/assign-mentor - Assign mentor to student (Center Admin only)
router.put('/:progressId/assign-mentor', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const { progressId } = req.params;
    const { mentorId } = req.body;

    const progress = await Progress.findById(progressId)
      .populate('studentId', 'firstName lastName email')
      .populate('projectId', 'title');

    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found' });
    }

    // Update progress with assigned mentor
    progress.assignedMentorId = mentorId;
    progress.mentorAssignedAt = new Date();
    progress.status = 'in_progress';
    await progress.save();

    // Increment mentor's load
    await User.findByIdAndUpdate(mentorId, { $inc: { mentor_load: 1 } });

    // Create notification for student
    await Notification.create({
      userId: progress.studentId._id,
      type: 'mentor_assigned',
      title: 'Mentor Assigned!',
      message: `A mentor has been assigned to your project "${progress.projectId.title}". They will schedule sessions with you soon.`,
      relatedId: progress._id,
      relatedModel: 'Progress',
      actionUrl: `/pages/student/dashboard.html`,
    });

    // Create notification for mentor
    await Notification.create({
      userId: mentorId,
      type: 'general',
      title: 'New Student Assigned',
      message: `You have been assigned to mentor ${progress.studentId.firstName} ${progress.studentId.lastName} for the project "${progress.projectId.title}".`,
      relatedId: progress._id,
      relatedModel: 'Progress',
      actionUrl: `/pages/mentor/project-management.html`,
    });

    res.json({
      success: true,
      message: 'Mentor assigned successfully',
      progress,
    });
  } catch (error) {
    console.error('Error assigning mentor:', error);
    res.status(500).json({ message: 'Error assigning mentor' });
  }
});
// GET /api/progress/mentor/students - Get all students assigned to current mentor
router.get('/mentor/students', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const mentorId = req.user.id;
    
    const progress = await Progress.find({ 
      assignedMentorId: mentorId,
      status: { $in: ['in_progress', 'completed'] }
    })
      .populate('studentId', 'firstName lastName email')
      .populate('projectId', 'title')
      .sort({ mentorAssignedAt: -1 });

    res.json(progress);
  } catch (error) {
    console.error('Error fetching mentor students:', error);
    res.status(500).json({ message: 'Error fetching students' });
  }
});
// GET /api/progress/pending-mentor - Get enrollments pending mentor assignment (Center Admin)
router.get('/center/pending-mentor', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const centerId = req.user.centerId;

    if (!centerId) {
      return res.status(403).json({ message: 'Center context missing for center admin.' });
    }

    const progress = await Progress.find({ 
      status: 'pending_mentor',
      assignedMentorId: null 
    })
      .populate('studentId', 'firstName lastName email')
      .populate('projectId', 'title centerId')
      .sort({ enrolled_at: -1 });

    // Filter by center admin's centers
    const filteredProgress = progress.filter(p => 
      p.projectId && p.projectId.centerId && p.projectId.centerId.toString() === centerId.toString()
    );

    res.json(filteredProgress);
  } catch (error) {
    console.error('Error fetching pending enrollments:', error);
    res.status(500).json({ message: 'Error fetching pending enrollments' });
  }
});

// GET /api/progress/:studentId/:projectId - Get specific student's project progress
router.get('/:studentId/:projectId', verifyToken, async (req, res) => {
  try {
    const { studentId, projectId } = req.params;

    const progress = await Progress.findOne({ studentId, projectId })
      .populate('projectId')
      .populate('studentId', 'firstName lastName email');

    if (!progress) {
      // Return empty progress structure if not found
      return res.json({
        studentId,
        projectId,
        completion_percentage: 0,
        current_milestone_index: 0,
        status: 'not_started',
        total_hours_spent: 0,
        sessions_attended: [],
        milestone_progress: [],
        locked_milestones: [],
        completion_requirements_met: {
          all_milestones_completed: false,
          all_sessions_attended: false
        }
      });
    }

    res.json(progress);
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({ message: 'Error fetching progress' });
  }
});

// PUT /api/progress/:studentId/:projectId/evaluate - Mentor evaluates progress
router.put('/:studentId/:projectId/evaluate', verifyToken, checkRole('mentor'), async (req, res) => {
  try {
    const { studentId, projectId } = req.params;
    const { score, feedback, approve } = req.body;
    const mentorId = req.user.id;

    const progress = await Progress.findOne({ studentId, projectId, assignedMentorId: mentorId });

    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found or not assigned to you' });
    }

    // Update overall score
    progress.completion_percentage = score;
    
    const currentIndex = progress.current_milestone_index || 0;

    // Check if milestone_progress entry exists for current index
    if (!progress.milestone_progress) progress.milestone_progress = [];
    
    let milestoneEntry = progress.milestone_progress.find(m => m.milestone_index === currentIndex);
    if (!milestoneEntry) {
      milestoneEntry = {
        milestone_index: currentIndex,
        status: 'in_progress'
      };
      progress.milestone_progress.push(milestoneEntry);
    }

    // Update mentor approval/feedback
    if (!milestoneEntry.mentor_approval) {
      milestoneEntry.mentor_approval = {};
    }
    
    milestoneEntry.mentor_approval.feedback = feedback;
    milestoneEntry.mentor_approval.score = score;
    milestoneEntry.mentor_approval.approved_at = new Date();
    milestoneEntry.mentor_approval.approved = approve;

    if (approve) {
      milestoneEntry.status = 'completed';
      milestoneEntry.completed_at = new Date();
      
      // Move to next milestone
      progress.current_milestone_index += 1;
      
      // Check if project total milestones reached
      const project = await Project.findById(projectId);
      if (project && project.milestones && progress.current_milestone_index >= project.milestones.length) {
        progress.status = 'completed';
      }
    }

    await progress.save();

    // Create notification for student
    await Notification.create({
      userId: studentId,
      type: 'feedback',
      title: 'Mentor Feedback Received',
      message: `Your mentor has evaluated your progress. New score: ${score}%. ${approve ? 'A new milestone has been unlocked!' : ''}`,
      relatedId: progress._id,
      relatedModel: 'Progress',
      actionUrl: `/pages/student/project-workspace.html?projectId=${projectId}`,
    });

    res.json({
      success: true,
      message: 'Evaluation submitted successfully',
      progress
    });
  } catch (error) {
    console.error('Error in evaluation:', error);
    res.status(500).json({ message: 'Error evaluating progress' });
  }
});

module.exports = router;
