const Redis = require('ioredis');
const config = require('../config');

let client = null;

function createClient() {
    if (client) return client;

    const url = config.redis.url || process.env.REDIS_URL;
    if (!url) {
        console.warn('REDIS_URL yok - redis cache devre disi');
        return null;
    }

    client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true
    });

    client.on('error', (err) => console.error('Redis error:', err));
    client.on('connect', () => console.log('Redis baglantisi saglandi'));

    return client;
}

function getClient() {
    return client || createClient();
}

async function get(key) {
    const c = getClient();
    if (!c) return null;
    const val = await c.get(key);
    return val ? JSON.parse(val) : null;
}

async function set(key, value, ttlSeconds = config.redis.defaultTtl) {
    const c = getClient();
    if (!c) return false;
    const s = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
        await c.setex(key, ttlSeconds, s);
    } else {
        await c.set(key, s);
    }
    return true;
}

module.exports = {
    createClient,
    getClient,
    get,
    set
};
