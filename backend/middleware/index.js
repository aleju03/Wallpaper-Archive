const { adminAuthHook } = require('./auth');
const { createRateLimiter, getClientId } = require('./rate-limiter');

module.exports = {
  adminAuthHook,
  createRateLimiter,
  getClientId
};
