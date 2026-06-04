/**
 * Simple in-memory cache with TTL support
 * No external dependencies needed
 */
export class SimpleCache {
  private cache = new Map<string, { data: any; expires: number }>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private maxSize: number;

  constructor(maxSize: number = 5000) {
    this.maxSize = maxSize;
    // Clean up expired entries every minute
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.cache.entries()) {
        if (item.expires < now) this.cache.delete(key);
      }
    }, 60000);
  }
  
  get(key: string): any {
    const item = this.cache.get(key);
    if (!item || item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }
  
  set(key: string, data: any, ttlSeconds: number = 300): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      let oldestKey: string | null = null;
      let oldestExpires = Infinity;
      for (const [k, item] of this.cache.entries()) {
        if (item.expires < oldestExpires) {
          oldestExpires = item.expires;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttlSeconds * 1000)
    });
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Clean up the cache and stop the cleanup timer
   * Essential for preventing memory leaks in long-running servers
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }
}