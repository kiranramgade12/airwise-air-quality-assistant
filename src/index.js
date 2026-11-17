import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createAirQualityService } from './services/airQuality.js';
import { createAdvisor } from './services/gemini.js';

const config = loadConfig();
const airService = createAirQualityService({ config });
const advisor = createAdvisor({ config });
const app = createApp({ config, airService, advisor });

const server = app.listen(config.port, () => {
  console.log(`AirWise listening on :${config.port} (Gemini ${advisor.isAiEnabled ? `enabled: ${config.geminiModels.join(' → ')}` : 'disabled – using rule-based fallback'})`);
});

// Graceful shutdown for Cloud Run (SIGTERM before instance stops).
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
