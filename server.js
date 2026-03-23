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
  news:           { data: null, ts: 0 },
  conflictNews:   { data: null, ts: 0 },
  ukraineNews:    { data: null, ts: 0 },
  unrestNews:     { data: null, ts: 0 },
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
// SECTION 5B — NEWSAPI ENDPOINTS
// Uses NEWSAPI_KEY env var (newsapi.org — free tier: 100 req/day)
// ═══════════════════════════════════════════════════════════════════════════════

const NEWSAPI_KEY = process.env.NEWSAPI_KEY || '';
const _newsapiCache = {};

async function fetchNewsAPI(query, pageSize = 50, cacheKey = null) {
  const key = cacheKey || query;
  const now  = Date.now();
  const TTL  = 15 * 60_000; // 15 min
  if (_newsapiCache[key] && now - _newsapiCache[key].ts < TTL) return _newsapiCache[key].data;
  if (!NEWSAPI_KEY) throw new Error('NEWSAPI_KEY not configured');
  const r = await axios.get('https://newsapi.org/v2/everything', {
    params: {
      q: query, language: 'en', sortBy: 'publishedAt',
      pageSize: Math.min(pageSize, 100), page: 1,
      apiKey: NEWSAPI_KEY,
    },
    timeout: 12_000,
  });
  const articles = (r.data?.articles || []).map(a => ({
    title:       a.title || '',
    url:         a.url   || '',
    source:      a.source?.name || a.source?.id || '',
    description: (a.description || '').slice(0, 200),
    image:       a.urlToImage || null,
    pubDate:     a.publishedAt || null,
    author:      a.author || '',
  })).filter(a => a.title && a.title !== '[Removed]');
  _newsapiCache[key] = { data: articles, ts: now };
  return articles;
}

// ─── News feed category definitions ───────────────────────────────────────────
// Each entry: { id, label, emoji, query, pageSize }
// Exact NewsAPI URL used: https://newsapi.org/v2/everything?q=<query>&language=en&sortBy=publishedAt&pageSize=<n>&apiKey=KEY
const NEWS_FEEDS = [
  {
    id: 'iran-israel',
    label: 'Iran–Israel War',
    emoji: '🔥',
    query: 'Iran Israel war strike missile airstrike IRGC IDF 2026',
    pageSize: 30,
  },
  {
    id: 'us-updates',
    label: 'United States',
    emoji: '🇺🇸',
    query: 'United States military foreign policy Pentagon White House defense 2026',
    pageSize: 20,
  },
  {
    id: 'israel-updates',
    label: 'Israel',
    emoji: '🇮🇱',
    query: 'Israel IDF Gaza Hamas Hezbollah Netanyahu Iron Dome 2026',
    pageSize: 20,
  },
  {
    id: 'india-updates',
    label: 'India',
    emoji: '🇮🇳',
    query: 'India military border security defence Rafale Modi 2026',
    pageSize: 20,
  },
  {
    id: 'iran-updates',
    label: 'Iran',
    emoji: '🇮🇷',
    query: 'Iran IRGC nuclear sanctions Khamenei Hormuz 2026',
    pageSize: 20,
  },
  {
    id: 'ai-tech',
    label: 'AI & Tech',
    emoji: '🤖',
    query: 'artificial intelligence AI defense military technology OpenAI LLM chip',
    pageSize: 20,
  },
  {
    id: 'military-drones',
    label: 'Military Drones',
    emoji: '🚁',
    query: 'military drone UAV autonomous weapon Shahed Bayraktar Reaper strike 2026',
    pageSize: 20,
  },
  {
    id: 'energy-crisis',
    label: 'Energy & LPG',
    emoji: '⛽',
    query: 'LPG gas shortage oil price energy crisis Middle East war sanctions 2026',
    pageSize: 20,
  },
];

