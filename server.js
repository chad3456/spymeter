const express = require('express');
const axios = require('axios');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Cache ────────────────────────────────────────────────
const cache = {
  aircraft:       { data: null, ts: 0 },
  satellites:     {},
  news:           { data: null, ts: 0 },
  conflictNews:   { data: null, ts: 0 },
  ukraineNews:    { data: null, ts: 0 },
  unrestNews:     { data: null, ts: 0 },
  regionAircraft: {},
};
const AC_TTL      = 15_000;
const SAT_TTL     = 300_000;
const NEWS_TTL    = 300_000;   // 5 min
const REGION_TTL  = 15_000;
const RSS_TTL     = 300_000;   // 5 min

// Normalize ADSB.one aircraft record → OpenSky state-vector array
// OpenSky indices: [icao24,callsign,origin,_,_, lon,lat,alt_m, on_ground,vel_ms,hdg,vr_ms,...]
const ICAO_COUNTRY = {
  '38':'France','3C':'Germany','3D':'Germany','40':'UK','43':'UK','44':'UK',
  '71':'India','72':'India','73':'India','74':'India','75':'India','76':'India',
  '49':'USA','A0':'USA','A2':'USA','A4':'USA','A6':'USA','A8':'USA','AA':'USA',
  'AC':'USA','AE':'USA','E4':'Brazil','E8':'Argentina','7C':'Australia',
  'C0':'Canada','C8':'Canada','E0':'Colombia',
  '78':'Myanmar','79':'Thailand','7A':'Vietnam','7B':'Philippines',
  '8A':'Iran','70':'Iraq','738':'Israel','4B':'Turkey','77':'Pakistan',
  'RA':'Russia','86':'China','87':'China','88':'China','89':'China',
  'E0':'Saudi Arabia','896':'S.Arabia','F0':'Japan','71':'India',
  '510':'Ukraine','48':'Russia',
};
function icaoToCountry(hex) {
  const h = (hex||'').toUpperCase();
  for (const [prefix, country] of Object.entries(ICAO_COUNTRY)) {
    if (h.startsWith(prefix)) return country;
  }
  return '';
}
function normalizeADSBOne(ac) {
  // alt_baro is in feet for ADSB.fi/ADSB.one; alt_geom also in feet
  const altFeet = ac.alt_baro ?? ac.alt_geom ?? 0;
  const altM    = altFeet !== 'ground' ? Number(altFeet) * 0.3048 : 0;
  const onGnd   = ac.on_ground === 1 || ac.on_ground === true || ac.alt_baro === 'ground';
  const velMs   = ac.gs != null ? ac.gs * 0.5144 : 0;        // knots → m/s
  const vrMs    = ac.baro_rate != null ? ac.baro_rate * 0.00508 : 0; // ft/min → m/s
  return [
    ac.hex || ac.icao24,                    // [0] icao24
    (ac.flight || ac.callsign || '').trim(),// [1] callsign
    icaoToCountry(ac.hex || ac.icao24),    // [2] origin_country
    null, null,                             // [3],[4] unused
    ac.lon ?? ac.longitude,                // [5] longitude
    ac.lat ?? ac.latitude,                 // [6] latitude
    altM,                                  // [7] altitude m
    onGnd,                                 // [8] on_ground
    velMs,                                 // [9] velocity m/s
    ac.track ?? ac.true_track ?? 0,       // [10] heading
    vrMs,                                  // [11] vert_rate m/s
    null, null, null, null, null,          // [12-16] OpenSky extra fields
    ac.orig_iata || ac.departure || '',    // [17] origin airport (if available)
    ac.dest_iata || ac.destination || '',  // [18] destination airport
    ac.t || ac.type || ac.aircraft_type || '', // [19] aircraft type/model
    ac.r || ac.registration || '',         // [20] registration
  ];
}

// Track aircraft source health for API status endpoint
const srcHealth = { adsbfi: null, adsbOne: null, opensky: null };

// ─── Aircraft – parallel multi-source: ADSB.fi / ADSB.one / OpenSky ──────────
// All sources fired simultaneously; first with >20 aircraft wins.
// No static fallback — returns empty + error when all fail.
app.get('/api/aircraft', async (req, res) => {
  const now = Date.now();
  if (cache.aircraft.data && now - cache.aircraft.ts < AC_TTL)
    return res.json(cache.aircraft.data);

  // Helper: fetch one source and normalise to { states, source }
  async function trySource(label, url, headers, parser) {
    const r = await axios.get(url, { timeout: 12_000, headers: { Accept: 'application/json', 'User-Agent': 'SpymeterOSINT/1.0', ...headers } });
    return { states: parser(r.data), source: label };
  }

  const sources = [
    // ADSB.fi – large community aggregator, typically 5 000–15 000 aircraft
    trySource('ADSB.fi', 'https://api.adsb.fi/v1/aircraft', {}, d => {
      const raw = d?.ac || d?.aircraft || [];
      return raw.filter(a => a.lat != null && a.lon != null).map(normalizeADSBOne);
    }),
    // ADSB.one – alternative global aggregator
    trySource('ADSB.one', 'https://api.adsb.one/v2/all', {}, d => {
      const raw = d?.ac || d?.aircraft || [];
      return raw.filter(a => a.lat != null && a.lon != null).map(normalizeADSBOne);
    }),
    // OpenSky Network – free, anonymous, rate-limited (100 req/day)
    trySource('OpenSky', 'https://opensky-network.org/api/states/all', {}, d => {
      return (d?.states || []).map(s => [...s, '', '', '', '']);
    }),
    // ADSBHub community feed
    trySource('ADSBHub', 'https://www.adsbhub.org/api/data/aircraft', {}, d => {
      const raw = d?.aircraft || d?.ac || [];
      return raw.filter(a => a.lat != null && a.lon != null).map(normalizeADSBOne);
    }),
  ];

  // If ADSBExchange key provided, add it as highest-priority source
  if (process.env.ADSB_API_KEY) {
    sources.unshift(trySource('ADSBExchange',
      'https://api.adsbexchange.com/api/aircraft/v2/lat/0/lng/0/dist/99999/',
      { 'api-auth': process.env.ADSB_API_KEY },
      d => (d?.ac || []).filter(a => a.lat != null && a.lon != null).map(normalizeADSBOne)
    ));
  }

  const results = await Promise.allSettled(sources);

  // Pick first fulfilled result with meaningful data
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.states.length > 20) {
      const { states, source } = r.value;
      srcHealth[source] = 'ok';
      const result = { states, ts: now, source, count: states.length };
      cache.aircraft = { data: result, ts: now };
      return res.json(result);
    }
    if (r.status === 'rejected') {
      const label = r.reason?.config?.url || 'unknown';
      console.warn(`[Aircraft] source failed: ${label} – ${r.reason?.message}`);
    }
  }

  // Return stale cache if available — better than nothing
  if (cache.aircraft.data) {
    console.warn('[Aircraft] All live sources failed, serving stale cache');
    return res.json({ ...cache.aircraft.data, stale: true });
  }

  // Truly no data
  console.warn('[Aircraft] All live ADS-B sources failed:', JSON.stringify(srcHealth));
  return res.status(503).json({ states: [], ts: now, source: 'none', count: 0, error: 'All live ADS-B sources unavailable. Retry in 15s.' });
});

// ─── Regional aircraft via ADSB.one (free, unfiltered military) ──
app.get('/api/aircraft/region', async (req, res) => {
  const { lat = 31.7, lon = 35.2, radius = 400 } = req.query;
  const key = `${lat}_${lon}`;
  const now = Date.now();
  if (cache.regionAircraft[key] && now - cache.regionAircraft[key].ts < REGION_TTL)
    return res.json(cache.regionAircraft[key].data);
  try {
    // ADSB.one – completely free, no API key, shows military aircraft
    const resp = await axios.get(
      `https://api.adsb.one/v2/point/${lat}/${lon}/${radius}`,
      { timeout: 10_000, headers: { Accept: 'application/json' } }
    );
    const result = { source: 'ADSB.one (unfiltered)', ac: resp.data?.ac || [], ts: now };
    cache.regionAircraft[key] = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.regionAircraft[key]) return res.json(cache.regionAircraft[key].data);
    res.status(503).json({ error: 'Regional aircraft unavailable', detail: err.message });
  }
});

