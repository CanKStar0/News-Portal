/**
 * ===========================================
 * ANA UYGULAMA DOSYASI (app.js)
 * ===========================================
 * 
 * Bu dosya, tüm bileşenleri bir araya getirir ve uygulamayı başlatır.
 * 
 * BAŞLATMA SIRASI:
 * 1. Ortam değişkenlerini yükle
 * 2. Express uygulamasını oluştur
 * 3. Middleware'leri ekle
 * 4. Veritabanına bağlan
 * 5. Route'ları tanımla
 * 6. Hata yakalama middleware'lerini ekle
 * 7. Cron job'ları başlat
 * 8. Sunucuyu başlat
 * 
 * EXPRESS.JS NEDİR?
 * Express, Node.js için minimal ve esnek bir web framework'üdür.
 * HTTP sunucu oluşturmak, route'ları yönetmek ve middleware
 * zinciri kurmak için kullanılır.
 */

// ====================================
// 1. MODÜL İMPORTLARI
// ====================================

/**
 * require() - CommonJS modül sistemi
 * 
 * Node.js'te modüller require() ile import edilir.
 * ES6 import/export da kullanılabilir (package.json'da "type": "module" ile)
 */

// Express framework'ü
const express = require('express');

// CORS - Cross-Origin Resource Sharing middleware
// Frontend farklı bir port/domain'den API'ye erişebilsin diye
const cors = require('cors');

// Helmet - HTTP güvenlik başlıkları
// XSS, clickjacking gibi saldırılara karşı koruma
const helmet = require('helmet');

// Morgan - HTTP request logger
// Her gelen isteği loglar (development için)
const morgan = require('morgan');

// Path modülü - dosya yolları için
const path = require('path');

// Proje modülleri
const config = require('./config');
const { connectDatabase } = require('./models');
const { newsRoutes } = require('./routes');
const { notFoundHandler, errorHandler, rateLimiter } = require('./middleware');
const { cronManager } = require('./jobs');

// ====================================
// 2. EXPRESS UYGULAMASI OLUŞTUR
// ====================================

/**
 * express() fonksiyonu yeni bir Express uygulaması oluşturur.
 * Bu uygulama HTTP isteklerini dinleyecek ve yönetecek.
 */
const app = express();

// ====================================
// 3. GLOBAL MİDDLEWARE'LER
// ====================================

/**
 * app.use() ile middleware'ler eklenir.
 * Middleware'ler sırasıyla çalışır, bu yüzden sıra önemli!
 */

/**
 * Helmet Middleware
 * 
 * HTTP güvenlik başlıkları ekler:
 * - X-Content-Type-Options: MIME type sniffing'i engeller
 * - X-Frame-Options: Clickjacking'e karşı koruma
 * - X-XSS-Protection: XSS filtresi
 * - Content-Security-Policy: Kaynak kısıtlamaları
 */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"]
        }
    }
}));

/**
 * CORS Middleware
 * 
 * Cross-Origin Resource Sharing - Farklı origin'lerden
 * gelen isteklere izin ver.
 * 
 * CORS NEDEN GEREKLİ?
 * Browser güvenlik politikası gereği, bir domain'deki JavaScript
 * farklı bir domain'e istek yapamaz (Same-Origin Policy).
 * CORS bu kısıtlamayı esnetir.
 */
