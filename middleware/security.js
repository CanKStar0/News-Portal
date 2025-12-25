/**
 * ===========================================
 * GÜVENLİK MİDDLEWARE'LERİ
 * ===========================================
 * 
 * NoSQL Injection, XSS ve diğer saldırılara karşı koruma.
 * Production ortamında zorunlu güvenlik önlemleri.
 */

/**
 * NoSQL Injection Koruması
 * 
 * MongoDB sorgularında kullanılan operatörleri ($gt, $ne, $regex vs.)
 * engeller. Kullanıcı girdisi içinde bu operatörler varsa temizler.
 * 
 * Örnek saldırı:
 * GET /api/news?keyword[$ne]=test  -> Tüm haberleri döner
 * GET /api/news?keyword[$gt]=      -> Tüm haberleri döner
 */
function sanitizeInput(obj) {
    if (obj === null || obj === undefined) return obj;
    
    // String ise direkt döndür
    if (typeof obj === 'string') {
        // $ ile başlayan operatörleri temizle
        return obj.replace(/\$[a-zA-Z]+/g, '');
    }
    
    // Array ise her elemanı kontrol et
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeInput(item));
    }
    
    // Object ise
    if (typeof obj === 'object') {
        const sanitized = {};
        for (const key of Object.keys(obj)) {
            // $ ile başlayan key'leri atla (NoSQL operatörleri)
            if (key.startsWith('$')) {
                console.warn(`⚠️ NoSQL injection girişimi engellendi: ${key}`);
                continue;
            }
            // __proto__ ve constructor gibi tehlikeli key'leri atla
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                console.warn(`⚠️ Prototype pollution girişimi engellendi: ${key}`);
                continue;
            }
            sanitized[key] = sanitizeInput(obj[key]);
        }
        return sanitized;
    }
    
    return obj;
}

/**
 * Input Validation Middleware
 * 
 * Tüm gelen isteklerdeki query, body ve params'ı temizler.
 */
function inputSanitizer(req, res, next) {
    // Query parametrelerini temizle
    if (req.query) {
        req.query = sanitizeInput(req.query);
    }
    
    // Body'yi temizle
    if (req.body) {
        req.body = sanitizeInput(req.body);
    }
    
    // URL parametrelerini temizle
    if (req.params) {
        req.params = sanitizeInput(req.params);
    }
    
    next();
}

/**
 * Keyword Validation
 * 
 * Arama keyword'ünü validate eder.
 * Maksimum uzunluk, minimum uzunluk ve izin verilen karakterler.
 */
function validateKeyword(keyword) {
    // Object olarak gelirse (NoSQL injection girişimi) reddet
    if (keyword === null || keyword === undefined) {
        return { valid: false, message: 'Arama terimi gerekli' };
    }
    
    // Object veya array ise reddet (NoSQL injection girişimi)
    if (typeof keyword !== 'string') {
        console.warn('⚠️ NoSQL injection girişimi engellendi (keyword object)');
        return { valid: false, message: 'Geçersiz arama formatı' };
    }
    
    const trimmed = keyword.trim();
    
    // Minimum uzunluk
    if (trimmed.length < 2) {
        return { valid: false, message: 'Arama terimi en az 2 karakter olmalı' };
    }
    
    // Maksimum uzunluk
    if (trimmed.length > 100) {
        return { valid: false, message: 'Arama terimi en fazla 100 karakter olabilir' };
    }
    
    // Sadece izin verilen karakterler (Türkçe karakterler dahil)
    const validPattern = /^[a-zA-Z0-9\sğüşıöçĞÜŞİÖÇ\-_.]+$/;
    if (!validPattern.test(trimmed)) {
        return { valid: false, message: 'Arama terimi geçersiz karakterler içeriyor' };
    }
    
    return { valid: true, keyword: trimmed };
}

/**
 * Pagination Validation
 * 
 * Sayfalama parametrelerini validate eder.
 */