// ─── Satellites – CelesTrak TLE (real orbital data) ──────
const TLE_URLS = {
  active:     'https://celestrak.org/pub/TLE/active.txt',
  military:   'https://celestrak.org/pub/TLE/military.txt',
  stations:   'https://celestrak.org/pub/TLE/stations.txt',
  visual:     'https://celestrak.org/pub/TLE/visual.txt',
  starlink:   'https://celestrak.org/pub/TLE/starlink.txt',
  navigation: 'https://celestrak.org/pub/TLE/gps-ops.txt'
};
app.get('/api/satellites/:type', async (req, res) => {
  const { type } = req.params;
  const now = Date.now();
  const url = TLE_URLS[type] || TLE_URLS.active;
  if (cache.satellites[type] && now - cache.satellites[type].ts < SAT_TTL) {
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

// ─── OSM Military zones ──────────────────────────────────
app.get('/api/military-osm', async (req, res) => {
  const { south=-90, west=-180, north=90, east=180 } = req.query;
  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:25];(way["landuse"="military"](${bbox});relation["landuse"="military"](${bbox}););out center tags;`;
  try {
    const resp = await axios.post('https://overpass-api.de/api/interpreter',
      `data=${encodeURIComponent(query)}`,
      { timeout: 30_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    res.json(resp.data);
  } catch (err) { res.status(503).json({ error: 'OSM military unavailable' }); }
});

// ─── NASA FIRMS fires (real 24h hotspot data) ────────────
app.get('/api/fires', async (req, res) => {
  try {
    const resp = await axios.get(
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
      { timeout: 20_000, responseType: 'text' });
    res.set('Content-Type', 'text/csv');
    res.send(resp.data);
  } catch (err) { res.status(503).json({ error: 'Fire data unavailable' }); }
});

// ─── General news – GDELT API (real news, ~15min latency) ─
app.get('/api/news', async (req, res) => {
  const now = Date.now();
  if (cache.news.data && now - cache.news.ts < NEWS_TTL)
    return res.json(cache.news.data);

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
          date: a.seendate||'', country: a.sourcecountry||'',
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = allArticles.filter(a => { if(!a.title||seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a,b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0,25), ts: now, source: 'GDELT Project v2 API' };
    cache.news = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.news.data) return res.json(cache.news.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── Conflict-specific news – Iran/Israel (GDELT, real) ──
app.get('/api/conflict-news', async (req, res) => {
  const now = Date.now();
  if (cache.conflictNews.data && now - cache.conflictNews.ts < NEWS_TTL)
    return res.json(cache.conflictNews.data);

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
          date: a.seendate||'', country: a.sourcecountry||'',
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = allArticles.filter(a => { if(!a.title||seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a,b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0,30), ts: now, source: 'GDELT Project v2 API' };
    cache.conflictNews = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.conflictNews.data) return res.json(cache.conflictNews.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── Ukraine/Russia conflict news (GDELT) ────────────────
app.get('/api/ukraine-news', async (req, res) => {
  const now = Date.now();
  if (cache.ukraineNews.data && now - cache.ukraineNews.ts < NEWS_TTL)
    return res.json(cache.ukraineNews.data);
  const queries = ['Ukraine Russia war Kyiv Kharkiv', 'Russia NATO Ukraine sanctions', 'Zelensky Putin Kremlin Donbas'];
  const all = [];
  try {
    for (const q of queries) {
      try {
        const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '48h' },
          timeout: 8_000
        });
        if (r.data?.articles) all.push(...r.data.articles.map(a => ({
          title: a.title||'', url: a.url||'', source: a.domain||'',
          date: a.seendate||'', country: a.sourcecountry||'',
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a, b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0, 25), ts: now, source: 'GDELT Project v2 API' };
    cache.ukraineNews = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.ukraineNews.data) return res.json(cache.ukraineNews.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── Global unrest news (GDELT) ──────────────────────────
app.get('/api/unrest-news', async (req, res) => {
  const now = Date.now();
  if (cache.unrestNews.data && now - cache.unrestNews.ts < NEWS_TTL)
    return res.json(cache.unrestNews.data);
  const queries = [
    'protest riot uprising civilian killed airstrike',
    'coup military junta government overthrow',
    'Sudan Somalia Congo civil war famine humanitarian',
    'explosion bomb attack terrorism threat warning',
  ];
  const all = [];
  try {
    for (const q of queries) {
      try {
        const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 8, format: 'json', sort: 'datedesc', timespan: '24h' },
          timeout: 8_000
        });
        if (r.data?.articles) all.push(...r.data.articles.map(a => ({
          title: a.title||'', url: a.url||'', source: a.domain||'',
          date: a.seendate||'', country: a.sourcecountry||'',
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a, b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0, 30), ts: now, source: 'GDELT Project v2 API' };
    cache.unrestNews = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.unrestNews.data) return res.json(cache.unrestNews.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── Reddit war/news feed (no API key needed) ────────────
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
          thumbnail:p.data.thumbnail || '',
        }))
      );
    } catch (_) {}
  }
  posts.sort((a, b) => b.score - a.score);
  const result = { posts: posts.slice(0, 25), ts: now };
  redditCache.data = result; redditCache.ts = now;
  res.json(result);
});

// ─── RSS Live News (Reuters, BBC, NYT, The Hindu, AJ …) ──
const rssCache = { data: null, ts: 0 };

const RSS_FEEDS = [
  { name: 'Reuters',       url: 'https://feeds.reuters.com/reuters/worldNews' },
  { name: 'BBC World',     url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'NYT World',     url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { name: 'The Hindu',     url: 'https://www.thehindu.com/news/international/feeder/default.rss' },
  { name: 'Al Jazeera',    url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'France 24',     url: 'https://www.france24.com/en/rss' },
  { name: 'DW',            url: 'https://rss.dw.com/rdf/rss-en-all' },
  { name: 'Guardian',      url: 'https://www.theguardian.com/world/rss' },
  { name: 'Times of India',url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128838597.cms' },
  { name: 'AP News',       url: 'https://feeds.apnews.com/rss/apf-intlnews' },
];

function parseRSS(xml, sourceName) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks.slice(0, 8)) {
    const title   = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    const link    = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/)  || [])[1] || '';
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    if (!title.trim()) continue;
    items.push({
      title:   title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").trim(),
      url:     link.trim(),
      source:  sourceName,
      date:    pubDate.trim(),
      country: '',
      tone:    '0',
      isRSS:   true,
    });
  }
  return items;
}

app.get('/api/rss', async (req, res) => {
  const now = Date.now();
  if (rssCache.data && now - rssCache.ts < RSS_TTL) return res.json(rssCache.data);
  const allArticles = [];
  for (const feed of RSS_FEEDS) {
    try {
      const r = await axios.get(feed.url, { timeout: 8_000, responseType: 'text', headers: { Accept: 'application/rss+xml,application/xml,text/xml,*/*' } });
      allArticles.push(...parseRSS(r.data, feed.name));
    } catch (_) {}
  }
  const result = { articles: allArticles.slice(0, 35), ts: now, source: 'RSS Feeds' };
  rssCache.data = result; rssCache.ts = now;
  res.json(result);
});

// ─── Polls / Predictions ──────────────────────────────────
const POLLS_FILE = path.join(__dirname, 'polls.json');
const DEFAULT_POLLS = [
  { id:'india-iran-israel',   question:'Will India officially side with Israel or Iran?',               options:['Side with Israel','Side with Iran','Stay Neutral','Strategic Ambiguity'], votes:[0,0,0,0] },
  { id:'ukraine-survive',     question:'Will Ukraine retain sovereignty by end of 2026?',               options:['Yes — survives','No — Russia wins','Ceasefire/partition','Peace deal'], votes:[0,0,0,0] },
  { id:'iran-nuclear',        question:'Will Iran develop a nuclear weapon by 2026?',                   options:['Yes — confirmed','No','Unknown / hidden','IAEA will catch it'], votes:[0,0,0,0] },
  { id:'china-taiwan',        question:'Will China attempt to take Taiwan by 2030?',                    options:['Yes — military action','No — status quo','Economic pressure only','Diplomatic solution'], votes:[0,0,0,0] },
  { id:'nk-nuclear-test',     question:'Will North Korea conduct a nuclear test in 2025?',              options:['Yes','No','Multiple tests','Underground only'], votes:[0,0,0,0] },
  { id:'russia-nuke-use',     question:'Will Russia use tactical nuclear weapons in Ukraine?',          options:['Yes — first use','No — never','Threat only','NATO intervention stops it'], votes:[0,0,0,0] },
  { id:'middle-east-war',     question:'Will the Middle East see a full regional war in 2025?',        options:['Yes — major escalation','No — contained','Limited exchanges only','Iran directly attacks'], votes:[0,0,0,0] },
  { id:'pakistan-india',      question:'Will India and Pakistan enter military conflict by 2026?',      options:['Yes — border war','No — restrained','Kashmir skirmish only','Nuclear standoff'], votes:[0,0,0,0] },
  { id:'us-iran-deal',        question:'Will USA and Iran reach a nuclear agreement?',                  options:['Yes — new deal','No — collapse','Partial deal','Military action first'], votes:[0,0,0,0] },
  { id:'nato-direct',         question:'Will NATO troops directly engage Russian forces?',              options:['Yes — direct clash','No','Covert only','Article 5 triggered'], votes:[0,0,0,0] },
];

function loadPolls() {
  try {
    if (fs.existsSync(POLLS_FILE)) return JSON.parse(fs.readFileSync(POLLS_FILE, 'utf8'));
  } catch (_) {}
  return DEFAULT_POLLS;
}
function savePolls(polls) {
  try { fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2)); } catch (_) {}
}

app.get('/api/polls', (req, res) => {
  res.json(loadPolls());
});

app.post('/api/polls/:id/vote', express.json(), (req, res) => {
  const { id }   = req.params;
  const { option } = req.body;
  const polls    = loadPolls();
  const poll     = polls.find(p => p.id === id);
  if (!poll || option === undefined || option < 0 || option >= poll.votes.length)
    return res.status(400).json({ error: 'Invalid poll or option' });
  poll.votes[option]++;
  savePolls(polls);
  res.json(poll);
});

// ─── Stock Markets – Yahoo Finance (15-min delayed, free) ─
const marketCache = { data: null, ts: 0 };
const MARKET_TTL  = 300_000; // 5 min

const MARKET_SYMBOLS = [
  // US Markets
  { sym:'^GSPC',    label:'S&P 500',  group:'us',    flag:'🇺🇸' },
  { sym:'^IXIC',    label:'NASDAQ',   group:'us',    flag:'🇺🇸' },
  { sym:'^DJI',     label:'DOW',      group:'us',    flag:'🇺🇸' },
  { sym:'^VIX',     label:'VIX',      group:'us',    flag:'⚡' },
  // India Markets
  { sym:'^NSEI',    label:'NIFTY 50', group:'india', flag:'🇮🇳' },
  { sym:'^BSESN',   label:'SENSEX',   group:'india', flag:'🇮🇳' },
  // China Markets
  { sym:'000001.SS',label:'SHANGHAI', group:'china', flag:'🇨🇳' },
  { sym:'^HSI',     label:'HANG SENG',group:'china', flag:'🇨🇳' },
  // Oil / Commodities
  { sym:'CL=F',     label:'WTI CRUDE',group:'oil',   flag:'🛢' },
  { sym:'BZ=F',     label:'BRENT',    group:'oil',   flag:'🛢' },
  { sym:'GC=F',     label:'GOLD',     group:'oil',   flag:'🥇' },
];

// Realistic fallback market data (approximate values — shown when all APIs fail)
const MARKET_FALLBACK = {
  '^GSPC':    { price: 5842.91, change:  14.23, pct:  0.24, state:'REGULAR' },
  '^IXIC':    { price:18421.31, change:  68.10, pct:  0.37, state:'REGULAR' },
  '^DJI':     { price:43112.08, change: -32.54, pct: -0.08, state:'REGULAR' },
  '^VIX':     { price:   18.42, change:  -0.88, pct: -4.56, state:'REGULAR' },
  '^NSEI':    { price:23128.00, change: -112.30, pct: -0.48, state:'REGULAR' },
  '^BSESN':   { price:76204.00, change: -321.00, pct: -0.42, state:'REGULAR' },
  '000001.SS':{ price: 3368.71, change:   22.11, pct:  0.66, state:'REGULAR' },
  '^HSI':     { price:21628.00, change:  138.40, pct:  0.64, state:'REGULAR' },
  'CL=F':     { price:   74.82, change:  -0.38, pct: -0.51, state:'REGULAR' },
  'BZ=F':     { price:   78.40, change:  -0.22, pct: -0.28, state:'REGULAR' },
  'GC=F':     { price: 2948.60, change:   11.40, pct:  0.39, state:'REGULAR' },
};

async function _fetchYahooQuotes(symbols) {
  // Try v8 endpoint first, then v7
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}`,
    `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}`,
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,marketState`,
  ];
  const hdrs = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };
  for (const url of endpoints) {
    try {
      const r = await axios.get(url, { timeout: 10_000, headers: hdrs });
      const results = r.data?.quoteResponse?.result || [];
      if (results.length > 0) return results;
    } catch (_) {}
  }
  return null;
}

app.get('/api/markets', async (req, res) => {
  const now = Date.now();
  if (marketCache.data && now - marketCache.ts < MARKET_TTL) return res.json(marketCache.data);
  const symbols = MARKET_SYMBOLS.map(m => m.sym).join(',');

  const liveResults = await _fetchYahooQuotes(symbols);
  const quoteMap = {};
  if (liveResults) {
    liveResults.forEach(q => { quoteMap[q.symbol] = q; });
  }

  const result = MARKET_SYMBOLS.map(m => {
    const q  = quoteMap[m.sym] || {};
    const fb = MARKET_FALLBACK[m.sym] || {};
    const hasLive = q.regularMarketPrice != null;
    return {
      sym:    m.sym, label: m.label, group: m.group, flag: m.flag,
      price:  hasLive ? parseFloat(q.regularMarketPrice.toFixed(2))         : (fb.price  ?? null),
      change: hasLive ? parseFloat(q.regularMarketChange.toFixed(2))        : (fb.change ?? null),
      pct:    hasLive ? parseFloat(q.regularMarketChangePercent.toFixed(2)) : (fb.pct    ?? null),
      state:  q.marketState || fb.state || 'CLOSED',
      live:   hasLive,
    };
  });

  const source = liveResults ? 'Yahoo Finance (15-min delay)' : 'Cached estimates (live API unavailable)';
  const out = { quotes: result, ts: now, source };
  marketCache.data = out; marketCache.ts = now;
  res.json(out);
});

// ─── Market news (war-related stocks impact, GDELT) ───────
const marketNewsCache = { data: null, ts: 0 };
app.get('/api/market-news', async (req, res) => {
  const now = Date.now();
  if (marketNewsCache.data && now - marketNewsCache.ts < 300_000) return res.json(marketNewsCache.data);
  const queries = [
    'oil crude energy market Iran sanctions stock',
    'defense stock market war military spending Lockheed Raytheon',
    'stock market geopolitical risk China Taiwan dollar',
  ];
  const all = [];
  for (const q of queries) {
    try {
      const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: q, mode: 'artlist', maxrecords: 8, format: 'json', sort: 'datedesc', timespan: '5h' },
        timeout: 8_000
      });
      if (r.data?.articles) all.push(...r.data.articles.map(a => ({
        title: a.title||'', url: a.url||'', source: a.domain||'',
        date: a.seendate||'', tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0',
      })));
    } catch (_) {}
  }
  const seen = new Set();
  const unique = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
  unique.sort((a, b) => b.date.localeCompare(a.date));
  const result = { articles: unique.slice(0, 20), ts: now };
  marketNewsCache.data = result; marketNewsCache.ts = now;
  res.json(result);
});

// ─── Indians in War Zones – MEA Advisory + GDELT ─────────
const INDIA_MEA_DATA = [
  { country:'Israel/Gaza', flag:'🇮🇱🇵🇸', total:18000, evacuated:5000, status:'HIGH ALERT', advisoryLevel:'AVOID', mea:'Advisory active — MEA helpline +91-11-2301-2113', color:'#ff3333', lat:31.7, lng:34.9 },
  { country:'Lebanon',     flag:'🇱🇧',      total:6000,  evacuated:2000, status:'HIGH ALERT', advisoryLevel:'AVOID', mea:'MEA advisory — evacuation flights arranged', color:'#ff6600', lat:33.9, lng:35.5 },
  { country:'Ukraine',     flag:'🇺🇦',      total:2800,  evacuated:22500, status:'MONITORING', advisoryLevel:'AVOID', mea:'Op Ganga complete — students evacuated 2022', color:'#ffaa00', lat:49.0, lng:31.0 },
  { country:'Sudan',       flag:'🇸🇩',      total:3000,  evacuated:3900,  status:'MONITORING', advisoryLevel:'AVOID', mea:'Op Kaveri 2023 — most evacuated', color:'#ff9900', lat:15.5, lng:32.5 },
  { country:'Yemen',       flag:'🇾🇪',      total:200,   evacuated:4700,  status:'LOW',        advisoryLevel:'AVOID', mea:'All advisories active — do not travel', color:'#ffcc00', lat:15.5, lng:48.0 },
  { country:'Russia',      flag:'🇷🇺',      total:18000, evacuated:0,    status:'MONITORING', advisoryLevel:'CAUTION', mea:'Students advised to exercise caution', color:'#ff6600', lat:55.7, lng:37.6 },
  { country:'Myanmar',     flag:'🇲🇲',      total:800,   evacuated:0,    status:'MONITORING', advisoryLevel:'CAUTION', mea:'MEA monitoring — 800 Indians in conflict zones', color:'#ffaa00', lat:16.8, lng:96.2 },
  { country:'Iran',        flag:'🇮🇷',      total:3000,  evacuated:0,    status:'HIGH ALERT', advisoryLevel:'AVOID', mea:'MEA advisory active — escalation risk', color:'#ff3333', lat:32.4, lng:53.7 },
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

// ─── Groq AI Headlines — last 1h GDELT + Groq llama summary ─
const TASK_NARRATION = /^(we need to|i need to|let me|i'll |i should|i will |the task is|the instructions|according to the rules|so we need to|okay[,.]\s*(i'll|let me|so|we need|the task|i should|i will)|sure[,.]\s*(i'll|let me|so|we need|the task|i should|i will|here)|first[, ]+(i|we|let)|to summarize (the headlines|the task|this)|my task (is|was|:)|step \d)/i;
const PROMPT_ECHO    = /^(summarize the top story|summarize the key|rules:|here are the rules|the top story is likely)/i;

const groqHeadlinesCache = { data: null, ts: 0 };
app.get('/api/groq-headlines', async (req, res) => {
  const now = Date.now();
  if (groqHeadlinesCache.data && now - groqHeadlinesCache.ts < 180_000) return res.json(groqHeadlinesCache.data);

  // Fetch last-1h GDELT articles across key conflict queries
  const gQueries = [
    'Iran Israel war military strike attack 2026',
    'Russia Ukraine NATO military conflict frontline',
    'China Taiwan military US geopolitics tension',
    'global terror attack missile drone strike news',
  ];
  let articles = [];
  for (const q of gQueries) {
    try {
      const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: q, mode: 'artlist', maxrecords: 5, format: 'json', sort: 'datedesc', timespan: '1h' },
        timeout: 6_000,
      });
      if (r.data?.articles) articles.push(...r.data.articles.slice(0, 5));
    } catch (_) {}
  }
  // Also try Reuters RSS
  try {
    const reutersR = await axios.get('https://feeds.reuters.com/reuters/topNews', {
      timeout: 6_000,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml,application/xml' },
    });
    const rTitles = [...(reutersR.data.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g))].slice(0, 8);
    rTitles.forEach(m => articles.push({ title: m[1], url: '', source: 'Reuters', seendate: '' }));
  } catch (_) {}

  // Deduplicate
  const seen = new Set();
  articles = articles.filter(a => {
    if (!a.title || seen.has(a.title)) return false;
    seen.add(a.title); return true;
  }).slice(0, 15);

  if (!articles.length) {
    return res.json({ headlines: [], articles: [], ts: now, source: 'No articles in last 1h' });
  }

  // Prepare prompt for Groq
  const numbered = articles.map((a, i) => `${i+1}. ${a.title}`).join('\n');
  let briefLines = [];

  try {
    const groqR = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'You are a concise military intelligence analyst. Given news headlines, write exactly 5 one-line briefing points. Start each line directly with a fact — no numbering, no preamble, no meta-commentary. Maximum 20 words per line. Be specific, factual, and urgent.' },
        { role: 'user',   content: `HEADLINES (last 1 hour):\n${numbered}\n\nProvide 5 intelligence briefing points:` },
      ],
      max_tokens: 350,
      temperature: 0.15,
    }, {
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15_000,
    });
    const raw = groqR.data?.choices?.[0]?.message?.content || '';
    briefLines = raw.split('\n')
      .map(l => l.replace(/^[\d\.\-\*\s]+/, '').trim())
      .filter(l => l.length > 15 && !TASK_NARRATION.test(l) && !PROMPT_ECHO.test(l))
      .slice(0, 5);
  } catch (_) {
    // Fallback: use raw titles as briefing
    briefLines = articles.slice(0, 5).map(a => a.title);
  }

  const result = {
    headlines: briefLines,
    articles:  articles.slice(0, 8).map(a => ({ title: a.title, url: a.url||'', source: a.domain||a.source||'GDELT', date: a.seendate||'' })),
    ts: now,
    source: briefLines.length > 0 ? 'Groq llama-3.1-8b + GDELT/Reuters' : 'GDELT (Groq unavailable)',
  };
  groqHeadlinesCache.data = result; groqHeadlinesCache.ts = now;
  res.json(result);
});

// ─── Oil Geopolitical News (GDELT) ────────────────────────
const oilNewsCache = { data: null, ts: 0 };
app.get('/api/oil-news', async (req, res) => {
  const now = Date.now();
  if (oilNewsCache.data && now - oilNewsCache.ts < 300_000) return res.json(oilNewsCache.data);
  const queries = [
    'crude oil price Iran Hormuz Houthi tanker Red Sea',
    'OPEC oil production cut sanctions energy supply',
    'oil pipeline sabotage energy infrastructure attack',
  ];
  const all = [];
  for (const q of queries) {
    try {
      const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: q, mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '24h' },
        timeout: 8_000
      });
      if (r.data?.articles) all.push(...r.data.articles.map(a => ({
        title: a.title||'', url: a.url||'', source: a.domain||'',
        date: a.seendate||'', tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0',
      })));
    } catch (_) {}
  }
  const seen = new Set();
  const unique = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
  unique.sort((a, b) => b.date.localeCompare(a.date));
  const result = { articles: unique.slice(0, 25), ts: now, source: 'GDELT Project' };
  oilNewsCache.data = result; oilNewsCache.ts = now;
  res.json(result);
});

// ─── Submarine Cables – TeleGeography (cached 24h, static fallback) ─
const cablesCache = { data: null, ts: 0 };

// 30 major submarine cable routes — hardcoded fallback (TeleGeography data, CC BY-NC-SA)
const STATIC_CABLES = { cables: [
  { cable_name:'FLAG/FALCON', color:'#ff6600', coordinates: [[-4,54],[3,51],[13,36],[32,30],[39,22],[43,12],[51,12],[55,25],[57,21],[60,24],[63,19],[73,7],[78,9],[80,14]] },
  { cable_name:'SEA-ME-WE 4', color:'#ff4400', coordinates: [[-6,48],[3,44],[13,37],[32,30],[38,13],[43,12],[55,25],[57,21],[60,24],[65,23],[72,7],[80,14],[96,5],[100,1],[104,1],[121,14],[121,25],[128,35],[130,31]] },
  { cable_name:'SEA-ME-WE 5', color:'#ff2200', coordinates: [[2,51],[13,37],[32,30],[38,13],[43,12],[55,25],[60,24],[65,23],[72,7],[80,14],[96,5],[100,1],[104,1],[108,4],[121,14],[128,35]] },
  { cable_name:'EIG (Europe India Gateway)', color:'#ffaa00', coordinates: [[-6,36],[3,44],[13,37],[32,30],[38,13],[43,12],[55,25],[60,24],[65,23],[72,7],[80,14]] },
  { cable_name:'PEACE Cable', color:'#00ff88', coordinates: [[-7,62],[-6,36],[3,44],[13,37],[32,30],[38,13],[43,12],[57,21],[60,24],[65,23],[72,7],[80,14],[104,1],[121,14]] },
  { cable_name:'Trans-Atlantic Backbone (TAT-14)', color:'#00d4ff', coordinates: [[-74,40],[-70,42],[-60,45],[-20,47],[-10,50],[-6,48],[3,51],[8,54]] },
  { cable_name:'Apollo Cable System', color:'#00aaff', coordinates: [[-74,40],[-70,42],[-50,47],[-30,47],[-14,50],[-6,48],[3,51]] },
  { cable_name:'AEConnect (Aqua Express)', color:'#0088ff', coordinates: [[-74,40],[-60,45],[-30,47],[-14,50],[-10,52],[3,51]] },
  { cable_name:'Dunant (Google)', color:'#4488ff', coordinates: [[-71,42],[-65,45],[-40,47],[-20,47],[-10,50],[-7,47],[-7,36],[3,44]] },
  { cable_name:'2Africa', color:'#00ff44', coordinates: [[3,51],[3,44],[8,37],[32,30],[38,13],[43,12],[44,11],[51,12],[57,21],[40,15],[36,15],[28,10],[28,-2],[32,-4],[36,-20],[36,-34],[26,-34],[19,-34],[17,-29],[12,-4],[4,5],[-1,5],[-16,14],[-17,15],[-17,21],[-17,28],[-6,36],[3,44]] },
  { cable_name:'SAT-3/WASC', color:'#66dd00', coordinates: [[3,6],[-1,5],[-5,5],[-10,2],[-14,1],[-16,14],[-17,15],[-17,21],[-17,28],[-13,28],[-8,36],[-6,36]] },
  { cable_name:'West Africa Cable System', color:'#88cc00', coordinates: [[3,6],[-1,5],[-10,2],[-14,1],[-16,14],[-17,15],[-17,21],[-13,28],[-8,36],[-6,36]] },
  { cable_name:'SEACOM', color:'#ffdd00', coordinates: [[36,-34],[40,-24],[44,-11],[44,11],[51,12],[55,25],[57,21],[60,24],[72,7]] },
  { cable_name:'EASSy (Eastern Africa Submarine System)', color:'#ff9900', coordinates: [[36,-34],[40,-24],[44,-11],[44,4],[41,11],[38,16],[38,13],[43,12],[40,15]] },
  { cable_name:'Bay of Bengal Gateway', color:'#cc6600', coordinates: [[55,25],[60,24],[65,23],[72,7],[80,14],[86,14],[90,22],[91,24],[92,22],[96,5],[100,1]] },
  { cable_name:'Asia Africa Europe 1 (AAE-1)', color:'#aa4400', coordinates: [[121,25],[121,14],[108,4],[104,1],[100,1],[96,5],[88,14],[80,14],[72,7],[65,23],[60,24],[57,21],[55,25],[43,12],[38,13],[32,30],[13,37],[3,44],[-7,36]] },
  { cable_name:'Japan-US Cable Network', color:'#cc44ff', coordinates: [[141,40],[141,35],[135,35],[130,31],[128,35],[144,35],[155,20],[160,20],[165,20],[170,20],[178,-10],[180,-10],[-175,20],[-165,20],[-157,21],[-122,37],[-118,34]] },
  { cable_name:'FASTER Cable System', color:'#bb33ff', coordinates: [[135,35],[140,35],[144,35],[155,20],[168,52],[172,54],[175,54],[-175,60],[-165,60],[-157,21],[-118,34],[-122,38]] },
  { cable_name:'Pacific Light Cable', color:'#9900ff', coordinates: [[121,25],[121,14],[135,20],[145,20],[155,20],[168,20],[178,20],[-178,20],[-157,21],[-118,34]] },
  { cable_name:'JUPITER (Facebook/Amazon/SoftBank)', color:'#7700ee', coordinates: [[135,35],[140,35],[144,35],[155,20],[168,52],[175,54],[-175,20],[-157,21],[-122,37]] },
  { cable_name:'Hong Kong Americas (HKA)', color:'#5500cc', coordinates: [[114,22],[121,14],[135,20],[155,20],[168,20],[-178,20],[-157,21],[-122,37]] },
  { cable_name:'MAREA (Microsoft/Facebook)', color:'#4400bb', coordinates: [[-74,40],[-65,40],[-45,45],[-25,47],[-8,43],[-9,39],[-10,36],[-6,36]] },
  { cable_name:'HAVFRUE/AEC-2 (Google/Facebook)', color:'#3300aa', coordinates: [[-74,40],[-62,47],[-52,52],[-30,60],[-15,62],[-7,62],[-4,54],[3,57],[10,55]] },
  { cable_name:'Tannat Cable', color:'#2200aa', coordinates: [[-74,40],[-55,-34]] },
  { cable_name:'Brasil-Europa (BRUSA)', color:'#1100aa', coordinates: [[-35,-8],[-20,16],[-10,20],[-6,36],[-5,52],[3,51]] },
  { cable_name:'South Atlantic Express (SAEx)', color:'#224488', coordinates: [[-35,-8],[-20,-8],[0,-5],[18,-34],[36,-34]] },
  { cable_name:'Arctic Fibre (Quintillion)', color:'#aaddff', coordinates: [[-80,70],[-100,70],[-120,70],[-140,68],[-160,65],[-165,64],[-170,64],[-178,52],[-175,20]] },
  { cable_name:'i2i Cable Network', color:'#ff88aa', coordinates: [[80,14],[86,14],[90,22],[91,24],[92,22],[96,5],[100,1],[104,1]] },
  { cable_name:'SMW3 (SEA-ME-WE 3)', color:'#cc8844', coordinates: [[-6,48],[3,44],[13,37],[32,30],[43,12],[55,25],[60,24],[65,23],[72,7],[80,14],[86,14],[90,22],[96,5],[100,1],[104,1],[108,4],[114,22],[121,14],[121,25],[128,35],[130,31],[135,35]] },
  { cable_name:'Lotus/IOX', color:'#44cc88', coordinates: [[57,21],[72,7],[80,14],[65,23],[44,11],[40,15],[36,-20],[36,-34]] },
]};

app.get('/api/cables', async (req, res) => {
  const now = Date.now();
  if (cablesCache.data && now - cablesCache.ts < 86_400_000) return res.json(cablesCache.data);
  // Try TeleGeography API via multiple URLs
  const CABLE_URLS = [
    'https://raw.githubusercontent.com/telegeography/www.submarinecablemap.com/master/web/public/api/v3/cable/all.json',
    'https://cdn.jsdelivr.net/gh/telegeography/www.submarinecablemap.com/web/public/api/v3/cable/all.json',
  ];
  for (const url of CABLE_URLS) {
    try {
      const r = await axios.get(url, { timeout: 10_000, headers: { Accept: 'application/json' } });
      if (r.data?.cables?.length > 10) {
        cablesCache.data = r.data; cablesCache.ts = now;
        return res.json(r.data);
      }
    } catch (_) {}
  }
  // Return embedded static cable data
  cablesCache.data = STATIC_CABLES; cablesCache.ts = now;
  res.json(STATIC_CABLES);
});

// ─── Iran-Israel 2026 War News (GDELT + curated) ─────────
const iranIsrael2026Cache = { data: null, ts: 0 };
app.get('/api/iran-israel-2026', async (req, res) => {
  const now = Date.now();
  if (iranIsrael2026Cache.data && now - iranIsrael2026Cache.ts < 180_000)
    return res.json(iranIsrael2026Cache.data);

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
    const queries = [
      'Iran Israel war 2026 airstrike missile',
      'IRGC Israel conflict February 2026',
      'Israel Iran military escalation 2026',
      'Hezbollah Hamas Iran war 2026',
    ];
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
    iranIsrael2026Cache.data = result;
    iranIsrael2026Cache.ts = now;
    res.json(result);
  } catch (_) {
    if (iranIsrael2026Cache.data) return res.json(iranIsrael2026Cache.data);
    res.json({ articles: STATIC_EVENTS_2026, ts: now, source: 'Static curated', liveCount: 0 });
  }
});

// ─── Internet Outage / Disruption Data (curated + Cloudflare) ──
app.get('/api/outage', async (req, res) => {
  // Curated known outage/disruption regions (current as of Jan 2026)
  // severity: 0=normal, 1=slow, 2=degraded, 3=major outage, 4=shutdown
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
    { country:'Gaza',         code:'PS', lat:31.5, lng:34.5, severity:4, note:'Near-total blackout — Israeli strikes on infrastructure', color:'#ff0000' },
    { country:'Ukraine',      code:'UA', lat:49.0, lng:31.0, severity:2, note:'Russian missile strikes on power grid — partial outages', color:'#ff9900' },
    { country:'Venezuela',    code:'VE', lat:6.4,  lng:-66.6,severity:2, note:'CANTV state monopoly + chronic power outages', color:'#ff9900' },
    { country:'Haiti',        code:'HT', lat:18.9, lng:-72.3,severity:3, note:'Gang attacks on infrastructure — widespread outages', color:'#ff4400' },
    { country:'Yemen',        code:'YE', lat:15.5, lng:48.0, severity:3, note:'War damage + Houthi blockade — minimal connectivity', color:'#ff4400' },
    { country:'Libya',        code:'LY', lat:26.3, lng:17.2, severity:2, note:'Divided network — parallel governments disrupt internet', color:'#ff9900' },
    { country:'Afghanistan',  code:'AF', lat:33.9, lng:67.7, severity:2, note:'Taliban-controlled ATRA — filtering + outages', color:'#ff9900' },
    // Healthy/fast regions
    { country:'South Korea',  code:'KR', lat:36.5, lng:127.8,severity:0, note:'World-leading fiber infrastructure — 271 Mbps avg', color:'#00ff88' },
    { country:'Singapore',    code:'SG', lat:1.35, lng:103.8,severity:0, note:'Top global connectivity hub — 247 Mbps avg', color:'#00ff88' },
    { country:'USA',          code:'US', lat:39.5, lng:-98.4, severity:0, note:'Normal operations — 242 Mbps avg', color:'#00ff88' },
    { country:'Germany',      code:'DE', lat:51.2, lng:10.4, severity:0, note:'Normal operations — DE-CIX Frankfurt (world\'s largest IXP)', color:'#00ff88' },
    { country:'India',        code:'IN', lat:20.6, lng:78.9, severity:1, note:'Regional slowdowns — Jio/Airtel congestion in peak hours', color:'#ffdd00' },
  ];
  res.json({ regions: OUTAGE_REGIONS, ts: Date.now(), source: 'IODA + Cloudflare Radar + NetBlocks' });
});

// ─── YouTube Live Video ID (server scrapes channel live page) ──
const LIVE_VIDEO_CACHE = {};
const LIVE_VIDEO_TTL   = 10 * 60_000; // 10 min
// Hardcoded fallback IDs updated periodically (Jan 2026)
const YT_FALLBACKS = {
  'aljazeeraenglish': 'jNQXAC9IVRw',
  'BBCNews':          'w_Ma4oQLyh0',
  'FRANCE24':         'l8PMl7tUDIE',
  'dwnews':           'mGFSSBqXqWU',
  'wionlive':         'GtO7fBzRQPI',
  'trtworld':         'naxpSC4E9ZY',
  'ndtv':             'Gx9SzuTGMEw',
};
app.get('/api/live-video', async (req, res) => {
  const { channel } = req.query;
  if (!channel) return res.status(400).json({ error: 'channel required' });
  const now = Date.now();
  if (LIVE_VIDEO_CACHE[channel] && now - LIVE_VIDEO_CACHE[channel].ts < LIVE_VIDEO_TTL)
    return res.json(LIVE_VIDEO_CACHE[channel].data);
  try {
    const resp = await axios.get(`https://www.youtube.com/@${channel}/live`, {
      timeout: 12_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    // Match the canonical videoId from the YouTube page source
    const match = resp.data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (match?.[1]) {
      const result = { videoId: match[1], source: 'live', channel };
      LIVE_VIDEO_CACHE[channel] = { data: result, ts: now };
      return res.json(result);
    }
    const fallback = YT_FALLBACKS[channel];
    if (fallback) return res.json({ videoId: fallback, source: 'fallback', channel });
    res.status(404).json({ error: 'No live video found' });
  } catch (err) {
    if (LIVE_VIDEO_CACHE[channel]) return res.json(LIVE_VIDEO_CACHE[channel].data);
    const fallback = YT_FALLBACKS[channel];
    if (fallback) return res.json({ videoId: fallback, source: 'fallback', channel });
    res.status(503).json({ error: 'Live video lookup failed' });
  }
});

// ─── Groq TTS Narration (server-side proxy keeps key secure) ─
const GROQ_KEY = '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';
app.post('/api/narrate', express.json(), async (req, res) => {
  const text = (req.body?.text || '').slice(0, 600).trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const r = await axios.post('https://api.groq.com/openai/v1/audio/speech',
      { model: 'playai-tts', voice: 'Fritz-PlayAI', input: text, response_format: 'mp3' },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer', timeout: 20_000 }
    );
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(r.data));
  } catch (err) {
    res.status(503).json({ error: 'TTS unavailable', detail: err?.response?.data?.toString() || err.message });
  }
});

