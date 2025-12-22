/**
 * ===========================================
 * HABER API ROUTE'LARI
 * ===========================================
 * 
 * Bu dosya, haber ile ilgili tÃ¼m API endpoint'lerini tanÄ±mlar.
 * 
 * REST API TASARIM PRENSÄ°PLERÄ°:
 * - GET: Veri okuma (idempotent - yan etkisiz)
 * - POST: Yeni kayÄ±t oluÅŸturma
 * - PUT: Mevcut kaydÄ± gÃ¼ncelleme (tÃ¼mÃ¼)
 * - PATCH: Mevcut kaydÄ± kÄ±smi gÃ¼ncelleme
 * - DELETE: KayÄ±t silme
 * 
 * EXPRESS ROUTER NEDÄ°R?
 * Router, route'larÄ± gruplamak ve modÃ¼ler hale getirmek iÃ§in kullanÄ±lÄ±r.
 * Her dosya kendi router'Ä±nÄ± tanÄ±mlar, sonra app.js'de birleÅŸtirilir.
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
 * TÃ¼m haberleri listele (sayfalama ile)
 * 
 * Query parametreleri:
 * - page: Sayfa numarasÄ± (varsayÄ±lan: 1)
 * - limit: Sayfa baÅŸÄ±na haber sayÄ±sÄ± (varsayÄ±lan: 12)
 * - category: Kategori filtresi (opsiyonel)
 * - search: Arama terimi (opsiyonel)
 * 
 * Ã–rnek: GET /api/news?page=1&limit=12&category=Ekonomi
 */
router.get('/', asyncHandler(async (req, res) => {
    const { page = 1, limit = 12, category, search } = req.query;
    
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 12, 50);
    const skip = (pageNum - 1) * limitNum;
    
    // Sorgu objesi oluÅŸtur
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
    
    // Toplam sayÄ±yÄ± al
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
 * CANLI ARAMA + VERÄ°TABANINA KAYDET + VERÄ°TABANINDAN GETÄ°R
 * 
 * AkÄ±ÅŸ:
 * 1. RSS/Google News'den canlÄ± scrape yap
 * 2. SonuÃ§larÄ± veritabanÄ±na kaydet (upsert - tekrar engellenir)
 * 3. VeritabanÄ±ndan anahtar kelimeye gÃ¶re sorgu yap
 * 4. SonuÃ§larÄ± dÃ¶ndÃ¼r
 * 
 * Query parametreleri:
 * - keyword: Aranacak kelime (zorunlu)
 * - limit: SonuÃ§ sayÄ±sÄ± (varsayÄ±lan: 50)
 * 
 * Ã–rnek: GET /api/news/live-search?keyword=dolar&limit=30
 */
router.get('/live-search', asyncHandler(async (req, res) => {
    const { keyword, limit = 50 } = req.query;
    
    if (!keyword || keyword.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Arama terimi gerekli'
        });
    }

    const q = keyword.trim();
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const startTime = Date.now();

    // Trend kaydÄ±
    // Trend servisi devre dışı

    // 1. CanlÄ± scrape yap (RSS + Google News)
    console.log(`ğŸ” CanlÄ± arama baÅŸlatÄ±lÄ±yor: "${q}"`);
    const scrapeResult = await scraperService.liveSearch(q);
    
    // 1.5 Resmi olmayan haberler iÃ§in resim Ã§ek
    if (scrapeResult.news && scrapeResult.news.length > 0) {
        // Resimler scraper'da otomatik ekleniyor
        // Resimler RSSNewsScraper tarafından otomatik ekleniyor
    }
    
    // 2. Scrape edilen haberleri veritabanÄ±na kaydet
    let savedCount = 0;
    let duplicateCount = 0;
    
    if (scrapeResult.news && scrapeResult.news.length > 0) {
        console.log(`ğŸ’¾ ${scrapeResult.news.length} haber veritabanÄ±na kaydediliyor...`);
        
        for (const newsItem of scrapeResult.news) {
            try {
                const updateResult = await News.updateOne(
                    { url: newsItem.url },
                    {
                        $set: {
                            title: newsItem.title,
                            summary: newsItem.summary || newsItem.description,
                            url: newsItem.url,
                            imageUrl: newsItem.imageUrl || newsItem.image,
                            category: newsItem.category || 'Genel',
                            source: newsItem.source,
                            keywords: newsItem.keywords || [q.toLowerCase()],
                            publishedAt: newsItem.publishedAt ? new Date(newsItem.publishedAt) : new Date(),
                            scrapedAt: new Date(),
                            isActive: true
                        },
                        $setOnInsert: {
                            createdAt: new Date()
                        }
                    },
                    { upsert: true }
                );
                
                if (updateResult.upsertedCount > 0) {
                    savedCount++;
                } else {
                    duplicateCount++;
                }
            } catch (err) {
                if (err.code !== 11000) {
                    console.warn(`âš ï¸ Haber kaydetme hatasÄ±: ${err.message}`);
                }
            }
        }
        console.log(`âœ… KayÄ±t tamamlandÄ±: ${savedCount} yeni, ${duplicateCount} mevcut`);
    }

    // 3. VeritabanÄ±ndan anahtar kelimeye gÃ¶re sorgula
    const dbQuery = {
        isActive: true,
        $or: [
            { title: { $regex: q, $options: 'i' } },
            { summary: { $regex: q, $options: 'i' } },
            { keywords: { $regex: q, $options: 'i' } }
        ]
    };

    const dbNews = await News.find(dbQuery)
        .sort({ publishedAt: -1 })
        .limit(limitNum)
        .lean();

    const duration = Date.now() - startTime;

    // 4. SonuÃ§larÄ± dÃ¶ndÃ¼r
    res.json({
        success: true,
        data: {
            keyword: q,
            news: dbNews,
            count: dbNews.length,
            scraped: scrapeResult.news?.length || 0,
            saved: savedCount,
            duplicates: duplicateCount,
            duration,
            source: 'scrape+database'
        }
    });
}));

