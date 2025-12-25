/**
 * ===========================================
 * MONGODB BAĞLANTI YÖNETİCİSİ
 * ===========================================
 * 
 * Bu dosya MongoDB veritabanına bağlantıyı yönetir.
 * Mongoose kullanarak bağlantı açar, hata durumlarını yönetir
 * ve bağlantı olaylarını loglar.
 * 
 * BULUT VERİTABANI İÇİN OPTİMİZE EDİLMİŞTİR:
 * - Otomatik yeniden bağlanma
 * - Connection pooling
 * - Sağlık kontrolü
 */

const mongoose = require('mongoose');
const config = require('../config');

// Bağlantı durumu takibi
let isConnected = false;
let connectionRetries = 0;
const MAX_RETRIES = 5;

/**
 * MongoDB'ye bağlanma fonksiyonu
 * 
 * BULUT İÇİN ÖNEMLİ:
 * - Otomatik retry mekanizması
 * - Exponential backoff
 * - Detaylı hata loglaması
 */
async function connectDatabase() {
    if (isConnected) {
        console.log('📦 MongoDB zaten bağlı');
        return;
    }
    
    try {
        await mongoose.connect(config.database.uri, config.database.options);
        
        isConnected = true;
        connectionRetries = 0;
        
        console.log('✅ MongoDB bağlantısı başarılı!');
        console.log(`📍 Veritabanı: ${mongoose.connection.name}`);
        
        // Bulut bağlantı bilgisi
        const host = mongoose.connection.host;
        if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
            console.log(`☁️  Bulut veritabanı: ${host}`);
        }
        
    } catch (error) {
        console.error('❌ MongoDB bağlantı hatası:', error.message);
        
        // Retry mekanizması
        if (connectionRetries < MAX_RETRIES) {
            connectionRetries++;
            const delay = Math.min(1000 * Math.pow(2, connectionRetries), 30000); // Max 30 saniye
            console.log(`🔄 Yeniden deneniyor (${connectionRetries}/${MAX_RETRIES}) - ${delay/1000}s sonra...`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return connectDatabase();
        }
        
        console.error('💀 Maksimum yeniden deneme sayısına ulaşıldı. Uygulama kapatılıyor.');
        process.exit(1);
    }
}

/**
 * MONGOOSE BAĞLANTI OLAYLARI (Events)
 * 
 * Bulut veritabanları için kritik - ağ sorunlarını takip eder
 */

// Bağlantı kesildiğinde
mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB bağlantısı kesildi');
    isConnected = false;
});

// Bağlantı yeniden kurulduğunda
mongoose.connection.on('reconnected', () => {
    console.log('🔄 MongoDB bağlantısı yeniden kuruldu');
    isConnected = true;
    connectionRetries = 0;
});

// Hata oluştuğunda
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB hatası:', err.message);
    isConnected = false;
});

// Bağlantı açıldığında
mongoose.connection.on('connected', () => {
    isConnected = true;
});

/**
 * Bağlantı sağlık kontrolü
 * 
 * @returns {boolean} - Bağlantı sağlıklı mı
 */
function isHealthy() {
    return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Graceful Shutdown - Düzgün Kapanış
 */
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('👋 MongoDB bağlantısı kapatıldı (uygulama kapanıyor)');
        process.exit(0);
    } catch (error) {
        console.error('❌ Bağlantı kapatma hatası:', error);
        process.exit(1);
    }
});

module.exports = {
    connectDatabase,
    mongoose,
    isHealthy
};