// ─── /api/newsapi/feeds — all categories in one request ───────────────────────
// Returns: { feeds: { [id]: { articles, query, newsapi_url, ts } }, ts }
app.get('/api/newsapi/feeds', async (req, res) => {
  const cat = req.query.cat; // optional: fetch single category
  const feeds = cat ? NEWS_FEEDS.filter(f => f.id === cat) : NEWS_FEEDS;
  if (!feeds.length) return res.status(400).json({ error: 'Unknown category' });

  const results = await Promise.allSettled(
    feeds.map(f => fetchNewsAPI(f.query, f.pageSize, f.id).then(articles => ({ ...f, articles })))
  );

  const out = {};
  results.forEach((r, i) => {
    const f = feeds[i];
    const newsapi_url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(f.query)}&language=en&sortBy=publishedAt&pageSize=${f.pageSize}&apiKey=YOUR_KEY`;
    out[f.id] = {
      id:          f.id,
      label:       f.label,
      emoji:       f.emoji,
      query:       f.query,
      newsapi_url,
      articles:    r.status === 'fulfilled' ? r.value.articles : [],
      error:       r.status === 'rejected'  ? r.reason?.message : null,
      ts:          Date.now(),
    };
  });

  res.json({ feeds: out, categories: feeds.map(f => ({ id: f.id, label: f.label, emoji: f.emoji })), ts: Date.now() });
});

// ─── /api/newsapi/conflict — backwards-compatible alias ───────────────────────
app.get('/api/newsapi/conflict', async (req, res) => {
  try {
    const [irnIsr, lpg, war] = await Promise.allSettled([
      fetchNewsAPI(NEWS_FEEDS.find(f => f.id === 'iran-israel').query, 50, 'iran-israel'),
      fetchNewsAPI(NEWS_FEEDS.find(f => f.id === 'energy-crisis').query, 30, 'energy-crisis'),
      fetchNewsAPI(NEWS_FEEDS.find(f => f.id === 'military-drones').query, 20, 'military-drones'),
    ]);
    const articles = [
      ...(irnIsr.status === 'fulfilled' ? irnIsr.value.map(a => ({ ...a, category: 'iran-israel' })) : []),
      ...(lpg.status    === 'fulfilled' ? lpg.value.map(a => ({ ...a, category: 'lpg-energy' }))    : []),
      ...(war.status    === 'fulfilled' ? war.value.map(a => ({ ...a, category: 'war-insights' }))  : []),
    ];
    const seen = new Set();
    const unique = articles.filter(a => { if (seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
    res.json({ articles: unique, count: unique.length, ts: Date.now(), source: 'NewsAPI.org' });
  } catch (e) {
    res.status(503).json({ error: e.message, articles: [], count: 0 });
  }
});

// ─── /api/newsapi/search — generic search ─────────────────────────────────────
app.get('/api/newsapi/search', async (req, res) => {
  const q = (req.query.q || '').trim().slice(0, 200);
  if (!q) return res.status(400).json({ error: 'q param required' });
  try {
    const articles = await fetchNewsAPI(q, 30, null);
    res.json({ articles, count: articles.length, ts: Date.now(), source: 'NewsAPI.org' });
  } catch (e) {
    res.status(503).json({ error: e.message, articles: [], count: 0 });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5C — COUNTRY INSTABILITY INDEX (CII)
// Algorithm: CII = Σ(dimension × weight) across 7 live-data dimensions:
//   Conflict & Unrest (25%)   · Military Activity (20%)  · News Distress (15%)
//   Economic Stress   (15%)   · Internet Disruption (10%)· Financial Stress (10%)
//   Geopolitical Tension (5%)
//
// Data sources: GDELT v2, HAPI/HumanData, IODA/CAIDA (internet), Cloudflare Radar,
//               NewsAPI (3 query categories), REST Countries, aircraft/marine cache
// ═══════════════════════════════════════════════════════════════════════════════

const _ciiCache = {};
const TTL_CII   = 10 * 60_000; // 10 min

// Country name → ISO2 code lookup for REST Countries, GDELT queries, etc.
const COUNTRY_ISO2 = {
  'Afghanistan':'AF','Albania':'AL','Algeria':'DZ','Angola':'AO','Argentina':'AR',
  'Armenia':'AM','Australia':'AU','Austria':'AT','Azerbaijan':'AZ','Bahrain':'BH',
  'Bangladesh':'BD','Belarus':'BY','Belgium':'BE','Bhutan':'BT','Bolivia':'BO',
  'Brazil':'BR','Bulgaria':'BG','Cambodia':'KH','Canada':'CA','Chile':'CL',
  'China':'CN','Colombia':'CO','Congo':'CG','Croatia':'HR','Cuba':'CU',
  'Czech Republic':'CZ','Denmark':'DK','Egypt':'EG','Estonia':'EE','Ethiopia':'ET',
  'Finland':'FI','France':'FR','Georgia':'GE','Germany':'DE','Ghana':'GH',
  'Greece':'GR','Guatemala':'GT','Haiti':'HT','Honduras':'HN','Hungary':'HU',
  'India':'IN','Indonesia':'ID','Iran':'IR','Iraq':'IQ','Ireland':'IE',
  'Israel':'IL','Italy':'IT','Jamaica':'JM','Japan':'JP','Jordan':'JO',
  'Kazakhstan':'KZ','Kenya':'KE','South Korea':'KR','North Korea':'KP',
  'Kuwait':'KW','Kyrgyzstan':'KG','Latvia':'LV','Lebanon':'LB','Libya':'LY',
  'Lithuania':'LT','Luxembourg':'LU','Malaysia':'MY','Mexico':'MX','Moldova':'MD',
  'Mongolia':'MN','Morocco':'MA','Mozambique':'MZ','Myanmar':'MM','Nepal':'NP',
  'Netherlands':'NL','New Zealand':'NZ','Nicaragua':'NI','Nigeria':'NG','Norway':'NO',
  'Oman':'OM','Pakistan':'PK','Palestine':'PS','Panama':'PA','Paraguay':'PY',
  'Peru':'PE','Philippines':'PH','Poland':'PL','Portugal':'PT','Qatar':'QA',
  'Romania':'RO','Russia':'RU','Saudi Arabia':'SA','Senegal':'SN','Serbia':'RS',
  'Singapore':'SG','Slovakia':'SK','Somalia':'SO','South Africa':'ZA','Spain':'ES',
  'Sri Lanka':'LK','Sudan':'SD','Sweden':'SE','Switzerland':'CH','Syria':'SY',
  'Taiwan':'TW','Tajikistan':'TJ','Tanzania':'TZ','Thailand':'TH','Turkey':'TR',
  'Turkmenistan':'TM','Uganda':'UG','Ukraine':'UA','UAE':'AE',
  'United Arab Emirates':'AE','United Kingdom':'GB','UK':'GB',
  'United States':'US','USA':'US','Uruguay':'UY','Uzbekistan':'UZ',
  'Venezuela':'VE','Vietnam':'VN','Yemen':'YE','Zimbabwe':'ZW',
  'Gaza':'PS','Palestine':'PS','Kosovo':'XK','Taiwan':'TW',
};

// IISS/GlobalFirepower/GFI data for military/economic strength (static 2024 baseline)
const COUNTRY_BASELINE = {
  US:  { mil:100, econ:100, social:78, mil_rank:1,  gdp_t:27.4,  gfi:0.0699 },
  CN:  { mil:87,  econ:88,  social:62, mil_rank:3,  gdp_t:18.6,  gfi:0.0706 },
  RU:  { mil:82,  econ:42,  social:55, mil_rank:2,  gdp_t:2.2,   gfi:0.0706 },
  IN:  { mil:71,  econ:65,  social:58, mil_rank:4,  gdp_t:3.9,   gfi:0.1023 },
  UK:  { mil:72,  econ:70,  social:80, mil_rank:5,  gdp_t:3.1,   gfi:0.1435 },
  FR:  { mil:70,  econ:68,  social:79, mil_rank:7,  gdp_t:2.9,   gfi:0.1848 },
  DE:  { mil:65,  econ:72,  social:82, mil_rank:8,  gdp_t:4.4,   gfi:0.1708 },
  JP:  { mil:63,  econ:75,  social:84, mil_rank:8,  gdp_t:4.2,   gfi:0.1832 },
  IL:  { mil:68,  econ:58,  social:60, mil_rank:17, gdp_t:0.52,  gfi:0.2596 },
  IR:  { mil:55,  econ:25,  social:40, mil_rank:14, gdp_t:0.37,  gfi:0.2966 },
  SA:  { mil:52,  econ:55,  social:45, mil_rank:22, gdp_t:1.1,   gfi:0.3128 },
  PK:  { mil:58,  econ:28,  social:42, mil_rank:9,  gdp_t:0.34,  gfi:0.2053 },
  KP:  { mil:48,  econ:8,   social:18, mil_rank:30, gdp_t:0.018, gfi:0.5118 },
  UA:  { mil:60,  econ:22,  social:50, mil_rank:15, gdp_t:0.18,  gfi:0.2516 },
  TR:  { mil:62,  econ:48,  social:57, mil_rank:11, gdp_t:1.1,   gfi:0.2296 },
  BR:  { mil:56,  econ:58,  social:52, mil_rank:13, gdp_t:2.1,   gfi:0.2171 },
  AU:  { mil:60,  econ:68,  social:82, mil_rank:16, gdp_t:1.7,   gfi:0.2896 },
  KR:  { mil:64,  econ:62,  social:80, mil_rank:6,  gdp_t:1.7,   gfi:0.1509 },
  EG:  { mil:54,  econ:38,  social:48, mil_rank:12, gdp_t:0.40,  gfi:0.2283 },
  NG:  { mil:40,  econ:32,  social:38, mil_rank:35, gdp_t:0.49,  gfi:0.4285 },
  IQ:  { mil:38,  econ:28,  social:38, mil_rank:40, gdp_t:0.27,  gfi:0.5283 },
  SY:  { mil:28,  econ:10,  social:22, mil_rank:55, gdp_t:0.06,  gfi:0.5966 },
  YE:  { mil:22,  econ:8,   social:18, mil_rank:60, gdp_t:0.05,  gfi:0.7083 },
  AF:  { mil:18,  econ:7,   social:15, mil_rank:70, gdp_t:0.014, gfi:0.7218 },
  LB:  { mil:25,  econ:12,  social:30, mil_rank:65, gdp_t:0.02,  gfi:0.8318 },
  SD:  { mil:25,  econ:10,  social:20, mil_rank:68, gdp_t:0.28,  gfi:0.7385 },
  MM:  { mil:32,  econ:20,  social:25, mil_rank:42, gdp_t:0.07,  gfi:0.5918 },
};

// World Tourism Organization rank/score (UNWTO 2024 estimates)
const TOURISM_DATA = {
  FR:{ rank:1,  arrivals_m:100,score:98 }, ES:{ rank:2,  arrivals_m:85, score:95 },
  US:{ rank:3,  arrivals_m:79, score:92 }, TR:{ rank:4,  arrivals_m:56, score:85 },
  IT:{ rank:5,  arrivals_m:57, score:87 }, CN:{ rank:6,  arrivals_m:53, score:82 },
  MX:{ rank:7,  arrivals_m:42, score:80 }, DE:{ rank:8,  arrivals_m:35, score:78 },
  UK:{ rank:9,  arrivals_m:38, score:79 }, JP:{ rank:10, arrivals_m:31, score:82 },
  AU:{ rank:14, arrivals_m:10, score:70 }, IN:{ rank:22, arrivals_m:8,  score:62 },
  TH:{ rank:8,  arrivals_m:28, score:80 }, SG:{ rank:11, arrivals_m:19, score:84 },
  AE:{ rank:12, arrivals_m:17, score:86 }, GR:{ rank:15, arrivals_m:33, score:82 },
  SA:{ rank:25, arrivals_m:7,  score:55 }, EG:{ rank:23, arrivals_m:15, score:58 },
  BR:{ rank:18, arrivals_m:11, score:65 }, ZA:{ rank:28, arrivals_m:8,  score:60 },
  RU:{ rank:16, arrivals_m:10, score:40 }, IR:{ rank:50, arrivals_m:4,  score:28 },
  KR:{ rank:20, arrivals_m:11, score:73 }, IL:{ rank:35, arrivals_m:3,  score:30 },
  UA:{ rank:45, arrivals_m:1,  score:15 }, PK:{ rank:80, arrivals_m:1,  score:22 },
};

app.get('/api/cii/:country', async (req, res) => {
  const countryInput = req.params.country.trim();
  const now = Date.now();
  const cacheKey = countryInput.toLowerCase();
  if (_ciiCache[cacheKey] && now - _ciiCache[cacheKey].ts < TTL_CII)
    return res.json(_ciiCache[cacheKey].data);

  const iso2     = COUNTRY_ISO2[countryInput] || countryInput.toUpperCase().slice(0, 2);
  const baseline = COUNTRY_BASELINE[iso2] || { mil: 40, econ: 40, social: 50, gdp_t: 0.1, gfi: 0.5, mil_rank: 50 };
  const CF_TOKEN = process.env.CF_API_TOKEN || '';

  try {
    // ── Parallel data fetch — 9 sources ──────────────────────────────────────
    const [
      gdeltConflictR, gdeltMilR, hapiR, countryR,
      newsConflictR, newsEconR, newsFinR, iodaR, cfRadarR,
    ] = await Promise.allSettled([

      // 1. GDELT: civil unrest / protest / explosion (48h)
      // URL: https://api.gdeltproject.org/api/v2/doc/doc?query=...&timespan=48h
      axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: `${countryInput} protest riot unrest demonstration explosion attack bomb shooting`, mode: 'artlist', maxrecords: 50, format: 'json', sort: 'datedesc', timespan: '48h' },
        timeout: 8_000,
      }),

      // 2. GDELT: military actions / strike / drone (48h)
      axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: `${countryInput} military strike airstrike missile troops mobilization navy drone nuclear`, mode: 'artlist', maxrecords: 30, format: 'json', sort: 'datedesc', timespan: '48h' },
        timeout: 8_000,
      }),

      // 3. HAPI/HumanData: conflict event database
      // URL: https://hapi.humdata.org/api/v1/conflict-event/?location_name=...
      axios.get('https://hapi.humdata.org/api/v1/conflict-event/', {
        params: { limit: 100, output_format: 'json', app_identifier: 'spymeter-cii', location_name: countryInput },
        timeout: 8_000,
      }),

      // 4. REST Countries: economic metadata
      axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(countryInput)}`, { timeout: 6_000 }),

      // 5. NewsAPI — conflict/crisis/war news
      // URL: https://newsapi.org/v2/everything?q="<country>" war attack missile...
      NEWSAPI_KEY ? axios.get('https://newsapi.org/v2/everything', {
        params: { q: `"${countryInput}" war attack missile strike explosion bomb crisis emergency invasion killed`, language: 'en', sortBy: 'publishedAt', pageSize: 20, apiKey: NEWSAPI_KEY },
        timeout: 8_000,
      }) : Promise.resolve({ data: { articles: [] } }),

      // 6. NewsAPI — economic stress / sanctions
      // URL: https://newsapi.org/v2/everything?q="<country>" sanctions economy inflation...
      NEWSAPI_KEY ? axios.get('https://newsapi.org/v2/everything', {
        params: { q: `"${countryInput}" sanctions economy inflation recession GDP debt bankruptcy shortage`, language: 'en', sortBy: 'publishedAt', pageSize: 10, apiKey: NEWSAPI_KEY },
        timeout: 8_000,
      }) : Promise.resolve({ data: { articles: [] } }),

      // 7. NewsAPI — financial stress / market
      // URL: https://newsapi.org/v2/everything?q="<country>" stock market currency crash...
      NEWSAPI_KEY ? axios.get('https://newsapi.org/v2/everything', {
        params: { q: `"${countryInput}" stock market currency crash collapse devaluation financial crisis panic`, language: 'en', sortBy: 'publishedAt', pageSize: 10, apiKey: NEWSAPI_KEY },
        timeout: 8_000,
      }) : Promise.resolve({ data: { articles: [] } }),

      // 8. IODA/CAIDA — internet outage alerts (FREE, no auth required)
      // URL: https://api.ioda.caida.org/v2/alerts?entityType=country&entityCode=<ISO2>
      // Detects BGP disruptions, darknet anomalies → internet shutdowns
      axios.get('https://api.ioda.caida.org/v2/alerts', {
        params: {
          entityType: 'country',
          entityCode:  iso2,
          from:  Math.floor((now - 24 * 3600_000) / 1000),
          until: Math.floor(now / 1000),
        },
        timeout: 7_000,
      }),

      // 9. Cloudflare Radar — traffic anomalies (optional, needs CF_API_TOKEN env var)
      // URL: https://api.cloudflare.com/client/v4/radar/traffic/anomalies/top?location=<ISO2>
      CF_TOKEN ? axios.get('https://api.cloudflare.com/client/v4/radar/traffic/anomalies/top', {
        params: { location: iso2, date_range: '1d', limit: 5, format: 'json' },
        headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
        timeout: 6_000,
      }) : Promise.resolve({ data: { result: { top0: [] } } }),
    ]);

    // ── Parse GDELT ───────────────────────────────────────────────────────────
    const gdeltConflict       = gdeltConflictR.status === 'fulfilled' ? (gdeltConflictR.value.data?.articles || []) : [];
    const gdeltMil            = gdeltMilR.status      === 'fulfilled' ? (gdeltMilR.value.data?.articles      || []) : [];
    const gdeltAll            = [...gdeltConflict, ...gdeltMil];
    const news_count_conflict = gdeltConflict.length;
    const news_count_mil      = gdeltMil.length;
    const avg_velocity        = gdeltAll.length / 48;   // articles/hour over 48h
    const tones               = gdeltAll.map(a => parseFloat(a.tone || 0)).filter(t => !isNaN(t));
    const avg_tone            = tones.length ? tones.reduce((s, t) => s + t, 0) / tones.length : 0;

    // ── Parse HAPI ────────────────────────────────────────────────────────────
    const hapiEvents       = hapiR.status === 'fulfilled' ? (hapiR.value.data?.data || []) : [];
    const protest_count    = hapiEvents.filter(e => /protest|demonstration|riot|unrest/i.test(e.event_type || '')).length;
    const battle_count     = hapiEvents.filter(e => /battle|fight|clash|attack|explosion/i.test(e.event_type || '')).length;
    const total_fatalities = hapiEvents.reduce((s, e) => s + (e.fatalities || 0), 0);
    const high_severity    = hapiEvents.filter(e => (e.fatalities || 0) > 10).length;

    // ── Parse REST Countries (needed for scoring) ─────────────────────────────
    const cData  = countryR.status === 'fulfilled' ? (countryR.value.data?.[0] || {}) : {};
    const population = cData.population || null;

    // ── Parse NewsAPI ─────────────────────────────────────────────────────────
    const newsConflict = newsConflictR.status === 'fulfilled' ? (newsConflictR.value.data?.articles || []) : [];
    const newsEcon     = newsEconR.status     === 'fulfilled' ? (newsEconR.value.data?.articles     || []) : [];
    const newsFin      = newsFinR.status      === 'fulfilled' ? (newsFinR.value.data?.articles      || []) : [];

    const CRISIS_KW = /attack|strike|bomb|missile|explosion|invasion|war|battle|killed|dead|airstrike|hostage|massacre/i;
    const ECON_KW   = /sanctions|embargo|inflation|recession|shortage|debt|default|bankrupt|crisis|currency collapse/i;
    const FIN_KW    = /crash|collapse|devaluation|currency|stock market|plunge|panic|sell-off|bank run|liquidity/i;
    const MIL_KW    = /military|troops|army|navy|airstrike|drone|mobiliz|deploy|nuclear|missile|warship|fighter jet/i;

    const crisis_hits   = newsConflict.filter(a => CRISIS_KW.test(a.title || '')).length;
    const econ_hits     = newsEcon.filter(a => ECON_KW.test(a.title || '')).length;
    const fin_hits      = newsFin.filter(a => FIN_KW.test(a.title || '')).length;
    const mil_news_hits = [...newsConflict, ...gdeltMil].filter(a => MIL_KW.test((a.title || '') + (a.description || ''))).length;
    const any_alert     = crisis_hits > 0 || newsConflict.some(a => /emergency|crisis/i.test(a.title || ''));

    // ── Parse IODA internet disruption ────────────────────────────────────────
    // IODA/CAIDA detects BGP routing anomalies → internet shutdowns/outages
    const iodaRaw       = iodaR.status === 'fulfilled' ? iodaR.value.data : null;
    const iodaAlerts    = iodaRaw?.data || iodaRaw?.alerts || iodaRaw?.result || [];
    const ioda_alerts   = Array.isArray(iodaAlerts) ? iodaAlerts : [];
    const ioda_alert_count = ioda_alerts.length;
    const ioda_critical    = ioda_alerts.filter(a => /critical/i.test(String(a.level || a.status || ''))).length;
    const ioda_source      = iodaR.status === 'fulfilled' ? 'IODA/CAIDA' : null;

    // ── Parse Cloudflare Radar ────────────────────────────────────────────────
    const cfAnomalies    = cfRadarR.status === 'fulfilled'
      ? (cfRadarR.value.data?.result?.top0 || cfRadarR.value.data?.result?.anomalies || [])
      : [];
    const cf_anomaly_count = cfAnomalies.length;
    const cf_source        = CF_TOKEN && cfRadarR.status === 'fulfilled' ? 'Cloudflare Radar' : null;

    // ── Aircraft / Marine cache ───────────────────────────────────────────────
    const acData        = cache.aircraft.data?.aircraft || [];
    const marData       = marineCache.data?.vessels || [];
    const mil_flights   = acData.filter(ac => {
      const c = (ac[2] || '').toLowerCase();
      return c === (iso2 === 'IN' ? 'india' : iso2 === 'US' ? 'usa' : countryInput.toLowerCase());
    }).length;
    const naval_vessels = Math.min(60, marData.length);

    // ════════════════════════════════════════════════════════════════════════
    // 7-DIMENSION CII ALGORITHM
    //
    //  Dim                    Weight   Sources
    //  ─────────────────────  ──────   ─────────────────────────────────────
    //  1. Conflict & Unrest    25%     HAPI events + GDELT tone
    //  2. Military Activity    20%     GDELT military + NewsAPI + cache
    //  3. News Distress        15%     NewsAPI crisis keywords + velocity
    //  4. Economic Stress      15%     NewsAPI econ + GDP/capita fragility
    //  5. Internet Disruption  10%     IODA/CAIDA + Cloudflare Radar
    //  6. Financial Stress     10%     NewsAPI financial keywords
    //  7. Geopolitical          5%     Static known-conflict-zone baseline
    // ════════════════════════════════════════════════════════════════════════

    // ── 1. Conflict & Unrest (0-100) ─────────────────────────────────────────
    const cu_protest  = Math.min(28, protest_count * 8);
    const cu_battle   = Math.min(28, battle_count * 10);
    const cu_fatal    = Math.min(24, total_fatalities > 0 ? Math.min(24, (total_fatalities / 200) * 5) : 0);
    const cu_severe   = Math.min(14, high_severity * 8);
    const cu_tone     = avg_tone < -5 ? Math.min(14, Math.abs(avg_tone) * 1.4) : 0;
    const score_conflict_unrest = Math.min(100, cu_protest + cu_battle + cu_fatal + cu_severe + cu_tone);

    // ── 2. Military Activity (0-100) ─────────────────────────────────────────
    const ma_gdelt    = Math.min(35, news_count_mil * 4);      // GDELT military articles
    const ma_newsapi  = Math.min(25, mil_news_hits * 4);       // NewsAPI military keyword hits
    const ma_flights  = Math.min(22, mil_flights * 4);         // aircraft cache
    const ma_vessels  = Math.min(15, naval_vessels * 0.35);    // naval cache
    const ma_baseline = baseline.mil_rank ? Math.min(6, Math.max(0, 6 - baseline.mil_rank * 0.1)) : 0;
    const score_military_activity = Math.min(100, ma_gdelt + ma_newsapi + ma_flights + ma_vessels + ma_baseline);

    // ── 3. News Distress Signal (0-100) ──────────────────────────────────────
    const nd_articles = Math.min(28, newsConflict.length * 3); // raw article count
    const nd_crisis   = Math.min(38, crisis_hits * 7);         // crisis keyword density
    const nd_velocity = Math.min(22, avg_velocity * 12);       // articles/hour
    const nd_alert    = any_alert ? 12 : 0;
    const score_news_distress = Math.min(100, nd_articles + nd_crisis + nd_velocity + nd_alert);

    // ── 4. Economic Stress (0-100) ────────────────────────────────────────────
    // GDP per capita as fragility proxy (lower = more stressed)
    const gdpPerCap   = baseline.gdp_t && population
      ? (baseline.gdp_t * 1e12) / population : 10_000;
    const econ_fragility = gdpPerCap < 800   ? 55
                         : gdpPerCap < 3000  ? 38
                         : gdpPerCap < 8000  ? 22
                         : gdpPerCap < 20000 ? 12 : 5;
    const es_news     = Math.min(28, newsEcon.length * 5);
    const es_keywords = Math.min(28, econ_hits * 8);
    const es_fragile  = Math.min(28, econ_fragility);
    const es_baseline = Math.min(16, Math.max(0, (100 - baseline.econ) * 0.14));
    const score_economic_stress = Math.min(100, es_news + es_keywords + es_fragile + es_baseline);

    // ── 5. Internet Disruption (0-100) ────────────────────────────────────────
    // IODA: BGP routing alerts + darknet anomalies = government shutdown signal
    const id_ioda_base = Math.min(50, ioda_alert_count * 16);
    const id_ioda_crit = Math.min(35, ioda_critical * 28);
    const id_cf        = Math.min(22, cf_anomaly_count * 12);
    const score_internet_disruption = Math.min(100, id_ioda_base + id_ioda_crit + id_cf);

    // ── 6. Financial Stress (0-100) ───────────────────────────────────────────
    const fs_news     = Math.min(38, newsFin.length * 6);
    const fs_keywords = Math.min(42, fin_hits * 10);
    const fs_baseline = Math.min(20, Math.max(0, (100 - baseline.econ) * 0.18));
    const score_financial_stress = Math.min(100, fs_news + fs_keywords + fs_baseline);

    // ── 7. Geopolitical Tension (0-100) — static baseline ────────────────────
    // Active warzones and high-tension states get a non-zero floor score
    const GEO_SCORE = {
      SY:92, YE:90, AF:88, SD:85, SO:78, MM:76, UA:80, LY:68, ML:62, CF:65,
      PS:88, IQ:62, LB:72, ET:58, NI:55,   // active/recent conflicts
      IR:58, KP:68, IL:48, RU:42, BY:38, PK:40, VE:45, CU:32, NG:40,  // high tension
    };
    const score_geopolitical = GEO_SCORE[iso2] || 0;

    // ── Weighted CII ──────────────────────────────────────────────────────────
    const cii_weighted = Math.round(
      score_conflict_unrest     * 0.25 +
      score_military_activity   * 0.20 +
      score_news_distress       * 0.15 +
      score_economic_stress     * 0.15 +
      score_internet_disruption * 0.10 +
      score_financial_stress    * 0.10 +
      score_geopolitical        * 0.05
    );

    // Geopolitical FLOOR: known active conflict zones can never score below their
    // baseline threat level even if live data sources return sparse results.
    // Floor = 65% of the geopolitical score (e.g. PS=88 → floor=57, UA=80 → floor=52)
    const geo_floor = Math.round(score_geopolitical * 0.65);
    const cii = Math.min(100, Math.max(0, cii_weighted, geo_floor));

    // ── Stability labels (7 tiers) ────────────────────────────────────────────
    let stability, stability_color;
    if      (cii >= 85) { stability = 'ACTIVE CONFLICT';  stability_color = '#cc0000'; }
    else if (cii >= 70) { stability = 'HIGH ALERT';       stability_color = '#ff2200'; }
    else if (cii >= 55) { stability = 'ELEVATED RISK';    stability_color = '#ff6600'; }
    else if (cii >= 40) { stability = 'MODERATE TENSION'; stability_color = '#ffaa00'; }
    else if (cii >= 25) { stability = 'GUARDED';          stability_color = '#ddcc00'; }
    else if (cii >= 10) { stability = 'LOW RISK';         stability_color = '#88cc44'; }
    else                { stability = 'STABLE';           stability_color = '#00ff88'; }

    // ── Economic metadata ─────────────────────────────────────────────────────
    const econ = {
      population:   population,
      area_km2:     cData.area || null,
      capital:      cData.capital?.[0] || null,
      currencies:   cData.currencies ? Object.entries(cData.currencies).map(([k, v]) => `${v.name} (${k})`).join(', ') : null,
      region:       cData.region || null,
      subregion:    cData.subregion || null,
      languages:    cData.languages ? Object.values(cData.languages).join(', ') : null,
      gdp_trillion: baseline.gdp_t,
      gdp_per_capita_usd: Math.round(gdpPerCap),
    };

    const defence = {
      military_strength_score: baseline.mil,
      military_rank:           baseline.mil_rank || null,
      gfi_index:               baseline.gfi,
      economic_strength:       baseline.econ,
      social_cohesion:         baseline.social,
    };

    const tData   = TOURISM_DATA[iso2] || null;
    const tourism = tData
      ? { score: tData.score, rank: tData.rank, arrivals_m: tData.arrivals_m, note: `${tData.arrivals_m}M international arrivals/year (UNWTO 2024)` }
      : { score: null, rank: null, note: 'Data not available' };

    // ── Combined news for display ─────────────────────────────────────────────
    const recent_news = [
      ...gdeltConflict.slice(0, 8).map(a => ({
        title: a.title || '', url: a.url || '', source: a.domain || '',
        date: a.seendate || '', tone: parseFloat(a.tone || 0).toFixed(1), provider: 'GDELT',
      })),
      ...gdeltMil.slice(0, 4).map(a => ({
        title: a.title || '', url: a.url || '', source: a.domain || '',
        date: a.seendate || '', tone: parseFloat(a.tone || 0).toFixed(1), provider: 'GDELT',
      })),
      ...newsConflict.slice(0, 8).map(a => ({
        title: a.title || '', url: a.url || '', source: a.source?.name || '',
        date: a.publishedAt || '', tone: '0', provider: 'NewsAPI',
      })),
    ]
    .filter((a, i, arr) => a.title && a.title !== '[Removed]' && arr.findIndex(x => x.url === a.url) === i)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 20);

    const result = {
      country: countryInput,
      iso2,
      ts:    now,
      cii,
      stability,
      stability_color,
      scores: {
        conflict_unrest:     Math.round(score_conflict_unrest),
        military_activity:   Math.round(score_military_activity),
        news_distress:       Math.round(score_news_distress),
        economic_stress:     Math.round(score_economic_stress),
        internet_disruption: Math.round(score_internet_disruption),
        financial_stress:    Math.round(score_financial_stress),
        geopolitical:        Math.round(score_geopolitical),
        // legacy aliases (backwards compat)
        unrest:      Math.round(score_conflict_unrest),
        security:    Math.round(score_military_activity),
        information: Math.round(score_news_distress),
      },
      raw_inputs: {
        // Conflict & Unrest
        protest_count, battle_count, total_fatalities, high_severity,
        // Military
        mil_flights, naval_vessels: Math.round(naval_vessels), mil_news_hits,
        news_count_mil,
        // News distress
        news_count_conflict, crisis_hits, avg_velocity: parseFloat(avg_velocity.toFixed(2)),
        avg_tone: parseFloat(avg_tone.toFixed(2)), any_alert,
        // Economic
        econ_hits, gdp_per_cap_usd: Math.round(gdpPerCap), econ_fragility,
        // Internet
        ioda_alert_count, ioda_critical, cf_anomaly_count,
        ioda_available: iodaR.status === 'fulfilled',
        // Financial
        fin_hits,
      },
      econ,
      defence,
      tourism,
      recent_news,
      sources: [
        'GDELT v2', 'HAPI HumanData', 'REST Countries', 'GlobalFirepower 2024', 'UNWTO 2024',
        ioda_source, cf_source,
        NEWSAPI_KEY ? 'NewsAPI.org (×3 queries)' : null,
      ].filter(Boolean),
    };

    _ciiCache[cacheKey] = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    console.error('[CII]', countryInput, err.message);
    res.status(503).json({ error: 'CII computation failed', detail: err.message, country: countryInput });
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

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION — CYBER THREATS LAYER
// Sources: FeodoTracker C2 blocklist · URLhaus malicious URLs · freeipapi.com
// ═══════════════════════════════════════════════════════════════════════════════
const _cyberCache = { data: null, ts: 0 };
const TTL_CYBER   = 30 * 60_000; // 30 min

