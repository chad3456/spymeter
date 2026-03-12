// ═══════════════════════════════════════════════════════════════════════════════
// OSINT INTELLIGENCE DASHBOARD — server.js
// Serves live aircraft, war zones, Iran-Israel, military tracker, oil prices,
// data centres, humanitarian data, and more — all from free public APIs.
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

const express     = require('express');
const axios       = require('axios');
const cors        = require('cors');
const WebSocket   = require('ws');
const http        = require('http');
const path        = require('path');
const fs          = require('fs');
const compression = require('compression');
const helmet      = require('helmet');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
const PORT   = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Global unhandled rejection guard ────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason?.message || reason);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CACHE
// ═══════════════════════════════════════════════════════════════════════════════
const cache = {
  aircraft:       { data: null, ts: 0 },
  satellites:     {},
  regionAircraft: {},
  iranIsrael:     null,
  warZones:       null,
  militaryTracker:null,
  threatLevels:   { data: null, ts: 0 },
  datacenters:    { data: null, ts: 0 },
  militaryAssets: { data: null, ts: 0 },
  oilPrices:      { data: null, ts: 0 },
  oilRefineries:  { data: null, ts: 0 },
  culture:        { data: null, ts: 0 },
  hdx:            {},
  countryIntel:   {},
  markets:        { data: null, ts: 0 },
  marketNews:     { data: null, ts: 0 },
  indiaNews:      { data: null, ts: 0 },
  chinaNews:      { data: null, ts: 0 },
};

const TTL = {
  AC:          15_000,
  OIL_PRICES:   5 * 60_000,
  COUNTRY_INTEL:5 * 60_000,
  THREAT:      15 * 60_000,
  DATACENTERS:  2 * 60 * 60_000,
  MIL_ASSETS:   2 * 60 * 60_000,
  REFINERIES:  24 * 60 * 60_000,
  CULTURE:     60 * 60_000,
  HDX:         60 * 60_000,
  MARKETS:      5 * 60_000,
  MARKET_NEWS: 15 * 60_000,
  INDIA_NEWS:  10 * 60_000,
  CHINA_NEWS:  10 * 60_000,
};

