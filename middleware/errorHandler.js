/**
 * ===========================================
 * HATA YAKALAMA MİDDLEWARE'İ
 * ===========================================
 * 
 * MİDDLEWARE NEDİR?
 * Express'te middleware, request ve response arasında çalışan fonksiyonlardır.
 * Request'i modifiye edebilir, response gönderebilir veya bir sonraki middleware'e geçebilir.
 * 
 * next() fonksiyonu bir sonraki middleware'i çağırır.
 * next(error) hata middleware'ini çağırır.
 * 
 * Bu dosya, tüm uygulamada oluşan hataları merkezi olarak yakalar ve işler.
 */

/**
 * 404 Not Found Middleware
 * 
 * Hiçbir route eşleşmediğinde bu middleware çalışır.
 * Route tanımlamalarından SONRA eklenmeli!
 * 
 * @param {Request} req - Express request objesi
 * @param {Response} res - Express response objesi
 * @param {Function} next - Sonraki middleware
 */
function notFoundHandler(req, res, next) {
    const error = new Error(`Bulunamadı: ${req.originalUrl}`);
    error.status = 404;
    
    // Hatayı error handler'a ilet
    next(error);
}

/**
 * Genel Hata Middleware
 * 
 * Uygulamada oluşan tüm hataları yakalar.
 * 4 parametre alır - bu, Express'e bunun error handler olduğunu söyler.
 * 
 * ÖNEMLI: 4 parametre (err, req, res, next) olmalı!
 * Express bu şekilde error handler'ı tanır.
 * 
 * @param {Error} err - Hata objesi
 * @param {Request} req - Express request objesi
 * @param {Response} res - Express response objesi
 * @param {Function} next - Sonraki middleware (genelde kullanılmaz)
 */
function errorHandler(err, req, res, next) {
    // HTTP durum kodu - varsayılan 500 (Internal Server Error)
    const statusCode = err.status || err.statusCode || 500;
    
    // Hata mesajı
    const message = err.message || 'Beklenmeyen bir hata oluştu';
    
    // Development modunda detaylı hata bilgisi
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // Hatayı logla
    console.error('\n❌ HATA:', {
        message,
        status: statusCode,
        path: req.path,
        method: req.method,
        stack: isDevelopment ? err.stack : undefined
    });
    
    // JSON response gönder
    res.status(statusCode).json({
        success: false,
        error: {
            message,
            status: statusCode,
            // Development'ta stack trace göster
            ...(isDevelopment && { 
                stack: err.stack,
                details: err.details 
            })
        }
    });
}

/**
 * Async Handler Wrapper
 * 
 * async/await kullanan route handler'larını try/catch ile sarmalar.
 * Bu sayede her route'ta try/catch yazmaya gerek kalmaz.
 * 
 * PROBLEM:
 * app.get('/api/news', async (req, res) => {
 *     const news = await News.find(); // Hata fırlatabilir
 *     res.json(news);
 * });
 * // Hata yakalanmaz! Express async hataları yakalamaz.
 * 
 * ÇÖZÜM:
 * app.get('/api/news', asyncHandler(async (req, res) => {
 *     const news = await News.find();
 *     res.json(news);
 * }));
 * // Hata otomatik olarak error handler'a iletilir.
 * 
 * @param {Function} fn - Async route handler
 * @returns {Function} - Wrapped handler
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        // Promise.resolve ile sarmalıyoruz ki
        // fn() sync hata fırlatsa bile yakalansın
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Validation Error Handler
 * 
 * Mongoose validation hatalarını kullanıcı dostu formata çevirir.
 * 
 * @param {Error} err - Mongoose validation error
 * @returns {object} - Formatlanmış hata objesi
 */
function formatValidationError(err) {
    if (err.name !== 'ValidationError') {
        return null;
    }
    
    const errors = {};
    
    // Her alan için hata mesajını çıkar
    for (const field in err.errors) {
        errors[field] = err.errors[field].message;
    }
    
    return {
        message: 'Validation hatası',
        status: 400,
        details: errors
    };
}

module.exports = {
    notFoundHandler,
    errorHandler,
    asyncHandler,
    formatValidationError
};