/**
 * ===========================================
 * GET /api/news/live-category
 * ===========================================
 * 
 * KATEGORÄ°YE GÃ–RE CANLI HABER Ã‡EK + VERÄ°TABANINA KAYDET + VERÄ°TABANINDAN GETÄ°R
 * 
 * AkÄ±ÅŸ:
 * 1. RSS'den o kategorideki haberleri canlÄ± scrape yap
 * 2. SonuÃ§larÄ± veritabanÄ±na kaydet
 * 3. VeritabanÄ±ndan kategoriye gÃ¶re sorgu yap
 * 4. SonuÃ§larÄ± dÃ¶ndÃ¼r
 * 
 * Query parametreleri:
 * - category: Kategori adÄ± (zorunlu)
 * - limit: SonuÃ§ sayÄ±sÄ± (varsayÄ±lan: 50)
 * 
 * Ã–rnek: GET /api/news/live-category?category=Spor&limit=30
 */
router.get('/live-category', asyncHandler(async (req, res) => {
    const { category, limit = 50 } = req.query;
    
    if (!category || category.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Kategori gerekli'
        });
    }

    const cat = category.trim();
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const startTime = Date.now();

    // 1. CanlÄ± scrape yap
    console.log(`ğŸ“‚ Kategori haberleri Ã§ekiliyor: "${cat}"`);
    const scrapeResult = await scraperService.liveCategory(cat);
    
    // 1.5 Resmi olmayan haberler iÃ§in resim Ã§ek
    if (scrapeResult.news && scrapeResult.news.length > 0) {
        // Resimler scraper'da otomatik ekleniyor
        // Resimler RSSNewsScraper tarafından otomatik ekleniyor
    }
    
    // 2. Scrape edilen haberleri veritabanÄ±na kaydet
    let savedCount = 0;
    let duplicateCount = 0;
    
    if (scrapeResult.news && scrapeResult.news.length > 0) {
        console.log(`ğŸ’¾ ${scrapeResult.news.length} haber veritabanÄ±na kaydediliyor...`);
        
        for (const newsItem of scrapeResult.news) {
            try {
                const updateResult = await News.updateOne(
                    { url: newsItem.url },
                    {
                        $set: {
                            title: newsItem.title,
                            summary: newsItem.summary || newsItem.description,
                            url: newsItem.url,
                            imageUrl: newsItem.imageUrl || newsItem.image,
                            category: newsItem.category || cat,
                            source: newsItem.source,
                            keywords: newsItem.keywords || [],
                            publishedAt: newsItem.publishedAt ? new Date(newsItem.publishedAt) : new Date(),
                            scrapedAt: new Date(),
                            isActive: true
                        },
                        $setOnInsert: {
                            createdAt: new Date()
                        }
                    },
                    { upsert: true }
                );
                
                if (updateResult.upsertedCount > 0) {
                    savedCount++;
                } else {
                    duplicateCount++;
                }
            } catch (err) {
                if (err.code !== 11000) {
                    console.warn(`âš ï¸ Haber kaydetme hatasÄ±: ${err.message}`);
                }
            }
        }
        console.log(`âœ… KayÄ±t tamamlandÄ±: ${savedCount} yeni, ${duplicateCount} mevcut`);
    }

    // 3. VeritabanÄ±ndan kategoriye gÃ¶re sorgula
    const dbNews = await News.find({
        isActive: true,
        category: { $regex: cat, $options: 'i' }
    })
        .sort({ publishedAt: -1 })
        .limit(limitNum)
        .lean();

    const duration = Date.now() - startTime;

    // 4. SonuÃ§larÄ± dÃ¶ndÃ¼r
    res.json({
        success: true,
        data: {
            category: cat,
            news: dbNews,
            count: dbNews.length,
            scraped: scrapeResult.news?.length || 0,
            saved: savedCount,
            duplicates: duplicateCount,
            duration,
            source: 'scrape+database'
        }
    });
}));