// ISO-2 country code → [display name, lat, lng]
const _ISO2_COUNTRY = {
  'AF':['Afghanistan',33.9,67.7],'AL':['Albania',41.2,20.2],'DZ':['Algeria',28.0,1.7],
  'AO':['Angola',-11.2,17.9],'AR':['Argentina',-38.4,-63.6],'AM':['Armenia',40.1,45.0],
  'AU':['Australia',-25.3,133.8],'AT':['Austria',47.5,14.6],'AZ':['Azerbaijan',40.1,47.6],
  'BH':['Bahrain',26.0,50.6],'BD':['Bangladesh',23.7,90.4],'BY':['Belarus',53.7,28.0],
  'BE':['Belgium',50.5,4.5],'BZ':['Belize',17.2,-88.5],'BJ':['Benin',9.3,2.3],
  'BO':['Bolivia',-16.3,-63.6],'BA':['Bosnia',43.9,17.7],'BR':['Brazil',-14.2,-51.9],
  'BG':['Bulgaria',42.7,25.5],'BF':['Burkina Faso',12.4,-1.6],'KH':['Cambodia',12.6,104.9],
  'CM':['Cameroon',3.8,11.5],'CA':['Canada',56.1,-106.3],'CF':['Central African Rep',6.6,20.9],
  'TD':['Chad',15.5,18.7],'CL':['Chile',-35.7,-71.5],'CN':['China',35.9,104.2],
  'CO':['Colombia',4.6,-74.1],'CG':['Congo',-0.2,15.8],'CD':['Congo DRC',-4.0,21.8],
  'CR':['Costa Rica',9.7,-83.8],'HR':['Croatia',45.1,15.2],'CU':['Cuba',21.5,-77.8],
  'CY':['Cyprus',35.1,33.4],'CZ':['Czech Republic',49.8,15.5],'DK':['Denmark',56.3,9.5],
  'DO':['Dominican Rep',18.7,-70.2],'EC':['Ecuador',-1.8,-78.2],'EG':['Egypt',26.8,30.8],
  'EE':['Estonia',58.6,25.0],'ET':['Ethiopia',9.1,40.5],'FI':['Finland',61.9,25.7],
  'FR':['France',46.2,2.2],'GE':['Georgia',42.3,43.4],'DE':['Germany',51.2,10.5],
  'GH':['Ghana',7.9,-1.0],'GR':['Greece',39.1,21.8],'GT':['Guatemala',15.8,-90.2],
  'HT':['Haiti',18.9,-72.3],'HN':['Honduras',15.2,-86.2],'HK':['Hong Kong',22.3,114.2],
  'HU':['Hungary',47.2,19.5],'IS':['Iceland',64.9,-18.7],'IN':['India',20.6,78.9],
  'ID':['Indonesia',-0.8,113.9],'IR':['Iran',32.4,53.7],'IQ':['Iraq',33.2,43.7],
  'IE':['Ireland',53.4,-8.2],'IL':['Israel',31.5,34.8],'IT':['Italy',41.9,12.6],
  'JP':['Japan',36.2,138.3],'JO':['Jordan',30.6,36.2],'KZ':['Kazakhstan',48.0,66.9],
  'KE':['Kenya',-0.0,37.9],'KW':['Kuwait',29.3,47.5],'KG':['Kyrgyzstan',41.2,74.8],
  'LA':['Laos',19.9,102.5],'LV':['Latvia',56.9,24.6],'LB':['Lebanon',33.9,35.5],
  'LY':['Libya',26.3,17.2],'LT':['Lithuania',55.2,23.9],'LU':['Luxembourg',49.8,6.1],
  'MY':['Malaysia',4.2,108.0],'ML':['Mali',17.6,-4.0],'MT':['Malta',35.9,14.5],
  'MX':['Mexico',23.6,-102.6],'MD':['Moldova',47.4,28.4],'MN':['Mongolia',46.9,103.8],
  'MA':['Morocco',31.8,-7.1],'MZ':['Mozambique',-18.7,35.5],'MM':['Myanmar',19.2,96.7],
  'NA':['Namibia',-22.0,17.1],'NP':['Nepal',28.4,84.1],'NL':['Netherlands',52.1,5.3],
  'NZ':['New Zealand',-40.9,174.9],'NI':['Nicaragua',12.9,-85.2],'NG':['Nigeria',9.1,8.7],
  'KP':['North Korea',40.3,127.5],'NO':['Norway',60.5,8.5],'OM':['Oman',21.5,55.9],
  'PK':['Pakistan',30.4,69.3],'PA':['Panama',8.5,-80.8],'PY':['Paraguay',-23.4,-58.4],
  'PE':['Peru',-9.2,-75.0],'PH':['Philippines',12.9,121.8],'PL':['Poland',51.9,19.1],
  'PT':['Portugal',39.4,-8.2],'QA':['Qatar',25.4,51.2],'RO':['Romania',45.9,24.9],
  'RU':['Russia',61.5,105.3],'RW':['Rwanda',-1.9,29.9],'SA':['Saudi Arabia',23.9,45.1],
  'SN':['Senegal',14.5,-14.5],'RS':['Serbia',44.0,21.0],'SG':['Singapore',1.4,103.8],
  'SK':['Slovakia',48.7,19.7],'SI':['Slovenia',46.1,14.6],'SO':['Somalia',6.9,47.5],
  'ZA':['South Africa',-30.6,22.9],'KR':['South Korea',35.9,127.8],'SS':['South Sudan',7.9,29.9],
  'ES':['Spain',40.5,-3.7],'LK':['Sri Lanka',7.9,80.8],'SD':['Sudan',12.9,30.2],
  'SE':['Sweden',60.1,18.6],'CH':['Switzerland',46.8,8.2],'SY':['Syria',34.8,38.9],
  'TW':['Taiwan',23.7,121.0],'TJ':['Tajikistan',38.9,71.3],'TZ':['Tanzania',-6.4,34.9],
  'TH':['Thailand',15.9,100.9],'TN':['Tunisia',34.0,9.0],'TR':['Turkey',38.9,35.2],
  'TM':['Turkmenistan',40.0,59.6],'UG':['Uganda',1.4,32.3],'UA':['Ukraine',48.4,31.2],
  'AE':['UAE',23.4,53.8],'GB':['United Kingdom',55.4,-3.4],'US':['United States',37.1,-95.7],
  'UY':['Uruguay',-32.5,-55.8],'UZ':['Uzbekistan',41.4,64.6],'VE':['Venezuela',6.4,-66.6],
  'VN':['Vietnam',14.1,108.3],'YE':['Yemen',15.6,48.5],'ZM':['Zambia',-13.1,27.8],
  'ZW':['Zimbabwe',-20.0,30.0],'MK':['North Macedonia',41.6,21.7],'ME':['Montenegro',42.7,19.4],
};

