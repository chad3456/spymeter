/* ── SPYMETER — Defence Intelligence Dashboard ─────────────
   Swarm-fetches from: Breaking Defense · War Zone · NavalNews
   · AirForce-Tech · Army-Tech · DefenseWorld · Indian Defence
   · Drones of India (OSINT) · GDELT Defence query
   Refresh interval: 10 minutes                              */

const DEFENCE = (() => {
  let _filter       = 'all';
  let _feed         = [];
  let _gdelt        = [];
  let _drones       = [];
  let _timer        = null;
  let _sourcesCount = 0;
  let _onLoad       = null;

  const CAT_MAP = {
    drone: /drone|UAV|UAS|UCAV|loitering|kamikaze|quadcopter|Reaper|Predator|Bayraktar|Shahed/i,
    missile: /missile|hypersonic|ICBM|SLBM|Brahmos|HIMARS|cruise.?missile|rocket.?artillery|ATACMS/i,
    naval: /submarine|frigate|destroyer|carrier|warship|SSN|SSBN|corvette|naval/i,
    ai: /autonomous|AI.weapon|artificial.intell|machine.learn|drone.swarm|loitering.munition|robot|algorithm/i,
    india: /India|DRDO|HAL|BEL|Tejas|AMCA|Arjun|INS|Arihant|Brahmos|Indian.Air|Indian.Army|IAF|Indian.Navy/i,
  };

  function categorize(text) {
    for (const [cat, re] of Object.entries(CAT_MAP)) {
      if (re.test(text)) return cat;
    }
    return 'general';
  }

  const CAT_COLOR = {
    drone:'#00d4ff', missile:'#ff6600', naval:'#4488ff',
    ai:'#9b59ff', india:'#ff8800', general:'#888',
  };
  const CAT_ICON = {
    drone:'🚁', missile:'🚀', naval:'⚓', ai:'🤖', india:'🇮🇳', general:'🛡',
  };

  // ── Render feed item ──────────────────────────────────
  function renderFeedItem(item) {
    const cat   = item.category || categorize((item.title||'') + ' ' + (item.desc||''));
    const col   = CAT_COLOR[cat] || '#888';
    const icon  = CAT_ICON[cat] || '🛡';
    const ts    = item.pub || item.ts || '';
    const timeStr = ts ? _timeAgo(ts) : '';
    const src   = (item.source || '').replace(/^www\./, '');
    const safeT = (item.title||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const url   = item.url || '#';

    return `<a class="def-item" href="${url}" target="_blank" rel="noopener noreferrer">
      <div class="def-item-cat" style="background:${col}22;color:${col}">${icon} ${cat.toUpperCase()}</div>
      <div class="def-item-title">${safeT}</div>
      ${item.desc ? `<div class="def-item-desc">${item.desc.slice(0,120)}…</div>` : ''}
      <div class="def-item-meta">
        <span class="def-src">${src}</span>
        ${timeStr ? `<span class="def-ts">${timeStr}</span>` : ''}
      </div>
    </a>`;
  }

  // ── Render Indian drone card ──────────────────────────
  function renderDroneCard(d) {
    return `<a class="def-drone-card" href="${d.url||'https://duorope.github.io/Drones-of-India/'}" target="_blank" rel="noopener noreferrer">
      <div class="def-drone-name">🇮🇳 ${d.title}</div>
      <div class="def-drone-badges">
        ${d.category ? `<span class="def-drone-type">${d.category}</span>` : ''}
        ${d.status   ? `<span class="def-drone-status">${d.status}</span>` : ''}
        ${d.developer? `<span class="def-drone-dev">${d.developer}</span>` : ''}
      </div>
    </a>`;
  }

  // ── Render all panels ─────────────────────────────────
  function _render() {
    // Drones of India
    const droneEl = document.getElementById('def-india-drones');
    if (droneEl) {
      droneEl.innerHTML = _drones.length
        ? _drones.map(renderDroneCard).join('')
        : '<div class="news-loading">No drone data — check github.com/duorope/Drones-of-India</div>';
    }

    // Main feed (filtered)
    const feedEl = document.getElementById('def-feed');
    if (feedEl) {
      let items = _feed;
      if (_filter !== 'all') {
        items = _feed.filter(i => {
          const cat = i.category || categorize((i.title||'') + ' ' + (i.desc||''));
          return cat === _filter;
        });
      }
      feedEl.innerHTML = items.length
        ? items.map(renderFeedItem).join('')
        : `<div class="news-loading">No ${_filter} items found</div>`;
    }

    // GDELT
    const gdeltEl = document.getElementById('def-gdelt');
    if (gdeltEl) {
      let gdeltItems = _gdelt;
      if (_filter !== 'all') {
        gdeltItems = _gdelt.filter(i => {
          const cat = i.category || categorize(i.title||'');
          return cat === _filter;
        });
      }
      gdeltEl.innerHTML = gdeltItems.length
        ? gdeltItems.map(renderFeedItem).join('')
        : '<div class="news-loading">No GDELT defence items</div>';
    }

    // onLoad callback — fire with stats
    if (_onLoad) {
      const cats = {};
      [..._feed, ..._gdelt].forEach(i => {
        const c = i.category || 'general';
        cats[c] = (cats[c] || 0) + 1;
      });
      try { _onLoad({ total: _feed.length + _gdelt.length, drones: _drones.length, cats, sources: _sourcesCount }); } catch (_) {}
    }
  }

  // ── Fetch ─────────────────────────────────────────────
  async function _fetch() {
    const feedEl  = document.getElementById('def-feed');
    const droneEl = document.getElementById('def-india-drones');
    if (feedEl)  feedEl.innerHTML  = '<div class="news-loading">⟳ Fetching from 8 sources…</div>';
    if (droneEl) droneEl.innerHTML = '<div class="news-loading">⟳ Fetching Drones of India…</div>';

    try {
      const r = await fetch('/api/defence-feed');
      const d = r.ok ? await r.json() : {};
      _feed         = (d.feed  || []).map(i => ({ ...i, category: i.category || categorize((i.title||'') + ' ' + (i.desc||'')) }));
      _gdelt        = (d.gdelt || []).map(i => ({ ...i, category: i.category || categorize(i.title||'') }));
      _drones       = d.drones || [];
      _sourcesCount = d.sources || 0;
      _render();
    } catch (e) {
      if (feedEl)  feedEl.innerHTML  = '<div class="news-loading">Defence feed unavailable</div>';
      if (droneEl) droneEl.innerHTML = '<div class="news-loading">Drones of India unavailable</div>';
    }
  }

  function setFilter(cat) {
    _filter = cat;
    document.querySelectorAll('.def-pill').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    _render();
  }

  function refresh() { _fetch(); }

  function _timeAgo(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return '';
    const secs = (Date.now() - d) / 1000;
    if (secs < 3600)  return Math.round(secs/60)  + 'm ago';
    if (secs < 86400) return Math.round(secs/3600) + 'h ago';
    return Math.round(secs/86400) + 'd ago';
  }

  function init() {
    _fetch();
    _timer = setInterval(_fetch, 600_000); // refresh every 10 min
  }

  return { init, refresh, setFilter, onLoad(cb) { _onLoad = cb; } };
})();
