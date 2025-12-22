/**
 * ===========================================
 * SCRAPER SERVİSİ (Orchestrator)
 * ===========================================
 * 
 * Bu servis, scraper'ları yönetir ve koordine eder.
 * - Tüm scraper'ları çalıştırma
 * - Sonuçları veritabanına kaydetme
 * - Hata yönetimi ve loglama
 * - Eşzamanlılık kontrolü
 * 
 * NEDEN SERVİS KATMANI?
 * 1. İş mantığını (business logic) controller'lardan ayırır
 * 2. Yeniden kullanılabilirlik sağlar (API'den veya cron'dan çağrılabilir)
 * 3. Test edilmesi kolaydır
 * 4. Tek sorumluluk prensibi (Single Responsibility)
 */

const { createScraper, getAvailableScrapers } = require('../scrapers');
const { News } = require('../models');
const config = require('../config');
const { randomDelay, retry } = require('../utils');

class ScraperService {
    constructor() {
        // Scraping durumu
        this.isRunning = false;
        
        // İstatistikler
        this.stats = {
            lastRun: null,
            totalScraped: 0,
            totalSaved: 0,
            errors: []
        };
    }

    /**
     * Tüm kaynakları scrape et
     * 
     * Bu metod şunları yapar:
     * 1. Her kaynak için scraper oluştur
     * 2. Sırayla (veya paralel) scrape et
     * 3. Sonuçları veritabanına kaydet
     * 4. İstatistikleri güncelle
     * 
     * @param {object} options - Scraping seçenekleri
     * @returns {object} - Scraping sonucu
     */
    async scrapeAll(options = {}) {
        // Zaten çalışıyorsa yeni işlem başlatma
        if (this.isRunning) {
            console.warn('⚠️ Scraping zaten devam ediyor!');
            return {
                success: false,
                message: 'Scraping zaten devam ediyor'
            };
        }

        this.isRunning = true;
        const startTime = Date.now();
        
        console.log('\n' + '█'.repeat(60));
        console.log('█ TOPLU SCRAPING BAŞLIYOR (RSS)');
        console.log('█' + '─'.repeat(58));
        console.log(`█ Zaman: ${new Date().toLocaleString('tr-TR')}`);
        console.log('█'.repeat(60) + '\n');

        const results = {
            success: true,
            totalNews: 0,
            savedNews: 0,
            duplicates: 0,
            errors: [],
            duration: 0
        };

        try {
            // RSS Scraper kullan (hızlı ve güvenilir)
            const RSSNewsScraper = require('../scrapers/sites/RSSNewsScraper');
            const rssScraper = new RSSNewsScraper();
            
            // Tüm RSS kaynaklarından haber çek (scrapeAllStaggered kullanılıyor)
            const news = await rssScraper.scrapeAllStaggered((progress) => {
                if (progress.current % 10 === 0) {
                    console.log(`📡 İlerleme: ${progress.current}/${progress.total} feed`);
                }
            });

            if (news.length > 0) {
                // Sonuçları kaydet
                const saveResult = await this.saveNews(news);
                results.totalNews = news.length;
                results.savedNews = saveResult.saved;
                results.duplicates = saveResult.duplicates;
            }

        } catch (error) {
            console.error('❌ Toplu scraping hatası:', error);
            results.success = false;
            results.errors.push({ general: error.message });

        } finally {
            this.isRunning = false;
            results.duration = Date.now() - startTime;
            
            // İstatistikleri güncelle
            this.stats.lastRun = new Date();
            this.stats.totalScraped += results.totalNews;
            this.stats.totalSaved += results.savedNews;
        }

        // Özet rapor
        console.log('\n' + '█'.repeat(60));
        console.log('█ SCRAPING TAMAMLANDI');
        console.log('█' + '─'.repeat(58));
        console.log(`█ Toplam Haber: ${results.totalNews}`);
        console.log(`█ Kaydedilen: ${results.savedNews}`);
        console.log(`█ Duplicate: ${results.duplicates}`);
        console.log(`█ Hatalar: ${results.errors.length}`);
        console.log(`█ Süre: ${(results.duration / 1000).toFixed(2)} saniye`);
        console.log('█'.repeat(60) + '\n');

        return results;
    }

