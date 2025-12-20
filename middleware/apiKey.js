const config = require('../config');

/**
 * Basit API Key middleware
 * - ENV: API_KEYS (virgulle ayrilmis)
 * - Header: x-api-key
 *
 * Eğer API_KEYS tanimli degilse, middleware devre disi birakilir (development kolayligi)
 */
module.exports = function requireApiKey(req, res, next) {
    const raw = process.env.API_KEYS || '';
    if (!raw) return next(); // enforcement disabled

    const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (allowed.length === 0) return next();

    const key = req.headers['x-api-key'] || req.query.apiKey || req.headers['authorization'];
    if (!key) {
        return res.status(401).json({ success: false, message: 'API key required' });
    }

    // If Authorization header is like "Bearer <key>", extract
    let normalized = key;
    if (typeof key === 'string' && key.toLowerCase().startsWith('bearer ')) {
        normalized = key.slice(7).trim();
    }

    if (!allowed.includes(normalized)) {
        return res.status(403).json({ success: false, message: 'Invalid API key' });
    }

    // attach apiKey to request for auditing
    req.apiKey = normalized;
    next();
};
