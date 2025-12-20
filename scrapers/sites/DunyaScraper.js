/**
 * ===========================================
 * DÜNYA GAZETESİ SCRAPER
 * ===========================================
 * 
 * Dünya Gazetesi (dunya.com) haber sitesi için scraper.
 * 
 * SİTE ANALİZİ:
 * Dünya Gazetesi, Türkiye'nin önde gelen ekonomi gazetelerinden biridir.
 * İş dünyası, finans ve ekonomi haberlerine odaklanır.
 * 
 * ÖZEL DURUMLAR:
 * - Site hem statik hem dinamik içerik barındırabilir
 * - Infinite scroll kullanmıyor, pagination tercih ediyor
 * - Haber detay sayfalarına gitmeden liste sayfasından bilgi çekilebilir
 */

const BaseScraper = require('../base/BaseScraper');
const config = require('../../config');
const { parseDate, cleanText, extractKeywords } = require('../../utils');

class DunyaScraper extends BaseScraper {
    constructor() {
        super({
            name: 'DunyaGazetesi',
            baseUrl: 'https://www.dunya.com',
            source: 'dunya',
            category: 'ekonomi'  // Dünya ağırlıklı ekonomi haberi
        });
        
        // Kategori URL'leri
        this.urls = {
            main: 'https://www.dunya.com',
            ekonomi: 'https://www.dunya.com/ekonomi',
            finans: 'https://www.dunya.com/finans',
            sirketler: 'https://www.dunya.com/sirketler',
            politika: 'https://www.dunya.com/gundem',
            teknoloji: 'https://www.dunya.com/teknoloji'
        };
    }

    getTargetUrl() {
        return this.urls.ekonomi;
    }

    async waitForContent() {
        try {
            // Dünya gazetesi için haber container selector'ı
            await this.waitForSelector('.news-list, .article-list, article, .card', {
                timeout: 15000
            });
        } catch (error) {
            console.log(`⏳ [${this.name}] İçerik yükleme timeout - devam ediliyor`);
        }
    }