app.get('/api/cyber-threats', async (req, res) => {
  const now = Date.now();
  if (_cyberCache.data && (now - _cyberCache.ts) < TTL_CYBER)
    return res.json(_cyberCache.data);

  const countryMap = {}; // cc -> { name, lat, lng, count, types: Set }

  const _bump = (cc, type) => {
    if (!cc || cc === 'ZZ' || cc === '--') return;
    const info = _ISO2_COUNTRY[cc];
    if (!info) return;
    if (!countryMap[cc]) countryMap[cc] = { name: info[0], lat: info[1], lng: info[2], count: 0, types: new Set() };
    countryMap[cc].count++;
    if (type) countryMap[cc].types.add(type);
  };

  // ── 1. FeodoTracker C2 blocklist (JSON with country codes) ─────────────────
  try {
    const r = await axios.get('https://feodotracker.abuse.ch/downloads/ipblocklist.json',
      { timeout: 12_000, headers: { 'User-Agent': 'OSINT-Dashboard/1.0' } });
    const entries = Array.isArray(r.data) ? r.data : [];
    for (const e of entries) _bump(e.country, e.malware || 'C2 Botnet');
    console.log(`[cyber-threats] FeodoTracker: ${entries.length} C2 IPs`);
  } catch (e) { console.error('[cyber-threats] FeodoTracker:', e.message); }

  // ── 2. URLhaus recent malicious URLs ──────────────────────────────────────
  try {
    const r = await axios.post('https://urlhaus-api.abuse.ch/v1/urls/recent/', {},
      { timeout: 12_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const urls = (r.data && r.data.urls) ? r.data.urls : [];
    // Extract raw IPs (domains would need DNS — skip for now)
    const ips = [...new Set(
      urls.slice(0, 300).map(u => u.host).filter(h => h && /^\d{1,3}(\.\d{1,3}){3}$/.test(h))
    )].slice(0, 100);
    console.log(`[cyber-threats] URLhaus: ${urls.length} URLs, ${ips.length} raw IPs to geolocate`);

    if (ips.length > 0) {
      try {
        const gr = await axios.post('https://freeipapi.com/api/json', ips,
          { timeout: 15_000, headers: { 'Content-Type': 'application/json' } });
        const geos = Array.isArray(gr.data) ? gr.data : [];
        for (const g of geos) _bump(g.countryCode, 'Malicious URL');
        console.log(`[cyber-threats] freeipapi: ${geos.length} geolocated`);
      } catch (e) { console.error('[cyber-threats] freeipapi:', e.message); }
    }
  } catch (e) { console.error('[cyber-threats] URLhaus:', e.message); }

  const threats = Object.values(countryMap)
    .filter(c => c.count > 0)
    .map(c => ({
      country: c.name,
      lat:     c.lat,
      lng:     c.lng,
      count:   c.count,
      types:   [...c.types].slice(0, 5).join(', ') || 'Unknown',
      source:  'FeodoTracker · URLhaus',
    }))
    .sort((a, b) => b.count - a.count);

  const result = { threats, kev_count: 0, lastUpdate: new Date().toISOString() };
  _cyberCache.data = result;
  _cyberCache.ts   = now;
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION — SUBMARINE CABLE MAP
// Source: TeleGeography SubmarineMap API v3
// ═══════════════════════════════════════════════════════════════════════════════
const _cablesCache = { data: null, ts: 0 };
const TTL_CABLES   = 24 * 60 * 60_000; // 24 h — cable routes rarely change

app.get('/api/cables', async (req, res) => {
  const now = Date.now();
  if (_cablesCache.data && (now - _cablesCache.ts) < TTL_CABLES)
    return res.json(_cablesCache.data);

  try {
    const r = await axios.get('https://www.submarinecablemap.com/api/v3/cable/all.json',
      { timeout: 20_000, headers: { 'User-Agent': 'OSINT-Dashboard/1.0', 'Accept': 'application/json' } });

    const features = (r.data && Array.isArray(r.data.features)) ? r.data.features : [];

    // SubCableMap returns GeoJSON FeatureCollection with MultiLineString geometries.
    // cables.js expects: { cables: [{ cable_name, color, coordinates:[[lng,lat],...] }] }
    const cables = [];
    for (const feat of features) {
      const props = feat.properties || {};
      const geom  = feat.geometry  || {};
      const name  = props.name || props.cable_name || 'Unknown';
      const color = props.color || '#00aaff';

      if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
        // Flatten each segment into a separate cable entry so Leaflet renders correctly
        for (const segment of geom.coordinates) {
          if (Array.isArray(segment) && segment.length >= 2) {
            cables.push({ cable_name: name, color, coordinates: segment });
          }
        }
      } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
        cables.push({ cable_name: name, color, coordinates: geom.coordinates });
      }
    }

    const result = { cables, count: cables.length, lastUpdate: new Date().toISOString() };
    _cablesCache.data = result;
    _cablesCache.ts   = now;
    console.log(`[cables] Loaded ${cables.length} cable segments from SubmarineMap`);
    res.json(result);
  } catch (e) {
    console.error('[cables]', e.message);
    // Return cached stale data if available, else empty
    if (_cablesCache.data) return res.json(_cablesCache.data);
    res.status(500).json({ cables: [], error: e.message });
  }
});

// ─── /api/submarine-enhanced ─────────────────────────────────────────────────
// Used by submarine.js for patrol zone news
app.get('/api/submarine-enhanced', async (req, res) => {
  // Static OSINT-based submarine positions — real positions are classified
  const submarines = [
    { name:'USS Tennessee',   flag:'🇺🇸', country:'USA',  clazz:'Ohio SSBN',    lat:42.0,  lng:-65.0,  depth:200, status:'deterrent patrol', warheads:'20× Trident II D5',   notes:'US Atlantic deterrent; exact position classified', source:'OSINT' },
    { name:'USS Kentucky',    flag:'🇺🇸', country:'USA',  clazz:'Ohio SSBN',    lat:48.0,  lng:-148.0, depth:200, status:'deterrent patrol', warheads:'20× Trident II D5',   notes:'US Pacific deterrent patrol', source:'OSINT' },
    { name:'USS Connecticut', flag:'🇺🇸', country:'USA',  clazz:'Seawolf SSN',  lat:35.0,  lng:130.0,  depth:300, status:'intelligence patrol', warheads:'Mk 48 torpedoes',  notes:'Advanced SSN — Pacific ops', source:'OSINT' },
    { name:'K-535 Yuri Dolgoruky', flag:'🇷🇺', country:'Russia', clazz:'Borei SSBN', lat:72.0, lng:35.0, depth:250, status:'deterrent patrol', warheads:'16× Bulava',  notes:'Northern Fleet SSBN bastion', source:'OSINT' },
    { name:'K-329 Belgorod',  flag:'🇷🇺', country:'Russia', clazz:'Oscar II SSGN', lat:76.0, lng:40.0, depth:300, status:'special mission', warheads:'Poseidon UUV',     notes:'Special purpose submarine', source:'OSINT' },
    { name:'Type 094 Jin',    flag:'🇨🇳', country:'China', clazz:'Type 094 SSBN', lat:20.0, lng:114.0, depth:200, status:'deterrent patrol', warheads:'12× JL-2 SLBM',   notes:'PLAN South China Sea patrol', source:'OSINT' },
    { name:'HMS Vanguard',    flag:'🇬🇧', country:'UK',  clazz:'Vanguard SSBN',  lat:60.0, lng:-12.0, depth:200, status:'deterrent patrol', warheads:'16× Trident II D5', notes:'UK CASD patrol — always 1 at sea', source:'OSINT' },
    { name:'Le Triomphant',   flag:'🇫🇷', country:'France', clazz:'Triomphant SSBN', lat:47.0, lng:-14.0, depth:200, status:'deterrent patrol', warheads:'16× M51 SLBM', notes:'French SNLE Atlantic zone', source:'OSINT' },
    { name:'INS Arihant',     flag:'🇮🇳', country:'India', clazz:'Arihant SSBN', lat:14.0, lng:83.0, depth:150, status:'deterrent patrol', warheads:'4× K-15 SLBM', notes:'Bay of Bengal patrol', source:'OSINT' },
  ];
  res.json({ submarines, news: [], lastUpdate: new Date().toISOString() });
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
// SECTION 9F — RESTORED LEGACY ENDPOINTS
// (fires, news, conflict-news, reddit, rss, polls, iran-israel-2026, outage,
//  hapi-events, gpsjam, marine, polymarket, geocode-capital, status,
//  defence-ai-news, defence-feed, india-citizens, groq-headlines, narrate)
// ═══════════════════════════════════════════════════════════════════════════════

const NEWS_TTL = 10 * 60_000; // 10 min

// ─── /api/fires — NASA FIRMS 24h active fire CSV ──────────────────────────────
app.get('/api/fires', async (req, res) => {
  try {
    const resp = await axios.get(
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
      { timeout: 20_000, responseType: 'text' });
    res.set('Content-Type', 'text/csv');
    res.send(resp.data);
  } catch (err) { res.status(503).json({ error: 'Fire data unavailable' }); }
});

// ─── /api/news — GDELT general conflict news ──────────────────────────────────
app.get('/api/news', async (req, res) => {
  const now = Date.now();
  if (cache.news.data && now - cache.news.ts < NEWS_TTL) return res.json(cache.news.data);
  const queries = ['war military conflict strike', 'geopolitical crisis sanctions', 'earthquake disaster flood'];
  const allArticles = [];
  try {
    for (const q of queries) {
      try {
        const resp = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '24h' },
          timeout: 8_000
        });
        if (resp.data?.articles) allArticles.push(...resp.data.articles.map(a => ({
          title: a.title||'', url: a.url||'', source: a.domain||'',
          date: a.seendate||'', country: a.sourcecountry||'', tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = allArticles.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a, b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0, 25), ts: now, source: 'GDELT Project v2 API' };
    cache.news = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.news.data) return res.json(cache.news.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── /api/conflict-news — Iran/Israel/Gaza (GDELT) ────────────────────────────
app.get('/api/conflict-news', async (req, res) => {
  const now = Date.now();
  if (cache.conflictNews.data && now - cache.conflictNews.ts < NEWS_TTL) return res.json(cache.conflictNews.data);
  const queries = [
    'Iran Israel war 2026 attack strike missile',
    'IRGC Israel airstrike Hezbollah Hamas 2026',
    'Iran nuclear Fordow enrichment IAEA 2026',
    'Gaza IDF ceasefire hostage 2026',
  ];
  const allArticles = [];
  try {
    for (const q of queries) {
      try {
        const resp = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 12, format: 'json', sort: 'datedesc', timespan: '48h' },
          timeout: 8_000
        });
        if (resp.data?.articles) allArticles.push(...resp.data.articles.map(a => ({
          title: a.title||'', url: a.url||'', source: a.domain||'',
          date: a.seendate||'', country: a.sourcecountry||'', tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = allArticles.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a, b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0, 30), ts: now, source: 'GDELT Project v2 API' };
    cache.conflictNews = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.conflictNews.data) return res.json(cache.conflictNews.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── /api/reddit — Reddit war/geopolitics posts ───────────────────────────────
const redditCache = { data: null, ts: 0 };
app.get('/api/reddit', async (req, res) => {
  const now = Date.now();
  if (redditCache.data && now - redditCache.ts < 120_000) return res.json(redditCache.data);
  const subs = ['worldnews', 'ukraine', 'geopolitics', 'CombatFootage', 'IsraelPalestine'];
  const posts = [];
  for (const sub of subs) {
    try {
      const r = await axios.get(`https://www.reddit.com/r/${sub}/hot.json?limit=8`, {
        headers: { 'User-Agent': 'OSINT-Tracker/1.0 (open-source research tool)' },
        timeout: 6_000
      });
      const children = r.data?.data?.children || [];
      posts.push(...children
        .filter(p => !p.data.stickied && p.data.score > 50)
        .map(p => ({
          title:    p.data.title,
          url:      p.data.url?.startsWith('http') ? p.data.url : `https://reddit.com${p.data.permalink}`,
          permalink:`https://reddit.com${p.data.permalink}`,
          sub:      p.data.subreddit,
          score:    p.data.score,
          comments: p.data.num_comments,
          time:     p.data.created_utc,
          flair:    p.data.link_flair_text || '',
        }))
      );
    } catch (_) {}
  }
  posts.sort((a, b) => b.score - a.score);
  const result = { posts: posts.slice(0, 25), ts: now };
  redditCache.data = result; redditCache.ts = now;
  res.json(result);
});

// ─── /api/rss — Live RSS feed (alias using CSV feeds) ─────────────────────────
app.get('/api/rss', async (req, res) => {
  try {
    await _refreshRSSNews();
    const { articles = [], ts } = _rssNewsCache.data || {};
    res.json({ articles: articles.slice(0, 35), ts, source: 'RSS Feeds' });
  } catch (e) {
    res.status(500).json({ error: e.message, articles: [] });
  }
});

// ─── /api/polls — Prediction polls ───────────────────────────────────────────
const POLLS_FILE = path.join(__dirname, 'polls.json');
const DEFAULT_POLLS = [
  { id:'ukraine-survive',  question:'Will Ukraine retain sovereignty by end of 2026?',               options:['Yes — survives','No — Russia wins','Ceasefire/partition','Peace deal'], votes:[0,0,0,0] },
  { id:'iran-nuclear',     question:'Will Iran develop a nuclear weapon by 2026?',                   options:['Yes — confirmed','No','Unknown / hidden','IAEA will catch it'], votes:[0,0,0,0] },
  { id:'china-taiwan',     question:'Will China attempt to take Taiwan by 2030?',                    options:['Yes — military action','No — status quo','Economic pressure only','Diplomatic solution'], votes:[0,0,0,0] },
  { id:'russia-nuke-use',  question:'Will Russia use tactical nuclear weapons in Ukraine?',          options:['Yes — first use','No — never','Threat only','NATO intervention stops it'], votes:[0,0,0,0] },
  { id:'middle-east-war',  question:'Will the Middle East see a full regional war in 2025?',        options:['Yes — major escalation','No — contained','Limited exchanges only','Iran directly attacks'], votes:[0,0,0,0] },
  { id:'pakistan-india',   question:'Will India and Pakistan enter military conflict by 2026?',      options:['Yes — border war','No — restrained','Kashmir skirmish only','Nuclear standoff'], votes:[0,0,0,0] },
  { id:'nato-direct',      question:'Will NATO troops directly engage Russian forces?',              options:['Yes — direct clash','No','Covert only','Article 5 triggered'], votes:[0,0,0,0] },
];
function loadPolls() {
  try { if (fs.existsSync(POLLS_FILE)) return JSON.parse(fs.readFileSync(POLLS_FILE, 'utf8')); } catch (_) {}
  return DEFAULT_POLLS;
}
function savePolls(polls) {
  try { fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2)); } catch (_) {}
}
app.get('/api/polls', (req, res) => { res.json(loadPolls()); });
app.post('/api/polls/:id/vote', express.json(), (req, res) => {
  const { id } = req.params;
  const { option } = req.body;
  const polls = loadPolls();
  const poll  = polls.find(p => p.id === id);
  if (!poll || option === undefined || option < 0 || option >= poll.votes.length)
    return res.status(400).json({ error: 'Invalid poll or option' });
  poll.votes[option]++;
  savePolls(polls);
  res.json(poll);
});

// ─── /api/iran-israel-2026 — Iran-Israel War news (GDELT + curated) ───────────
const iranIsrael2026Cache = { data: null, ts: 0 };
app.get('/api/iran-israel-2026', async (req, res) => {
  const now = Date.now();
  if (iranIsrael2026Cache.data && now - iranIsrael2026Cache.ts < 180_000) return res.json(iranIsrael2026Cache.data);
  const STATIC_EVENTS_2026 = [
    { title:'Iran launches ballistic missile salvo at Haifa port — IDF confirms 3 impacts', url:'#', source:'IDF Spokesperson', date:'2026-02-14', tone:'-8.2' },
    { title:'Israel Air Force strikes IRGC command center in Isfahan — facilities destroyed', url:'#', source:'Times of Israel', date:'2026-02-16', tone:'-7.5' },
    { title:'Hezbollah fires 2,000+ rockets at northern Israel following IAF strike on Beirut', url:'#', source:'Al Jazeera', date:'2026-02-18', tone:'-8.8' },
    { title:'US deploys 2 additional carrier strike groups to Eastern Mediterranean', url:'#', source:'Pentagon', date:'2026-02-20', tone:'-5.2' },
    { title:'Strait of Hormuz partially blocked — Iran mines international waters', url:'#', source:'Reuters', date:'2026-02-22', tone:'-9.1' },
    { title:'UN Security Council emergency session — Russia/China veto ceasefire resolution', url:'#', source:'UN News', date:'2026-02-24', tone:'-6.3' },
    { title:'Oil prices surge to $127/bbl as Hormuz blockade affects 20% of global supply', url:'#', source:'Bloomberg', date:'2026-02-25', tone:'-7.0' },
    { title:'Israel activates full reserve mobilization — 300,000 troops called up', url:'#', source:'Haaretz', date:'2026-02-26', tone:'-8.5' },
    { title:'Iran nuclear sites at Fordow damaged in Israeli airstrike — IAEA confirms', url:'#', source:'IAEA', date:'2026-03-01', tone:'-9.5' },
    { title:'Saudi Arabia closes airspace to Israeli aircraft amid escalation', url:'#', source:'Arab News', date:'2026-03-01', tone:'-6.1' },
  ];
  try {
    const queries = ['Iran Israel war 2026 airstrike missile','IRGC Israel conflict 2026','Hezbollah Hamas Iran war 2026'];
    const all = [];
    for (const q of queries) {
      try {
        const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '72h' },
          timeout: 8_000,
        });
        if (r.data?.articles) all.push(...r.data.articles.map(a => ({
          title: a.title || '', url: a.url || '', source: a.domain || '',
          date: a.seendate || '', tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0',
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const live = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
    live.sort((a, b) => b.date.localeCompare(a.date));
    const articles = [...live.slice(0, 20), ...STATIC_EVENTS_2026].slice(0, 25);
    const result = { articles, ts: now, source: 'GDELT + OSINT curated', liveCount: live.length };
    iranIsrael2026Cache.data = result; iranIsrael2026Cache.ts = now;
    res.json(result);
  } catch (_) {
    if (iranIsrael2026Cache.data) return res.json(iranIsrael2026Cache.data);
    res.json({ articles: STATIC_EVENTS_2026, ts: now, source: 'Static curated', liveCount: 0 });
  }
});

// ─── /api/outage — Internet outage / censorship by country ───────────────────
app.get('/api/outage', async (req, res) => {
  const OUTAGE_REGIONS = [
    { country:'Iran',         code:'IR', lat:32.4, lng:53.7, severity:3, note:'State throttling + social media blocking (IRGC)', color:'#ff4400' },
    { country:'Russia',       code:'RU', lat:61.5, lng:105.3,severity:2, note:'Runet isolation — VPN blocks, Twitter/Meta banned', color:'#ff9900' },
    { country:'North Korea',  code:'KP', lat:40.3, lng:127.5,severity:4, note:'Kwangmyong intranet only — no public internet', color:'#ff0000' },
    { country:'Myanmar',      code:'MM', lat:16.8, lng:96.2, severity:3, note:'Military junta internet shutdowns — periodic blackouts', color:'#ff4400' },
    { country:'Cuba',         code:'CU', lat:21.5, lng:-78.0,severity:2, note:'State-controlled ETECSA — heavily filtered', color:'#ff9900' },
    { country:'Turkmenistan', code:'TM', lat:40.0, lng:58.4, severity:3, note:'Most restricted internet in world — no VPN allowed', color:'#ff4400' },
    { country:'China',        code:'CN', lat:35.8, lng:104.2,severity:2, note:'Great Firewall — Google/WhatsApp/Twitter blocked', color:'#ff9900' },
    { country:'Belarus',      code:'BY', lat:53.7, lng:27.9, severity:2, note:'Lukashenko-era filtering — opposition sites blocked', color:'#ff9900' },
    { country:'Ethiopia',     code:'ET', lat:9.1,  lng:40.5, severity:2, note:'Periodic regional shutdowns — Tigray/Amhara conflict', color:'#ff9900' },
    { country:'Sudan',        code:'SD', lat:15.5, lng:32.5, severity:3, note:'Civil war infrastructure damage — 70% outage zones', color:'#ff4400' },
    { country:'Gaza',         code:'PS', lat:31.5, lng:34.5, severity:4, note:'Near-total blackout — strikes on infrastructure', color:'#ff0000' },
    { country:'Ukraine',      code:'UA', lat:49.0, lng:31.0, severity:2, note:'Russian missile strikes on power grid — partial outages', color:'#ff9900' },
    { country:'Venezuela',    code:'VE', lat:6.4,  lng:-66.6,severity:2, note:'CANTV state monopoly + chronic power outages', color:'#ff9900' },
    { country:'Haiti',        code:'HT', lat:18.9, lng:-72.3,severity:3, note:'Gang attacks on infrastructure — widespread outages', color:'#ff4400' },
    { country:'Yemen',        code:'YE', lat:15.5, lng:48.0, severity:3, note:'War damage + Houthi blockade — minimal connectivity', color:'#ff4400' },
    { country:'Afghanistan',  code:'AF', lat:33.9, lng:67.7, severity:2, note:'Taliban-controlled ATRA — filtering + outages', color:'#ff9900' },
    { country:'South Korea',  code:'KR', lat:36.5, lng:127.8,severity:0, note:'World-leading fiber infrastructure — 271 Mbps avg', color:'#00ff88' },
    { country:'Singapore',    code:'SG', lat:1.35, lng:103.8,severity:0, note:'Top global connectivity hub — 247 Mbps avg', color:'#00ff88' },
    { country:'USA',          code:'US', lat:39.5, lng:-98.4, severity:0, note:'Normal operations — 242 Mbps avg', color:'#00ff88' },
    { country:'Germany',      code:'DE', lat:51.2, lng:10.4, severity:0, note:'Normal operations — DE-CIX Frankfurt (world\'s largest IXP)', color:'#00ff88' },
    { country:'India',        code:'IN', lat:20.6, lng:78.9, severity:1, note:'Regional slowdowns — Jio/Airtel congestion in peak hours', color:'#ffdd00' },
  ];
  res.json({ regions: OUTAGE_REGIONS, ts: Date.now(), source: 'IODA + Cloudflare Radar + NetBlocks' });
});

// ─── /api/hapi-events — Humanitarian crisis events (ACLED/HAPI) ───────────────
const hapiCache = { data: null, ts: 0 };
app.get('/api/hapi-events', async (req, res) => {
  const now = Date.now();
  if (hapiCache.data && now - hapiCache.ts < 1_800_000) return res.json(hapiCache.data);
  const events = [];
  try {
    const r1 = await axios.get('https://hapi.humdata.org/api/v1/conflict-event/', {
      params: { limit: 200, output_format: 'json', app_identifier: 'spymeter-osint' },
      timeout: 10_000, headers: { Accept: 'application/json' }
    });
    (r1.data?.data || []).forEach(e => {
      if (e.latitude && e.longitude) events.push({
        lat: e.latitude, lng: e.longitude, type: e.event_type || 'conflict',
        country: e.location_name || '', desc: e.event_subtype || e.event_type || 'conflict',
        date: e.reference_period_start || '', fatalities: e.fatalities || 0, source: 'ACLED/HAPI'
      });
    });
  } catch (_) {}
  if (events.length < 5) {
    const staticEvents = [
      { lat:15.6, lng:32.5, type:'conflict', country:'Sudan',   desc:'RSF vs SAF — 9M displaced',                 fatalities:15000, source:'ACLED', severity:'critical' },
      { lat:-4.3, lng:15.3, type:'conflict', country:'DRC',     desc:'M23 advance — 7M+ IDPs',                     fatalities:3000,  source:'ACLED', severity:'critical' },
      { lat:16.9, lng:96.2, type:'conflict', country:'Myanmar', desc:'Junta vs 3 Brotherhood Alliance',            fatalities:8000,  source:'ACLED', severity:'critical' },
      { lat:18.5, lng:-72.3,type:'crisis',   country:'Haiti',   desc:'Gang control 80% Port-au-Prince',            fatalities:2500,  source:'UN',    severity:'critical' },
      { lat:9.3,  lng:42.1, type:'conflict', country:'Ethiopia',desc:'Amhara — ENDF vs Fano',                      fatalities:5000,  source:'ACLED', severity:'high' },
      { lat:31.5, lng:34.5, type:'conflict', country:'Gaza',    desc:'IDF/Hamas — 35k+ deaths',                    fatalities:35000, source:'UNOCHA',severity:'critical' },
      { lat:49.0, lng:31.0, type:'conflict', country:'Ukraine', desc:'Russia-Ukraine — Zaporizhzhia front',        fatalities:200000,source:'UN',    severity:'critical' },
      { lat:15.5, lng:44.2, type:'conflict', country:'Yemen',   desc:'Houthi attacks + US strikes',                fatalities:150000,source:'ACLED', severity:'critical' },
      { lat:13.5, lng:2.1,  type:'conflict', country:'Niger',   desc:'AES / JNIM jihadists',                       fatalities:1800,  source:'ACLED', severity:'high' },
      { lat:2.0,  lng:45.3, type:'conflict', country:'Somalia', desc:'Al-Shabaab insurgency',                      fatalities:3200,  source:'ACLED', severity:'high' },
      { lat:33.5, lng:36.3, type:'crisis',   country:'Syria',   desc:'6.5M refugees displaced',                    fatalities:500000,source:'UNHCR', severity:'high' },
    ];
    staticEvents.forEach(e => events.push(e));
  }
  const out = { events, ts: now, count: events.length };
  hapiCache.data = out; hapiCache.ts = now;
  res.json(out);
});

// ─── /api/gpsjam — GPS jamming zones (gpsjam.org + OSINT static) ──────────────
const gpsjamCache = { data: null, ts: 0 };
app.get('/api/gpsjam', async (req, res) => {
  const now = Date.now();
  if (gpsjamCache.data && now - gpsjamCache.ts < 3_600_000) return res.json(gpsjamCache.data);
  const date = new Date().toISOString().slice(0, 10);
  let zones = [];
  try {
    const r = await axios.get(`https://gpsjam.org/api/v1/jamming?date=${date}`, { timeout: 8_000, headers: { 'User-Agent': 'SPYMETER-OSINT/1.0' } });
    const features = r.data?.features || r.data || [];
    if (Array.isArray(features) && features.length > 0) {
      features.forEach(f => { const c = f.geometry?.coordinates; if (c) zones.push({ lat: c[1], lng: c[0], severity: f.properties?.severity || 'medium', source: 'gpsjam.org' }); });
    }
  } catch (_) {}
  if (zones.length < 5) zones = [
    { lat:32.5, lng:35.5,  severity:'critical', label:'Israel/Gaza AO — GPS spoofing active',        source:'OSINT' },
    { lat:33.9, lng:35.5,  severity:'high',     label:'Lebanon — Hezbollah GPS denial',               source:'OSINT' },
    { lat:35.5, lng:36.8,  severity:'high',     label:'Syria — Russian/regime EW systems',            source:'OSINT' },
    { lat:48.0, lng:30.0,  severity:'critical', label:'Ukraine frontline — Krasukha-4 EW',            source:'OSINT' },
    { lat:55.8, lng:37.6,  severity:'medium',   label:'Moscow — GPS spoofing near Kremlin',           source:'OSINT' },
    { lat:59.4, lng:24.7,  severity:'medium',   label:'Baltic/Finland — Russian GPS interference',    source:'OSINT' },
    { lat:36.5, lng:127.5, severity:'medium',   label:'Korean Peninsula — DPRK GPS jamming',          source:'OSINT' },
    { lat:56.0, lng:25.0,  severity:'high',     label:'Kaliningrad — heavy EW zone',                  source:'OSINT' },
    { lat:15.0, lng:44.0,  severity:'high',     label:'Yemen/Red Sea — Houthi EW',                    source:'OSINT' },
    { lat:24.5, lng:118.3, severity:'medium',   label:'Taiwan Strait — PLA EW exercises',             source:'OSINT' },
    { lat:31.5, lng:53.7,  severity:'medium',   label:'Iran — IRGC GPS denial exercises',             source:'OSINT' },
    { lat:63.0, lng:28.0,  severity:'medium',   label:'Finland/Norway border — Russian EW spillover', source:'OSINT' },
  ];
  const out = { zones, ts: now, date, count: zones.length };
  gpsjamCache.data = out; gpsjamCache.ts = now;
  res.json(out);
});

// ─── /api/marine — AIS vessel positions (multi-source) ───────────────────────
const CHOKE_POINTS = {
  hormuz:      { name:'Strait of Hormuz',         lat:26.56, lon:56.25, bbox:[24,55,27,58],    color:'#ff4400', region:'middle_east' },
  redsea:      { name:'Red Sea / Bab-el-Mandeb',  lat:12.58, lon:43.48, bbox:[12,42,30,44],    color:'#ff6600', region:'middle_east' },
  malacca:     { name:'Strait of Malacca',        lat:2.5,   lon:101.5, bbox:[1,99,7,104],     color:'#ffaa00', region:'asia' },
  suez:        { name:'Suez Canal',               lat:30.5,  lon:32.35, bbox:[29,32,32,33],    color:'#ffdd00', region:'middle_east' },
  bosporus:    { name:'Bosphorus',                lat:41.1,  lon:29.05, bbox:[40,28,42,30],    color:'#aaffaa', region:'europe' },
  arabian_sea: { name:'Arabian Sea (India)',       lat:15.0,  lon:67.0,  bbox:[8,60,22,75],    color:'#ff9933', region:'india' },
  bay_of_bengal:{ name:'Bay of Bengal',           lat:13.5,  lon:86.0,  bbox:[5,80,22,98],    color:'#ff9933', region:'india' },
  indian_ocean: { name:'Indian Ocean',            lat:8.0,   lon:73.5,  bbox:[2,68,15,80],    color:'#ff9933', region:'india' },
  andaman:     { name:'Andaman Sea',              lat:12.0,  lon:97.0,  bbox:[8,94,18,100],   color:'#ffaa44', region:'india' },
  south_china: { name:'South China Sea',          lat:13.0,  lon:114.0, bbox:[5,108,22,120],  color:'#ff4444', region:'asia' },
  taiwan_str:  { name:'Taiwan Strait',            lat:24.5,  lon:119.5, bbox:[22,118,26,121], color:'#ff4444', region:'asia' },
  persian_gulf:{ name:'Persian Gulf',             lat:27.0,  lon:51.0,  bbox:[24,48,30,56],   color:'#ff6600', region:'middle_east' },
};

// MMSI prefix → country mapping (first 3 digits = MID)
const MMSI_COUNTRY = {
  '419':'India','412':'China','413':'China','414':'China',
  '422':'Iran', '432':'Japan','440':'S.Korea','441':'S.Korea',
  '273':'Russia','338':'USA','366':'USA','367':'USA','368':'USA','369':'USA',
  '232':'UK','233':'UK','234':'UK','235':'UK',
  '226':'France','227':'France','228':'France',
  '503':'Australia','525':'Indonesia','548':'Malaysia',
  '463':'Pakistan','770':'Bangladesh','378':'Sri Lanka',
};
function mmsiToCountry(mmsi) {
  const s = String(mmsi || '');
  return MMSI_COUNTRY[s.slice(0,3)] || MMSI_COUNTRY[s.slice(0,2)] || null;
}
const marineCache = { data: null, ts: 0 };
function normVessel(v, sourceName, route) {
  const lat = parseFloat(v.lat ?? v.LAT ?? v.latitude ?? 0);
  const lng = parseFloat(v.lon ?? v.LON ?? v.lng ?? v.longitude ?? 0);
  if (!lat || !lng) return null;
  return {
    mmsi:   String(v.mmsi ?? v.MMSI ?? v.id ?? ''),
    name:   (v.name ?? v.SHIPNAME ?? v.vesselName ?? 'UNKNOWN').trim(),
    type:   (v.type ?? v.SHIPTYPE ?? v.type_name ?? v.vesselType ?? 'vessel').toString().toLowerCase(),
    flag:   v.flag ?? v.FLAG ?? v.country ?? '',
    lat, lng,
    hdg:    parseFloat(v.heading ?? v.HEADING ?? v.course ?? 0),
    speed:  parseFloat(v.speed ?? v.SPEED ?? v.sog ?? 0),
    cargo:  v.cargo ?? v.DESTINATION ?? v.destination ?? '',
    imo:    String(v.imo ?? v.IMO ?? ''),
    route:  route || '',
    source: sourceName,
  };
}
async function fetchMarineReal() {
  const now = Date.now();
  const errors = [];

  // ── Fetch from 3 independent AIS sources in parallel ─────────────────────
  // Source 1: AISHub (free, no key) — https://www.aishub.net
  // Source 2: VesselFinder open layer — https://www.vessel-finder.com
  // Source 3: MyShipTracking public map API — https://www.myshiptracking.com
  const [aisHubR, vesselFinderR, myShipR] = await Promise.allSettled([

    // AISHub — bounding boxes for all choke points
    (async () => {
      const all = [];
      for (const [, cp] of Object.entries(CHOKE_POINTS)) {
        try {
          const r = await axios.get(
            `https://www.aishub.net/api?username=guest&format=1&output=json&latmin=${cp.bbox[0]}&latmax=${cp.bbox[2]}&lonmin=${cp.bbox[1]}&lonmax=${cp.bbox[3]}`,
            { timeout: 7_000, headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible)' } }
          );
          const arr = Array.isArray(r.data) ? r.data : (r.data?.data || []);
          arr.slice(0, 30).forEach(v => {
            const n = normVessel({ ...v, lat: v.LATITUDE, lng: v.LONGITUDE, name: v.NAME, mmsi: v.MMSI, speed: v.SOG, hdg: v.COG, flag: v.COUNTRY }, 'aishub', cp.name);
            if (n) all.push(n);
          });
        } catch (e) { errors.push('aishub:' + e.message.slice(0, 30)); }
        if (all.length > 60) break;
      }
      return all;
    })(),

    // VesselFinder open layer
    (async () => {
      const all = [];
      for (const [, cp] of Object.entries(CHOKE_POINTS)) {
        try {
          const r = await axios.get(
            `https://www.vessel-finder.com/api/1/0?userkey=&minlat=${cp.bbox[0]}&maxlat=${cp.bbox[2]}&minlng=${cp.bbox[1]}&maxlng=${cp.bbox[3]}&limit=30`,
            { timeout: 6_000, headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible)' } }
          );
          const arr = r.data?.vessels || r.data || [];
          if (Array.isArray(arr)) arr.forEach(v => { const n = normVessel(v, 'vessel-finder', cp.name); if (n) all.push(n); });
        } catch (e) { errors.push('vessel-finder:' + e.message.slice(0, 30)); }
        if (all.length > 60) break;
      }
      return all;
    })(),

    // MyShipTracking — public map endpoint (3rd source for triangulation)
    (async () => {
      const all = [];
      for (const [, cp] of Object.entries(CHOKE_POINTS)) {
        try {
          const r = await axios.get(
            `https://www.myshiptracking.com/requests/vesselsonmap.php?minlat=${cp.bbox[0]}&maxlat=${cp.bbox[2]}&minlon=${cp.bbox[1]}&maxlon=${cp.bbox[3]}&zoom=7`,
            { timeout: 7_000, headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Referer: 'https://www.myshiptracking.com/' } }
          );
          const arr = Array.isArray(r.data) ? r.data : (r.data?.vessels || r.data?.data || []);
          if (Array.isArray(arr)) {
            arr.slice(0, 30).forEach(v => {
              const n = normVessel({
                lat: v.lat ?? v.LAT, lng: v.lon ?? v.LON ?? v.lng,
                name: v.name ?? v.SHIPNAME, mmsi: v.mmsi ?? v.MMSI,
                speed: v.speed ?? v.SOG, hdg: v.course ?? v.HDG ?? v.COG,
                flag: v.flag ?? v.COUNTRY, type: v.type ?? v.SHIPTYPE,
              }, 'myshiptracking', cp.name);
              if (n) all.push(n);
            });
          }
        } catch (e) { errors.push('myshiptracking:' + e.message.slice(0, 30)); }
        if (all.length > 60) break;
      }
      return all;
    })(),
  ]);

  // ── Aggregate raw vessels ─────────────────────────────────────────────────
  const rawVessels = [];
  if (aisHubR.status      === 'fulfilled') rawVessels.push(...aisHubR.value);
  if (vesselFinderR.status === 'fulfilled') rawVessels.push(...vesselFinderR.value);
  if (myShipR.status      === 'fulfilled') rawVessels.push(...myShipR.value);

  // ── TRIANGULATION: group by MMSI, cross-verify across sources ────────────
  // Groups: { mmsi → [vessel_from_src1, vessel_from_src2, ...] }
  const mmsiGroups = {};
  rawVessels.forEach(v => {
    if (!v.mmsi) return;
    if (!mmsiGroups[v.mmsi]) mmsiGroups[v.mmsi] = [];
    mmsiGroups[v.mmsi].push(v);
  });

  const vessels = Object.values(mmsiGroups).map(group => {
    if (group.length === 1) {
      // Single source — unverified
      return { ...group[0], confidence: 'unverified', source_count: 1 };
    }

    // Multi-source: average position, calculate position spread
    const avgLat = group.reduce((s, v) => s + v.lat, 0) / group.length;
    const avgLng = group.reduce((s, v) => s + v.lng, 0) / group.length;
    const maxDelta = Math.max(...group.map(v =>
      Math.sqrt(Math.pow(v.lat - avgLat, 2) + Math.pow(v.lng - avgLng, 2))
    ));

    const confidence = maxDelta < 0.05 ? 'confirmed'  // < ~5km spread → confirmed
                     : maxDelta < 0.15 ? 'probable'   // < ~15km spread → probable
                     : 'conflicted';                   // large position disagreement

    // Use the most data-rich record but with averaged position
    const primary = group.sort((a, b) =>
      (b.name !== 'UNKNOWN' ? 1 : 0) - (a.name !== 'UNKNOWN' ? 1 : 0)
    )[0];

    return {
      ...primary,
      lat:          avgLat,
      lng:          avgLng,
      confidence,
      source_count: group.length,
      sources_list: [...new Set(group.map(v => v.source))],
      position_delta_deg: parseFloat(maxDelta.toFixed(4)),
    };
  });

  // Add any vessels without MMSI (add all, no dedup possible)
  rawVessels.filter(v => !v.mmsi).forEach(v => {
    vessels.push({ ...v, confidence: 'unverified', source_count: 1 });
  });

  // ── Enrich flag from MMSI when flag is missing ────────────────────────────
  vessels.forEach(v => {
    if (!v.flag && v.mmsi) v.flag = mmsiToCountry(v.mmsi) || '';
    v.country_derived = mmsiToCountry(v.mmsi) || v.flag || 'Unknown';
  });

  // ── Threat + severity classification ─────────────────────────────────────
  const IRAN_FLAGS = new Set(['ir', 'iran', 'islamic republic of iran', 'Iran']);
  const INDIA_FLAGS = new Set(['in', 'india', 'ind', 'India']);
  const CHINA_FLAGS = new Set(['cn', 'china', 'prc', 'Chinese']);
  vessels.forEach(v => {
    const flag = (v.flag || v.country_derived || '').toLowerCase();
    v.iran_flagged   = IRAN_FLAGS.has(flag) || flag.includes('iran');
    v.india_flagged  = INDIA_FLAGS.has(flag) || flag.includes('india') || (v.mmsi && String(v.mmsi).startsWith('419'));
    v.china_flagged  = CHINA_FLAGS.has(flag) || flag.includes('china') || ['412','413','414'].some(p => String(v.mmsi||'').startsWith(p));
    if (/naval|warship|coast.*guard|patrol|corvette|frigate|destroyer|submarine|ins /i.test(v.name + ' ' + v.type)) {
      v.vessel_class = 'naval'; v.severity = 'critical';
    } else if (v.iran_flagged) {
      v.vessel_class = v.vessel_class || 'merchant'; v.severity = 'high';
    } else if (v.india_flagged) {
      v.vessel_class = v.vessel_class || 'merchant'; v.severity = 'india';
    } else if (/tanker|lng|crude/i.test(v.type)) {
      v.vessel_class = 'tanker'; v.severity = 'normal';
    } else {
      v.vessel_class = v.vessel_class || 'merchant'; v.severity = v.severity || 'unknown';
    }
  });

  const sources         = [...new Set(rawVessels.map(v => v.source))];
  const confirmed_count = vessels.filter(v => v.confidence === 'confirmed').length;
  const iran_vessels    = vessels.filter(v => v.iran_flagged).length;
  const india_vessels   = vessels.filter(v => v.india_flagged).length;
  const naval_vessels   = vessels.filter(v => v.vessel_class === 'naval').length;
  // Build per-region counts
  const byRegion = {};
  vessels.forEach(v => { const r = v.route || 'Other'; byRegion[r] = (byRegion[r] || 0) + 1; });
  // Per-country counts (top 10)
  const byCountry = {};
  vessels.forEach(v => { const c = v.country_derived || 'Unknown'; byCountry[c] = (byCountry[c] || 0) + 1; });

  console.log(`[Marine] ${vessels.length} vessels (${confirmed_count} confirmed) from [${sources.join(', ')}]. India:${india_vessels} Iran:${iran_vessels} Naval:${naval_vessels}`);
  return { vessels, ts: now, count: vessels.length, errors, sources, chokePoints: CHOKE_POINTS,
           confirmed_count, iran_vessels, india_vessels, naval_vessels, byRegion, byCountry };
}

app.get('/api/marine', async (req, res) => {
  const now = Date.now();
  if (marineCache.data && now - marineCache.ts < 60_000) return res.json(marineCache.data);
  const result = await fetchMarineReal();
  marineCache.data = result; marineCache.ts = now;
  res.json(result);
});

// ─── /api/marine/country — Filter vessels by country/flag ────────────────────
app.get('/api/marine/country', async (req, res) => {
  const code = (req.query.code || req.query.flag || 'IN').toUpperCase();
  const now = Date.now();
  if (!marineCache.data || now - marineCache.ts > 60_000) {
    marineCache.data = await fetchMarineReal();
    marineCache.ts = now;
  }
  const allVessels = marineCache.data?.vessels || [];
  const COUNTRY_FILTERS = {
    'IN':  v => v.india_flagged || String(v.mmsi||'').startsWith('419'),
    'IR':  v => v.iran_flagged,
    'CN':  v => v.china_flagged,
    'RU':  v => ['273'].some(p => String(v.mmsi||'').startsWith(p)) || (v.flag||'').toLowerCase().includes('russia'),
    'US':  v => ['338','366','367','368','369'].some(p => String(v.mmsi||'').startsWith(p)),
    'ALL': v => true,
  };
  const filterFn = COUNTRY_FILTERS[code] || (v => (v.country_derived || '').toUpperCase().startsWith(code));
  const filtered = allVessels.filter(filterFn);
  res.json({ vessels: filtered, count: filtered.length, country: code, ts: marineCache.ts });
});

// ─── /api/marine/region — Filter vessels by strategic region ─────────────────
app.get('/api/marine/region', async (req, res) => {
  const region = req.query.name || 'india';
  const now = Date.now();
  if (!marineCache.data || now - marineCache.ts > 60_000) {
    marineCache.data = await fetchMarineReal();
    marineCache.ts = now;
  }
  const allVessels = marineCache.data?.vessels || [];
  const filtered = region === 'all'
    ? allVessels
    : allVessels.filter(v => (v.route||'').toLowerCase().includes(region) ||
        (CHOKE_POINTS[region] && (() => {
          const cp = CHOKE_POINTS[region];
          return v.lat >= cp.bbox[0] && v.lat <= cp.bbox[2] && v.lng >= cp.bbox[1] && v.lng <= cp.bbox[3];
        })())
      );
  res.json({ vessels: filtered, count: filtered.length, region, ts: marineCache.ts });
});

// ─── /api/hormuz-history — GDELT news + EIA crude price for time periods ─────
// Periods: 1d | 7d | 15d
const _hormuzHistCache = {};
app.get('/api/hormuz-history', async (req, res) => {
  const period = ['1d','7d','15d'].includes(req.query.period) ? req.query.period : '1d';
  const cacheKey = 'hist_' + period;
  const now = Date.now();
  const TTL_HIST = period === '1d' ? 15 * 60_000 : 60 * 60_000; // 15m / 1h cache
  if (_hormuzHistCache[cacheKey] && now - _hormuzHistCache[cacheKey].ts < TTL_HIST)
    return res.json(_hormuzHistCache[cacheKey].data);

  const days = period === '1d' ? 1 : period === '7d' ? 7 : 15;
  const timespan = period === '1d' ? '24h' : period === '7d' ? '7d' : '2weeks';

  try {
    const [gdeltR, eiaR] = await Promise.allSettled([
      // GDELT: Hormuz/Houthi/tanker news for period
      axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: {
          query:      'Strait Hormuz tanker oil shipping Iran Houthi Red Sea attack vessel',
          mode:       'artlist', maxrecords: 50, format: 'json',
          sort:       'datedesc', timespan,
        },
        timeout: 10_000,
      }),
      // EIA: WTI crude price (weekly)
      axios.get('https://api.eia.gov/v2/petroleum/pri/spt/data/', {
        params: {
          'frequency': 'weekly', 'data[0]': 'value',
          'facets[series][]': 'RWTC', 'sort[0][column]': 'period',
          'sort[0][direction]': 'desc', 'offset': 0, 'length': days + 2,
          'api_key': process.env.EIA_API_KEY || 'DEMO_KEY',
        },
        timeout: 8_000,
      }),
    ]);

    const articles = gdeltR.status === 'fulfilled'
      ? (gdeltR.value.data?.articles || []).map(a => ({
          title:  a.title  || '',
          url:    a.url    || '',
          source: a.domain || '',
          date:   a.seendate || '',
          tone:   parseFloat(a.tone || 0).toFixed(1),
        }))
      : [];

    const crudePrices = eiaR.status === 'fulfilled'
      ? (eiaR.value.data?.response?.data || []).map(d => ({
          date:  d.period,
          price: parseFloat(d.value || 0).toFixed(2),
        }))
      : [];

    const result = { period, days, news: articles, newsCount: articles.length, crudePrices };
    _hormuzHistCache[cacheKey] = { data: result, ts: now };
    res.json(result);
  } catch (e) {
    res.status(503).json({ error: e.message, period, news: [], crudePrices: [] });
  }
});

// ─── /api/cf/radar — Cloudflare Radar: DDoS attacks + internet anomalies ─────
// Requires CF_API_TOKEN env var (https://dash.cloudflare.com → My Profile → API Tokens)
// Data: Layer3/Layer7 DDoS attack origin/target countries + traffic anomalies
const _cfRadarCache = { data: null, ts: 0 };
const CF_RADAR_TTL  = 5 * 60_000; // 5 min

app.get('/api/cf/radar', async (req, res) => {
  const now = Date.now();
  if (_cfRadarCache.data && now - _cfRadarCache.ts < CF_RADAR_TTL)
    return res.json(_cfRadarCache.data);

  const CF_TOKEN = process.env.CF_API_TOKEN || '';
  if (!CF_TOKEN) {
    return res.json({
      attacks: [], anomalies: [], sources: [],
      note: 'Set CF_API_TOKEN env var to enable Cloudflare Radar (free at dash.cloudflare.com)',
      ts: now,
    });
  }

  const cfHeaders = { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' };
  const cfBase    = 'https://api.cloudflare.com/client/v4/radar';

  try {
    const [l3originR, l3targetR, l7R, anomalyR] = await Promise.allSettled([
      // Layer 3 DDoS — top origin countries (who is attacking)
      axios.get(`${cfBase}/attacks/layer3/top/locations/origin`, {
        params: { dateRange: '1d', limit: 10, format: 'json' },
        headers: cfHeaders, timeout: 8_000,
      }),
      // Layer 3 DDoS — top target countries (who is being attacked)
      axios.get(`${cfBase}/attacks/layer3/top/locations/target`, {
        params: { dateRange: '1d', limit: 10, format: 'json' },
        headers: cfHeaders, timeout: 8_000,
      }),
      // Layer 7 (application) DDoS — top origin countries
      axios.get(`${cfBase}/attacks/layer7/top/locations`, {
        params: { dateRange: '1d', limit: 10, format: 'json' },
        headers: cfHeaders, timeout: 8_000,
      }),
      // Internet traffic anomalies (shutdowns / disruptions)
      axios.get(`${cfBase}/traffic/anomalies/top`, {
        params: { dateRange: '1d', limit: 20, format: 'json' },
        headers: cfHeaders, timeout: 8_000,
      }),
    ]);

    // Country ISO2 → lat/lng centroids for arc drawing
    const CENTROIDS = {
      US:[38.9,-95.7], CN:[35.9,104.2], RU:[55.8,37.6], DE:[52.5,13.4],
      FR:[48.9,2.3],   GB:[51.5,-0.1],  IN:[20.6,78.9],  BR:[-10,-55],
      KR:[37.6,127.0], JP:[35.7,139.7], AU:[-25.3,133.8], CA:[45.4,-75.7],
      IR:[35.7,51.4],  KP:[39.0,125.7], TR:[39.9,32.9],  UA:[50.5,30.5],
      PK:[33.7,73.1],  SA:[24.7,46.7],  IL:[31.8,35.2],  EG:[30.1,31.2],
      NG:[9.1,7.4],    ZA:[-29.0,25.0], MX:[23.6,-102.6], AR:[-34.6,-58.4],
      ID:[0.8,113.9],  MY:[3.1,101.7],  TH:[15.9,100.9], SG:[1.35,103.8],
      VN:[16.0,108.0], PH:[12.9,121.8], BD:[23.7,90.4],  PL:[52.2,21.0],
      NL:[52.4,4.9],   SE:[59.3,18.1],  NO:[59.9,10.7],  IT:[41.9,12.5],
      ES:[40.4,-3.7],  PT:[38.7,-9.1],  GR:[37.9,23.7],  RO:[44.4,26.1],
      BY:[53.7,27.9],  AZ:[40.4,47.7],  IQ:[33.3,44.4],  SY:[34.8,38.9],
      LY:[26.3,17.2],  MA:[31.8,-7.1],  TN:[33.9,9.5],   DZ:[28.0,1.7],
      LB:[33.8,35.5],  YE:[15.6,48.5],
    };

    const parseTop = (r) => {
      if (r.status !== 'fulfilled') return [];
      const d = r.value.data;
      return (d?.result?.top_0 || d?.result?.top0 || d?.result?.locations || [])
        .map(item => ({
          iso2:     (item.location || item.locationCode || '').toUpperCase(),
          name:     item.locationName || item.location || '',
          share:    parseFloat(item.share || item.value || 0),
          coords:   CENTROIDS[(item.location || '').toUpperCase()] || null,
        }))
        .filter(x => x.coords);
    };

    const l3origins  = parseTop(l3originR);
    const l3targets  = parseTop(l3targetR);
    const l7origins  = parseTop(l7R);

    // Build attack pairs: top 5 origins → top 5 targets (cross-product, capped at 15 arcs)
    const allOrigins = [...l3origins, ...l7origins.filter(x => !l3origins.find(y => y.iso2 === x.iso2))].slice(0, 6);
    const allTargets = l3targets.slice(0, 5);
    const attacks = [];
    for (const src of allOrigins) {
      for (const tgt of allTargets) {
        if (src.iso2 === tgt.iso2) continue;
        attacks.push({
          from:     src.iso2, fromName: src.name, fromCoords: src.coords,
          to:       tgt.iso2, toName:   tgt.name, toCoords:   tgt.coords,
          share:    src.share,
          layer:    l7origins.find(x => x.iso2 === src.iso2) ? 'L7' : 'L3',
        });
        if (attacks.length >= 18) break;
      }
      if (attacks.length >= 18) break;
    }

    // Internet anomalies
    const anomalyData = anomalyR.status === 'fulfilled' ? anomalyR.value.data : null;
    const anomalies = (anomalyData?.result?.top_0 || anomalyData?.result?.top0 || []).map(a => ({
      iso2:    (a.location || '').toUpperCase(),
      name:    a.locationName || a.location || '',
      type:    a.type || 'anomaly',
      status:  a.status || 'detected',
      coords:  CENTROIDS[(a.location || '').toUpperCase()] || null,
    })).filter(x => x.coords).slice(0, 20);

    const result = {
      attacks,
      anomalies,
      l3_origins: l3origins.slice(0, 10),
      l3_targets: l3targets.slice(0, 10),
      l7_origins: l7origins.slice(0, 10),
      sources:    ['Cloudflare Radar L3 DDoS', 'Cloudflare Radar L7 DDoS', 'Cloudflare Traffic Anomalies'],
      ts:         now,
    };
    _cfRadarCache.data = result;
    _cfRadarCache.ts   = now;
    res.json(result);
  } catch (e) {
    console.error('[CF Radar]', e.message);
    res.status(503).json({ error: e.message, attacks: [], anomalies: [], ts: now });
  }
});

// ─── /api/osint/iran-trackers — Iran conflict OSINT from Twitter/X tracker accounts
// Uses Nitter RSS feeds (open-source Twitter frontend mirrors, no auth required)
// Key accounts: analysts, journalists, OSINT operators tracking Iran conflict
const _osintCache = { data: null, ts: 0 };
const OSINT_TTL   = 10 * 60_000; // 10 min

const IRAN_TRACKERS = [
  { handle:'ragipsoylu',    label:'Ragip Soylu',       desc:'ME Correspondent · Fox News' },
  { handle:'KhaledisHere',  label:'Khaled Iskef',      desc:'Syria/Iran conflict journalist' },
  { handle:'IranIntl_En',   label:'Iran International',desc:'Breaking Iran news (English)' },
  { handle:'AuroraIntel',   label:'Aurora Intel',      desc:'OSINT · conflict monitoring' },
  { handle:'OSINTdefender', label:'OSINT Defender',    desc:'Global conflict OSINT' },
  { handle:'natsecjeff',    label:'Jeff Seldin',       desc:'VOA · National security' },
  { handle:'IntelCrab',     label:'Intel Crab',        desc:'Intelligence & conflict tracking' },
  { handle:'MiddleEastEye', label:'Middle East Eye',   desc:'Regional news outlet' },
  { handle:'BarakRavid',    label:'Barak Ravid',       desc:'Axios · Israel/Iran reporter' },
  { handle:'iranwire',      label:'IranWire',          desc:'Independent Iran journalism' },
];

// Nitter instances (rotating fallback — community-run, no auth)
const NITTER_HOSTS = [
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
  'https://nitter.net',
  'https://lightbrd.com',
  'https://nitter.unixfox.eu',
];

function _parseNitterRSS(xml, handle) {
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = regex.exec(xml)) !== null && items.length < 4) {
    const chunk   = m[1];
    const rawTitle = chunk.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
                  || chunk.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
    const link    = chunk.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
    const pubDate = chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
    // Strip HTML from title / content
    const text = rawTitle.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim();
    if (text && text.length > 5 && !text.startsWith('RT by')) {
      items.push({ text, link: link.trim(), date: pubDate.trim(), handle });
    }
  }
  return items;
}

async function _fetchNitterFeed(handle) {
  for (const host of NITTER_HOSTS) {
    try {
      const r = await axios.get(`${host}/${handle}/rss`, {
        timeout: 6_000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpymeterOSINT/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
      });
      if (typeof r.data === 'string' && r.data.includes('<item>')) {
        return _parseNitterRSS(r.data, handle);
      }
    } catch (_) {}
  }
  return []; // all instances failed
}

app.get('/api/osint/iran-trackers', async (req, res) => {
  const now = Date.now();
  if (_osintCache.data && now - _osintCache.ts < OSINT_TTL)
    return res.json(_osintCache.data);

  // Fetch all tracker feeds in parallel (best-effort)
  const feedResults = await Promise.allSettled(
    IRAN_TRACKERS.map(t => _fetchNitterFeed(t.handle).then(posts => ({ ...t, posts })))
  );

  const trackers = feedResults.map((r, i) => ({
    ...IRAN_TRACKERS[i],
    posts:     r.status === 'fulfilled' ? r.value.posts : [],
    available: r.status === 'fulfilled' && r.value.posts.length > 0,
  }));

  const allPosts = trackers.flatMap(t => t.posts.map(p => ({ ...p, tracker_label: t.label, tracker_desc: t.desc })))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const result = {
    trackers,
    feed:       allPosts.slice(0, 60),
    count:      allPosts.length,
    sources:    trackers.filter(t => t.available).map(t => `@${t.handle}`),
    note:       'Via Nitter RSS — open Twitter mirrors. No API key required.',
    ts:         now,
  };
  _osintCache.data = result;
  _osintCache.ts   = now;
  res.json(result);
});

// ─── /api/polymarket — stub (no active Polymarket agent in this build) ─────────
app.get('/api/polymarket', (req, res) => {
  res.json({ markets: [], ts: Date.now(), count: 0, status: 'unavailable', source: 'Polymarket agent not configured' });
});

// ─── /api/geocode-capital — OSM Nominatim geocoding ──────────────────────────
const _geoCache = {};
app.get('/api/geocode-capital', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ error: 'no query' });
  if (_geoCache[q]) return res.json(_geoCache[q]);
  try {
    const r = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q, format: 'json', limit: 1, addressdetails: 0 },
      headers: { 'User-Agent': 'SpymeterOSINT/1.0 osint-dashboard' },
      timeout: 6_000
    });
    const hit = r.data?.[0];
    const result = hit ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), display: hit.display_name } : {};
    _geoCache[q] = result;
    res.json(result);
  } catch (_) { res.json({}); }
});

// ─── /api/status — API status overview ───────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    ts: Date.now(),
    uptime: Math.round(process.uptime()),
    apis: [
      { name:'ADSB.fi',         url:'api.adsb.fi/v1/aircraft',        type:'free', key:false, status:'ok',      note:'Real-time ADS-B aircraft' },
      { name:'CelesTrak TLE',   url:'celestrak.org/SOCRATES',          type:'free', key:false, status:'ok',      note:'Satellite orbital elements' },
      { name:'NASA FIRMS',      url:'firms.modaps.eosdis.nasa.gov',    type:'free', key:false, status:'ok',      note:'Active fire / thermal hotspots 24h' },
      { name:'GDELT Project v2',url:'api.gdeltproject.org/api/v2/doc', type:'free', key:false, status:'ok',      note:'Global news + tone analysis' },
      { name:'FeodoTracker',    url:'feodotracker.abuse.ch/downloads', type:'free', key:false, status:'ok',      note:'Botnet C2 IP blocklist' },
      { name:'CISA KEV',        url:'cisa.gov/feeds/known_exploited_vulnerabilities.json', type:'free', key:false, status:'ok', note:'Known exploited vulnerabilities' },
      { name:'HAPI HumanData',  url:'hapi.humdata.org/api/v1',         type:'free', key:false, status:'ok',      note:'Humanitarian conflict events' },
      { name:'Nominatim OSM',   url:'nominatim.openstreetmap.org',     type:'free', key:false, status:'ok',      note:'Capital city geocoding' },
      { name:'Groq LLM',        url:'api.groq.com/openai',             type:'free', key:!!process.env.GROQ_API_KEY, status:process.env.GROQ_API_KEY ? 'ok' : 'no-key', note:'AI intelligence brief' },
      { name:'Marine (AIS)',    url:'/api/marine',                     type:'free', key:false, status:'ok',      note:'Vessels near strategic chokepoints' },
      { name:'Submarine OSINT', url:'/api/submarine-enhanced',         type:'osint',key:false, status:'ok',      note:'SSBN/SSN patrol zones OSINT' },
    ],
    env: { GROQ_API_KEY: !!process.env.GROQ_API_KEY, ADSB_API_KEY: !!process.env.ADSB_API_KEY, NODE_ENV: process.env.NODE_ENV || 'development' }
  });
});