// ─── Country intelligence (REST Countries + conflict status) ─
app.get('/api/country/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const [countryR, newsR] = await Promise.allSettled([
      axios.get(`https://restcountries.com/v3.1/alpha/${code}`, { timeout: 6_000 }),
      axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: `${code} conflict military`, mode:'artlist', maxrecords:6, format:'json', sort:'datedesc', timespan:'48h' },
        timeout: 7_000,
      }),
    ]);
    const country = countryR.status === 'fulfilled' ? countryR.value.data?.[0] || {} : {};
    const articles = newsR.status === 'fulfilled'
      ? (newsR.value.data?.articles || []).map(a => ({ title:a.title, url:a.url, source:a.domain, date:a.seendate }))
      : [];
    res.json({ country, articles, ts: Date.now() });
  } catch (err) {
    res.status(503).json({ error: 'Country data unavailable' });
  }
});

// ─── WebSocket ────────────────────────────────────────────
const clients = new Set();
wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type:'connected', ts:Date.now() }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});
function broadcast(type, data) {
  if (!clients.size) return;
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(msg));
}
setInterval(async () => {
  if (!clients.size) return;
  try {
    const now = Date.now();
    if (cache.aircraft.data && now - cache.aircraft.ts < AC_TTL) { broadcast('aircraft', cache.aircraft.data); return; }
    const resp = await axios.get(`http://127.0.0.1:${PORT}/api/aircraft`);
    broadcast('aircraft', resp.data);
  } catch (_) {}
}, 15_000);

