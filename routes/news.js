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
const { asyncHandler, apiKey, validateKeyword, validateCategory, validatePagination } = require('../middleware');
const config = require('../config');
const redis = require('../utils/redisClient');
const { searchCache, newsListCache } = require('../utils/memoryCache');

// Sadece gerekli alanları döndürmek için projeksiyon
const NEWS_PROJECTION = {
    _id: 1,
    title: 1,
    summary: 1,
    url: 1,
    imageUrl: 1,
    publishedAt: 1,
    source: 1,
    category: 1
};

/**
 * ===========================================
 * GET /api/news
 * ===========================================
 * 
 * Tüm haberleri listele (sayfalama ile) - CACHE DESTEKLİ
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
    
    // Cache key oluştur
    const cacheKey = `news:list:${pageNum}:${limitNum}:${category || 'all'}:${search || 'none'}`;
    
    // Cache'den kontrol et
    const cached = newsListCache.get(cacheKey);
    if (cached) {
        console.log(`📦 Cache HIT: ${cacheKey}`);
        return res.json({ ...cached, fromCache: true });
    }
    
    // Sorgu objesi oluştur
    const query = { isActive: true };
    
    // Kategori filtresi (güvenli regex)
    if (category) {
        const safeCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.category = { $regex: new RegExp(safeCategory, 'i') };
    }
    
    // Arama filtresi (güvenli regex)
    if (search) {
        const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
            { title: { $regex: new RegExp(safeSearch, 'i') } },
            { summary: { $regex: new RegExp(safeSearch, 'i') } }
        ];
    }
    
    // Toplam sayıyı al
    const total = await News.countDocuments(query);
    
    // Haberleri getir - sadece gerekli alanlar
    const news = await News.find(query)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select(NEWS_PROJECTION)
        .lean();
    
    const response = {
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
    };
    
    // Cache'e kaydet (2 dakika)
    newsListCache.set(cacheKey, response, 120);
    
    res.json(response);
}));

/**
 * ===========================================
 * GET /api/news/live-search
 * ===========================================
 * 
 * HIZLI ARAMA: DB + GOOGLE NEWS PARALEL, BOŞSA FULL SCRAPE - CACHE DESTEKLİ
 * 
 * Akış:
 * 1. Veritabanı + Google News paralel sorgulanır (hızlı)
 * 2. Google News sonuçları DB'ye kaydedilir
 * 3. Eğer DB'de sonuç yoksa → full scrape yapılır
 * 4. Sonuçlar döndürülür + scraping durumu bildirilir
 * 
 * Query parametreleri:
 * - keyword: Aranacak kelime (zorunlu)
 * - limit: Sonuç sayısı (varsayılan: 50)
 * 
 * Örnek: GET /api/news/live-search?keyword=dolar&limit=30
 */
