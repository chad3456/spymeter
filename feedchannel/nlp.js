'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// feedchannel/nlp.js — Defence Intelligence NLP Filter
//
// Scores each tweet against a weighted corpus of Indian defence/security
// signals, then rejects tweets below the relevance threshold.
//
// Pipeline:
//   1. Normalise text
//   2. Hard-reject obvious noise (personal, cricket, politics, spam)
//   3. Score against 9 signal categories (phrases weighted by specificity)
//   4. Apply India-context boost if tweet anchors to Indian entities
//   5. Accept if totalScore >= MIN_SCORE; tag matched categories
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Minimum score to pass the filter ────────────────────────────────────────
const MIN_SCORE = 3;

// ─── NOISE CORPUS — hard-reject patterns ─────────────────────────────────────
// If any of these match, the tweet is discarded immediately regardless of score.
const NOISE_PATTERNS = [
  // Sports
  /\b(ipl|cricket|match|wicket|century|innings|bcci|dhoni|virat|rohit sharma|test match|t20|odi)\b/i,
  // Entertainment / Bollywood
  /\b(bollywood|film|movie|actor|actress|series|ott|netflix|amazon prime|web series|trailer|song|album)\b/i,
  // Elections / domestic politics (not defence policy)
  /\b(election result|polling booth|bjp rally|congress rally|aam aadmi|campaigning|vote bank|manifesto|constituency|MP wins|seat won)\b/i,
  // Personal / motivational noise
  /^(good morning|good night|happy|wishing|congratulations on|many many|best wishes|stay safe|take care|greetings|today i|i am feeling|my thoughts|just arrived|just returned)/i,
  // Spam / promotional
  /\b(follow me|click here|link in bio|subscribe|dm for|check out my|buy now|offer|discount|free giveaway)\b/i,
  // Very generic with no signal
  /^(rt @|via @).{0,60}$/i,
  // Economy without defence angle (pure finance)
  /\b(sensex|nifty|stock market|share price|mutual fund|ipo listing|quarterly results|revenue growth)\b/i,
];

