/**
 * ===========================================
 * CRON JOB YÖNETİCİSİ
 * ===========================================
 * 
 * Bu dosya, zamanlanmış görevleri (scheduled tasks) yönetir.
 * Belirli aralıklarla scraper'ları otomatik çalıştırır.
 * 
 * NODE-CRON NEDİR?
 * node-cron, cron syntax'ı kullanarak zamanlanmış görevler oluşturmamızı sağlar.
 * Linux/Unix sistemlerdeki crontab'a benzer çalışır.
 * 
 * CRON SYNTAX:
 * ┌───────────── saniye (0-59, opsiyonel)
 * │ ┌───────────── dakika (0-59)
 * │ │ ┌───────────── saat (0-23)
 * │ │ │ ┌───────────── gün (1-31)
 * │ │ │ │ ┌───────────── ay (1-12)
 * │ │ │ │ │ ┌───────────── haftanın günü (0-6, 0=Pazar)
 * │ │ │ │ │ │
 * * * * * * *
 * 
 * ÖRNEKLER:
 * '* * * * *'      -> Her dakika
 * '*\/30 * * * *'   -> Her 30 dakikada
 * '0 * * * *'      -> Her saat başı
 * '0 9 * * *'      -> Her gün saat 09:00'da
 * '0 9 * * 1'      -> Her Pazartesi 09:00'da
 * '0 0 1 * *'      -> Her ayın 1'i gece yarısı
 */

const cron = require('node-cron');
const { scraperService } = require('../services');
const config = require('../config');

class CronJobManager {
    constructor() {
        // Aktif job'ları sakla
        this.jobs = new Map();
        
        // Job çalışma sayaçları
        this.executionCounts = new Map();
    }

    /**
     * Tüm zamanlanmış görevleri başlat
     * 
     * Bu metod uygulama başladığında çağrılır.
     * Tüm cron job'ları tanımlar ve başlatır.
     */
    initializeJobs() {
        console.log('\n⏰ Cron Job Yöneticisi başlatılıyor...\n');

        // 1. Ana scraping job'ı
        this.createScrapingJob();

        // 2. Temizlik job'ı
        this.createCleanupJob();

        // 3. Sağlık kontrolü job'ı
        this.createHealthCheckJob();

        console.log(`✅ ${this.jobs.size} adet cron job aktif\n`);
        
        // Aktif job'ları listele
        this.listJobs();
    }

    /**
     * Ana Scraping Job
     * 
     * Belirli aralıklarla tüm kaynakları scrape eder.
     * Varsayılan: Her 10 dakikada bir
     */
    createScrapingJob() {
        const intervalMinutes = config.scraper.intervalMinutes || 10;
        
        /**
         * Cron expression oluştur
         * 
         * Her X dakikada bir: *\/X * * * *
         * Örnek: *\/30 * * * * = Her 30 dakikada
         * 
         * NOT: JavaScript string'inde \/ olarak yazılmalı
         */
        const cronExpression = `*/${intervalMinutes} * * * *`;
        
        console.log(`📌 Scraping Job: Her ${intervalMinutes} dakikada bir`);
        console.log(`   Cron: ${cronExpression}`);

        /**
         * cron.schedule() parametreleri:
         * 
         * 1. Cron expression (string)
         * 2. Callback fonksiyon (çalıştırılacak kod)
         * 3. Options objesi:
         *    - scheduled: true ise hemen başlar
         *    - timezone: Saat dilimi
         */
        const job = cron.schedule(cronExpression, async () => {
            console.log('\n' + '⏰'.repeat(30));
            console.log(`📡 ZAMANLANMIŞ SCRAPING BAŞLIYOR`);
            console.log(`⏰ ${new Date().toLocaleString('tr-TR')}`);
            console.log('⏰'.repeat(30) + '\n');

            try {
                // Execution sayacını artır
                const count = (this.executionCounts.get('scraping') || 0) + 1;
                this.executionCounts.set('scraping', count);

                // Scraping'i başlat
                const result = await scraperService.scrapeAll();

                console.log(`\n✅ Zamanlanmış scraping #${count} tamamlandı`);
                console.log(`   Toplam: ${result.totalNews}, Kaydedilen: ${result.savedNews}`);

            } catch (error) {
                console.error('❌ Zamanlanmış scraping hatası:', error.message);
            }
        }, {
            scheduled: true,
            timezone: 'Europe/Istanbul'  // Türkiye saat dilimi
        });

        // Job'ı kaydet
        this.jobs.set('scraping', {
            job,
            name: 'Otomatik Scraping',
            schedule: `Her ${intervalMinutes} dakika`,
            cronExpression
        });
    }