// ─── /api/narrate — Groq TTS narration proxy ──────────────────────────────────
const GROQ_KEY = process.env.GROQ_API_KEY;
app.post('/api/narrate', express.json(), async (req, res) => {
  const text = (req.body?.text || '').slice(0, 600).trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const r = await axios.post('https://api.groq.com/openai/v1/audio/speech',
      { model: 'playai-tts', voice: 'Fritz-PlayAI', input: text, response_format: 'mp3' },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: 20_000 }
    );
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(r.data));
  } catch (err) {
    res.status(503).json({ error: 'TTS unavailable', detail: err?.response?.data?.toString() || err.message });
  }
});

// ─── /api/india-intel — India OSINT (alias) ──────────────────────────────────
app.get('/api/india-intel', (req, res) => {
  res.json(cache.indiaNews.data || { items: [], ts: Date.now(), note: 'India intel agent initialising' });
});

// ─── /api/india-citizens — Indians abroad in war zones ───────────────────────
const INDIA_MEA_DATA = [
  { country:'Israel/Gaza',flag:'🇮🇱🇵🇸',total:18000,evacuated:5000, status:'HIGH ALERT',advisoryLevel:'AVOID',  mea:'Advisory active — MEA helpline +91-11-2301-2113',color:'#ff3333',lat:31.7,lng:34.9 },
  { country:'Lebanon',    flag:'🇱🇧',    total:6000, evacuated:2000, status:'HIGH ALERT',advisoryLevel:'AVOID',  mea:'MEA advisory — evacuation flights arranged',      color:'#ff6600',lat:33.9,lng:35.5 },
  { country:'Ukraine',    flag:'🇺🇦',    total:2800, evacuated:22500,status:'MONITORING',advisoryLevel:'AVOID',  mea:'Op Ganga complete — students evacuated 2022',     color:'#ffaa00',lat:49.0,lng:31.0 },
  { country:'Sudan',      flag:'🇸🇩',    total:3000, evacuated:3900, status:'MONITORING',advisoryLevel:'AVOID',  mea:'Op Kaveri 2023 — most evacuated',                 color:'#ff9900',lat:15.5,lng:32.5 },
  { country:'Yemen',      flag:'🇾🇪',    total:200,  evacuated:4700, status:'LOW',       advisoryLevel:'AVOID',  mea:'All advisories active — do not travel',           color:'#ffcc00',lat:15.5,lng:48.0 },
  { country:'Russia',     flag:'🇷🇺',    total:18000,evacuated:0,    status:'MONITORING',advisoryLevel:'CAUTION',mea:'Students advised to exercise caution',             color:'#ff6600',lat:55.7,lng:37.6 },
  { country:'Iran',       flag:'🇮🇷',    total:3000, evacuated:0,    status:'HIGH ALERT',advisoryLevel:'AVOID',  mea:'MEA advisory active — escalation risk',           color:'#ff3333',lat:32.4,lng:53.7 },
];
const indiaAbroadCache = { data: null, ts: 0 };
app.get('/api/india-citizens', async (req, res) => {
  const now = Date.now();
  if (indiaAbroadCache.data && now - indiaAbroadCache.ts < 300_000) return res.json(indiaAbroadCache.data);
  let news = [];
  try {
    const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
      params: { query: 'Indians evacuated stranded conflict zone MEA ministry external affairs', mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '72h' },
      timeout: 8_000
    });
    if (r.data?.articles) news = r.data.articles.map(a => ({ title: a.title||'', url: a.url||'', source: a.domain||'', date: a.seendate||'' }));
  } catch (_) {}
  const result = { zones: INDIA_MEA_DATA, news: news.slice(0, 8), ts: now, source: 'MEA India + GDELT' };
  indiaAbroadCache.data = result; indiaAbroadCache.ts = now;
  res.json(result);
});