    /**
     * Belirli bir kaynağı scrape et
     * 
     * @param {string} sourceName - Kaynak adı
     * @returns {object} - Scraping sonucu
     */
    async scrapeSource(sourceName) {
        console.log(`📌 Tek kaynak scraping: ${sourceName}`);

        try {
            const scraper = createScraper(sourceName);
            const news = await scraper.scrape();
            const saveResult = await this.saveNews(news);

            return {
                success: true,
                source: sourceName,
                scraped: news.length,
                saved: saveResult.saved,
                duplicates: saveResult.duplicates
            };

        } catch (error) {
            console.error(`❌ ${sourceName} scraping hatası:`, error);
            return {
                success: false,
                source: sourceName,
                error: error.message
            };
        }
    }

    /**
     * Haberleri veritabanına kaydet
     * 
     * UPSERT MANTIĞI:
     * - Haber zaten varsa (URL'ye göre) güncelleme
     * - Yoksa yeni kayıt oluştur
     * - Bu sayede duplicate'ler önlenir
     * 
     * @param {object[]} newsArray - Haber dizisi
     * @returns {object} - Kaydetme sonucu
     */
    async saveNews(newsArray) {
        const result = {
            saved: 0,
            duplicates: 0,
            errors: []
        };

        if (!newsArray || newsArray.length === 0) {
            return result;
        }

        console.log(`💾 ${newsArray.length} haber kaydediliyor...`);

        for (const newsItem of newsArray) {
            try {
                /**
                 * updateOne with upsert
                 * 
                 * - filter: { url: newsItem.url } -> URL'ye göre bul
                 * - update: { $set: newsItem } -> Tüm alanları güncelle
                 * - upsert: true -> Bulunamazsa yeni kayıt oluştur
                 * 
                 * Bu yaklaşım "upsert" (update + insert) olarak bilinir
                 */
                const updateResult = await News.updateOne(
                    { url: newsItem.url },  // Arama kriteri
                    { 
                        $set: {
                            title: newsItem.title,
                            summary: newsItem.summary,
                            url: newsItem.url,
                            imageUrl: newsItem.imageUrl,
                            category: newsItem.category,
                            source: newsItem.source,
                            keywords: newsItem.keywords,
                            publishedAt: newsItem.publishedAt,
                            scrapedAt: newsItem.scrapedAt || new Date(),
                            isActive: true
                        },
                        // $setOnInsert: Sadece yeni kayıtta çalışır
                        $setOnInsert: {
                            createdAt: new Date()
                        }
                    },
                    { upsert: true }  // Yoksa oluştur
                );

                /**
                 * updateResult.upsertedCount
                 * - 1 ise: Yeni kayıt oluşturuldu
                 * - 0 ise: Mevcut kayıt güncellendi (duplicate)
                 */
                if (updateResult.upsertedCount > 0) {
                    result.saved++;
                } else {
                    result.duplicates++;
                }

            } catch (error) {
                // MongoDB duplicate key error (E11000)
                if (error.code === 11000) {
                    result.duplicates++;
                } else {
                    console.error(`⚠️ Haber kaydetme hatası: ${error.message}`);
                    result.errors.push({
                        url: newsItem.url,
                        error: error.message
                    });
                }
            }
        }

        console.log(`✅ Kaydetme tamamlandı: ${result.saved} yeni, ${result.duplicates} duplicate`);

        return result;
    }

