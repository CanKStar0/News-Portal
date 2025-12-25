/**
 * ===========================================
 * BELLEK TABANLI CACHE SİSTEMİ
 * ===========================================
 * 
 * Redis olmadan çalışan, hafif bir in-memory cache.
 * Küçük-orta ölçekli projeler için ideal.
 * 
 * ÖZELLİKLER:
 * - TTL (Time-to-Live) desteği
 * - Otomatik temizleme
 * - Maksimum boyut sınırı (LRU eviction)
 * - İstatistik takibi
 */

class MemoryCache {
    constructor(options = {}) {
        // Cache storage: Map<key, {value, expiresAt, accessedAt}>
        this.cache = new Map();
        
        // Ayarlar
        this.maxSize = options.maxSize || 1000;  // Maksimum kayıt sayısı
        this.defaultTtl = options.defaultTtl || 300;  // Varsayılan TTL: 5 dakika (saniye)
        this.cleanupInterval = options.cleanupInterval || 60000;  // Temizlik aralığı: 1 dakika
        
        // İstatistikler
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };
        
        // Otomatik temizleyici başlat
        this.startCleanup();
        
        console.log(`📦 MemoryCache başlatıldı (maxSize: ${this.maxSize}, defaultTtl: ${this.defaultTtl}s)`);
    }

    /**
     * Cache'e değer ekle
     * 
     * @param {string} key - Cache anahtarı
     * @param {any} value - Saklanacak değer
     * @param {number} ttl - TTL (saniye), varsayılan: defaultTtl
     * @returns {boolean}
     */
    set(key, value, ttl = this.defaultTtl) {
        // Boyut sınırını kontrol et
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }
        
        const expiresAt = ttl > 0 ? Date.now() + (ttl * 1000) : null;
        
        this.cache.set(key, {
            value,
            expiresAt,
            accessedAt: Date.now()
        });
        
        this.stats.sets++;
        return true;
    }

    /**
     * Cache'den değer al
     * 
     * @param {string} key - Cache anahtarı
     * @returns {any|null} - Değer veya null
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        
        // TTL kontrolü
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }
        
        // Erişim zamanını güncelle (LRU için)
        entry.accessedAt = Date.now();
        this.stats.hits++;
        
        return entry.value;
    }

    /**
     * Cache'de değer var mı kontrol et
     * 
     * @param {string} key - Cache anahtarı
     * @returns {boolean}
     */
    has(key) {
        const entry = this.cache.get(key);
        
        if (!entry) return false;
        
        // TTL kontrolü
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }

    /**
     * Cache'den değer sil
     * 
     * @param {string} key - Cache anahtarı
     * @returns {boolean}
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) this.stats.deletes++;
        return deleted;
    }

    /**
     * Pattern'e göre sil (glob-like)
     * 
     * @param {string} pattern - Pattern (örn: "search:*")
     * @returns {number} - Silinen kayıt sayısı
     */
    deletePattern(pattern) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        let count = 0;
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
            }
        }
        
        this.stats.deletes += count;
        return count;
    }

    /**
     * Tüm cache'i temizle
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.stats.deletes += size;
        console.log(`🗑️ Cache temizlendi: ${size} kayıt silindi`);
    }

    /**
     * En az kullanılan (LRU) kaydı sil
     */
    evictLRU() {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [key, entry] of this.cache) {
            if (entry.accessedAt < oldestTime) {
                oldestTime = entry.accessedAt;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.stats.evictions++;
        }
    }

    /**
     * Süresi dolmuş kayıtları temizle
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, entry] of this.cache) {
            if (entry.expiresAt && now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cache temizliği: ${cleaned} süresi dolmuş kayıt silindi`);
        }
    }

    /**
     * Otomatik temizleyici başlat
     */
    startCleanup() {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);
        
        // Process kapanınca timer'ı durdur
        if (typeof process !== 'undefined') {
            process.on('beforeExit', () => this.stopCleanup());
        }
    }

    /**
     * Otomatik temizleyiciyi durdur
     */
    stopCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * Cache istatistiklerini al
     * 
     * @returns {object}
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;
        
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            ...this.stats,
            hitRate: `${hitRate}%`
        };
    }

    /**
     * Cache veya getir (get-or-set pattern)
     * 
     * Değer varsa döndür, yoksa fonksiyonu çalıştır ve sonucu cache'le.
     * 
     * @param {string} key - Cache anahtarı
     * @param {Function} fetchFn - Değeri getiren async fonksiyon
     * @param {number} ttl - TTL (saniye)
     * @returns {Promise<any>}
     */
    async getOrSet(key, fetchFn, ttl = this.defaultTtl) {
        // Cache'de var mı?
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }
        
        // Yoksa getir ve cache'le
        const value = await fetchFn();
        this.set(key, value, ttl);
        return value;
    }
}

// Singleton instance
const searchCache = new MemoryCache({
    maxSize: 500,      // Maksimum 500 arama sonucu
    defaultTtl: 300,   // 5 dakika cache
    cleanupInterval: 60000  // Her dakika temizlik
});

// News listesi için ayrı cache
const newsListCache = new MemoryCache({
    maxSize: 100,
    defaultTtl: 120,   // 2 dakika cache
    cleanupInterval: 60000
});

module.exports = {
    MemoryCache,
    searchCache,
    newsListCache
};
