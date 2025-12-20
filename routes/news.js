/**
 * ===========================================
 * HABER API ROUTE'LARI
 * ===========================================
 * 
 * Bu dosya, haber ile ilgili tüm API endpoint'lerini tanımlar.
 * 
 * REST API TASARIM PRENSİPLERİ:
 * - GET: Veri okuma (idempotent - yan etkisiz)
 * - POST: Yeni kayıt oluşturma
 * - PUT: Mevcut kaydı güncelleme (tümü)
 * - PATCH: Mevcut kaydı kısmi güncelleme
 * - DELETE: Kayıt silme
 * 
 * EXPRESS ROUTER NEDİR?
 * Router, route'ları gruplamak ve modüler hale getirmek için kullanılır.
 * Her dosya kendi router'ını tanımlar, sonra app.js'de birleştirilir.
 */

const express = require('express');
const router = express.Router();
const { News } = require('../models');
const { scraperService } = require('../services');
const { asyncHandler, apiKey } = require('../middleware');
const config = require('../config');
const redis = require('../utils/redisClient');

/**
 * ===========================================
 * GET /api/news
 * ===========================================
 * 
 * Tüm haberleri listele (sayfalama ile)
 * 
 * Query parametreleri:
 * - page: Sayfa numarası (varsayılan: 1)
 * - limit: Sayfa başına haber sayısı (varsayılan: 12)
 * - category: Kategori filtresi (opsiyonel)
 * - search: Arama terimi (opsiyonel)
 * 
 * Örnek: GET /api/news?page=1&limit=12&category=Ekonomi
 */
router.get('/', asyncHandler(async (req, res) => {
    const { page = 1, limit = 12, category, search } = req.query;
    
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 12, 50);
    const skip = (pageNum - 1) * limitNum;
    
    // Sorgu objesi oluştur
    const query = { isActive: true };
    
    // Kategori filtresi
    if (category) {
        query.category = { $regex: new RegExp(category, 'i') };
    }
    
    // Arama filtresi
    if (search) {
        query.$or = [
            { title: { $regex: new RegExp(search, 'i') } },
            { summary: { $regex: new RegExp(search, 'i') } }
        ];
    }
    
    // Toplam sayıyı al
    const total = await News.countDocuments(query);
    
    // Haberleri getir
    const news = await News.find(query)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select('-__v');
    
    res.json({
        success: true,
        data: news,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            hasNext: pageNum < Math.ceil(total / limitNum),
            hasPrev: pageNum > 1
        }
    });
}));

/**
 * ===========================================
 * GET /api/news/live-search
 * ===========================================
 * 
 * CANLI ARAMA - Veritabanı kullanmadan direkt RSS'den arar
 * Her aramada tüm kaynakları tarar ve sonuçları döndürür
 * 
 * Query parametreleri:
 * - keyword: Aranacak kelime (zorunlu)
 * 
 * Örnek: GET /api/news/live-search?keyword=hava%20durumu
 */
router.get('/live-search', asyncHandler(async (req, res) => {
    const { keyword } = req.query;
    
    if (!keyword || keyword.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Arama terimi gerekli'
        });
    }

    const q = keyword.trim();

    // Try cache first (short TTL)
    try {
        const cacheKey = `live:keyword:${q.toLowerCase()}`;
        const cached = await redis.get(cacheKey);
        if (cached && Array.isArray(cached.news)) {
            return res.json({
                success: true,
                data: {
                    keyword: q,
                    news: cached.news,
                    count: cached.count || cached.news.length,
                    duration: 0,
                    cached: true
                }
            });
        }
    } catch (err) {
        console.warn('Redis cache read failed:', err && err.message);
    }

    const result = await scraperService.liveSearch(q);

    // Cache result for short TTL to reduce DB/scrape load
    try {
        const cacheKey = `live:keyword:${q.toLowerCase()}`;
        await redis.set(cacheKey, { news: result.news, count: result.count }, config.redis.defaultTtl || 60);
    } catch (err) {
        console.warn('Redis cache set failed:', err && err.message);
    }

    res.json({
        success: result.success,
        data: {
            keyword: result.keyword,
            news: result.news,
            count: result.count,
            duration: result.duration,
            cached: false
        }
    });
}));

/**
 * ===========================================
 * GET /api/news/live-category
 * ===========================================
 * 
 * KATEGORİYE GÖRE CANLI HABER ÇEK - RSS'den o kategorideki tüm haberleri getirir
 * 
 * Query parametreleri:
 * - category: Kategori adı (zorunlu)
 * 
 * Örnek: GET /api/news/live-category?category=Spor
 */
router.get('/live-category', asyncHandler(async (req, res) => {
    const { category } = req.query;
    
    if (!category || category.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Kategori gerekli'
        });
    }

    const result = await scraperService.liveCategory(category.trim());
    
    res.json({
        success: result.success,
        data: {
            category: result.category,
            news: result.news,
            count: result.count,
            duration: result.duration
        }
    });
}));

