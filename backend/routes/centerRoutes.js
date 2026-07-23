const express = require('express');
const router = express.Router();
const Center = require('../models/Center');
const User = require('../models/User');
const { verifyToken, checkRole } = require('../middleware/auth');

/**
 * GET /api/centers - List centers (role-based filtering)
 * - Admin: all centers
 * - Center Admin: only their centers
 * - Others: approved centers only
 */
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    
    // If authenticated, apply role-based filtering
    if (req.user && req.user.id) {
      if (req.user.roles && req.user.roles.includes('admin')) {
        // Admins see all centers
        if (status) query.status = status;
      } else if (req.user.roles && req.user.roles.includes('center_admin')) {
        // Center admins see only their own centers
        query.admin_id = req.user.id;
      } else {
        // Other authenticated users see only approved centers
        query.status = 'approved';
      }
    } else {
      // Not authenticated: show only approved centers
      query.status = 'approved';
    }
    
    const centers = await Center.find(query)
      .populate('admin_id', 'firstName lastName email')
      .sort({ created_at: -1 });
    res.json(centers);
  } catch (error) {
    console.error('Error fetching centers:', error);
    res.status(500).json({ message: 'Error fetching centers' });
  }
});

/**
 * GET /api/centers/my-centers - Get all centers for current user
 */
router.get('/my-centers', verifyToken, async (req, res) => {
  try {
    const { id } = req.user;
    const centers = await Center.find({ admin_id: id })
      .populate('admin_id', 'firstName lastName email')
      .sort({ created_at: -1 });
    
    if (centers.length === 0) {
      return res.status(404).json({ message: 'No centers found for this admin' });
    }
    
    res.json({ centers, count: centers.length });
  } catch (error) {
    console.error('Error fetching my centers:', error);
    res.status(500).json({ message: 'Error fetching centers' });
  }
});

/**
 * GET /api/centers/my-center - Get first center for current user (backward compatibility)
 * Returns null with a 200 status if no center found, so the frontend can handle it gracefully
 */
router.get('/my-center', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    // Prefer linking by admin_id (how Center is defined)
    let center = userId ? await Center.findOne({ admin_id: userId }) : null;

    // Fallback: some parts of the app may store centerId on the user profile
    if (!center) {
      const centerId = req.user?.centerId || req.user?.center_id || req.user?.centerID;
      if (centerId) {
        center = await Center.findById(centerId);
      }
    }

    if (!center) {
      // Return 200 with null center so frontend can handle gracefully instead of crashing
      return res.json(null);
    }

    res.json(center);
  } catch (error) {
    console.error('Error fetching my center:', error);
    res.status(500).json({ message: 'Error fetching center' });
  }
});

/**
 * GET /api/centers/admin/pending - Get all pending centers
 * Accessible by: admin only
 */
router.get('/admin/pending', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const centers = await Center.find({ status: 'pending' })
      .populate('admin_id', 'firstName lastName email')
      .sort({ created_at: -1 });

    res.json(centers);
  } catch (error) {
    console.error('Error fetching pending centers:', error);
    res.status(500).json({ message: 'Error fetching centers' });
  }
});

/**
 * GET /api/centers/mentor/list - List all mentors
 */
router.get('/mentor/list', async (req, res) => {
  try {
    const { centerId } = req.query;
    const query = { roles: 'mentor' };
    
    if (centerId) {
      // Prefer mentors tied to this center; if none, fall back to unassigned mentors
      query.$or = [
        { centerId },
        { centerId: { $exists: false } },
        { centerId: null }
      ];
    }

    const mentors = await User.find(query)
      .select('firstName lastName bio avatar_url email verified centerId mentor_capacity mentor_load')
      .sort({ firstName: 1 });
    res.json(mentors);
  } catch (error) {
    console.error('Error fetching mentors:', error);
    res.status(500).json({ message: 'Error fetching mentors' });
  }
});

/**
 * GET /api/centers/:id - Get center details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const center = await Center.findById(id)
      .populate('admin_id', 'firstName lastName email bio');
    
    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }
    
    res.json(center);
  } catch (error) {
    console.error('Error fetching center:', error);
    res.status(500).json({ message: 'Error fetching center' });
  }
});

/**
 * POST /api/centers/register - Create a new center
 * Accessible by: center_admin users
 */
router.post('/register', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const { id } = req.user;
    const { name, email, address, city, state, zipCode, country, description, website } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    // Check if center with this email already exists
    const existingCenter = await Center.findOne({ email });
    if (existingCenter) {
      return res.status(400).json({ message: 'Center with this email already exists' });
    }

    // Create new center
    const newCenter = new Center({
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      admin_id: id,
      email,
      address,
      city,
      state,
      zipCode,
      country,
      description,
      website,
      status: 'pending', // Requires admin approval
      verified: false
    });

    await newCenter.save();
    await newCenter.populate('admin_id', 'firstName lastName email');

    res.status(201).json({
      message: 'Center registered successfully. Awaiting admin approval.',
      center: newCenter
    });
  } catch (error) {
    console.error('Error registering center:', error);
    res.status(500).json({ message: 'Error registering center', error: error.message });
  }
});

