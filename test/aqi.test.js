import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPm25, cleanestWindow, worstWindow, cigaretteEquivalent } from '../src/lib/aqi.js';

test('classifyPm25 maps values to Indian NAQI bands', () => {
  assert.equal(classifyPm25(12).level, 'good');
  assert.equal(classifyPm25(30).level, 'good');
  assert.equal(classifyPm25(45).level, 'satisfactory');
  assert.equal(classifyPm25(75).level, 'moderate');
  assert.equal(classifyPm25(100).level, 'poor');
  assert.equal(classifyPm25(200).level, 'very_poor');
  assert.equal(classifyPm25(400).level, 'severe');
});

test('classifyPm25 handles missing or invalid readings', () => {
  for (const value of [null, undefined, Number.NaN, -5, '50']) {
    assert.equal(classifyPm25(value).level, 'unknown');
  }
});

test('cleanestWindow and worstWindow find the right hours', () => {
  const hourly = {
    time: ['T00', 'T01', 'T02', 'T03', 'T04', 'T05'],
    pm2_5: [200, 180, 50, 40, 150, 300],
  };
  assert.deepEqual(cleanestWindow(hourly, 2), { start: 'T02', end: 'T03', avgPm25: 45 });
  assert.deepEqual(worstWindow(hourly, 2), { start: 'T04', end: 'T05', avgPm25: 225 });
});

test('window helpers skip gaps and handle empty input', () => {
  assert.equal(cleanestWindow({ time: [], pm2_5: [] }), null);
  assert.equal(cleanestWindow(undefined), null);
  const withGap = { time: ['a', 'b', 'c'], pm2_5: [10, null, 20] };
  assert.equal(cleanestWindow(withGap, 2), null);
});

test('cigaretteEquivalent uses the 22 µg/m³ rule of thumb', () => {
  assert.equal(cigaretteEquivalent(22), 1);
  assert.equal(cigaretteEquivalent(220), 10);
  assert.equal(cigaretteEquivalent(0), 0);
  assert.equal(cigaretteEquivalent(null), 0);
});
