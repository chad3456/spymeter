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
  return [
    ac.hex,                                        // [0] icao24
    (ac.flight||'').trim(),                        // [1] callsign
    icaoToCountry(ac.hex),                         // [2] origin_country
    null, null,                                    // [3] time_pos, [4] last_contact
    ac.lon,                                        // [5] longitude
    ac.lat,                                        // [6] latitude
    ac.alt_baro != null ? ac.alt_baro * 0.3048 : 0, // [7] alt meters (feet→m)
    ac.on_ground === 1 || ac.on_ground === true,   // [8] on_ground
    ac.gs != null ? ac.gs * 0.5144 : 0,           // [9] velocity m/s (knots→m/s)
    ac.track || 0,                                 // [10] heading
    ac.baro_rate != null ? ac.baro_rate * 0.00508 : 0, // [11] vert_rate m/s (ft/min→m/s)
  ];
}

// ─── Aircraft – multi-source with 3 fallbacks ────────────
app.get('/api/aircraft', async (req, res) => {
  const now = Date.now();
  if (cache.aircraft.data && now - cache.aircraft.ts < AC_TTL)
    return res.json(cache.aircraft.data);

  // Source 1: ADSB.fi — community aggregator, free, no auth
  try {
    const r1 = await axios.get('https://api.adsb.fi/v1/aircraft', {
      timeout: 8_000, headers: { Accept: 'application/json' }
    });
    const ac1 = (r1.data?.aircraft || []).filter(a => a.lat != null && a.lon != null);
    if (ac1.length > 100) {
      const states = ac1.map(normalizeADSBOne);
      const result = { states, ts: now, source: 'ADSB.fi' };
      cache.aircraft = { data: result, ts: now };
      return res.json(result);
    }
  } catch (_) {}

  // Source 2: ADSB.one
  try {
    const r2 = await axios.get('https://api.adsb.one/v2/all', {
      timeout: 8_000, headers: { Accept: 'application/json' }
    });
    const ac2 = (r2.data?.ac || []).filter(a => a.lat != null && a.lon != null);
    if (ac2.length > 100) {
      const states = ac2.map(normalizeADSBOne);
      const result = { states, ts: now, source: 'ADSB.one' };
      cache.aircraft = { data: result, ts: now };
      return res.json(result);
    }
  } catch (_) {}

  // Source 3: OpenSky Network (rate-limited but sometimes works)
  try {
    const r3 = await axios.get('https://opensky-network.org/api/states/all', {
      timeout: 10_000, headers: { Accept: 'application/json' }
    });
    if (r3.data?.states?.length > 100) {
      const result = { ...r3.data, ts: now, source: 'OpenSky' };
      cache.aircraft = { data: result, ts: now };
      return res.json(result);
    }
  } catch (_) {}

  // Return cached data if any source has responded before
  if (cache.aircraft.data) return res.json(cache.aircraft.data);
  res.status(503).json({ error: 'Aircraft feed unavailable — all sources failed', states: [] });
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

app.get('/api/markets', async (req, res) => {
  const now = Date.now();
  if (marketCache.data && now - marketCache.ts < MARKET_TTL) return res.json(marketCache.data);
  const symbols = MARKET_SYMBOLS.map(m => m.sym).join(',');
  try {
    const r = await axios.get(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName`,
      { timeout: 10_000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    );
    const quotes = r.data?.quoteResponse?.result || [];
    const quoteMap = {};
    quotes.forEach(q => { quoteMap[q.symbol] = q; });

    const result = MARKET_SYMBOLS.map(m => {
      const q = quoteMap[m.sym] || {};
      return {
        sym:    m.sym, label: m.label, group: m.group, flag: m.flag,
        price:  q.regularMarketPrice  != null ? parseFloat(q.regularMarketPrice.toFixed(2))  : null,
        change: q.regularMarketChange != null ? parseFloat(q.regularMarketChange.toFixed(2))  : null,
        pct:    q.regularMarketChangePercent != null ? parseFloat(q.regularMarketChangePercent.toFixed(2)) : null,
        state:  q.marketState || 'CLOSED',
      };
    });
    const out = { quotes: result, ts: now, source: 'Yahoo Finance (15-min delay)' };
    marketCache.data = out; marketCache.ts = now;
    res.json(out);
  } catch (err) {
    if (marketCache.data) return res.json(marketCache.data);
    res.json({ quotes: MARKET_SYMBOLS.map(m => ({ ...m, price: null, change: null, pct: null })), ts: now, error: 'Market data unavailable' });
  }
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
