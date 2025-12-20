/**
 * ===========================================
 * BLOOMBERG HT SCRAPER
 * ===========================================
 * 
 * Bloomberg HT (bloomberght.com) haber sitesi için scraper.
 * 
 * SİTE ANALİZİ:
 * Bloomberg HT, dinamik içerik kullanan modern bir haber sitesidir.
 * Finans, ekonomi ve piyasa haberleri için önemli bir kaynaktır.
 * 
 * HTML YAPISI (Örnek):
 * Ana sayfada haberler genellikle card/list formatında listelenir.
 * Her haber item'ı tipik olarak:
 * - Bir container div/article
 * - İçinde başlık (h2, h3 veya a tag)
 * - Link (a href)
 * - Tarih (time tag veya span)
 * - Özet/açıklama (p veya span)
 * 
 * NOT: Web sitelerinin HTML yapısı zamanla değişebilir.
 * Scraper çalışmazsa siteyi F12 ile inceleyip selector'ları güncellemeniz gerekebilir.
 */

const BaseScraper = require('../base/BaseScraper');
const config = require('../../config');
const { parseDate, cleanText, extractKeywords } = require('../../utils');

class BloombergScraper extends BaseScraper {
    /**
     * Constructor
     * 
     * super() ile üst sınıfın constructor'ını çağırıyoruz.
     * Ardından Bloomberg'e özel ayarları yapıyoruz.
     */
    constructor() {
        // super(): Parent class'ın (BaseScraper) constructor'ını çağır
        super({
            name: 'BloombergHT',
            baseUrl: 'https://www.bloomberght.com',
            source: 'bloomberg',
            category: 'finans'  // Bloomberg ağırlıklı finans haberi verir
        });
        
        // Bloomberg'e özel scraping URL'leri
        // Farklı kategorileri scrape etmek için kullanılabilir
        this.urls = {
            main: 'https://www.bloomberght.com',
            finans: 'https://www.bloomberght.com/piyasalar',
            ekonomi: 'https://www.bloomberght.com/ekonomi',
            sirketler: 'https://www.bloomberght.com/sirketler'
        };
    }

    /**
     * Scrape edilecek varsayılan URL
     * 
     * Override: BaseScraper.getTargetUrl()
     */
    getTargetUrl() {
        // Ana sayfa yerine piyasalar sayfasını kullanıyoruz
        // çünkü finans haberleri için daha relevant
        return this.urls.finans;
    }

    /**
     * İçeriğin yüklenmesini bekle
     * 
     * Override: BaseScraper.waitForContent()
     * 
     * Bloomberg dinamik içerik yüklediği için
     * haber container'larının DOM'a eklenmesini bekliyoruz.
     */
    async waitForContent() {
        try {
            // Haber listesinin yüklenmesini bekle
            // Bu selector siteye göre değişir - F12 ile kontrol edilmeli
            await this.waitForSelector('article, .card, .news-item, .widget', {
                timeout: 15000
            });
        } catch (error) {
            console.log(`⏳ [${this.name}] İçerik yükleme bekleme timeout - devam ediliyor`);
        }
    }