router.get('/live-search', asyncHandler(async (req, res) => {
    const { keyword, limit = 50 } = req.query;
    
    // Güvenli input validation
    const keywordValidation = validateKeyword(keyword);
    if (!keywordValidation.valid) {
        return res.status(400).json({
            success: false,
            message: keywordValidation.message
        });
    }

    const q = keywordValidation.keyword;
    const { limit: limitNum } = validatePagination(1, limit);
    
    // Cache key oluştur
    const cacheKey = `search:${q.toLowerCase()}:${limitNum}`;
    
    // Cache'den kontrol et (5 dakika geçerli)
    const cached = searchCache.get(cacheKey);
    if (cached) {
        console.log(`📦 Search Cache HIT: ${cacheKey}`);
        return res.json({ ...cached, fromCache: true, cacheDuration: '5min' });
    }
    
    const startTime = Date.now();

    console.log(`🔍 Hızlı arama başlatılıyor: "${q}"`);

    /**
     * OPTİMİZASYON: $regex yerine $text search kullan
     * 
     * $regex SORUNU:
     * - Her dökümanı sırayla tarar (full collection scan)
     * - 4000 haber × ortalama 2KB = 8MB veri taranıyor
     * - Index KULLANILAMAZ
     * - O(n) karmaşıklık
     * 
     * $text ÇÖZÜMÜ:
     * - Text index kullanır (B-tree)
     * - Sadece index'te arama yapar
     * - O(log n) karmaşıklık
     * - 100-1000x daha hızlı!
     */
    
    // PROJECTION - Sadece gerekli alanlar (kritik optimizasyon!)
    const projection = {
        _id: 1,
        title: 1,
        summary: 1,
        url: 1,
        imageUrl: 1,
        publishedAt: 1,
        source: 1,
        category: 1,
        score: { $meta: 'textScore' }
    };
    
    // DB sorgu objesi - $text search kullan
    const dbQuery = {
        isActive: true,
        $text: { $search: q }
    };

    // 1. PARALEL: Veritabanı + Google News aynı anda
    const RSSNewsScraper = require('../scrapers/sites/RSSNewsScraper');
    const rssScraper = new RSSNewsScraper();
    
    const [dbNews, googleNews] = await Promise.all([
        News.find(dbQuery, projection)
            .sort({ score: { $meta: 'textScore' } })
            .limit(limitNum)
            .lean(),
        rssScraper.searchGoogleNews(q).catch(err => {
            console.warn('⚠️ Google News hatası:', err.message);
            return [];
        })
    ]);

    console.log(`� DB: ${dbNews.length} sonuç, Google News: ${googleNews.length} sonuç`);

    // 2. Google News sonuçlarını DB'ye kaydet (arka planda)
    let savedCount = 0;
    let duplicateCount = 0;
    
    if (googleNews.length > 0) {
        for (const newsItem of googleNews) {
            try {
                const updateResult = await News.updateOne(
                    { url: newsItem.url },
                    {
                        $set: {
                            title: newsItem.title,
                            summary: newsItem.description || '',
                            url: newsItem.url,
                            imageUrl: newsItem.imageUrl || newsItem.image,
                            category: newsItem.category || 'Google News',
                            source: newsItem.source,
                            keywords: [q.toLowerCase()],
                            publishedAt: newsItem.publishedAt ? new Date(newsItem.publishedAt) : new Date(),
                            scrapedAt: new Date(),
                            isActive: true
                        },
                        $setOnInsert: { createdAt: new Date() }
                    },
                    { upsert: true }
                );
                
                if (updateResult.upsertedCount > 0) savedCount++;
                else duplicateCount++;
            } catch (err) {
                if (err.code !== 11000) {
                    console.warn(`⚠️ Haber kaydetme hatası: ${err.message}`);
                }
            }
        }
        console.log(`✅ Google News kaydedildi: ${savedCount} yeni, ${duplicateCount} mevcut`);
    }

    // 3. Eğer DB'de hiç sonuç yoksa → full scrape yap
    let isScrapingMore = false;
    let fullScrapeNews = [];
    
    if (dbNews.length === 0 && googleNews.length === 0) {
        console.log(`⚠️ Veritabanında "${q}" bulunamadı, full scrape başlatılıyor...`);
        isScrapingMore = true;
        
        try {
            // Full scrape (RSS kaynaklarından arama)
            const scrapeResult = await scraperService.liveSearch(q);
            
            if (scrapeResult.news && scrapeResult.news.length > 0) {
                console.log(`💾 ${scrapeResult.news.length} haber bulundu, DB'ye kaydediliyor...`);
                
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
                                $setOnInsert: { createdAt: new Date() }
                            },
                            { upsert: true }
                        );
                        
                        if (updateResult.upsertedCount > 0) savedCount++;
                        else duplicateCount++;
                    } catch (err) {
                        if (err.code !== 11000) {
                            console.warn(`⚠️ Haber kaydetme hatası: ${err.message}`);
                        }
                    }
                }
                
                // Scrape sonrası DB'den tekrar çek (optimize edilmiş sorgu)
                fullScrapeNews = await News.find(dbQuery, projection)
                    .sort({ score: { $meta: 'textScore' } })
                    .limit(limitNum)
                    .lean();
            }
        } catch (err) {
            console.error('❌ Full scrape hatası:', err.message);
        }
    }

    // 4. Sonuçları birleştir ve döndür
    // DB'den gelenler + Google News'ten yeni gelenler
    const allResults = [...dbNews];
    
    // Google News'ten gelen ama DB'de olmayanları ekle
    const existingUrls = new Set(dbNews.map(n => n.url));
    for (const gn of googleNews) {
        if (!existingUrls.has(gn.url)) {
            allResults.push({
                title: gn.title,
                summary: gn.description || '',
                url: gn.url,
                imageUrl: gn.imageUrl,
                category: gn.category || 'Google News',
                source: gn.source,
                publishedAt: gn.publishedAt
            });
        }
    }
    
    // Full scrape sonuçlarını ekle
    if (fullScrapeNews.length > 0) {
        for (const fn of fullScrapeNews) {
            if (!existingUrls.has(fn.url)) {
                allResults.push(fn);
                existingUrls.add(fn.url);
            }
        }
    }

    // Tarihe göre sırala ve limitle
    allResults.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const finalNews = allResults.slice(0, limitNum);

    const duration = Date.now() - startTime;

    // 5. Sonuç objesi oluştur
    const response = {
        success: true,
        data: {
            keyword: q,
            news: finalNews,
            count: finalNews.length,
            fromDatabase: dbNews.length,
            fromGoogleNews: googleNews.length,
            saved: savedCount,
            duplicates: duplicateCount,
            isScrapingMore,
            duration,
            source: isScrapingMore ? 'full-scrape' : 'db+google'
        }
    };
    
    // 6. Cache'e kaydet (5 dakika) - sadece sonuç varsa
    if (finalNews.length > 0) {
        searchCache.set(cacheKey, response, 300);
        console.log(`📦 Search Cache SET: ${cacheKey}`);
    }
    
    res.json(response);
}));

