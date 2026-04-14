'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// feedchannel/route.js
// India Defence-Tech Twitter Feed — via Nitter RSS (no API key required)
// Tracks: missiles, drones, UAVs, DRDO, BrahMos, IAF, Navy, Army, space tech
// Mount in server.js:  app.use('/api/feedchannel', require('./feedchannel/route'))
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const axios   = require('axios');
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

// ─── India Defence-Tech Twitter Profiles ─────────────────────────────────────
// Add/replace handles here once you share your Excel file.
// Format: { handle, label, desc, category }
const INDIA_DEFENCE_PROFILES = [
  // ── Official ──────────────────────────────────────────────────────────────
  { handle: 'DefenceMinIndia',  label: 'Ministry of Defence',        desc: 'Official MoD India',                    category: 'official' },
  { handle: 'adgpi',            label: 'Indian Army',                desc: 'ADGPI — Indian Army official',          category: 'official' },
  { handle: 'IAF_MCC',          label: 'Indian Air Force',           desc: 'IAF official channel',                  category: 'official' },
  { handle: 'indiannavy',       label: 'Indian Navy',                desc: 'Indian Navy official',                  category: 'official' },
  { handle: 'DRDO_India',       label: 'DRDO',                       desc: 'Defence R&D Organisation',              category: 'official' },
  { handle: 'SpokespersonMoD',  label: 'MoD Spokesperson',          desc: 'Ministry of Defence Spokesperson',      category: 'official' },
  { handle: 'HAL_India',        label: 'HAL',                        desc: 'Hindustan Aeronautics Limited',         category: 'official' },
  { handle: 'BrahMosMissile',   label: 'BrahMos Aerospace',         desc: 'BrahMos cruise missile program',        category: 'official' },
  { handle: 'isro',             label: 'ISRO',                       desc: 'Indian Space Research Organisation',    category: 'official' },
  { handle: 'IDS_India',        label: 'Integrated Defence Staff',   desc: 'IDS — tri-service coordination',        category: 'official' },

  // ── Defence Journalists / Analysts ────────────────────────────────────────
  { handle: 'Ajai_Shukla',      label: 'Ajai Shukla',               desc: 'Defence journalist — Business Standard',category: 'journalist' },
  { handle: 'livefist',         label: 'Shiv Aroor / Livefist',     desc: 'Defence news & analysis',               category: 'journalist' },
  { handle: 'SushantSin',       label: 'Sushant Singh',             desc: 'Senior Fellow, CPR — defence policy',   category: 'journalist' },
  { handle: 'nitin_a_gokhale',  label: 'Nitin A. Gokhale',          desc: 'BharatShakti — strategic affairs',      category: 'journalist' },
  { handle: 'Abhijit_Iyer_M',   label: 'Abhijit Iyer-Mitra',        desc: 'Defence & security analyst',            category: 'analyst'   },
  { handle: 'PravinSawhney',    label: 'Pravin Sawhney',            desc: 'FORCE Magazine — defence analyst',      category: 'analyst'   },
  { handle: 'tphutnagar',       label: 'TP Sreenivasan',            desc: 'Strategic & defence affairs',           category: 'analyst'   },
  { handle: 'manjeetkripalani', label: 'Manjeet Kripalani',         desc: 'India Council, strategic affairs',      category: 'analyst'   },
  { handle: 'RSharma30',        label: 'Ravi Sharma',               desc: 'Aviation & defence reporter',           category: 'journalist' },
  { handle: 'defenceaviation',  label: 'Defence Aviation',          desc: 'India defence aviation news',           category: 'journalist' },

  // ── Defence Tech / Startups / OSINT ───────────────────────────────────────
  { handle: 'ideaforgetech',    label: 'ideaForge Technology',      desc: 'India\'s leading drone maker',          category: 'industry'  },
  { handle: 'SkyruteMobility',  label: 'Skyrut',                    desc: 'Defence drone startup',                 category: 'industry'  },
  { handle: 'agnikul',          label: 'Agnikul Cosmos',            desc: 'Space-tech / rocket startup',           category: 'industry'  },
  { handle: 'NewSpaceIndia',    label: 'NewSpace India Ltd',        desc: 'ISRO commercial arm',                   category: 'industry'  },
  { handle: 'Garuda_Aerospace', label: 'Garuda Aerospace',          desc: 'Drone manufacturer — MQ series',        category: 'industry'  },
  { handle: 'IiT_Kanpur_IITK', label: 'IIT Kanpur',               desc: 'Aerospace & defence research',          category: 'research'  },
  { handle: 'DRDL_Hyd',         label: 'DRDL Hyderabad',           desc: 'DRDO Missile lab — Agni, Akash',        category: 'official'  },
  { handle: 'ADE_DRDO',         label: 'ADE DRDO',                  desc: 'Aeronautical Dev. Establishment',       category: 'official'  },
];

