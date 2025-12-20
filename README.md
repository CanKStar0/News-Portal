# 📰 Haber Scraper - Web Kazıma Projesi

Node.js tabanlı haber scraping sistemi. Türkiye'deki finans ve ekonomi haber sitelerinden otomatik haber toplama, depolama ve API ile sunma.

## 🎯 Proje Amacı

Bu proje, kullanıcının seçtiği kategori (finans, teknoloji, spor vb.) ve anahtar kelime (bitcoin, dolar, enflasyon vb.) üzerinden haber sitelerini tarayarak haberleri toplayan bir sistemdir. API kullanmadan, tamamen web scraping yöntemiyle çalışır.

## 🏗️ Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                      HABER SCRAPER                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  SCRAPERS   │───▶│   SERVICE    │───▶│   MONGODB     │  │
│  │             │    │   (İş Mantığı)│    │  (Veritabanı) │  │
│  │ Bloomberg   │    └──────────────┘    └───────────────┘  │
│  │ Dünya       │           │                    ▲          │
│  │ Foreks      │           │                    │          │
│  └─────────────┘           ▼                    │          │
│                    ┌──────────────┐              │          │
│                    │ EXPRESS API  │──────────────┘          │
│                    │  /api/news   │                         │
│                    └──────────────┘                         │
│                           ▲                                 │
│                           │                                 │
│                    ┌──────────────┐                         │
│                    │  CRON JOBS   │                         │
│                    │ (Zamanlayıcı)│                         │
│                    └──────────────┘                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Klasör Yapısı

```
haber-scraper/
├── config/                 # Uygulama ayarları
│   └── index.js           # Merkezi konfigürasyon
│
├── models/                 # Veritabanı modelleri
│   ├── database.js        # MongoDB bağlantı yönetimi
│   ├── News.js            # Haber şeması
│   └── index.js           # Model exports
│
├── scrapers/              # Web scraping modülleri
│   ├── base/
│   │   └── BaseScraper.js # Temel scraper sınıfı
│   ├── sites/
│   │   ├── BloombergScraper.js
│   │   ├── DunyaScraper.js
│   │   └── ForeksScraper.js
│   └── index.js
│
├── services/              # İş mantığı katmanı
│   ├── ScraperService.js  # Scraping orkestrasyon
│   └── index.js
│
├── routes/                # API endpoint'leri
│   ├── news.js            # Haber route'ları
│   └── index.js
│
├── middleware/            # Express middleware'leri
│   ├── errorHandler.js    # Hata yakalama
│   └── index.js
│
├── jobs/                  # Zamanlı görevler
│   ├── cronManager.js     # Cron job yönetimi
│   └── index.js
│
├── utils/                 # Yardımcı fonksiyonlar
│   ├── helpers.js         # Genel yardımcılar
│   └── index.js
│
├── scripts/               # Yardımcı scriptler
│   └── manual-scrape.js   # Manuel scraping
│
├── .env                   # Ortam değişkenleri
├── .gitignore             # Git ignore listesi
├── package.json           # Proje bağımlılıkları
├── app.js                 # Ana uygulama
└── README.md              # Bu dosya
```

## 🚀 Kurulum

### Gereksinimler

- Node.js >= 18.0.0
- MongoDB >= 6.0
- npm veya yarn

### Adımlar

1. **Projeyi klonlayın**
   ```bash
   cd "Haber Web"
   ```

2. **Bağımlılıkları yükleyin**
   ```bash
   npm install
   ```

3. **Playwright tarayıcılarını yükleyin**
   ```bash
   npx playwright install chromium
   ```

4. **Ortam değişkenlerini ayarlayın**
   `.env` dosyasını düzenleyin:
   ```env
   PORT=3000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/haber_db
   SCRAPE_INTERVAL_MINUTES=30
   ```

5. **MongoDB'yi başlatın**
   ```bash
   # Yerel MongoDB
   mongod
   
   # veya MongoDB Atlas kullanın
   ```

6. **Uygulamayı başlatın**
   ```bash
   # Production
   npm start
   
   # Development (nodemon ile)
   npm run dev
   ```

## 📡 API Kullanımı

### Endpoint'ler

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| GET | `/api/news/search` | Haber arama |
| GET | `/api/news/latest` | Son haberler |
| GET | `/api/news/categories` | Kategori listesi |
| GET | `/api/news/sources` | Kaynak listesi |
| GET | `/api/news/stats/summary` | İstatistikler |
| GET | `/api/news/:id` | Tek haber detayı |
| POST | `/api/news/scrape` | Manuel scraping tetikle |
| DELETE | `/api/news/cleanup` | Eski haberleri temizle |

