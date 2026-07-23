const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
require('dotenv').config();

const { mongoose, connectDB } = require('./backend/config/database');
const { seedData } = require('./backend/services/seedService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3005',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io", "https://cdnjs.cloudflare.com", "https://meet.jit.si", "https://*.jitsi.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*", "https://cdn.socket.io", "https://cdnjs.cloudflare.com", "https://meet.jit.si", "wss://meet.jit.si", "https://*.jitsi.net", "wss://*.jitsi.net"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "https://meet.jit.si", "https://*.jitsi.net", "https://*.firebaseapp.com"],
      mediaSrc: ["'self'", "https://meet.jit.si", "https://*.jitsi.net"],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3005',
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from frontend/public with custom headers
app.use(express.static('frontend/public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Serve uploaded files from backend/uploads
app.use('/uploads', express.static('backend/uploads'));

// Standard security headers (removed Permissions-Policy)
app.use((req, res, next) => {
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);

// Routes
const authRoutes = require('./backend/routes/authRoutes');
const projectRoutes = require('./backend/routes/projectRoutes');
const milestoneRoutes = require('./backend/routes/milestoneRoutes');
const centerRoutes = require('./backend/routes/centerRoutes');
const certificateRoutes = require('./backend/routes/certificateRoutes');
const enrollmentRoutes = require('./backend/routes/enrollmentRoutes');
const progressRoutes = require('./backend/routes/progressRoutes');
const feedbackRoutes = require('./backend/routes/feedbackRoutes');
const groupRoutes = require('./backend/routes/groupRoutes');
const virtualLabRoutes = require('./backend/routes/virtualLabRoutes');
const sessionRoutes = require('./backend/routes/sessionRoutes');
const notificationRoutes = require('./backend/routes/notificationRoutes');
const execRoutes = require('./backend/routes/execRoutes');
const aiRoutes = require('./backend/routes/aiRoutes');
const meetingRoutes = require('./backend/routes/meetingRoutes');
const workspaceRoutes = require('./backend/routes/workspaceRoutes');
const messageRoutes = require('./backend/routes/messageRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/centers', centerRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/virtual-lab', virtualLabRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/exec', execRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/messages', messageRoutes);

// Global API error handler (ensures JSON errors for upload/parser/runtime failures)
app.use((err, req, res, next) => {
  if (!err) return next();

  const isApiRequest = req.path.startsWith('/api/');
  if (!isApiRequest) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message, error: err.code });
  }

  const status = err.status || err.statusCode || 500;
  return res.status(status).json({ message: err.message || 'Internal Server Error' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Projexify running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Socket.io setup - Apply JWT authentication middleware BEFORE socket handlers
const labSocket = require('./backend/sockets/labSocket');
const { socketioJWTAuth } = require('./backend/middleware/auth');

// ✅ CRITICAL: Initialize JWT auth middleware for Socket.io BEFORE labSocket handlers
socketioJWTAuth(io);

// ✅ Now initialize socket handlers (which use verified socket.userId from JWT)
const labSocketModule = labSocket(io);

// Store io and labSocket module in app for access in routes (for cascade delete)
app.set('io', io);
app.set('labSocketModule', labSocketModule);

// Start server
const PORT = process.env.PORT || 3005;

const startServer = async () => {
  // Initialize MongoDB
  await connectDB();

  // Seed initial data
  await seedData();

  server.listen(PORT, () => {
    console.log(`🚀 Projexify running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close();
    process.exit(0);
  });
});
