const User = require('../models/User');
const Center = require('../models/Center');
const Project = require('../models/Project');
const Progress = require('../models/Progress');
const StudentGroup = require('../models/StudentGroup');
const Milestone = require('../models/Milestone');

const seedData = async () => {
  try {
    // Check if admin already exists
    const adminExists = await User.findOne({ roles: 'admin' });
    if (adminExists) {
      console.log('🌱 Admin user already exists:', adminExists.email);
      return;
    }

    console.log('🌱 Seeding admin user...');

    // Create admin user
    const admin = new User({
      email: 'admin@nexus.com',
      password: 'Admin@123456',
      firstName: 'System',
      lastName: 'Administrator',
      roles: ['admin'],
      verified: true
    });
    await admin.save();
    console.log('✅ Created admin user (admin@nexus.com / Admin@123456)');
    
    console.log('\n🎉 Admin seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding error:', error);
    throw error;
  }
};

module.exports = { seedData };