    /**
     * Kategori ve anahtar kelimeye göre haber ara
     * 
     * @param {object} filters - Arama filtreleri
     * @returns {object[]} - Eşleşen haberler
     */
    async searchNews(filters = {}) {
        const {
            category,
            keyword,
            source,
            startDate,
            endDate,
            page = 1,
            limit = 20
        } = filters;

        // MongoDB sorgu objesi
        const query = { isActive: true };

        // Kategori filtresi
        if (category) {
            query.category = category.toLowerCase();
        }

        // Kaynak filtresi
        if (source) {
            query.source = source.toLowerCase();
        }

        // Tarih aralığı filtresi
        if (startDate || endDate) {
            query.publishedAt = {};
            if (startDate) {
                query.publishedAt.$gte = new Date(startDate);
            }
            if (endDate) {
                query.publishedAt.$lte = new Date(endDate);
            }
        }

        // Anahtar kelime araması
        if (keyword) {
            /**
             * $text search: MongoDB full-text search
             * 
             * Bu, News modelinde tanımladığımız text index'i kullanır.
             * Başlık, özet ve anahtar kelimelerde arama yapar.
             */
            query.$text = { $search: keyword };
        }

        // Sayfalama hesaplaması
        const skip = (page - 1) * limit;

        // Sorguyu çalıştır
        const [news, total] = await Promise.all([
            keyword 
                ? News.find(query, { score: { $meta: 'textScore' } })
                      .sort({ score: { $meta: 'textScore' } })
                      .skip(skip)
                      .limit(limit)
                : News.find(query)
                      .sort({ publishedAt: -1 })
                      .skip(skip)
                      .limit(limit),
            News.countDocuments(query)
        ]);

        return {
            news,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        };
    }