/**
 * ===========================================
 * GET /api/news/search
 * ===========================================
 * 
 * Haber arama endpoint'i (veritabanÄ±ndan)
 * 
 * Query parametreleri:
 * - keyword: Aranacak kelime (opsiyonel)
 * - category: Kategori filtresi (opsiyonel)
 * - source: Kaynak filtresi (opsiyonel)
 * - page: Sayfa numarasÄ± (varsayÄ±lan: 1)
 * - limit: Sayfa baÅŸÄ±na haber sayÄ±sÄ± (varsayÄ±lan: 20)
 * - startDate: BaÅŸlangÄ±Ã§ tarihi (opsiyonel)
 * - endDate: BitiÅŸ tarihi (opsiyonel)
 * 
 * Ã–rnek kullanÄ±m:
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
     * Destructuring ile deÄŸerleri Ã§Ä±karÄ±yoruz:
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

    // BaÅŸarÄ±lÄ± response
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
 * - limit: KaÃ§ haber (varsayÄ±lan: 10, max: 50)
 * - category: Kategori filtresi (opsiyonel)
 * 
 * Ã–rnek: GET /api/news/latest?limit=5&category=finans
 */
router.get('/latest', asyncHandler(async (req, res) => {
    const { limit = 10, category } = req.query;
    
    // Limit kontrolÃ¼ (max 50)
    const safeLimit = Math.min(parseInt(limit) || 10, 50);
    
    // Sorgu objesi
    const query = { isActive: true };
    if (category) {
        query.category = category.toLowerCase();
    }
    
    /**
     * MongoDB Sorgusu:
     * - find(query): Kriterlere uyan dÃ¶kÃ¼manlarÄ± bul
     * - sort({ publishedAt: -1 }): YayÄ±n tarihine gÃ¶re azalan sÄ±rala (en yeni Ã¶nce)
     * - limit(safeLimit): Belirtilen sayÄ±da dÃ¶kÃ¼man dÃ¶ndÃ¼r
     * - lean(): Mongoose document yerine plain JavaScript object dÃ¶ndÃ¼r (daha hÄ±zlÄ±)
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
 * Mevcut kategorileri ve haber sayÄ±larÄ±nÄ± getir
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
     * Aggregation, verileri iÅŸlemek ve dÃ¶nÃ¼ÅŸtÃ¼rmek iÃ§in gÃ¼Ã§lÃ¼ bir araÃ§tÄ±r.
     * SQL'deki GROUP BY, COUNT, SUM gibi iÅŸlemleri yapar.
     * 
     * Pipeline aÅŸamalarÄ±:
     * 1. $match: Filtreleme (WHERE gibi)
     * 2. $group: Gruplama (GROUP BY gibi)
     * 3. $sort: SÄ±ralama (ORDER BY gibi)
     */
    const categories = await News.aggregate([
        // Sadece aktif haberleri al
        { $match: { isActive: true } },
        
        // Kategoriye gÃ¶re grupla ve say
        { 
            $group: { 
                _id: '$category',     // Gruplama alanÄ±
                count: { $sum: 1 }     // Her kayÄ±t iÃ§in 1 ekle
            } 
        },
        
        // Haber sayÄ±sÄ±na gÃ¶re azalan sÄ±rala
        { $sort: { count: -1 } },
        
        // Ã‡Ä±ktÄ± formatÄ±nÄ± dÃ¼zenle
        {
            $project: {
                _id: 0,                // _id'yi gizle
                category: '$_id',      // _id'yi category olarak gÃ¶ster
                count: 1               // count'u gÃ¶ster
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
 * Mevcut kaynaklarÄ± ve haber sayÄ±larÄ±nÄ± getir
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
                            { case: { $eq: ['$_id', 'dunya'] }, then: 'DÃ¼nya Gazetesi' },
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
 * Ã–NEMLÄ°: Bu route, /:id route'undan Ã–NCE tanÄ±mlanmalÄ±!
 * Aksi halde "stats" kelimesi ObjectId olarak parse edilmeye Ã§alÄ±ÅŸÄ±lÄ±r.
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
 * Admin panel iÃ§in Ã¶zet istatistikler
 */
router.get('/stats/summary', asyncHandler(async (req, res) => {
    const totalNews = await News.countDocuments();
    
    // BugÃ¼nkÃ¼ haberler
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayNews = await News.countDocuments({ 
        createdAt: { $gte: today } 
    });
    
    // Kaynak sayÄ±sÄ±
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
 * Admin panel iÃ§in son haberler (veritabanÄ±ndan)
 * 
 * Query parametreleri:
 * - limit: KaÃ§ haber (varsayÄ±lan: 20)
 * - category: Kategori filtresi
 * - keyword: BaÅŸlÄ±k aramasÄ±
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
 * ID'ye gÃ¶re tek haber getir
 * 
 * Route parametresi:
 * :id -> MongoDB ObjectId
 * 
 * Ã–rnek: GET /api/news/507f1f77bcf86cd799439011
 * 
 * Ã–NEMLÄ°: Bu route en sonda olmalÄ± Ã§Ã¼nkÃ¼ :id herhangi bir
 * string'i yakalar. /stats, /search gibi spesifik route'lar
 * bundan Ã–NCE tanÄ±mlanmalÄ±!
 */
router.get('/:id', asyncHandler(async (req, res) => {
    /**
     * req.params: URL'deki route parametreleri
     * /api/news/:id -> req.params.id
     */
    const { id } = req.params;
    
    // findById: MongoDB ObjectId ile arama
    const news = await News.findById(id);
    
    // Haber bulunamadÄ±ysa 404 dÃ¶ndÃ¼r
    if (!news) {
        const error = new Error('Haber bulunamadÄ±');
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
 * - days: KaÃ§ gÃ¼nden eski (varsayÄ±lan: 30)
 * - hardDelete: GerÃ§ekten sil (varsayÄ±lan: false, sadece deaktive et)
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

/**
 * ===========================================
 * GET /api/news/dashboard
 * ===========================================
 * 
 * Dashboard iÃ§in istatistikler
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const [
        totalNews,
        todayNews,
        weekNews,
        byCategory,
        bySource,
        recentNews
    ] = await Promise.all([
        News.countDocuments({ isActive: true }),
        News.countDocuments({ isActive: true, createdAt: { $gte: today } }),
        News.countDocuments({ isActive: true, createdAt: { $gte: lastWeek } }),
        News.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]),
        News.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 }
        ]),
        News.find({ isActive: true })
            .sort({ publishedAt: -1 })
            .limit(5)
            .select('title category source publishedAt')
            .lean()
    ]);
    
    // Son 7 gÃ¼nlÃ¼k haber sayÄ±sÄ± grafiÄŸi iÃ§in
    const dailyStats = await News.aggregate([
        {
            $match: {
                isActive: true,
                createdAt: { $gte: lastWeek }
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);
    
    res.json({
        success: true,
        data: {
            summary: {
                total: totalNews,
                today: todayNews,
                week: weekNews,
                avgPerDay: Math.round(weekNews / 7)
            },
            byCategory: byCategory.map(c => ({ category: c._id, count: c.count })),
            bySource: bySource.map(s => ({ source: s._id, count: s.count })),
            dailyStats: dailyStats.map(d => ({ date: d._id, count: d.count })),
            recentNews
        }
    });
}));

/**
 * ===========================================
 * GET /api/news/compare
 * ===========================================
 * 
 * Haber karÅŸÄ±laÅŸtÄ±rma - aynÄ± olayÄ±n farklÄ± kaynaklardan haberleri
 */
router.get('/compare', asyncHandler(async (req, res) => {
    const { keyword, hours = 24 } = req.query;
    
    if (!keyword) {
        return res.status(400).json({
            success: false,
            message: 'KarÅŸÄ±laÅŸtÄ±rma iÃ§in anahtar kelime gerekli'
        });
    }
    
    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
    
    const news = await News.find({
        isActive: true,
        publishedAt: { $gte: since },
        $or: [
            { title: { $regex: keyword, $options: 'i' } },
            { summary: { $regex: keyword, $options: 'i' } }
        ]
    })
    .sort({ publishedAt: -1 })
    .limit(50)
    .lean();
    
    // Kaynaklara gÃ¶re grupla
    const bySource = {};
    for (const item of news) {
        const source = item.source || 'Bilinmeyen';
        if (!bySource[source]) {
            bySource[source] = [];
        }
        bySource[source].push(item);
    }
    
    // Duygu analizi ekle
    const analyzedNews = sentimentService.analyzeBatch(news);
    
    res.json({
        success: true,
        data: {
            keyword,
            timeRange: `Son ${hours} saat`,
            totalNews: news.length,
            sourceCount: Object.keys(bySource).length,
            bySource,
            sentimentSummary: {
                positive: analyzedNews.filter(n => n.sentiment.sentiment === 'positive').length,
                negative: analyzedNews.filter(n => n.sentiment.sentiment === 'negative').length,
                neutral: analyzedNews.filter(n => n.sentiment.sentiment === 'neutral').length
            }
        }
    });
}));

/**
 * ===========================================
 * GET /api/news/advanced-search
 * ===========================================
 * 
 * GeliÅŸmiÅŸ filtrelerle arama
 */
router.get('/advanced-search', asyncHandler(async (req, res) => {
    const {
        keyword,
        categories,      // virgÃ¼lle ayrÄ±lmÄ±ÅŸ: "Ekonomi,Spor"
        sources,         // virgÃ¼lle ayrÄ±lmÄ±ÅŸ: "NTV,CNN Turk"
        startDate,
        endDate,
        sentiment,       // positive, negative, neutral
        page = 1,
        limit = 20
    } = req.query;
    
    const query = { isActive: true };
    
    // Anahtar kelime
    if (keyword) {
        query.$or = [
            { title: { $regex: keyword, $options: 'i' } },
            { summary: { $regex: keyword, $options: 'i' } }
        ];
    }
    
    // Ã‡oklu kategori
    if (categories) {
        const catArray = categories.split(',').map(c => c.trim());
        query.category = { $in: catArray.map(c => new RegExp(c, 'i')) };
    }
    
    // Ã‡oklu kaynak
    if (sources) {
        const srcArray = sources.split(',').map(s => s.trim());
        query.source = { $in: srcArray.map(s => new RegExp(s, 'i')) };
    }
    
    // Tarih aralÄ±ÄŸÄ±
    if (startDate || endDate) {
        query.publishedAt = {};
        if (startDate) query.publishedAt.$gte = new Date(startDate);
        if (endDate) query.publishedAt.$lte = new Date(endDate);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [news, total] = await Promise.all([
        News.find(query)
            .sort({ publishedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        News.countDocuments(query)
    ]);
    
    // Duygu analizi ve filtreleme
    let result = sentimentService.analyzeBatch(news);
    
    if (sentiment) {
        result = result.filter(n => n.sentiment.sentiment === sentiment);
    }
    
    res.json({
        success: true,
        data: {
            news: result,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        }
    });
}));

module.exports = router;