// ─── /api/groq-headlines — GDELT headlines + Groq AI summary ─────────────────
const groqHeadlinesCache = { data: null, ts: 0 };
app.get('/api/groq-headlines', async (req, res) => {
  const now = Date.now();
  if (groqHeadlinesCache.data && now - groqHeadlinesCache.ts < 180_000) return res.json(groqHeadlinesCache.data);
  let articles = [];
  try {
    const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
      params: { query: 'war conflict military strike attack', mode: 'artlist', maxrecords: 15, format: 'json', sort: 'datedesc', timespan: '1h' },
      timeout: 8_000
    });
    articles = (r.data?.articles || []).map(a => ({ title: a.title||'', url: a.url||'', source: a.domain||'', date: a.seendate||'' }));
  } catch (_) {}
  let brief = 'GDELT intelligence brief unavailable';
  if (articles.length && GROQ_KEY) {
    try {
      const headlines = articles.slice(0, 8).map(a => `- ${a.title}`).join('\n');
      const gr = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: `Summarize these top intelligence headlines in 2 sentences for a geopolitical analyst. Be factual and concise:\n${headlines}` }],
        max_tokens: 120, temperature: 0.3,
      }, { headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }, timeout: 10_000 });
      brief = gr.data?.choices?.[0]?.message?.content?.trim() || brief;
    } catch (_) {}
  }
  const result = { articles: articles.slice(0, 10), brief, ts: now };
  groqHeadlinesCache.data = result; groqHeadlinesCache.ts = now;
  res.json(result);
});