/**
 * ===========================================
 * GET /api/news/live-category
 * ===========================================
 * 
 * KATEGORİYE GÖRE CANLI HABER ÇEK + VERİTABANINA KAYDET + VERİTABANINDAN GETİR
 * 
 * Akış:
 * 1. RSS'den o kategorideki haberleri canlı scrape yap
 * 2. Sonuçları veritabanına kaydet
 * 3. Veritabanından kategoriye göre sorgu yap
 * 4. Sonuçları döndür
 * 
 * Query parametreleri:
 * - category: Kategori adı (zorunlu)
 * - limit: Sonuç sayısı (varsayılan: 50)
 * 
 * Örnek: GET /api/news/live-category?category=Spor&limit=30
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

    // 1. Canlı scrape yap
    console.log(`📂 Kategori haberleri çekiliyor: "${cat}"`);
    const scrapeResult = await scraperService.liveCategory(cat);
    
    // 2. Scrape edilen haberleri veritabanına kaydet
    let savedCount = 0;
    let duplicateCount = 0;
    
    if (scrapeResult.news && scrapeResult.news.length > 0) {
        console.log(`💾 ${scrapeResult.news.length} haber veritabanına kaydediliyor...`);
        
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
                    console.warn(`⚠️ Haber kaydetme hatası: ${err.message}`);
                }
            }
        }
        console.log(`✅ Kayıt tamamlandı: ${savedCount} yeni, ${duplicateCount} mevcut`);
    }

    // 3. Veritabanından kategoriye göre sorgula (optimize edilmiş)
    // PROJECTION ile sadece gerekli alanları çek
    const categoryProjection = {
        _id: 1,
        title: 1,
        summary: 1,
        url: 1,
        imageUrl: 1,
        publishedAt: 1,
        source: 1,
        category: 1
    };
    
    const dbNews = await News.find({
        isActive: true,
        category: { $regex: `^${cat}$`, $options: 'i' }  // Tam eşleşme (daha hızlı)
    })
        .select(categoryProjection)
        .sort({ publishedAt: -1 })
        .limit(limitNum)
        .lean();

    const duration = Date.now() - startTime;

    // 4. Sonuçları döndür
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
 * Haber arama endpoint'i (veritabanı + Google News)
 * EN YENİ haberler önce gelir!
 * 
 * Query parametreleri:
 * - keyword: Aranacak kelime (zorunlu)
 * - category: Kategori filtresi (opsiyonel)
 * - source: Kaynak filtresi (opsiyonel)
 * - page: Sayfa numarası (varsayılan: 1)
 * - limit: Sayfa başına haber sayısı (varsayılan: 50)
 * 
 * Örnek kullanım:
 * GET /api/news/search?keyword=bitcoin&limit=50
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
    const {
        keyword,
        category,
        source,
        page = 1,
        limit = 50
    } = req.query;

    // Keyword zorunlu
    if (!keyword || keyword.trim().length < 2) {
        return res.status(400).json({
            success: false,
            message: 'Arama kelimesi en az 2 karakter olmalı'
        });
    }

    const q = keyword.trim();
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const pageNum = parseInt(page) || 1;
    const startTime = Date.now();

    console.log(`🔍 Search başlatıldı: "${q}"`);

    // 1. Google News'den haberleri çek (her zaman)
    const RSSNewsScraper = require('../scrapers/sites/RSSNewsScraper');
    const rssScraper = new RSSNewsScraper();
    
    let googleNews = [];
    try {
        googleNews = await rssScraper.searchGoogleNews(q);
        console.log(`📰 Google News: ${googleNews.length} haber bulundu`);
        
        // Google News haberlerini DB'ye kaydet
        for (const newsItem of googleNews) {
            try {
                await News.updateOne(
                    { url: newsItem.url },
                    {
                        $set: {
                            title: newsItem.title,
                            summary: newsItem.description || '',
                            url: newsItem.url,
                            imageUrl: newsItem.imageUrl,
                            category: newsItem.category || 'Gündem',
                            source: newsItem.source,
                            keywords: [q.toLowerCase()],
                            publishedAt: newsItem.publishedAt ? new Date(newsItem.publishedAt) : new Date(),
                            scrapedAt: new Date(),
                            isActive: true
                        },
                        $setOnInsert: { createdAt: new Date() }
                    },
                    { upsert: true }
                );
            } catch (err) {
                // Duplicate hata ignore
            }
        }
    } catch (err) {
        console.warn('⚠️ Google News hatası:', err.message);
    }

    // 2. Veritabanından ara (text search)
    const projection = {
        _id: 1,
        title: 1,
        summary: 1,
        url: 1,
        imageUrl: 1,
        publishedAt: 1,
        source: 1,
        category: 1
    };

    let dbQuery = { isActive: true };
    
    // Text search kullan
    try {
        dbQuery.$text = { $search: q };
    } catch (e) {
        // Fallback: regex search
        const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        dbQuery.$or = [
            { title: { $regex: safeQ, $options: 'i' } },
            { summary: { $regex: safeQ, $options: 'i' } }
        ];
    }
    
    // Kategori filtresi
    if (category) {
        const safeCat = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        dbQuery.category = { $regex: new RegExp(safeCat, 'i') };
    }
    
    // Kaynak filtresi
    if (source) {
        dbQuery.source = { $regex: new RegExp(source, 'i') };
    }

    // 3. Toplam sayı ve haberler
    const total = await News.countDocuments(dbQuery);
    const skip = (pageNum - 1) * limitNum;
    
    // EN YENİ HABERLER ÖNCE - publishedAt'e göre sırala
    const news = await News.find(dbQuery)
        .select(projection)
        .sort({ publishedAt: -1 })  // En yeni önce!
        .skip(skip)
        .limit(limitNum)
        .lean();

    const duration = Date.now() - startTime;
    console.log(`✅ Search tamamlandı: ${news.length} haber, ${duration}ms`);

    res.json({
        success: true,
        data: {
            keyword: q,
            news: news,
            count: news.length,
            googleNewsCount: googleNews.length,
            duration,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
                hasNext: pageNum < Math.ceil(total / limitNum),
                hasPrev: pageNum > 1
            }
        }
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
    
    // PROJECTION - Sadece gerekli alanlar
    const projection = {
        _id: 1,
        title: 1,
        summary: 1,
        url: 1,
        imageUrl: 1,
        publishedAt: 1,
        source: 1,
        category: 1
    };
    
    /**
     * MongoDB Sorgusu:
     * - find(query): Kriterlere uyan dökümanları bul
     * - select(projection): Sadece belirtilen alanları getir (kritik!)
     * - sort({ publishedAt: -1 }): Yayın tarihine göre azalan sırala (en yeni önce)
     * - limit(safeLimit): Belirtilen sayıda döküman döndür
     * - lean(): Mongoose document yerine plain JavaScript object döndür (daha hızlı)
     */
    const news = await News.find(query)
        .select(projection)
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
 * GET /api/news/category/:category
 * ===========================================
 * 
 * Belirli bir kategorideki haberleri getir (SADECE VERİTABANINDAN)
 * Scrape YAPMAZ - hızlı response için
 * 
 * Parametreler:
 * - category: Kategori adı (URL parametresi)
 * - limit: Sonuç sayısı (varsayılan: 50)
 * 
 * Örnek: GET /api/news/category/Ekonomi?limit=30
 */
