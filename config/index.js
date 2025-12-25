/**
 * ===========================================
 * MERKEZ KONFİGÜRASYON DOSYASI
 * ===========================================
 * 
 * Bu dosya, uygulamanın tüm ayarlarını tek bir yerden yönetmemizi sağlar.
 * .env dosyasından ortam değişkenlerini okur ve varsayılan değerlerle birleştirir.
 * 
 * NEDEN BÖYLE YAPIYORUZ?
 * 1. Ayarları tek bir yerden yönetmek kolaydır
 * 2. Farklı ortamlar (development/production) için farklı ayarlar kullanabiliriz
 * 3. Kod içinde magic string/number kullanmak yerine anlamlı isimler kullanırız
 */

// dotenv modülü .env dosyasını okuyup process.env'e yükler
// require('dotenv').config() en üstte çağrılmalı ki diğer modüller
// ortam değişkenlerine erişebilsin
require('dotenv').config();

/**
 * Tüm uygulama ayarlarını içeren ana konfigürasyon objesi
 * 
 * process.env.XXX || 'varsayılan' yapısı şu anlama gelir:
 * - Eğer ortam değişkeni tanımlıysa onu kullan
 * - Tanımlı değilse varsayılan değeri kullan
 */
const config = {
    // ===== SUNUCU AYARLARI =====
    server: {
        // parseInt: String'i sayıya çevirir (process.env her zaman string döner)
        port: parseInt(process.env.PORT) || 3000,
        // Ortam: development, production veya test
        nodeEnv: process.env.NODE_ENV || 'development',
        // Development modunda mıyız?
        isDevelopment: process.env.NODE_ENV !== 'production'
    },

    // ===== VERİTABANI AYARLARI =====
    database: {
        // MongoDB bağlantı URI'si
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/haber_db',
        // Mongoose bağlantı seçenekleri - BULUT İÇİN OPTİMİZE
        options: {
            // Connection pooling - bulut için önemli
            // maxPoolSize: maksimum bağlantı sayısı (Atlas free tier: 500)
            // minPoolSize: minimum açık bağlantı sayısı (bağlantı ısınması için)
            maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE) || 20,
            minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE) || 5,
            
            // Timeout ayarları - bulut için daha uzun
            serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 30000,
            socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS) || 60000,
            connectTimeoutMS: parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS) || 30000,
            
            // Heartbeat - bağlantı sağlığı kontrolü
            heartbeatFrequencyMS: 10000,
            
            // Retry ayarları - ağ kesintilerinde otomatik yeniden bağlan
            retryWrites: true,
            retryReads: true,
            
            // Write concern - veri güvenliği için
            w: 'majority',
            
            // Compression - bandwidth tasarrufu (bulut maliyeti düşürür)
            compressors: ['zlib']
        }
    },

    // ===== REDIS AYARLARI (CACHE) =====
    redis: {
        url: process.env.REDIS_URL || null,
        // Varsayılan TTL (saniye) - live search için kısa tut
        defaultTtl: parseInt(process.env.REDIS_DEFAULT_TTL) || 60
    },

    // ===== SCRAPER AYARLARI =====
    scraper: {
        // Scraping aralığı (dakika) - 10 dakikada bir
        intervalMinutes: parseInt(process.env.SCRAPE_INTERVAL_MINUTES) || 10,
        
        // Tarayıcı User-Agent başlığı
        // Bu, web sitelerine hangi tarayıcıyı kullandığımızı söyler
        // Gerçekçi bir değer kullanmak bot algılamayı önler
        userAgent: process.env.USER_AGENT || 
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        
        // İstekler arası minimum bekleme süresi (ms)
        // Çok hızlı istek göndermek IP'nin engellenmesine yol açabilir
        requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS) || 300,
        
        // Aynı anda çalışacak maksimum scraper sayısı
        // Sistem kaynaklarını korumak için sınırlıyoruz
        maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SCRAPERS) || 5,
        
        // Playwright tarayıcı ayarları
        browser: {
            // Headless mod: true = görünmez tarayıcı, false = pencere açılır
            headless: process.env.HEADLESS !== 'false',
            // Sayfa yükleme timeout süresi (ms)
            timeout: parseInt(process.env.BROWSER_TIMEOUT) || 15000
        }
    },

    // ===== KATEGORİ TANIMLARI =====
    // Desteklenen haber kategorileri
    // Bu liste API'de filtreleme için kullanılacak
    categories: [
        'finans',
        'teknoloji', 
        'spor',
        'ekonomi',
        'politika',
        'dünya',
        'sağlık',
        'kültür',
        'genel'
    ],

    // ===== KAYNAK SİTE TANIMLARI =====
    // Her site için temel bilgiler
    // Scraperlar bu bilgileri kullanacak
    sources: {
        bloomberg: {
            name: 'Bloomberg HT',
            baseUrl: 'https://www.bloomberght.com',
            enabled: true  // Bu kaynak aktif mi?
        },
        dunya: {
            name: 'Dünya Gazetesi',
            baseUrl: 'https://www.dunya.com',
            enabled: true
        },
        foreks: {
            name: 'Foreks',
            baseUrl: 'https://www.foreks.com',
            enabled: true
        }
    }
};

// Konfigürasyonu dışa aktar
// Diğer dosyalar: const config = require('./config');
module.exports = config;
