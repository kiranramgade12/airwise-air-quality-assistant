/**
 * Centralised, validated runtime configuration.
 * Secrets (GEMINI_API_KEY) are read only from the environment and never sent to the client.
 */
const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function loadConfig(env = process.env) {
  return Object.freeze({
    port: toInt(env.PORT, 8080),
    geminiApiKey: env.GEMINI_API_KEY || '',
    // Comma-separated failover chain; the first model that answers wins.
    geminiModels: (env.GEMINI_MODEL || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.7-flash')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    rateLimitPerMinute: toInt(env.RATE_LIMIT_PER_MINUTE, 30),
    airCacheTtlMs: toInt(env.AIR_CACHE_TTL_MS, 10 * 60 * 1000),
    geoCacheTtlMs: toInt(env.GEO_CACHE_TTL_MS, 24 * 60 * 60 * 1000),
    adviceCacheTtlMs: toInt(env.ADVICE_CACHE_TTL_MS, 15 * 60 * 1000),
    upstreamTimeoutMs: toInt(env.UPSTREAM_TIMEOUT_MS, 8000),
    geminiTimeoutMs: toInt(env.GEMINI_TIMEOUT_MS, 15000),
    isProduction: env.NODE_ENV === 'production',
  });
}