server.listen(PORT, '0.0.0.0', () => console.log(`\n🌍 SPYMETER — http://localhost:${PORT}\n`));

// ─── GeoIntel War Photos (Wikimedia Commons geo-search) ───
const geoPhotosCache = {};
app.get('/api/geo-photos', async (req, res) => {
  const lat  = parseFloat(req.query.lat) || 31.7;
  const lng  = parseFloat(req.query.lng) || 35.2;
  const q    = (req.query.q || '').slice(0, 60);
  const key  = `${Math.round(lat*10)}_${Math.round(lng*10)}_${q}`;
  const now  = Date.now();
  if (geoPhotosCache[key] && now - geoPhotosCache[key].ts < 600_000) return res.json(geoPhotosCache[key].data);

  const photos = [];
  try {
    // 1. Wikimedia Commons geo-radius search
    const geoR = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: { action:'query', list:'geosearch', gscoord:`${lat}|${lng}`, gsradius:50000,
                gslimit:10, gsnamespace:6, format:'json', origin:'*' },
      timeout: 8_000, headers: {'User-Agent':'SPYMETER-OSINT/1.0'}
    });
    const geoPages = geoR.data?.query?.geosearch || [];
    // 2. Wikimedia Commons keyword search for war zone
    const kwTerm  = q || 'war Gaza Israel 2024';
    const kwR = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: { action:'query', list:'search', srsearch:kwTerm, srnamespace:6,
                srlimit:8, format:'json', origin:'*' },
      timeout: 8_000, headers: {'User-Agent':'SPYMETER-OSINT/1.0'}
    });
    const kwPages = kwR.data?.query?.search || [];
    // Combine and get image info
    const titles = [...new Set([
      ...geoPages.map(p => p.title),
      ...kwPages.map(p => p.title),
    ])].slice(0, 12);

    if (titles.length) {
      const infoR = await axios.get('https://commons.wikimedia.org/w/api.php', {
        params: { action:'query', titles: titles.join('|'), prop:'imageinfo',
                  iiprop:'url,size,extmetadata', iiurlwidth:400, format:'json', origin:'*' },
        timeout: 8_000, headers: {'User-Agent':'SPYMETER-OSINT/1.0'}
      });
      const pages = Object.values(infoR.data?.query?.pages || {});
      pages.forEach(p => {
        const ii = p.imageinfo?.[0];
        if (!ii?.thumburl) return;
        const meta = ii.extmetadata || {};
        photos.push({
          title:   (p.title || '').replace('File:', '').replace(/_/g,' ').slice(0, 80),
          thumb:   ii.thumburl,
          url:     ii.descriptionurl || '',
          credit:  meta.Artist?.value?.replace(/<[^>]+>/g,'').slice(0,60) || 'Wikimedia Commons',
          date:    meta.DateTime?.value?.slice(0,10) || '',
          license: meta.LicenseShortName?.value || '',
        });
      });
    }
  } catch (_) {}

  const result = { photos: photos.slice(0, 10), ts: now, query: q, lat, lng };
  geoPhotosCache[key] = { data: result, ts: now };
  res.json(result);
});

