const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const emailService = require('../services/emailService');
const { verifyToken, checkRole } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const user = await authService.registerUser(email, password, firstName, lastName, role || 'student');

    // Send welcome email
    const displayName = `${firstName} ${lastName}`;
    await emailService.sendWelcomeEmail(email, displayName, role || 'student');

    res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ message: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const result = await authService.loginUser(email, password);

    res.json({
      message: 'Login successful',
      ...result,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ message: error.message });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/auth/profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const updates = req.body;
    const user = await authService.updateUserProfile(req.user.id, updates);

    res.json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/auth/request-password-reset
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email required' });
    }

    // Generate reset token
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const hashedToken = require('crypto').createHash('sha256').update(resetToken).digest('hex');

    // Store in database (implement in authService)
    // For now, just send email with token
    await emailService.sendPasswordResetEmail(email, resetToken);

    res.json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password (Alias for request-password-reset for better UX)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email required' });
    }

    // Generate reset token
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const hashedToken = require('crypto').createHash('sha256').update(resetToken).digest('hex');

    // Store in database (implement in authService)
    // For now, just send email with token
    await emailService.sendPasswordResetEmail(email, resetToken);

    res.json({ message: 'Password reset email sent successfully' });
  } catch (error) {
    console.error('Error in forgot password:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/auth/admin/stats - Get admin dashboard stats
router.get('/admin/stats', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const User = require('../models/User');
    const Project = require('../models/Project');
    const Center = require('../models/Center');

    const [userCount, projectCount, centerCount, pendingCenterCount] = await Promise.all([
      User.countDocuments(),
      Project.countDocuments(),
      Center.countDocuments({ status: 'approved' }),
      Center.countDocuments({ status: 'pending' })
    ]);

    res.json({
      users: userCount,
      projects: projectCount,
      centers: centerCount,
      pendingCenters: pendingCenterCount,
      revenue: 12500 // Mock revenue for now
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Error fetching admin stats' });
  }
});

// GET /api/auth/admin/users - Get all users for admin
router.get('/admin/users', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const User = require('../models/User');
    const users = await User.find().select('-password').sort({ created_at: -1 });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

/**
 * POST /api/auth/admin/create-center-admin - Create center admin + center in one operation
 * Creates a new center_admin user AND automatically creates their center
 */
router.post('/admin/create-center-admin', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { email, password, firstName, lastName, centerName, centerEmail, address, city, state, country, zip_code } = req.body;
    const User = require('../models/User');
    const Center = require('../models/Center');

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !centerName || !centerEmail) {
      return res.status(400).json({ message: 'Missing required fields: email, password, firstName, lastName, centerName, centerEmail' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Check if center email already exists
    const existingCenter = await Center.findOne({ email: centerEmail });
    if (existingCenter) {
      return res.status(400).json({ message: 'Center with this email already exists' });
    }

    // Create user with center_admin role
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      roles: ['center_admin'],
      verified: true
    });
    await user.save();

    // Create center and link to user
    const center = new Center({
      name: centerName,
      slug: centerName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      email: centerEmail,
      admin_id: user._id,
      address: address || '',
      city: city || '',
      state: state || '',
      country: country || '',
      zip_code: zip_code || '',
      status: 'approved', // Admin-created centers are auto-approved
      verified: true
    });
    await center.save();

    // Update user to have centerId
    user.centerId = center._id;
    await user.save();

    res.status(201).json({
      message: 'Center admin and center created successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        centerId: user.centerId
      },
      center: {
        id: center._id,
        name: center.name,
        email: center.email,
        status: center.status
      }
    });
  } catch (error) {
    console.error('[Admin] Error creating center admin:', error);
    res.status(500).json({ message: 'Error creating center admin', error: error.message });
  }
});

/**
 * PUT /api/auth/admin/users/:userId - Update user (admin only)
 * Allows updating user roles, basic info, and centerId
 */
router.put('/admin/users/:userId', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, roles, firstName, lastName, email, centerId } = req.body;
    const User = require('../models/User');
    const Center = require('../models/Center');

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update roles (support both 'role' for backward compatibility and 'roles' for array)
    if (role) {
      user.roles = [role];
    } else if (roles && Array.isArray(roles)) {
      user.roles = roles;
    }

    // Update basic info
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;

    // Update centerId if provided and user is center_admin
    if (centerId && user.roles.includes('center_admin')) {
      // Verify center exists
      const center = await Center.findById(centerId);
      if (!center) {
        return res.status(404).json({ message: 'Center not found' });
      }
      user.centerId = centerId;
      
      // Update center admin_id to point to this user
      center.admin_id = user._id;
      await center.save();
    }

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        centerId: user.centerId
      }
    });
  } catch (error) {
    console.error('[Admin] Error updating user:', error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
});

