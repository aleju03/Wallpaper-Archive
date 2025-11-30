const { adminAuthHook, legacyAdminAuthHook, verifyAdminCredentials, generateToken } = require('./auth');
const { createRateLimiter, getClientId } = require('./rate-limiter');

module.exports = {
  adminAuthHook,
  legacyAdminAuthHook,
  verifyAdminCredentials,
  generateToken,
  createRateLimiter,
  getClientId
};