    /**
     * Haber öğelerini parse et
     * 
     * DÜNYA GAZETESİ HTML YAPISI:
     * Site genellikle grid veya list formatında haberler gösterir.
     * Her haber kartında:
     * - .card veya article container
     * - İçinde .title veya h tag
     * - .summary veya p tag'inde özet
     * - time veya .date'de tarih
     * 
     * @param {CheerioAPI} $ - Cheerio instance
     * @returns {object[]} - Haberler
     */
    async parseNewsItems($) {
        const news = [];
        
        console.log(`📰 [${this.name}] Haberler parse ediliyor...`);
        
        // Dünya gazetesi için olası selector'lar
        const newsSelectors = [
            'article.card',
            '.news-item',
            '.article-item',
            '.content-list article',
            '.category-news article',
            'article[class*="article"]',
            '.news-card',
            '.col article'
        ];
        
        let $newsItems = $();
        
        for (const selector of newsSelectors) {
            $newsItems = $(selector);
            if ($newsItems.length > 0) {
                console.log(`✅ [${this.name}] Selector bulundu: "${selector}" (${$newsItems.length} haber)`);
                break;
            }
        }
        
        // Alternatif: Tüm haber linklerini bul
        if ($newsItems.length === 0) {
            console.log(`⚠️ [${this.name}] Spesifik selector bulunamadı, link bazlı arama...`);
            $newsItems = $('a[href*="/ekonomi/"], a[href*="/finans/"], a[href*="/sirketler/"]')
                .filter((i, el) => {
                    // Sadece metin içeren linkleri al
                    return $(el).text().trim().length > 10;
                });
        }
        
        $newsItems.each((index, element) => {
            try {
                const $item = $(element);
                const newsData = this.parseNewsItem($item, $);
                
                if (newsData && newsData.title && newsData.url) {
                    // Duplicate kontrolü (aynı URL)
                    const isDuplicate = news.some(n => n.url === newsData.url);
                    if (!isDuplicate) {
                        news.push(newsData);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ [${this.name}] Haber #${index} parse hatası:`, error.message);
            }
        });
        
        console.log(`📊 [${this.name}] Toplam ${news.length} haber parse edildi`);
        
        return news;
    }

    parseNewsItem($item, $) {
        /**
         * BAŞLIK
         * 
         * Dünya gazetesinde başlıklar genellikle:
         * - .title class'ında
         * - h2, h3 tag'lerinde
         * - a tag'inin text'inde
         */
        let title = '';
        
        // Önce specific class'ları dene
        const $titleEl = $item.find('.title, .headline, h2, h3, h4').first();
        if ($titleEl.length) {
            title = cleanText($titleEl.text());
        }
        
        // Title hala boşsa item'ın kendisi a tag mı kontrol et
        if (!title && $item.is('a')) {
            title = cleanText($item.text());
        }
        
        // Son çare: İlk link'in text'i
        if (!title) {
            title = cleanText($item.find('a').first().text());
        }
        
        /**
         * URL
         */
        let url = '';
        
        if ($item.is('a')) {
            url = $item.attr('href');
        } else {
            url = $item.find('a').first().attr('href') || '';
        }
        
        url = this.makeAbsoluteUrl(url);
        
        if (!url || !url.startsWith('http')) {
            return null;
        }
        
        /**
         * TARİH
         * 
         * Dünya sitesinde tarih formatı: "20 Aralık 2024" veya "20.12.2024"
         */
        let publishedAt = null;
        
        // time tag'i
        const $time = $item.find('time').first();
        if ($time.length) {
            const datetime = $time.attr('datetime') || $time.text();
            publishedAt = parseDate(datetime);
        }
        
        // date class'ı
        if (!publishedAt) {
            const dateText = $item.find('.date, .time, [class*="date"]').first().text();
            if (dateText) {
                publishedAt = parseDate(dateText);
            }
        }
        
        // Varsayılan
        if (!publishedAt) {
            publishedAt = new Date();
        }
        
        /**
         * ÖZET
         */
        let summary = '';
        const $summary = $item.find('.summary, .description, .excerpt, p').first();
        if ($summary.length) {
            summary = cleanText($summary.text());
            // Özet başlıkla aynıysa boşalt
            if (summary === title) summary = '';
        }
        
        /**
         * GÖRSEL
         */
        const $img = $item.find('img').first();
        let imageUrl = '';
        if ($img.length) {
            imageUrl = $img.attr('data-src') || $img.attr('data-lazy') || $img.attr('src') || '';
            imageUrl = this.makeAbsoluteUrl(imageUrl);
        }
        
        /**
         * KATEGORİ TESPİTİ
         * 
         * URL'den kategori çıkarmaya çalış
         */
        let category = this.defaultCategory;
        
        // URL pattern: /ekonomi/haber-basligi-123
        const categoryMatch = url.match(/dunya\.com\/([^\/]+)\//);
        if (categoryMatch) {
            const urlCategory = categoryMatch[1].toLowerCase();
            if (['ekonomi', 'finans', 'teknoloji', 'gundem', 'spor'].includes(urlCategory)) {
                // gundem -> politika mapping
                category = urlCategory === 'gundem' ? 'politika' : urlCategory;
            }
        }
        
        return {
            title,
            summary,
            url,
            imageUrl,
            publishedAt,
            keywords: extractKeywords(title + ' ' + summary),
            category,
            source: this.source
        };
    }

    /**
     * Keyword ile haber ara
     * 
     * Dünya gazetesinin arama sayfasını kullanır
     * 
     * @param {string} keyword - Aranacak kelime
     * @returns {object[]} - Bulunan haberler
     */
    async searchByKeyword(keyword) {
        const searchUrl = `https://www.dunya.com/arama?query=${encodeURIComponent(keyword)}`;
        
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🔍 [${this.name}] "${keyword}" araması yapılıyor...`);
        console.log(`🌐 URL: ${searchUrl}`);
        console.log(`${'='.repeat(50)}\n`);

        const news = [];

        try {
            await this.initBrowser();
            await this.page.goto(searchUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });

            await this.delay(3000);

            // Arama sonuçlarını parse et
            const html = await this.page.content();
            const cheerio = require('cheerio');
            const $ = cheerio.load(html);

            // Arama sonuçlarındaki haber linkleri
            $('a[href*="/haber"], a[href*="/ekonomi"], a[href*="/finans"]').each((i, el) => {
                if (news.length >= 20) return false; // Max 20 haber

                const $el = $(el);
                const title = cleanText($el.text());
                let url = $el.attr('href');

                // Başlık kontrolü
                if (!title || title.length < 15) return;
                
                // URL düzeltme
                if (url && !url.startsWith('http')) {
                    url = 'https://www.dunya.com' + url;
                }

                // Duplicate kontrolü
                if (news.some(n => n.url === url)) return;

                // Görsel
                const $img = $el.find('img').first();
                let imageUrl = '';
                if ($img.length) {
                    imageUrl = $img.attr('data-src') || $img.attr('src') || '';
                    if (imageUrl && !imageUrl.startsWith('http')) {
                        imageUrl = 'https://www.dunya.com' + imageUrl;
                    }
                }

                news.push({
                    title: title.substring(0, 200),
                    summary: `"${keyword}" araması sonucu - Dünya Gazetesi`,
                    url,
                    imageUrl,
                    publishedAt: new Date(),
                    keywords: extractKeywords(title),
                    category: this.detectCategoryFromTitle(title),
                    source: this.source
                });
            });

            console.log(`✅ [${this.name}] ${news.length} haber bulundu`);

        } catch (error) {
            console.error(`❌ [${this.name}] Arama hatası:`, error.message);
        } finally {
            await this.closeBrowser();
        }

        return news;
    }

    /**
     * Başlıktan kategori tespit et
     */
    detectCategoryFromTitle(title) {
        const text = title.toLowerCase();
        
        if (text.includes('dolar') || text.includes('euro') || text.includes('kur') || text.includes('merkez bankası')) {
            return 'finans';
        }
        if (text.includes('borsa') || text.includes('hisse') || text.includes('bist')) {
            return 'borsa';
        }
        if (text.includes('altın') || text.includes('petrol')) {
            return 'emtia';
        }
        
        return 'ekonomi';
    }

    /**
     * Tüm kategorileri scrape et
     * 
     * @returns {object[]} - Tüm kategorilerden haberler
     */
    async scrapeAllCategories() {
        const allNews = [];
        
        for (const [category, url] of Object.entries(this.urls)) {
            if (category === 'main') continue;
            
            console.log(`\n📂 [${this.name}] Kategori: ${category}`);
            
            try {
                const news = await this.scrape(url);
                // Haberlere kategori ata
                news.forEach(item => {
                    item.category = category === 'sirketler' ? 'ekonomi' : category;
                });
                allNews.push(...news);
            } catch (error) {
                console.error(`❌ [${this.name}] ${category} kategorisi hatası:`, error.message);
            }
            
            // Kategoriler arası bekleme
            const { randomDelay } = require('../../utils');
            await randomDelay(2000, 4000);
        }
        
        return allNews;
    }
}

module.exports = DunyaScraper;