/**
 * ===========================================
 * GET /api/news/search
 * ===========================================
 * 
 * Haber arama endpoint'i (veritabanından)
 * 
 * Query parametreleri:
 * - keyword: Aranacak kelime (opsiyonel)
 * - category: Kategori filtresi (opsiyonel)
 * - source: Kaynak filtresi (opsiyonel)
 * - page: Sayfa numarası (varsayılan: 1)
 * - limit: Sayfa başına haber sayısı (varsayılan: 20)
 * - startDate: Başlangıç tarihi (opsiyonel)
 * - endDate: Bitiş tarihi (opsiyonel)
 * 
 * Örnek kullanım:
 * GET /api/news/search?category=finans&keyword=bitcoin&page=1&limit=10
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     news: [...],
 *     pagination: { page, limit, total, pages, hasNext, hasPrev }
 *   }
 * }
 */
router.get('/search', asyncHandler(async (req, res) => {
    /**
     * req.query: URL'deki query string parametreleri
     * 
     * ?category=finans&keyword=bitcoin
     * -> req.query = { category: 'finans', keyword: 'bitcoin' }
     * 
     * Destructuring ile değerleri çıkarıyoruz:
     */
    const {
        keyword,
        category,
        source,
        page = 1,
        limit = 20,
        startDate,
        endDate
    } = req.query;

    // ScraperService'i kullanarak arama yap
    const result = await scraperService.searchNews({
        keyword,
        category,
        source,
        startDate,
        endDate,
        page: parseInt(page),
        limit: parseInt(limit)
    });

    // Başarılı response
    res.json({
        success: true,
        data: result
    });
}));

/**
 * ===========================================
 * GET /api/news/latest
 * ===========================================
 * 
 * En son haberleri getir
 * 
 * Query parametreleri:
 * - limit: Kaç haber (varsayılan: 10, max: 50)
 * - category: Kategori filtresi (opsiyonel)
 * 
 * Örnek: GET /api/news/latest?limit=5&category=finans
 */
router.get('/latest', asyncHandler(async (req, res) => {
    const { limit = 10, category } = req.query;
    
    // Limit kontrolü (max 50)
    const safeLimit = Math.min(parseInt(limit) || 10, 50);
    
    // Sorgu objesi
    const query = { isActive: true };
    if (category) {
        query.category = category.toLowerCase();
    }
    
    /**
     * MongoDB Sorgusu:
     * - find(query): Kriterlere uyan dökümanları bul
     * - sort({ publishedAt: -1 }): Yayın tarihine göre azalan sırala (en yeni önce)
     * - limit(safeLimit): Belirtilen sayıda döküman döndür
     * - lean(): Mongoose document yerine plain JavaScript object döndür (daha hızlı)
     */
    const news = await News.find(query)
        .sort({ publishedAt: -1 })
        .limit(safeLimit)
        .lean();
    
    res.json({
        success: true,
        count: news.length,
        data: news
    });
}));

/**
 * ===========================================
 * GET /api/news/categories
 * ===========================================
 * 
 * Mevcut kategorileri ve haber sayılarını getir
 * 
 * Response:
 * {
 *   success: true,
 *   data: [
 *     { category: 'finans', count: 150 },
 *     { category: 'ekonomi', count: 120 },
 *     ...
 *   ]
 * }
 */
router.get('/categories', asyncHandler(async (req, res) => {
    /**
     * MongoDB Aggregation Pipeline
     * 
     * Aggregation, verileri işlemek ve dönüştürmek için güçlü bir araçtır.
     * SQL'deki GROUP BY, COUNT, SUM gibi işlemleri yapar.
     * 
     * Pipeline aşamaları:
     * 1. $match: Filtreleme (WHERE gibi)
     * 2. $group: Gruplama (GROUP BY gibi)
     * 3. $sort: Sıralama (ORDER BY gibi)
     */
    const categories = await News.aggregate([
        // Sadece aktif haberleri al
        { $match: { isActive: true } },
        
        // Kategoriye göre grupla ve say
        { 
            $group: { 
                _id: '$category',     // Gruplama alanı
                count: { $sum: 1 }     // Her kayıt için 1 ekle
            } 
        },
        
        // Haber sayısına göre azalan sırala
        { $sort: { count: -1 } },
        
        // Çıktı formatını düzenle
        {
            $project: {
                _id: 0,                // _id'yi gizle
                category: '$_id',      // _id'yi category olarak göster
                count: 1               // count'u göster
            }
        }
    ]);
    
    res.json({
        success: true,
        data: categories
    });
}));

/**
 * ===========================================
 * GET /api/news/sources
 * ===========================================
 * 
 * Mevcut kaynakları ve haber sayılarını getir
 */
router.get('/sources', asyncHandler(async (req, res) => {
    const sources = await News.aggregate([
        { $match: { isActive: true } },
        { 
            $group: { 
                _id: '$source', 
                count: { $sum: 1 },
                lastNews: { $max: '$publishedAt' }  // En son haber tarihi
            } 
        },
        { $sort: { count: -1 } },
        {
            $project: {
                _id: 0,
                source: '$_id',
                count: 1,
                lastNews: 1,
                // config'den kaynak bilgilerini ekle
                name: {
                    $switch: {
                        branches: [
                            { case: { $eq: ['$_id', 'bloomberg'] }, then: 'Bloomberg HT' },
                            { case: { $eq: ['$_id', 'dunya'] }, then: 'Dünya Gazetesi' },
                            { case: { $eq: ['$_id', 'foreks'] }, then: 'Foreks' }
                        ],
                        default: '$_id'
                    }
                }
            }
        }
    ]);
    
    res.json({
        success: true,
        data: sources
    });
}));

