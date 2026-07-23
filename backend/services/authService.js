const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const Center = require('../models/Center');

// Register new user
const registerUser = async (email, password, firstName, lastName, role = 'student') => {
  try {
    // Check if user exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Create user
    const user = new User({
      email,
      password, // Will be hashed by pre-save hook
      firstName,
      lastName,
      roles: [role]
    });

    await user.save();

    return {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles
    };
  } catch (error) {
    throw error;
  }
};

// Login user
const loginUser = async (email, password) => {
  try {
    const user = await User.findOne({ email });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const passwordValid = await user.comparePassword(password);

    if (!passwordValid) {
      throw new Error('Invalid email or password');
    }

    // Ensure center admins carry centerId in their profile for downstream RBAC filters
    if (user.roles?.includes('center_admin') && !user.centerId) {
      const center = await Center.findOne({ admin_id: user._id });
      if (center) {
        user.centerId = center._id;
        await user.save();
      }
    }

    const token = generateToken(user);

    return {
      token,
      user: {
        id: user._id,
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        centerId: user.centerId,
      },
    };
  } catch (error) {
    throw error;
  }
};

// Get user by ID
const getUserById = async (userId) => {
  try {
    const user = await User.findById(userId).select('-password');
    return user;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
};

// Update user profile
const updateUserProfile = async (userId, updates) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');
    
    return user;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserById,
  updateUserProfile,
};
