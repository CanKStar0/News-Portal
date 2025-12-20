/**
 * ===========================================
 * TEMEL SCRAPER SINIFI (Base Scraper)
 * ===========================================
 * 
 * Bu sınıf, tüm site-spesifik scraperların temelini oluşturur.
 * OOP (Object Oriented Programming) prensiplerine uygun olarak
 * kalıtım (inheritance) kullanarak kod tekrarını önlüyoruz.
 * 
 * TASARIM DESENİ: Template Method Pattern
 * - Temel sınıf, algoritmanın iskeletini tanımlar (scrape metodu)
 * - Alt sınıflar, spesifik adımları override eder (parseNewsItems)
 * 
 * NEDEN SINIF KULLANIYORUZ?
 * 1. Kod tekrarını önler (DRY - Don't Repeat Yourself)
 * 2. Yeni scraper eklemek kolaydır
 * 3. Ortak davranışlar tek yerden yönetilir
 * 4. Test edilmesi kolaydır
 * 
 * PLAYWRIGHT NEDİR?
 * Microsoft tarafından geliştirilen browser automation aracıdır.
 * - Chromium, Firefox ve WebKit destekler
 * - Headless (görünmez) modda çalışabilir
 * - JavaScript ile render edilen sayfaları destekler
 * - Puppeteer'a modern alternatif
 */

const { chromium } = require('playwright');
const cheerio = require('cheerio');
const config = require('../../config');
const { 
    randomDelay, 
    cleanText, 
    normalizeUrl, 
    parseDate,
    validateNewsData,
    retry 
} = require('../../utils');

class BaseScraper {
    /**
     * Constructor - Sınıf örneği oluşturulduğunda çalışır
     * 
     * @param {object} options - Scraper ayarları
     * @param {string} options.name - Scraper adı (loglama için)
     * @param {string} options.baseUrl - Sitenin ana adresi
     * @param {string} options.source - Kaynak kodu (veritabanı için)
     * @param {string} options.category - Varsayılan kategori
     */
    constructor(options = {}) {
        // this: Sınıfın mevcut örneğine (instance) referans
        
        // Scraper adı - log mesajlarında kullanılır
        this.name = options.name || 'BaseScraper';
        
        // Site ana adresi
        this.baseUrl = options.baseUrl || '';
        
        // Kaynak kodu (bloomberg, dunya, foreks)
        this.source = options.source || 'unknown';
        
        // Varsayılan kategori
        this.defaultCategory = options.category || 'genel';
        
        // Playwright browser instance'ı (null başlar, scrape sırasında açılır)
        this.browser = null;
        
        // Playwright sayfa instance'ı
        this.page = null;
        
        // Scraping ayarları (config'den)
        this.config = config.scraper;
    }

    /**
     * ===========================================
     * TARAYICI YÖNETİMİ
     * ===========================================
     */