    /**
     * Scraper istatistiklerini al
     * 
     * @returns {object} - İstatistikler
     */
    async getStats() {
        // Veritabanı istatistikleri
        const [
            totalNews,
            todayNews,
            byCategory,
            bySource
        ] = await Promise.all([
            News.countDocuments({ isActive: true }),
            News.countDocuments({
                isActive: true,
                scrapedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }),
            News.aggregate([
                { $match: { isActive: true } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            News.aggregate([
                { $match: { isActive: true } },
                { $group: { _id: '$source', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        return {
            service: {
                isRunning: this.isRunning,
                lastRun: this.stats.lastRun,
                totalScraped: this.stats.totalScraped,
                totalSaved: this.stats.totalSaved
            },
            database: {
                totalNews,
                todayNews,
                byCategory: byCategory.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                bySource: bySource.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {})
            },
            availableSources: getAvailableScrapers()
        };
    }

    /**
     * CANLI ARAMA - Veritabanı kullanmadan direkt RSS'den arar
     * Her aramada tüm kaynakları tarar, sonuçları döndürür
     * 
     * @param {string} keyword - Aranacak kelime
     * @returns {object} - Arama sonucu
     */
    async liveSearch(keyword) {
        console.log('\n' + '█'.repeat(60));
        console.log(`█ CANLI ARAMA: "${keyword}"`);
        console.log('█'.repeat(60) + '\n');

        const startTime = Date.now();

        try {
            const RSSNewsScraper = require('../scrapers/sites/RSSNewsScraper');
            const rssScraper = new RSSNewsScraper();
            
            // Canlı arama yap
            const news = await rssScraper.liveSearch(keyword);
            
            const duration = Date.now() - startTime;

            console.log('█'.repeat(60));
            console.log(`█ CANLI ARAMA TAMAMLANDI: "${keyword}"`);
            console.log(`█ Bulunan: ${news.length} haber`);
            console.log(`█ Süre: ${(duration / 1000).toFixed(2)} saniye`);
            console.log('█'.repeat(60) + '\n');

            return {
                success: true,
                keyword,
                news,
                count: news.length,
                duration
            };

        } catch (error) {
            console.error('❌ Canlı arama hatası:', error);
            return {
                success: false,
                keyword,
                news: [],
                count: 0,
                error: error.message
            };
        }
    }

    /**
     * KATEGORİYE GÖRE CANLI HABER ÇEK
     * Veritabanı kullanmadan direkt RSS'den o kategorideki haberleri çeker
     * 
     * @param {string} category - Kategori adı (Spor, Ekonomi, Teknoloji, vs.)
     * @returns {object} - Kategori haberleri
     */
    async liveCategory(category) {
        console.log('\n' + '█'.repeat(60));
        console.log(`█ KATEGORİ HABERLERİ: "${category}"`);
        console.log('█'.repeat(60) + '\n');

        const startTime = Date.now();

        try {
            const RSSNewsScraper = require('../scrapers/sites/RSSNewsScraper');
            const rssScraper = new RSSNewsScraper();
            
            // Kategoriye göre haber çek
            const news = await rssScraper.scrapeByCategory(category);
            
            const duration = Date.now() - startTime;

            console.log('█'.repeat(60));
            console.log(`█ KATEGORİ TAMAMLANDI: "${category}"`);
            console.log(`█ Bulunan: ${news.length} haber`);
            console.log(`█ Süre: ${(duration / 1000).toFixed(2)} saniye`);
            console.log('█'.repeat(60) + '\n');

            return {
                success: true,
                category,
                news,
                count: news.length,
                duration
            };

        } catch (error) {
            console.error('❌ Kategori hatası:', error);
            return {
                success: false,
                category,
                news: [],
                count: 0,
                error: error.message
            };
        }
    }

    /**
     * Keyword ile scraping yap (veritabanına kaydeder)
     * 
     * RSS Feed'lerden belirli bir anahtar kelime ile haber çeker.
     * Tarayıcı kullanmaz, hızlı ve güvenilir çalışır.
     * 
     * @param {string} keyword - Aranacak kelime
     * @returns {object} - Scraping sonucu
     */
    async scrapeWithKeyword(keyword) {
        if (this.isRunning) {
            console.warn('⚠️ Scraping zaten devam ediyor!');
            return {
                success: false,
                message: 'Scraping zaten devam ediyor'
            };
        }

        this.isRunning = true;
        const startTime = Date.now();

        console.log('\n' + '█'.repeat(60));
        console.log(`█ KEYWORD SCRAPING: "${keyword}"`);
        console.log('█'.repeat(60) + '\n');

        const results = {
            success: true,
            keyword,
            totalNews: 0,
            savedNews: 0,
            duplicates: 0,
            errors: [],
            duration: 0
        };

        try {
            // RSS Scraper'ı kullan (tarayıcı gerektirmez, hızlı çalışır)
            const RSSNewsScraper = require('../scrapers/sites/RSSNewsScraper');
            const rssScraper = new RSSNewsScraper();
            
            // Keyword ile arama yap
            const news = await rssScraper.searchByKeyword(keyword);
            
            if (news.length > 0) {
                // Sonuçları kaydet
                const saveResult = await this.saveNews(news);
                results.totalNews = news.length;
                results.savedNews = saveResult.saved;
                results.duplicates = saveResult.duplicates;
                console.log(`✅ ${news.length} haber bulundu, ${saveResult.saved} kaydedildi`);
            } else {
                console.log(`ℹ️ "${keyword}" ile ilgili haber bulunamadı`);
            }

        } catch (error) {
            console.error('❌ Keyword scraping hatası:', error);
            results.success = false;
            results.errors.push({ general: error.message });

        } finally {
            this.isRunning = false;
            results.duration = Date.now() - startTime;
            this.stats.lastRun = new Date();
            this.stats.totalScraped += results.totalNews;
            this.stats.totalSaved += results.savedNews;
        }

        console.log('\n' + '█'.repeat(60));
        console.log(`█ KEYWORD SCRAPING TAMAMLANDI: "${keyword}"`);
        console.log(`█ Bulunan: ${results.totalNews}, Kaydedilen: ${results.savedNews}`);
        console.log(`█ Süre: ${(results.duration / 1000).toFixed(2)} saniye`);
        console.log('█'.repeat(60) + '\n');

        return results;
    }

    /**
     * Eski haberleri temizle
     * 
     * Belirli bir günden eski haberleri siler veya deaktive eder.
     * Veritabanı boyutunu kontrol altında tutmak için.
     * 
     * @param {number} daysOld - Kaç günden eski haberler silinsin
     * @param {boolean} hardDelete - Gerçekten sil mi yoksa deaktive mi et
     */
    async cleanupOldNews(daysOld = 30, hardDelete = false) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        console.log(`🧹 ${daysOld} günden eski haberler temizleniyor...`);

        if (hardDelete) {
            const result = await News.deleteMany({
                publishedAt: { $lt: cutoffDate }
            });
            console.log(`🗑️ ${result.deletedCount} haber silindi`);
            return result.deletedCount;
        } else {
            const result = await News.updateMany(
                { publishedAt: { $lt: cutoffDate } },
                { $set: { isActive: false } }
            );
            console.log(`📦 ${result.modifiedCount} haber deaktive edildi`);
            return result.modifiedCount;
        }
    }
}

// Singleton pattern - tek instance
const scraperService = new ScraperService();

module.exports = scraperService;
