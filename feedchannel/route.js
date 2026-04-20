'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// feedchannel/route.js — India Defence Twitter Feed
//
// Method: Twitter Guest Token + GraphQL API
//   - Uses the same bearer token Twitter's own web app embeds in its JS bundle
//   - Activates a short-lived guest token (no login needed)
//   - Fetches tweets via Twitter's internal GraphQL endpoints
//   - Caches user IDs to minimise API calls
//   - Batches 8 accounts at a time, 600 ms between batches
//   - Results cached 30 minutes
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const axios   = require('axios');
const https   = require('https');
const XLSX    = require('xlsx');
const path    = require('path');
const fs      = require('fs');
const NLP     = require('./nlp');
const router  = express.Router();

// Prevent EventEmitter warning for concurrent HTTPS connections
https.globalAgent.setMaxListeners(100);

// ─── Twitter public bearer (embedded in Twitter's web JS bundle) ──────────────
const TWT_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs' +
  '%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// GraphQL query IDs — Twitter rotates these; we try each in sequence
const QID_USER   = ['G3KGOASz96M-Qu0nwmGXNg', 'qW5u-DAuXpMEG0zA1F7UGQ', 'BQ6xjFU6Gm-e9QyfEEAg4Q'];
const QID_TWEETS = ['E3opETHuRM3RaEkZSB_bkA',  'V1ze5q3ijDS1VeLwLY0m7g', '_j1a2bJAbW9rdxNkBMoWYA'];

const GQL_FEATURES_USER = JSON.stringify({
  hidden_profile_likes_enabled: false,
  hidden_profile_subscriptions_enabled: false,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
});

const GQL_FEATURES_TWEETS = JSON.stringify({
  rweb_lists_timeline_redesign_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_the_sky_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_enhance_cards_enabled: false,
});

