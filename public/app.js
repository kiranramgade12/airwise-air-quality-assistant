// AirWise front-end. All model/user text is rendered with textContent (never innerHTML) to prevent XSS.

const $ = (selector) => document.querySelector(selector);

const form = $('#plan-form');
const cityInput = $('#city');
const cityError = $('#city-error');
const statusEl = $('#status');
const submitBtn = $('#submit-btn');
const results = $('#results');

let currentLocation = null;
let currentProfile = null;
let currentLanguage = 'en';

/** Creates an element with optional class and text. */
function el(tag, { className, text } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function showCityError(message) {
  cityError.textContent = message;
  cityError.hidden = !message;
  cityInput.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function readProfile() {
  const data = new FormData(form);
  return {
    householdSize: Number(data.get('householdSize')) || 4,
    sensitiveGroups: data.getAll('sensitive'),
    commute: data.get('commute'),
    cookingFuel: data.get('cookingFuel'),
    heating: data.get('heating'),
    hasAirPurifier: $('#purifier').checked,
    notes: (data.get('notes') || '').toString().slice(0, 300),
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

const hour = (iso) => (iso ? iso.slice(11, 16) : '');

function renderAir(air) {
  $('#place-name').textContent = air.place.name;
  const badge = $('#aqi-badge');
  badge.style.background = air.category.color;
  $('#pm25-value').textContent = air.pollutants.pm2_5 ?? '–';
  $('#aqi-label').textContent = air.category.label;
  $('#aqi-advice').textContent = air.category.advice;
  $('#cig-eq').textContent = air.cigarettesPerDay
    ? `Breathing this air all day is roughly like smoking ${air.cigarettesPerDay} cigarette(s).`
    : '';

  const list = $('#pollutants');
  list.replaceChildren();
  const labels = { pm10: 'PM10', no2: 'NO₂', o3: 'O₃', co: 'CO', so2: 'SO₂', usAqi: 'US AQI' };
  for (const [key, label] of Object.entries(labels)) {
    const value = air.pollutants[key];
    if (value === null || value === undefined) continue;
    const wrap = el('div');
    wrap.append(el('dt', { text: label }), el('dd', { text: Math.round(value) }));
    list.append(wrap);
  }

  const best = air.bestOutdoorWindow;
  const worst = air.worstWindow;
  $('#window-text').textContent = [
    best ? `Cleanest time outdoors: ${hour(best.start)}–${hour(best.end)} (~${best.avgPm25} µg/m³).` : '',
    worst ? `Stay in around ${hour(worst.start)}–${hour(worst.end)} (~${worst.avgPm25} µg/m³).` : '',
  ].join(' ');

  const chart = $('#forecast-chart');
  chart.replaceChildren();
  const values = air.forecast.pm2_5.filter((v) => typeof v === 'number');
  const max = Math.max(60, ...values);
  air.forecast.pm2_5.forEach((value, i) => {
    const bar = el('div', { className: 'bar' });
    const v = typeof value === 'number' ? value : 0;
    bar.style.height = `${Math.max(2, (v / max) * 100)}%`;
    bar.style.background = v > 120 ? '#b3261e' : v > 90 ? '#b34700' : v > 60 ? '#8a6d00' : v > 30 ? '#5a7d1a' : '#1b7f3b';
    bar.title = `${hour(air.forecast.time[i])}: ${Math.round(v)} µg/m³`;
    chart.append(bar);
  });
  $('#forecast-desc').textContent = values.length
    ? `PM2.5 forecast for the next ${values.length} hours ranges from ${Math.round(Math.min(...values))} to ${Math.round(Math.max(...values))} µg/m³. ${$('#window-text').textContent}`
    : 'No forecast available.';
}

function renderAdvice(advice) {
  $('#summary').textContent = advice.summary;
  const alerts = $('#alerts');
  alerts.replaceChildren(...(advice.healthAlerts || []).map((a) => el('li', { text: a })));
  $('#generated-by').textContent =
    advice.generatedBy === 'gemini' ? 'Personalised by Google Gemini using live air data.' : 'Generated from built-in clean-air rules (AI temporarily unavailable).';

  $('#routine').replaceChildren(
    ...advice.routine.map((r) => {
      const li = el('li');
      li.append(
        el('span', { className: 'title', text: `${r.time} – ${r.activity}` }),
        el('span', { className: 'meta', text: r.why }),
        el('span', { className: 'impact', text: `Impact: ${r.impact}` }),
      );
      return li;
    }),
  );

  $('#indoor').replaceChildren(
    ...advice.indoorTips.map((t) => {
      const li = el('li');
      li.append(
        el('span', { className: 'title', text: t.tip }),
        el('span', { className: 'meta', text: `Cost: ${t.cost}` }),
        el('span', { className: 'impact', text: `Impact: ${t.impact}` }),
      );
      return li;
    }),
  );

  $('#alternatives').replaceChildren(
    ...advice.alternatives.map((a) => {
      const li = el('li');
      li.append(
        el('span', { className: 'title', text: `Instead of ${a.instead} → ${a.tryThis}` }),
        el('span', { className: 'impact', text: `Impact: ${a.impact}` }),
      );
      return li;
    }),
  );
}

async function requestPlan(location) {
  currentLocation = location;
  currentProfile = readProfile();
  currentLanguage = $('#language').value;
  submitBtn.disabled = true;
  submitBtn.setAttribute('aria-busy', 'true');
  setStatus('Checking live air quality and building your plan…');
  try {
    const { air, advice } = await postJson('/api/advice', { location, profile: currentProfile, language: currentLanguage });
    renderAir(air);
    renderAdvice(advice);
    results.hidden = false;
    setStatus(`Plan ready for ${air.place.name}.`);
    $('#results-title').focus();
  } catch (error) {
    setStatus('');
    showCityError(error.message);
    cityInput.focus();
  } finally {
    submitBtn.disabled = false;
    submitBtn.removeAttribute('aria-busy');
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const city = cityInput.value.trim();
  if (city.length < 2) {
    showCityError('Please enter a city or locality.');
    cityInput.focus();
    return;
  }
  showCityError('');
  requestPlan({ city });
});

$('#locate-btn').addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    showCityError('Location is not available in this browser. Please type your city.');
    return;
  }
  setStatus('Getting your location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      showCityError('');
      const lat = Math.round(pos.coords.latitude * 100) / 100; // ~1 km precision is enough; protects privacy
      const lon = Math.round(pos.coords.longitude * 100) / 100;
      cityInput.value = 'My location';
      requestPlan({ city: 'My location', lat, lon });
    },
    () => {
      setStatus('');
      showCityError('Could not get your location. Please type your city instead.');
    },
    { timeout: 10000, maximumAge: 600000 },
  );
});

$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = $('#question');
  const question = input.value.trim();
  if (question.length < 3 || !currentLocation) return;
  const log = $('#chat-log');
  log.append(el('p', { className: 'msg user', text: question }));
  input.value = '';
  const pending = el('p', { className: 'msg bot', text: 'Thinking…' });
  log.append(pending);
  try {
    const { answer } = await postJson('/api/chat', { question, location: currentLocation, profile: currentProfile, language: currentLanguage });
    pending.textContent = answer;
  } catch (error) {
    pending.textContent = error.message;
  }
});
