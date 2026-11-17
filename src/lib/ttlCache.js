/**
 * Small in-memory TTL cache with a size cap (LRU-ish eviction of the oldest entry).
 * Keeps repeated lookups for the same city cheap and protects upstream APIs.
 */
export class TtlCache {
  /**
   * @param {{ ttlMs: number, maxEntries?: number, now?: () => number }} options
   */
  constructor({ ttlMs, maxEntries = 500, now = Date.now }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /**
   * Returns the cached value or computes, caches and returns it.
   * Concurrent callers for the same key share one in-flight promise.
   * `shouldCache(value)` can veto caching (e.g. degraded fallback results).
   */
  async getOrSet(key, producer, shouldCache = () => true) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const pending = Promise.resolve().then(producer);
    this.set(key, pending);
    try {
      const value = await pending;
      if (shouldCache(value)) this.set(key, value);
      else this.store.delete(key);
      return value;
    } catch (error) {
      this.store.delete(key);
      throw error;
    }
  }

  get size() {
    return this.store.size;
  }
}
