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
const NEWS_TTL    = 180_000;   // 3 min
const REGION_TTL  = 15_000;

// ─── Aircraft – OpenSky Network (real ADS-B, 15s delay) ──
app.get('/api/aircraft', async (req, res) => {
  const now = Date.now();
  if (cache.aircraft.data && now - cache.aircraft.ts < AC_TTL)
    return res.json(cache.aircraft.data);
  try {
    const resp = await axios.get('https://opensky-network.org/api/states/all', {
      timeout: 15_000, headers: { Accept: 'application/json' }
    });
    cache.aircraft = { data: resp.data, ts: now };
    res.json(resp.data);
  } catch (err) {
    if (cache.aircraft.data) return res.json(cache.aircraft.data);
    res.status(503).json({ error: 'Aircraft feed unavailable', detail: err.message });
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

// ─── RSS Live News (BBC, France24, DW, Guardian) ─────────
const rssCache = { data: null, ts: 0 };
const RSS_TTL  = 60_000; // 1 min cache

const RSS_FEEDS = [
  { name: 'BBC World',   url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Reuters',     url: 'https://feeds.reuters.com/reuters/topNews' },
  { name: 'France24',    url: 'https://www.france24.com/en/rss' },
  { name: 'DW',          url: 'https://rss.dw.com/rdf/rss-en-all' },
  { name: 'Guardian',    url: 'https://www.theguardian.com/world/rss' },
  { name: 'Al Jazeera',  url: 'https://www.aljazeera.com/xml/rss/all.xml' },
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