/**
 * PUT /api/centers/:id - Update center details
 * Accessible by: center admin, super admin
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { id: userId, roles } = req.user;
    const { name, email, address, city, state, zipCode, country, description, website, status, phone } = req.body;

    const center = await Center.findById(id);
    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }

    // Check permission: center admin or super admin
    const isAdmin = roles.includes('admin');
    const isCenterAdmin = center.admin_id?.toString() === userId;

    if (!isAdmin && !isCenterAdmin) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    // Update allowed fields
    if (name) center.name = name;
    if (email) center.email = email;
    if (address) center.address = address;
    if (city) center.city = city;
    if (state) center.state = state;
    if (zipCode) center.zipCode = zipCode;
    if (country) center.country = country;
    if (description) center.description = description;
    if (website) center.website = website;
    if (phone) center.phone = phone;

    // Only admin can change status
    if (isAdmin && status) {
      center.status = status;
    }

    await center.save();
    await center.populate('admin_id', 'firstName lastName email');

    res.json(center);
  } catch (error) {
    console.error('Error updating center:', error);
    res.status(500).json({ message: 'Error updating center', error: error.message });
  }
});

/**
 * PUT /api/centers/:id/approve - Approve center registration
 * Accessible by: admin only
 */
router.put('/:id/approve', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;

    const center = await Center.findByIdAndUpdate(
      id,
      {
        status: approved ? 'approved' : 'rejected',
        verified: approved ? true : false
      },
      { new: true }
    ).populate('admin_id', 'firstName lastName email');

    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }

    res.json({
      message: `Center ${approved ? 'approved' : 'rejected'} successfully`,
      center
    });
  } catch (error) {
    console.error('Error approving center:', error);
    res.status(500).json({ message: 'Error approving center', error: error.message });
  }
});

/**
 * POST /api/centers/mentors - Create a new mentor for the center
 * Accessible by: center_admin only
 */
router.post('/mentors', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const { id } = req.user;
    const { email, password, firstName, lastName, expertise } = req.body;

    // Find the center for this admin
    const center = await Center.findOne({ admin_id: id });
    if (!center) {
      return res.status(404).json({ message: 'Center not found for this admin' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Create mentor user
    const mentor = new User({
      email,
      password, // Will be hashed by pre-save hook
      firstName,
      lastName,
      roles: ['mentor'],
      centerId: center._id,
      bio: expertise // Use bio field for expertise for now
    });

    await mentor.save();

    res.status(201).json({
      message: 'Mentor created successfully',
      mentor: {
        id: mentor._id,
        email: mentor.email,
        firstName: mentor.firstName,
        lastName: mentor.lastName,
        centerId: mentor.centerId
      }
    });
  } catch (error) {
    console.error('Error creating mentor:', error);
    res.status(500).json({ message: 'Error creating mentor', error: error.message });
  }
});

/**
 * PUT /api/centers/mentors/:id - Update mentor details
 * Accessible by: center admin (owner of the center)
 */
router.put('/mentors/:id', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const { id: adminId } = req.user;
    const { id: mentorId } = req.params;
    const { firstName, lastName, bio, expertise } = req.body;

    // Find the center for this admin
    const center = await Center.findOne({ admin_id: adminId });
    if (!center) {
      return res.status(404).json({ message: 'Center not found for this admin' });
    }

    // Find the mentor and ensure they belong to this center
    const mentor = await User.findOne({ _id: mentorId, centerId: center._id, roles: 'mentor' });
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found in your center' });
    }

    // Update fields
    if (firstName) mentor.firstName = firstName;
    if (lastName) mentor.lastName = lastName;
    if (bio || expertise) mentor.bio = bio || expertise;

    await mentor.save();

    res.json({
      message: 'Mentor updated successfully',
      mentor: {
        id: mentor._id,
        firstName: mentor.firstName,
        lastName: mentor.lastName,
        email: mentor.email,
        bio: mentor.bio
      }
    });
  } catch (error) {
    console.error('Error updating mentor:', error);
    res.status(500).json({ message: 'Error updating mentor', error: error.message });
  }
});

/**
 * DELETE /api/centers/:id - Delete a center
 * Accessible by: admin only
 */
router.delete('/:id', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const center = await Center.findById(id);
    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }

    // Delete the center
    await Center.findByIdAndDelete(id);

    res.json({ message: 'Center deleted successfully' });
  } catch (error) {
    console.error('Error deleting center:', error);
    res.status(500).json({ message: 'Error deleting center', error: error.message });
  }
});

/**
 * DELETE /api/centers/mentors/:id - Remove a mentor from the center
 * Accessible by: center_admin only
 */
router.delete('/mentors/:id', verifyToken, checkRole('center_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { id: adminId } = req.user;

    const center = await Center.findOne({ admin_id: adminId });
    if (!center) {
      return res.status(404).json({ message: 'Center not found for this admin' });
    }

    const mentor = await User.findOne({ _id: id, roles: 'mentor', centerId: center._id });
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found in your center' });
    }

    await User.findByIdAndDelete(id);

    res.json({ message: 'Mentor removed successfully' });
  } catch (error) {
    console.error('Error removing mentor:', error);
    res.status(500).json({ message: 'Error removing mentor', error: error.message });
  }
});

module.exports = router;