import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { adviceRequestSchema, chatRequestSchema, locationSchema, formatZodError } from './lib/validation.js';
import { TtlCache } from './lib/ttlCache.js';
import { UpstreamError } from './services/airQuality.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * Creates the Express app. Dependencies are injected so tests can stub upstream services.
 * @param {{ config: object, airService: object, advisor: object, logger?: Console }} deps
 */
export function createApp({ config, airService, advisor, logger = console }) {
  const app = express();
  const adviceCache = new TtlCache({ ttlMs: config.adviceCacheTtlMs, maxEntries: 300 });

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Cloud Run sits behind one Google front-end proxy.

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '10kb' }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.rateLimitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute and try again.' },
  });
  app.use('/api', apiLimiter);

  app.get('/health', (_req, res) => res.json({ status: 'ok', ai: advisor.isAiEnabled }));

  app.get('/api/air', async (req, res, next) => {
    const parsed = locationSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: formatZodError(parsed.error) });
    try {
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(await airService.getAirQuality(parsed.data));
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/advice', async (req, res, next) => {
    const parsed = adviceRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: formatZodError(parsed.error) });
    const { location, profile, language } = parsed.data;
    try {
      const air = await airService.getAirQuality(location);
      const key = createHash('sha256')
        .update(JSON.stringify({ p: air.place.name, t: air.observedAt, profile, language }))
        .digest('hex');
      // Only cache AI plans: a rule-based fallback during a model outage should not stick around.
      const advice = await adviceCache.getOrSet(
        key,
        () => advisor.getAdvice(air, profile, language),
        (value) => value.generatedBy === 'gemini',
      );
      return res.json({ air, advice });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/chat', async (req, res, next) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: formatZodError(parsed.error) });
    const { question, location, profile, language } = parsed.data;
    try {
      const air = await airService.getAirQuality(location);
      return res.json(await advisor.answer(air, profile, question, language));
    } catch (error) {
      return next(error);
    }
  });

  app.use(
    express.static(PUBLIC_DIR, {
      extensions: ['html'],
      setHeaders: (res, filePath) => {
        const longCache = /\.(css|js|svg|png|webmanifest)$/.test(filePath);
        res.setHeader('Cache-Control', longCache ? 'public, max-age=3600' : 'no-cache');
      },
    }),
  );

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Central error handler – never leaks stack traces or upstream details.
  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    if (error instanceof UpstreamError) {
      const status = error.status === 404 ? 404 : 502;
      const message = status === 404 ? error.message : 'Air-quality data is temporarily unavailable. Please try again.';
      return res.status(status).json({ error: message });
    }
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return res.status(504).json({ error: 'The data provider took too long to respond. Please try again.' });
    }
    logger.error?.('[app] Unhandled error', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
