const express = require('express');
const router = express.Router();
const Milestone = require('../models/Milestone');
const Project = require('../models/Project');
const Center = require('../models/Center');
const { verifyToken, checkRole } = require('../middleware/auth');

// POST /api/milestones/project/:projectId - Create milestones for project
router.post('/project/:projectId', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const { milestones } = req.body;

    // Verify project ownership via center
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const center = await Center.findOne({ _id: project.centerId, admin_id: req.user.id });
    if (!center) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const createdMilestones = await Promise.all(milestones.map(m => {
      return new Milestone({
        projectId,
        week_number: m.weekNumber,
        title: m.title,
        description: m.description,
        deliverable: m.deliverable
      }).save();
    }));

    res.status(201).json({
      message: 'Milestones created successfully',
      milestones: createdMilestones,
    });
  } catch (error) {
    console.error('Error creating milestones:', error);
    res.status(500).json({ message: 'Error creating milestones' });
  }
});

// GET /api/milestones/project/:projectId - Get milestones for project
router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const milestones = await Milestone.find({ projectId }).sort({ week_number: 1 });
    res.json(milestones);
  } catch (error) {
    console.error('Error fetching milestones:', error);
    res.status(500).json({ message: 'Error fetching milestones' });
  }
});

// PUT /api/milestones/:id - Update milestone status
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const milestone = await Milestone.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!milestone) {
      return res.status(404).json({ message: 'Milestone not found' });
    }

    res.json({
      message: 'Milestone updated successfully',
      milestone,
    });
  } catch (error) {
    console.error('Error updating milestone:', error);
    res.status(500).json({ message: 'Error updating milestone' });
  }
});

module.exports = router;
