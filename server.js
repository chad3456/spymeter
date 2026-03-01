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

// ─── Aircraft – OpenSky primary, ADSB.one fallback ───────
app.get('/api/aircraft', async (req, res) => {
  const now = Date.now();
  if (cache.aircraft.data && now - cache.aircraft.ts < AC_TTL)
    return res.json(cache.aircraft.data);

  // Try OpenSky first (real ADS-B, best coverage)
  try {
    const resp = await axios.get('https://opensky-network.org/api/states/all', {
      timeout: 12_000, headers: { Accept: 'application/json' }
    });
    if (resp.data?.states?.length) {
      cache.aircraft = { data: resp.data, ts: now };
      return res.json(resp.data);
    }
  } catch (_) {}

  // Fallback: ADSB.one (military-inclusive, no auth required)
  try {
    const resp2 = await axios.get('https://api.adsb.one/v2/all', {
      timeout: 15_000, headers: { Accept: 'application/json' }
    });
    const states = (resp2.data?.ac || [])
      .filter(ac => ac.lat != null && ac.lon != null)
      .map(normalizeADSBOne);
    const result = { states, ts: now, source: 'ADSB.one' };
    cache.aircraft = { data: result, ts: now };
    return res.json(result);
  } catch (err2) {
    if (cache.aircraft.data) return res.json(cache.aircraft.data);
    res.status(503).json({ error: 'Aircraft feed unavailable', detail: err2.message });
  }
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
    'Iran Israel attack strike missile',
    'Gaza IDF Hamas Hezbollah',
    'Iran nuclear IAEA',
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
