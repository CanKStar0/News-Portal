/**
 * ===========================================
 * YARDIMCI FONKSİYONLAR (Utils)
 * ===========================================
 * 
 * Bu dosya, projede sıkça kullanılan yardımcı fonksiyonları içerir.
 * Tarih dönüşümü, metin temizleme, gecikme ekleme gibi işlemler.
 */

/**
 * Belirli bir süre bekle (Async Sleep)
 * 
 * NEDEN GEREKLİ?
 * - Web scraping'de çok hızlı istek göndermek IP engellenmeye yol açabilir
 * - Sayfa yüklenmesi için zaman tanımak gerekebilir
 * - Rate limiting'i aşmamak için istekler arası bekleme
 * 
 * @param {number} ms - Beklenecek süre (milisaniye)
 * @returns {Promise} - Belirtilen süre sonra resolve olan Promise
 * 
 * KULLANIM:
 * await delay(2000); // 2 saniye bekle
 */
function delay(ms) {
    // Promise, asenkron işlemleri temsil eden bir objedir
    // setTimeout, belirtilen süre sonra callback'i çağırır
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Rastgele gecikme (Bot algılamayı önlemek için)
 * 
 * İnsan davranışını taklit etmek için her seferinde farklı süre bekler.
 * Sabit aralıklarla istek göndermek bot sinyali verir.
 * 
 * @param {number} minMs - Minimum bekleme süresi
 * @param {number} maxMs - Maksimum bekleme süresi
 * @returns {Promise}
 * 
 * KULLANIM:
 * await randomDelay(1000, 3000); // 1-3 saniye arası rastgele bekle
 */
async function randomDelay(minMs = 1000, maxMs = 3000) {
    // Math.random() -> 0 ile 1 arasında rastgele ondalık sayı
    // Bu formül min ve max arasında rastgele tam sayı üretir
    const delay_ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    console.log(`⏳ ${delay_ms}ms bekleniyor...`);
    await delay(delay_ms);
}

/**
 * Tarih string'ini Date objesine çevir
 * 
 * Farklı siteler tarihi farklı formatlarda verir:
 * - "20.12.2024"
 * - "2024-12-20T15:30:00"
 * - "20 Aralık 2024"
 * - "2 saat önce"
 * 
 * Bu fonksiyon yaygın formatları tanımaya çalışır.
 * 
 * @param {string} dateStr - Tarih string'i
 * @returns {Date|null} - Date objesi veya tanınamazsa null
 */
function parseDate(dateStr) {
    if (!dateStr) return null;
    
    // String'i temizle
    const cleaned = dateStr.trim();
    
    // ISO format kontrolü (2024-12-20T15:30:00)
    if (cleaned.match(/^\d{4}-\d{2}-\d{2}/)) {
        const date = new Date(cleaned);
        if (!isNaN(date.getTime())) return date;
    }
    
    // Türkçe tarih formatı (20 Aralık 2024 veya 20.12.2024)
    const turkishMonths = {
        'ocak': 0, 'şubat': 1, 'mart': 2, 'nisan': 3,
        'mayıs': 4, 'haziran': 5, 'temmuz': 6, 'ağustos': 7,
        'eylül': 8, 'ekim': 9, 'kasım': 10, 'aralık': 11
    };
    
    // "20 Aralık 2024" formatı
    const turkishMatch = cleaned.toLowerCase().match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (turkishMatch) {
        const day = parseInt(turkishMatch[1]);
        const month = turkishMonths[turkishMatch[2]];
        const year = parseInt(turkishMatch[3]);
        
        if (month !== undefined) {
            return new Date(year, month, day);
        }
    }
    
    // "20.12.2024" veya "20/12/2024" formatı
    const dotMatch = cleaned.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    if (dotMatch) {
        const day = parseInt(dotMatch[1]);
        const month = parseInt(dotMatch[2]) - 1; // JavaScript'te ay 0'dan başlar
        const year = parseInt(dotMatch[3]);
        return new Date(year, month, day);
    }
    
    // "X saat önce", "X dakika önce" formatı
    const relativeMatch = cleaned.toLowerCase().match(/(\d+)\s*(saat|dakika|gün|hafta)\s*önce/);
    if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2];
        const now = new Date();
        
        switch (unit) {
            case 'dakika':
                now.setMinutes(now.getMinutes() - amount);
                break;
            case 'saat':
                now.setHours(now.getHours() - amount);
                break;
            case 'gün':
                now.setDate(now.getDate() - amount);
                break;
            case 'hafta':
                now.setDate(now.getDate() - (amount * 7));
                break;
        }
        return now;
    }
    
    // Son çare: JavaScript'in built-in parser'ını dene
    const fallbackDate = new Date(cleaned);
    if (!isNaN(fallbackDate.getTime())) {
        return fallbackDate;
    }
    
    // Hiçbir format eşleşmedi
    console.warn(`⚠️ Tarih parse edilemedi: "${dateStr}"`);
    return null;
}

/**
 * HTML içeriğini temizle
 * 
 * Web sayfalarından çekilen metinlerde genellikle:
 * - Fazla boşluklar
 * - Satır sonları
 * - HTML entity'leri (&amp; -> &)
 * bulunur. Bu fonksiyon bunları temizler.
 * 
 * @param {string} text - Temizlenecek metin
 * @returns {string} - Temizlenmiş metin
 */