    /**
     * Haber öğelerini parse et
     * 
     * Override: BaseScraper.parseNewsItems()
     * 
     * BU FONKSİYON SİTE YAPISINA GÖRE ÖZELLEŞTİRİLMELİDİR!
     * 
     * DOM SEÇİCİ MANTĞI:
     * 1. F12 ile sayfayı incele
     * 2. Haber listesini içeren container'ı bul
     * 3. Her haber item'ının yapısını analiz et
     * 4. Başlık, link, tarih, özet için selector'ları belirle
     * 
     * @param {CheerioAPI} $ - Cheerio instance
     * @returns {object[]} - Haberler dizisi
     */
    async parseNewsItems($) {
        const news = [];
        
        console.log(`📰 [${this.name}] Haberler parse ediliyor...`);
        
        /**
         * SELECTOR AÇIKLAMASI:
         * 
         * Bloomberg HT sitesinde haberler farklı bölümlerde olabilir.
         * Aşağıdaki selector'lar yaygın kullanılan yapıları hedefler.
         * 
         * article: HTML5 article elementi - genellikle haber kartları için kullanılır
         * .news-card: Haber kartı class'ı
         * .item: Liste item'ı
         * [data-type="news"]: Data attribute ile işaretlenmiş haber elementleri
         * 
         * UYARI: Bu selector'lar site güncellendikçe değişebilir!
         */
        const newsSelectors = [
            'article.news-card',
            '.widget-news-list article',
            '.news-list .item',
            '.card-news',
            'article[class*="news"]',
            '.type3 li',
            '.widget-content article'
        ];
        
        // Her selector'ı dene ve ilk çalışanı kullan
        let $newsItems = $();
        
        for (const selector of newsSelectors) {
            $newsItems = $(selector);
            if ($newsItems.length > 0) {
                console.log(`✅ [${this.name}] Selector bulundu: "${selector}" (${$newsItems.length} haber)`);
                break;
            }
        }
        
        // Hiç haber bulunamadıysa alternatif yöntem dene
        if ($newsItems.length === 0) {
            console.log(`⚠️ [${this.name}] Spesifik selector bulunamadı, genel arama yapılıyor...`);
            // a tag'lerinden haber linklerini çıkar
            $newsItems = $('a[href*="/haberler/"], a[href*="/sirketler/"], a[href*="/ekonomi/"]');
        }
        
        /**
         * each() fonksiyonu - jQuery/Cheerio'da döngü
         * 
         * Parametre olarak callback alır:
         * - index: Elemanın sıra numarası (0'dan başlar)
         * - element: DOM elementi
         * 
         * $(element): Element'i Cheerio objesine çevirir
         */
        $newsItems.each((index, element) => {
            try {
                // Element'i Cheerio objesine çevir
                const $item = $(element);
                
                // Haber verisini çıkar
                const newsData = this.parseNewsItem($item, $);
                
                // Geçerli veri varsa listeye ekle
                if (newsData && newsData.title && newsData.url) {
                    news.push(newsData);
                }
                
            } catch (error) {
                console.warn(`⚠️ [${this.name}] Haber #${index} parse hatası:`, error.message);
            }
        });
        
        console.log(`📊 [${this.name}] Toplam ${news.length} haber parse edildi`);
        
        return news;
    }