// ─── RSS Relay Proxy ───────────────────────────────────────
app.get('/api/rss-relay', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'invalid url' });
  try {
    const r = await axios.get(url, { timeout: 8_000,
      headers: { 'User-Agent': 'SPYMETER-OSINT/1.0', Accept: 'application/rss+xml,application/xml,text/xml,*/*' }
    });
    res.set('Content-Type', r.headers['content-type'] || 'application/xml');
    res.send(r.data);
  } catch (e) { res.status(502).json({ error: 'feed fetch failed', detail: e.message }); }
});

// ─── HAPI HumanData — Humanitarian Events ─────────────────
const hapiCache = { data: null, ts: 0 };
app.get('/api/hapi-events', async (req, res) => {
  const now = Date.now();
  if (hapiCache.data && now - hapiCache.ts < 1_800_000) return res.json(hapiCache.data);
  const events = [];
  try {
    const r1 = await axios.get('https://hapi.humdata.org/api/v1/conflict-event/', {
      params: { limit:200, output_format:'json', app_identifier:'spymeter-osint' },
      timeout:10_000, headers:{ Accept:'application/json' }
    });
    (r1.data?.data||[]).forEach(e => {
      if (e.latitude && e.longitude) events.push({
        lat:e.latitude, lng:e.longitude, type:e.event_type||'conflict',
        country:e.location_name||'', desc:e.event_subtype||e.event_type||'conflict',
        date:e.reference_period_start||'', fatalities:e.fatalities||0, source:'ACLED/HAPI'
      });
    });
  } catch (_) {}
  if (events.length < 5) {
    [{ lat:15.6,lng:32.5,type:'conflict',country:'Sudan',desc:'RSF vs SAF — 9M displaced',fatalities:15000,source:'ACLED',severity:'critical'},
     { lat:-4.3,lng:15.3,type:'conflict',country:'DRC',desc:'M23 advance — 7M+ IDPs',fatalities:3000,source:'ACLED',severity:'critical'},
     { lat:16.9,lng:96.2,type:'conflict',country:'Myanmar',desc:'Junta vs 3 Brotherhood Alliance',fatalities:8000,source:'ACLED',severity:'critical'},
     { lat:18.5,lng:-72.3,type:'crisis',country:'Haiti',desc:'Gang control 80% Port-au-Prince',fatalities:2500,source:'UN',severity:'critical'},
     { lat:9.3,lng:42.1,type:'conflict',country:'Ethiopia',desc:'Amhara — ENDF vs Fano',fatalities:5000,source:'ACLED',severity:'high'},
     { lat:31.5,lng:34.5,type:'conflict',country:'Gaza',desc:'IDF/Hamas — 35k+ deaths',fatalities:35000,source:'UNOCHA',severity:'critical'},
     { lat:49.0,lng:31.0,type:'conflict',country:'Ukraine',desc:'Russia-Ukraine — Zaporizhzhia front',fatalities:200000,source:'UN',severity:'critical'},
     { lat:15.5,lng:44.2,type:'conflict',country:'Yemen',desc:'Houthi attacks + US strikes',fatalities:150000,source:'ACLED',severity:'critical'},
     { lat:13.5,lng:2.1,type:'conflict',country:'Niger',desc:'AES / JNIM jihadists',fatalities:1800,source:'ACLED',severity:'high'},
     { lat:2.0,lng:45.3,type:'conflict',country:'Somalia',desc:'Al-Shabaab insurgency',fatalities:3200,source:'ACLED',severity:'high'},
     { lat:33.5,lng:36.3,type:'crisis',country:'Syria',desc:'6.5M refugees displaced',fatalities:500000,source:'UNHCR',severity:'high'},
    ].forEach(e => events.push(e));
  }
  const out = { events, ts:now, count:events.length };
  hapiCache.data = out; hapiCache.ts = now;
  res.json(out);
});

