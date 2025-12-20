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
const rateLimiter = require('./rateLimiter');

module.exports = {
    notFoundHandler,
    errorHandler,
    asyncHandler,
    formatValidationError
    , apiKey, rateLimiter
};