    /**
     * Tek bir haber öğesini parse et
     * 
     * @param {Cheerio} $item - Haber elementi (Cheerio wrapped)
     * @param {CheerioAPI} $ - Ana Cheerio instance
     * @returns {object|null} - Haber objesi veya null
     */
    parseNewsItem($item, $) {
        /**
         * BAŞLIK ÇIKARMA
         * 
         * Haberler farklı tag'lerde olabilir:
         * - h1, h2, h3: Heading tag'leri
         * - a: Link tag'i (başlık genellikle link içinde)
         * - .title, .headline: Class selector'ları
         * 
         * find(): Element içinde arama yapar
         * text(): Elementin metin içeriğini döndürür
         */
        let title = '';
        const titleSelectors = ['h2', 'h3', 'h4', '.title', '.headline', 'a.title'];
        
        for (const selector of titleSelectors) {
            const $titleEl = $item.find(selector).first();
            if ($titleEl.length) {
                title = cleanText($titleEl.text());
                if (title) break;
            }
        }
        
        // Başlık hala boşsa, doğrudan item'ın text'ini al
        if (!title) {
            title = cleanText($item.text());
            // Çok uzunsa kırp (muhtemelen yanlış element)
            if (title.length > 200) {
                title = title.substring(0, 200);
            }
        }
        
        /**
         * URL ÇIKARMA
         * 
         * attr(): Element'in attribute değerini döndürür
         * 
         * Önce item'ın kendisi a tag mı kontrol et,
         * değilse içindeki ilk a tag'i bul.
         */
        let url = '';
        
        // Item kendisi a tag mı?
        if ($item.is('a')) {
            url = $item.attr('href');
        } else {
            // İçindeki ilk linki bul
            url = $item.find('a').first().attr('href') || '';
        }
        
        // URL'yi tam hale getir
        url = this.makeAbsoluteUrl(url);
        
        // URL geçersizse bu haberi atla
        if (!url || !url.startsWith('http')) {
            return null;
        }
        
        /**
         * TARİH ÇIKARMA
         * 
         * Tarih farklı formatlarda olabilir:
         * - time tag (datetime attribute)
         * - span.date class'ı
         * - meta tag
         */
        let publishedAt = null;
        
        // time tag'ini kontrol et
        const $time = $item.find('time').first();
        if ($time.length) {
            // datetime attribute varsa onu kullan
            const datetime = $time.attr('datetime');
            if (datetime) {
                publishedAt = parseDate(datetime);
            } else {
                publishedAt = parseDate($time.text());
            }
        }
        
        // time bulunamadıysa date class'ını dene
        if (!publishedAt) {
            const dateText = $item.find('.date, .time, .tarih, [class*="date"]').first().text();
            publishedAt = parseDate(dateText);
        }
        
        // Hala tarih yoksa şimdiki zamanı kullan
        if (!publishedAt) {
            publishedAt = new Date();
        }
        
        /**
         * ÖZET ÇIKARMA
         * 
         * Özet genellikle p tag veya .summary, .excerpt class'ında
         */
        let summary = '';
        const summarySelectors = ['p', '.summary', '.excerpt', '.description', '.spot'];
        
        for (const selector of summarySelectors) {
            const $summaryEl = $item.find(selector).first();
            if ($summaryEl.length) {
                summary = cleanText($summaryEl.text());
                if (summary && summary !== title) break;
            }
        }
        
        /**
         * GÖRSEL ÇIKARMA
         * 
         * img tag'inden src veya data-src attribute'u
         * Lazy loading kullanan sitelerde data-src kullanılır
         */
        const $img = $item.find('img').first();
        let imageUrl = '';
        
        if ($img.length) {
            imageUrl = $img.attr('data-src') || $img.attr('src') || '';
            imageUrl = this.makeAbsoluteUrl(imageUrl);
        }
        
        /**
         * ANAHTAR KELİMELER
         * 
         * Başlık ve özetten otomatik çıkarılıyor
         */
        const keywords = extractKeywords(title + ' ' + summary);
        
        // Final haber objesi
        return {
            title,
            summary,
            url,
            imageUrl,
            publishedAt,
            keywords,
            category: this.detectCategory(title, summary),
            source: this.source
        };
    }

    /**
     * Kategori tespit et
     * 
     * Başlık ve özetteki anahtar kelimelere göre
     * haberin kategorisini otomatik belirle.
     * 
     * @param {string} title - Başlık
     * @param {string} summary - Özet
     * @returns {string} - Kategori
     */
    detectCategory(title, summary) {
        const text = (title + ' ' + summary).toLowerCase();
        
        // Kategori anahtar kelimeleri
        const categoryKeywords = {
            finans: ['borsa', 'hisse', 'bist', 'dolar', 'euro', 'altın', 'faiz', 'merkez bankası', 'enflasyon', 'tcmb'],
            teknoloji: ['teknoloji', 'yazılım', 'apple', 'google', 'microsoft', 'startup', 'uygulama', 'yapay zeka', 'ai'],
            ekonomi: ['ekonomi', 'büyüme', 'gdp', 'ihracat', 'ithalat', 'sanayi', 'üretim'],
            politika: ['politika', 'hükümet', 'meclis', 'cumhurbaşkanı', 'seçim', 'parti'],
            spor: ['spor', 'futbol', 'basketbol', 'şampiyon', 'maç', 'lig']
        };
        
        // Her kategoriyi kontrol et
        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            for (const keyword of keywords) {
                if (text.includes(keyword)) {
                    return category;
                }
            }
        }
        
        // Varsayılan kategori
        return this.defaultCategory;
    }

    /**
     * Belirli bir kategori sayfasını scrape et
     * 
     * @param {string} category - Kategori adı
     * @returns {object[]} - Haberler
     */
    async scrapeCategory(category) {
        const categoryUrl = this.urls[category];
        
        if (!categoryUrl) {
            console.warn(`⚠️ [${this.name}] Bilinmeyen kategori: ${category}`);
            return [];
        }
        
        return await this.scrape(categoryUrl);
    }
}

module.exports = BloombergScraper;
