import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAirQualityService } from '../src/services/airQuality.js';
import { createAdvisor } from '../src/services/gemini.js';
import { loadConfig } from '../src/config.js';
import { testConfig, silentLogger, fakeFetch } from './helpers.js';

function buildApp({ config = testConfig, fetchImpl = fakeFetch() } = {}) {
  const airService = createAirQualityService({ config, fetchImpl });
  const advisor = createAdvisor({ config, logger: silentLogger });
  return createApp({ config, airService, advisor, logger: silentLogger });
}

test('GET /healthz reports status', async () => {
  const res = await request(buildApp()).get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok', ai: false });
});

test('serves the accessible front-end with security headers', async () => {
  const res = await request(buildApp()).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /<html lang="en">/);
  assert.match(res.text, /Skip to main content/);
  assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('GET /api/air returns classified air quality', async () => {
  const res = await request(buildApp()).get('/api/air').query({ city: 'Delhi' });
  assert.equal(res.status, 200);
  assert.equal(res.body.category.label, 'Very Poor');
  assert.equal(res.body.forecast.pm2_5.length, 24);
});

test('GET /api/air validates input', async () => {
  const res = await request(buildApp()).get('/api/air');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /city name or both latitude and longitude/);
});

test('POST /api/advice returns air data and a plan with impacts', async () => {
  const res = await request(buildApp())
    .post('/api/advice')
    .send({ location: { city: 'Delhi' }, profile: { commute: 'car', sensitiveGroups: ['children'] } });
  assert.equal(res.status, 200);
  assert.equal(res.body.air.place.name, 'Delhi, Delhi, India');
  assert.ok(res.body.advice.routine.length > 0);
  assert.ok(res.body.advice.routine.every((r) => r.impact));
});

test('POST /api/advice rejects invalid enums and oversized bodies', async () => {
  const app = buildApp();
  const bad = await request(app).post('/api/advice').send({ location: { city: 'Delhi' }, profile: { commute: 'rocket' } });
  assert.equal(bad.status, 400);

  const huge = await request(app)
    .post('/api/advice')
    .set('content-type', 'application/json')
    .send(JSON.stringify({ location: { city: 'x'.repeat(20000) } }));
  assert.equal(huge.status, 413);

  const malformed = await request(app).post('/api/advice').set('content-type', 'application/json').send('{bad');
  assert.equal(malformed.status, 400);
});

test('POST /api/advice maps upstream errors to friendly messages', async () => {
  const notFound = await request(buildApp({ fetchImpl: fakeFetch({ geo: { results: [] } }) }))
    .post('/api/advice')
    .send({ location: { city: 'Atlantis' } });
  assert.equal(notFound.status, 404);
  assert.match(notFound.body.error, /Atlantis/);

  const down = await request(buildApp({ fetchImpl: fakeFetch({ failAir: true }) }))
    .post('/api/advice')
    .send({ location: { city: 'Delhi' } });
  assert.equal(down.status, 502);
  assert.doesNotMatch(down.body.error, /503/);
});

test('network failures and timeouts return 502/504, never 500', async () => {
  const networkDown = async () => { throw new TypeError('fetch failed'); };
  const res = await request(buildApp({ fetchImpl: networkDown })).get('/api/air').query({ city: 'Pune' });
  assert.equal(res.status, 502);

  const timeout = async () => { throw new DOMException('timed out', 'TimeoutError'); };
  const slow = await request(buildApp({ fetchImpl: timeout })).get('/api/air').query({ city: 'Pune' });
  assert.equal(slow.status, 504);
});

test('POST /api/chat answers questions and validates length', async () => {
  const app = buildApp();
  const ok = await request(app).post('/api/chat').send({ question: 'Can I go jogging?', location: { city: 'Delhi' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.answer.length > 0);

  const short = await request(app).post('/api/chat').send({ question: 'hi', location: { city: 'Delhi' } });
  assert.equal(short.status, 400);
});

test('unknown API routes return JSON 404', async () => {
  const res = await request(buildApp()).get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Not found');
});

test('rate limiting protects the API', async () => {
  const config = loadConfig({ RATE_LIMIT_PER_MINUTE: '2' });
  const app = buildApp({ config });
  await request(app).get('/api/air').query({ city: 'Delhi' });
  await request(app).get('/api/air').query({ city: 'Delhi' });
  const limited = await request(app).get('/api/air').query({ city: 'Delhi' });
  assert.equal(limited.status, 429);
});
