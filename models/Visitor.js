/**
 * ===========================================
 * VISITOR MODEL
 * ===========================================
 * 
 * Ziyaretçi bilgilerini ve IP adreslerini saklar.
 * Her benzersiz ziyaretçi için bir kayıt tutulur.
 */

const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
    // Benzersiz ziyaretçi ID'si (frontend'den gelen)
    visitorId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // IP adresi
    ip: {
        type: String,
        required: true,
        index: true
    },
    
    // User Agent bilgisi
    userAgent: {
        type: String,
        default: ''
    },
    
    // İlk ziyaret tarihi
    firstVisit: {
        type: Date,
        default: Date.now
    },
    
    // Son aktif olma zamanı
    lastActive: {
        type: Date,
        default: Date.now,
        index: true
    },
    
    // Toplam ziyaret sayısı (ping sayısı)
    visitCount: {
        type: Number,
        default: 1
    },
    
    // Ziyaret edilen sayfalar/aramalar
    activities: [{
        type: {
            type: String, // 'search', 'category', 'page_view'
            enum: ['search', 'category', 'page_view']
        },
        value: String, // arama kelimesi veya kategori adı
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Ülke/şehir bilgisi (opsiyonel - IP'den çıkarılabilir)
    location: {
        country: String,
        city: String
    },
    
    // Aktif mi? (60 saniye içinde ping attı mı)
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true // createdAt ve updatedAt otomatik eklenir
});

// Son aktiviteye göre sıralama için index
visitorSchema.index({ lastActive: -1 });

// IP'ye göre arama için index
visitorSchema.index({ ip: 1, lastActive: -1 });

/**
 * Aktif ziyaretçi sayısını getir (son 60 saniye)
 */
visitorSchema.statics.getActiveCount = async function() {
    const sixtySecondsAgo = new Date(Date.now() - 60000);
    return await this.countDocuments({ 
        lastActive: { $gte: sixtySecondsAgo } 
    });
};

/**
 * Ziyaretçiyi güncelle veya yeni oluştur
 */
visitorSchema.statics.pingVisitor = async function(visitorId, ip, userAgent) {
    const visitor = await this.findOneAndUpdate(
        { visitorId },
        {
            $set: {
                ip,
                userAgent,
                lastActive: new Date(),
                isActive: true
            },
            $inc: { visitCount: 1 },
            $setOnInsert: { 
                firstVisit: new Date(),
                visitorId 
            }
        },
        { 
            upsert: true, 
            new: true,
            setDefaultsOnInsert: true
        }
    );
    return visitor;
};

/**
 * Aktivite ekle
 */
visitorSchema.statics.addActivity = async function(visitorId, type, value) {
    await this.findOneAndUpdate(
        { visitorId },
        {
            $push: {
                activities: {
                    $each: [{ type, value, timestamp: new Date() }],
                    $slice: -50 // Son 50 aktiviteyi tut
                }
            }
        }
    );
};

/**
 * Bugünkü benzersiz ziyaretçi sayısı
 */
visitorSchema.statics.getTodayUniqueCount = async function() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return await this.countDocuments({
        lastActive: { $gte: today }
    });
};

/**
 * Toplam benzersiz ziyaretçi sayısı
 */
visitorSchema.statics.getTotalCount = async function() {
    return await this.countDocuments({});
};

/**
 * IP bazlı istatistikler
 */
visitorSchema.statics.getIpStats = async function(limit = 20) {
    return await this.aggregate([
        {
            $group: {
                _id: '$ip',
                count: { $sum: 1 },
                totalVisits: { $sum: '$visitCount' },
                lastSeen: { $max: '$lastActive' }
            }
        },
        { $sort: { totalVisits: -1 } },
        { $limit: limit }
    ]);
};

const Visitor = mongoose.model('Visitor', visitorSchema);

module.exports = Visitor;
