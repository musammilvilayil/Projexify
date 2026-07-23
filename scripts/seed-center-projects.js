const { connectDB, mongoose } = require('../backend/config/database');
const User = require('../backend/models/User');
const Center = require('../backend/models/Center');
const Project = require('../backend/models/Project');

const DEFAULTS = {
  centerName: process.env.SEED_CENTER_NAME || 'Nexus Seed Center',
  centerSlug: process.env.SEED_CENTER_SLUG || 'nexus-seed-center',
  centerAdminEmail: process.env.SEED_CENTER_ADMIN_EMAIL || 'centeradmin.seed@nexus.com',
  defaultPassword: process.env.SEED_DEFAULT_PASSWORD || 'Admin@123456',
  mentorCount: Number(process.env.SEED_MENTOR_COUNT || 20),
  projectCount: Number(process.env.SEED_PROJECT_COUNT || 200),
};

const PROJECT_NAME_POOL = [
  'Smart Inventory Manager',
  'Clinic Appointment Portal',
  'AI Resume Screener',
  'Campus Event Hub',
  'E-Learning Progress Tracker',
  'Warehouse Route Optimizer',
  'Restaurant Analytics Dashboard',
  'Farmer Market Connect',
  'Telemedicine Consultation App',
  'Digital Invoice Assistant',
  'School Transport Tracker',
  'Job Referral Marketplace',
  'Real Estate Listing Engine',
  'Customer Support Copilot',
  'Code Review Assistant',
  'Fraud Alert Monitor',
  'Subscription Billing System',
  'Hotel Booking Platform',
  'Freelancer Workflow Manager',
  'Healthcare Claims Analyzer',
  'Smart Attendance System',
  'Document OCR Pipeline',
  'Voice Feedback Analyzer',
  'Logistics Shipment Tracker',
  'Personal Finance Planner',
  'NGO Donation Management',
  'Contract Lifecycle Portal',
  'Crowdfunding Campaign Tool',
  'Video Meeting Insights',
  'Sales Lead Prioritizer',
  'Retail Demand Forecast',
  'Complaint Resolution System',
  'Insurance Quote Engine',
  'Interview Scheduling Bot',
  'Data Quality Monitoring Suite',
  'Employee Wellness Platform',
  'Smart Parking Assistant',
  'Public Transport Companion',
  'Expense Reimbursement Portal',
  'Carbon Footprint Calculator',
  'IoT Device Health Monitor',
  'Learning Recommendation Engine',
  'Mentor Matching Platform',
  'Medical Record Summarizer',
  'Procurement Approval Workflow',
  'Ticketing and Helpdesk Tool',
  'Store Performance Benchmark',
  'Knowledge Base Builder',
  'Quality Assurance Tracker',
  'Community Collaboration Network',
];

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function buildProjectName(index) {
  const base = PROJECT_NAME_POOL[(index - 1) % PROJECT_NAME_POOL.length];
  const cohort = Math.floor((index - 1) / PROJECT_NAME_POOL.length) + 1;
  return cohort > 1 ? `${base} Cohort ${cohort}` : base;
}

