/**
 * RSS Haber Scraper - Turk Kaynaklari + Google News
 * 100+ Turk RSS kaynagindan haber cekme
 * Google News entegrasyonu ile anahtar kelime aramasi
 */

const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

class RSSNewsScraper {
    constructor() {
        this.parser = new Parser({
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            },
            customFields: {
                item: [
                    ['media:content', 'media'],
                    ['media:thumbnail', 'thumbnail'],
                    ['enclosure', 'enclosure'],
                    ['dc:creator', 'creator'],
                    ['content:encoded', 'contentEncoded']
                ]
            }
        });

        // Turk RSS kaynaklari (Bilim kategorisi kaldirildi)
        this.rssFeeds = {
            // EKONOMI
            ntv_ekonomi: { url: 'https://www.ntv.com.tr/ekonomi.rss', category: 'Ekonomi', source: 'NTV' },
            cnn_ekonomi: { url: 'https://www.cnnturk.com/feed/rss/ekonomi/news', category: 'Ekonomi', source: 'CNN Turk' },
            hurriyet_ekonomi: { url: 'https://www.hurriyet.com.tr/rss/ekonomi', category: 'Ekonomi', source: 'Hurriyet' },
            sozcu_ekonomi: { url: 'https://www.sozcu.com.tr/feeds-rss-category-ekonomi', category: 'Ekonomi', source: 'Sozcu' },
            haberturk_ekonomi: { url: 'https://www.haberturk.com/rss/ekonomi.xml', category: 'Ekonomi', source: 'Haberturk' },
            sabah_ekonomi: { url: 'https://www.sabah.com.tr/rss/ekonomi.xml', category: 'Ekonomi', source: 'Sabah' },
            yenisafak_ekonomi: { url: 'https://www.yenisafak.com/rss?xml=ekonomi', category: 'Ekonomi', source: 'Yeni Safak' },
            star_ekonomi: { url: 'https://www.star.com.tr/rss/ekonomi.xml', category: 'Ekonomi', source: 'Star' },
            dunya_ekonomi: { url: 'https://www.dunya.com/rss', category: 'Ekonomi', source: 'Dunya Gazetesi' },
            bloomberght: { url: 'https://www.bloomberght.com/rss', category: 'Ekonomi', source: 'BloombergHT' },
            paraanaliz: { url: 'https://www.paraanaliz.com/feed/', category: 'Ekonomi', source: 'Para Analiz' },
            bigpara: { url: 'https://bigpara.hurriyet.com.tr/rss/', category: 'Ekonomi', source: 'Bigpara' },
            investing_tr: { url: 'https://tr.investing.com/rss/news.rss', category: 'Ekonomi', source: 'Investing.com TR' },

            // GUNDEM
            ntv_gundem: { url: 'https://www.ntv.com.tr/turkiye.rss', category: 'Gundem', source: 'NTV' },
            cnn_gundem: { url: 'https://www.cnnturk.com/feed/rss/turkiye/news', category: 'Gundem', source: 'CNN Turk' },
            hurriyet_gundem: { url: 'https://www.hurriyet.com.tr/rss/gundem', category: 'Gundem', source: 'Hurriyet' },
            sozcu_gundem: { url: 'https://www.sozcu.com.tr/feeds-rss-category-gundem', category: 'Gundem', source: 'Sozcu' },
            haberturk_gundem: { url: 'https://www.haberturk.com/rss/gundem.xml', category: 'Gundem', source: 'Haberturk' },
            cumhuriyet: { url: 'https://www.cumhuriyet.com.tr/rss/son_dakika.xml', category: 'Gundem', source: 'Cumhuriyet' },
            sabah_gundem: { url: 'https://www.sabah.com.tr/rss/gundem.xml', category: 'Gundem', source: 'Sabah' },
            yenisafak_gundem: { url: 'https://www.yenisafak.com/rss?xml=gundem', category: 'Gundem', source: 'Yeni Safak' },
            star_gundem: { url: 'https://www.star.com.tr/rss/guncel.xml', category: 'Gundem', source: 'Star' },
            t24: { url: 'https://t24.com.tr/rss', category: 'Gundem', source: 'T24' },
            bianet: { url: 'https://bianet.org/rss/bianet', category: 'Gundem', source: 'Bianet' },

            // DUNYA
            ntv_dunya: { url: 'https://www.ntv.com.tr/dunya.rss', category: 'Dunya', source: 'NTV' },
            cnn_dunya: { url: 'https://www.cnnturk.com/feed/rss/dunya/news', category: 'Dunya', source: 'CNN Turk' },
            hurriyet_dunya: { url: 'https://www.hurriyet.com.tr/rss/dunya', category: 'Dunya', source: 'Hurriyet' },
            bbc_turkce: { url: 'https://feeds.bbci.co.uk/turkce/rss.xml', category: 'Dunya', source: 'BBC Turkce' },
            dw_turkce: { url: 'https://rss.dw.com/xml/rss-tur-all', category: 'Dunya', source: 'DW Turkce' },
            sabah_dunya: { url: 'https://www.sabah.com.tr/rss/dunya.xml', category: 'Dunya', source: 'Sabah' },

            // SPOR
            cnn_spor: { url: 'https://www.cnnturk.com/feed/rss/spor/news', category: 'Spor', source: 'CNN Turk' },
            hurriyet_spor: { url: 'https://www.hurriyet.com.tr/rss/spor', category: 'Spor', source: 'Hurriyet' },
            sabah_spor: { url: 'https://www.sabah.com.tr/rss/spor.xml', category: 'Spor', source: 'Sabah' },

            // TEKNOLOJI
            webtekno: { url: 'https://www.webtekno.com/rss.xml', category: 'Teknoloji', source: 'Webtekno' },
            shiftdelete: { url: 'https://shiftdelete.net/feed', category: 'Teknoloji', source: 'ShiftDelete' },
            chip: { url: 'https://www.chip.com.tr/rss', category: 'Teknoloji', source: 'Chip Online' },
            ntv_teknoloji: { url: 'https://www.ntv.com.tr/teknoloji.rss', category: 'Teknoloji', source: 'NTV' },
            technopat: { url: 'https://www.technopat.net/feed/', category: 'Teknoloji', source: 'Technopat' },

            // SAGLIK
            ntv_saglik: { url: 'https://www.ntv.com.tr/saglik.rss', category: 'Saglik', source: 'NTV' },
            sabah_saglik: { url: 'https://www.sabah.com.tr/rss/saglik.xml', category: 'Saglik', source: 'Sabah' },

            // MAGAZIN
            hurriyet_magazin: { url: 'https://www.hurriyet.com.tr/rss/magazin', category: 'Magazin', source: 'Hurriyet' },
            sozcu_magazin: { url: 'https://www.sozcu.com.tr/feeds-rss-category-magazin', category: 'Magazin', source: 'Sozcu' },
            ntv_yasam: { url: 'https://www.ntv.com.tr/yasam.rss', category: 'Magazin', source: 'NTV' },
            sabah_magazin: { url: 'https://www.sabah.com.tr/rss/magazin.xml', category: 'Magazin', source: 'Sabah' },

            // SON DAKIKA
            cnn_sondakika: { url: 'https://www.cnnturk.com/feed/rss/all/news', category: 'Son Dakika', source: 'CNN Turk' },
            ntv_sondakika: { url: 'https://www.ntv.com.tr/son-dakika.rss', category: 'Son Dakika', source: 'NTV' },
            sabah_sondakika: { url: 'https://www.sabah.com.tr/rss/sondakika.xml', category: 'Son Dakika', source: 'Sabah' }
        };