router.get('/category/:category', asyncHandler(async (req, res) => {
    const { category } = req.params;
    const { limit = 50 } = req.query;
    
    if (!category || category.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Kategori gerekli'
        });
    }
    
    const cat = category.trim();
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const startTime = Date.now();
    
    // PROJECTION - Sadece gerekli alanlar
    const projection = {
        _id: 1,
        title: 1,
        summary: 1,
        url: 1,
        imageUrl: 1,
        publishedAt: 1,
        source: 1,
        category: 1
    };
    
    // Veritabanından kategoriye göre sorgula (case-insensitive)
    const news = await News.find({
        isActive: true,
        category: { $regex: new RegExp(`^${cat}$`, 'i') }
    })
        .select(projection)
        .sort({ publishedAt: -1 })
        .limit(limitNum)
        .lean();
    
    const duration = Date.now() - startTime;
    
    res.json({
        success: true,
        category: cat,
        count: news.length,
        duration: `${duration}ms`,
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
 * GET /api/news/health
 * ===========================================
 * 
 * Sistem sağlık kontrolü endpoint'i
 * API, veritabanı, cache ve cron job durumlarını döndürür
 * 
 * ÖNEMLİ: Bu route, /:id route'undan ÖNCE tanımlanmalı!
 */
router.get('/health', asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Veritabanı kontrolü
    let dbStatus = 'unknown';
    let newsCount = 0;
    try {
        newsCount = await News.countDocuments({ isActive: true });
        dbStatus = 'connected';
    } catch (err) {
        dbStatus = 'error: ' + err.message;
    }
    
    // Cache istatistikleri
    const cacheStats = {
        search: searchCache.getStats(),
        newsList: newsListCache.getStats()
    };
    
    // Cron job durumu
    const { cronManager } = require('../jobs');
    const cronStats = cronManager.getStats();
    
    const responseTime = Date.now() - startTime;
    
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${responseTime}ms`,
        database: {
            status: dbStatus,
            activeNews: newsCount
        },
        cache: cacheStats,
        cronJobs: cronStats,
        memory: {
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        }
    });
}));

/**
 * ===========================================
 * GET /api/news/cache/stats
 * ===========================================
 * 
 * Cache istatistiklerini döndür
 */
router.get('/cache/stats', asyncHandler(async (req, res) => {
    res.json({
        success: true,
        stats: {
            search: searchCache.getStats(),
            newsList: newsListCache.getStats()
        }
    });
}));

/**
 * ===========================================
 * DELETE /api/news/cache/clear
 * ===========================================
 * 
 * Cache'i temizle (API key gerektirir)
 */
router.delete('/cache/clear', apiKey, asyncHandler(async (req, res) => {
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
