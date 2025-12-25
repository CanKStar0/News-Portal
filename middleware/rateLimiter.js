const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * ===========================================
 * RATE LIMITER MİDDLEWARE'LERİ
 * ===========================================
 * 
 * Farklı endpoint'ler için farklı limitler.
 * Production'da Redis store kullanılmalı.
 */

/**
 * Genel API limiti
 * Dakikada 60 istek
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 dakika
    max: parseInt(process.env.RATE_LIMIT_MAX) || 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
        success: false, 
        message: 'Çok fazla istek gönderdiniz. Lütfen bir dakika bekleyin.',
        retryAfter: 60
    },
    skip: (req) => {
        // Health endpoint'i limitleme
        return req.path === '/api/news/health';
    }
});

/**
 * Arama endpoint'i için özel limit
 * Dakikada 20 arama (yoğun istek engellemesi)
 */
const searchLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 dakika
    max: parseInt(process.env.SEARCH_RATE_LIMIT) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // IP + arama terimi kombinasyonu
        return req.ip + ':search';
    },
    message: { 
        success: false, 
        message: 'Çok fazla arama yaptınız. Lütfen bir dakika bekleyin.',
        retryAfter: 60
    }
});

/**
 * Scrape endpoint'i için çok sıkı limit
 * Dakikada 5 istek
 */
const scrapeLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 dakika
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
        success: false, 
        message: 'Scrape endpoint\'i için çok fazla istek. Lütfen bekleyin.',
        retryAfter: 60
    }
});

/**
 * Çok hızlı ardışık istek kontrolü (burst protection)
 * Saniyede 10 istekten fazla yapılamaz
 */
const burstLimiter = rateLimit({
    windowMs: 1000, // 1 saniye
    max: 10,
    standardHeaders: false,
    legacyHeaders: false,
    message: { 
        success: false, 
        message: 'İstek hızınız çok yüksek. Yavaşlayın.',
        retryAfter: 1
    }
});

module.exports = {
    apiLimiter,
    searchLimiter,
    scrapeLimiter,
    burstLimiter
};
