/**
 * Pure helpers for interpreting air-quality readings.
 * India's National AQI (CPCB) bands for PM2.5 (24-h average, µg/m³) are used so
 * advice matches what families see in Indian news and apps.
 */

export const PM25_BANDS = Object.freeze([
  { max: 30, level: 'good', label: 'Good', color: '#1b7f3b', advice: 'Minimal impact.' },
  { max: 60, level: 'satisfactory', label: 'Satisfactory', color: '#5a7d1a', advice: 'Minor breathing discomfort for sensitive people.' },
  { max: 90, level: 'moderate', label: 'Moderate', color: '#8a6d00', advice: 'Discomfort for people with lung or heart disease, children and older adults.' },
  { max: 120, level: 'poor', label: 'Poor', color: '#b34700', advice: 'Breathing discomfort for most people on prolonged exposure.' },
  { max: 250, level: 'very_poor', label: 'Very Poor', color: '#b3261e', advice: 'Respiratory illness on prolonged exposure.' },
  { max: Infinity, level: 'severe', label: 'Severe', color: '#6b1d5c', advice: 'Affects healthy people; serious impact on those with existing disease.' },
]);

/**
 * Classifies a PM2.5 concentration into an Indian NAQI band.
 * @param {number|null|undefined} pm25
 */
export function classifyPm25(pm25) {
  if (typeof pm25 !== 'number' || Number.isNaN(pm25) || pm25 < 0) {
    return { level: 'unknown', label: 'Unknown', color: '#4a4a4a', advice: 'No reading available right now.' };
  }
  const band = PM25_BANDS.find((b) => pm25 <= b.max);
  return { level: band.level, label: band.label, color: band.color, advice: band.advice };
}

/**
 * Finds the cleanest consecutive window (by PM2.5) in an hourly series, starting at or after `fromIndex`.
 * Used to recommend the best time for outdoor activity.
 * @param {{ time: string[], pm2_5: (number|null)[] }} hourly
 * @param {number} windowHours
 * @param {number} fromIndex
 */
export function cleanestWindow(hourly, windowHours = 2, fromIndex = 0) {
  if (!hourly?.time?.length || !hourly?.pm2_5?.length) return null;
  let best = null;
  for (let i = Math.max(0, fromIndex); i + windowHours <= hourly.time.length; i += 1) {
    const slice = hourly.pm2_5.slice(i, i + windowHours);
    if (slice.some((v) => typeof v !== 'number')) continue;
    const avg = slice.reduce((sum, v) => sum + v, 0) / slice.length;
    if (!best || avg < best.avgPm25) {
      best = { start: hourly.time[i], end: hourly.time[i + windowHours - 1], avgPm25: Math.round(avg * 10) / 10 };
    }
  }
  return best;
}

/**
 * Same as cleanestWindow but for the dirtiest window – the time to stay in.
 */
export function worstWindow(hourly, windowHours = 2, fromIndex = 0) {
  if (!hourly?.time?.length || !hourly?.pm2_5?.length) return null;
  let worst = null;
  for (let i = Math.max(0, fromIndex); i + windowHours <= hourly.time.length; i += 1) {
    const slice = hourly.pm2_5.slice(i, i + windowHours);
    if (slice.some((v) => typeof v !== 'number')) continue;
    const avg = slice.reduce((sum, v) => sum + v, 0) / slice.length;
    if (!worst || avg > worst.avgPm25) {
      worst = { start: hourly.time[i], end: hourly.time[i + windowHours - 1], avgPm25: Math.round(avg * 10) / 10 };
    }
  }
  return worst;
}

/**
 * Rough "cigarette equivalent" (Berkeley Earth rule of thumb: 22 µg/m³ PM2.5 for 24 h ≈ 1 cigarette).
 * Makes exposure tangible for families.
 */
export function cigaretteEquivalent(pm25) {
  if (typeof pm25 !== 'number' || pm25 <= 0) return 0;
  return Math.round((pm25 / 22) * 10) / 10;
}