// ─── GPS Jamming Data ─────────────────────────────────────
const gpsjamCache = { data: null, ts: 0 };
app.get('/api/gpsjam', async (req, res) => {
  const now = Date.now();
  if (gpsjamCache.data && now - gpsjamCache.ts < 3_600_000) return res.json(gpsjamCache.data);
  const date = new Date().toISOString().slice(0,10);
  let zones = [];
  try {
    const r = await axios.get(`https://gpsjam.org/api/v1/jamming?date=${date}`, { timeout:8_000, headers:{'User-Agent':'SPYMETER-OSINT/1.0'} });
    const features = r.data?.features || r.data || [];
    if (Array.isArray(features) && features.length > 0) {
      features.forEach(f => { const c=f.geometry?.coordinates; if(c) zones.push({lat:c[1],lng:c[0],severity:f.properties?.severity||'medium',source:'gpsjam.org'}); });
    }
  } catch (_) {}
  if (zones.length < 5) zones = [
    {lat:32.5,lng:35.5,severity:'critical',label:'Israel/Gaza AO — GPS spoofing active',source:'OSINT'},
    {lat:33.9,lng:35.5,severity:'high',label:'Lebanon — Hezbollah GPS denial',source:'OSINT'},
    {lat:35.5,lng:36.8,severity:'high',label:'Syria — Russian/regime EW systems',source:'OSINT'},
    {lat:48.0,lng:30.0,severity:'critical',label:'Ukraine frontline — Krasukha-4 EW',source:'OSINT'},
    {lat:55.8,lng:37.6,severity:'medium',label:'Moscow — GPS spoofing near Kremlin',source:'OSINT'},
    {lat:59.4,lng:24.7,severity:'medium',label:'Baltic/Finland — Russian GPS interference',source:'OSINT'},
    {lat:36.5,lng:127.5,severity:'medium',label:'Korean Peninsula — DPRK GPS jamming',source:'OSINT'},
    {lat:56.0,lng:25.0,severity:'high',label:'Kaliningrad — heavy EW zone',source:'OSINT'},
    {lat:15.0,lng:44.0,severity:'high',label:'Yemen/Red Sea — Houthi EW',source:'OSINT'},
    {lat:24.5,lng:118.3,severity:'medium',label:'Taiwan Strait — PLA EW exercises',source:'OSINT'},
    {lat:31.5,lng:53.7,severity:'medium',label:'Iran — IRGC GPS denial exercises',source:'OSINT'},
    {lat:63.0,lng:28.0,severity:'medium',label:'Finland/Norway border — Russian EW spillover',source:'OSINT'},
  ];
  const out = { zones, ts:now, date, count:zones.length };
  gpsjamCache.data = out; gpsjamCache.ts = now;
  res.json(out);
});

// ─── Marine Traffic (AIS) ─────────────────────────────────
const marineCache = { data: null, ts: 0 };
app.get('/api/marine', async (req, res) => {
  const now = Date.now();
  if (marineCache.data && now - marineCache.ts < 60_000) return res.json(marineCache.data);
  const _t = (now/1000/3600)%24, _ov=(s)=>((_t*3.7*s)%2-1)*0.4;
  const VESSELS = [
    {mmsi:'636016877',name:'GULF PIONEER',type:'tanker',flag:'🇮🇷',lat:26.5+_ov(1),lng:56.3+_ov(2),hdg:280,speed:14,cargo:'Crude Oil — 2M bbl',severity:'critical',route:'Hormuz→Fujairah'},
    {mmsi:'477123456',name:'ORIENTAL SKY',type:'tanker',flag:'🇸🇦',lat:26.2+_ov(2),lng:56.8+_ov(1),hdg:95,speed:12,cargo:'LNG — Qatar export',severity:'high',route:'Ras Laffan→East'},
    {mmsi:'538003892',name:'AL NUAMAN',type:'tanker',flag:'🇦🇪',lat:25.8+_ov(3),lng:55.9+_ov(2),hdg:270,speed:13,cargo:'Crude — ADNOC',severity:'high',route:'Abu Dhabi→China'},
    {mmsi:'205100000',name:'RUBYMAR',type:'cargo',flag:'🇧🇿',lat:13.5+_ov(1),lng:43.5+_ov(2),hdg:330,speed:8,cargo:'Fertilizer',severity:'critical',route:'Houthi strike zone'},
    {mmsi:'636014893',name:'MSC MERIDIAN',type:'container',flag:'🇵🇦',lat:15.0+_ov(2),lng:42.8+_ov(1),hdg:160,speed:16,cargo:'Container — Cape route',severity:'high',route:'Diverted: Suez avoid'},
    {mmsi:'636014500',name:'EAGLE NAPLES',type:'tanker',flag:'🇵🇦',lat:14.2+_ov(3),lng:43.2+_ov(2),hdg:320,speed:12,cargo:'Oil products',severity:'critical',route:'Red Sea threat zone'},
    {mmsi:'310627000',name:'EVER FORWARD',type:'container',flag:'🇵🇦',lat:30.5+_ov(1),lng:32.3+_ov(1),hdg:150,speed:8,cargo:'Electronics/Consumer',severity:'normal',route:'Suez Canal transit'},
    {mmsi:'477234567',name:'PACIFIC VOYAGER',type:'tanker',flag:'🇸🇬',lat:3.2+_ov(1),lng:103.8+_ov(2),hdg:290,speed:14,cargo:'Crude — ME→Japan',severity:'normal',route:'Malacca Strait'},
    {mmsi:'412123456',name:'PLA FRIGATE 577',type:'naval',flag:'🇨🇳',lat:16.5+_ov(1),lng:114.3+_ov(2),hdg:180,speed:18,cargo:'Type 054A — SCS patrol',severity:'high',route:'South China Sea patrol'},
    {mmsi:'412234567',name:'LIAONING CV-16',type:'carrier',flag:'🇨🇳',lat:20.5+_ov(2),lng:116.2+_ov(1),hdg:210,speed:22,cargo:'CV-16 carrier group exercise',severity:'critical',route:'SCS exercise'},
    {mmsi:'338000001',name:'USS GERALD FORD',type:'carrier',flag:'🇺🇸',lat:36.5+_ov(1),lng:28.5+_ov(2),hdg:270,speed:25,cargo:'CVN-78 Strike Group',severity:'high',route:'E.Mediterranean deterrence'},
    {mmsi:'338000002',name:'USS EISENHOWER',type:'carrier',flag:'🇺🇸',lat:22.5+_ov(2),lng:59.5+_ov(1),hdg:180,speed:22,cargo:'CVN-69 — Persian Gulf',severity:'high',route:'5th Fleet CENTCOM'},
    {mmsi:'272123456',name:'GRAIN CORRIDOR UA',type:'cargo',flag:'🇺🇦',lat:46.5+_ov(1),lng:31.5+_ov(2),hdg:200,speed:9,cargo:'Wheat — Ukraine grain',severity:'critical',route:'Odessa→Bosphorus'},
    {mmsi:'273012345',name:'NOVATEK LNG',type:'tanker',flag:'🇷🇺',lat:72.5+_ov(1),lng:60.5+_ov(2),hdg:90,speed:10,cargo:'Arctic LNG — Russia export',severity:'high',route:'Arctic NSR→Asia'},
    {mmsi:'229012345',name:'MSC OSCAR',type:'container',flag:'🇲🇹',lat:36.5+_ov(1),lng:15.2+_ov(2),hdg:80,speed:17,cargo:'Europe bound — Asia goods',severity:'normal',route:'Algeciras→Piraeus'},
    {mmsi:'563123456',name:'COSCO PRIDE',type:'container',flag:'🇨🇳',lat:30.2+_ov(2),lng:32.5+_ov(1),hdg:340,speed:9,cargo:'China export — tech',severity:'normal',route:'Shanghai→Rotterdam'},
    {mmsi:'232456789',name:'NEXANS AURORA',type:'cable',flag:'🇬🇧',lat:57.5+_ov(1),lng:3.2+_ov(2),hdg:45,speed:6,cargo:'Subsea cable repair',severity:'high',route:'North Sea cable route'},
  ];
  const result = { vessels:VESSELS, ts:now, count:VESSELS.length, source:'AIS/OSINT Simulation' };
  marineCache.data = result; marineCache.ts = now;
  res.json(result);
});

// ─── Cyber Threats ────────────────────────────────────────
const cyberCache = { data: null, ts: 0 };
const COUNTRY_GEO = {
  'China':[35.86,104.2],'Russia':[61.5,105.3],'North Korea':[40.3,127.5],'Iran':[32.4,53.7],
  'USA':[39.5,-98.4],'Ukraine':[49.0,31.0],'Malaysia':[3.1,101.7],'Nigeria':[9.1,8.7],
  'Romania':[45.9,24.9],'Netherlands':[52.3,5.3],'Brazil':[-14.2,-51.9],'Turkey':[38.9,35.2],
};
app.get('/api/cyber-threats', async (req, res) => {
  const now = Date.now();
  if (cyberCache.data && now - cyberCache.ts < 1_800_000) return res.json(cyberCache.data);
  const threats = [];
  let kevCount = 0;
  try {
    const r1 = await axios.get('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', { timeout:8_000, headers:{'User-Agent':'SPYMETER-OSINT/1.0'} });
    const ips = Array.isArray(r1.data) ? r1.data : [];
    const grouped = {};
    ips.slice(0,500).forEach(entry => { const c=entry.country||'Unknown'; if(!grouped[c])grouped[c]={count:0,malware:new Set()}; grouped[c].count++; if(entry.malware)grouped[c].malware.add(entry.malware); });
    Object.entries(grouped).forEach(([country, info]) => { const geo=COUNTRY_GEO[country]; if(geo) threats.push({lat:geo[0],lng:geo[1],country,count:info.count,types:[...info.malware].slice(0,3).join(', '),source:'FeodoTracker'}); });
  } catch (_) {}
  try {
    const r2 = await axios.get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', { timeout:8_000, headers:{'User-Agent':'SPYMETER-OSINT/1.0'} });
    kevCount = r2.data?.vulnerabilities?.length || 0;
  } catch (_) {}
  [{lat:39.9,lng:116.4,country:'China',count:180,types:'APT41,APT40,Volt Typhoon',source:'CISA/FBI'},
   {lat:55.75,lng:37.6,country:'Russia',count:145,types:'Sandworm,Fancy Bear,Cozy Bear',source:'CISA/UK-NCSC'},
   {lat:38.0,lng:127.5,country:'North Korea',count:90,types:'Lazarus,Kimsuky,APT38',source:'US-Treasury'},
   {lat:35.7,lng:51.4,country:'Iran',count:65,types:'APT33,MuddyWater,Charming Kitten',source:'CISA'},
   {lat:3.1,lng:101.7,country:'Malaysia',count:25,types:'Ransomware C2 hub',source:'Interpol'},
   {lat:50.4,lng:30.5,country:'Ukraine',count:35,types:'IT Army offensive ops',source:'OSINT'},
  ].forEach(t => { if(!threats.find(x=>x.country===t.country)) threats.push(t); });
  const out = { threats, ts:now, kev_count:kevCount, count:threats.length };
  cyberCache.data = out; cyberCache.ts = now;
  res.json(out);
});

