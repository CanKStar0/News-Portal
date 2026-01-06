/**
 * ===========================================
 * ROUTE INDEX DOSYASI
 * ===========================================
 * 
 * Tüm route'ları tek bir yerden export eder.
 * Ana app.js dosyasında sadece bu dosya import edilir.
 */

const newsRoutes = require('./news');
const visitorRoutes = require('./visitors');

module.exports = {
    newsRoutes,
    visitorRoutes
};
