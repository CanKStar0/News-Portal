/**
 * ===========================================
 * SCRAPER INDEX DOSYASI
 * ===========================================
 * 
 * Tüm scraper'ları tek bir yerden export eder.
 * Yeni scraper eklendiğinde buraya da eklenmeli.
 */

const BaseScraper = require('./base/BaseScraper');
const BloombergScraper = require('./sites/BloombergScraper');
const DunyaScraper = require('./sites/DunyaScraper');
const ForeksScraper = require('./sites/ForeksScraper');
const GoogleNewsScraper = require('./sites/GoogleNewsScraper');

// Aktif scraper'ların registry'si
// Yeni scraper eklemek için buraya ekleyin
const scraperRegistry = {
    bloomberg: BloombergScraper,
    dunya: DunyaScraper,
    foreks: ForeksScraper,
    googlenews: GoogleNewsScraper
};

/**
 * Kaynak adına göre scraper instance'ı oluştur
 * 
 * Factory pattern kullanarak runtime'da scraper seçimi yapıyoruz.
 * 
 * @param {string} sourceName - Kaynak adı (bloomberg, dunya, foreks)
 * @returns {BaseScraper} - Scraper instance'ı
 */
function createScraper(sourceName) {
    const ScraperClass = scraperRegistry[sourceName.toLowerCase()];
    
    if (!ScraperClass) {
        throw new Error(`Bilinmeyen kaynak: ${sourceName}. Mevcut kaynaklar: ${Object.keys(scraperRegistry).join(', ')}`);
    }
    
    return new ScraperClass();
}

/**
 * Tüm aktif scraper'ları listele
 * 
 * @returns {string[]} - Kaynak adları
 */
function getAvailableScrapers() {
    return Object.keys(scraperRegistry);
}

module.exports = {
    BaseScraper,
    BloombergScraper,
    DunyaScraper,
    ForeksScraper,
    createScraper,
    getAvailableScrapers,
    scraperRegistry
};