/**
 * ===========================================
 * GET /api/news/stats
 * ===========================================
 * 
 * Sistem istatistiklerini getir
 * 
 * ÖNEMLİ: Bu route, /:id route'undan ÖNCE tanımlanmalı!
 * Aksi halde "stats" kelimesi ObjectId olarak parse edilmeye çalışılır.
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const stats = await scraperService.getStats();
    
    res.json({
        success: true,
        data: stats
    });
}));

/**
 * ===========================================
 * GET /api/news/stats/summary
 * ===========================================
 * 
 * Admin panel için özet istatistikler
 */
router.get('/stats/summary', asyncHandler(async (req, res) => {
    const totalNews = await News.countDocuments();
    
    // Bugünkü haberler
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayNews = await News.countDocuments({ 
        createdAt: { $gte: today } 
    });
    
    // Kaynak sayısı
    const sourcesCount = await News.distinct('source').then(s => s.length);
    
    res.json({
        success: true,
        data: {
            totalNews,
            todayNews,
            sourcesCount: sourcesCount || '100+'
        }
    });
}));

/**
 * ===========================================
 * GET /api/news/latest
 * ===========================================
 * 
 * Admin panel için son haberler (veritabanından)
 * 
 * Query parametreleri:
 * - limit: Kaç haber (varsayılan: 20)
 * - category: Kategori filtresi
 * - keyword: Başlık araması
 */
router.get('/latest', asyncHandler(async (req, res) => {
    const { limit = 20, category, keyword } = req.query;
    
    const query = {};
    
    if (category) {
        query.category = { $regex: new RegExp(category, 'i') };
    }
    
    if (keyword) {
        query.title = { $regex: new RegExp(keyword, 'i') };
    }
    
    const news = await News.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .select('title summary category source url publishedAt createdAt');
    
    res.json({
        success: true,
        data: news
    });
}));

/**
 * ===========================================
 * GET /api/news/:id
 * ===========================================
 * 
 * ID'ye göre tek haber getir
 * 
 * Route parametresi:
 * :id -> MongoDB ObjectId
 * 
 * Örnek: GET /api/news/507f1f77bcf86cd799439011
 * 
 * ÖNEMLİ: Bu route en sonda olmalı çünkü :id herhangi bir
 * string'i yakalar. /stats, /search gibi spesifik route'lar
 * bundan ÖNCE tanımlanmalı!
 */
router.get('/:id', asyncHandler(async (req, res) => {
    /**
     * req.params: URL'deki route parametreleri
     * /api/news/:id -> req.params.id
     */
    const { id } = req.params;
    
    // findById: MongoDB ObjectId ile arama
    const news = await News.findById(id);
    
    // Haber bulunamadıysa 404 döndür
    if (!news) {
        const error = new Error('Haber bulunamadı');
        error.status = 404;
        throw error;
    }
    
    res.json({
        success: true,
        data: news
    });
}));

/**
 * ===========================================
 * POST /api/news/scrape
 * ===========================================
 * Manuel scraping tetikle (API key gerektirir)
 */
router.post('/scrape', apiKey, asyncHandler(async (req, res) => {
    const { source, keyword } = req.body;
    let result;
    if (keyword) {
        result = await scraperService.scrapeWithKeyword(keyword);
    } else if (source) {
        result = await scraperService.scrapeSource(source);
    } else {
        result = await scraperService.scrapeAll();
    }

    res.json({ success: true, message: 'Scraping tamamlandi', data: result });
}));

// Protect manual scraping endpoint with API key
router.post('/scrape', apiKey, asyncHandler(async (req, res) => {
    const { source, keyword } = req.body;
    let result;
    if (keyword) {
        result = await scraperService.scrapeWithKeyword(keyword);
    } else if (source) {
        result = await scraperService.scrapeSource(source);
    } else {
        result = await scraperService.scrapeAll();
    }

    res.json({ success: true, message: 'Scraping tamamlandi', data: result });
}));

/**
 * ===========================================
 * DELETE /api/news/cleanup
 * ===========================================
 * 
 * Eski haberleri temizle
 * 
 * Query parametreleri:
 * - days: Kaç günden eski (varsayılan: 30)
 * - hardDelete: Gerçekten sil (varsayılan: false, sadece deaktive et)
 */
router.delete('/cleanup', apiKey, asyncHandler(async (req, res) => {
    const { days = 30, hardDelete = false } = req.query;
    
    const count = await scraperService.cleanupOldNews(
        parseInt(days),
        hardDelete === 'true'
    );
    
    res.json({
        success: true,
        message: `${count} haber ${hardDelete === 'true' ? 'silindi' : 'deaktive edildi'}`,
        count
    });
}));

module.exports = router;
