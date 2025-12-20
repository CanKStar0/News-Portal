const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Simple rate limiter middleware using express-rate-limit.
 * For production scale use a Redis store (rate-limit-redis) and configure
 * the store to prevent distributed evasion.
 */
const apiLimiter = rateLimit({
	windowMs: 60 * 1000, // 1 minute
	max: parseInt(process.env.RATE_LIMIT_MAX) || 60, // requests per window per IP
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, message: 'Too many requests, try again later.' }
});

module.exports = apiLimiter;
