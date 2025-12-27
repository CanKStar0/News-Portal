/**
 * ===========================================
 * VERİTABANI İNDEKS OLUŞTURMA SCRIPTI
 * ===========================================
 * 
 * Bu script, MongoDB'de arama performansı için gerekli
 * indeksleri oluşturur veya günceller.
 * 
 * KULLANIM:
 * node scripts/createIndexes.js
 * 
 * ÖNEMLİ: Production'da çalıştırmadan önce yedek alın!
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config');

async function createIndexes() {
    console.log('🔧 İndeks oluşturma scripti başlatılıyor...\n');
    
    try {
        // MongoDB'ye bağlan
        console.log('📦 MongoDB\'ye bağlanılıyor...');
        await mongoose.connect(config.database.uri, config.database.options);
        console.log('✅ Bağlantı başarılı!\n');
        
        const db = mongoose.connection.db;
        const newsCollection = db.collection('news');
        
        // Mevcut indeksleri listele
        console.log('📋 Mevcut indeksler:');
        const existingIndexes = await newsCollection.indexes();
        existingIndexes.forEach(idx => {
            console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        console.log('');
        
        // Text index var mı kontrol et
        const hasTextIndex = existingIndexes.some(idx => 
            Object.values(idx.key).includes('text')
        );
        
        if (hasTextIndex) {
            console.log('⚠️  Text index zaten mevcut. Yeniden oluşturmak için önce silinmeli.');
            console.log('   Silmek için: db.news.dropIndex("text_search_index")\n');
        } else {
            console.log('📝 Text index oluşturuluyor...');
            
            // Text index oluştur
            await newsCollection.createIndex(
                {
                    title: 'text',
                    summary: 'text',
                    keywords: 'text'
                },
                {
                    weights: {
                        title: 10,     // Başlıktaki eşleşme 10 kat önemli
                        keywords: 5,   // Anahtar kelimeler 5 kat önemli
                        summary: 1     // Özet normal önemde
                    },
                    name: 'text_search_index',
                    default_language: 'turkish',
                    background: true  // Arka planda oluştur (production için)
                }
            );
            
            console.log('✅ Text index başarıyla oluşturuldu!\n');
        }
        
        // Diğer önemli indeksleri kontrol et ve oluştur
        const requiredIndexes = [
            { key: { isActive: 1, publishedAt: -1 }, name: 'active_date_idx' },
            { key: { category: 1, publishedAt: -1 }, name: 'category_date_idx' },
            { key: { source: 1, publishedAt: -1 }, name: 'source_date_idx' },
            { key: { scrapedAt: 1 }, name: 'scraped_date_idx' }
        ];
        
        for (const idx of requiredIndexes) {
            // Aynı key'e sahip index var mı kontrol et
            const existsByKey = existingIndexes.some(e => 
                JSON.stringify(e.key) === JSON.stringify(idx.key)
            );
            const existsByName = existingIndexes.some(e => e.name === idx.name);
            
            if (existsByKey || existsByName) {
                console.log(`✓ ${idx.name} (veya eşdeğeri) zaten mevcut`);
            } else {
                try {
                    console.log(`📝 ${idx.name} oluşturuluyor...`);
                    await newsCollection.createIndex(idx.key, { name: idx.name, background: true });
                    console.log(`✅ ${idx.name} oluşturuldu`);
                } catch (err) {
                    if (err.code === 85 || err.code === 86) {
                        console.log(`✓ ${idx.name} - eşdeğer index zaten mevcut`);
                    } else {
                        console.warn(`⚠️ ${idx.name} oluşturulamadı: ${err.message}`);
                    }
                }
            }
        }
        
        // Son durum
        console.log('\n📋 Güncel indeksler:');
        const finalIndexes = await newsCollection.indexes();
        finalIndexes.forEach(idx => {
            console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        
        // İndeks boyutlarını göster
        const stats = await newsCollection.stats();
        console.log(`\n📊 Koleksiyon İstatistikleri:`);
        console.log(`   Döküman sayısı: ${stats.count.toLocaleString()}`);
        console.log(`   Veri boyutu: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   İndeks boyutu: ${(stats.totalIndexSize / 1024 / 1024).toFixed(2)} MB`);
        
        console.log('\n✅ İndeks işlemleri tamamlandı!');
        
    } catch (error) {
        console.error('❌ Hata:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\n👋 Bağlantı kapatıldı.');
    }
}

createIndexes();
