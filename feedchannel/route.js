'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// feedchannel/route.js
// India Defence-Tech Twitter Feed — via Nitter RSS (no API key required)
// Accounts loaded from: feedchannel/india_defence_accounts.xlsx
// Falls back to built-in list if the file is missing.
// Mount in server.js:  app.use('/api/feedchannel', require('./feedchannel/route'))
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const axios   = require('axios');
const XLSX    = require('xlsx');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();

// ─── Cache ───────────────────────────────────────────────────────────────────
const _cache = { data: null, ts: 0 };
const TTL    = 10 * 60_000; // 10 min

// ─── Nitter instances (rotating fallback — community-run, no auth) ───────────
const NITTER_HOSTS = [
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
  'https://nitter.net',
  'https://lightbrd.com',
  'https://nitter.unixfox.eu',
];

// ─── Built-in fallback list (used when Excel is absent) ──────────────────────
const FALLBACK_PROFILES = [
  { handle:'DefenceMinIndia', label:'Ministry of Defence',       category:'official',  focus_area:'Policy',          region:'India' },
  { handle:'adgpi',           label:'Indian Army',               category:'official',  focus_area:'Land warfare',    region:'India' },
  { handle:'IAF_MCC',         label:'Indian Air Force',          category:'official',  focus_area:'Air power',       region:'India' },
  { handle:'indiannavy',      label:'Indian Navy',               category:'official',  focus_area:'Naval warfare',   region:'India' },
  { handle:'DRDO_India',      label:'DRDO',                      category:'official',  focus_area:'R&D',             region:'India' },
  { handle:'HAL_India',       label:'HAL',                       category:'official',  focus_area:'Aviation',        region:'India' },
  { handle:'BrahMosMissile',  label:'BrahMos Aerospace',         category:'official',  focus_area:'Missiles',        region:'India' },
  { handle:'DRDL_Hyd',        label:'DRDL Hyderabad',            category:'official',  focus_area:'Missiles',        region:'India' },
  { handle:'isro',            label:'ISRO',                      category:'official',  focus_area:'Space',           region:'India' },
  { handle:'Ajai_Shukla',     label:'Ajai Shukla',               category:'journalist',focus_area:'Defence policy',  region:'India' },
  { handle:'livefist',        label:'Shiv Aroor / Livefist',     category:'journalist',focus_area:'Defence news',    region:'India' },
  { handle:'SushantSin',      label:'Sushant Singh',             category:'journalist',focus_area:'Defence policy',  region:'India' },
  { handle:'nitin_a_gokhale', label:'Nitin A. Gokhale',          category:'journalist',focus_area:'Strategic affairs',region:'India' },
  { handle:'Abhijit_Iyer_M',  label:'Abhijit Iyer-Mitra',        category:'analyst',   focus_area:'Defence analysis',region:'India' },
  { handle:'PravinSawhney',   label:'Pravin Sawhney',            category:'analyst',   focus_area:'Military affairs', region:'India' },
  { handle:'ideaforgetech',   label:'ideaForge Technology',      category:'industry',  focus_area:'Drones / UAV',    region:'India' },
  { handle:'Garuda_Aerospace',label:'Garuda Aerospace',          category:'industry',  focus_area:'Drones',          region:'India' },
  { handle:'agnikul',         label:'Agnikul Cosmos',            category:'industry',  focus_area:'Space / Rockets', region:'India' },
];

// ─── Load accounts from Excel (hot-reload capable) ───────────────────────────
const EXCEL_PATH = path.join(__dirname, 'india_defence_accounts.xlsx');

function loadProfiles() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.log('[FeedChannel] india_defence_accounts.xlsx not found — using built-in list');
    return FALLBACK_PROFILES;
  }
  try {
    const wb   = XLSX.readFile(EXCEL_PATH);
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const profiles = rows
      .map(r => ({
        handle:      String(r.handle || '').replace(/^@/, '').trim(),
        label:       String(r.name   || r.handle || '').trim(),
        category:    String(r.category   || 'other').trim().toLowerCase(),
        focus_area:  String(r.focus_area || '').trim(),
        region:      String(r.region     || 'India').trim(),
        notes:       String(r.notes      || '').trim(),
        profile_url: String(r.profile_url|| '').trim(),
      }))
      .filter(p => p.handle.length > 0);

    console.log(`[FeedChannel] Loaded ${profiles.length} accounts from Excel`);
    return profiles;
  } catch (e) {
    console.error('[FeedChannel] Failed to parse Excel:', e.message);
    return FALLBACK_PROFILES;
  }
}

let PROFILES = loadProfiles();

