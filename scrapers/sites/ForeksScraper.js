/**
 * ===========================================
 * FOREKS SCRAPER
 * ===========================================
 * 
 * Foreks (foreks.com) haber sitesi için scraper.
 * 
 * SİTE ANALİZİ:
 * Foreks, piyasa verileri ve finans haberleri sunan bir platformdur.
 * Canlı piyasa verileri, analizler ve haberler içerir.
 * 
 * ÖZEL DURUMLAR:
 * - Site dinamik içerik yoğun kullanır (JavaScript render)
 * - Piyasa verileri sürekli güncellenir
 * - Haber içerikleri genellikle kısa ve öz
 * 
 * DİKKAT:
 * Foreks sitesi yapısı diğerlerinden farklı olabilir.
 * Güncel selector'ları site incelenerek belirlenmelidir.
 */

const BaseScraper = require('../base/BaseScraper');
const config = require('../../config');
const { parseDate, cleanText, extractKeywords, randomDelay } = require('../../utils');

class ForeksScraper extends BaseScraper {
    constructor() {
        super({
            name: 'Foreks',
            baseUrl: 'https://www.foreks.com',
            source: 'foreks',
            category: 'finans'
        });
        
        this.urls = {
            main: 'https://www.foreks.com',
            haberler: 'https://www.foreks.com/haberler',
            analizler: 'https://www.foreks.com/analizler',
            piyasalar: 'https://www.foreks.com/piyasa-verileri'
        };
    }

    getTargetUrl() {
        return this.urls.haberler;
    }

    /**
     * İçerik bekleme
     * 
     * Foreks dinamik bir site olduğu için JavaScript'in
     * içeriği render etmesini beklememiz gerekir.
     */
    async waitForContent() {
        try {
            // Dinamik içerik için daha uzun bekleme
            await this.waitForSelector('.news-item, .haber, article, .content-item', {
                timeout: 20000
            });
            
            // Ekstra bekleme - JS'in tamamen yüklenmesi için
            await randomDelay(2000, 3000);
            
        } catch (error) {
            console.log(`⏳ [${this.name}] İçerik yükleme timeout - devam ediliyor`);
        }
    }

