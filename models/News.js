/**
 * ===========================================
 * HABER MODELİ (News Schema)
 * ===========================================
 * 
 * Bu dosya, haberlerin veritabanında nasıl saklanacağını tanımlar.
 * Mongoose Schema kullanarak veri yapısını, validasyonları ve
 * indeksleri belirliyoruz.
 * 
 * MONGOOSE SCHEMA NEDİR?
 * Schema, MongoDB'deki dökümanların yapısını tanımlayan bir şablondur.
 * Her alanın tipini, zorunlu olup olmadığını, varsayılan değerini vs. belirler.
 * 
 * MONGOOSE MODEL NEDİR?
 * Model, Schema'dan oluşturulan ve veritabanı işlemleri yapmamızı sağlayan
 * bir constructor'dır. CRUD (Create, Read, Update, Delete) işlemleri
 * model üzerinden yapılır.
 */

const mongoose = require('mongoose');
const config = require('../config');

/**
 * HABER ŞEMASI TANIMLAMASI
 * 
 * Schema içindeki her alan için:
 * - type: Veri tipi (String, Number, Date, Boolean, Array, etc.)
 * - required: Zorunlu alan mı?
 * - trim: Baştaki ve sondaki boşlukları otomatik sil
 * - default: Varsayılan değer
 * - enum: İzin verilen değerler listesi
 * - index: Bu alan için indeks oluştur (arama hızı için)
 */