    /**
     * Playwright tarayıcısını başlat
     * 
     * PLAYWRIGHT AYARLARI AÇIKLAMASI:
     * 
     * headless: true
     *   - Tarayıcı penceresi açılmadan arka planda çalışır
     *   - Sunucularda genellikle true olmalı (ekran yok)
     *   - Debug için false yapılabilir
     * 
     * args: Chromium başlatma argümanları
     *   --disable-blink-features=AutomationControlled
     *     - "Chrome is being controlled by automated software" mesajını gizler
     *   --no-sandbox
     *     - Linux sunucularda gerekli olabilir
     *   --disable-dev-shm-usage
     *     - Düşük RAM'li sistemlerde yardımcı olur
     */
    async initBrowser() {
        console.log(`🌐 [${this.name}] Tarayıcı başlatılıyor...`);
        
        try {
            // chromium.launch() yeni bir Chromium browser instance'ı başlatır
            this.browser = await chromium.launch({
                headless: this.config.browser.headless,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });
            
            // Yeni bir context oluştur
            // Context, izole bir tarayıcı profili gibidir (cookies, cache vs.)
            const context = await this.browser.newContext({
                // User-Agent ayarı - tarayıcı kimliğini tanımlar
                // Gerçek bir tarayıcı gibi görünmek için önemli
                userAgent: this.config.userAgent,
                
                // Viewport - sanal ekran boyutu
                viewport: { width: 1920, height: 1080 },
                
                // Locale - dil ayarı
                locale: 'tr-TR',
                
                // Timezone - saat dilimi
                timezoneId: 'Europe/Istanbul',
                
                // JavaScript etkin mi?
                javaScriptEnabled: true,
                
                // Ekstra HTTP başlıkları
                extraHTTPHeaders: {
                    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            
            // Context içinde yeni sayfa aç
            this.page = await context.newPage();
            
            // Sayfa timeout ayarı
            this.page.setDefaultTimeout(this.config.browser.timeout);
            
            // Gereksiz kaynakları engelle (performans için)
            // Route interception - istekleri yakalayıp modifiye edebiliriz
            await this.page.route('**/*', (route) => {
                const resourceType = route.request().resourceType();
                
                // Resim, font, stylesheet gibi kaynakları engelle
                // Bu, sayfa yüklemeyi hızlandırır
                if (['image', 'font', 'stylesheet', 'media'].includes(resourceType)) {
                    // Bazı sitelerde stylesheet engellenirse layout bozulabilir
                    // Gerekirse 'stylesheet'i listeden çıkarın
                    route.abort();
                } else {
                    route.continue();
                }
            });
            
            console.log(`✅ [${this.name}] Tarayıcı hazır`);
            
        } catch (error) {
            console.error(`❌ [${this.name}] Tarayıcı başlatma hatası:`, error.message);
            throw error;
        }
    }

    /**
     * Tarayıcıyı kapat
     * 
     * ÖNEMLİ: Her scraping işleminden sonra tarayıcıyı kapatmak
     * bellek sızıntısını (memory leak) önler.
     */
    async closeBrowser() {
        if (this.browser) {
            console.log(`🔒 [${this.name}] Tarayıcı kapatılıyor...`);
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    /**
     * ===========================================
     * SAYFA NAVİGASYONU
     * ===========================================
     */

    /**
     * Belirtilen URL'ye git
     * 
     * PLAYWRIGHT NAVIGASYON SEÇENEKLERİ:
     * 
     * waitUntil: Sayfa ne zaman "yüklenmiş" sayılsın?
     *   - 'load': window.onload eventi tetiklenince
     *   - 'domcontentloaded': DOM hazır olunca (resimler beklenmez)
     *   - 'networkidle': Ağ aktivitesi durgunlaşınca (en güvenli)
     * 
     * timeout: Maksimum bekleme süresi (ms)
     * 
     * @param {string} url - Gidilecek URL
     * @param {object} options - Navigasyon seçenekleri
     */
    async navigateTo(url, options = {}) {
        const fullUrl = normalizeUrl(url, this.baseUrl);
        console.log(`📍 [${this.name}] Sayfa açılıyor: ${fullUrl}`);
        
        try {
            // page.goto() belirtilen URL'ye navigasyon yapar
            const response = await this.page.goto(fullUrl, {
                waitUntil: options.waitUntil || 'domcontentloaded',
                timeout: options.timeout || this.config.browser.timeout
            });
            
            // HTTP durum kodunu kontrol et
            // 200-299 arası başarılı
            // 300-399 yönlendirme
            // 400-499 client hatası
            // 500-599 server hatası
            if (response && !response.ok()) {
                console.warn(`⚠️ [${this.name}] HTTP ${response.status()}: ${fullUrl}`);
            }
            
            // Kısa bir bekleme - sayfanın tamamen render olması için
            await randomDelay(500, 1500);
            
            return response;
            
        } catch (error) {
            console.error(`❌ [${this.name}] Navigasyon hatası: ${error.message}`);
            throw error;
        }
    }

    /**
     * Sayfanın HTML içeriğini al
     * 
     * page.content() mevcut sayfanın tam HTML'ini döndürür.
     * Bu HTML'i Cheerio ile parse edeceğiz.
     * 
     * @returns {string} - Sayfa HTML içeriği
     */
    async getPageContent() {
        return await this.page.content();
    }

    /**
     * CSS selector'a göre element bekle
     * 
     * Dinamik sayfalarda içerik JavaScript ile yüklenebilir.
     * Bu durumda elementin DOM'a eklenmesini beklememiz gerekir.
     * 
     * @param {string} selector - CSS selector
     * @param {object} options - Bekleme seçenekleri
     */
    async waitForSelector(selector, options = {}) {
        try {
            await this.page.waitForSelector(selector, {
                timeout: options.timeout || 10000,
                state: options.state || 'visible' // 'attached', 'detached', 'visible', 'hidden'
            });
        } catch (error) {
            console.warn(`⚠️ [${this.name}] Selector bulunamadı: ${selector}`);
            // Hata fırlatmıyoruz, sadece uyarı veriyoruz
            // Bazı sayfalarda element olmayabilir
        }
    }

    /**
     * Sayfada scroll yap (lazy-loaded içerik için)
     * 
     * Bazı siteler "infinite scroll" kullanır - aşağı kaydırdıkça
     * yeni içerik yüklenir. Bu fonksiyon sayfayı kaydırarak
     * tüm içeriğin yüklenmesini sağlar.
     * 
     * @param {number} scrollCount - Kaç kez scroll yapılsın
     */
    async scrollPage(scrollCount = 3) {
        for (let i = 0; i < scrollCount; i++) {
            // page.evaluate() sayfa kontekstinde JavaScript çalıştırır
            // window.scrollBy: Sayfayı belirtilen piksel kadar kaydırır
            await this.page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
            });
            
            // Yeni içeriğin yüklenmesi için bekle
            await randomDelay(500, 1000);
        }
    }

    /**
     * ===========================================
     * HTML PARSE İŞLEMLERİ
     * ===========================================
     */

    /**
     * HTML'i Cheerio ile parse et
     * 
     * CHEERIO NEDİR?
     * jQuery'nin sunucu tarafı implementasyonu.
     * HTML'i parse edip jQuery benzeri seçicilerle sorgulamamızı sağlar.
     * 
     * Playwright ile browser çalıştırmak yerine sadece HTML parse etmek
     * için Cheerio kullanmak çok daha hızlıdır.
     * 
     * @param {string} html - Parse edilecek HTML
     * @returns {CheerioAPI} - Cheerio instance'ı
     * 
     * KULLANIM:
     * const $ = this.parseHtml(html);
     * const title = $('h1.title').text();
     */
    parseHtml(html) {
        // cheerio.load() HTML string'i Cheerio objesine çevirir
        return cheerio.load(html);
    }

    /**
     * ===========================================
     * ANA SCRAPING METODU
     * ===========================================
     */

    /**
     * Haberleri scrape et
     * 
     * Bu, ana scraping metodudur. Template Method Pattern kullanır:
     * 1. Tarayıcıyı başlat
     * 2. Siteye git
     * 3. HTML'i al
     * 4. Haberleri parse et (alt sınıf override eder)
     * 5. Verileri doğrula
     * 6. Tarayıcıyı kapat
     * 
     * @param {string} targetUrl - Scrape edilecek URL (opsiyonel)
     * @returns {object[]} - Haber dizisi
     */
    async scrape(targetUrl = null) {
        const url = targetUrl || this.getTargetUrl();
        const results = [];
        
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🔍 [${this.name}] Scraping başlıyor...`);
        console.log(`🌐 URL: ${url}`);
        console.log(`${'='.repeat(50)}\n`);
        
        try {
            // 1. Tarayıcıyı başlat
            await this.initBrowser();
            
            // 2. Siteye git
            await this.navigateTo(url);
            
            // 3. Sayfanın yüklenmesini bekle (alt sınıf override edebilir)
            await this.waitForContent();
            
            // 4. Lazy-load içerik için scroll
            await this.scrollPage(2);
            
            // 5. HTML'i al
            const html = await this.getPageContent();
            
            // 6. Cheerio ile parse et
            const $ = this.parseHtml(html);
            
            // 7. Haberleri parse et (ALT SINIF TARAFINDAN OVERRIDE EDİLMELİ)
            const newsItems = await this.parseNewsItems($);
            
            // 8. Her haberi doğrula ve sonuçlara ekle
            for (const item of newsItems) {
                // Kaynak ve kategori ekle
                item.source = this.source;
                item.category = item.category || this.defaultCategory;
                item.scrapedAt = new Date();
                
                // Doğrulama
                const validation = validateNewsData(item);
                
                if (validation.isValid) {
                    results.push(item);
                } else {
                    console.warn(`⚠️ [${this.name}] Geçersiz haber atlandı:`, validation.errors);
                }
            }
            
            console.log(`\n✅ [${this.name}] ${results.length} haber başarıyla çekildi`);
            
        } catch (error) {
            console.error(`\n❌ [${this.name}] Scraping hatası:`, error.message);
            // Hata durumunda bile boş dizi döndür
            
        } finally {
            // finally bloğu her durumda çalışır (hata olsa da olmasa da)
            // Tarayıcıyı kapatmayı garantile
            await this.closeBrowser();
        }
        
        return results;
    }

    /**
     * ===========================================
     * ALT SINIFLAR TARAFINDAN OVERRIDE EDİLECEK METODLAR
     * ===========================================
     * 
     * Bu metodlar varsayılan implementasyonlar içerir.
     * Her site için farklı olduğundan alt sınıflar bunları
     * kendi ihtiyaçlarına göre override etmeli.
     */

    /**
     * Scrape edilecek URL'yi döndür
     * Alt sınıf tarafından override edilmeli
     */
    getTargetUrl() {
        return this.baseUrl;
    }

    /**
     * İçeriğin yüklenmesini bekle
     * Alt sınıf spesifik selector'ı bekleyebilir
     */
    async waitForContent() {
        // Varsayılan: 1-2 saniye bekle
        await randomDelay(1000, 2000);
    }

    /**
     * Haber öğelerini parse et
     * 
     * BU METOD MUTLAKA ALT SINIF TARAFINDAN OVERRIDE EDİLMELİ!
     * Her sitenin HTML yapısı farklı olduğundan bu metod
     * siteye özel CSS seçicileri kullanarak haberleri çıkarır.
     * 
     * @param {CheerioAPI} $ - Cheerio instance'ı
     * @returns {object[]} - Haber dizisi
     */
    async parseNewsItems($) {
        // Varsayılan implementasyon - override edilmeli
        console.warn(`⚠️ [${this.name}] parseNewsItems() override edilmedi!`);
        return [];
    }

    /**
     * Tek bir haber öğesini parse et
     * 
     * @param {Cheerio} element - Haber DOM elementi
     * @param {CheerioAPI} $ - Cheerio instance'ı
     * @returns {object} - Haber objesi
     */
    parseNewsItem(element, $) {
        // Varsayılan implementasyon - override edilmeli
        console.warn(`⚠️ [${this.name}] parseNewsItem() override edilmedi!`);
        return null;
    }

    /**
     * ===========================================
     * YARDIMCI METODLAR
     * ===========================================
     */

    /**
     * Element'ten metin çıkar
     * Güvenli şekilde text extraction yapar
     * 
     * @param {CheerioAPI} $ - Cheerio instance'ı
     * @param {string} selector - CSS selector
     * @param {Cheerio} context - Arama yapılacak context (opsiyonel)
     * @returns {string} - Temizlenmiş metin
     */
    extractText($, selector, context = null) {
        const element = context ? context.find(selector) : $(selector);
        return cleanText(element.text());
    }

    /**
     * Element'ten attribute değeri çıkar
     * 
     * @param {CheerioAPI} $ - Cheerio instance'ı
     * @param {string} selector - CSS selector
     * @param {string} attr - Attribute adı (href, src, data-* vs.)
     * @param {Cheerio} context - Arama yapılacak context (opsiyonel)
     * @returns {string} - Attribute değeri
     */
    extractAttribute($, selector, attr, context = null) {
        const element = context ? context.find(selector) : $(selector);
        return element.attr(attr) || '';
    }

    /**
     * URL'yi tam hale getir
     * 
     * @param {string} url - Göreceli veya tam URL
     * @returns {string} - Tam URL
     */
    makeAbsoluteUrl(url) {
        return normalizeUrl(url, this.baseUrl);
    }
}

module.exports = BaseScraper;
