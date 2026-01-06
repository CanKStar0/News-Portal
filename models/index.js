/**
 * ===========================================
 * MODEL INDEX DOSYASI
 * ===========================================
 * 
 * Bu dosya, tüm modelleri tek bir yerden export eder.
 * Böylece diğer dosyalarda:
 * const { News, connectDatabase } = require('./models');
 * şeklinde kullanılabilir.
 */

const { connectDatabase, mongoose, isHealthy } = require('./database');
const News = require('./News');
const Visitor = require('./Visitor');

module.exports = {
    connectDatabase,
    mongoose,
    isHealthy,
    News,
    Visitor
};
