/**
 * ===========================================
 * HABER ARAMA SCRAPER (Bing News)
 * ===========================================
 * 
 * Bing News'den keyword ile haber arar.
 * Google News'den daha stabil çalışır.
 */

const BaseScraper = require('../base/BaseScraper');

class GoogleNewsScraper extends BaseScraper {
    constructor() {
        super({
            name: 'HaberArama',
            baseUrl: 'https://www.bing.com/news',
            selectors: {
                newsContainer: '.news-card',
                title: 'a.title',
                link: 'a.title',
                time: '.source span',
                source: '.source a'
            }
        });
    }

    /**
     * Keyword ile Bing News araması yap
     */
    async searchByKeyword(keyword) {
        // Türkçe haber araması için URL
        const searchUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(keyword)}&setlang=tr&cc=TR&FORM=HDRSC6`;
        
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🔍 [HaberArama] "${keyword}" araması yapılıyor...`);
        console.log(`🌐 URL: ${searchUrl}`);
        console.log(`${'='.repeat(50)}\n`);

        const news = [];

        try {
            await this.initBrowser();
            
            // User agent ayarla
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'tr-TR,tr;q=0.9'
            });

            await this.page.goto(searchUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });

            // Sayfanın yüklenmesini bekle
            await this.delay(3000);

            // Screenshot al (debug için)
            // await this.page.screenshot({ path: 'debug-search.png' });

            // Bing News kartlarını çek
            const cards = await this.page.$$('.news-card, .newsitem, [data-id]');
            console.log(`📰 ${cards.length} haber kartı bulundu`);

            if (cards.length === 0) {
                // Alternatif selector dene
                const altCards = await this.page.$$('article, .card, .b_algo');
                console.log(`📰 Alternatif: ${altCards.length} element bulundu`);
                
                // Sayfa içeriğini kontrol et
                const pageContent = await this.page.content();
                const hasResults = pageContent.includes('news-card') || pageContent.includes('newsitem');
                console.log(`📄 Sayfa içeriğinde haber var mı: ${hasResults}`);
            }

            for (const card of cards.slice(0, 20)) {
                try {
                    // Başlık
                    const titleEl = await card.$('a.title, .title, a[href*="http"]');
                    if (!titleEl) continue;

                    const title = await titleEl.textContent();
                    let url = await titleEl.getAttribute('href');
                    
                    if (!title || title.trim().length < 10) continue;

                    // Kaynak
                    const sourceEl = await card.$('.source a, .source, cite');
                    const source = sourceEl ? await sourceEl.textContent() : 'Bing News';

                    // Özet
                    const summaryEl = await card.$('.snippet, .news-card-description, p');
                    const summary = summaryEl ? await summaryEl.textContent() : '';

                    // Zaman
                    const timeEl = await card.$('.source span:last-child, time, .news-card-time');
                    let publishedAt = new Date();
                    if (timeEl) {
                        const timeText = await timeEl.textContent();
                        publishedAt = this.parseRelativeTime(timeText);
                    }

                    news.push({
                        title: title.trim(),
                        summary: summary ? summary.trim().substring(0, 300) : `"${keyword}" ile ilgili haber`,
                        url: url || searchUrl,
                        source: source ? source.trim() : 'Haber',
                        category: this.detectCategory(title),
                        publishedAt,
                        keywords: keyword.toLowerCase().split(' ')
                    });

                } catch (err) {
                    // Tek haber hatası, devam et
                }
            }

            // Eğer Bing çalışmazsa, doğrudan haber sitelerinden ara
            if (news.length === 0) {
                console.log('⚠️ Bing sonuç vermedi, doğrudan sitelerden aranıyor...');
                const directNews = await this.searchDirectSites(keyword);
                news.push(...directNews);
            }

            console.log(`✅ [HaberArama] ${news.length} haber bulundu`);

        } catch (error) {
            console.error(`❌ [HaberArama] Hata:`, error.message);
        } finally {
            await this.closeBrowser();
        }

        return news;
    }

    /**
     * Doğrudan haber sitelerinden ara
     */
    async searchDirectSites(keyword) {
        const news = [];
        
        const searchUrls = [
            `https://www.bloomberght.com/ara?q=${encodeURIComponent(keyword)}`,
            `https://www.dunya.com/arama?query=${encodeURIComponent(keyword)}`
        ];

        for (const url of searchUrls) {
            try {
                console.log(`🔍 Doğrudan arama: ${url}`);
                
                await this.page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 20000 
                });
                await this.delay(2000);

                // Genel link arama
                const links = await this.page.$$('a[href*="/haber"], a[href*="/ekonomi"], a[href*="/finans"]');
                
                for (const link of links.slice(0, 10)) {
                    try {
                        const href = await link.getAttribute('href');
                        const text = await link.textContent();
                        
                        if (text && text.trim().length > 20 && text.toLowerCase().includes(keyword.toLowerCase())) {
                            const source = url.includes('bloomberg') ? 'Bloomberg HT' : 'Dünya';
                            
                            news.push({
                                title: text.trim().substring(0, 200),
                                summary: `"${keyword}" araması sonucu`,
                                url: href.startsWith('http') ? href : new URL(href, url).toString(),
                                source,
                                category: this.detectCategory(text),
                                publishedAt: new Date(),
                                keywords: keyword.toLowerCase().split(' ')
                            });
                        }
                    } catch (e) {}
                }
            } catch (e) {
                console.log(`⚠️ ${url} erişilemedi`);
            }
        }

        return news;
    }

    /**
     * Göreceli zaman parse et
     */
    parseRelativeTime(timeText) {
        if (!timeText) return new Date();
        
        const text = timeText.toLowerCase();
        const now = new Date();
        
        if (text.includes('dakika') || text.includes('min')) {
            const mins = parseInt(text) || 5;
            return new Date(now - mins * 60 * 1000);
        }
        if (text.includes('saat') || text.includes('hour')) {
            const hours = parseInt(text) || 1;
            return new Date(now - hours * 60 * 60 * 1000);
        }
        if (text.includes('gün') || text.includes('day')) {
            const days = parseInt(text) || 1;
            return new Date(now - days * 24 * 60 * 60 * 1000);
        }
        
        return now;
    }

    /**
     * Normal scrape - kullanılmıyor
     */
    async scrape() {
        return [];
    }

    /**
     * Başlıktan kategori tahmin et
     */
    detectCategory(title) {
        const text = title.toLowerCase();
        
        if (text.includes('dolar') || text.includes('euro') || text.includes('kur') || text.includes('merkez bankası') || text.includes('tcmb')) {
            return 'Finans';
        }
        if (text.includes('borsa') || text.includes('hisse') || text.includes('bist') || text.includes('endeks')) {
            return 'Borsa';
        }
        if (text.includes('altın') || text.includes('petrol') || text.includes('emtia') || text.includes('gümüş')) {
            return 'Emtia';
        }
        if (text.includes('enflasyon') || text.includes('faiz') || text.includes('büyüme') || text.includes('gsyh') || text.includes('işsizlik')) {
            return 'Ekonomi';
        }
        if (text.includes('abd') || text.includes('avrupa') || text.includes('çin') || text.includes('rusya') || text.includes('fed')) {
            return 'Dünya';
        }
        
        return 'Genel';
    }
}

module.exports = GoogleNewsScraper;