/**
 * DELETE /api/auth/admin/users/:userId - Delete user with cascade cleanup
 * CRITICAL: This endpoint includes full cascade delete logic
 * 
 * Cleanup Actions:
 * 1. Terminates all active Virtual Lab sessions (Socket.io)
 * 2. Ends all active sessions in database
 * 3. Removes user from student groups
 * 4. Reassigns groups if user is mentor
 * 5. Deletes all progress records
 * 6. Finally deletes the user
 */
router.delete('/admin/users/:userId', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const User = require('../models/User');
    const VirtualLabSession = require('../models/VirtualLabSession');
    const StudentGroup = require('../models/StudentGroup');
    const Progress = require('../models/Progress');

    console.log(`[Admin] Starting cascade delete for user: ${userId}`);

    // Get user details before deletion
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMentor = user.roles.includes('mentor');
    const isStudent = user.roles.includes('student');

    // Step 1: Terminate active Socket.io sessions
    // Get io instance from app (set in server.js)
    const io = req.app.get('io');
    if (io) {
      // Get cleanupOrphanedSessions function
      const labSocketModule = req.app.get('labSocketModule');
      if (labSocketModule && labSocketModule.cleanupOrphanedSessions) {
        if (isMentor) {
          // If user is mentor, cleanup all their sessions
          labSocketModule.cleanupOrphanedSessions(userId, null);
          console.log(`[Admin] Cleaned up Socket.io sessions for mentor: ${userId}`);
        }
      }

      // Disconnect all sockets for this user
      const labNamespace = io.of('/virtual-lab');
      const sockets = Array.from(labNamespace.sockets.values());
      const userSockets = sockets.filter(socket => socket.userId === userId);
      
      userSockets.forEach(socket => {
        socket.emit('session-terminated-admin', {
          message: 'Your account has been removed by an administrator',
          timestamp: new Date()
        });
        socket.disconnect(true);
      });

      console.log(`[Admin] Disconnected ${userSockets.length} active sockets for user`);
    }

    // Step 2: End all active Virtual Lab sessions in database
    const activeSessions = await VirtualLabSession.updateMany(
      { 
        participants: userId, 
        status: 'active' 
      },
      { 
        status: 'terminated',
        endTime: new Date(),
        terminationReason: 'User account deleted'
      }
    );
    console.log(`[Admin] Ended ${activeSessions.modifiedCount} active sessions`);

    // Step 3: If user is mentor, handle their groups
    if (isMentor) {
      const mentorGroups = await StudentGroup.find({ mentorId: userId });
      
      // Cleanup sessions for all mentor's groups
      if (io && req.app.get('labSocketModule')?.cleanupOrphanedSessions) {
        mentorGroups.forEach(group => {
          req.app.get('labSocketModule').cleanupOrphanedSessions(null, group._id);
        });
      }

      // Set mentor to null (or reassign logic here)
      await StudentGroup.updateMany(
        { mentorId: userId },
        { 
          $unset: { mentorId: '' },
          $set: { updated_at: new Date() }
        }
      );
      console.log(`[Admin] Unassigned mentor from ${mentorGroups.length} groups`);
    }

    // Step 4: Remove user from student groups (if student)
    if (isStudent) {
      const groupRemoval = await StudentGroup.updateMany(
        { students: userId },
        { $pull: { students: userId } }
      );
      console.log(`[Admin] Removed from ${groupRemoval.modifiedCount} student groups`);
    }

    // Step 5: Delete all progress records
    const progressDeletion = await Progress.deleteMany({ 
      studentId: userId 
    });
    console.log(`[Admin] Deleted ${progressDeletion.deletedCount} progress records`);

    // Step 6: Delete the user
    await User.findByIdAndDelete(userId);
    console.log(`[Admin] ✅ User ${user.email} deleted successfully`);

    res.json({
      success: true,
      message: `User ${user.email} and all associated data deleted`,
      details: {
        email: user.email,
        roles: user.roles,
        sessionsEnded: activeSessions.modifiedCount,
        groupsAffected: isMentor ? (await StudentGroup.countDocuments({ mentorId: null })) : 0,
        progressRecordsDeleted: progressDeletion.deletedCount
      }
    });

  } catch (error) {
    console.error('[Admin] Error deleting user:', error);
    res.status(500).json({ 
      message: 'Error deleting user', 
      error: error.message 
    });
  }
});

module.exports = router;