// ─── SIGNAL CORPUS — categories with weighted phrases ────────────────────────
// Weight guide:
//   5  = extremely specific, near-certain defence intel (e.g. "BrahMos test fire")
//   4  = highly specific programme or acquisition term
//   3  = clear defence domain term
//   2  = moderate signal, needs category context
//   1  = weak signal, boosts score only when combined with others
const CATEGORIES = [

  {
    id: 'acquisition',
    label: 'Acquisition',
    icon: '📋',
    color: '#3399ff',
    phrases: [
      // Contracts & deals
      { p: 'defence acquisition council',   w: 5 },
      { p: 'dac approves',                  w: 5 },
      { p: 'request for proposal',          w: 4 },
      { p: 'letter of acceptance',          w: 4 },
      { p: 'signed contract',               w: 4 },
      { p: 'inked deal',                    w: 4 },
      { p: 'procurement order',             w: 4 },
      { p: 'ministry of defence approved',  w: 4 },
      { p: 'mod approves',                  w: 4 },
      { p: 'strategic partnership',         w: 3 },
      { p: 'transfer of technology',        w: 4 },
      { p: 'tot agreement',                 w: 4 },
      { p: 'make in india',                 w: 3 },
      { p: 'indigenous production',         w: 3 },
      { p: 'inducted into',                 w: 4 },
      { p: 'commissioned into',             w: 4 },
      { p: 'handed over to',                w: 3 },
      { p: 'delivery of',                   w: 2 },
      { p: 'acquisition',                   w: 2 },
      { p: 'procure',                       w: 2 },
      { p: 'defence deal',                  w: 4 },
    ],
  },

  {
    id: 'weapon_system',
    label: 'Weapon System',
    icon: '🚀',
    color: '#ff6633',
    phrases: [
      // Missiles
      { p: 'brahmos',                       w: 5 },
      { p: 'agni-v',                        w: 5 },
      { p: 'agni v',                        w: 5 },
      { p: 'agni missile',                  w: 5 },
      { p: 'prithvi missile',               w: 5 },
      { p: 'akash missile',                 w: 5 },
      { p: 'akash ng',                      w: 5 },
      { p: 'astra missile',                 w: 5 },
      { p: 'nirbhay',                       w: 5 },
      { p: 'hypersonic missile',            w: 5 },
      { p: 'ballistic missile',             w: 4 },
      { p: 'cruise missile',                w: 4 },
      { p: 'anti-ship missile',             w: 4 },
      { p: 'surface-to-air',               w: 4 },
      { p: 'air-to-air missile',            w: 4 },
      { p: 'qrsam',                         w: 5 },
      { p: 'mrsam',                         w: 5 },
      { p: 'lrsam',                         w: 5 },
      { p: 'pralay missile',                w: 5 },
      { p: 's-400',                         w: 4 },
      { p: 'missile test',                  w: 4 },
      { p: 'test fire',                     w: 4 },
      { p: 'test fired',                    w: 4 },
      // Aircraft
      { p: 'rafale',                        w: 4 },
      { p: 'tejas mk',                      w: 5 },
      { p: 'lca tejas',                     w: 5 },
      { p: 'amca',                          w: 5 },
      { p: 'advanced medium combat aircraft', w: 5 },
      { p: 'su-30 mki',                     w: 4 },
      { p: 'mig-29',                        w: 3 },
      { p: 'apache helicopter',             w: 4 },
      { p: 'chinook helicopter',            w: 4 },
      { p: 'mh-60 romeo',                   w: 5 },
      { p: 'c-17 globemaster',              w: 4 },
      { p: 'p-8i',                          w: 4 },
      { p: 'p8i',                           w: 4 },
      { p: 'fighter jet',                   w: 3 },
      // Naval
      { p: 'ins vikrant',                   w: 5 },
      { p: 'aircraft carrier',              w: 4 },
      { p: 'nuclear submarine',             w: 5 },
      { p: 'ins arihant',                   w: 5 },
      { p: 'ssbn',                          w: 5 },
      { p: 'ssn',                           w: 3 },
      { p: 'stealth frigate',               w: 4 },
      { p: 'destroyer',                     w: 3 },
      { p: 'torpedo',                       w: 4 },
      // Artillery / Land
      { p: 'arjun tank',                    w: 5 },
      { p: 'k9 vajra',                      w: 5 },
      { p: 'dhanush gun',                   w: 5 },
      { p: 'howitzer',                      w: 4 },
      { p: 'atag',                          w: 4 },
      { p: 'pinaka',                        w: 5 },
      { p: 'weapon system',                 w: 2 },
      { p: 'warhead',                       w: 3 },
    ],
  },

  {
    id: 'drone',
    label: 'Drone / UAV',
    icon: '🛸',
    color: '#9b59ff',
    phrases: [
      { p: 'mq-9 reaper',                   w: 5 },
      { p: 'predator drone',                w: 5 },
      { p: 'armed drone',                   w: 5 },
      { p: 'combat drone',                  w: 5 },
      { p: 'ucav',                          w: 5 },
      { p: 'male uav',                      w: 5 },
      { p: 'hale uav',                      w: 5 },
      { p: 'tapas uav',                     w: 5 },
      { p: 'rustom',                        w: 5 },
      { p: 'archer drone',                  w: 5 },
      { p: 'ideaforge',                     w: 4 },
      { p: 'garuda aerospace',              w: 4 },
      { p: 'drone manufacturing',           w: 4 },
      { p: 'drone policy',                  w: 4 },
      { p: 'drone corridor',                w: 4 },
      { p: 'pli drone',                     w: 4 },
      { p: 'anti-drone',                    w: 4 },
      { p: 'counter-uav',                   w: 4 },
      { p: 'swarm drone',                   w: 5 },
      { p: 'drone attack',                  w: 4 },
      { p: 'kamikaze drone',                w: 5 },
      { p: 'loitering munition',            w: 5 },
      { p: 'remotely piloted',              w: 3 },
      { p: 'unmanned aerial',               w: 3 },
      { p: 'uav',                           w: 3 },
      { p: 'drone',                         w: 2 },
    ],
  },

  {
    id: 'ai_tech',
    label: 'AI / Tech',
    icon: '🤖',
    color: '#00ccff',
    phrases: [
      { p: 'artificial intelligence in defence', w: 5 },
      { p: 'ai in military',               w: 5 },
      { p: 'autonomous weapon',            w: 5 },
      { p: 'autonomous system',            w: 4 },
      { p: 'machine learning military',    w: 5 },
      { p: 'c4isr',                        w: 5 },
      { p: 'network-centric warfare',      w: 5 },
      { p: 'decision support system',      w: 4 },
      { p: 'target recognition',           w: 4 },
      { p: 'electronic warfare',           w: 4 },
      { p: 'electronic countermeasure',    w: 4 },
      { p: 'cyber warfare',                w: 4 },
      { p: 'cyber attack',                 w: 3 },
      { p: 'space-based surveillance',     w: 5 },
      { p: 'isr',                          w: 3 },
      { p: 'sigint',                       w: 4 },
      { p: 'military ai',                  w: 5 },
      { p: 'defence ai',                   w: 5 },
      { p: 'lethal autonomous',            w: 5 },
      { p: 'deep learning defence',        w: 5 },
      { p: 'directed energy',              w: 4 },
      { p: 'high-energy laser',            w: 5 },
      { p: 'dew ',                         w: 4 },
    ],
  },

  {
    id: 'modernisation',
    label: 'Modernisation',
    icon: '⚙️',
    color: '#ffaa00',
    phrases: [
      { p: 'upgrade',                       w: 2 },
      { p: 'modernisation',                 w: 3 },
      { p: 'modernization',                 w: 3 },
      { p: 'retrofit',                      w: 4 },
      { p: 'life extension',                w: 4 },
      { p: 'mid-life upgrade',              w: 5 },
      { p: 'mlu',                           w: 4 },
      { p: 'block upgrade',                 w: 4 },
      { p: 'next generation',               w: 2 },
      { p: 'next-gen',                      w: 2 },
      { p: 'capability enhancement',        w: 4 },
      { p: 'capability upgrade',            w: 4 },
      { p: 'avionics upgrade',              w: 5 },
      { p: 'structural overhaul',           w: 4 },
      { p: 'overhauled',                    w: 3 },
      { p: 'refurbished',                   w: 3 },
      { p: 'new variant',                   w: 3 },
      { p: 'mk2',                           w: 3 },
      { p: 'mark ii',                       w: 3 },
      { p: 'improved version',              w: 3 },
      { p: 'advanced variant',              w: 3 },
      { p: 'inducted into service',         w: 5 },
      { p: 'induction into',                w: 4 },
      { p: 'fleet modernisation',           w: 4 },
      { p: 'fleet modernization',           w: 4 },
      { p: 'decommissioned',                w: 3 },
      { p: 'commissioned',                  w: 3 },
      { p: 'latest version',                w: 2 },
      { p: 'upgraded variant',              w: 4 },
      { p: 'enhanced capability',           w: 4 },
      { p: 'new generation',                w: 2 },
      { p: 'fielded',                        w: 3 },
      { p: 'cleared for service',           w: 4 },
      { p: 'inducted',                       w: 3 },
      { p: 'upgrade contract',              w: 4 },
      { p: 'upgraded',                       w: 2 },
    ],
  },

  {
    id: 'drdo_research',
    label: 'DRDO / R&D',
    icon: '🔬',
    color: '#ffdd00',
    phrases: [
      { p: 'drdo',                          w: 3 },
      { p: 'drdl',                          w: 4 },
      { p: 'ade ',                          w: 3 },
      { p: 'cair ',                         w: 4 },
      { p: 'dmsrde',                        w: 4 },
      { p: 'nmrl',                          w: 4 },
      { p: 'defence research',              w: 3 },
      { p: 'indigenous development',        w: 3 },
      { p: 'prototype',                     w: 2 },
      { p: 'user trial',                    w: 4 },
      { p: 'field trial',                   w: 4 },
      { p: 'developmental trial',           w: 4 },
      { p: 'flight test',                   w: 4 },
      { p: 'successfully tested',           w: 4 },
      { p: 'technology demonstrator',       w: 5 },
      { p: 'design and development',        w: 3 },
      { p: 'indigenous design',             w: 4 },
      { p: 'hal ',                          w: 2 },
      { p: 'hindustan aeronautics',         w: 3 },
      { p: 'bharat forge',                  w: 3 },
      { p: 'ordnance factory',              w: 3 },
      { p: 'ofe ',                          w: 3 },
      { p: 'ofb ',                          w: 3 },
    ],
  },

  {
    id: 'national_security',
    label: 'National Security',
    icon: '🛡',
    color: '#ff3366',
    phrases: [
      { p: 'national security',             w: 4 },
      { p: 'nsa doval',                     w: 5 },
      { p: 'ajit doval',                    w: 4 },
      { p: 'national security council',     w: 5 },
      { p: 'nscs',                          w: 4 },
      { p: 'raw ',                          w: 3 },
      { p: 'intelligence bureau',           w: 4 },
      { p: 'counter-terrorism',             w: 4 },
      { p: 'counter terrorism',             w: 4 },
      { p: 'terror attack',                 w: 4 },
      { p: 'surgical strike',               w: 5 },
      { p: 'cross-border terrorism',        w: 5 },
      { p: 'isi ',                          w: 3 },
      { p: 'proxy war',                     w: 4 },
      { p: 'ceasefire violation',           w: 4 },
      { p: 'infiltration',                  w: 3 },
      { p: 'border security force',         w: 3 },
      { p: 'bsf',                           w: 2 },
      { p: 'crpf',                          w: 2 },
      { p: 'nsg',                           w: 3 },
      { p: 'atc ',                          w: 2 },
    ],
  },

  {
    id: 'geopolitics',
    label: 'Geopolitics',
    icon: '🌏',
    color: '#00ff88',
    phrases: [
      { p: 'lac standoff',                  w: 5 },
      { p: 'galwan',                        w: 5 },
      { p: 'doklam',                        w: 5 },
      { p: 'arunachal pradesh border',      w: 5 },
      { p: 'line of actual control',        w: 5 },
      { p: 'line of control',               w: 4 },
      { p: 'loc ',                          w: 3 },
      { p: 'lac ',                          w: 3 },
      { p: 'indo-pacific strategy',         w: 4 },
      { p: 'quad summit',                   w: 5 },
      { p: 'aukus',                         w: 4 },
      { p: 'china pla',                     w: 4 },
      { p: 'pla navy',                      w: 4 },
      { p: 'pla air force',                 w: 4 },
      { p: 'pakistan army',                 w: 3 },
      { p: 'pakistan airforce',             w: 3 },
      { p: 'pakistan navy',                 w: 3 },
      { p: 'india china tension',           w: 5 },
      { p: 'india pakistan',                w: 3 },
      { p: 'strategic autonomy',            w: 4 },
      { p: 'strategic partnership',         w: 3 },
      { p: 'defence cooperation',           w: 4 },
      { p: 'bilateral defence',             w: 4 },
      { p: 'joint military exercise',       w: 5 },
      { p: 'military exercise',             w: 4 },
      { p: 'war game',                      w: 4 },
      { p: 'wargame',                       w: 4 },
      { p: 'security pact',                 w: 4 },
    ],
  },

  {
    id: 'space_defence',
    label: 'Space Defence',
    icon: '🛰',
    color: '#cc88ff',
    phrases: [
      { p: 'asat',                          w: 5 },
      { p: 'anti-satellite',                w: 5 },
      { p: 'space warfare',                 w: 5 },
      { p: 'military satellite',            w: 5 },
      { p: 'spy satellite',                 w: 5 },
      { p: 'reconnaissance satellite',      w: 5 },
      { p: 'cartosat',                      w: 4 },
      { p: 'risat',                         w: 4 },
      { p: 'emisat',                        w: 5 },
      { p: 'gsat-7',                        w: 5 },
      { p: 'defence satellite',             w: 4 },
      { p: 'isro',                          w: 2 },
      { p: 'space command',                 w: 4 },
      { p: 'defence space agency',          w: 5 },
      { p: 'dsa ',                          w: 3 },
      { p: 'missile defence',               w: 4 },
      { p: 'bmds',                          w: 5 },
      { p: 'ballistic missile defence',     w: 5 },
      { p: 'phase-ii bmds',                 w: 5 },
    ],
  },

];