app.use(cors({
    origin: '*',  // Tüm origin'lere izin ver (production'da kısıtla!)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

/**
 * JSON Body Parser
 * 
 * Request body'sini parse eder.
 * express.json() gelen JSON verisini req.body'ye çevirir.
 * 
 * limit: Maksimum body boyutu (DDoS koruması için)
 */
app.use(express.json({ limit: '10mb' }));

/**
 * URL-encoded Body Parser
 * 
 * Form verisini parse eder (application/x-www-form-urlencoded).
 * extended: true -> nested object'lere izin ver
 */
app.use(express.urlencoded({ extended: true }));

/**
 * Morgan Logger
 * 
 * HTTP isteklerini loglar.
 * 'dev' formatı: :method :url :status :response-time ms
 * Örnek: GET /api/news 200 15.234 ms
 * 
 * Sadece development modunda kullanıyoruz.
 */
if (config.server.isDevelopment) {
    app.use(morgan('dev'));
}

// ====================================
// 4. STATİK DOSYALAR (Frontend)
// ====================================

/**
 * express.static() Middleware
 * 
 * public/ klasöründeki dosyaları statik olarak sunar.
 * Örnek: public/index.html -> http://localhost:3000/
 */
app.use(express.static(path.join(__dirname, 'public')));

// ====================================
// 5. SAĞLIK KONTROLÜ ENDPOINT'İ
// ====================================

/**
 * GET /health
 * 
 * Basit sağlık kontrolü endpoint'i.
 * Load balancer'lar ve monitoring sistemleri için.
 * 
 * 200 OK dönerse uygulama çalışıyor demektir.
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),  // Saniye cinsinden çalışma süresi
        memoryUsage: process.memoryUsage()  // Bellek kullanımı
    });
});

/**
 * GET /
 * 
 * Ana sayfa - API bilgileri
 */
app.get('/', (req, res) => {
    res.json({
        name: 'Haber Scraper API',
        version: '1.0.0',
        description: 'Türkiye haber siteleri için web scraping API',
        endpoints: {
            health: 'GET /health',
            search: 'GET /api/news/search?keyword=&category=&source=',
            latest: 'GET /api/news/latest?limit=10',
            categories: 'GET /api/news/categories',
            sources: 'GET /api/news/sources',
            stats: 'GET /api/news/stats/summary',
            scrape: 'POST /api/news/scrape',
            cleanup: 'DELETE /api/news/cleanup?days=30'
        },
        documentation: 'README.md dosyasına bakınız'
    });
});

// ====================================
// 5. API ROUTE'LARI
// ====================================

/**
 * app.use(prefix, router)
 * 
 * Belirli bir prefix altında router'ı monte eder.
 * /api/news prefix'i altındaki tüm istekler newsRoutes'a gider.
 */
// Apply basic rate limiting to all /api routes (use Redis-backed limiter in production for distributed apps)
app.use('/api', rateLimiter);
app.use('/api/news', newsRoutes);

// ====================================
// 6. HATA YAKALAMA MİDDLEWARE'LERİ
// ====================================

/**
 * 404 Handler
 * 
 * Hiçbir route eşleşmezse bu middleware çalışır.
 * MUTLAKA route tanımlamalarından SONRA gelmeli!
 */
app.use(notFoundHandler);

/**
 * Genel Hata Handler
 * 
 * Tüm hataları yakalar ve formatlar.
 * EN SONDA olmalı!
 */
app.use(errorHandler);

// ====================================
// 7. UYGULAMA BAŞLATMA FONKSİYONU
// ====================================

/**
 * startServer()
 * 
 * Uygulamayı başlatan async fonksiyon.
 * Sırasıyla:
 * 1. Veritabanına bağlan
 * 2. Cron job'ları başlat
 * 3. HTTP sunucusunu başlat
 */
async function startServer() {
    try {
        console.log('\n' + '═'.repeat(60));
        console.log('║ HABER SCRAPER BAŞLATILIYOR');
        console.log('═'.repeat(60) + '\n');

        // 1. Veritabanı bağlantısı
        console.log('📦 Veritabanına bağlanılıyor...');
        await connectDatabase();

        // 2. Cron job'ları başlat
        console.log('\n⏰ Zamanlı görevler başlatılıyor...');
        cronManager.initializeJobs();

        // 3. HTTP sunucusunu başlat
        const PORT = config.server.port;
        
        /**
         * app.listen()
         * 
         * HTTP sunucusunu belirtilen port'ta başlatır.
         * Callback, sunucu hazır olduğunda çalışır.
         */
        app.listen(PORT, () => {
            console.log('\n' + '═'.repeat(60));
            console.log('║ ✅ SUNUCU BAŞLATILDI!');
            console.log('║' + '─'.repeat(58));
            console.log(`║ 🌐 URL: http://localhost:${PORT}`);
            console.log(`║ 📡 API: http://localhost:${PORT}/api/news`);
            console.log(`║ 🔧 Mod: ${config.server.nodeEnv}`);
            console.log('║' + '─'.repeat(58));
            console.log('║ 📖 Kullanılabilir Endpoint\'ler:');
            console.log('║    GET  /api/news/search?keyword=bitcoin&category=finans');
            console.log('║    GET  /api/news/latest?limit=10');
            console.log('║    GET  /api/news/categories');
            console.log('║    GET  /api/news/sources');
            console.log('║    GET  /api/news/stats/summary');
            console.log('║    POST /api/news/scrape');
            console.log('═'.repeat(60) + '\n');
        });

    } catch (error) {
        console.error('\n❌ BAŞLATMA HATASI:', error);
        process.exit(1);
    }
}

// ====================================
// 8. GRACEFUL SHUTDOWN
// ====================================

/**
 * Graceful Shutdown (Düzgün Kapanış)
 * 
 * Uygulama sonlandırıldığında (Ctrl+C, kill signal vs.)
 * kaynakları düzgün şekilde serbest bırakır.
 * 
 * SIGINT: Ctrl+C ile gönderilen sinyal
 * SIGTERM: kill komutuyla gönderilen sinyal
 */

// Kapanış fonksiyonu
async function gracefulShutdown(signal) {
    console.log(`\n\n📛 ${signal} sinyali alındı. Uygulama kapatılıyor...`);
    
    try {
        // Cron job'ları durdur
        cronManager.stopAllJobs();
        
        // Kısa bekleme - devam eden işlemlerin tamamlanması için
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('👋 Uygulama kapatıldı.');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Kapanış hatası:', error);
        process.exit(1);
    }
}

// Sinyal dinleyicileri
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Yakalanmamış hatalar
process.on('uncaughtException', (error) => {
    console.error('❌ Yakalanmamış hata:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ İşlenmemiş Promise rejection:', reason);
    // unhandledRejection'da hemen kapatmıyoruz, sadece logluyoruz
});

// ====================================
// 9. UYGULAMAYI BAŞLAT
// ====================================

startServer();

// Export (test için)
module.exports = app;
