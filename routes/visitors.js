/**
 * ===========================================
 * VISITOR TRACKING ROUTES
 * ===========================================
 * 
 * Anlık ziyaretçi sayısını takip eder ve MongoDB'ye kaydeder.
 * Her ziyaretçinin IP adresi, User Agent ve aktiviteleri kaydedilir.
 */

const express = require('express');
const router = express.Router();
const { Visitor } = require('../models');

/**
 * IP adresini al (proxy arkasında bile)
 */
function getClientIp(req) {
    // Cloudflare
    if (req.headers['cf-connecting-ip']) {
        return req.headers['cf-connecting-ip'];
    }
    // X-Forwarded-For (proxy/load balancer)
    if (req.headers['x-forwarded-for']) {
        return req.headers['x-forwarded-for'].split(',')[0].trim();
    }
    // X-Real-IP (nginx)
    if (req.headers['x-real-ip']) {
        return req.headers['x-real-ip'];
    }
    // Direkt bağlantı
    return req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           req.ip || 
           'unknown';
}

/**
 * POST /api/visitors/ping
 * Ziyaretçi ping'i - aktif olduğunu bildirir ve DB'ye kaydeder
 */
router.post('/ping', async (req, res) => {
    try {
        const { visitorId } = req.body;
        
        if (!visitorId) {
            return res.status(400).json({
                success: false,
                error: 'visitorId gerekli'
            });
        }
        
        // IP ve User Agent al
        const ip = getClientIp(req);
        const userAgent = req.headers['user-agent'] || '';
        
        // Veritabanına kaydet/güncelle
        await Visitor.pingVisitor(visitorId, ip, userAgent);
        
        // Aktif ziyaretçi sayısını al
        const activeCount = await Visitor.getActiveCount();
        
        res.json({
            success: true,
            count: activeCount
        });
    } catch (error) {
        console.error('Visitor ping hatası:', error);
        res.status(500).json({
            success: false,
            error: 'Sunucu hatası'
        });
    }
});

/**
 * POST /api/visitors/activity
 * Ziyaretçi aktivitesi kaydet (arama, kategori vs.)
 */
router.post('/activity', async (req, res) => {
    try {
        const { visitorId, type, value } = req.body;
        
        if (!visitorId || !type) {
            return res.status(400).json({
                success: false,
                error: 'visitorId ve type gerekli'
            });
        }
        
        await Visitor.addActivity(visitorId, type, value);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Activity kayıt hatası:', error);
        res.status(500).json({
            success: false,
            error: 'Sunucu hatası'
        });
    }
});

/**
 * GET /api/visitors/count
 * Sadece ziyaretçi sayısını döndür
 */
router.get('/count', async (req, res) => {
    try {
        const activeCount = await Visitor.getActiveCount();
        const todayCount = await Visitor.getTodayUniqueCount();
        const totalCount = await Visitor.getTotalCount();
        
        res.json({
            success: true,
            active: activeCount,      // Şu an aktif
            today: todayCount,        // Bugün gelen benzersiz
            total: totalCount         // Toplam benzersiz ziyaretçi
        });
    } catch (error) {
        console.error('Visitor count hatası:', error);
        res.status(500).json({
            success: false,
            error: 'Sunucu hatası'
        });
    }
});

/**
 * GET /api/visitors/stats
 * Detaylı istatistikler (admin için)
 */
router.get('/stats', async (req, res) => {
    try {
        const activeCount = await Visitor.getActiveCount();
        const todayCount = await Visitor.getTodayUniqueCount();
        const totalCount = await Visitor.getTotalCount();
        const topIps = await Visitor.getIpStats(10);
        
        // Son 10 ziyaretçi
        const recentVisitors = await Visitor.find({})
            .sort({ lastActive: -1 })
            .limit(10)
            .select('visitorId ip lastActive visitCount userAgent');
        
        res.json({
            success: true,
            stats: {
                active: activeCount,
                today: todayCount,
                total: totalCount,
                topIps,
                recentVisitors
            }
        });
    } catch (error) {
        console.error('Visitor stats hatası:', error);
        res.status(500).json({
            success: false,
            error: 'Sunucu hatası'
        });
    }
});

/**
 * GET /api/visitors/list
 * Tüm ziyaretçileri listele (sayfalı)
 */
router.get('/list', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const skip = (page - 1) * limit;
        
        const visitors = await Visitor.find({})
            .sort({ lastActive: -1 })
            .skip(skip)
            .limit(limit)
            .select('visitorId ip lastActive firstVisit visitCount userAgent location');
        
        const total = await Visitor.countDocuments({});
        
        res.json({
            success: true,
            data: visitors,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Visitor list hatası:', error);
        res.status(500).json({
            success: false,
            error: 'Sunucu hatası'
        });
    }
});

module.exports = router;
