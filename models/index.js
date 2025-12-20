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

const { connectDatabase, mongoose } = require('./database');
const News = require('./News');

module.exports = {
    connectDatabase,
    mongoose,
    News
};