// ─── Defence keyword filter ───────────────────────────────────────────────────
const DEFENCE_KEYWORDS = [
  'missile', 'missiles', 'drone', 'drones', 'uav', 'uas', 'ucav', 'suas',
  'drdo', 'brahmos', 'akash', 'agni', 'prithvi', 'nirbhay', 'astra', 'nag',
  'tejas', 'lca', 'hal', 'isro', 'hypersonic', 'supersonic',
  'air defence', 'air defense', 'radar', 'sonar', 'ew', 'electronic warfare',
  'fighter', 'helicopter', 'warship', 'frigate', 'submarine', 'destroyer', 'corvette',
  'nuclear', 'ballistic', 'cruise', 'interceptor', 'sam ', 'aam ', 'bvr',
  'iaf', 'indian air force', 'indian navy', 'indian army',
  'defence', 'defense', 'military', 'weapon', 'warfare', 'combat',
  'pakistan', 'china border', 'lac ', 'loc ', 'surgical strike',
  'procurement', 'induction', 'commissioning', 'make in india',
  'atma nirbhar', 'mq-9', 'predator', 'apache', 'chinook',
];

function _matchesDefence(text) {
  const lower = text.toLowerCase();
  return DEFENCE_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── RSS parser ───────────────────────────────────────────────────────────────
function _parseNitterRSS(xml, handle) {
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = regex.exec(xml)) !== null && items.length < 6) {
    const chunk    = m[1];
    const rawTitle = chunk.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
                   || chunk.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
    const link     = chunk.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
    const pubDate  = chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
    const text = rawTitle
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .trim();
    if (text && text.length > 5 && !text.startsWith('RT by')) {
      items.push({ text, link: link.trim(), date: pubDate.trim(), handle });
    }
  }
  return items;
}

// ─── Fetch a single Nitter feed with host rotation ────────────────────────────
async function _fetchNitterFeed(handle) {
  for (const host of NITTER_HOSTS) {
    try {
      const r = await axios.get(`${host}/${handle}/rss`, {
        timeout: 6_000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SpymeterOSINT/1.0)',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });
      if (typeof r.data === 'string' && r.data.includes('<item>')) {
        return _parseNitterRSS(r.data, handle);
      }
    } catch (_) {}
  }
  return [];
}

// ─── GET /api/feedchannel/india-defence ──────────────────────────────────────
router.get('/india-defence', async (req, res) => {
  const now = Date.now();
  if (_cache.data && now - _cache.ts < TTL) return res.json(_cache.data);

  console.log(`[FeedChannel] Fetching ${PROFILES.length} India defence-tech feeds…`);

  const settled = await Promise.allSettled(
    PROFILES.map(p =>
      _fetchNitterFeed(p.handle).then(posts => ({ ...p, posts }))
    )
  );

  const profiles = settled.map((r, i) => ({
    ...PROFILES[i],
    posts:     r.status === 'fulfilled' ? r.value.posts : [],
    available: r.status === 'fulfilled' && r.value.posts.length > 0,
  }));

  const allPosts = profiles
    .flatMap(p => p.posts.map(post => ({
      ...post,
      account_label:    p.label,
      account_category: p.category,
      account_focus:    p.focus_area,
      account_region:   p.region,
    })))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredFeed = allPosts.filter(p => _matchesDefence(p.text));

  const categories = [...new Set(PROFILES.map(p => p.category))].sort();

  const result = {
    profiles,
    feed:       filteredFeed,
    all_feed:   allPosts,
    total:      filteredFeed.length,
    total_all:  allPosts.length,
    live:       profiles.filter(p => p.available).length,
    sources:    profiles.filter(p => p.available).map(p => `@${p.handle}`),
    categories,
    note:       'Via Nitter RSS — no API key required. Keyword-filtered for India defence tech.',
    excel_loaded: fs.existsSync(EXCEL_PATH),
    ts:         now,
  };

  _cache.data = result;
  _cache.ts   = now;

  console.log(`[FeedChannel] Done — ${result.live}/${profiles.length} accounts live, ${filteredFeed.length} defence posts`);
  res.json(result);
});

// ─── GET /api/feedchannel/india-defence/accounts ─────────────────────────────
router.get('/india-defence/accounts', (_req, res) => {
  res.json({
    accounts:   PROFILES,
    total:      PROFILES.length,
    categories: [...new Set(PROFILES.map(p => p.category))].sort(),
    excel_loaded: fs.existsSync(EXCEL_PATH),
  });
});

// ─── GET /api/feedchannel/india-defence/flush ─────────────────────────────────
router.get('/india-defence/flush', (_req, res) => {
  _cache.data = null;
  _cache.ts   = 0;
  PROFILES    = loadProfiles(); // hot-reload Excel
  res.json({ ok: true, message: 'Cache cleared + accounts reloaded from Excel.' });
});

module.exports = router;