// ─── Shared HTTP headers ──────────────────────────────────────────────────────
function _headers(guestToken) {
  const h = {
    'Authorization':             `Bearer ${TWT_BEARER}`,
    'User-Agent':                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept':                    '*/*',
    'Accept-Language':           'en-US,en;q=0.9',
    'Referer':                   'https://twitter.com/',
    'Origin':                    'https://twitter.com',
    'x-twitter-active-user':     'yes',
    'x-twitter-client-language': 'en',
  };
  if (guestToken) h['x-guest-token'] = guestToken;
  return h;
}

// ─── Guest token (3-hour cache) ───────────────────────────────────────────────
let _guestToken   = null;
let _guestTokenTs = 0;
const GUEST_TTL   = 3 * 60 * 60_000;

async function _getGuestToken(force = false) {
  if (!force && _guestToken && Date.now() - _guestTokenTs < GUEST_TTL) return _guestToken;
  const r = await axios.post(
    'https://api.twitter.com/1.1/guest/activate.json', null,
    { headers: _headers(null), timeout: 10_000 }
  );
  _guestToken   = r.data.guest_token;
  _guestTokenTs = Date.now();
  console.log('[FeedChannel] Guest token OK:', _guestToken.slice(0, 8) + '…');
  return _guestToken;
}

// ─── User ID cache (per session, avoids repeat lookups) ──────────────────────
const _uidCache = new Map();

async function _getUserId(handle) {
  if (_uidCache.has(handle)) return _uidCache.get(handle);

  const gt   = await _getGuestToken();
  const vars = JSON.stringify({ screen_name: handle, withSafetyModeUserFields: true });

  for (const qid of QID_USER) {
    try {
      const r = await axios.get(
        `https://twitter.com/i/api/graphql/${qid}/UserByScreenName`,
        { params: { variables: vars, features: GQL_FEATURES_USER },
          headers: _headers(gt), timeout: 10_000 }
      );
      const uid = r.data?.data?.user?.result?.rest_id;
      if (uid) { _uidCache.set(handle, uid); return uid; }
    } catch (_) {}
  }
  return null;
}

// ─── Fetch tweets for a single handle ────────────────────────────────────────
async function _fetchTweets(handle, count = 8) {
  try {
    const gt  = await _getGuestToken();
    const uid = await _getUserId(handle);
    if (!uid) return [];

    const vars = JSON.stringify({
      userId:                               uid,
      count,
      includePromotedContent:               false,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice:                            true,
      withV2Timeline:                       true,
    });

    for (const qid of QID_TWEETS) {
      try {
        const r = await axios.get(
          `https://twitter.com/i/api/graphql/${qid}/UserTweets`,
          { params: { variables: vars, features: GQL_FEATURES_TWEETS },
            headers: _headers(gt), timeout: 12_000 }
        );

        const entries =
          r.data?.data?.user?.result?.timeline_v2?.timeline?.instructions
            ?.find(i => i.type === 'TimelineAddEntries')
            ?.entries ?? [];

        const tweets = [];
        for (const entry of entries) {
          const tw =
            entry?.content?.itemContent?.tweet_results?.result?.tweet ??
            entry?.content?.itemContent?.tweet_results?.result;
          if (!tw) continue;
          const legacy = tw.legacy ?? tw;
          if (!legacy?.full_text || legacy?.retweeted_status_id_str) continue;
          tweets.push({
            id:       tw.rest_id || legacy.id_str,
            text:     legacy.full_text || '',
            date:     legacy.created_at || '',
            link:     `https://twitter.com/${handle}/status/${tw.rest_id || legacy.id_str}`,
            handle,
            likes:    legacy.favorite_count  || 0,
            retweets: legacy.retweet_count   || 0,
          });
          if (tweets.length >= count) break;
        }
        if (tweets.length > 0) return tweets;
      } catch (_) {}
    }
    return [];
  } catch (err) {
    // Force guest token refresh on auth errors
    if ([401, 403, 429].includes(err.response?.status)) {
      _guestToken   = null;
      _guestTokenTs = 0;
    }
    return [];
  }
}

// ─── Batch runner — 8 accounts at a time, 600 ms gap ─────────────────────────
async function _fetchAll(profiles) {
  const BATCH = 8;
  const out   = [];
  for (let i = 0; i < profiles.length; i += BATCH) {
    const batch   = profiles.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(p => _fetchTweets(p.handle).then(posts => ({ ...p, posts })))
    );
    settled.forEach((r, idx) => {
      const posts = r.status === 'fulfilled' ? r.value.posts : [];
      out.push({ ...batch[idx], posts, available: posts.length > 0 });
    });
    if (i + BATCH < profiles.length) await new Promise(res => setTimeout(res, 600));
  }
  return out;
}

// ─── Cache ────────────────────────────────────────────────────────────────────
const _cache = { data: null, ts: 0 };
const TTL    = 30 * 60_000;

// ─── Load accounts from Excel ─────────────────────────────────────────────────
const EXCEL_PATH = path.join(__dirname, 'india_defence_accounts.xlsx');
const FALLBACK   = [
  { handle:'adgpi',          label:'Indian Army',       category:'official',  focus_area:'Land warfare' },
  { handle:'IAF_MCC',        label:'Indian Air Force',  category:'official',  focus_area:'Air power' },
  { handle:'indiannavy',     label:'Indian Navy',       category:'official',  focus_area:'Naval warfare' },
  { handle:'DRDO_India',     label:'DRDO',              category:'official',  focus_area:'R&D' },
  { handle:'BrahMosMissile', label:'BrahMos Aerospace', category:'official',  focus_area:'Missiles' },
  { handle:'livefist',       label:'Livefist Defence',  category:'journalist',focus_area:'Defence news' },
];

function _loadProfiles() {
  if (!fs.existsSync(EXCEL_PATH)) return FALLBACK;
  try {
    const ws   = XLSX.readFile(EXCEL_PATH).Sheets[XLSX.readFile(EXCEL_PATH).SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const list = rows
      .map(r => ({
        handle:     String(r.handle || '').replace(/^@/, '').trim(),
        label:      String(r.name   || r.handle || '').trim(),
        category:   String(r.category   || 'mixed').trim().toLowerCase(),
        focus_area: String(r.focus_area || '').trim(),
        region:     String(r.region     || 'India').trim(),
      }))
      .filter(p => p.handle);
    console.log(`[FeedChannel] Loaded ${list.length} accounts from Excel`);
    return list;
  } catch (e) {
    console.error('[FeedChannel] Excel error:', e.message);
    return FALLBACK;
  }
}

let PROFILES = _loadProfiles();

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/india-defence', async (req, res) => {
  const now = Date.now();
  if (_cache.data && now - _cache.ts < TTL) return res.json(_cache.data);

  console.log(`[FeedChannel] Fetching tweets for ${PROFILES.length} accounts…`);
  let profiles;
  try {
    profiles = await _fetchAll(PROFILES);
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }

  // Flatten all posts and attach account metadata
  const allPosts = profiles
    .flatMap(p => p.posts.map(post => ({
      ...post,
      account_label:    p.label,
      account_category: p.category,
      account_focus:    p.focus_area,
    })));

  // ── NLP filter: score every tweet, keep only signal-rich ones ────────────
  const nlpFeed = NLP.filterTweets(allPosts);

  // Category breakdown for the UI stats bar
  const catCounts = {};
  for (const t of nlpFeed) {
    for (const c of (t.nlp_categories || [])) {
      catCounts[c.id] = (catCounts[c.id] || 0) + 1;
    }
  }

  const result = {
    profiles,
    feed:       nlpFeed,                          // NLP-filtered, scored, sorted
    all_feed:   allPosts.sort((a,b) => new Date(b.date)-new Date(a.date)), // raw
    total:      nlpFeed.length,
    total_all:  allPosts.length,
    live:       profiles.filter(p => p.available).length,
    sources:    profiles.filter(p => p.available).map(p => `@${p.handle}`),
    categories: catCounts,
    nlp: {
      min_score:    NLP.MIN_SCORE,
      noise_removed: allPosts.length - nlpFeed.length,
      pass_rate:    allPosts.length > 0
                      ? Math.round((nlpFeed.length / allPosts.length) * 100) + '%'
                      : '0%',
    },
    note: 'NLP-filtered via weighted defence corpus. Noise removed. Twitter Guest Token.',
    ts:   now,
  };

  _cache.data = result;
  _cache.ts   = now;
  console.log(
    `[FeedChannel] Done — ${result.live}/${profiles.length} live | ` +
    `${allPosts.length} raw → ${nlpFeed.length} passed NLP (${result.nlp.noise_removed} removed)`
  );
  res.json(result);
});

router.get('/india-defence/accounts', (_req, res) => {
  res.json({ accounts: PROFILES, total: PROFILES.length, excel_loaded: fs.existsSync(EXCEL_PATH) });
});

router.get('/india-defence/flush', (_req, res) => {
  _cache.data   = null;
  _cache.ts     = 0;
  _guestToken   = null;
  _guestTokenTs = 0;
  _uidCache.clear();
  PROFILES      = _loadProfiles();
  res.json({ ok: true, message: 'Cache + guest token + user ID cache cleared.' });
});

module.exports = router;