// ─── Agent status tracker ─────────────────────────────────────────────────────
const agentStatus = {
  iranIsrael:     { status: 'starting', lastRun: null, articlesCount: 0, confirmedCount: 0, nextRun: null },
  warZones:       { status: 'starting', lastRun: null, zonesCount: 0, nextRun: null },
  militaryTracker:{ status: 'starting', lastRun: null, countriesTracked: 0, nextRun: null },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — ICAO / ADSB UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════
const ICAO_COUNTRY = {
  '38':'France','3C':'Germany','3D':'Germany','40':'UK','43':'UK','44':'UK',
  '49':'USA','A0':'USA','A2':'USA','A4':'USA','A6':'USA','A8':'USA','AA':'USA',
  'AC':'USA','AE':'USA','E4':'Brazil','E8':'Argentina','7C':'Australia',
  'C0':'Canada','C8':'Canada','E0':'Colombia',
  '78':'Myanmar','79':'Thailand','7A':'Vietnam','7B':'Philippines',
  '8A':'Iran','70':'Iraq','738':'Israel','4B':'Turkey','77':'Pakistan',
  'RA':'Russia','86':'China','87':'China','88':'China','89':'China',
  '896':'S.Arabia','F0':'Japan','71':'India','72':'India','73':'India',
  '74':'India','75':'India','76':'India','510':'Ukraine','48':'Russia',
};

function icaoToCountry(hex) {
  const h = (hex || '').toUpperCase();
  for (const [prefix, country] of Object.entries(ICAO_COUNTRY)) {
    if (h.startsWith(prefix)) return country;
  }
  return '';
}

function normalizeADSBOne(ac) {
  const altFeet = ac.alt_baro ?? ac.alt_geom ?? 0;
  const altM    = altFeet !== 'ground' ? Number(altFeet) * 0.3048 : 0;
  const onGnd   = ac.on_ground === 1 || ac.on_ground === true || ac.alt_baro === 'ground';
  const velMs   = ac.gs != null ? ac.gs * 0.5144 : 0;
  const vrMs    = ac.baro_rate != null ? ac.baro_rate * 0.00508 : 0;
  return [
    ac.hex || ac.icao24,
    (ac.flight || ac.callsign || '').trim(),
    icaoToCountry(ac.hex || ac.icao24),
    null, null,
    ac.lon ?? ac.longitude,
    ac.lat ?? ac.latitude,
    altM,
    onGnd,
    velMs,
    ac.track ?? ac.true_track ?? 0,
    vrMs,
    null, null, null, null, null,
    ac.orig_iata || ac.departure || '',
    ac.dest_iata || ac.destination || '',
    ac.t || ac.type || ac.aircraft_type || '',
    ac.r || ac.registration || '',
  ];
}

const ADSB_HEADERS = {
  Accept:           'application/json',
  'User-Agent':     'Mozilla/5.0 (compatible; SpymeterOSINT/1.0)',
  'Accept-Encoding':'gzip, deflate',
};
const srcHealth = { adsbfi: null, adsbOne: null, opensky: null };

async function fetchAdsbSource(label, url, extraHeaders = {}) {
  const r = await axios.get(url, {
    timeout: 12_000,
    headers: { ...ADSB_HEADERS, ...extraHeaders },
    decompress: true,
  });
  const raw = r.data?.ac || r.data?.aircraft || r.data?.states || [];
  if (!Array.isArray(raw)) throw new Error(`${label}: unexpected response format`);
  if (raw.length && Array.isArray(raw[0])) {
    return { source: label, states: raw.map(s => [...s, '', '', '', '']) };
  }
  const states = raw.filter(a => a.lat != null && a.lon != null).map(normalizeADSBOne);
  return { source: label, states };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — RSS PARSER UTILITY
// ═══════════════════════════════════════════════════════════════════════════════
function parseRSS(xmlString, sourceName) {
  const items = [];
  const itemBlocks = (xmlString || '').match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const getField = (tag) => {
      const m = block.match(new RegExp(
        `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i'
      ));
      return m ? m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
                       .replace(/&#39;/g,"'").replace(/<[^>]+>/g,'').trim() : '';
    };
    const title   = getField('title');
    const desc    = getField('description').slice(0, 300);
    const link    = getField('link') || getField('guid');
    const pubDate = getField('pubDate') || getField('dc:date');
    if (!title) continue;
    let parsedDate = null;
    try { parsedDate = pubDate ? new Date(pubDate) : null; } catch(_) {}
    items.push({ title, description: desc, link, pubDate: parsedDate, source: sourceName });
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — TRIANGULATION UTILITY
// ═══════════════════════════════════════════════════════════════════════════════
const STOP_WORDS = new Set([
  'the','a','an','in','on','at','to','of','and','or','is','was','are','were',
  'has','have','been','be','with','for','from','that','this','it','its','by',
  'as','not','but',
]);

function significantWords(text) {
  return (text || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function sharedWordCount(a, b) {
  const setA = new Set(significantWords(a));
  let count = 0;
  for (const w of significantWords(b)) { if (setA.has(w)) count++; }
  return count;
}

function triangulateEvents(articles, keywords) {
  const kwLower = keywords.map(k => k.toLowerCase());

  // Filter articles that contain at least 2 keywords
  const filtered = articles.filter(a => {
    const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
    let hits = 0;
    for (const kw of kwLower) { if (text.includes(kw)) hits++; }
    return hits >= 2;
  });

  // Cluster into events: same event if within 2h AND share 3+ significant words
  const events = [];
  const assigned = new Set();

  for (let i = 0; i < filtered.length; i++) {
    if (assigned.has(i)) continue;
    assigned.add(i);
    const cluster = [filtered[i]];
    const timeA = filtered[i].pubDate ? new Date(filtered[i].pubDate).getTime() : 0;
    for (let j = i + 1; j < filtered.length; j++) {
      if (assigned.has(j)) continue;
      const timeB = filtered[j].pubDate ? new Date(filtered[j].pubDate).getTime() : 0;
      const withinTwoHours = Math.abs(timeA - timeB) < 2 * 60 * 60 * 1000;
      const textA = (filtered[i].title || '') + ' ' + (filtered[i].description || '');
      const textB = (filtered[j].title || '') + ' ' + (filtered[j].description || '');
      if (withinTwoHours && sharedWordCount(textA, textB) >= 3) {
        cluster.push(filtered[j]);
        assigned.add(j);
      }
    }

    const distinctSources = [...new Set(cluster.map(a => a.source))];
    const confirmed = distinctSources.length >= 3;
    const times = cluster
      .map(a => a.pubDate ? new Date(a.pubDate).getTime() : 0)
      .filter(t => t > 0)
      .sort();

    // Detected keywords in this event
    const foundKws = [];
    const titleText = (cluster[0].title || '').toLowerCase();
    for (const kw of kwLower) { if (titleText.includes(kw)) foundKws.push(kw); }

    // Severity heuristic
    const criticalKws = ['missile','nuclear','airstrike','explosion','strike','attack','killed'];
    const highKws     = ['ceasefire','sanctions','drone','troops','offensive'];
    let severity = 'medium';
    if (foundKws.some(k => criticalKws.includes(k))) severity = 'critical';
    else if (foundKws.some(k => highKws.includes(k))) severity = 'high';
    if (confirmed && severity === 'medium') severity = 'high';

    events.push({
      title:     cluster[0].title,
      sources:   cluster.map(a => ({ name: a.source, url: a.link, pubDate: a.pubDate })),
      confirmed,
      keywords:  foundKws,
      firstSeen: times.length ? new Date(times[0]).toISOString()  : null,
      lastSeen:  times.length ? new Date(times[times.length-1]).toISOString() : null,
      severity,
    });
  }

  // Sort: confirmed first, then by recency
  events.sort((a, b) => {
    if (a.confirmed !== b.confirmed) return b.confirmed ? 1 : -1;
    const ta = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
    const tb = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
    return tb - ta;
  });

  return events;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4B — CIRCUIT BREAKER (worldmonitor pattern)
// Stops hammering failing endpoints; opens for 5 min after 3 consecutive fails
// ═══════════════════════════════════════════════════════════════════════════════
const _circuitBreakers = new Map();

function getCircuit(key) {
  if (!_circuitBreakers.has(key)) {
    _circuitBreakers.set(key, { state: 'closed', failures: 0, openUntil: 0 });
  }
  return _circuitBreakers.get(key);
}

function circuitOk(key) {
  const cb = getCircuit(key);
  if (cb.state === 'open') {
    if (Date.now() > cb.openUntil) { cb.state = 'half-open'; return true; }
    return false;
  }
  return true;
}

function circuitSuccess(key) {
  const cb = getCircuit(key);
  cb.failures = 0;
  cb.state = 'closed';
}

function circuitFail(key) {
  const cb = getCircuit(key);
  cb.failures++;
  if (cb.failures >= 3) {
    cb.state = 'open';
    cb.openUntil = Date.now() + 5 * 60_000;
    console.warn(`[Circuit] ${key} opened for 5min after ${cb.failures} failures`);
  }
}

// Wrapped axios with circuit breaker
async function fetchWithCircuit(key, url, opts = {}) {
  if (!circuitOk(key)) throw new Error(`Circuit open: ${key}`);
  try {
    const r = await axios.get(url, opts);
    circuitSuccess(key);
    return r;
  } catch (err) {
    circuitFail(key);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4C — JACCARD NEWS DEDUPLICATION (worldmonitor pattern)
// Groups near-duplicate headlines before serving; Jaccard threshold 0.50
// ═══════════════════════════════════════════════════════════════════════════════
function jaccardSim(a, b) {
  const sA = new Set(significantWords(a));
  const sB = new Set(significantWords(b));
  if (!sA.size || !sB.size) return 0;
  let inter = 0;
  for (const w of sB) { if (sA.has(w)) inter++; }
  return inter / (sA.size + sB.size - inter);
}

function deduplicateArticles(articles, threshold = 0.50) {
  const kept = [];
  for (const art of articles) {
    const dup = kept.some(k => jaccardSim(k.title || '', art.title || '') >= threshold);
    if (!dup) kept.push(art);
  }
  return kept;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4D — KEYWORD SPIKE DETECTOR (worldmonitor pattern)
// Tracks hourly keyword counts; fires alert if current hour > 3× 7-day average
// ═══════════════════════════════════════════════════════════════════════════════
const SPIKE_KEYWORDS = [
  'explosion','airstrike','missile strike','nuclear','attack','killed','war',
  'sanctions','ceasefire','troops','invasion','offensive','submarine','carrier',
  'india china','pakistan india','taiwan','north korea','iran nuclear',
  'stock crash','market crash','oil spike','rupee','yuan',
];

// Rolling hourly counters: Map<keyword, [{hour: ISO string, count: number}]>
const _kwHistory = new Map();

function recordKeywords(articles) {
  const hour = new Date().toISOString().slice(0, 13); // "2025-03-11T14"
  for (const kw of SPIKE_KEYWORDS) {
    const kwL = kw.toLowerCase();
    const count = articles.reduce((n, a) => {
      const txt = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
      return n + (txt.includes(kwL) ? 1 : 0);
    }, 0);
    if (!_kwHistory.has(kw)) _kwHistory.set(kw, []);
    const hist = _kwHistory.get(kw);
    const existing = hist.find(h => h.hour === hour);
    if (existing) { existing.count = Math.max(existing.count, count); }
    else { hist.push({ hour, count }); }
    // Keep 7 days max
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString().slice(0, 13);
    _kwHistory.set(kw, hist.filter(h => h.hour >= cutoff));
  }
}

function detectSpikes() {
  const spikes = [];
  const currentHour = new Date().toISOString().slice(0, 13);
  for (const [kw, hist] of _kwHistory.entries()) {
    const recent = hist.find(h => h.hour === currentHour);
    if (!recent || recent.count === 0) continue;
    const past = hist.filter(h => h.hour < currentHour);
    if (past.length < 3) continue; // need baseline
    const avg = past.reduce((s, h) => s + h.count, 0) / past.length;
    if (avg === 0) continue;
    const ratio = recent.count / avg;
    if (ratio >= 3.0) {
      spikes.push({ keyword: kw, count: recent.count, avgBaseline: parseFloat(avg.toFixed(2)), ratio: parseFloat(ratio.toFixed(1)), hour: currentHour });
    }
  }
  return spikes.sort((a, b) => b.ratio - a.ratio);
}

app.get('/api/keyword-spikes', (req, res) => {
  res.json({ spikes: detectSpikes(), tracked: SPIKE_KEYWORDS.length, ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4E — GDELT TENSION PAIRS (worldmonitor pattern)
// Tracks geopolitical tension between strategic country pairs via GDELT API
// ═══════════════════════════════════════════════════════════════════════════════
const TENSION_PAIRS = [
  { a: 'India',  b: 'Pakistan', id: 'ind-pak', keywords: ['india pakistan','border clash','loc','line of control','kashmir attack','indian army pakistan'] },
  { a: 'India',  b: 'China',    id: 'ind-chn', keywords: ['india china','lac','doklam','galwan','arunachal','sino-indian'] },
  { a: 'USA',    b: 'China',    id: 'usa-chn', keywords: ['us china','trade war','taiwan strait','south china sea','chip ban','huawei'] },
  { a: 'Russia', b: 'Ukraine',  id: 'rus-ukr', keywords: ['ukraine russia','kyiv','zelensky','putin','kharkiv','zaporizhzhia'] },
  { a: 'Iran',   b: 'Israel',   id: 'irn-isr', keywords: ['iran israel','idf iran','irgc','tehran strike','nuclear iran'] },
  { a: 'USA',    b: 'Iran',     id: 'usa-irn', keywords: ['us iran','sanctions iran','strait hormuz','nuclear deal','irgc'] },
  { a: 'China',  b: 'Taiwan',   id: 'chn-twn', keywords: ['china taiwan','pla taiwan','taipei','taiwan strait','cross-strait'] },
  { a: 'North Korea', b: 'USA', id: 'prk-usa', keywords: ['north korea','dprk','kim jong','icbm','nuclear test','pyongyang'] },
];

const _tensionCache = { data: null, ts: 0 };

async function fetchTensionPairs() {
  const now = Date.now();
  const results = [];
  for (const pair of TENSION_PAIRS) {
    try {
      const query = encodeURIComponent(pair.keywords[0]);
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=5&format=json&timespan=24H&sort=DateDesc`;
      const r = await fetchWithCircuit(`gdelt-${pair.id}`, url, { timeout: 8_000, headers: { 'User-Agent': 'SpymeterOSINT/1.0' } });
      const arts = (r.data?.articles || []).slice(0, 5);
      results.push({
        ...pair,
        articleCount: arts.length,
        latestArticles: arts.map(a => ({ title: a.title, url: a.url, source: a.domain, date: a.seendate })),
        trend: arts.length >= 4 ? 'escalating' : arts.length >= 2 ? 'active' : 'stable',
        lastChecked: new Date(now).toISOString(),
      });
    } catch (_) {
      results.push({ ...pair, articleCount: 0, latestArticles: [], trend: 'unknown', lastChecked: new Date(now).toISOString() });
    }
  }
  _tensionCache.data = { pairs: results, ts: now };
  _tensionCache.ts = now;
}

fetchTensionPairs();
setInterval(fetchTensionPairs, 15 * 60_000);

app.get('/api/tension-pairs', (req, res) => {
  if (!_tensionCache.data) return res.json({ pairs: [], ts: Date.now(), status: 'loading' });
  res.json(_tensionCache.data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — EXISTING ENDPOINTS (AIRCRAFT, SATELLITES, ETC.)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Aircraft (global ADS-B) ──────────────────────────────────────────────────
app.get('/api/aircraft', async (req, res) => {
  const now = Date.now();
  if (cache.aircraft.data && now - cache.aircraft.ts < TTL.AC)
    return res.json(cache.aircraft.data);

  const attempts = [
    fetchAdsbSource('adsb.lol',        'https://api.adsb.lol/v2/all'),
    fetchAdsbSource('airplanes.live',   'https://api.airplanes.live/v2/point/0/0/10000'),
    fetchAdsbSource('ADSB.fi',          'https://api.adsb.fi/v1/aircraft'),
    fetchAdsbSource('OpenSky',          'https://opensky-network.org/api/states/all'),
  ];
  if (process.env.ADSB_API_KEY) {
    attempts.unshift(fetchAdsbSource('ADSBExchange',
      'https://api.adsbexchange.com/api/aircraft/v2/lat/0/lng/0/dist/99999/',
      { 'api-auth': process.env.ADSB_API_KEY }
    ));
  }

  const results = await Promise.allSettled(attempts);
  for (const r of results) {
    if (r.status === 'rejected') { console.warn('[Aircraft]', r.reason?.message); continue; }
    if (r.value.states.length > 20) {
      const { source, states } = r.value;
      srcHealth[source] = 'ok';
      const result = { states, ts: now, source, count: states.length };
      cache.aircraft = { data: result, ts: now };
      return res.json(result);
    }
  }
  if (cache.aircraft.data) return res.json({ ...cache.aircraft.data, stale: true });
  return res.status(503).json({ states: [], ts: now, source: 'none', count: 0, error: 'All ADS-B sources failed' });
});

// ─── Regional aircraft ────────────────────────────────────────────────────────
app.get('/api/aircraft/region', async (req, res) => {
  const { lat = 31.7, lon = 35.2, radius = 400 } = req.query;
  const key = `${lat}_${lon}`;
  const now = Date.now();
  if (cache.regionAircraft[key] && now - cache.regionAircraft[key].ts < TTL.AC)
    return res.json(cache.regionAircraft[key].data);
  try {
    const resp = await axios.get(
      `https://api.adsb.one/v2/point/${lat}/${lon}/${radius}`,
      { timeout: 10_000, headers: { Accept: 'application/json' } }
    );
    const result = { source: 'ADSB.one', ac: resp.data?.ac || [], ts: now };
    cache.regionAircraft[key] = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.regionAircraft[key]) return res.json(cache.regionAircraft[key].data);
    res.status(503).json({ error: 'Regional aircraft unavailable', detail: err.message });
  }
});

// ─── Satellites (CelesTrak TLE) ───────────────────────────────────────────────
const TLE_URLS = {
  active:     'https://celestrak.org/pub/TLE/active.txt',
  military:   'https://celestrak.org/pub/TLE/military.txt',
  stations:   'https://celestrak.org/pub/TLE/stations.txt',
  visual:     'https://celestrak.org/pub/TLE/visual.txt',
  starlink:   'https://celestrak.org/pub/TLE/starlink.txt',
  navigation: 'https://celestrak.org/pub/TLE/gps-ops.txt',
};
app.get('/api/satellites/:type', async (req, res) => {
  const { type } = req.params;
  const now = Date.now();
  const url = TLE_URLS[type] || TLE_URLS.active;
  if (cache.satellites[type] && now - cache.satellites[type].ts < 300_000) {
    res.set('Content-Type', 'text/plain');
    return res.send(cache.satellites[type].data);
  }
  try {
    const resp = await axios.get(url, { timeout: 20_000, responseType: 'text' });
    cache.satellites[type] = { data: resp.data, ts: now };
    res.set('Content-Type', 'text/plain');
    res.send(resp.data);
  } catch (err) {
    if (cache.satellites[type]) { res.set('Content-Type','text/plain'); return res.send(cache.satellites[type].data); }
    res.status(503).json({ error: 'Satellite feed unavailable' });
  }
});

// ─── GDELT country intel ──────────────────────────────────────────────────────
app.get('/api/country-intel/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const now  = Date.now();
  if (cache.countryIntel[code] && now - cache.countryIntel[code].ts < TTL.COUNTRY_INTEL)
    return res.json(cache.countryIntel[code].data);
  try {
    const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
      params: { query: `${code} conflict military geopolitics`, mode: 'artlist', maxrecords: 12,
                format: 'json', sort: 'datedesc', timespan: '24h' },
      timeout: 8_000,
    });
    const articles = (r.data?.articles || []).map(a => ({
      title:   a.title || '',
      url:     a.url   || '',
      source:  a.domain || '',
      date:    a.seendate || '',
      tone:    a.tone ? parseFloat(a.tone).toFixed(1) : '0',
    }));
    const result = { code, articles, ts: now, source: 'GDELT v2' };
    cache.countryIntel[code] = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.countryIntel[code]) return res.json(cache.countryIntel[code].data);
    res.status(503).json({ error: 'Country intel unavailable', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — AGENT 1: IRAN-ISRAEL MONITOR (every 5 minutes)
// ═══════════════════════════════════════════════════════════════════════════════
const IRAN_ISRAEL_FEEDS = [
  { url: 'https://www.timesofisrael.com/feed/',                      name: 'Times of Israel' },
  { url: 'https://www.jpost.com/rss/rssfeedsfrontpage.aspx',         name: 'Jerusalem Post' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',                name: 'Al Jazeera' },
  { url: 'http://feeds.bbci.co.uk/news/world/middle_east/rss.xml',   name: 'BBC Middle East' },
  { url: 'https://feeds.reuters.com/reuters/worldNews',              name: 'Reuters World' },
  { url: 'https://www.theguardian.com/world/middleeast/rss',         name: 'Guardian Middle East' },
  { url: 'https://www.middleeasteye.net/rss',                        name: 'Middle East Eye' },
  { url: 'https://www.iranintl.com/en/rss',                          name: 'Iran International' },
  { url: 'https://apnews.com/hub/israel-hamas-war/rss',             name: 'AP News' },
  { url: 'https://rss.dw.com/rdf/rss-en-world',                     name: 'DW World' },
];
const IRAN_ISRAEL_KEYWORDS = [
  'iran','israel','idf','irgc','gaza','hezbollah','hamas','tel aviv','tehran',
  'rafah','west bank','netanyahu','khamenei','strike','missile','drone','attack',
  'airstrike','nuclear','sanctions','ceasefire','hostage',
];

async function iranIsraelAgent() {
  const now = Date.now();
  agentStatus.iranIsrael.status = 'running';

  try {
    // 1. Fetch all feeds concurrently with 10s timeout
    const feedResults = await Promise.allSettled(
      IRAN_ISRAEL_FEEDS.map(feed =>
        axios.get(feed.url, {
          timeout: 10_000,
          headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
          responseType: 'text',
        }).then(r => parseRSS(r.data, feed.name))
      )
    );

    let feedsUp = 0, feedsDown = 0;
    const allArticles = [];
    const cutoff = now - 48 * 60 * 60 * 1000; // 48 hours ago

    for (const r of feedResults) {
      if (r.status === 'rejected') { feedsDown++; continue; }
      feedsUp++;
      const recent = r.value.filter(a => a.pubDate && new Date(a.pubDate).getTime() > cutoff);
      allArticles.push(...recent);
    }

    // 2. Triangulate events
    const events       = triangulateEvents(allArticles, IRAN_ISRAEL_KEYWORDS);
    const confirmedCount = events.filter(e => e.confirmed).length;

    // 3. Store in cache
    cache.iranIsrael = {
      events,
      rawCount:      allArticles.length,
      confirmedCount,
      lastUpdate:    new Date().toISOString(),
      feedsUp,
      feedsDown,
    };

    // 4. Update agent status
    agentStatus.iranIsrael = {
      status:        'ok',
      lastRun:       new Date().toISOString(),
      articlesCount: allArticles.length,
      confirmedCount,
      nextRun:       new Date(now + 5 * 60_000).toISOString(),
    };

    // 5. Broadcast to WS clients
    broadcast('iran-israel', cache.iranIsrael);
    console.log(`[IranIsrael] ${allArticles.length} articles, ${events.length} events, ${confirmedCount} confirmed`);

  } catch (err) {
    console.error('[IranIsrael Agent]', err.message);
    agentStatus.iranIsrael.status = 'error';
    agentStatus.iranIsrael.lastRun = new Date().toISOString();
  }
}

// Run immediately then every 5 minutes
iranIsraelAgent();
setInterval(iranIsraelAgent, 5 * 60_000);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — AGENT 2: WAR ZONES (every 10 minutes)
// ═══════════════════════════════════════════════════════════════════════════════
const KNOWN_COUNTRY_COORDS = {
  'US':[39.5,-98.4],'RU':[61.5,105.3],'CN':[35.9,104.2],'UA':[49.0,31.0],
  'IR':[32.4,53.7], 'IL':[31.5,34.8], 'PK':[30.4,69.3], 'AF':[33.9,67.7],
  'SY':[35.0,38.0], 'IQ':[33.2,43.7], 'YE':[15.5,48.0], 'LB':[33.9,35.5],
  'MM':[16.8,96.2], 'SD':[15.5,32.5], 'ET':[9.1,40.5],  'SO':[5.2,46.2],
  'ML':[17.6,-4.0], 'NG':[9.1,8.7],   'CD':[-4.0,21.8], 'LY':[26.3,17.2],
  'MX':[23.6,-102.6],'VE':[6.4,-66.6],'HT':[18.9,-72.3],'PS':[31.9,35.2],
  'SA':[23.9,45.1], 'TR':[38.9,35.2], 'IN':[20.6,78.9], 'KP':[40.3,127.5],
};

const COUNTRY_NAMES = {
  'US':'United States','RU':'Russia','CN':'China','UA':'Ukraine','IR':'Iran',
  'IL':'Israel','PK':'Pakistan','AF':'Afghanistan','SY':'Syria','IQ':'Iraq',
  'YE':'Yemen','LB':'Lebanon','MM':'Myanmar','SD':'Sudan','ET':'Ethiopia',
  'SO':'Somalia','ML':'Mali','NG':'Nigeria','CD':'DR Congo','LY':'Libya',
  'MX':'Mexico','VE':'Venezuela','HT':'Haiti','PS':'Palestine','SA':'Saudi Arabia',
  'TR':'Turkey','IN':'India','KP':'North Korea',
};

const CONFLICT_KEYWORDS_WAR = ['war','conflict','attack','offensive','troops','frontline','ceasefire','invasion','airstrike','bombing'];

async function warZonesAgent() {
  const now = Date.now();
  agentStatus.warZones.status = 'running';

  try {
    const [geoResult, articleResult, rssResult] = await Promise.allSettled([
      // GDELT GEO
      axios.get('https://api.gdeltproject.org/api/v2/geo/geo', {
        params: {
          query:      'conflict violence war attack bombing airstrike',
          mode:       'pointdata',
          format:     'json',
          maxrecords: 500,
          timespan:   '7d',
        },
        timeout: 15_000,
      }),
      // GDELT article list
      axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: {
          query:      'war conflict airstrike bombing military attack',
          mode:       'artlist',
          format:     'json',
          maxrecords: 200,
          timespan:   '3d',
        },
        timeout: 15_000,
      }),
      // RSS feeds for conflict news
      Promise.allSettled([
        'https://feeds.reuters.com/reuters/worldNews',
        'https://www.aljazeera.com/xml/rss/all.xml',
        'http://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
      ].map(url =>
        axios.get(url, {
          timeout: 8_000,
          headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
        }).then(r => parseRSS(r.data, new URL(url).hostname))
      )),
    ]);

    // Aggregate GDELT geo points by country
    const countryData = {};

    if (geoResult.status === 'fulfilled') {
      const points = geoResult.value.data?.features || geoResult.value.data?.pointdata || [];
      const arr = Array.isArray(points) ? points : [];
      for (const pt of arr) {
        const cc = pt.ActionGeo_CountryCode || pt.properties?.countryCode || '';
        if (!cc) continue;
        if (!countryData[cc]) countryData[cc] = { eventCount: 0, toneSum: 0, toneCount: 0, themes: new Set(), lat: null, lon: null, headlines: [] };
        countryData[cc].eventCount++;
        const tone = parseFloat(pt.MentionDocTone || pt.properties?.tone || 0);
        if (!isNaN(tone)) { countryData[cc].toneSum += tone; countryData[cc].toneCount++; }
        if (!countryData[cc].lat && pt.ActionGeo_Lat) {
          countryData[cc].lat = parseFloat(pt.ActionGeo_Lat);
          countryData[cc].lon = parseFloat(pt.ActionGeo_Long);
        }
        if (pt.themes) { String(pt.themes).split(',').slice(0,3).forEach(t => countryData[cc].themes.add(t.trim())); }
      }
    }

    // Supplement with article data
    if (articleResult.status === 'fulfilled') {
      const arts = articleResult.value.data?.articles || [];
      for (const a of arts) {
        const cc = (a.sourcecountry || '').toUpperCase().slice(0,2);
        if (!cc) continue;
        if (!countryData[cc]) countryData[cc] = { eventCount: 0, toneSum: 0, toneCount: 0, themes: new Set(), lat: null, lon: null, headlines: [] };
        if (countryData[cc].headlines.length < 3) countryData[cc].headlines.push(a.title || '');
      }
    }

    // Supplement with RSS headlines per country
    if (rssResult.status === 'fulfilled') {
      const rssAll = [];
      for (const r of rssResult.value) {
        if (r.status === 'fulfilled') rssAll.push(...r.value);
      }
      const conflictArticles = rssAll.filter(a => {
        const text = ((a.title||'') + ' ' + (a.description||'')).toLowerCase();
        return CONFLICT_KEYWORDS_WAR.some(kw => text.includes(kw));
      });
      for (const art of conflictArticles.slice(0, 50)) {
        // try to match country by keywords in title
        for (const [cc, name] of Object.entries(COUNTRY_NAMES)) {
          if ((art.title || '').toLowerCase().includes(name.toLowerCase())) {
            if (!countryData[cc]) countryData[cc] = { eventCount: 0, toneSum: 0, toneCount: 0, themes: new Set(), lat: null, lon: null, headlines: [] };
            countryData[cc].eventCount++;
            if (countryData[cc].headlines.length < 5) countryData[cc].headlines.push(art.title);
          }
        }
      }
    }

    // Build zone objects with severity scoring
    const zones = [];
    for (const [cc, d] of Object.entries(countryData)) {
      if (d.eventCount === 0) continue;
      const avgTone   = d.toneCount > 0 ? d.toneSum / d.toneCount : 0;
      const countryName = COUNTRY_NAMES[cc] || cc;
      let severity = 'low';
      if      (d.eventCount > 50 && avgTone < -5) severity = 'critical';
      else if (d.eventCount > 20 || avgTone < -4) severity = 'high';
      else if (d.eventCount > 5  || avgTone < -2) severity = 'medium';

      const coords = KNOWN_COUNTRY_COORDS[cc];
      const lat = d.lat || (coords ? coords[0] : null);
      const lon = d.lon || (coords ? coords[1] : null);
      if (!lat || !lon) continue;

      zones.push({
        countryCode:      cc,
        countryName,
        lat,
        lon,
        severity,
        eventCount:       d.eventCount,
        avgTone:          parseFloat(avgTone.toFixed(2)),
        themes:           [...d.themes].slice(0, 5),
        recentHeadlines:  d.headlines.slice(0, 3),
      });
    }

    zones.sort((a, b) => {
      const sev = { critical:4, high:3, medium:2, low:1 };
      return (sev[b.severity]||0) - (sev[a.severity]||0);
    });

    cache.warZones = { zones, lastUpdate: new Date().toISOString() };
    agentStatus.warZones = { status: 'ok', lastRun: new Date().toISOString(), zonesCount: zones.length, nextRun: new Date(now + 10 * 60_000).toISOString() };
    broadcast('war-zones', cache.warZones);
    console.log(`[WarZones] ${zones.length} zones identified`);

  } catch (err) {
    console.error('[WarZones Agent]', err.message);
    agentStatus.warZones.status = 'error';
    agentStatus.warZones.lastRun = new Date().toISOString();
  }
}

warZonesAgent();
setInterval(warZonesAgent, 10 * 60_000);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — AGENT 3: MILITARY TRACKER (every 15 minutes)
// ═══════════════════════════════════════════════════════════════════════════════
const MILITARY_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/worldNews',      name: 'Reuters' },
  { url: 'https://www.defensenews.com/rss/',                 name: 'Defense News' },
  { url: 'https://thedefensepost.com/feed/',                 name: 'Defense Post' },
  { url: 'https://breakingdefense.com/feed/',                name: 'Breaking Defense' },
  { url: 'https://www.spacewar.com/news/miltech-n.xml',      name: 'SpaceWar MilTech' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',        name: 'Al Jazeera' },
  { url: 'https://rss.dw.com/rdf/rss-en-world',             name: 'DW World' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',     name: 'BBC World' },
];
const MILITARY_KEYWORDS = [
  'missile','nuclear','military','defense','army','navy','air force','drone',
  'submarine','aircraft carrier','hypersonic','troops','weapons','nato',
  'pentagon','sanctions','arms','artillery','tank','fighter jet','warship',
];
const COUNTRY_PATTERNS = {
  'US': ['united states','american','pentagon','us military','us army','us navy','us air force'],
  'CN': ['china','chinese','pla','peoples liberation'],
  'RU': ['russia','russian','kremlin','moscow'],
  'IN': ['india','indian army','indian navy','isro'],
  'PK': ['pakistan','pakistani'],
  'IL': ['israel','israeli','idf'],
  'IR': ['iran','iranian','irgc'],
  'KP': ['north korea','dprk','kim jong'],
  'UK': ['britain','british','uk military','royal navy','raf'],
  'FR': ['france','french army'],
  'DE': ['germany','german military','bundeswehr'],
  'TR': ['turkey','turkish','taf'],
  'SA': ['saudi arabia','saudi military'],
  'UA': ['ukraine','ukrainian army','zsu'],
  'AU': ['australia','australian defence'],
};

function detectCountry(text) {
  const lower = (text || '').toLowerCase();
  for (const [code, patterns] of Object.entries(COUNTRY_PATTERNS)) {
    for (const p of patterns) { if (lower.includes(p)) return code; }
  }
  return null;
}

function detectCategory(text) {
  const t = (text || '').toLowerCase();
  if (/\b(missile|icbm|ballistic|cruise missile)\b/.test(t)) return 'missile';
  if (/\bnuclear\b/.test(t))                                   return 'nuclear';
  if (/\b(ship|navy|naval|frigate|destroyer|carrier|submarine|fleet)\b/.test(t)) return 'naval';
  if (/\b(air force|jet|aircraft|fighter|bomber|drone|uav)\b/.test(t)) return 'air';
  if (/\b(cyber|hack|malware|ransomware)\b/.test(t))           return 'cyber';
  if (/\b(satellite|space|orbit|launch vehicle)\b/.test(t))   return 'space';
  if (/\b(diplomat|sanction|treaty|agreement)\b/.test(t))     return 'diplomatic';
  if (/\b(ground|troops|army|infantry|tank|artillery)\b/.test(t)) return 'ground';
  return 'general';
}

let _prevMilitaryCounts = {};

async function militaryTrackerAgent() {
  const now = Date.now();
  agentStatus.militaryTracker.status = 'running';

  try {
    const feedResults = await Promise.allSettled(
      MILITARY_FEEDS.map(feed =>
        axios.get(feed.url, {
          timeout: 10_000,
          headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
          responseType: 'text',
        }).then(r => parseRSS(r.data, feed.name))
      )
    );

    const cutoff = now - 48 * 60 * 60 * 1000;
    const cutoff24 = now - 24 * 60 * 60 * 1000;
    const allArticles = [];
    for (const r of feedResults) {
      if (r.status === 'rejected') continue;
      const recent = r.value.filter(a => a.pubDate && new Date(a.pubDate).getTime() > cutoff);
      allArticles.push(...recent);
    }

    // Filter military-keyword articles
    const milArticles = allArticles.filter(a => {
      const text = ((a.title||'') + ' ' + (a.description||'')).toLowerCase();
      return MILITARY_KEYWORDS.some(kw => text.includes(kw));
    });

    // Group by country
    const countryMap = {};
    for (const art of milArticles) {
      const cc = detectCountry((art.title||'') + ' ' + (art.description||''));
      if (!cc) continue;
      if (!countryMap[cc]) countryMap[cc] = { recentNews: [], count24h: 0, categories: {} };
      const isRecent24 = art.pubDate && new Date(art.pubDate).getTime() > cutoff24;
      if (isRecent24) countryMap[cc].count24h++;
      const cat = detectCategory((art.title||'') + ' ' + (art.description||''));
      countryMap[cc].categories[cat] = (countryMap[cc].categories[cat] || 0) + 1;
      if (countryMap[cc].recentNews.length < 5) {
        countryMap[cc].recentNews.push({
          title:   art.title,
          source:  art.source,
          url:     art.link,
          pubDate: art.pubDate,
        });
      }
    }

    // Build result with trend comparison
    const countries = {};
    for (const [cc, d] of Object.entries(countryMap)) {
      const prev  = _prevMilitaryCounts[cc] || 0;
      let trend = 'stable';
      if (prev > 0) {
        const change = (d.count24h - prev) / prev;
        if (change > 0.2)  trend = 'up';
        if (change < -0.2) trend = 'down';
      }
      countries[cc] = {
        rank:        0,
        score:       d.count24h,
        trend,
        recentNews:  d.recentNews,
        categories:  d.categories,
      };
    }

    // Save current counts for next cycle
    for (const [cc, d] of Object.entries(countryMap)) {
      _prevMilitaryCounts[cc] = d.count24h;
    }

    // Rank by score
    const topCountries = Object.entries(countries)
      .sort((a, b) => b[1].score - a[1].score)
      .map(([cc], i) => { countries[cc].rank = i + 1; return cc; });

    cache.militaryTracker = { countries, topCountries, lastUpdate: new Date().toISOString() };
    agentStatus.militaryTracker = {
      status:           'ok',
      lastRun:          new Date().toISOString(),
      countriesTracked: topCountries.length,
      nextRun:          new Date(now + 15 * 60_000).toISOString(),
    };
    broadcast('military-tracker', cache.militaryTracker);
    console.log(`[MilitaryTracker] ${topCountries.length} countries tracked`);

  } catch (err) {
    console.error('[MilitaryTracker Agent]', err.message);
    agentStatus.militaryTracker.status = 'error';
    agentStatus.militaryTracker.lastRun = new Date().toISOString();
  }
}

militaryTrackerAgent();
setInterval(militaryTrackerAgent, 15 * 60_000);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — NEW HTTP ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── /api/threat-levels ───────────────────────────────────────────────────────
app.get('/api/threat-levels', async (req, res) => {
  const now = Date.now();
  if (cache.threatLevels.data && now - cache.threatLevels.ts < TTL.THREAT)
    return res.json(cache.threatLevels.data);
  try {
    const r = await axios.get('https://api.gdeltproject.org/api/v2/geo/geo', {
      params: {
        query:      'conflict violence unrest protest coup attack',
        mode:       'pointdata',
        format:     'json',
        maxrecords: 500,
        timespan:   '7d',
      },
      timeout: 15_000,
    });

    const points = r.data?.features || r.data?.pointdata || [];
    const arr = Array.isArray(points) ? points : [];
    const byCountry = {};
    for (const pt of arr) {
      const cc = pt.ActionGeo_CountryCode || pt.properties?.countryCode || '';
      if (!cc) continue;
      if (!byCountry[cc]) byCountry[cc] = { eventCount: 0, toneSum: 0, toneCount: 0 };
      byCountry[cc].eventCount++;
      const tone = parseFloat(pt.MentionDocTone || 0);
      if (!isNaN(tone)) { byCountry[cc].toneSum += tone; byCountry[cc].toneCount++; }
    }

    const countries = {};
    let maxEvents = 1, minTone = 0;
    for (const d of Object.values(byCountry)) {
      if (d.eventCount > maxEvents) maxEvents = d.eventCount;
      const avg = d.toneCount ? d.toneSum / d.toneCount : 0;
      if (avg < minTone) minTone = avg;
    }

    for (const [cc, d] of Object.entries(byCountry)) {
      const avgTone   = d.toneCount ? d.toneSum / d.toneCount : 0;
      const normEvents = Math.min(d.eventCount / maxEvents, 1);
      const normTone   = minTone < 0 ? Math.min(-avgTone / (-minTone), 1) : 0;
      const score      = Math.round((normEvents * 0.6 + normTone * 0.4) * 100);
      let level = 'low';
      if (score > 75) level = 'critical';
      else if (score > 50) level = 'high';
      else if (score > 25) level = 'moderate';
      countries[cc] = { score, level, eventCount: d.eventCount };
    }

    const result = { countries, lastUpdate: new Date().toISOString() };
    cache.threatLevels = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.threatLevels.data) return res.json({ ...cache.threatLevels.data, stale: true });
    res.status(503).json({ error: 'Threat levels unavailable', detail: err.message });
  }
});

// ─── /api/datacenter-stats — country-level bubble data for DC map layer ──────
// Called by DC_LAYER in public/js/app.js — needs {datacenters:[{lat,lng,count,country}]}
const _dcStatsCache = { data: null, ts: 0 };
const _DC_COUNTRY_COORDS = {
  'United States of America':[38.9,-95.7],'United States':[38.9,-95.7],
  'United Kingdom':[51.5,-0.12],'France':[48.9,2.3],'Germany':[52.5,13.4],
  'China':[39.9,116.4],'Japan':[35.7,139.7],'South Korea':[37.6,127.0],
  'India':[20.6,78.9],'Canada':[45.4,-75.7],'Australia':[-25.3,133.8],
  'Netherlands':[52.4,4.9],'Sweden':[59.3,18.1],'Finland':[60.2,25.0],
  'Denmark':[55.7,12.6],'Norway':[59.9,10.7],'Switzerland':[47.4,8.5],
  'Poland':[52.2,21.0],'Spain':[40.4,-3.7],'Italy':[41.9,12.5],
  'Belgium':[50.8,4.4],'Singapore':[1.35,103.8],
  'United Arab Emirates':[24.5,54.4],'Saudi Arabia':[24.7,46.7],
  'Israel':[31.8,35.2],'Brazil':[-10.0,-55.0],'Mexico':[23.6,-102.6],
  'Argentina':[-34.6,-58.4],'Chile':[-33.5,-70.6],'Colombia':[4.6,-74.1],
  'Malaysia':[3.1,101.7],'Indonesia':[0.8,113.9],'Philippines (the)':[12.9,121.8],
  'Thailand':[15.9,100.9],'Vietnam':[15.0,108.3],'Taiwan':[23.7,120.9],
  'Hong Kong':[22.3,114.2],'Russia':[55.8,37.6],'Luxembourg':[49.6,6.1],
  'Ireland':[53.3,-6.3],'Portugal':[38.7,-9.1],'Austria':[48.2,16.4],
  'Czech Republic':[50.1,14.4],'Hungary':[47.5,19.1],'Romania':[44.4,26.1],
  'Turkey':[39.9,32.9],'Egypt':[30.1,31.2],'South Africa':[-26.2,28.0],
  'Kenya':[1.3,36.8],'Nigeria':[9.1,7.4],'Ghana':[7.9,-1.0],
  'Qatar':[25.3,51.5],'Bahrain':[26.0,50.6],'Kuwait':[29.4,47.9],
  'Jordan':[31.9,35.9],'New Zealand':[-41.3,174.8],'Pakistan':[33.7,73.1],
  'Bangladesh':[23.7,90.4],'Iceland':[64.9,-18.7],'Ukraine':[50.5,30.5],
  'Greece':[37.9,23.7],'Kazakhstan':[51.2,71.4],'Morocco':[31.8,-7.1],
  'Estonia':[59.4,24.7],'Latvia':[56.9,24.1],'Lithuania':[54.7,25.3],
  // CSV alternate spellings
  'Czechia':[50.1,14.4],
  'Korea (Republic of)':[37.6,127.0],
  'Slovenia':[46.1,14.5],
  'United Kingdom of Great Britain and Northern Ireland':[51.5,-0.12],
  'Viet Nam':[15.0,108.3],'Vietnam':[15.0,108.3],'Iran (Islamic Republic of)':[35.7,51.4],
};
const _DC_REGION_MAP = {
  'United States of America':'North America','United States':'North America',
  'Canada':'North America','Mexico':'North America','Brazil':'South America',
  'Argentina':'South America','Colombia':'South America','Chile':'South America',
  'United Kingdom':'Europe','France':'Europe','Germany':'Europe','Netherlands':'Europe',
  'Sweden':'Europe','Finland':'Europe','Denmark':'Europe','Norway':'Europe',
  'Switzerland':'Europe','Poland':'Europe','Spain':'Europe','Italy':'Europe',
  'Belgium':'Europe','Luxembourg':'Europe','Ireland':'Europe','Portugal':'Europe',
  'Austria':'Europe','Czech Republic':'Europe','Hungary':'Europe','Romania':'Europe',
  'Greece':'Europe','Estonia':'Europe','Latvia':'Europe','Lithuania':'Europe',
  'Ukraine':'Europe','Russia':'Europe/Asia',
  'China':'Asia Pacific','Japan':'Asia Pacific','South Korea':'Asia Pacific',
  'India':'Asia Pacific','Australia':'Asia Pacific','Singapore':'Asia Pacific',
  'Malaysia':'Asia Pacific','Indonesia':'Asia Pacific','Thailand':'Asia Pacific',
  'Vietnam':'Asia Pacific','Taiwan':'Asia Pacific','Hong Kong':'Asia Pacific',
  'New Zealand':'Asia Pacific','Bangladesh':'Asia Pacific','Pakistan':'Asia Pacific',
  'United Arab Emirates':'Middle East','Saudi Arabia':'Middle East',
  'Israel':'Middle East','Qatar':'Middle East','Bahrain':'Middle East',
  'Kuwait':'Middle East','Jordan':'Middle East','Turkey':'Middle East',
  'Egypt':'Africa/ME','Kenya':'Africa','Nigeria':'Africa','Ghana':'Africa',
  'South Africa':'Africa','Morocco':'Africa','Kazakhstan':'Central Asia',
  'Iceland':'Europe',
};

app.get('/api/datacenter-stats', (req, res) => {
  const now = Date.now();
  if (_dcStatsCache.data && (now - _dcStatsCache.ts) < TTL.DATACENTERS)
    return res.json(_dcStatsCache.data);

  try {
    const raw   = fs.readFileSync(path.join(__dirname, 'public', 'gpu_clusters.csv'), 'utf8');
    const lines = raw.trim().split('\n');
    const hdrs  = _parseCSVRow(lines[0]).map(h => h.trim());
    const nameIdx    = hdrs.indexOf('Name');
    const statusIdx  = hdrs.indexOf('Status');
    const countryIdx = hdrs.indexOf('Country');
    const h100Idx    = hdrs.indexOf('H100 equivalents');
    const ownerIdx   = hdrs.indexOf('Owner');

    const countryMap = {};
    for (let i = 1; i < lines.length; i++) {
      const cols    = _parseCSVRow(lines[i]);
      const status  = (cols[statusIdx] || '').trim();
      const country = (cols[countryIdx] || '').trim();
      if (!country || status === 'Decommissioned') continue;
      const coords  = _DC_COUNTRY_COORDS[country];
      if (!coords) continue;
      if (!countryMap[country]) {
        countryMap[country] = {
          country,
          lat: coords[0], lng: coords[1],
          count: 0, h100Total: 0,
          region: _DC_REGION_MAP[country] || '',
          planned: 0, existing: 0,
        };
      }
      const h100 = parseFloat(cols[h100Idx]) || 0;
      countryMap[country].count++;
      countryMap[country].h100Total += h100;
      if (status === 'Planned') countryMap[country].planned++;
      else countryMap[country].existing++;
    }

    const datacenters = Object.values(countryMap).map(d => ({
      country:  d.country,
      lat:      d.lat,
      lng:      d.lng,
      count:    d.count,
      region:   d.region,
      note:     `${d.existing} existing · ${d.planned} planned`,
      h100eq:   Math.round(d.h100Total),
    })).sort((a, b) => b.count - a.count);

    const result = { datacenters, source: 'Epoch AI GPU Clusters 2025', lastUpdate: new Date().toISOString() };
    _dcStatsCache.data = result;
    _dcStatsCache.ts   = now;
    res.json(result);
  } catch (e) {
    console.error('[datacenter-stats]', e.message);
    res.status(500).json({ datacenters: [], error: e.message });
  }
});

// ─── /api/datacenters ─────────────────────────────────────────────────────────
app.get('/api/datacenters', async (req, res) => {
  const now = Date.now();
  if (cache.datacenters.data && now - cache.datacenters.ts < TTL.DATACENTERS)
    return res.json(cache.datacenters.data);

  const datacenters = [];

  const [wdResult, osmResult] = await Promise.allSettled([
    // Wikidata SPARQL for data centers (P31 = Q11774)
    axios.get('https://query.wikidata.org/sparql', {
      params: {
        format: 'json',
        query: `SELECT ?item ?itemLabel ?coord ?countryLabel ?operatorLabel WHERE {
  ?item wdt:P31 wd:Q11774.
  ?item wdt:P625 ?coord.
  OPTIONAL { ?item wdt:P17 ?country. }
  OPTIONAL { ?item wdt:P137 ?operator. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 300`,
      },
      timeout: 20_000,
      headers: { 'User-Agent': 'SpymeterOSINT/1.0 (osint-dashboard; datacenter research)', Accept: 'application/sparql-results+json' },
    }),
    // OSM Overpass for data centers
    axios.post('https://overpass-api.de/api/interpreter',
      'data=' + encodeURIComponent('[out:json][timeout:30];(node["building"="data_center"];way["building"="data_center"];);out center 200;'),
      { timeout: 35_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),
  ]);

  // Parse Wikidata results
  if (wdResult.status === 'fulfilled') {
    const bindings = wdResult.value.data?.results?.bindings || [];
    for (const b of bindings) {
      const coord = b.coord?.value || '';
      const m = coord.match(/Point\(([-.0-9]+)\s+([-.0-9]+)\)/);
      if (!m) continue;
      const lon = parseFloat(m[1]), lat = parseFloat(m[2]);
      const name     = b.itemLabel?.value || 'Data Center';
      const country  = b.countryLabel?.value || '';
      const company  = b.operatorLabel?.value || '';
      const tier     = /aws|amazon|azure|microsoft|google|meta|facebook|oracle|apple/i.test(company) ? 'hyperscale'
                     : company ? 'regional' : 'unknown';
      const id       = b.item?.value?.replace('http://www.wikidata.org/entity/', '') || '';
      datacenters.push({ id, name, company, lat, lon, country, tier, source: 'wikidata' });
    }
  }

  // Parse OSM results
  if (osmResult.status === 'fulfilled') {
    const elements = osmResult.value.data?.elements || [];
    for (const el of elements) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!lat || !lon) continue;
      const name    = el.tags?.name || 'Data Center';
      const company = el.tags?.operator || el.tags?.brand || '';
      const tier    = /aws|amazon|azure|microsoft|google|meta|oracle|apple/i.test(company) ? 'hyperscale'
                    : company ? 'regional' : 'unknown';
      datacenters.push({ id: String(el.id), name, company, lat, lon, country: el.tags?.['addr:country'] || '', tier, source: 'osm' });
    }
  }

  const result = { datacenters, lastUpdate: new Date().toISOString(), count: datacenters.length };
  cache.datacenters = { data: result, ts: now };
  res.json(result);
});

// ─── /api/military-assets ─────────────────────────────────────────────────────
app.get('/api/military-assets', async (req, res) => {
  const now = Date.now();
  if (cache.militaryAssets.data && now - cache.militaryAssets.ts < TTL.MIL_ASSETS)
    return res.json(cache.militaryAssets.data);

  const type = (req.query.type || 'all').toLowerCase();
  const assets = [];

  const fetches = [];

  if (type === 'base' || type === 'all') {
    fetches.push(
      axios.post('https://overpass-api.de/api/interpreter',
        'data=' + encodeURIComponent('[out:json][timeout:30];(node["military"="base"]["name"];way["military"="base"]["name"];node["military"="airfield"]["name"];way["military"="naval_base"]["name"];);out center 500;'),
        { timeout: 35_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      ).then(r => {
        (r.data?.elements || []).forEach(el => {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          if (!lat || !lon) return;
          assets.push({ id: String(el.id), name: el.tags?.name || 'Military Base', type: el.tags?.military || 'base', lat, lon, country: el.tags?.['addr:country'] || '', details: el.tags?.operator || '', source: 'osm' });
        });
      }).catch(() => {})
    );
  }

  if (type === 'nuclear' || type === 'all') {
    fetches.push(
      axios.get('https://query.wikidata.org/sparql', {
        params: {
          format: 'json',
          query: `SELECT ?item ?itemLabel ?coord ?countryLabel WHERE {
  { ?item wdt:P31 wd:Q134649. } UNION { ?item wdt:P31 wd:Q46970. }
  ?item wdt:P625 ?coord.
  OPTIONAL { ?item wdt:P17 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 150`,
        },
        timeout: 20_000,
        headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/sparql-results+json' },
      }).then(r => {
        const bindings = r.data?.results?.bindings || [];
        for (const b of bindings) {
          const m = (b.coord?.value || '').match(/Point\(([-.0-9]+)\s+([-.0-9]+)\)/);
          if (!m) continue;
          assets.push({ id: b.item?.value?.split('/').pop() || '', name: b.itemLabel?.value || 'Nuclear Facility', type: 'nuclear', lat: parseFloat(m[2]), lon: parseFloat(m[1]), country: b.countryLabel?.value || '', details: '', source: 'wikidata' });
        }
      }).catch(() => {})
    );
  }

  if (type === 'bunker' || type === 'all') {
    fetches.push(
      axios.get('https://query.wikidata.org/sparql', {
        params: {
          format: 'json',
          query: `SELECT ?item ?itemLabel ?coord ?countryLabel WHERE {
  ?item wdt:P31 wd:Q369747.
  ?item wdt:P625 ?coord.
  OPTIONAL { ?item wdt:P17 ?country. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 100`,
        },
        timeout: 20_000,
        headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/sparql-results+json' },
      }).then(r => {
        const bindings = r.data?.results?.bindings || [];
        for (const b of bindings) {
          const m = (b.coord?.value || '').match(/Point\(([-.0-9]+)\s+([-.0-9]+)\)/);
          if (!m) continue;
          assets.push({ id: b.item?.value?.split('/').pop() || '', name: b.itemLabel?.value || 'Bunker', type: 'bunker', lat: parseFloat(m[2]), lon: parseFloat(m[1]), country: b.countryLabel?.value || '', details: '', source: 'wikidata' });
        }
      }).catch(() => {})
    );
  }

  await Promise.allSettled(fetches);

  const result = { assets, lastUpdate: new Date().toISOString(), count: assets.length, type };
  cache.militaryAssets = { data: result, ts: now };
  res.json(result);
});

// ─── /api/oil-prices ─────────────────────────────────────────────────────────
app.get('/api/oil-prices', async (req, res) => {
  const now = Date.now();
  if (cache.oilPrices.data && now - cache.oilPrices.ts < TTL.OIL_PRICES)
    return res.json(cache.oilPrices.data);

  async function fetchOilChart(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo&includePrePost=false`;
    const hdrs = {
      'User-Agent':  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept:        'application/json',
      Referer:       'https://finance.yahoo.com/',
    };
    const r = await axios.get(url, { timeout: 10_000, headers: hdrs });
    const meta       = r.data?.chart?.result?.[0]?.meta || {};
    const timestamps = r.data?.chart?.result?.[0]?.timestamp || [];
    const closes     = r.data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    const chart = timestamps.map((ts, i) => ({ ts: ts * 1000, price: parseFloat((closes[i] || 0).toFixed(2)) })).filter(p => p.price > 0);
    return {
      price:         parseFloat((meta.regularMarketPrice || 0).toFixed(2)),
      change:        parseFloat((meta.regularMarketChange || 0).toFixed(2)),
      changePercent: parseFloat((meta.regularMarketChangePercent || 0).toFixed(2)),
      chart,
    };
  }

  const [brentR, wtiR, natgasR] = await Promise.allSettled([
    fetchOilChart('BZ=F'),
    fetchOilChart('CL=F'),
    fetchOilChart('NG=F'),
  ]);

  const result = {
    brent:   brentR.status  === 'fulfilled' ? brentR.value  : { price: null, change: null, changePercent: null, chart: [] },
    wti:     wtiR.status    === 'fulfilled' ? wtiR.value    : { price: null, change: null, changePercent: null, chart: [] },
    natgas:  natgasR.status === 'fulfilled' ? natgasR.value : { price: null, change: null, changePercent: null, chart: [] },
    lastUpdate: new Date().toISOString(),
  };
  cache.oilPrices = { data: result, ts: now };
  res.json(result);
});

// ─── /api/oil-refineries ──────────────────────────────────────────────────────
app.get('/api/oil-refineries', async (req, res) => {
  const now = Date.now();
  if (cache.oilRefineries.data && now - cache.oilRefineries.ts < TTL.REFINERIES)
    return res.json(cache.oilRefineries.data);

  const refineries = [];

  const [r1, r2] = await Promise.allSettled([
    axios.post('https://overpass-api.de/api/interpreter',
      'data=' + encodeURIComponent('[out:json][timeout:60];(node["industrial"="oil_refinery"]["name"];way["industrial"="oil_refinery"]["name"];node["man_made"="petroleum_well"]["name"];way["industrial"="refinery"]["name"];);out center 1000;'),
      { timeout: 65_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),
    axios.post('https://overpass-api.de/api/interpreter',
      'data=' + encodeURIComponent('[out:json][timeout:30];node["landuse"="industrial"]["industrial"="refinery"];out center 500;'),
      { timeout: 35_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    ),
  ]);

  for (const result of [r1, r2]) {
    if (result.status !== 'fulfilled') continue;
    for (const el of (result.value.data?.elements || [])) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!lat || !lon) continue;
      refineries.push({
        id:      String(el.id),
        name:    el.tags?.name || 'Oil Refinery',
        lat,
        lon,
        country: el.tags?.['addr:country'] || el.tags?.country || '',
        type:    el.tags?.industrial || el.tags?.man_made || 'refinery',
      });
    }
  }

  const result = { refineries, lastUpdate: new Date().toISOString(), count: refineries.length };
  cache.oilRefineries = { data: result, ts: now };
  res.json(result);
});

// ─── /api/culture ─────────────────────────────────────────────────────────────
app.get('/api/culture', async (req, res) => {
  const now = Date.now();
  if (cache.culture.data && now - cache.culture.ts < TTL.CULTURE)
    return res.json(cache.culture.data);

  const metric = (req.query.metric || 'all').toLowerCase();
  const result = {};

  const fetches = [];

  if (metric === 'happiness' || metric === 'all') {
    fetches.push(
      Promise.allSettled([
        axios.get('https://api.worldbank.org/v2/en/indicator/SP.DYN.LE00.IN', {
          params: { format: 'json', mrv: 1, per_page: 300 }, timeout: 10_000,
        }),
        axios.get('https://api.worldbank.org/v2/en/indicator/NY.GNP.PCAP.PP.CD', {
          params: { format: 'json', mrv: 1, per_page: 300 }, timeout: 10_000,
        }),
      ]).then(([leR, gniR]) => {
        const happiness = {};
        const leData    = leR.status  === 'fulfilled' ? leR.value.data?.[1]  || [] : [];
        const gniData   = gniR.status === 'fulfilled' ? gniR.value.data?.[1] || [] : [];
        leData.forEach(d => {
          if (d.countryiso3code && d.value != null)
            happiness[d.countryiso3code] = { lifeExpectancy: parseFloat(d.value?.toFixed(1)) };
        });
        gniData.forEach(d => {
          if (d.countryiso3code && d.value != null) {
            if (!happiness[d.countryiso3code]) happiness[d.countryiso3code] = {};
            happiness[d.countryiso3code].gniPerCapita = Math.round(d.value);
          }
        });
        result.happiness = happiness;
      }).catch(() => {})
    );
  }

  if (metric === 'space' || metric === 'all') {
    fetches.push(
      axios.get('https://ll.thespacedevs.com/2.2.0/launch/', {
        params: { format: 'json', limit: 100, ordering: '-window_start' },
        timeout: 12_000,
        headers: { 'User-Agent': 'SpymeterOSINT/1.0' },
      }).then(r => {
        const launches = r.data?.results || [];
        const byCountry = {};
        for (const launch of launches) {
          const cc = launch.launch_service_provider?.country_code || launch.pad?.location?.country_code || 'XX';
          if (!byCountry[cc]) byCountry[cc] = { count: 0, missions: [] };
          byCountry[cc].count++;
          if (byCountry[cc].missions.length < 3) byCountry[cc].missions.push(launch.name || '');
        }
        result.space = byCountry;
      }).catch(() => {})
    );
  }

  if (metric === 'patents' || metric === 'all') {
    fetches.push(
      axios.get('https://api.worldbank.org/v2/en/indicator/IP.PAT.RESD', {
        params: { format: 'json', mrv: 3, per_page: 300 }, timeout: 10_000,
      }).then(r => {
        const data = r.data?.[1] || [];
        const patents = {};
        data.forEach(d => {
          if (d.countryiso3code && d.value != null) {
            if (!patents[d.countryiso3code] || d.date > (patents[d.countryiso3code].year || '')) {
              patents[d.countryiso3code] = { applications: Math.round(d.value), year: d.date };
            }
          }
        });
        result.patents = patents;
      }).catch(() => {})
    );
  }

  if (metric === 'research' || metric === 'all') {
    fetches.push(
      Promise.allSettled([
        axios.get('https://api.semanticscholar.org/graph/v1/paper/search', {
          params: { query: 'research science', fields: 'title,authors,year,citationCount', sort: 'citationCount:desc', limit: 50 },
          timeout: 12_000,
          headers: { 'User-Agent': 'SpymeterOSINT/1.0' },
        }),
        axios.get('https://api.semanticscholar.org/graph/v1/paper/search', {
          params: { query: 'humanities philosophy', fields: 'title,authors,year', limit: 20 },
          timeout: 12_000,
          headers: { 'User-Agent': 'SpymeterOSINT/1.0' },
        }),
      ]).then(([sciR, humR]) => {
        result.research = {
          topScience:   sciR.status  === 'fulfilled' ? (sciR.value.data?.data  || []).slice(0,20) : [],
          humanities:   humR.status  === 'fulfilled' ? (humR.value.data?.data  || []).slice(0,10) : [],
        };
      }).catch(() => {})
    );
  }

  await Promise.allSettled(fetches);

  result.lastUpdate = new Date().toISOString();
  result.metric     = metric;
  cache.culture = { data: result, ts: now };
  res.json(result);
});

// ─── /api/hdx/:countryCode ────────────────────────────────────────────────────
app.get('/api/hdx/:countryCode', async (req, res) => {
  const code = req.params.countryCode.toUpperCase();
  const now  = Date.now();
  if (cache.hdx[code] && now - cache.hdx[code].ts < TTL.HDX)
    return res.json(cache.hdx[code].data);

  const [popR, opR, fsR, refR] = await Promise.allSettled([
    axios.get('https://hapi.humdata.org/api/v1/population-social/population', {
      params: { location_code: code, output_format: 'json', limit: 10 },
      timeout: 10_000, headers: { Accept: 'application/json' },
    }),
    axios.get('https://hapi.humdata.org/api/v1/coordination-context/operational-presence', {
      params: { location_code: code, output_format: 'json', limit: 20 },
      timeout: 10_000, headers: { Accept: 'application/json' },
    }),
    axios.get('https://hapi.humdata.org/api/v1/food/food-security', {
      params: { location_code: code, output_format: 'json', limit: 10 },
      timeout: 10_000, headers: { Accept: 'application/json' },
    }),
    axios.get('https://hapi.humdata.org/api/v1/affected-people/refugees', {
      params: { origin_location_code: code, output_format: 'json', limit: 5 },
      timeout: 10_000, headers: { Accept: 'application/json' },
    }),
  ]);

  const result = {
    population:          popR.status === 'fulfilled' ? popR.value.data?.data  || [] : [],
    operationalPresence: opR.status  === 'fulfilled' ? opR.value.data?.data   || [] : [],
    foodSecurity:        fsR.status  === 'fulfilled' ? fsR.value.data?.data   || [] : [],
    refugees:            refR.status === 'fulfilled' ? refR.value.data?.data  || [] : [],
    lastUpdate:          new Date().toISOString(),
  };
  cache.hdx[code] = { data: result, ts: now };
  res.json(result);
});

// ─── /api/agent-status ────────────────────────────────────────────────────────
app.get('/api/agent-status', (req, res) => {
  res.json({
    iranIsrael:      agentStatus.iranIsrael,
    warZones:        agentStatus.warZones,
    militaryTracker: agentStatus.militaryTracker,
    serverUptime:    process.uptime(),
  });
});

// ─── /api/iran-israel (HTTP cache endpoint) ───────────────────────────────────
app.get('/api/iran-israel', (req, res) => {
  if (!cache.iranIsrael)
    return res.json({ status: 'loading', message: 'Iran-Israel agent initialising' });
  res.json(cache.iranIsrael);
});

// ─── /api/war-zones (HTTP cache endpoint) ────────────────────────────────────
app.get('/api/war-zones', (req, res) => {
  if (!cache.warZones)
    return res.json({ status: 'loading', message: 'War zones agent initialising' });
  res.json(cache.warZones);
});

// ─── /api/military-tracker (HTTP cache endpoint) ─────────────────────────────
app.get('/api/military-tracker', (req, res) => {
  if (!cache.militaryTracker)
    return res.json({ status: 'loading', message: 'Military tracker agent initialising' });
  res.json(cache.militaryTracker);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9B — MARKETS API (Yahoo Finance)
// ═══════════════════════════════════════════════════════════════════════════════
const MARKET_TICKERS = [
  // US
  { sym:'^GSPC',    label:'S&P 500',       flag:'🇺🇸', group:'us' },
  { sym:'^DJI',     label:'Dow Jones',     flag:'🇺🇸', group:'us' },
  { sym:'^IXIC',    label:'Nasdaq',        flag:'🇺🇸', group:'us' },
  { sym:'^VIX',     label:'VIX Fear',      flag:'🇺🇸', group:'us' },
  // India
  { sym:'^NSEI',    label:'Nifty 50',      flag:'🇮🇳', group:'india' },
  { sym:'^BSESN',   label:'Sensex',        flag:'🇮🇳', group:'india' },
  { sym:'^INDIAVIX',label:'India VIX',     flag:'🇮🇳', group:'india' },
  { sym:'RELIANCE.NS',label:'Reliance',    flag:'🇮🇳', group:'india' },
  { sym:'TCS.NS',   label:'TCS',           flag:'🇮🇳', group:'india' },
  { sym:'HDFCBANK.NS',label:'HDFC Bank',   flag:'🇮🇳', group:'india' },
  // China
  { sym:'000001.SS',label:'Shanghai',      flag:'🇨🇳', group:'china' },
  { sym:'^HSI',     label:'Hang Seng',     flag:'🇨🇳', group:'china' },
  { sym:'^HSCE',    label:'H-Shares',      flag:'🇨🇳', group:'china' },
  { sym:'BABA',     label:'Alibaba',       flag:'🇨🇳', group:'china' },
  { sym:'BIDU',     label:'Baidu',         flag:'🇨🇳', group:'china' },
  // Europe / Japan
  { sym:'^FTSE',    label:'FTSE 100',      flag:'🇬🇧', group:'europe' },
  { sym:'^GDAXI',   label:'DAX',           flag:'🇩🇪', group:'europe' },
  { sym:'^FCHI',    label:'CAC 40',        flag:'🇫🇷', group:'europe' },
  { sym:'^N225',    label:'Nikkei 225',    flag:'🇯🇵', group:'europe' },
  // Commodities / Oil
  { sym:'CL=F',     label:'WTI Crude',     flag:'🛢', group:'oil' },
  { sym:'BZ=F',     label:'Brent Crude',   flag:'🛢', group:'oil' },
  { sym:'NG=F',     label:'Nat Gas',       flag:'🔥', group:'oil' },
  { sym:'GC=F',     label:'Gold',          flag:'🥇', group:'oil' },
  { sym:'SI=F',     label:'Silver',        flag:'⚪', group:'oil' },
  // Defense
  { sym:'LMT',      label:'Lockheed',      flag:'🛡', group:'defense' },
  { sym:'RTX',      label:'RTX Corp',      flag:'🛡', group:'defense' },
  { sym:'NOC',      label:'Northrop',      flag:'🛡', group:'defense' },
  { sym:'GD',       label:'Gen Dynamics',  flag:'🛡', group:'defense' },
  { sym:'BA',       label:'Boeing',        flag:'✈', group:'defense' },
  { sym:'HII',      label:'Huntington',    flag:'🚢', group:'defense' },
  // Sectors
  { sym:'XLF',      label:'Financials',    flag:'📊', group:'sectors' },
  { sym:'XLE',      label:'Energy',        flag:'📊', group:'sectors' },
  { sym:'XLK',      label:'Technology',    flag:'📊', group:'sectors' },
  { sym:'XLI',      label:'Industrials',   flag:'📊', group:'sectors' },
  // Crypto
  { sym:'BTC-USD',  label:'Bitcoin',       flag:'₿',  group:'crypto' },
  { sym:'ETH-USD',  label:'Ethereum',      flag:'Ξ',  group:'crypto' },
  { sym:'XRP-USD',  label:'XRP',           flag:'🔷', group:'crypto' },
];

async function fetchYahooQuote(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
  const r = await axios.get(url, {
    timeout: 8_000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
      Referer: 'https://finance.yahoo.com/',
    },
  });
  const meta = r.data?.chart?.result?.[0]?.meta || {};
  return {
    price:  meta.regularMarketPrice  ?? null,
    change: meta.regularMarketChange ?? null,
    pct:    meta.regularMarketChangePercent ?? null,
    state:  meta.marketState || 'CLOSED',
  };
}

app.get('/api/markets', async (req, res) => {
  const now = Date.now();
  if (cache.markets.data && now - cache.markets.ts < TTL.MARKETS)
    return res.json(cache.markets.data);

  const results = await Promise.allSettled(MARKET_TICKERS.map(t => fetchYahooQuote(t.sym)));
  const quotes = MARKET_TICKERS.map((t, i) => {
    const r = results[i];
    const q = r.status === 'fulfilled' ? r.value : { price: null, change: null, pct: null, state: 'N/A' };
    return { ...t, ...q };
  });

  const data = { quotes, ts: now, source: 'Yahoo Finance (15-min delay)' };
  cache.markets = { data, ts: now };
  res.json(data);
});

// ─── /api/market-news ─────────────────────────────────────────────────────────
const MARKET_NEWS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/businessNews',        name: 'Reuters Business' },
  { url: 'https://feeds.reuters.com/reuters/worldNews',           name: 'Reuters World' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',       name: 'BBC Business' },
  { url: 'https://rss.dw.com/rdf/rss-en-world',                  name: 'DW World' },
];
const MARKET_NEWS_KEYWORDS = [
  'market','economy','gdp','inflation','trade','sanction','stock','oil','finance',
  'war','conflict','geopolitical','bank','rate','export','tariff','supply chain',
];

app.get('/api/market-news', async (req, res) => {
  const now = Date.now();
  if (cache.marketNews.data && now - cache.marketNews.ts < TTL.MARKET_NEWS)
    return res.json(cache.marketNews.data);

  const feedResults = await Promise.allSettled(
    MARKET_NEWS_FEEDS.map(f =>
      axios.get(f.url, {
        timeout: 8_000,
        headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
        responseType: 'text',
      }).then(r => parseRSS(r.data, f.name))
    )
  );

  const cutoff = now - 24 * 60 * 60 * 1000;
  const all = [];
  for (const r of feedResults) {
    if (r.status !== 'fulfilled') continue;
    for (const a of r.value) {
      if (!a.pubDate || new Date(a.pubDate).getTime() < cutoff) continue;
      const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
      if (!MARKET_NEWS_KEYWORDS.some(kw => text.includes(kw))) continue;
      all.push({
        title:  a.title,
        url:    a.link,
        source: a.source,
        date:   a.pubDate ? a.pubDate.toISOString().slice(0, 10).replace(/-/g, '') + 'T' + a.pubDate.toISOString().slice(11, 16).replace(':', '') : '',
        tone:   '0',
      });
    }
  }

  all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const data = { articles: all.slice(0, 40), ts: now };
  cache.marketNews = { data, ts: now };
  res.json(data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9C — INDIA OSINT AGENT (every 10 minutes)
// ═══════════════════════════════════════════════════════════════════════════════
const INDIA_FEEDS = [
  { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',         name: 'Times of India' },
  { url: 'https://feeds.feedburner.com/ndtvnews-india-news',                   name: 'NDTV India' },
  { url: 'https://www.thehindu.com/news/national/?service=rss',                name: 'The Hindu' },
  { url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',    name: 'Hindustan Times' },
  { url: 'https://www.indiatoday.in/rss/home',                                 name: 'India Today' },
  { url: 'https://feeds.feedburner.com/ndtvnews-latest',                       name: 'NDTV Latest' },
  { url: 'https://economictimes.indiatimes.com/rssfeedstopstories.cms',        name: 'Economic Times' },
  { url: 'https://www.business-standard.com/rss/latest.rss',                  name: 'Business Standard' },
  { url: 'https://www.livemint.com/rss/news',                                  name: 'Livemint' },
  { url: 'https://feeds.reuters.com/reuters/worldNews',                        name: 'Reuters (India filter)' },
];
const INDIA_KEYWORDS = [
  'india','indian','modi','new delhi','bjp','congress','lok sabha','rajya sabha',
  'kashmir','ladakh','pakistan','china border','lac','line of actual control',
  'isro','chandrayaan','gaganyaan','indian army','indian navy','indian air force',
  'mumbai','delhi','bangalore','chennai','hyderabad','kolkata',
  'rupee','sensex','nifty','rbi','reserve bank','economy','gdp',
  'border','troops','military','drone','missile','cyber',
];

async function indiaOsintAgent() {
  const now = Date.now();
  try {
    const feedResults = await Promise.allSettled(
      INDIA_FEEDS.map(f =>
        axios.get(f.url, {
          timeout: 10_000,
          headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
          responseType: 'text',
        }).then(r => parseRSS(r.data, f.name))
      )
    );

    const cutoff = now - 24 * 60 * 60 * 1000;
    const all = [];
    for (const r of feedResults) {
      if (r.status !== 'fulfilled') continue;
      for (const a of r.value) {
        if (!a.pubDate || new Date(a.pubDate).getTime() < cutoff) continue;
        const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
        if (!INDIA_KEYWORDS.some(kw => text.includes(kw))) continue;
        const cats = [];
        if (/\b(military|army|navy|air force|missile|border|troops|lac|kashmir)\b/.test(text)) cats.push('defence');
        if (/\b(economy|gdp|rupee|sensex|nifty|rbi|trade|inflation)\b/.test(text)) cats.push('economy');
        if (/\b(isro|space|satellite|launch|chandrayaan)\b/.test(text)) cats.push('space');
        if (/\b(pakistan|china|border|lac|doklam)\b/.test(text)) cats.push('geopolitics');
        all.push({
          title:       a.title,
          url:         a.link,
          source:      a.source,
          description: (a.description || '').slice(0, 200),
          pubDate:     a.pubDate ? a.pubDate.toISOString() : null,
          categories:  cats,
        });
      }
    }

    all.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
    const deduped = deduplicateArticles(all);
    recordKeywords(deduped);
    cache.indiaNews = {
      data: { articles: deduped.slice(0, 60), ts: now, total: deduped.length },
      ts: now,
    };
    console.log(`[IndiaAgent] ${all.length} raw → ${deduped.length} deduped India OSINT articles`);
  } catch (err) {
    console.error('[IndiaAgent]', err.message);
  }
}

indiaOsintAgent();
setInterval(indiaOsintAgent, TTL.INDIA_NEWS);

app.get('/api/india-news', (req, res) => {
  if (!cache.indiaNews.data) return res.json({ articles: [], ts: Date.now(), status: 'loading' });
  res.json(cache.indiaNews.data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9D — CHINA OSINT AGENT (every 10 minutes)
// ═══════════════════════════════════════════════════════════════════════════════
const CHINA_FEEDS = [
  { url: 'https://www.scmp.com/rss/91/feed',                      name: 'South China Morning Post' },
  { url: 'https://www.scmp.com/rss/2/feed',                       name: 'SCMP China' },
  { url: 'https://feeds.reuters.com/reuters/worldNews',           name: 'Reuters (China filter)' },
  { url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml',     name: 'BBC Asia' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',             name: 'Al Jazeera' },
  { url: 'https://rss.dw.com/rdf/rss-en-world',                  name: 'DW World' },
  { url: 'https://asia.nikkei.com/rss/feed/nar',                  name: 'Nikkei Asia' },
  { url: 'https://www.rfa.org/english/china/rss2.xml',            name: 'Radio Free Asia' },
  { url: 'https://www.theguardian.com/world/china/rss',           name: 'Guardian China' },
];
const CHINA_KEYWORDS = [
  'china','chinese','beijing','xi jinping','pla','ccp','communist party',
  'taiwan','south china sea','hong kong','xinjiang','tibet','uyghur',
  'pla navy','j-20','df-41','hypersonic','carrier','military exercise',
  'belt and road','bri','trade war','tariff','rare earth','semiconductor',
  'shanghai','shenzhen','alibaba','huawei','tiktok','bytedance',
  'yuan','renminbi','pboc','gdp','economy','export',
];

async function chinaOsintAgent() {
  const now = Date.now();
  try {
    const feedResults = await Promise.allSettled(
      CHINA_FEEDS.map(f =>
        axios.get(f.url, {
          timeout: 10_000,
          headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
          responseType: 'text',
        }).then(r => parseRSS(r.data, f.name))
      )
    );

    const cutoff = now - 24 * 60 * 60 * 1000;
    const all = [];
    for (const r of feedResults) {
      if (r.status !== 'fulfilled') continue;
      for (const a of r.value) {
        if (!a.pubDate || new Date(a.pubDate).getTime() < cutoff) continue;
        const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
        if (!CHINA_KEYWORDS.some(kw => text.includes(kw))) continue;
        const cats = [];
        if (/\b(pla|military|navy|air force|missile|taiwan|south china sea|exercise|carrier)\b/.test(text)) cats.push('military');
        if (/\b(economy|yuan|gdp|trade|tariff|export|manufacturing)\b/.test(text)) cats.push('economy');
        if (/\b(taiwan|hong kong|xinjiang|tibet|south china sea)\b/.test(text)) cats.push('geopolitics');
        if (/\b(huawei|semiconductor|tech|ai|space)\b/.test(text)) cats.push('tech');
        all.push({
          title:       a.title,
          url:         a.link,
          source:      a.source,
          description: (a.description || '').slice(0, 200),
          pubDate:     a.pubDate ? a.pubDate.toISOString() : null,
          categories:  cats,
        });
      }
    }

    all.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
    const deduped = deduplicateArticles(all);
    recordKeywords(deduped);
    cache.chinaNews = {
      data: { articles: deduped.slice(0, 60), ts: now, total: deduped.length },
      ts: now,
    };
    console.log(`[ChinaAgent] ${all.length} raw → ${deduped.length} deduped China OSINT articles`);
  } catch (err) {
    console.error('[ChinaAgent]', err.message);
  }
}

chinaOsintAgent();
setInterval(chinaOsintAgent, TTL.CHINA_NEWS);

app.get('/api/china-news', (req, res) => {
  if (!cache.chinaNews.data) return res.json({ articles: [], ts: Date.now(), status: 'loading' });
  res.json(cache.chinaNews.data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9E — AI & TECH OSINT AGENT (every 15 minutes)
// ═══════════════════════════════════════════════════════════════════════════════
const AI_TECH_FEEDS = [
  { url: 'https://feeds.feedburner.com/TechCrunch/',                name: 'TechCrunch' },
  { url: 'https://www.wired.com/feed/rss',                          name: 'Wired' },
  { url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',name: 'Ars Technica AI' },
  { url: 'https://rss.slashdot.org/Slashdot/slashdotMain',          name: 'Slashdot' },
  { url: 'https://www.technologyreview.com/feed/',                  name: 'MIT Tech Review' },
  { url: 'https://venturebeat.com/feed/',                           name: 'VentureBeat' },
  { url: 'https://feeds.reuters.com/reuters/technologyNews',        name: 'Reuters Tech' },
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',       name: 'BBC Tech' },
];
const AI_KEYWORDS = [
  'artificial intelligence','machine learning','llm','gpt','gemini','claude','deepseek',
  'neural network','autonomous','robotics','drone ai','military ai','cyberwar','cyber attack',
  'semiconductor','chip','nvidia','quantum computing','surveillance','facial recognition',
  'deepfake','disinformation','hack','zero-day','vulnerability','ransomware',
  'satellite','space tech','hypersonic','directed energy','autonomous weapon',
];

const _aiNewsCache = { data: null, ts: 0 };
const TTL_AI_NEWS = 15 * 60_000;

async function aiTechAgent() {
  const now = Date.now();
  try {
    const feedResults = await Promise.allSettled(
      AI_TECH_FEEDS.map(f =>
        axios.get(f.url, {
          timeout: 10_000,
          headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
          responseType: 'text',
        }).then(r => parseRSS(r.data, f.name))
      )
    );
    const cutoff = now - 24 * 60 * 60 * 1000;
    const all = [];
    for (const r of feedResults) {
      if (r.status !== 'fulfilled') continue;
      for (const a of r.value) {
        if (!a.pubDate || new Date(a.pubDate).getTime() < cutoff) continue;
        const text = ((a.title || '') + ' ' + (a.description || '')).toLowerCase();
        if (!AI_KEYWORDS.some(kw => text.includes(kw))) continue;
        all.push({
          title:       a.title,
          url:         a.link,
          source:      a.source,
          description: (a.description || '').slice(0, 200),
          pubDate:     a.pubDate ? a.pubDate.toISOString() : null,
        });
      }
    }
    all.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
    _aiNewsCache.data = { articles: all.slice(0, 50), ts: now };
    _aiNewsCache.ts   = now;
    console.log(`[AITechAgent] ${all.length} AI/tech OSINT articles scraped`);
  } catch (err) {
    console.error('[AITechAgent]', err.message);
  }
}

aiTechAgent();
setInterval(aiTechAgent, TTL_AI_NEWS);

app.get('/api/ai-news', (req, res) => {
  if (!_aiNewsCache.data) return res.json({ articles: [], ts: Date.now(), status: 'loading' });
  res.json(_aiNewsCache.data);
});

// ─── /api/rss-news — CSV-driven RSS news panel ────────────────────────────────
const _rssNewsCache = { data: null, ts: 0 };
const TTL_RSS_NEWS  = 15 * 60_000;

function _parseCSVRow(line) {
  const cols = []; let field = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { field += '"'; i++; } else { inQ = !inQ; } }
    else if (c === ',' && !inQ) { cols.push(field); field = ''; }
    else { field += c; }
  }
  cols.push(field);
  return cols;
}

let _csvFeeds = null;
function _loadFeedsCSV() {
  if (_csvFeeds) return _csvFeeds;
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'public', 'rss-feeds-report (1).csv'), 'utf8');
    const lines = raw.trim().split('\n').slice(1);
    const feeds = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = _parseCSVRow(line);
      if (cols.length < 8) continue;
      const [, , category, feedName, status, , , url] = cols;
      if (status === 'OK' && url && url.startsWith('http'))
        feeds.push({ name: feedName.trim(), category: category.trim(), url: url.trim() });
    }
    _csvFeeds = feeds;
    console.log(`[RSS-CSV] Loaded ${feeds.length} OK feeds`);
    return feeds;
  } catch (e) { console.error('[RSS-CSV]', e.message); return []; }
}

async function _refreshRSSNews() {
  const now = Date.now();
  if (_rssNewsCache.data && (now - _rssNewsCache.ts) < TTL_RSS_NEWS) return;
  const feeds = _loadFeedsCSV();
  if (!feeds.length) return;
  const sample = [...feeds].sort(() => Math.random() - 0.5).slice(0, 45);
  const results = await Promise.allSettled(
    sample.map(f =>
      axios.get(f.url, {
        timeout: 8_000,
        headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
        responseType: 'text',
      }).then(r => ({ items: parseRSS(r.data, f.name), category: f.category }))
    )
  );
  const cutoff = now - 48 * 60 * 60 * 1000;
  const all = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const a of r.value.items) {
      const t = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      if (t && t < cutoff) continue;
      all.push({
        title:       a.title,
        url:         a.link,
        source:      a.source,
        description: (a.description || '').slice(0, 180),
        pubDate:     a.pubDate ? a.pubDate.toISOString() : null,
        category:    r.value.category,
      });
    }
  }
  all.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
  _rssNewsCache.data = { articles: all.slice(0, 150), ts: now };
  _rssNewsCache.ts   = now;
  console.log(`[RSS-News] ${all.length} articles from ${sample.length} feeds`);
}

_refreshRSSNews();
setInterval(_refreshRSSNews, TTL_RSS_NEWS);

app.get('/api/rss-news', async (req, res) => {
  try {
    await _refreshRSSNews();
    const { articles = [], ts } = _rssNewsCache.data || {};
    const cat = req.query.category;
    const out  = (cat && cat !== 'all') ? articles.filter(a => a.category === cat) : articles;
    res.json({ articles: out.slice(0, 100), ts });
  } catch (e) {
    res.status(500).json({ error: e.message, articles: [] });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — WEBSOCKET
// ═══════════════════════════════════════════════════════════════════════════════
const clients = new Set();

wss.on('connection', ws => {
  clients.add(ws);

  // Send init payload immediately
  try {
    ws.send(JSON.stringify({
      type: 'init',
      data: {
        aircraft:       cache.aircraft.data,
        iranIsrael:     cache.iranIsrael,
        warZones:       cache.warZones,
        militaryTracker:cache.militaryTracker,
        agentStatus,
      },
      ts: Date.now(),
    }));
  } catch (_) {}

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(type, data) {
  if (!clients.size) return;
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  for (const c of clients) {
    try {
      if (c.readyState === WebSocket.OPEN) c.send(msg);
    } catch (_) {}
  }
}

// Periodic aircraft push to WebSocket clients
setInterval(async () => {
  if (!clients.size) return;
  try {
    const now = Date.now();
    if (cache.aircraft.data && now - cache.aircraft.ts < TTL.AC) {
      broadcast('aircraft', cache.aircraft.data);
      return;
    }
    const resp = await axios.get(`http://127.0.0.1:${PORT}/api/aircraft`, { timeout: 15_000 });
    broadcast('aircraft', resp.data);
  } catch (_) {}
}, 15_000);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — START SERVER
// ═══════════════════════════════════════════════════════════════════════════════
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n[OSINT Dashboard] Running at http://localhost:${PORT}\n`);
});