        this.synonyms = {
            'dolar': ['usd', 'amerikan dolari', 'dolarin', 'dolarda'],
            'euro': ['eur', 'avro', 'euronun'],
            'enflasyon': ['tufe', 'tuik'],
            'faiz': ['politika faizi', 'tcmb faizi'],
            'borsa': ['bist', 'bist100', 'borsa istanbul'],
            'altin': ['ons', 'gram altin', 'ceyrek altin'],
            'merkez bankasi': ['tcmb', 'mb'],
            'kripto': ['bitcoin', 'btc', 'ethereum', 'eth'],
            'petrol': ['brent', 'varil'],
            'fenerbahce': ['fener', 'fb', 'sari lacivert'],
            'galatasaray': ['gs', 'cimbom', 'sari kirmizi'],
            'besiktas': ['bjk', 'kartal'],
            'trabzonspor': ['ts', 'bordo mavi'],
            'yapay zeka': ['ai', 'chatgpt', 'gpt']
        };

        this.spamKeywords = ['casino', 'bahis', 'kumar', 'sex', 'porno', 'xxx'];
    }

    normalizeText(text) {
        if (!text) return '';
        return text.toLowerCase().trim();
    }

    getSynonyms(keyword) {
        const normalizedKeyword = this.normalizeText(keyword);
        const synonymList = [normalizedKeyword];
        
        for (const [key, values] of Object.entries(this.synonyms)) {
            if (key === normalizedKeyword || values.some(v => v === normalizedKeyword)) {
                synonymList.push(key);
                values.forEach(v => synonymList.push(v));
            }
        }
        
        return [...new Set(synonymList)];
    }

    matchesKeyword(text, keyword) {
        if (!text || !keyword) return false;
        
        const normalizedText = this.normalizeText(text);
        const synonyms = this.getSynonyms(keyword);
        
        const suffixes = ['', 'in', 'un', 'a', 'e', 'i', 'da', 'de', 'dan', 'den', 'la', 'le', 'lar', 'ler'];
        
        for (const syn of synonyms) {
            for (const suffix of suffixes) {
                const pattern = syn + suffix;
                const regex = new RegExp('\\b' + this.escapeRegex(pattern) + '\\b', 'i');
                if (regex.test(normalizedText)) return true;
            }
        }
        
        return false;
    }

    countKeywordOccurrences(text, keyword) {
        if (!text || !keyword) return 0;
        
        const normalizedText = this.normalizeText(text);
        const synonyms = this.getSynonyms(keyword);
        let count = 0;
        
        for (const syn of synonyms) {
            const regex = new RegExp('\\b' + this.escapeRegex(syn) + '\\w*\\b', 'gi');
            const matches = normalizedText.match(regex);
            if (matches) count += matches.length;
        }
        
        return count;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    isValidNews(item) {
        const title = this.normalizeText(item.title || '');
        const content = this.normalizeText(item.contentSnippet || item.content || '');
        const combined = title + ' ' + content;
        
        for (const spam of this.spamKeywords) {
            if (combined.includes(spam)) return false;
        }
        
        if (title.length < 15) return false;
        
        return true;
    }

    fixUrl(url, feedUrl) {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        
        try {
            const baseUrl = new URL(feedUrl);
            return new URL(url, baseUrl.origin).href;
        } catch (e) {
            return url;
        }
    }

    extractImageUrl(item) {
        // Prefer feed-provided images
        try {
            if (item.media && item.media.$ && item.media.$.url) return item.media.$.url;
            if (item.thumbnail && item.thumbnail.$ && item.thumbnail.$.url) return item.thumbnail.$.url;
            if (item.enclosure && item.enclosure.url) return item.enclosure.url;

            const content = item.contentEncoded || item.content || '';
            const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatch && imgMatch[1]) return imgMatch[1];
        } catch (e) {
            // ignore
        }

        return null;
    }

    /**
     * Try to fetch the article page and extract og:image / twitter:image as fallback.
     * This is used when feed doesn't provide a unique image.
     */
    async fetchArticleImage(url) {
        if (!url) return null;
        try {
            const res = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const html = res.data;
            const $ = cheerio.load(html);

            // Open Graph
            const og = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content');
            if (og) return og;

            // Twitter
            const tw = $('meta[name="twitter:image"]').attr('content') || $('meta[property="twitter:image"]').attr('content');
            if (tw) return tw;

            // Link rel image_src
            const linkImg = $('link[rel="image_src"]').attr('href');
            if (linkImg) return linkImg;

            // Fallback: first img in article content
            const firstImg = $('article img').first().attr('src') || $('img').first().attr('src');
            if (firstImg) return firstImg;

        } catch (err) {
            // console.warn('fetchArticleImage failed:', err.message);
        }
        return null;
    }

    async searchGoogleNews(keyword) {
        const results = [];
        const synonyms = this.getSynonyms(keyword);
        const searchTerms = synonyms.slice(0, 3);
        
        console.log('Google News araniyor:', searchTerms.join(', '));
        
        for (const term of searchTerms) {
            try {
                const googleNewsUrl = 'https://news.google.com/rss/search?q=' + encodeURIComponent(term) + '&hl=tr&gl=TR&ceid=TR:tr';
                const feed = await this.parser.parseURL(googleNewsUrl);
                
                for (const item of (feed.items || []).slice(0, 15)) {
                    const title = item.title || '';
                    const description = item.contentSnippet || item.content || '';
                    
                    if (!this.isValidNews({ title, contentSnippet: description })) continue;
                    
                    let source = 'Google News';
                    const titleParts = title.split(' - ');
                    if (titleParts.length > 1) source = titleParts[titleParts.length - 1].trim();
                    
                    results.push({
                        title: titleParts.slice(0, -1).join(' - ').trim() || title,
                        description: description.substring(0, 500).trim(),
                        url: item.link,
                        imageUrl: this.extractImageUrl(item),
                        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
                        source: source,
                        category: 'Google News',
                        feedKey: 'google_news'
                    });
                }
                
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) {
                console.error('Google News hatasi:', error.message);
            }
        }
        
        const seen = new Set();
        return results.filter(item => {
            if (!item.url || seen.has(item.url)) return false;
            seen.add(item.url);
            return true;
        });
    }

    async scrapeFromFeed(feedKey, feedInfo, keyword = null) {
        const results = [];
        
        try {
            const feed = await this.parser.parseURL(feedInfo.url);
            
            for (const item of feed.items || []) {
                if (!this.isValidNews(item)) continue;
                
                const title = item.title || '';
                const description = item.contentSnippet || item.content || item.summary || '';
                
                if (keyword) {
                    const titleMatch = this.matchesKeyword(title, keyword);
                    const descCount = this.countKeywordOccurrences(description, keyword);
                    if (!titleMatch && descCount < 2) continue;
                }
                
                // Ensure unique image: if feed has none, try fetching article page
                let imageUrl = this.extractImageUrl(item);
                const itemUrl = this.fixUrl(item.link, feedInfo.url);
                if (!imageUrl && itemUrl) {
                    try {
                        imageUrl = await this.fetchArticleImage(itemUrl);
                    } catch (e) {
                        // ignore
                    }
                }

                results.push({
                    title: title.trim(),
                    description: description.substring(0, 500).trim(),
                    url: itemUrl,
                    imageUrl: imageUrl,
                    publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
                    source: feedInfo.source,
                    category: feedInfo.category,
                    feedKey: feedKey
                });
            }
        } catch (error) {}
        
        return results;
    }

    async scrapeByCategory(category, keyword = null, limit = 50) {
        const allResults = [];
        const categoryFeeds = Object.entries(this.rssFeeds).filter(([_, info]) => info.category === category);
        
        for (let i = 0; i < categoryFeeds.length; i += 5) {
            const chunk = categoryFeeds.slice(i, i + 5);
            const promises = chunk.map(([key, info]) => this.scrapeFromFeed(key, info, keyword));
            const results = await Promise.all(promises);
            allResults.push(...results.flat());
        }
        
        return allResults.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, limit);
    }

    async liveSearch(keyword, options = {}) {
        const { category = null, limit = 100, maxSources = 25, includeGoogleNews = true } = options;
        
        if (!keyword || keyword.length < 2) throw new Error('Arama kelimesi en az 2 karakter olmalidir');
        
        console.log('Canli arama baslatildi:', keyword);
        
        const allResults = [];
        
        let googleNewsPromise = includeGoogleNews ? this.searchGoogleNews(keyword) : null;
        
        let feeds = Object.entries(this.rssFeeds);
        if (category) feeds = feeds.filter(([_, info]) => info.category === category);
        feeds = feeds.sort(() => Math.random() - 0.5).slice(0, maxSources);
        
        for (let i = 0; i < feeds.length; i += 5) {
            const chunk = feeds.slice(i, i + 5);
            const promises = chunk.map(([key, info]) => this.scrapeFromFeed(key, info, keyword));
            const results = await Promise.all(promises);
            allResults.push(...results.flat());
            if (allResults.length >= limit) break;
        }
        
        if (googleNewsPromise) {
            try {
                const googleResults = await googleNewsPromise;
                allResults.push(...googleResults);
            } catch (error) {}
        }
        
        const scored = allResults.map(item => {
            let score = 0;
            score += this.countKeywordOccurrences(item.title, keyword) * 10;
            score += this.countKeywordOccurrences(item.description, keyword) * 2;
            if (item.category === 'Google News') score += 5;
            
            const hoursDiff = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
            if (hoursDiff < 1) score += 20;
            else if (hoursDiff < 6) score += 10;
            else if (hoursDiff < 24) score += 5;
            
            return { ...item, relevanceScore: score };
        });
        
        scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
        
        const seen = new Set();
        const unique = scored.filter(item => {
            if (!item.url || seen.has(item.url)) return false;
            seen.add(item.url);
            return true;
        });
        
        console.log('Toplam sonuc:', unique.length);
        return unique.slice(0, limit);
    }

    async scrapeAllStaggered(progressCallback = null) {
        const allFeeds = Object.entries(this.rssFeeds);
        const allResults = [];
        let processed = 0;
        
        for (const [feedKey, feedInfo] of allFeeds) {
            try {
                const results = await this.scrapeFromFeed(feedKey, feedInfo, null);
                allResults.push(...results);
                processed++;
                if (progressCallback) progressCallback({ current: processed, total: allFeeds.length, feedKey, found: results.length });
                await new Promise(resolve => setTimeout(resolve, 300));
            } catch (error) { processed++; }
        }
        
        const seen = new Set();
        return allResults.filter(item => {
            if (!item.url || seen.has(item.url)) return false;
            seen.add(item.url);
            return true;
        });
    }

    getCategories() {
        const categories = new Set();
        Object.values(this.rssFeeds).forEach(feed => categories.add(feed.category));
        return Array.from(categories).sort();
    }

    getSourceStats() {
        const stats = { total: Object.keys(this.rssFeeds).length, byCategory: {}, bySource: {} };
        Object.values(this.rssFeeds).forEach(feed => {
            stats.byCategory[feed.category] = (stats.byCategory[feed.category] || 0) + 1;
            stats.bySource[feed.source] = (stats.bySource[feed.source] || 0) + 1;
        });
        return stats;
    }
}

module.exports = RSSNewsScraper;
