/**
 * ===========================================
 * MİDDLEWARE INDEX DOSYASI
 * ===========================================
 */

const { 
    notFoundHandler, 
    errorHandler, 
    asyncHandler,
    formatValidationError 
} = require('./errorHandler');
const apiKey = require('./apiKey');
const { apiLimiter, searchLimiter, scrapeLimiter, burstLimiter } = require('./rateLimiter');
const security = require('./security');

module.exports = {
    notFoundHandler,
    errorHandler,
    asyncHandler,
    formatValidationError,
    apiKey,
    rateLimiter: apiLimiter,  // Backward compatibility
    apiLimiter,
    searchLimiter,
    scrapeLimiter,
    burstLimiter,
    ...security
};