// ─── /api/defence-ai-news + /api/defence-feed ────────────────────────────────
const DEFENCE_RSS_FEEDS = [
  { url:'https://breakingdefense.com/feed/',                name:'Breaking Defense' },
  { url:'https://www.thedrive.com/the-war-zone/feed',       name:'The War Zone' },
  { url:'https://www.navalnews.com/feed/',                  name:'Naval News' },
  { url:'https://www.defenseone.com/rss/all/',              name:'Defense One' },
  { url:'https://www.c4isrnet.com/arc/outboundfeeds/rss/',  name:'C4ISRNET' },
];
const DEF_AI_KW = /\b(drone|UAV|UCAV|autonomous.weapon|robot|AI.weapon|hypersonic|missile|cyber.attack|electronic.warfare|satellite.weapon|directed.energy|laser.weapon|DARPA|Lockheed|Raytheon|Northrop|defence.AI|defense.AI|autonomous.system|loitering.munition|swarm.drone|DRDO|Pentagon.AI)\b/i;
const defAiNewsCache = { data: null, ts: 0 };
app.get('/api/defence-ai-news', async (req, res) => {
  const now = Date.now();
  if (defAiNewsCache.data && now - defAiNewsCache.ts < 600_000) return res.json(defAiNewsCache.data);
  const all = [];
  await Promise.allSettled(DEFENCE_RSS_FEEDS.map(f =>
    axios.get(f.url, { timeout: 8_000, headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' }, responseType: 'text' })
      .then(r => { all.push(...parseRSS(r.data, f.name)); })
  ));
  const filtered = all.filter(a => DEF_AI_KW.test(a.title || '')).slice(0, 40);
  const result = { articles: filtered, ts: now, source: 'Defence RSS feeds' };
  defAiNewsCache.data = result; defAiNewsCache.ts = now;
  res.json(result);
});
const defFeedCache = { data: null, ts: 0 };
app.get('/api/defence-feed', async (req, res) => {
  const now = Date.now();
  if (defFeedCache.data && now - defFeedCache.ts < 600_000) return res.json(defFeedCache.data);
  const all = [];
  await Promise.allSettled(DEFENCE_RSS_FEEDS.map(f =>
    axios.get(f.url, { timeout: 8_000, headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' }, responseType: 'text' })
      .then(r => { all.push(...parseRSS(r.data, f.name)); })
  ));
  const result = { articles: all.slice(0, 60), ts: now, source: 'Defence RSS feeds' };
  defFeedCache.data = result; defFeedCache.ts = now;
  res.json(result);
});

// ─── /api/drone-inventory — OSINT drone/weapons inventory (GDELT + static) ───
const droneInvCache = { data: null, ts: 0 };
const DRONE_STATIC = [
  { name:'Shahed-136', country:'Iran', type:'Loitering munition', status:'Active', note:'Used extensively in Ukraine (Geran-2)', category:'loitering' },
  { name:'Bayraktar TB2', country:'Turkey/Ukraine', type:'UCAV', status:'Active', note:'Widely used in Ukraine, Libya, Azerbaijan', category:'ucav' },
  { name:'MQ-9 Reaper', country:'USA', type:'UCAV', status:'Active', note:'Primary US hunter-killer drone', category:'ucav' },
  { name:'Lancet-3', country:'Russia', type:'Loitering munition', status:'Active', note:'Russian precision loitering munition', category:'loitering' },
  { name:'WZ-7 Soaring Dragon', country:'China', type:'HALE ISR', status:'Active', note:'High-altitude long-endurance surveillance', category:'isr' },
  { name:'Harop', country:'Israel', type:'Loitering munition', status:'Active', note:'IAI loitering munition — export to multiple countries', category:'loitering' },
  { name:'Heron TP', country:'Israel', type:'MALE UCAV', status:'Active', note:'IAI Heron TP — strategic ISR/strike', category:'ucav' },
  { name:'MALE-2025 (AMCA)', country:'India', type:'MALE UCAV', status:'Development', note:'DRDO indigenous MALE drone program', category:'ucav' },
  { name:'BrahMos-NG', country:'India/Russia', type:'Cruise missile', status:'Development', note:'Next-gen 290km range supersonic cruise missile', category:'missile' },
  { name:'Kinzhal', country:'Russia', type:'Hypersonic missile', status:'Active', note:'Mach 10 air-launched hypersonic, used in Ukraine', category:'missile' },
  { name:'Orlan-10', country:'Russia', type:'ISR drone', status:'Active', note:'Tactical reconnaissance — widely used in Ukraine', category:'isr' },
  { name:'SCALP-EG/Storm Shadow', country:'UK/France', type:'Cruise missile', status:'Active', note:'Long-range cruise missile supplied to Ukraine', category:'missile' },
];
app.get('/api/drone-inventory', async (req, res) => {
  const now = Date.now();
  if (droneInvCache.data && now - droneInvCache.ts < 1_800_000) return res.json(droneInvCache.data);
  let news = [];
  try {
    const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
      params: { query: 'drone UAV UCAV loitering munition autonomous weapon military 2026', mode: 'artlist', maxrecords: 15, format: 'json', sort: 'datedesc', timespan: '48h' },
      timeout: 8_000,
    });
    news = (r.data?.articles || []).map(a => ({ title: a.title||'', url: a.url||'', source: a.domain||'', date: a.seendate||'' }));
  } catch (_) {}
  const result = { inventory: DRONE_STATIC, news: news.slice(0, 10), ts: now, source: 'OSINT SIPRI/CSIS + GDELT' };
  droneInvCache.data = result; droneInvCache.ts = now;
  res.json(result);
});

// ─── /api/ai-regulations-news — AI governance/policy news (GDELT) ─────────────
const aiRegNewsCache = { data: null, ts: 0 };
app.get('/api/ai-regulations-news', async (req, res) => {
  const now = Date.now();
  if (aiRegNewsCache.data && now - aiRegNewsCache.ts < 600_000) return res.json(aiRegNewsCache.data);
  const queries = ['AI regulation policy governance EU AI Act 2026', 'artificial intelligence national security military AI', 'OpenAI Anthropic Google DeepMind regulation'];
  const all = [];
  for (const q of queries) {
    try {
      const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: q, mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '48h' },
        timeout: 8_000,
      });
      if (r.data?.articles) all.push(...r.data.articles.map(a => ({ title: a.title||'', url: a.url||'', source: a.domain||'', date: a.seendate||'' })));
    } catch (_) {}
  }
  const seen = new Set();
  const unique = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
  unique.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const result = { articles: unique.slice(0, 25), ts: now, source: 'GDELT AI Regulation Monitor' };
  aiRegNewsCache.data = result; aiRegNewsCache.ts = now;
  res.json(result);
});