### Örnek İstekler

**Haber Arama:**
```bash
curl "http://localhost:3000/api/news/search?keyword=bitcoin&category=finans&limit=10"
```

**Son Haberler:**
```bash
curl "http://localhost:3000/api/news/latest?limit=5"
```

**Kategori ve Kaynak Filtresi:**
```bash
curl "http://localhost:3000/api/news/search?category=ekonomi&source=bloomberg"
```

**Manuel Scraping:**
```bash
curl -X POST "http://localhost:3000/api/news/scrape" \
  -H "Content-Type: application/json" \
  -d '{"source": "bloomberg"}'
```

### Response Formatı

```json
{
  "success": true,
  "data": {
    "news": [
      {
        "_id": "...",
        "title": "Bitcoin yeni zirve yaptı",
        "summary": "Kripto para piyasasında...",
        "url": "https://...",
        "imageUrl": "https://...",
        "category": "finans",
        "source": "bloomberg",
        "keywords": ["bitcoin", "kripto", "piyasa"],
        "publishedAt": "2024-12-20T10:30:00.000Z",
        "scrapedAt": "2024-12-20T11:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

## 🔧 Manuel Scraping

API sunucusu çalışmadan doğrudan scraping yapmak için:

```bash
# Tüm kaynakları scrape et
npm run scrape

# Belirli kaynakları scrape et
node scripts/manual-scrape.js bloomberg
node scripts/manual-scrape.js dunya foreks
```

## ⏰ Zamanlı Görevler (Cron Jobs)

| Job | Zamanlama | Açıklama |
|-----|-----------|----------|
| Scraping | Her 30 dakika | Tüm kaynakları scrape et |
| Cleanup | Her gün 03:00 | 30 günden eski haberleri deaktive et |
| Health Check | Her saat | Sistem durumunu logla |

## 🛠️ Yeni Scraper Ekleme

1. `scrapers/sites/` altında yeni dosya oluşturun:
   ```javascript
   const BaseScraper = require('../base/BaseScraper');
   
   class YeniSiteScraper extends BaseScraper {
       constructor() {
           super({
               name: 'YeniSite',
               baseUrl: 'https://yenisite.com',
               source: 'yenisite',
               category: 'genel'
           });
       }
       
       async parseNewsItems($) {
           // Site-spesifik parse mantığı
       }
   }
   
   module.exports = YeniSiteScraper;
   ```

2. `scrapers/index.js`'e ekleyin
3. `config/index.js`'teki sources'a ekleyin

## 🔒 Güvenlik Önlemleri

- **Rate Limiting:** İstekler arası rastgele gecikme
- **User-Agent:** Gerçekçi tarayıcı kimliği
- **Headless Browser:** Görünmez mod
- **Request Blocking:** Gereksiz kaynakları engelleme (resim, font)
- **Retry Mechanism:** Başarısız istekleri tekrar deneme

## 📊 Veritabanı Şeması

```javascript
{
  title: String,        // Haber başlığı (zorunlu)
  summary: String,      // Özet
  content: String,      // Tam içerik
  url: String,          // Orijinal URL (unique)
  imageUrl: String,     // Görsel URL
  category: String,     // Kategori (enum)
  source: String,       // Kaynak site
  keywords: [String],   // Anahtar kelimeler
  author: String,       // Yazar
  publishedAt: Date,    // Yayın tarihi (zorunlu)
  scrapedAt: Date,      // Çekilme tarihi
  isActive: Boolean,    // Aktif mi?
  createdAt: Date,      // Oluşturulma
  updatedAt: Date       // Güncelleme
}
```

## 🐛 Sorun Giderme

### Playwright Hataları
```bash
# Tarayıcıları yeniden yükleyin
npx playwright install chromium --force
```

### MongoDB Bağlantı Hatası
```bash
# MongoDB servisini kontrol edin
mongod --version
# Veya MongoDB Compass ile bağlantıyı test edin
```

### Scraping Başarısız
- Site HTML yapısı değişmiş olabilir
- F12 ile siteyi inceleyip selector'ları güncelleyin
- Rate limiting'e takılmış olabilirsiniz

## 📝 Lisans

MIT License

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'feat: Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request açın