    /**
     * Temizlik Job
     * 
     * Eski haberleri temizler/deaktive eder.
     * Varsayılan: Her gün gece 03:00'da
     */
    createCleanupJob() {
        // Her gün saat 03:00'da çalış
        const cronExpression = '0 3 * * *';
        
        console.log(`📌 Cleanup Job: Her gün 03:00'da`);
        console.log(`   Cron: ${cronExpression}`);

        const job = cron.schedule(cronExpression, async () => {
            console.log('\n🧹 ZAMANLANMIŞ TEMİZLİK BAŞLIYOR\n');

            try {
                // 30 günden eski haberleri deaktive et
                const count = await scraperService.cleanupOldNews(30, false);
                console.log(`✅ ${count} eski haber deaktive edildi`);

            } catch (error) {
                console.error('❌ Temizlik hatası:', error.message);
            }
        }, {
            scheduled: true,
            timezone: 'Europe/Istanbul'
        });

        this.jobs.set('cleanup', {
            job,
            name: 'Veritabanı Temizliği',
            schedule: 'Her gün 03:00',
            cronExpression
        });
    }

    /**
     * Sağlık Kontrolü Job
     * 
     * Sistem durumunu kontrol eder ve loglar.
     * Varsayılan: Her saat başı
     */
    createHealthCheckJob() {
        // Her saat başı çalış
        const cronExpression = '0 * * * *';
        
        console.log(`📌 Health Check Job: Her saat başı`);
        console.log(`   Cron: ${cronExpression}`);

        const job = cron.schedule(cronExpression, async () => {
            try {
                const stats = await scraperService.getStats();
                
                console.log('\n💓 SAĞLIK KONTROLÜ');
                console.log(`   Veritabanı: ${stats.database.totalNews} haber`);
                console.log(`   Bugün: ${stats.database.todayNews} yeni haber`);
                console.log(`   Son çalışma: ${stats.service.lastRun?.toLocaleString('tr-TR') || 'Henüz yok'}`);
                
            } catch (error) {
                console.error('❌ Sağlık kontrolü hatası:', error.message);
            }
        }, {
            scheduled: true,
            timezone: 'Europe/Istanbul'
        });

        this.jobs.set('healthcheck', {
            job,
            name: 'Sağlık Kontrolü',
            schedule: 'Her saat',
            cronExpression
        });
    }

    /**
     * Belirli bir job'ı durdur
     * 
     * @param {string} jobName - Job adı
     */
    stopJob(jobName) {
        const jobInfo = this.jobs.get(jobName);
        
        if (jobInfo) {
            jobInfo.job.stop();
            console.log(`⏹️ ${jobInfo.name} durduruldu`);
        } else {
            console.warn(`⚠️ Job bulunamadı: ${jobName}`);
        }
    }

    /**
     * Belirli bir job'ı başlat
     * 
     * @param {string} jobName - Job adı
     */
    startJob(jobName) {
        const jobInfo = this.jobs.get(jobName);
        
        if (jobInfo) {
            jobInfo.job.start();
            console.log(`▶️ ${jobInfo.name} başlatıldı`);
        } else {
            console.warn(`⚠️ Job bulunamadı: ${jobName}`);
        }
    }

    /**
     * Tüm job'ları durdur
     */
    stopAllJobs() {
        console.log('\n⏹️ Tüm cron job\'lar durduruluyor...');
        
        for (const [name, info] of this.jobs) {
            info.job.stop();
            console.log(`   ⏹️ ${info.name} durduruldu`);
        }
    }

    /**
     * Aktif job'ları listele
     */
    listJobs() {
        console.log('\n📋 AKTİF CRON JOB\'LAR:');
        console.log('─'.repeat(50));
        
        for (const [key, info] of this.jobs) {
            console.log(`   📌 ${info.name}`);
            console.log(`      Zamanlama: ${info.schedule}`);
            console.log(`      Cron: ${info.cronExpression}`);
            console.log('');
        }
    }

    /**
     * Job istatistiklerini al
     * 
     * @returns {object} - İstatistikler
     */
    getStats() {
        const stats = {};
        
        for (const [key, info] of this.jobs) {
            stats[key] = {
                name: info.name,
                schedule: info.schedule,
                executionCount: this.executionCounts.get(key) || 0
            };
        }
        
        return stats;
    }

    /**
     * Job'ı hemen çalıştır (test için)
     * 
     * Zamanlamayı beklemeden job'ı manuel tetikler.
     * 
     * @param {string} jobName - Job adı
     */
    async triggerJob(jobName) {
        console.log(`\n🔧 ${jobName} manuel tetikleniyor...`);
        
        switch (jobName) {
            case 'scraping':
                return await scraperService.scrapeAll();
            case 'cleanup':
                return await scraperService.cleanupOldNews(30, false);
            case 'healthcheck':
                return await scraperService.getStats();
            default:
                console.warn(`⚠️ Bilinmeyen job: ${jobName}`);
                return null;
        }
    }
}

// Singleton instance
const cronManager = new CronJobManager();

module.exports = cronManager;