// ─── Defence keyword filter ───────────────────────────────────────────────────
// Only posts matching at least one keyword are kept in the filtered feed.
const DEFENCE_KEYWORDS = [
  'missile', 'missiles', 'drone', 'drones', 'uav', 'uas', 'ucav',
  'drdo', 'brahmos', 'akash', 'agni', 'prithvi', 'nirbhay', 'astra',
  'tejas', 'lca', 'hal', 'isro', 'hypersonic',
  'air defence', 'air defense', 'radar', 'sonar',
  'fighter', 'helicopter', 'warship', 'frigate', 'submarine', 'destroyer',
  'nuclear', 'ballistic', 'cruise', 'interceptor', 'sam', 'aam', 'bvr',
  'iaf', 'indian air force', 'indian navy', 'indian army',
  'defence', 'defense', 'military', 'weapon', 'warfare',
  'pakistan', 'china border', 'lac', 'loc', 'surgical strike',
];

function _matchesDefence(text) {
  const lower = text.toLowerCase();
  return DEFENCE_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── RSS parser (same approach as iran-trackers in server.js) ────────────────
function _parseNitterRSS(xml, handle) {
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = regex.exec(xml)) !== null && items.length < 5) {
    const chunk    = m[1];
    const rawTitle = chunk.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
                   || chunk.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
    const link     = chunk.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
    const pubDate  = chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
    const text = rawTitle
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .trim();
    if (text && text.length > 5 && !text.startsWith('RT by')) {
      items.push({ text, link: link.trim(), date: pubDate.trim(), handle });
    }
  }
  return items;
}

// ─── Fetch a single Nitter feed, rotate through instances on failure ──────────
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
// Returns:
//   profiles[]  — each account with its fetched posts + availability flag
//   feed[]      — unified timeline, sorted newest-first, defence-keyword filtered
//   all_feed[]  — unified timeline without keyword filter (raw)
//   count       — total posts in filtered feed
//   sources[]   — handles that returned data
//   ts          — cache timestamp
router.get('/india-defence', async (req, res) => {
  const now = Date.now();
  if (_cache.data && now - _cache.ts < TTL) return res.json(_cache.data);

  console.log('[FeedChannel] Fetching India defence-tech feeds...');

  const settled = await Promise.allSettled(
    INDIA_DEFENCE_PROFILES.map(p =>
      _fetchNitterFeed(p.handle).then(posts => ({ ...p, posts }))
    )
  );

  const profiles = settled.map((r, i) => ({
    ...INDIA_DEFENCE_PROFILES[i],
    posts:     r.status === 'fulfilled' ? r.value.posts : [],
    available: r.status === 'fulfilled' && r.value.posts.length > 0,
  }));

  const allPosts = profiles
    .flatMap(p => p.posts.map(post => ({
      ...post,
      account_label:    p.label,
      account_desc:     p.desc,
      account_category: p.category,
    })))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredFeed = allPosts.filter(p => _matchesDefence(p.text));

  const result = {
    profiles,
    feed:     filteredFeed.slice(0, 80),
    all_feed: allPosts.slice(0, 80),
    count:    filteredFeed.length,
    sources:  profiles.filter(p => p.available).map(p => `@${p.handle}`),
    note:     'Via Nitter RSS — no API key required. Keyword-filtered for India defence tech.',
    ts:       now,
  };

  _cache.data = result;
  _cache.ts   = now;

  console.log(`[FeedChannel] Done — ${profiles.filter(p=>p.available).length}/${profiles.length} accounts live, ${filteredFeed.length} defence posts`);
  res.json(result);
});

// ─── GET /api/feedchannel/india-defence/profiles ─────────────────────────────
// Returns just the list of tracked profiles (no fetch)
router.get('/india-defence/profiles', (_req, res) => {
  res.json({
    profiles: INDIA_DEFENCE_PROFILES,
    total:    INDIA_DEFENCE_PROFILES.length,
    categories: [...new Set(INDIA_DEFENCE_PROFILES.map(p => p.category))],
  });
});

// ─── GET /api/feedchannel/india-defence/flush ─────────────────────────────────
// Force-clear the cache so next request re-fetches live data
router.get('/india-defence/flush', (_req, res) => {
  _cache.data = null;
  _cache.ts   = 0;
  res.json({ ok: true, message: 'Cache cleared — next request will re-fetch.' });
});

module.exports = router;