// ─── India entity anchors — boosts score when tweet mentions Indian entities ──
const INDIA_ANCHORS = [
  'india', 'indian', 'bharat', 'iaf', 'indian air force', 'indian army',
  'indian navy', 'drdo', 'hal ', 'mod ', 'ministry of defence',
  'cds ', 'coas ', 'cns ', 'cas ', 'defence minister', 'rajnath',
  'brahmos', 'tejas', 'arjun', 'akash', 'pinaka', 'ins ',
];

// ─── Intra-text helpers ────────────────────────────────────────────────────────
function _normalise(text) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')   // strip URLs
    .replace(/[^\w\s\-\.\/]/g, ' ')     // strip emoji / special chars
    .replace(/\s+/g, ' ')
    .trim();
}

function _isNoise(norm) {
  if (norm.length < 40) return true;                           // too short
  if (/^\s*(via|rt)\s+@/.test(norm)) return true;             // plain retweet
  if (NOISE_PATTERNS.some(rx => rx.test(norm))) return true;
  // Reject pure-opinion tweets with no factual marker
  const opinionOnly = /^(i think|in my opinion|imo|imho|my take|thread :|🧵)\b/i.test(norm);
  const hasFactMarker = /\b(test|trial|contract|induct|deploy|commission|acquire|launch|develop|sign|deliver|approve|announce|report|confirm)\b/.test(norm);
  if (opinionOnly && !hasFactMarker) return true;
  return false;
}