function validatePagination(page, limit) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 12;
    
    return {
        page: Math.max(1, Math.min(pageNum, 1000)),  // 1-1000 arası
        limit: Math.max(1, Math.min(limitNum, 100))  // 1-100 arası
    };
}

/**
 * Category Validation
 * 
 * Kategori adını validate eder.
 */
function validateCategory(category) {
    const allowedCategories = [
        'Gundem', 'Gündem',
        'Ekonomi',
        'Spor',
        'Teknoloji',
        'Dunya', 'Dünya',
        'Saglik', 'Sağlık',
        'Magazin',
        'Son Dakika',
        'Google News',
        'Genel'
    ];
    
    if (!category || typeof category !== 'string') {
        return { valid: false, message: 'Kategori gerekli' };
    }
    
    const trimmed = category.trim();
    
    // Kategori whitelist kontrolü (case-insensitive)
    const isAllowed = allowedCategories.some(
        cat => cat.toLowerCase() === trimmed.toLowerCase()
    );
    
    if (!isAllowed) {
        return { valid: false, message: 'Geçersiz kategori' };
    }
    
    return { valid: true, category: trimmed };
}

/**
 * Request ID Generator
 * 
 * Her isteğe benzersiz ID atar (loglama için).
 */
function requestIdMiddleware(req, res, next) {
    req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader('X-Request-ID', req.requestId);
    next();
}

/**
 * Security Headers (Helmet'e ek)
 * 
 * Ekstra güvenlik başlıkları ekler.
 */
function extraSecurityHeaders(req, res, next) {
    // Cache kontrolü (hassas veriler için)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions policy
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
}

/**
 * IP Tabanlı Şüpheli Aktivite Tespiti
 * 
 * Aynı IP'den çok fazla hatalı istek gelirse blokla.
 */
const suspiciousIPs = new Map();  // IP -> {count, lastAttempt}
const MAX_SUSPICIOUS_ATTEMPTS = 10;
const BLOCK_DURATION = 15 * 60 * 1000;  // 15 dakika

function suspiciousActivityDetector(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Bloklanmış mı kontrol et
    const record = suspiciousIPs.get(ip);
    if (record && record.blocked) {
        const timeSinceBlock = Date.now() - record.blockedAt;
        if (timeSinceBlock < BLOCK_DURATION) {
            return res.status(429).json({
                success: false,
                message: 'IP adresiniz geçici olarak engellenmiştir. Lütfen daha sonra tekrar deneyin.'
            });
        } else {
            // Block süresi dolmuş, temizle
            suspiciousIPs.delete(ip);
        }
    }
    
    // Response'a hook ekle - hata durumunda say
    const originalSend = res.send;
    res.send = function(body) {
        if (res.statusCode >= 400 && res.statusCode < 500) {
            const current = suspiciousIPs.get(ip) || { count: 0, lastAttempt: Date.now() };
            current.count++;
            current.lastAttempt = Date.now();
            
            if (current.count >= MAX_SUSPICIOUS_ATTEMPTS) {
                current.blocked = true;
                current.blockedAt = Date.now();
                console.warn(`⚠️ IP bloklandı (şüpheli aktivite): ${ip}`);
            }
            
            suspiciousIPs.set(ip, current);
        }
        return originalSend.call(this, body);
    };
    
    next();
}

/**
 * Tüm güvenlik middleware'lerini tek seferde uygula
 */
function applySecurityMiddlewares(app) {
    app.use(requestIdMiddleware);
    app.use(extraSecurityHeaders);
    app.use(inputSanitizer);
    app.use(suspiciousActivityDetector);
}

module.exports = {
    sanitizeInput,
    inputSanitizer,
    validateKeyword,
    validatePagination,
    validateCategory,
    requestIdMiddleware,
    extraSecurityHeaders,
    suspiciousActivityDetector,
    applySecurityMiddlewares
};
