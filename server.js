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
