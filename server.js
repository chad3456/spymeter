const express = require('express');
const axios = require('axios');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory cache ────────────────────────────────────────────────────────
const cache = {
  aircraft:   { data: null, ts: 0 },
  satellites: {},
  news:       { data: null, ts: 0 },
};
const AC_TTL   = 15_000;    // 15 s
const SAT_TTL  = 300_000;   // 5 min
const NEWS_TTL = 300_000;   // 5 min

// ─── Aircraft – OpenSky Network ─────────────────────────────────────────────
app.get('/api/aircraft', async (req, res) => {
  const now = Date.now();
  if (cache.aircraft.data && now - cache.aircraft.ts < AC_TTL) {
    return res.json(cache.aircraft.data);
  }
  try {
    const resp = await axios.get('https://opensky-network.org/api/states/all', {
      timeout: 15_000,
      headers: { Accept: 'application/json' }
    });
    cache.aircraft = { data: resp.data, ts: now };
    res.json(resp.data);
  } catch (err) {
    if (cache.aircraft.data) return res.json(cache.aircraft.data);
    res.status(503).json({ error: 'Aircraft feed unavailable', detail: err.message });
  }
});

// ─── Satellites – CelesTrak TLE ─────────────────────────────────────────────
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
    if (cache.satellites[type]) {
      res.set('Content-Type', 'text/plain');
      return res.send(cache.satellites[type].data);
    }
    res.status(503).json({ error: 'Satellite feed unavailable' });
  }
});

// ─── Military zones – OpenStreetMap Overpass ────────────────────────────────
app.get('/api/military-osm', async (req, res) => {
  const { south = -90, west = -180, north = 90, east = 180 } = req.query;
  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:25];(way["landuse"="military"](${bbox});relation["landuse"="military"](${bbox}););out center tags;`;
  try {
    const resp = await axios.post(
      'https://overpass-api.de/api/interpreter',
      `data=${encodeURIComponent(query)}`,
      { timeout: 30_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json(resp.data);
  } catch (err) {
    res.status(503).json({ error: 'OSM military data unavailable' });
  }
});

// ─── FIRMS fire data (NASA public) ──────────────────────────────────────────
app.get('/api/fires', async (req, res) => {
  try {
    const resp = await axios.get(
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
      { timeout: 20_000, responseType: 'text' }
    );
    res.set('Content-Type', 'text/csv');
    res.send(resp.data);
  } catch (err) {
    res.status(503).json({ error: 'Fire data unavailable' });
  }
});

// ─── News feed – GDELT API proxy ─────────────────────────────────────────────
app.get('/api/news', async (req, res) => {
  const now = Date.now();
  if (cache.news.data && now - cache.news.ts < NEWS_TTL) {
    return res.json(cache.news.data);
  }

  const queries = [
    'war military conflict strike',
    'geopolitical crisis sanctions',
    'earthquake disaster flood tsunami'
  ];

  const allArticles = [];

  try {
    for (const q of queries) {
      try {
        const resp = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: {
            query:      q,
            mode:       'artlist',
            maxrecords: 10,
            format:     'json',
            sort:       'datedesc',
            timespan:   '24h'
          },
          timeout: 8_000
        });
        if (resp.data && Array.isArray(resp.data.articles)) {
          allArticles.push(...resp.data.articles.map(a => ({
            title:  a.title || '',
            url:    a.url || '',
            source: a.domain || '',
            date:   a.seendate || '',
            lang:   a.language || 'English',
            country: a.sourcecountry || '',
            tone:   a.tone ? parseFloat(a.tone).toFixed(1) : '0'
          })));
        }
      } catch (_) { /* skip failed query */ }
    }

    // Deduplicate by URL
    const seen = new Set();
    const unique = allArticles.filter(a => {
      if (!a.title || seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    // Sort newest first (GDELT date format: 20240101T120000Z)
    unique.sort((a, b) => b.date.localeCompare(a.date));

    const result = { articles: unique.slice(0, 25), ts: now };
    cache.news = { data: result, ts: now };
    res.json(result);

  } catch (err) {
    if (cache.news.data) return res.json(cache.news.data);
    // Fallback: curated static headlines if GDELT unreachable
    res.json({
      articles: [
        { title: 'Live news feed loading…', url: '#', source: 'OSINT', date: '', tone: '0' }
      ],
      ts: now,
      error: 'GDELT unavailable'
    });
  }
});

// ─── WebSocket broadcast ─────────────────────────────────────────────────────
const clients = new Set();
wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(type, data) {
  if (!clients.size) return;
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(msg));
}

// Push aircraft updates to all WS clients every 15 s
setInterval(async () => {
  if (!clients.size) return;
  try {
    const now = Date.now();
    if (cache.aircraft.data && now - cache.aircraft.ts < AC_TTL) {
      broadcast('aircraft', cache.aircraft.data);
      return;
    }
    const resp = await axios.get(`http://127.0.0.1:${PORT}/api/aircraft`);
    broadcast('aircraft', resp.data);
  } catch (_) {}
}, 15_000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌍 OSINT Tracker — http://localhost:${PORT}\n`);
});
