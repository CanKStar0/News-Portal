/**
 * ===========================================
 * MONGODB BAĞLANTI YÖNETİCİSİ
 * ===========================================
 * 
 * Bu dosya MongoDB veritabanına bağlantıyı yönetir.
 * Mongoose kullanarak bağlantı açar, hata durumlarını yönetir
 * ve bağlantı olaylarını loglar.
 * 
 * MONGOOSE NEDİR?
 * Mongoose, MongoDB için bir ODM (Object Document Mapper) kütüphanesidir.
 * JavaScript objelerini MongoDB dökümanlarına dönüştürür ve tersini yapar.
 * Şema tanımlama, validasyon, middleware gibi özellikler sunar.
 */

const mongoose = require('mongoose');
const config = require('../config');

/**
 * MongoDB'ye bağlanma fonksiyonu
 * 
 * async/await AÇIKLAMASI:
 * - async: Bu fonksiyonun asenkron olduğunu belirtir
 * - await: Asenkron işlemin tamamlanmasını bekler
 * - Veritabanı bağlantısı zaman alan bir işlem olduğu için async kullanıyoruz
 * 
 * @returns {Promise<void>} - Bağlantı başarılı olursa resolve olur
 * @throws {Error} - Bağlantı başarısız olursa hata fırlatır
 */
async function connectDatabase() {
    try {
        // mongoose.connect() MongoDB'ye bağlantı kurar
        // İlk parametre: Bağlantı URI'si (mongodb://host:port/database)
        // İkinci parametre: Bağlantı seçenekleri (opsiyonel)
        await mongoose.connect(config.database.uri, config.database.options);
        
        console.log('✅ MongoDB bağlantısı başarılı!');
        console.log(`📍 Veritabanı: ${mongoose.connection.name}`);
        
    } catch (error) {
        // Bağlantı hatası durumunda detaylı hata mesajı
        console.error('❌ MongoDB bağlantı hatası:', error.message);
        
        // process.exit(1): Uygulamayı hata koduyla sonlandırır
        // Veritabanı olmadan uygulama çalışamayacağı için
        // bağlantı hatasında uygulamayı durdurmak mantıklı
        process.exit(1);
    }
}

/**
 * MONGOOSE BAĞLANTI OLAYLARI (Events)
 * 
 * Mongoose, bağlantı durumu değişikliklerini event'ler ile bildirir.
 * Bu event'leri dinleyerek bağlantı sorunlarını takip edebiliriz.
 */

// Bağlantı kesildiğinde
mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB bağlantısı kesildi');
});

// Bağlantı yeniden kurulduğunda
mongoose.connection.on('reconnected', () => {
    console.log('🔄 MongoDB bağlantısı yeniden kuruldu');
});

// Hata oluştuğunda
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB hatası:', err);
});

/**
 * Graceful Shutdown - Düzgün Kapanış
 * 
 * Uygulama kapanırken (Ctrl+C vs.) veritabanı bağlantısını
 * düzgün şekilde kapatmak önemlidir. Bu, veri kaybını önler
 * ve kaynakları serbest bırakır.
 */
process.on('SIGINT', async () => {
    try {
        // Tüm bağlantıları kapat
        await mongoose.connection.close();
        console.log('👋 MongoDB bağlantısı kapatıldı (uygulama kapanıyor)');
        process.exit(0);
    } catch (error) {
        console.error('❌ Bağlantı kapatma hatası:', error);
        process.exit(1);
    }
});

// Fonksiyonu ve mongoose instance'ını dışa aktar
module.exports = {
    connectDatabase,
    mongoose
};