function cleanText(text) {
    if (!text) return '';
    
    return text
        // HTML entity'lerini çöz
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        // Birden fazla boşluğu tek boşluğa indir
        .replace(/\s+/g, ' ')
        // Baştaki ve sondaki boşlukları kaldır
        .trim();
}

/**
 * URL'yi normalize et (Düzelt)
 * 
 * Bazı siteler göreceli URL kullanır: "/haberler/123"
 * Bunları mutlak URL'ye çevirmemiz gerekir: "https://site.com/haberler/123"
 * 
 * @param {string} url - Düzeltilecek URL
 * @param {string} baseUrl - Site ana adresi
 * @returns {string} - Düzeltilmiş tam URL
 */
function normalizeUrl(url, baseUrl) {
    if (!url) return '';
    
    // Zaten tam URL ise dokunma
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    
    // Protocol-relative URL (//site.com/path)
    if (url.startsWith('//')) {
        return 'https:' + url;
    }
    
    // Göreceli URL (/path veya path)
    const base = baseUrl.replace(/\/$/, ''); // Sondaki / varsa kaldır
    
    if (url.startsWith('/')) {
        return base + url;
    }
    
    return base + '/' + url;
}

/**
 * Metinden anahtar kelimeler çıkar
 * 
 * Basit bir keyword extraction algoritması.
 * Gerçek projelerde NLP kütüphaneleri kullanılabilir.
 * 
 * @param {string} text - Metin
 * @param {number} maxKeywords - Maksimum kelime sayısı
 * @returns {string[]} - Anahtar kelimeler
 */
function extractKeywords(text, maxKeywords = 5) {
    if (!text) return [];
    
    // Stop words - anlamsız kelimeler (Türkçe)
    const stopWords = new Set([
        've', 'veya', 'ile', 'için', 'de', 'da', 'den', 'dan',
        'bir', 'bu', 'şu', 'o', 'ne', 'ki', 'ama', 'fakat',
        'ancak', 'gibi', 'kadar', 'daha', 'en', 'çok', 'az',
        'olan', 'olarak', 'üzere', 'göre', 'karşı', 'doğru',
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be'
    ]);
    
    // Metni kelimelere ayır
    const words = text
        .toLowerCase()
        .replace(/[^\wığüşöçİĞÜŞÖÇ\s]/g, '') // Özel karakterleri kaldır
        .split(/\s+/)
        .filter(word => {
            return word.length > 3 && // 3 karakterden uzun
                   !stopWords.has(word) && // Stop word değil
                   !/^\d+$/.test(word); // Sadece sayı değil
        });
    
    // Kelime frekanslarını hesapla
    const frequency = {};
    words.forEach(word => {
        frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // En sık geçen kelimeleri döndür
    return Object.entries(frequency)
        .sort((a, b) => b[1] - a[1]) // Frekansa göre sırala
        .slice(0, maxKeywords)
        .map(entry => entry[0]);
}

/**
 * Güvenli JSON parse
 * 
 * JSON.parse hata fırlatabilir. Bu wrapper güvenli şekilde parse eder.
 * 
 * @param {string} str - JSON string
 * @param {*} defaultValue - Hata durumunda döndürülecek değer
 * @returns {*} - Parse edilmiş obje veya varsayılan değer
 */
function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Retry mekanizması
 * 
 * Bir fonksiyonu belirli sayıda tekrar dene.
 * Network hataları veya geçici sorunlar için kullanışlı.
 * 
 * @param {Function} fn - Çalıştırılacak async fonksiyon
 * @param {number} maxRetries - Maksimum deneme sayısı
 * @param {number} delayMs - Denemeler arası bekleme
 * @returns {*} - Fonksiyonun döndürdüğü değer
 */
async function retry(fn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ Deneme ${attempt}/${maxRetries} başarısız: ${error.message}`);
            
            if (attempt < maxRetries) {
                await delay(delayMs * attempt); // Her denemede daha uzun bekle
            }
        }
    }
    
    throw lastError;
}

/**
 * Haber verilerini doğrula
 * 
 * Scrape edilen verinin gerekli alanları içerdiğini kontrol et.
 * 
 * @param {object} newsData - Haber verisi
 * @returns {object} - { isValid: boolean, errors: string[] }
 */
function validateNewsData(newsData) {
    const errors = [];
    
    // Zorunlu alanlar
    if (!newsData.title || newsData.title.trim() === '') {
        errors.push('Başlık (title) boş olamaz');
    }
    
    if (!newsData.url || newsData.url.trim() === '') {
        errors.push('URL boş olamaz');
    }
    
    if (!newsData.publishedAt) {
        errors.push('Yayınlanma tarihi (publishedAt) boş olamaz');
    }
    
    if (!newsData.source) {
        errors.push('Kaynak (source) belirtilmeli');
    }
    
    // URL formatı kontrolü
    if (newsData.url && !newsData.url.match(/^https?:\/\/.+/)) {
        errors.push('URL geçerli bir format değil');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// Tüm fonksiyonları dışa aktar
module.exports = {
    delay,
    randomDelay,
    parseDate,
    cleanText,
    normalizeUrl,
    extractKeywords,
    safeJsonParse,
    retry,
    validateNewsData
};
