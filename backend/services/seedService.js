const User = require('../models/User');
const Center = require('../models/Center');
const Project = require('../models/Project');
const Progress = require('../models/Progress');
const StudentGroup = require('../models/StudentGroup');
const Milestone = require('../models/Milestone');

const seedData = async () => {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.log('🌱 Admin seed skipped: set ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap an admin.');
    return;
  }

  if (adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  const adminExists = await User.findOne({ roles: 'admin' });
  if (adminExists) {
    console.log('🌱 Admin user already exists:', adminExists.email);
    return;
  }

  const admin = new User({
    email: adminEmail,
    password: adminPassword,
    firstName: process.env.ADMIN_FIRST_NAME || 'System',
    lastName: process.env.ADMIN_LAST_NAME || 'Administrator',
    roles: ['admin'],
    verified: true
  });
  await admin.save();
  console.log('✅ Bootstrap admin created from environment configuration.');
};

module.exports = { seedData };
