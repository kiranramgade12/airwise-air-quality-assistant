# 🌫️ AirWise – Urban Air Quality Assistant

**PromptWars Virtual · Challenge 06 · Urban Air Quality Assistant**

AirWise helps families and communities get through winter smog. Enter your city (or share your location) and a few details about your household, and AirWise:

1. **Fetches live air quality**: PM2.5, PM10, NO₂, O₃, CO and SO₂, plus a 24-hour PM2.5 forecast. Readings are classified into **India's CPCB NAQI bands**.
2. **Finds the cleanest and dirtiest hours of the day**, so outdoor time can be planned around the smog.
3. **Uses Google Gemini to build a personalised plan**:
   - a **low-emission daily routine**,
   - **indoor air-quality hacks** with ₹ cost estimates,
   - **sustainable swaps** tailored to the household's commute, cooking fuel and heating.
4. **Explains the direct impact of every choice**: each suggestion says how much exposure it cuts or how many emissions it avoids.
5. **Answers follow-up questions** in English, Hindi or Marathi ("Can my kids play outside at 5pm?").

## Architecture

```
Browser (vanilla JS, accessible HTML)
   │  JSON over HTTPS
   ▼
Express API on Cloud Run ──► Open-Meteo Air Quality + Geocoding (CAMS data, no key)
   │
   └──► Google Gemini API (@google/genai, structured JSON output)
           └─ falls back to built-in rule engine if Gemini is unavailable
```

| Path | Purpose |
|---|---|
| `src/app.js` | Express app: security middleware, validation, routes, error handling |
| `src/services/airQuality.js` | Geocoding + air-quality fetch, caching, data summarisation |
| `src/services/gemini.js` | Gemini prompts, response schema, timeouts, fallback |
| `src/services/fallbackAdvice.js` | Deterministic rule-based plan used when the AI is unavailable |
| `src/lib/aqi.js` | Pure helpers: NAQI bands, cleanest/worst window, cigarette equivalent |
| `src/lib/validation.js` | Zod request schemas and input sanitisation |
| `public/` | Accessible front-end |
| `test/` | Unit and API tests (`node:test` + supertest) |

## Where GenAI is used

- **Google Gemini (`gemini-3.6-flash`, configurable through `GEMINI_MODEL`)** through the official `@google/genai` SDK:
  - `POST /api/advice` grounds Gemini in the live pollutant data, the forecast windows and the household profile. It uses **structured JSON output** (`responseSchema`) to produce the routine, indoor tips, swaps, health alerts and per-item impact explanations.
  - `POST /api/chat` handles grounded follow-up Q&A in the user's chosen language.
- The project was built with AI-assisted, intent-driven development.

## Quality highlights

- **Security**
  - The API key stays on the server and is never sent to the browser.
  - Helmet sets a strict CSP (`default-src 'self'`, no inline scripts), and requests are rate-limited.
  - Bodies are capped at 10 KB and every input is validated with Zod.
  - Free text is cleaned of control characters and fenced as `USER_TEXT (untrusted)` to resist prompt injection.
  - The front-end renders text only with `textContent` (no XSS), and errors are returned without leaking internals.
  - The Docker image runs as a non-root user.
- **Efficiency**
  - TTL caches: geocoding is cached for 24 h, air data for 10 min and generated plans for 15 min. Concurrent requests for the same key share one in-flight call.
  - Responses are gzip-compressed and static assets are cached.
  - No front-end framework; the page ships with zero dependencies.
- **Testing**
  - 29 tests with about 99% line coverage, run with `npm test`.
  - Upstream APIs and Gemini are stubbed in the tests.
  - CI runs on GitHub Actions.
- **Accessibility**
  - Semantic landmarks, a skip link, labelled fields with fieldsets and legends, and inline error messages linked through `aria-describedby`.
  - An `aria-live` status region, focus moved to the results when they load, and a text description of the forecast chart.
  - Colour is never the only signal, every touch target is at least 44 px, and the app supports dark mode and reduced motion.
- **Resilience**: when there is no key or Gemini fails, the app still returns a useful plan from the rule engine.

## Run locally

```bash
cp .env.example .env   # add your GEMINI_API_KEY (optional – rules mode works without it)
npm install
npm start              # http://localhost:8080
npm test
```

## Deploy to Google Cloud Run

```bash
gcloud run deploy airwise \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_MODEL=gemini-3.6-flash \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

(Create the secret first with `gcloud secrets create gemini-api-key --data-file=-`.)

## Data sources

- Air quality: [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) (Copernicus CAMS).
- The "cigarette equivalent" uses the Berkeley Earth rule of thumb that breathing 22 µg/m³ of PM2.5 for a day is roughly equal to smoking one cigarette.

> AirWise gives general guidance only and is not medical advice.

## License

MIT