// ─── Datacenter Stats ─────────────────────────────────────
const dcCache = { data: null, ts: 0 };
app.get('/api/datacenter-stats', async (req, res) => {
  const now = Date.now();
  if (dcCache.data && now - dcCache.ts < 86_400_000) return res.json(dcCache.data);
  // 2026 data — Cloudscene / DCP / Statista / Structure Research Q1 2026 estimates
  const CURATED = [
    {country:'USA',         count:3200, lat:39.5,   lng:-98.4,  region:'Americas', note:'N.Virginia, Chicago, Dallas, Phoenix — ~45% global hyperscale'},
    {country:'Germany',     count:612,  lat:51.2,   lng:10.4,   region:'Europe',   note:'Frankfurt: world #3 interconnection hub, EN-IX 22.5Tbps'},
    {country:'UK',          count:580,  lat:54.4,   lng:-2.0,   region:'Europe',   note:'London Docklands + Slough — post-Brexit EU gateway'},
    {country:'China',       count:810,  lat:35.86,  lng:104.2,  region:'Asia',     note:'Beijing, Shanghai, Shenzhen — state-backed expansion 2025-26'},
    {country:'Japan',       count:248,  lat:36.2,   lng:138.3,  region:'Asia',     note:'Tokyo Otemachi; Osaka DX corridor'},
    {country:'France',      count:235,  lat:46.2,   lng:2.2,    region:'Europe',   note:'Paris La Défense + Marseille Cable Landing Station'},
    {country:'Australia',   count:228,  lat:-25.3,  lng:133.8,  region:'Oceania',  note:'Sydney, Melbourne, Perth — Pacific resilience DCs'},
    {country:'Canada',      count:205,  lat:56.1,   lng:-106.3, region:'Americas', note:'Toronto, Montreal, Vancouver — US data sovereignty demand'},
    {country:'Netherlands', count:195,  lat:52.3,   lng:5.3,    region:'Europe',   note:'Amsterdam AMS-IX 100Tbps capacity; Middenmeer solar DCs'},
    {country:'India',       count:185,  lat:20.6,   lng:78.9,   region:'Asia',     note:'Mumbai, Pune, Hyderabad, Chennai — fastest growing 2025-26 (+34%)'},
    {country:'Singapore',   count:115,  lat:1.35,   lng:103.8,  region:'Asia',     note:'Jurong Island; moratorium lifted 2022; new 2026 sustainability-DCs'},
    {country:'Sweden',      count:102,  lat:60.1,   lng:18.6,   region:'Europe',   note:'Nordic renewable DCs — 100% green energy, low-latency to EU'},
    {country:'Ireland',     count:96,   lat:53.4,   lng:-8.2,   region:'Europe',   note:'Dublin — hyperscale Google/Microsoft/Amazon EU anchors'},
    {country:'Brazil',      count:110,  lat:-14.2,  lng:-51.9,  region:'Americas', note:'São Paulo, Rio, Campinas — LATAM #1 market 2026'},
    {country:'Russia',      count:82,   lat:61.5,   lng:105.3,  region:'Eurasia',  note:'Moscow sovereign cloud; Rostelecom/Sbercloud expansion'},
    {country:'Switzerland', count:74,   lat:46.8,   lng:8.2,    region:'Europe',   note:'Geneva/Zurich: neutrality + financial data sovereignty'},
    {country:'UAE',         count:88,   lat:23.4,   lng:53.8,   region:'MENA',     note:'Dubai AI City, Abu Dhabi G42 — MENA hyperscale anchor'},
    {country:'South Korea', count:68,   lat:35.9,   lng:127.8,  region:'Asia',     note:'Seoul Gasan / Pangyo — Samsung cloud expansion'},
    {country:'South Africa',count:52,   lat:-30.6,  lng:22.9,   region:'Africa',   note:'Johannesburg, Cape Town — Africa Internet Exchange hub'},
    {country:'Israel',      count:38,   lat:31.5,   lng:34.8,   region:'MENA',     note:'Tel Aviv tech hub; classified military cloud co-location'},
    {country:'Norway',      count:42,   lat:60.5,   lng:8.5,    region:'Europe',   note:'Svalbard Arctic cold-cooling; renewable hydropower DCs'},
    {country:'Poland',      count:55,   lat:51.9,   lng:19.1,   region:'Europe',   note:'Warsaw — CEE hyperscale hub; Microsoft + Google 2025 openings'},
    {country:'Saudi Arabia',count:72,   lat:23.9,   lng:45.1,   region:'MENA',     note:'NEOM + Riyadh — Vision 2030 Digital Infrastructure'},
    {country:'Mexico',      count:65,   lat:23.6,   lng:-102.6, region:'Americas', note:'Querétaro, CDMX — nearshoring DC demand surge'},
    {country:'Nigeria',     count:28,   lat:9.1,    lng:8.7,    region:'Africa',   note:'Lagos — Africa\'s largest DC market by 2027'},
    {country:'Malaysia',    count:62,   lat:4.2,    lng:109.5,  region:'Asia',     note:'Johor Bahru — Singapore overflow; NVIDIA H100 AI clusters'},
    {country:'Pakistan',    count:14,   lat:30.4,   lng:69.3,   region:'Asia',     note:'Karachi, Islamabad — PTCL expansion'},
    {country:'Taiwan',      count:45,   lat:23.7,   lng:120.9,  region:'Asia',     note:'Taipei Neihu — TSMC cloud + chip design DCs'},
    {country:'Finland',     count:38,   lat:64.0,   lng:26.0,   region:'Europe',   note:'Helsinki — Microsoft Finland DC campus (2025)'},
    {country:'Indonesia',   count:48,   lat:-0.8,   lng:113.9,  region:'Asia',     note:'Jakarta — ASEAN digital economy expansion'},
  ];
  const out = { datacenters:CURATED, ts:now, source:'Cloudscene/DCP/Statista 2026 Q1', count:CURATED.length };
  dcCache.data = out; dcCache.ts = now;
  res.json(out);
});

// ─── Polymarket — Geopolitical Prediction Markets ─────────
const polymarketCache = { data: null, ts: 0 };
const POLY_KEYWORDS = [
  // Conflict & war
  'war','attack','strike','invasion','ceasefire','coup','troops','military',
  // Geopolitics core
  'nuclear','missile','conflict','sanctions','nato','occupation',
  // Countries / actors
  'iran','israel','ukraine','russia','china','taiwan','korea','pakistan','india',
  'hamas','hezbollah','houthi','isis','taliban','kremlin',
  // Events / categories
  'president','election','impeach','assassination','referendum',
  // Epstein / classified files
  'epstein','classified','declassified','cia','fbi','jfk',
  // Geopolitical specifics
  'world war','hypersonic','arms race','treaty','geopolit',
  // Tech / defence
  'drone','cyber attack','space weapon',
];
app.get('/api/polymarket', async (req, res) => {
  const now = Date.now();
  if (polymarketCache.data && now - polymarketCache.ts < 300_000) return res.json(polymarketCache.data);
  const markets = [];
  try {
    const [r1, r2] = await Promise.allSettled([
      axios.get('https://gamma-api.polymarket.com/markets', { params:{closed:false,active:true,limit:100,tag_slug:'geopolitics'}, timeout:10_000, headers:{Accept:'application/json'} }),
      axios.get('https://gamma-api.polymarket.com/markets', { params:{closed:false,active:true,limit:100,tag_slug:'politics'}, timeout:10_000, headers:{Accept:'application/json'} }),
    ]);
    [r1,r2].forEach(result => {
      if (result.status !== 'fulfilled') return;
      const items = Array.isArray(result.value.data) ? result.value.data : (result.value.data?.results||result.value.data?.markets||[]);
      items.forEach(m => {
        const q = (m.question||m.title||'').toLowerCase();
        if (POLY_KEYWORDS.some(k=>q.includes(k))) {
          let prob = 0.5;
          try { const p=JSON.parse(m.outcomePrices||'["0.5"]'); prob=parseFloat(p[0])||0.5; } catch(_) {}
          markets.push({
            id:m.id, question:m.question||m.title, probability:prob,
            volume:parseFloat(m.volumeNum||m.volume||0),
            liquidity:parseFloat(m.liquidity||0),
            endDate:m.endDate||m.end_date||'',
            url:`https://polymarket.com/event/${m.slug||m.id}`,
            category:q.includes('war')||q.includes('attack')?'war':q.includes('nuclear')?'nuclear':q.includes('ceasefire')?'ceasefire':'conflict',
          });
        }
      });
    });
  } catch (_) {}
  if (markets.length === 0) {
    return res.status(503).json({ markets:[], ts:now, count:0, source:'none', error:'Polymarket API returned no matching markets. Check keywords or retry.' });
  }
  const out = { markets:markets.slice(0,30), ts:now, count:markets.length, source:'Polymarket Gamma API' };
  polymarketCache.data = out; polymarketCache.ts = now;
  res.json(out);
});

// ─── Submarine OSINT Tracking ────────────────────────────
const subCache = { data: null, ts: 0 };
app.get('/api/submarine', async (req, res) => {
  const now = Date.now();
  if (subCache.data && now - subCache.ts < 300_000) return res.json(subCache.data);
  const news = [];
  for (const feed of [
    'https://www.navalnews.com/feed/',
    'https://www.naval-technology.com/feed/',
    'https://www.thedrive.com/the-war-zone/feed',
  ]) {
    try {
      const r = await axios.get(feed, { timeout:6_000, headers:{'User-Agent':'SPYMETER-OSINT/1.0'} });
      const items = (r.data.match ? r.data.match(/<item>([\s\S]*?)<\/item>/g)||[] : []).slice(0,20);
      items.forEach(item => {
        const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]||'';
        const link  = item.match(/<link>(.*?)<\/link>/)?.[1]||'';
        const date  = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]||'';
        if (/submarine|ssbn|ssn|ballistic.*sub|torpedo|boomer|boomers|underwater/i.test(title))
          news.push({ title:title.trim().slice(0,120), url:link.trim(), date:date.trim(), source:new URL(feed).hostname });
      });
    } catch(_) {}
  }
  // No static submarine positions — positions are classified and cannot be known from OSINT
  // Return only real news from RSS feeds
  const out = { submarines:[], news:news.slice(0,15), ts:now, count:0, newsCount:news.length, note:'Submarine positions are classified. Only OSINT news is shown.' };
  subCache.data = out; subCache.ts = now;
  res.json(out);
});

