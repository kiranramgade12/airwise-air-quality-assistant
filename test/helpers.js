import { loadConfig } from '../src/config.js';

export const testConfig = loadConfig({ GEMINI_API_KEY: '', RATE_LIMIT_PER_MINUTE: '1000', UPSTREAM_TIMEOUT_MS: '500' });

export const silentLogger = { warn() {}, error() {}, log() {} };

export const sampleRaw = {
  current: {
    time: '2026-11-18T10:00',
    us_aqi: 210,
    pm2_5: 145.2,
    pm10: 230,
    nitrogen_dioxide: 60,
    ozone: 20,
    carbon_monoxide: 900,
    sulphur_dioxide: 12,
  },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => `2026-11-${i < 24 ? '18' : '19'}T${String(i % 24).padStart(2, '0')}:00`),
    pm2_5: Array.from({ length: 48 }, (_, i) => (i >= 13 && i <= 15 ? 60 : 180 + (i % 24))),
  },
};

export const samplePlace = { name: 'Delhi, Delhi, India', lat: 28.65, lon: 77.23 };

export const sampleProfile = {
  householdSize: 4,
  sensitiveGroups: ['children', 'asthma'],
  commute: 'car',
  cookingFuel: 'lpg',
  heating: 'coal_or_wood',
  hasAirPurifier: false,
  notes: '',
};

/** Builds a fake fetch that routes by URL host. */
export function fakeFetch({ geo, air, failAir = false } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('geocoding-api')) {
      return { ok: true, json: async () => geo ?? { results: [{ name: 'Delhi', admin1: 'Delhi', country: 'India', latitude: 28.65, longitude: 77.23 }] } };
    }
    if (failAir) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => air ?? sampleRaw };
  };
  impl.calls = calls;
  return impl;
}
