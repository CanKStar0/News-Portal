/**
 * ===========================================
 * MANUEL SCRAPING SCRIPT
 * ===========================================
 * 
 * Bu script, komut satırından manuel olarak scraping yapmak için kullanılır.
 * API sunucusu çalışmadan doğrudan scraper'ları test edebilirsiniz.
 * 
 * KULLANIM:
 * node scripts/manual-scrape.js                    # Tüm kaynaklar
 * node scripts/manual-scrape.js bloomberg          # Sadece Bloomberg
 * node scripts/manual-scrape.js dunya foreks       # Dünya ve Foreks
 */

const { connectDatabase, mongoose } = require('../models');
const { scraperService } = require('../services');
const { getAvailableScrapers } = require('../scrapers');

/**
 * Ana scraping fonksiyonu
 */
async function runManualScrape() {
    console.log('\n' + '═'.repeat(60));
    console.log('║ MANUEL SCRAPING BAŞLATILIYOR');
    console.log('═'.repeat(60) + '\n');

    try {
        // Komut satırı argümanlarını al
        // process.argv: ['node', 'script.js', 'arg1', 'arg2', ...]
        const args = process.argv.slice(2);
        
        // Mevcut kaynaklar
        const available = getAvailableScrapers();
        console.log('📋 Mevcut kaynaklar:', available.join(', '));
        
        // Hangi kaynaklar scrape edilecek?
        let sources;
        if (args.length > 0) {
            // Geçerli kaynakları filtrele
            sources = args.filter(arg => available.includes(arg.toLowerCase()));
            if (sources.length === 0) {
                console.error('❌ Geçersiz kaynak adı!');
                console.log('   Kullanılabilir kaynaklar:', available.join(', '));
                process.exit(1);
            }
        } else {
            // Tüm kaynaklar
            sources = available;
        }
        
        console.log('🎯 Scrape edilecek kaynaklar:', sources.join(', '));
        console.log('');

        // Veritabanına bağlan
        console.log('📦 Veritabanına bağlanılıyor...');
        await connectDatabase();
        console.log('');

        // Scraping başlat
        const result = await scraperService.scrapeAll({ sources });

        // Sonuçları göster
        console.log('\n' + '═'.repeat(60));
        console.log('║ SONUÇLAR');
        console.log('═'.repeat(60));
        console.log(`║ Toplam çekilen: ${result.totalNews}`);
        console.log(`║ Kaydedilen: ${result.savedNews}`);
        console.log(`║ Duplicate: ${result.duplicates}`);
        console.log(`║ Hatalar: ${result.errors.length}`);
        console.log(`║ Süre: ${(result.duration / 1000).toFixed(2)} saniye`);
        console.log('═'.repeat(60) + '\n');

        // Kaynak bazlı detaylar
        if (Object.keys(result.sources).length > 0) {
            console.log('📊 Kaynak Detayları:');
            for (const [source, data] of Object.entries(result.sources)) {
                if (data.error) {
                    console.log(`   ❌ ${source}: HATA - ${data.error}`);
                } else {
                    console.log(`   ✅ ${source}: ${data.scraped} çekildi, ${data.saved} kaydedildi`);
                }
            }
        }

    } catch (error) {
        console.error('\n❌ HATA:', error.message);
        console.error(error.stack);
        
    } finally {
        // Veritabanı bağlantısını kapat
        console.log('\n👋 Bağlantı kapatılıyor...');
        await mongoose.connection.close();
        console.log('✅ Bitti.\n');
        process.exit(0);
    }
}

// Script'i çalıştır
runManualScrape();