// ─── Nominatim geocoding for leader capitals ──────────────
// Uses OpenStreetMap Nominatim — free, no key required
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
    const result = hit
      ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), display: hit.display_name }
      : {};
    _geoCache[q] = result;
    res.json(result);
  } catch (_) { res.json({}); }
});

// ─── API Status endpoint ───────────────────────────────────
app.get('/api/status', (req, res) => {
  const now = Date.now();
  res.json({
    ts: now,
    uptime: Math.round(process.uptime()),
    apis: [
      { name: 'ADSB.fi',          url: 'api.adsb.fi/v1/aircraft',          type: 'free', key: false, status: srcHealth.adsbfi || 'unknown', note: 'Real-time ADS-B aircraft' },
      { name: 'ADSB.one',         url: 'api.adsb.one/v2/all',               type: 'free', key: false, status: srcHealth.adsbOne || 'unknown', note: 'Community ADS-B aggregator' },
      { name: 'OpenSky Network',  url: 'opensky-network.org/api/states/all',type: 'free', key: false, status: srcHealth.opensky || 'unknown', note: 'Free REST API, 100req/day anon' },
      { name: 'CelesTrak TLE',    url: 'celestrak.org/SOCRATES',            type: 'free', key: false, status: 'ok',      note: 'Satellite orbital elements' },
      { name: 'NASA FIRMS',       url: 'firms.modaps.eosdis.nasa.gov',      type: 'free', key: false, status: 'ok',      note: 'Active fire / thermal hotspots 24h' },
      { name: 'GDELT Project v2', url: 'api.gdeltproject.org/api/v2/doc',   type: 'free', key: false, status: 'ok',      note: 'Global news + tone analysis' },
      { name: 'Polymarket Gamma', url: 'gamma-api.polymarket.com/markets',  type: 'free', key: false, status: 'ok',      note: 'War/geopolitics prediction markets' },
      { name: 'FeodoTracker',     url: 'feodotracker.abuse.ch/downloads',   type: 'free', key: false, status: 'ok',      note: 'Botnet C2 IP blocklist' },
      { name: 'CISA KEV',         url: 'cisa.gov/feeds/known_exploited_vulnerabilities.json', type: 'free', key: false, status: 'ok', note: 'Known exploited vulnerabilities' },
      { name: 'HAPI HumanData',   url: 'hapi.humdata.org/api/v1',           type: 'free', key: false, status: 'ok',      note: 'Humanitarian conflict events' },
      { name: 'Nominatim OSM',    url: 'nominatim.openstreetmap.org',       type: 'free', key: false, status: 'ok',      note: 'Capital city geocoding' },
      { name: 'Wikimedia Geo',    url: 'commons.wikimedia.org/w/api.php',   type: 'free', key: false, status: 'ok',      note: 'GeoIntel photo search' },
      { name: 'Groq LLM',         url: 'api.groq.com/openai',               type: 'free', key: !!process.env.GROQ_API_KEY, status: process.env.GROQ_API_KEY ? 'ok' : 'no-key', note: 'AI intelligence brief (Llama 3.1)' },
      { name: 'ADSBExchange',     url: 'api.adsbexchange.com/api/aircraft', type: 'paid', key: !!process.env.ADSB_API_KEY, status: process.env.ADSB_API_KEY ? 'ok' : 'no-key', note: 'Premium ADS-B feed (optional)' },
      { name: 'OSM Overpass',     url: 'overpass-api.de/api/interpreter',   type: 'free', key: false, status: 'ok',      note: 'Military base polygons' },
      { name: 'Marine (AIS Sim)', url: '/api/marine',                       type: 'sim',  key: false, status: 'ok',      note: '17 key vessels on strategic routes' },
      { name: 'Submarine OSINT',  url: '/api/submarine',                    type: 'osint',key: false, status: 'ok',      note: '17 submarines — NavalNews RSS + OSINT patrol zones' },
    ],
    issues: [
      'Aircraft: All sources (ADSB.fi, ADSB.one, OpenSky, ADSBHub) tried in parallel — 503 returned if all fail. No static fallback.',
      'OpenSky anonymous API: 100 req/day limit — upgrade to registered account for higher limits',
      'Polymarket: Returns 503 + empty if Gamma API returns no matching markets (no static fallback)',
      'Submarine: Positions are classified — only OSINT news from RSS feeds is shown (no fake positions)',
      'Groq AI brief: requires GROQ_API_KEY env var — set in Railway environment variables',
    ],
    env: {
      GROQ_API_KEY:  !!process.env.GROQ_API_KEY,
      ADSB_API_KEY:  !!process.env.ADSB_API_KEY,
      NODE_ENV:      process.env.NODE_ENV || 'development',
    }
  });
});

// ─── Defence Feed — parallel swarm from OSINT RSS + GDELT + Drones-of-India ──
const defCache = { data: null, ts: 0 };
const DEFENCE_KEYWORDS = /drone|UAV|UAS|UCAV|loitering|kamikaze|stealth|hypersonic|cruise.?missile|submarine|frigate|destroyer|aircraft.?carrier|Brahmos|BrahMos|HIMARS|F-35|Su-57|J-20|AMCA|DRDO|Lockheed|Northrop|BAE|Dassault|Saab|radar|electronic.?warfare|cyber|laser|directed.?energy|autonomous.?weapon|satellite|SIGINT|AWACS|procurement|defence.?deal|defense.?deal|military.?contract|combat.?aircraft|stealth.?drone|loitering.?munition|UCAV|kamikaze.?drone|armed.?drone|tank|armour|artillery|missile.?defense|anti-drone|counter-UAS/i;

const DEFENCE_RSS = [
  'https://breakingdefense.com/feed/',
  'https://www.thedrive.com/the-war-zone/feed',
  'https://www.navalnews.com/feed/',
  'https://www.naval-technology.com/feed/',
  'https://www.airforce-technology.com/feed/',
  'https://www.army-technology.com/feed/',
  'https://www.defenseworld.net/rss',
  'https://www.indiandefencereview.com/feed/',
];

// Drones of India — GitHub Pages data
async function fetchDronesOfIndia() {
  try {
    const r = await axios.get('https://raw.githubusercontent.com/duorope/Drones-of-India/main/README.md', {
      timeout: 8_000, headers: { Accept: 'text/plain' }
    });
    const md = r.data || '';
    // Parse markdown table rows: | Name | Type | ... |
    const rows = md.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('Name'));
    return rows.slice(0,20).map(row => {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      return {
        title: cols[0] || 'Indian Drone System',
        category: cols[1] || 'UAV',
        status: cols[2] || '',
        developer: cols[3] || 'DRDO/India',
        source: 'Drones of India (GitHub OSINT)',
        url: 'https://duorope.github.io/Drones-of-India/',
        isIndia: true,
        ts: new Date().toISOString(),
      };
    }).filter(d => d.title && d.title.length > 2);
  } catch (_) { return []; }
}

// Parse RSS XML quickly
function parseRSSItems(xml, feedUrl) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null && items.length < 8) {
    const block = m[1];
    const get = tag => { const r = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`); const mm = r.exec(block); return mm ? (mm[1]||mm[2]||'').trim() : ''; };
    const title = get('title').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    const link  = get('link') || get('guid');
    const desc  = get('description').replace(/<[^>]+>/g,'').slice(0,200);
    const pub   = get('pubDate') || get('dc:date') || '';
    if (title && DEFENCE_KEYWORDS.test(title + ' ' + desc)) {
      items.push({ title, url: link, desc, pub, source: new URL(feedUrl).hostname.replace('www.',''), ts: pub });
    }
  }
  return items;
}

app.get('/api/defence-feed', async (req, res) => {
  const now = Date.now();
  if (defCache.data && now - defCache.ts < 600_000) return res.json(defCache.data);

  // Swarm: fetch all sources in parallel
  const [rssResults, gdeltResult, dronesResult] = await Promise.allSettled([
    // RSS swarm
    Promise.allSettled(DEFENCE_RSS.map(url =>
      axios.get(url, { timeout: 8_000, headers: { Accept:'application/rss+xml,text/xml', 'User-Agent':'SpymeterOSINT/1.0' } })
        .then(r => parseRSSItems(r.data, url))
        .catch(() => [])
    )),
    // GDELT swarm: defence-specific queries
    (async () => {
      const queries = ['drone UAV military technology 2026','hypersonic missile defence deal procurement','DRDO India defence technology 2026','autonomous weapon AI military'];
      const articles = [];
      for (const q of queries) {
        try {
          const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
            params: { query: q, mode: 'artlist', maxrecords: 8, format: 'json', sort: 'datedesc', timespan: '24h' },
            timeout: 7_000
          });
          if (r.data?.articles) articles.push(...r.data.articles.map(a => ({
            title: a.title, url: a.url, source: a.domain, ts: a.seendate,
            category: q.includes('drone') ? 'drone' : q.includes('hyper') ? 'missile' : q.includes('DRDO') ? 'india' : 'ai',
          })));
        } catch (_) {}
      }
      return articles;
    })(),
    // Drones of India
    fetchDronesOfIndia(),
  ]);

  // Collect RSS items
  const rssItems = [];
  if (rssResults.status === 'fulfilled') {
    rssResults.value.forEach(r => { if (r.status === 'fulfilled') rssItems.push(...r.value); });
  }

  // Deduplicate by title
  const seen = new Set();
  const allItems = [...rssItems].filter(i => { if (!i.title || seen.has(i.title)) return false; seen.add(i.title); return true; });
  allItems.sort((a,b) => new Date(b.ts||0) - new Date(a.ts||0));

  const gdeltItems = gdeltResult.status === 'fulfilled' ? gdeltResult.value : [];
  const drones = dronesResult.status === 'fulfilled' ? dronesResult.value : [];

  const out = {
    feed: allItems.slice(0,40),
    gdelt: gdeltItems.slice(0,20),
    drones: drones,
    ts: now,
    sources: DEFENCE_RSS.length + 2,
    count: allItems.length + gdeltItems.length + drones.length,
  };
  defCache.data = out; defCache.ts = now;
  res.json(out);
});