function _hasIndiaContext(norm) {
  return INDIA_ANCHORS.some(a => norm.includes(a));
}

// ─── Main scorer ──────────────────────────────────────────────────────────────
function score(rawText) {
  const norm = _normalise(rawText);

  if (_isNoise(norm)) return { pass: false, score: 0, categories: [] };

  let total = 0;
  const matched = [];

  for (const cat of CATEGORIES) {
    let catScore = 0;
    for (const { p, w } of cat.phrases) {
      if (norm.includes(p.toLowerCase())) catScore += w;
    }
    if (catScore > 0) {
      total += catScore;
      matched.push({ ...cat, catScore });
    }
  }

  // India context boost: +2 if anchored to Indian entity
  if (_hasIndiaContext(norm)) total += 2;

  // Sort categories by score descending, return top 3
  matched.sort((a, b) => b.catScore - a.catScore);
  const topCats = matched.slice(0, 3);

  return {
    pass:       total >= MIN_SCORE,
    score:      total,
    categories: topCats.map(c => ({ id: c.id, label: c.label, icon: c.icon, color: c.color })),
  };
}

// ─── Batch filter ─────────────────────────────────────────────────────────────
function filterTweets(tweets) {
  const out = [];
  for (const t of tweets) {
    const result = score(t.text || '');
    if (result.pass) {
      out.push({ ...t, nlp_score: result.score, nlp_categories: result.categories });
    }
  }
  // Sort by date desc (newest first), break ties by NLP score
  return out.sort((a, b) => new Date(b.date) - new Date(a.date) || b.nlp_score - a.nlp_score);
}

module.exports = { score, filterTweets, CATEGORIES, MIN_SCORE };