function toTitleCase(input) {
  return input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function pickTechStack(index) {
  const stacks = [
    ['Node.js', 'Express', 'MongoDB'],
    ['React', 'Node.js', 'PostgreSQL'],
    ['Python', 'FastAPI', 'Redis'],
    ['Next.js', 'TypeScript', 'Prisma'],
    ['Vue', 'Firebase', 'TailwindCSS'],
  ];
  return stacks[index % stacks.length];
}

function pickDifficulty(index) {
  const levels = ['beginner', 'intermediate', 'advanced'];
  return levels[index % levels.length];
}

async function createOrUpdateCenterAdmin(config) {
  let centerAdmin = await User.findOne({ email: config.centerAdminEmail });

  if (!centerAdmin) {
    centerAdmin = new User({
      email: config.centerAdminEmail,
      password: config.defaultPassword,
      firstName: 'Seed',
      lastName: 'CenterAdmin',
      roles: ['center_admin'],
      verified: true,
    });
    await centerAdmin.save();
    console.log(`Created center admin: ${config.centerAdminEmail}`);
  } else {
    const nextRoles = Array.from(new Set([...(centerAdmin.roles || []), 'center_admin']));
    centerAdmin.roles = nextRoles;
    centerAdmin.verified = true;
    await centerAdmin.save();
    console.log(`Reused center admin: ${config.centerAdminEmail}`);
  }

  return centerAdmin;
}

async function createOrUpdateCenter(config, centerAdmin) {
  const centerNameFromSlug = `${toTitleCase(config.centerSlug)} Center`;
  const centerName = config.centerName || centerNameFromSlug;

  let center = await Center.findOne({ slug: config.centerSlug });

  if (!center) {
    center = new Center({
      name: centerName,
      slug: config.centerSlug,
      description: 'Seeded center for load and workflow testing.',
      email: config.centerAdminEmail,
      admin_id: centerAdmin._id,
      status: 'approved',
      verified: true,
    });
    await center.save();
    console.log(`Created center: ${center.slug}`);
  } else {
    center.name = centerName;
    center.email = config.centerAdminEmail;
    center.admin_id = centerAdmin._id;
    center.status = 'approved';
    center.verified = true;
    await center.save();
    console.log(`Reused center: ${center.slug}`);
  }

  if (!centerAdmin.centerId || String(centerAdmin.centerId) !== String(center._id)) {
    centerAdmin.centerId = center._id;
    await centerAdmin.save();
  }

  return center;
}

async function createOrUpdateMentors(config, center) {
  const mentors = [];

  for (let i = 1; i <= config.mentorCount; i += 1) {
    const email = `seed.mentor${String(i).padStart(3, '0')}@nexus.com`;
    let mentor = await User.findOne({ email });

    if (!mentor) {
      mentor = new User({
        email,
        password: config.defaultPassword,
        firstName: 'Seed',
        lastName: `Mentor${String(i).padStart(3, '0')}`,
        roles: ['mentor'],
        centerId: center._id,
        mentor_capacity: 30,
        mentor_load: 0,
        verified: true,
      });
      await mentor.save();
    } else {
      mentor.roles = Array.from(new Set([...(mentor.roles || []), 'mentor']));
      mentor.centerId = center._id;
      mentor.mentor_capacity = mentor.mentor_capacity || 30;
      mentor.verified = true;
      await mentor.save();
    }

    mentors.push(mentor);
  }

  console.log(`Prepared mentors: ${mentors.length}`);
  return mentors;
}

async function createOrUpdateProjects(config, center, mentors) {
  // Remove legacy generic seed entries from earlier versions of this script.
  const legacyCleanup = await Project.deleteMany({
    centerId: center._id,
    $or: [
      { title: { $regex: /^\[Seed\] Project\s\d+/ } },
      { slug: { $regex: new RegExp(`^${config.centerSlug}-project-\\d+$`) } },
    ],
  });
  if (legacyCleanup.deletedCount > 0) {
    console.log(`Removed legacy seed projects: ${legacyCleanup.deletedCount}`);
  }

  let created = 0;
  let updated = 0;

  for (let i = 1; i <= config.projectCount; i += 1) {
    const mentor = mentors[(i - 1) % mentors.length];
    const title = buildProjectName(i);
    const slug = `${config.centerSlug}-${slugify(title)}-${String(i).padStart(3, '0')}`;
    const techStack = pickTechStack(i);
    const difficulty = pickDifficulty(i);

    const payload = {
      centerId: center._id,
      title,
      slug,
      description: `${title} is a practical build project focused on ${techStack.join(', ')} with mentor-guided milestones and team collaboration.`,
      abstract: `Hands-on ${difficulty} project: ${title}`,
      tech_stack: techStack,
      difficulty_level: difficulty,
      duration_weeks: 8 + (i % 8),
      price: 0,
      max_students: 5,
      current_students: 0,
      capacity: 5,
      category: 'general',
      status: 'active',
      approval_status: 'approved',
      mentor_id: mentor._id,
      learning_outcomes: [
        'Plan project architecture',
        'Implement core modules',
        'Ship a demo-ready build',
      ],
      prerequisites: ['Basic programming knowledge'],
    };

    const existing = await Project.findOne({ slug });

    if (!existing) {
      await Project.create(payload);
      created += 1;
    } else {
      await Project.updateOne({ _id: existing._id }, { $set: payload });
      updated += 1;
    }
  }

  console.log(`Projects created: ${created}`);
  console.log(`Projects updated: ${updated}`);
}

async function run() {
  const config = {
    ...DEFAULTS,
    mentorCount: Math.max(1, DEFAULTS.mentorCount),
    projectCount: Math.max(1, DEFAULTS.projectCount),
  };

  console.log('--- Seed Center + Mentors + Projects ---');
  console.log(`Center admin: ${config.centerAdminEmail}`);
  console.log(`Center slug: ${config.centerSlug}`);
  console.log(`Mentors: ${config.mentorCount}`);
  console.log(`Projects: ${config.projectCount}`);

  const conn = await connectDB();
  if (!conn) {
    process.exit(1);
  }

  try {
    const centerAdmin = await createOrUpdateCenterAdmin(config);
    const center = await createOrUpdateCenter(config, centerAdmin);
    const mentors = await createOrUpdateMentors(config, center);
    await createOrUpdateProjects(config, center, mentors);

    const projectCount = await Project.countDocuments({ centerId: center._id });
    console.log('--- Done ---');
    console.log(`Center ID: ${center._id}`);
    console.log(`Center Admin Login: ${config.centerAdminEmail} / ${config.defaultPassword}`);
    console.log(`Projects under center: ${projectCount}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

run();
