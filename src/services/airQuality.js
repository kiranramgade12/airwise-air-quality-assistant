import { TtlCache } from '../lib/ttlCache.js';
import { classifyPm25, cleanestWindow, worstWindow, cigaretteEquivalent } from '../lib/aqi.js';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

async function fetchJson(fetchImpl, url, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw error;
    throw new UpstreamError('Network error reaching the air-quality provider');
  }
  if (!response.ok) throw new UpstreamError(`Upstream responded with ${response.status}`);
  return response.json();
}

/**
 * Air-quality data service backed by the free, key-less Open-Meteo APIs (CAMS model data).
 */
export function createAirQualityService({ config, fetchImpl = globalThis.fetch }) {
  const geoCache = new TtlCache({ ttlMs: config.geoCacheTtlMs });
  const airCache = new TtlCache({ ttlMs: config.airCacheTtlMs });

  async function geocode(city) {
    const key = city.toLowerCase();
    return geoCache.getOrSet(key, async () => {
      const url = `${GEOCODE_URL}?${new URLSearchParams({ name: city, count: '1', language: 'en', format: 'json' })}`;
      const data = await fetchJson(fetchImpl, url, config.upstreamTimeoutMs);
      const hit = data?.results?.[0];
      if (!hit) throw new UpstreamError(`Could not find a place called "${city}".`, 404);
      return {
        name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
        lat: hit.latitude,
        lon: hit.longitude,
        timezone: hit.timezone,
      };
    });
  }

  async function resolveLocation({ city, lat, lon }) {
    if (typeof lat === 'number' && typeof lon === 'number') {
      return { name: city || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon };
    }
    return geocode(city);
  }

  async function getAirQuality(location) {
    const place = await resolveLocation(location);
    const key = `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`;
    const raw = await airCache.getOrSet(key, () => {
      const params = new URLSearchParams({
        latitude: String(place.lat),
        longitude: String(place.lon),
        current: 'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide',
        hourly: 'pm2_5,us_aqi',
        forecast_days: '2',
        timezone: 'auto',
      });
      return fetchJson(fetchImpl, `${AIR_URL}?${params}`, config.upstreamTimeoutMs);
    });
    return summarise(place, raw);
  }

  return { getAirQuality, resolveLocation };
}

/** Converts the raw Open-Meteo payload into the compact shape the app and the model use. */
export function summarise(place, raw) {
  const current = raw?.current ?? {};
  const hourly = raw?.hourly ?? { time: [], pm2_5: [] };
  const nowIndex = Math.max(
    0,
    hourly.time.findIndex((t) => t >= (current.time ?? '')),
  );
  const next24 = {
    time: hourly.time.slice(nowIndex, nowIndex + 24),
    pm2_5: hourly.pm2_5.slice(nowIndex, nowIndex + 24),
  };
  const pm25 = typeof current.pm2_5 === 'number' ? Math.round(current.pm2_5 * 10) / 10 : null;
  return {
    place,
    observedAt: current.time ?? null,
    category: classifyPm25(pm25),
    pollutants: {
      pm2_5: pm25,
      pm10: current.pm10 ?? null,
      no2: current.nitrogen_dioxide ?? null,
      o3: current.ozone ?? null,
      co: current.carbon_monoxide ?? null,
      so2: current.sulphur_dioxide ?? null,
      usAqi: current.us_aqi ?? null,
    },
    cigarettesPerDay: cigaretteEquivalent(pm25),
    bestOutdoorWindow: cleanestWindow(next24, 2),
    worstWindow: worstWindow(next24, 2),
    forecast: next24,
    source: 'Open-Meteo Air Quality API (CAMS)',
  };
}
