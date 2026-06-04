"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleCache = void 0;
class SimpleCache {
    constructor(maxSize = 5000) {
        this.cache = new Map();
        this.cleanupTimer = null;
        this.maxSize = maxSize;
        this.cleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [key, item] of this.cache.entries()) {
                if (item.expires < now)
                    this.cache.delete(key);
            }
        }, 60000);
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item || item.expires < Date.now()) {
            this.cache.delete(key);
            return null;
        }
        return item.data;
    }
    set(key, data, ttlSeconds = 300) {
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            let oldestKey = null;
            let oldestExpires = Infinity;
            for (const [k, item] of this.cache.entries()) {
                if (item.expires < oldestExpires) {
                    oldestExpires = item.expires;
                    oldestKey = k;
                }
            }
            if (oldestKey !== null)
                this.cache.delete(oldestKey);
        }
        this.cache.set(key, {
            data,
            expires: Date.now() + (ttlSeconds * 1000)
        });
    }
    clear() {
        this.cache.clear();
    }
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.cache.clear();
    }
}
exports.SimpleCache = SimpleCache;
//# sourceMappingURL=simple-cache.js.map