const newsSchema = new mongoose.Schema({
    // ===== TEMEL HABER BİLGİLERİ =====
    
    /**
     * title: Haber başlığı
     * - Zorunlu alan (required: true)
     * - trim: " Haber Başlığı " -> "Haber Başlığı"
     * - maxlength: Maksimum 500 karakter
     */
    title: {
        type: String,
        required: [true, 'Haber başlığı zorunludur'],
        trim: true,
        maxlength: [500, 'Başlık 500 karakteri geçemez']
    },

    /**
     * summary: Haber özeti/girişi
     * - Zorunlu değil (haberin özeti olmayabilir)
     * - maxlength: Maksimum 2000 karakter
     */
    summary: {
        type: String,
        trim: true,
        maxlength: [2000, 'Özet 2000 karakteri geçemez'],
        default: ''
    },

    /**
     * content: Haber içeriği (tam metin)
     * - Tüm haber metni
     */
    content: {
        type: String,
        trim: true,
        default: ''
    },

    /**
     * url: Haberin orijinal linki
     * - Zorunlu ve benzersiz (unique)
     * - Aynı haber iki kez eklenmemeli
     */
    url: {
        type: String,
        required: [true, 'Haber URL\'si zorunludur'],
        trim: true,
        unique: true  // Aynı URL'den iki haber eklenemez
    },

    /**
     * imageUrl: Haber görseli linki
     * - Opsiyonel
     */
    imageUrl: {
        type: String,
        trim: true,
        default: ''
    },

    // ===== KATEGORİZASYON =====

    /**
     * category: Haber kategorisi
     * - enum: Sadece belirli değerlere izin ver
     * - Geçersiz kategori girilirse hata verir
     */
    category: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,  // "FİNANS" -> "finans"
        enum: {
            values: config.categories,
            message: '{VALUE} geçerli bir kategori değil'
        },
        default: 'genel'
    },

    /**
     * source: Haberin geldiği kaynak site
     * - bloomberg, dunya, foreks vs.
     */
    source: {
        type: String,
        required: [true, 'Kaynak sitesi zorunludur'],
        trim: true,
        lowercase: true,
        enum: {
            values: Object.keys(config.sources),
            message: '{VALUE} geçerli bir kaynak değil'
        }
    },

    /**
     * keywords: Anahtar kelimeler
     * - Array of String
     * - Haberin içeriğinden çıkarılan veya atanan kelimeler
     */
    keywords: [{
        type: String,
        trim: true,
        lowercase: true
    }],

    // ===== TARİH BİLGİLERİ =====

    /**
     * publishedAt: Haberin yayınlanma tarihi
     * - Haber sitesindeki orijinal tarih
     */
    publishedAt: {
        type: Date,
        required: [true, 'Yayınlanma tarihi zorunludur']
    },

    /**
     * scrapedAt: Haberin çekildiği tarih
     * - Scraper'ın bu haberi aldığı an
     * - Otomatik olarak şimdiki zaman atanır
     */
    scrapedAt: {
        type: Date,
        default: Date.now
    },

    // ===== META BİLGİLER =====

    /**
     * author: Haber yazarı
     * - Opsiyonel (her haberde yazar belirtilmeyebilir)
     */
    author: {
        type: String,
        trim: true,
        default: ''
    },

    /**
     * isActive: Haber aktif mi?
     * - Soft delete için kullanılabilir
     * - false ise API'de gösterilmez
     */
    isActive: {
        type: Boolean,
        default: true
    }

}, {
    // ===== ŞEMA SEÇENEKLERİ =====
    
    /**
     * timestamps: true
     * Mongoose otomatik olarak şu alanları ekler:
     * - createdAt: Döküman oluşturulma zamanı
     * - updatedAt: Son güncelleme zamanı
     */
    timestamps: true,

    /**
     * toJSON ve toObject
     * JSON'a dönüştürme ayarları
     * virtuals: Virtual alanları dahil et
     */
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

/**
 * ===========================================
 * İNDEKSLER (Indexes) - 500K-1M Kayıt İçin Optimize
 * ===========================================
 * 
 * İndeksler, veritabanı sorgularını hızlandırır.
 * Kitaptaki dizin gibi düşünün - aradığınızı hızlıca bulursunuz.
 * 
 * UYARI: Çok fazla indeks yazmayı yavaşlatır.
 * Sadece sık sorgulanan alanlar için indeks oluşturun.
 */

// 1. Kategori + Yayın Tarihi (Kategori sayfaları için)
// En sık kullanılan sorgu: category=X ve publishedAt sıralama
newsSchema.index({ category: 1, publishedAt: -1 });

// 2. Kaynak + Yayın Tarihi (Kaynak bazlı sorgular)
newsSchema.index({ source: 1, publishedAt: -1 });

// 3. Aktif + Yayın Tarihi (Genel listeleme)
// isActive=true olan haberleri tarihe göre listele
newsSchema.index({ isActive: 1, publishedAt: -1 });

// 4. Kategori + Kaynak + Aktif + Tarih (Filtreleme için)
// Compound index - çoklu filtre sorguları için
newsSchema.index({ category: 1, source: 1, isActive: 1, publishedAt: -1 });

// 5. Scrape Tarihi (Eski haberleri temizleme için)
// Belirli tarihten eski haberleri bulmak için
newsSchema.index({ scrapedAt: 1 });

// 6. URL için index zaten unique constraint ile tanımlı, ek tanım gereksiz
// newsSchema.index({ url: 1 }, { unique: true, background: true });

// 7. Metin arama indeksi (Full-text search)
// Bu indeks, title ve summary alanlarında full-text arama yapmamızı sağlar
newsSchema.index({ 
    title: 'text', 
    summary: 'text',
    keywords: 'text'
}, {
    weights: {
        title: 10,    // Başlıktaki eşleşme 10 kat önemli
        keywords: 5,  // Anahtar kelimeler 5 kat önemli
        summary: 1    // Özet normal önemde
    },
    name: 'text_search_index',
    default_language: 'turkish'  // Türkçe stemming desteği
});

// 8. TTL Index - 30 günden eski haberleri otomatik sil (isteğe bağlı)
// Bu indeks aktifleştirilirse, 30 günden eski haberler otomatik silinir
// newsSchema.index({ publishedAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 gün

/**
 * ===========================================
 * VIRTUAL ALANLAR (Virtual Fields)
 * ===========================================
 * 
 * Virtual alanlar veritabanında saklanmaz, hesaplanır.
 * Disk alanı tasarrufu sağlar ve veri tutarlılığını korur.
 */

// Haberin kaç gün önce yayınlandığını hesapla
newsSchema.virtual('daysAgo').get(function() {
    if (!this.publishedAt) return null;
    
    const now = new Date();
    const published = new Date(this.publishedAt);
    const diffTime = Math.abs(now - published);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
});

// Kısa özet (ilk 150 karakter)
newsSchema.virtual('shortSummary').get(function() {
    if (!this.summary) return '';
    if (this.summary.length <= 150) return this.summary;
    return this.summary.substring(0, 147) + '...';
});

/**
 * ===========================================
 * MIDDLEWARE (Hooks)
 * ===========================================
 * 
 * Middleware'ler, belirli işlemlerden önce/sonra çalışan fonksiyonlardır.
 * pre: İşlemden önce
 * post: İşlemden sonra
 */

// Kaydetmeden önce URL'yi kontrol et
newsSchema.pre('save', function(next) {
    // URL'nin http/https ile başladığından emin ol
    if (this.url && !this.url.startsWith('http')) {
        this.url = 'https://' + this.url;
    }
    next();
});

/**
 * ===========================================
 * STATİK METODLAR (Static Methods)
 * ===========================================
 * 
 * Model üzerinde çağrılan metodlar.
 * Örnek: News.findByCategory('finans')
 */

/**
 * Kategoriye göre haber getir
 * @param {string} category - Kategori adı
 * @param {number} limit - Maksimum haber sayısı
 */
newsSchema.statics.findByCategory = function(category, limit = 20) {
    return this.find({ 
        category: category.toLowerCase(),
        isActive: true 
    })
    .sort({ publishedAt: -1 })  // En yeni en üstte
    .limit(limit);
};

/**
 * Anahtar kelimeye göre arama yap
 * @param {string} keyword - Aranacak kelime
 * @param {object} options - Ek seçenekler
 */
newsSchema.statics.searchByKeyword = function(keyword, options = {}) {
    const query = {
        isActive: true,
        $text: { $search: keyword }
    };

    // Kategori filtresi varsa ekle
    if (options.category) {
        query.category = options.category.toLowerCase();
    }

    // Kaynak filtresi varsa ekle
    if (options.source) {
        query.source = options.source.toLowerCase();
    }

    return this.find(query, {
        score: { $meta: 'textScore' }  // Arama skorunu dahil et
    })
    .sort({ score: { $meta: 'textScore' } })  // Skora göre sırala
    .limit(options.limit || 50);
};

/**
 * Belirli bir kaynaktan son haberleri getir
 * @param {string} source - Kaynak adı
 * @param {number} hours - Son kaç saat
 */
newsSchema.statics.getRecentBySource = function(source, hours = 24) {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    return this.find({
        source: source.toLowerCase(),
        publishedAt: { $gte: since },
        isActive: true
    }).sort({ publishedAt: -1 });
};

/**
 * URL'ye göre haber var mı kontrol et (duplicate check)
 * @param {string} url - Kontrol edilecek URL
 */
newsSchema.statics.existsByUrl = async function(url) {
    const count = await this.countDocuments({ url: url });
    return count > 0;
};

/**
 * ===========================================
 * INSTANCE METODLARI (Instance Methods)
 * ===========================================
 * 
 * Döküman üzerinde çağrılan metodlar.
 * Örnek: haberDokumani.addKeyword('bitcoin')
 */

/**
 * Habere anahtar kelime ekle
 * @param {string} keyword - Eklenecek kelime
 */
newsSchema.methods.addKeyword = function(keyword) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    if (!this.keywords.includes(normalizedKeyword)) {
        this.keywords.push(normalizedKeyword);
    }
    return this.save();
};

// Model oluştur ve dışa aktar
// mongoose.model('ModelAdı', schema)
// 'News' -> MongoDB'de 'news' collection'ı oluşturur (otomatik küçük harf + çoğul)
const News = mongoose.model('News', newsSchema);

module.exports = News;
