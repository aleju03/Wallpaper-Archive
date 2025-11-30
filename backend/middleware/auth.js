const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ADMIN_API_KEY, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD_HASH } = require('../config');

/**
 * Admin authentication hook for Fastify (JWT-based)
 * Throws an error to stop request processing if unauthorized
 * Supports: JWT token in Authorization header, or token query param (for SSE)
 */
const adminAuthHook = async (request, reply) => {
  if (!JWT_SECRET) {
    reply.code(500);
    throw new Error('JWT secret not configured');
  }

  const authHeader = request.headers['authorization'];
  const tokenFromHeader = authHeader && authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7)
    : null;

  // Support query param for SSE (EventSource doesn't support custom headers)
  const tokenFromQuery = request.query?.token;
  const token = tokenFromHeader || tokenFromQuery;

  if (!token) {
    reply.code(401);
    throw new Error('Unauthorized - No token provided');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    request.user = decoded; // Attach user info to request
  } catch (err) {
    reply.code(401);
    throw new Error('Unauthorized - Invalid token');
  }
};

/**
 * Legacy admin auth hook (API key-based)
 * Kept for backwards compatibility during migration
 */
const legacyAdminAuthHook = async (request, reply) => {
  if (!ADMIN_API_KEY) {
    reply.code(500);
    throw new Error('Admin key not configured');
  }
  const authHeader = request.headers['authorization'];
  const keyFromHeader = authHeader && authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7)
    : null;
  const keyFromQuery = request.query?.adminKey;
  const key = keyFromHeader || request.headers['x-admin-key'] || keyFromQuery;
  if (key !== ADMIN_API_KEY) {
    reply.code(401);
    throw new Error('Unauthorized');
  }
};

/**
 * Verify admin login credentials
 */
const verifyAdminCredentials = async (username, password) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
    throw new Error('Admin credentials not configured');
  }

  if (username !== ADMIN_USERNAME) {
    return false;
  }

  return await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
};

/**
 * Generate JWT token for authenticated admin
 */
const generateToken = (username) => {
  if (!JWT_SECRET) {
    throw new Error('JWT secret not configured');
  }

  return jwt.sign(
    { username, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
};

module.exports = {
  adminAuthHook,
  legacyAdminAuthHook,
  verifyAdminCredentials,
  generateToken
};
