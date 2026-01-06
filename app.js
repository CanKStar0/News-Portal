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
const { newsRoutes, visitorRoutes } = require('./routes');
const { notFoundHandler, errorHandler, rateLimiter, applySecurityMiddlewares } = require('./middleware');
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
 * Güvenlik Middleware'leri
 * 
 * NoSQL Injection, XSS ve şüpheli aktivite koruması.
 * - Input sanitization ($ operatörlerini engeller)
 * - Request ID (loglama için)
 * - Şüpheli IP tespiti ve bloklama
 */
applySecurityMiddlewares(app);

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

// Production'da ALLOWED_ORIGINS env variable'ı kullan
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : ['*'];

app.use(cors({
    origin: config.server.isProduction 
        ? (origin, callback) => {
            // Origin yoksa (same-origin request) veya izin verilenler arasındaysa kabul et
            if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('CORS policy violation'));
            }
        }
        : '*',  // Development'ta herkese izin ver
    methods: ['GET', 'POST'],  // Sadece gerekli metodlara izin ver
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true
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
 * extended: false -> nested object'lere izin VERME (güvenlik için)
 * Bu ayar, keyword[$ne]=test gibi saldırıları engeller
 */
app.use(express.urlencoded({ extended: false }));

/**
 * Query Parser Güvenliği
 * 
 * Express'in varsayılan query parser'ı (qs) nested object'lere izin verir.
 * Bu NoSQL injection riski oluşturur. Simple query parser kullan.
 */
app.set('query parser', 'simple');

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
 * GET /api/news/health
 * 
 * Detaylı sağlık kontrolü endpoint'i.
 * Cache, DB ve cron job durumlarını döndürür.
 * BULUT VERİTABANI İÇİN GENİŞLETİLMİŞ
 */
const { searchCache, newsListCache } = require('./utils/memoryCache');
const { News, isHealthy, mongoose } = require('./models');

app.get('/api/news/health', async (req, res) => {
    const startTime = Date.now();
    
    // Veritabanı kontrolü - detaylı
    let dbStatus = 'unknown';
    let newsCount = 0;
    let dbInfo = {};
    
    try {
        // Bağlantı sağlığı kontrolü
        const dbHealthy = isHealthy();
        
        if (dbHealthy) {
            newsCount = await News.countDocuments({ isActive: true });
            dbStatus = 'connected';
            
            // Bulut veritabanı bilgileri
            const host = mongoose.connection.host;
            const isCloud = host && !host.includes('localhost') && !host.includes('127.0.0.1');
            
            dbInfo = {
                host: host,
                name: mongoose.connection.name,
                isCloud: isCloud,
                readyState: mongoose.connection.readyState,
                // Replica set bilgisi (bulut için)
                replicaSet: mongoose.connection.config?.replicaSet || null
            };
        } else {
            dbStatus = 'disconnected';
        }
    } catch (err) {
        dbStatus = 'error: ' + err.message;
    }
    
    // Cache istatistikleri
    const cacheStats = {
        search: searchCache.getStats(),
        newsList: newsListCache.getStats()
    };
    
    // Cron job durumu
    const cronStats = cronManager.getStats();
    
    const responseTime = Date.now() - startTime;
    
    res.json({
        success: true,
        status: dbStatus === 'connected' ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${responseTime}ms`,
        database: {
            status: dbStatus,
            activeNews: newsCount,
            ...dbInfo
        },
        cache: cacheStats,
        cronJobs: cronStats,
        memory: {
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        }
    });
});

/**
 * GET /api/news/cache/stats
 * 
 * Cache istatistiklerini döndür
 */
app.get('/api/news/cache/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            search: searchCache.getStats(),
            newsList: newsListCache.getStats()
        }
    });
});

/**
 * DELETE /api/news/cache/clear
 * 
 * Cache'i temizle (API key gerektirir)
 */
const apiKeyMiddleware = require('./middleware/apiKey');
app.delete('/api/news/cache/clear', apiKeyMiddleware, (req, res) => {
    const { type } = req.query;
    
    if (type === 'search') {
        searchCache.clear();
        return res.json({ success: true, message: 'Search cache temizlendi' });
    } else if (type === 'list') {
        newsListCache.clear();
        return res.json({ success: true, message: 'News list cache temizlendi' });
    } else {
        searchCache.clear();
        newsListCache.clear();
        return res.json({ success: true, message: 'Tüm cache temizlendi' });
    }
});

/**
 * GET /
 * 
 * Ana sayfa - index.html'i sun
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Statik HTML Sayfaları
 * 
 * /about -> about.html
 * /privacy-policy -> privacy-policy.html
 * /contact -> contact.html
 */
app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/privacy-policy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

/**
 * GET /api
 * 
 * API bilgileri
 */
app.get('/api', (req, res) => {
    res.json({
        name: 'Haber Scraper API',
        version: '1.0.0',
        description: 'Türkiye haber siteleri için web scraping API',
        endpoints: {
            health: 'GET /health veya GET /api/news/health',
            cacheStats: 'GET /api/news/cache/stats',
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
// Burst koruması (saniyede 10 istek limiti)
const { burstLimiter, searchLimiter, scrapeLimiter } = require('./middleware');
app.use('/api', burstLimiter);

// Genel API rate limit
app.use('/api', rateLimiter);

// Arama endpoint'i için özel limit
app.use('/api/news/live-search', searchLimiter);
app.use('/api/news/search', searchLimiter);

// Scrape endpoint'i için sıkı limit
app.use('/api/news/scrape', scrapeLimiter);

app.use('/api/news', newsRoutes);

// Ziyaretçi sayacı route'u
app.use('/api/visitors', visitorRoutes);

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