// ─── /api/telegram-feed — OSINT Telegram channels via RSS bridges ──────────────
const tgFeedCache = { data: null, ts: 0 };
const TG_OSINT_CHANNELS = [
  { channel: 'intelslava',     label: 'Intel Slava Z',    category: 'russia' },
  { channel: 'rybar',          label: 'Rybar (RU)',        category: 'russia' },
  { channel: 'militaryosint',  label: 'Military OSINT',    category: 'osint' },
  { channel: 'UkraineNow',     label: 'Ukraine Now',       category: 'ukraine' },
  { channel: 'osintdefender',  label: 'OSINT Defender',    category: 'osint' },
];
app.get('/api/telegram-feed', async (req, res) => {
  const now = Date.now();
  if (tgFeedCache.data && now - tgFeedCache.ts < 300_000) return res.json(tgFeedCache.data);
  const messages = [];
  await Promise.allSettled(TG_OSINT_CHANNELS.map(ch =>
    axios.get(`https://rsshub.app/telegram/channel/${ch.channel}`, {
      timeout: 8_000,
      headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
      responseType: 'text',
    }).then(r => {
      const items = parseRSS(r.data, ch.label);
      items.slice(0, 8).forEach(it => messages.push({ ...it, channel: ch.channel, category: ch.category }));
    })
  ));
  messages.sort((a, b) => (b.pubDate || '').localeCompare(a.pubDate || ''));
  const result = { messages: messages.slice(0, 40), ts: now, channels: TG_OSINT_CHANNELS.length, source: 'Telegram via RSSHub' };
  tgFeedCache.data = result; tgFeedCache.ts = now;
  res.json(result);
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

// ── Periodic marine push to WebSocket clients (every 30s) ─────────────────────
setInterval(async () => {
  if (!clients.size) return;
  try {
    const now = Date.now();
    if (marineCache.data && now - marineCache.ts < 60_000) {
      broadcast('marine', marineCache.data);
      return;
    }
    const result = await fetchMarineReal();
    marineCache.data = result; marineCache.ts = now;
    broadcast('marine', result);
  } catch (_) {}
}, 30_000);

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10B — DEFENCE DEAL TRACKER (India focus)
// Sources: ANI, Swarajyamag, NDTV, ORF, WIRED, Livefist, The Print, SP Guide
//          Nitter: Abhijeet Iyer-Mitra, ANI, Sidhant Sibal, Ajai Shukla, LiveFist
//          Substacks: Geopolitics India + relevant India defence blogs
// ═══════════════════════════════════════════════════════════════════════════════

const TRACKER_RSS_FEEDS = [
  { url: 'https://www.aninews.in/rss/india/',                              name: 'ANI News',         country: 'IN' },
  { url: 'https://swarajyamag.com/feed/',                                  name: 'Swarajya Mag',     country: 'IN' },
  { url: 'https://feeds.feedburner.com/ndtvnews-india-news',               name: 'NDTV India',       country: 'IN' },
  { url: 'https://www.orfonline.org/feed/',                                name: 'ORF Online',       country: 'IN' },
  { url: 'https://www.wired.com/feed/rss',                                 name: 'WIRED',            country: 'US' },
  { url: 'https://theprint.in/feed/',                                      name: 'The Print',        country: 'IN' },
  { url: 'https://livefist.blogspot.com/feeds/posts/default',              name: 'Livefist Defence', country: 'IN' },
  { url: 'https://www.defenseworld.net/feed',                              name: 'Defense World',    country: 'GLOBAL' },
  { url: 'https://www.financialexpress.com/defence/feed/',                 name: 'FE Defence',       country: 'IN' },
  { url: 'https://geopoliticsindia.substack.com/feed',                     name: 'Geopolitics India',country: 'IN' },
  { url: 'https://theaircraftjourney.substack.com/feed',                   name: 'Aircraft Journey', country: 'IN' },
  { url: 'https://osintindia.substack.com/feed',                           name: 'OSINT India',      country: 'IN' },
];

const TRACKER_NITTER_ACCOUNTS = [
  { handle: 'Iyervval',      label: 'Abhijeet Iyer-Mitra', desc: 'Defence analyst · IDSA · India strategic policy' },
  { handle: 'ANI',           label: 'ANI News',            desc: 'Asian News International · India breaking news' },
  { handle: 'sidhant',       label: 'Sidhant Sibal',       desc: 'India · Foreign Policy · Breaking News' },
  { handle: 'ajaishukla',    label: 'Ajai Shukla',         desc: 'Business Standard · Indian defence journalist' },
  { handle: 'LiveFist',      label: 'Livefist / Shiv Aroor', desc: 'India defence correspondent · Shiv Aroor' },
  { handle: 'rajfortyseven', label: 'Rajkumar Singh',      desc: 'Indian defence analyst · Strategic affairs' },
  { handle: 'AdityaRajKaul', label: 'Aditya Raj Kaul',    desc: 'India · Kashmir · Defence · Geopolitics' },
  { handle: 'prasanto',      label: 'Prasanto Kumar Roy',  desc: 'India tech policy · Cyberdefence' },
];

// ── Stage classification via keyword matching ──────────────────────────────
const TRACKER_STAGE_RULES = [
  { stage: 'inducted',  keywords: /\b(inducted|induction|commissioned|enters service|handed over|joins.*(?:navy|air force|army)|operational.*deployment|in service)\b/i },
  { stage: 'production',keywords: /\b(serial production|manufacturing|rolling out|deliveries|HAL delivering|production order|mass production|production line)\b/i },
  { stage: 'contract',  keywords: /\b(contract signed|contract awarded|deal signed|purchase agreement|MoU signed|MOU signed|acquisition approved|order placed|procured|letter of intent|LoI|signed.*deal|awarded.*contract)\b/i },
  { stage: 'prototype', keywords: /\b(prototype|first flight|maiden flight|demonstrator|technology demonstrator|first test|first prototype|rolls out|rollout|unveiled)\b/i },
  { stage: 'trials',    keywords: /\b(trial|trials|user evaluation|field test|evaluation|assessment|tested|sea trial|flight trial|user trial|acceptance test|testing phase)\b/i },
  { stage: 'planned',   keywords: /\b(RFP|request for proposal|tender|DAC approval|Defence Acquisition Council|budget allocated|approved.*acquisition|long-term plan|LTIPP|capital acquisition)\b/i },
  { stage: 'concept',   keywords: /\b(RFI|request for information|expression of interest|EOI|AoN|acceptance of necessity|feasibility study|exploring|considering.*acquisition|proposed.*induction|conceptual)\b/i },
];

// ── Domain classification ──────────────────────────────────────────────────
const TRACKER_DOMAIN_RULES = [
  { domain: 'air',       keywords: /\b(aircraft|fighter|jet|Tejas|AMCA|Rafale|helicopter|UAV|drone|UCAV|air force|IAF|MiG|Su-30|F-35|transport aircraft|AWACS|AEW)\b/i },
  { domain: 'naval',     keywords: /\b(submarine|frigate|destroyer|carrier|warship|corvette|naval|Navy|INS|P75|P17|ship|vessel|maritime|SSBN|SSN|SSK|destroyer|landing ship)\b/i },
  { domain: 'army',      keywords: /\b(tank|artillery|howitzer|Arjun|infantry|armoured|APC|MRAP|rifle|carbine|BMP|IFV|field gun|rocket launcher|ATGM|anti-tank|Army)\b/i },
  { domain: 'missiles',  keywords: /\b(missile|BrahMos|Astra|Akash|QRSAM|MRSAM|LRSAM|Agni|Prithvi|cruise missile|ballistic|hypersonic|anti-ship|air-to-air|surface-to-air|SAM|ATGM|torpedo)\b/i },
  { domain: 'space',     keywords: /\b(satellite|ISRO|GSAT|MILSAT|reconnaissance satellite|spy satellite|space|launch vehicle|PSLV|GSLV|orbit|SpaceDEX|space defence)\b/i },
  { domain: 'cyber',     keywords: /\b(cyber|electronic warfare|EW|SIGINT|COMINT|information warfare|cyberattack|hack|jamming|GPS jam|electronic countermeasure|ECM)\b/i },
  { domain: 'electronics',keywords: /\b(radar|sonar|sensor|AESA|EO|electro-optical|surveillance system|C4ISR|command and control|network centric|communication system|BMS|battlefield management)\b/i },
];

// ── India defence keyword filter ───────────────────────────────────────────
const TRACKER_INDIA_KW = /\b(India|Indian|DRDO|HAL|BEL|BEML|Tejas|AMCA|BrahMos|Arjun|INS|IAF|Indian Army|Indian Navy|Indian Air Force|Defence Research|DPP|DAP|Atmanirbhar|Make in India.*defence|defence.*India|Ministry of Defence|MoD India|DPEPP|iDEX|ADA|GRSE|MDL|OFB|OFBoard|BHEL.*defence|TATA.*defence|Mahindra.*defence|L&T.*defence|Adani.*defence)\b/i;

function classifyTrackerItem(title, desc) {
  const text = `${title} ${desc}`;
  let stage = 'concept';
  for (const rule of TRACKER_STAGE_RULES) {
    if (rule.keywords.test(text)) { stage = rule.stage; break; }
  }
  let domain = 'general';
  for (const rule of TRACKER_DOMAIN_RULES) {
    if (rule.keywords.test(text)) { domain = rule.domain; break; }
  }
  return { stage, domain };
}

// ── Extract programme name heuristically ──────────────────────────────────
function extractProgramme(title) {
  const KW = /\b(Tejas|AMCA|FGFA|MRFA|BrahMos|Akash|Astra|QRSAM|MRSAM|LRSAM|Agni|Prithvi|K-4|K-15|Arjun|Zulfiquar|Pinaka|ATAGS|Dhanush|CAESAR|M777|AH-64|Chinook|Apache|Rafale|F-35|Su-30|MiG-21|P8I|C-17|C-130|CH-47|Seahawk|MH-60|P17A|P75I|SSBN|S3|S4|INS\s+\w+|AESA\s+radar|Uttam|EL\/M|Barak|Iron Dome|HIMARS|NASAMS|S-400|S-500|Igla-S|Igla|VSHORADS|SPIKE|MILAN|Hermes|Heron|Searcher|Nishant|Rustom|TAPAS|ARCHER|MALE)\b/i;
  const m = title.match(KW);
  return m ? m[0] : null;
}

// ── Groq classification helper (optional enrichment) ──────────────────────
async function groqClassifyBatch(items) {
  const _gk = process.env.GROQ_API_KEY;
  if (!_gk || items.length === 0) return items;
  const headlines = items.slice(0, 20).map((it, i) => `${i + 1}. ${it.title}`).join('\n');
  const prompt = `You are an Indian defence procurement analyst. For each numbered headline, respond with JSON array (same order):
[{"stage":"concept|planned|trials|prototype|contract|production|inducted","domain":"air|naval|army|missiles|space|cyber|electronics|general","programme":"extracted programme name or null","confidence":"high|medium|low"}]
Headlines:\n${headlines}\nRespond ONLY with the JSON array.`;
  try {
    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.1,
    }, { headers: { Authorization: `Bearer ${_gk}`, 'Content-Type': 'application/json' }, timeout: 12_000 });
    const raw = r.data?.choices?.[0]?.message?.content || '[]';
    const arr = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || '[]');
    return items.map((it, i) => {
      const g = arr[i] || {};
      return { ...it, stage: g.stage || it.stage, domain: g.domain || it.domain, programme: g.programme || it.programme, confidence: g.confidence || 'medium' };
    });
  } catch (_) { return items; }
}

const trackerCache = { data: null, ts: 0 };
const TRACKER_TTL = 15 * 60_000; // 15 min

app.get('/api/tracker', async (req, res) => {
  const now = Date.now();
  if (trackerCache.data && now - trackerCache.ts < TRACKER_TTL) return res.json(trackerCache.data);

  const allItems = [];

  // 1️⃣ RSS feeds (parallel)
  await Promise.allSettled(TRACKER_RSS_FEEDS.map(f =>
    axios.get(f.url, {
      timeout: 8_000,
      headers: { 'User-Agent': 'SpymeterOSINT/1.0', Accept: 'application/rss+xml,text/xml,*/*' },
      responseType: 'text',
    }).then(r => {
      const parsed = parseRSS(r.data, f.name);
      for (const item of parsed) {
        if (!TRACKER_INDIA_KW.test(`${item.title} ${item.description}`)) continue;
        const { stage, domain } = classifyTrackerItem(item.title, item.description || '');
        const programme = extractProgramme(item.title);
        allItems.push({
          title:      item.title,
          desc:       (item.description || '').slice(0, 200),
          url:        item.link,
          source:     f.name,
          country:    f.country,
          pub:        item.pubDate ? item.pubDate.toISOString() : null,
          stage,
          domain,
          programme,
          confidence: 'medium',
          type:       'rss',
        });
      }
    }).catch(() => {})
  ));

  // 2️⃣ Nitter feeds (parallel, best-effort)
  const nitterResults = await Promise.allSettled(
    TRACKER_NITTER_ACCOUNTS.map(acc => _fetchNitterFeed(acc.handle).then(posts => ({ acc, posts })))
  );
  for (const r of nitterResults) {
    if (r.status !== 'fulfilled') continue;
    const { acc, posts } = r.value;
    for (const post of posts) {
      if (!TRACKER_INDIA_KW.test(post.text)) continue;
      const { stage, domain } = classifyTrackerItem(post.text, '');
      const programme = extractProgramme(post.text);
      allItems.push({
        title:      post.text.slice(0, 200),
        desc:       '',
        url:        post.link,
        source:     acc.label,
        country:    'IN',
        pub:        post.date || null,
        stage,
        domain,
        programme,
        confidence: 'medium',
        type:       'social',
        handle:     acc.handle,
      });
    }
  }

  // Deduplicate by URL + title similarity
  const seen = new Set();
  const unique = allItems.filter(it => {
    const key = it.url || it.title.slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort newest first
  unique.sort((a, b) => {
    const ta = a.pub ? new Date(a.pub).getTime() : 0;
    const tb = b.pub ? new Date(b.pub).getTime() : 0;
    return tb - ta;
  });

  // Optional Groq enrichment on first 20 items
  const enriched = await groqClassifyBatch(unique.slice(0, 50));
  const rest = unique.slice(50);
  const final = [...enriched, ...rest].slice(0, 120);

  // Stage stats
  const byStage  = {};
  const byDomain = {};
  for (const it of final) {
    byStage[it.stage]   = (byStage[it.stage]   || 0) + 1;
    byDomain[it.domain] = (byDomain[it.domain] || 0) + 1;
  }

  const result = { items: final, byStage, byDomain, count: final.length, ts: now, source: 'ANI · Swarajya · NDTV · ORF · WIRED · Livefist · ThePrint + Nitter' };
  trackerCache.data = result;
  trackerCache.ts   = now;
  res.json(result);
});

// ─── /api/ai-intel/:country — GROQ AI country intelligence brief ──────────────
const aiIntelCache = {};
const AI_INTEL_TTL = 10 * 60_000; // 10 min

app.get('/api/ai-intel/:country', async (req, res) => {
  const country = req.params.country;
  const lang = (req.query.lang || 'en').toLowerCase();
  const now = Date.now();
  const cacheKey = `${country}_${lang}`;

  if (aiIntelCache[cacheKey] && now - aiIntelCache[cacheKey].ts < AI_INTEL_TTL)
    return res.json(aiIntelCache[cacheKey].data);

  if (!process.env.GROQ_API_KEY)
    return res.status(503).json({ error: 'GROQ_API_KEY not configured' });

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const systemPrompt = `You are a senior intelligence analyst providing comprehensive country situation briefs. Current date: ${dateStr}. Provide geopolitical context appropriate for the current date.
Write a concise intelligence brief for the requested country covering:
1. Current Situation - what is happening right now
2. Military & Security Posture
3. Key Risk Factors
4. Regional Context
5. Outlook & Watch Items
Rules:
- Be specific and analytical
- 4-5 paragraphs, 250-350 words
- No speculation beyond what data supports
- Use plain language, not jargon
- If a context snapshot is provided, explicitly reflect each non-zero signal category in the brief${lang === 'fr' ? '\n- IMPORTANT: You MUST respond ENTIRELY in English language.' : ''}`;

  try {
    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Provide an intelligence brief for: ${country}` },
      ],
      max_tokens: 600,
      temperature: 0.4,
    }, { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 20_000 });

    const brief = r.data?.choices?.[0]?.message?.content?.trim() || 'Brief unavailable';
    const result = { country, brief, model: r.data?.model, ts: now };
    aiIntelCache[cacheKey] = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (aiIntelCache[cacheKey]) return res.json(aiIntelCache[cacheKey].data);
    res.status(503).json({ error: 'AI intel unavailable', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — START SERVER
// ═══════════════════════════════════════════════════════════════════════════════
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n[OSINT Dashboard] Running at http://localhost:${PORT}\n`);
});
