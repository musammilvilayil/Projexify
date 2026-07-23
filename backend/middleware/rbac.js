const User = require('../models/User');

// Get user roles from database
const getUserRoles = async (userId) => {
  try {
    const user = await User.findById(userId);
    return user ? user.roles : [];
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return [];
  }
};

// Check if user has specific role
const hasRole = async (userId, role) => {
  const roles = await getUserRoles(userId);
  return roles.includes(role);
};

// Add role to user
const addUserRole = async (userId, role) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { roles: role } },
      { new: true }
    );
    return user;
  } catch (error) {
    console.error('Error adding user role:', error);
    throw error;
  }
};

// Remove role from user
const removeUserRole = async (userId, role) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { $pull: { roles: role } },
      { new: true }
    );
    return user;
  } catch (error) {
    console.error('Error removing user role:', error);
    throw error;
  }
};

// Get user with all roles (for token generation)
const getUserWithRoles = async (userId) => {
  try {
    const user = await User.findById(userId).select('-password');
    return user;
  } catch (error) {
    console.error('Error getting user with roles:', error);
    throw error;
  }
};

module.exports = {
  getUserRoles,
  hasRole,
  addUserRole,
  removeUserRole,
  getUserWithRoles,
};
