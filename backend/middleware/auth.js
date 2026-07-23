const jwt = require('jsonwebtoken');
require('dotenv').config();

// JWT Middleware - Verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Generate JWT Token
const generateToken = (user) => {
  const userId = user.id || user._id;
  return jwt.sign(
    {
      id: userId,
      _id: userId,          // Preserve _id for older code paths
      email: user.email,
      roles: user.roles || [],
      centerId: user.centerId || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  );
};

// RBAC Middleware - Check user roles
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userRoles = req.user.roles || [];
    const flattenedRoles = allowedRoles.flat();
    const hasRole = flattenedRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

// Middleware to check ownership (for center admins and mentors)
const checkOwnership = async (req, res, next) => {
  const { centerId } = req.params;
  
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // This will be extended based on specific resource checks
  next();
};

/**
 * ============================================================================
 * SOCKET.IO JWT AUTHENTICATION MIDDLEWARE
 * ============================================================================
 * 
 * CRITICAL SECURITY: This middleware MUST be applied before any socket handlers.
 * It prevents client-side spoofing by extracting user identity from verified JWT,
 * not from client-provided data.
 * 
 * Flow:
 * 1. Client connects with JWT token in auth handshake
 * 2. Server verifies JWT signature and expiry
 * 3. Server extracts user.id and roles from token
 * 4. Server attaches to socket object
 * 5. All handlers use socket.userId (from token, NOT from client)
 * 
 * Usage in server.js:
 *   const { socketioJWTAuth } = require('./middleware/auth');
 *   socketioJWTAuth(io);  // Called before socket.on('connection')
 */
const socketioJWTAuth = (io, namespaces = ['/virtual-lab']) => {
  namespaces.forEach(namespace => {
    const nsInstance = io.of(namespace);

    // Middleware runs BEFORE 'connection' handler - CRITICAL for security
    nsInstance.use((socket, next) => {
      const token = socket.handshake.auth?.token;

      // Step 1: Check token exists
      if (!token) {
        console.warn(`[Socket.io Auth] Connection rejected: No token provided (socket: ${socket.id})`);
        return next(new Error('Authentication failed: No token provided'));
      }

      try {
        // Step 2: Verify JWT signature and expiry
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Step 3: Attach VERIFIED user data to socket (from token, NOT from client)
        socket.userId = decoded.id;              // ✅ From verified token
        socket.userEmail = decoded.email;        // ✅ From verified token
        socket.userRoles = decoded.roles || [];  // ✅ From verified token
        socket.connectedAt = new Date();
        socket.isAuthenticated = true;           // ✅ Flag for handlers

        console.log(`[Socket.io Auth] User ${socket.userId} authenticated on namespace ${namespace}`);

        // Step 4: Allow connection to proceed to handlers
        next();

      } catch (error) {
        console.warn(`[Socket.io Auth] JWT verification failed: ${error.message}`);
        
        // Detailed error in development, generic in production
        const errorMsg = process.env.NODE_ENV === 'development' 
          ? `JWT verification failed: ${error.message}`
          : 'Authentication failed: Invalid or expired token';
        
        next(new Error(errorMsg));
      }
    });
  });
};

/**
 * Safely decode and verify JWT token
 * Returns null if token is invalid or expired
 */
const decodeTokenSafely = (token) => {
  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error('[Auth] Token decode error:', error.message);
    return null;
  }
};

/**
 * Check if a token is still valid (not expired)
 */
const isTokenValid = (token) => {
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Refresh token - Issue new token from verified user data
 * Useful for token rotation in long-running sessions
 */
const refreshToken = (token) => {
  const decoded = decodeTokenSafely(token);
  if (!decoded) {
    return null;
  }

  // Issue new token with same user claims
  return jwt.sign(
    {
      id: decoded.id,
      _id: decoded._id || decoded.id,
      email: decoded.email,
      roles: decoded.roles,
      centerId: decoded.centerId || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  );
};

module.exports = {
  verifyToken,
  generateToken,
  checkRole,
  checkOwnership,
  socketioJWTAuth,    // ✅ Socket.io JWT middleware - CRITICAL
  decodeTokenSafely,  // ✅ Safe token decoding utility
  isTokenValid,       // ✅ Token validation utility
  refreshToken,       // ✅ Token refresh utility
};