    /**
     * Haber öğelerini parse et
     * 
     * FOREKS HTML YAPISI:
     * Foreks sitesi genellikle:
     * - Haber listesi widget'ı
     * - Her haberde mini kart formatı
     * - Başlık ve kısa açıklama
     * 
     * @param {CheerioAPI} $ - Cheerio instance
     * @returns {object[]} - Haberler
     */
    async parseNewsItems($) {
        const news = [];
        
        console.log(`📰 [${this.name}] Haberler parse ediliyor...`);
        
        // Foreks için olası selector'lar
        const newsSelectors = [
            '.news-item',
            '.haber-item',
            'article.news',
            '.news-list li',
            '.content-item',
            '.news-card',
            '[class*="news"] article',
            '.widget-news li',
            'a[href*="/haber/"]',
            'a[href*="/haberler/"]'
        ];
        
        let $newsItems = $();
        
        for (const selector of newsSelectors) {
            $newsItems = $(selector);
            if ($newsItems.length > 0) {
                console.log(`✅ [${this.name}] Selector bulundu: "${selector}" (${$newsItems.length} haber)`);
                break;
            }
        }
        
        // Alternatif arama
        if ($newsItems.length === 0) {
            console.log(`⚠️ [${this.name}] Spesifik selector bulunamadı, genel arama yapılıyor...`);
            
            // Tüm linkleri tara, haber linki olanları seç
            $newsItems = $('a').filter((i, el) => {
                const href = $(el).attr('href') || '';
                const text = $(el).text().trim();
                // Haber linki gibi görünüyor ve içinde metin var
                return (href.includes('/haber') || href.includes('/news')) && 
                       text.length > 20 && text.length < 300;
            });
        }
        
        const processedUrls = new Set(); // Duplicate kontrolü için
        
        $newsItems.each((index, element) => {
            try {
                const $item = $(element);
                const newsData = this.parseNewsItem($item, $);
                
                if (newsData && newsData.title && newsData.url) {
                    // Duplicate kontrolü
                    if (!processedUrls.has(newsData.url)) {
                        processedUrls.add(newsData.url);
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
         */
        let title = '';
        
        // Başlık seçicileri
        const titleSelectors = ['.title', 'h2', 'h3', 'h4', '.headline', 'strong'];
        
        for (const selector of titleSelectors) {
            const $titleEl = $item.find(selector).first();
            if ($titleEl.length) {
                title = cleanText($titleEl.text());
                if (title && title.length > 10) break;
            }
        }
        
        // Item kendisi link ise
        if (!title && $item.is('a')) {
            title = cleanText($item.text());
        }
        
        // Son çare
        if (!title) {
            title = cleanText($item.find('a').first().text());
        }
        
        // Başlık çok uzunsa kırp
        if (title && title.length > 200) {
            title = title.substring(0, 200).trim() + '...';
        }
        
        /**
         * URL
         */
        let url = '';
        
        if ($item.is('a')) {
            url = $item.attr('href');
        } else {
            const $link = $item.find('a').first();
            url = $link.attr('href') || '';
        }
        
        url = this.makeAbsoluteUrl(url);
        
        if (!url || !url.startsWith('http')) {
            return null;
        }
        
        /**
         * TARİH
         * 
         * Foreks haberlerinde tarih formatı:
         * - "12:30" (bugünün haberleri)
         * - "20 Aralık" (bu yılın haberleri)
         * - "20.12.2024" (tam tarih)
         */
        let publishedAt = null;
        
        const $time = $item.find('time, .date, .time, [class*="date"]').first();
        if ($time.length) {
            const dateText = $time.attr('datetime') || $time.text();
            publishedAt = this.parseForeksDate(dateText);
        }
        
        if (!publishedAt) {
            // Sayfadaki herhangi bir tarih formatını bul
            const dateRegex = /(\d{1,2}[.:/-]\d{1,2}[.:/-]?\d{0,4}|\d{1,2}\s+\w+\s*\d{0,4}|\d{2}:\d{2})/;
            const itemText = $item.text();
            const dateMatch = itemText.match(dateRegex);
            
            if (dateMatch) {
                publishedAt = this.parseForeksDate(dateMatch[1]);
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
        const $summary = $item.find('.summary, .description, .excerpt, .spot, p').first();
        if ($summary.length) {
            summary = cleanText($summary.text());
            if (summary === title) summary = '';
        }
        
        /**
         * GÖRSEL
         */
        const $img = $item.find('img').first();
        let imageUrl = '';
        if ($img.length) {
            imageUrl = $img.attr('data-src') || $img.attr('src') || '';
            imageUrl = this.makeAbsoluteUrl(imageUrl);
        }
        
        /**
         * KATEGORİ
         * 
         * Foreks haberleri çoğunlukla finans kategorisinde
         * URL'den ek bilgi çıkarılabilir
         */
        let category = 'finans';
        
        if (url.includes('/analiz')) {
            category = 'finans';
        } else if (url.includes('/teknoloji')) {
            category = 'teknoloji';
        } else if (url.includes('/ekonomi')) {
            category = 'ekonomi';
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
     * Foreks'e özel tarih parse
     * 
     * Foreks bazı haberlerde sadece saat gösterir ("12:30")
     * Bu durumda bugünün tarihi varsayılır.
     * 
     * @param {string} dateStr - Tarih string'i
     * @returns {Date} - Parse edilmiş tarih
     */
    parseForeksDate(dateStr) {
        if (!dateStr) return null;
        
        const cleaned = dateStr.trim();
        
        // Sadece saat formatı: "12:30" veya "09:45"
        if (/^\d{2}:\d{2}$/.test(cleaned)) {
            const now = new Date();
            const [hours, minutes] = cleaned.split(':').map(Number);
            now.setHours(hours, minutes, 0, 0);
            return now;
        }
        
        // "Bugün 12:30" formatı
        if (cleaned.toLowerCase().startsWith('bugün')) {
            const timeMatch = cleaned.match(/(\d{2}:\d{2})/);
            if (timeMatch) {
                const now = new Date();
                const [hours, minutes] = timeMatch[1].split(':').map(Number);
                now.setHours(hours, minutes, 0, 0);
                return now;
            }
            return new Date();
        }
        
        // "Dün 12:30" formatı
        if (cleaned.toLowerCase().startsWith('dün')) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const timeMatch = cleaned.match(/(\d{2}:\d{2})/);
            if (timeMatch) {
                const [hours, minutes] = timeMatch[1].split(':').map(Number);
                yesterday.setHours(hours, minutes, 0, 0);
            }
            return yesterday;
        }
        
        // Standart parse'a gönder
        return parseDate(cleaned);
    }

    /**
     * Canlı piyasa haberlerini scrape et
     * 
     * Foreks'in özel özelliği: canlı piyasa akışı
     * Bu metod ana haber sayfasını scrape eder
     */
    async scrapeLiveNews() {
        console.log(`📡 [${this.name}] Canlı haber akışı scrape ediliyor...`);
        return await this.scrape(this.urls.haberler);
    }
}

module.exports = ForeksScraper;
