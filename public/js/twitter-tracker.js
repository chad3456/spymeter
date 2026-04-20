/* ═══════════════════════════════════════════════════════════════════════════
   SPYMETER — India Defence Twitter Tracker
   Full-page overlay. 10 tweets/page. 4-column grid on desktop.
   ═══════════════════════════════════════════════════════════════════════════ */

const TWITTER_TRACKER = (() => {

  // Categories match the NLP corpus IDs in feedchannel/nlp.js
  const TOPICS = [
    { id: 'all',              label: 'ALL',            icon: '🌐' },
    { id: 'weapon_system',    label: 'WEAPONS',        icon: '🚀' },
    { id: 'drone',            label: 'DRONE / UAV',    icon: '🛸' },
    { id: 'acquisition',      label: 'ACQUISITION',    icon: '📋' },
    { id: 'modernisation',    label: 'MODERNISATION',  icon: '⚙️'  },
    { id: 'ai_tech',          label: 'AI / TECH',      icon: '🤖' },
    { id: 'drdo_research',    label: 'DRDO / R&D',     icon: '🔬' },
    { id: 'national_security',label: 'SECURITY',       icon: '🛡'  },
    { id: 'geopolitics',      label: 'GEOPOLITICS',    icon: '🌏' },
    { id: 'space_defence',    label: 'SPACE',          icon: '🛰'  },
  ];

  const PAGE_SIZE = 10;

  let _data     = null;
  let _filtered = [];
  let _page     = 1;
  let _topic    = 'all';
  let _view     = 'feed';
  let _search   = '';
  let _timer    = null;
  let _loading  = false;
  let _inited   = false;

  // ── Public API ─────────────────────────────────────────────────────────────
  function init() {
    if (_inited) { open(); return; }
    _inited = true;
    _renderShell();
    load();
    _timer = setInterval(() => { if (!document.hidden) load(true); }, 10 * 60_000);
  }

  function open() {
    const ov = document.getElementById('twt-overlay');
    if (ov) { ov.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  }

  function close() {
    const ov = document.getElementById('twt-overlay');
    if (ov) { ov.style.display = 'none'; document.body.style.overflow = ''; }
  }

  async function load(silent = false) {
    if (_loading) return;
    _loading = true;
    if (!silent) _setStatus('loading');
    try {
      const r = await fetch('/api/feedchannel/india-defence');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      _data = await r.json();
      _applyFilters();
      _renderStats();
      _renderFeed();
    } catch (e) {
      _setStatus('error', e.message);
    } finally {
      _loading = false;
    }
  }

  // ── Shell (injected into #twt-overlay) ────────────────────────────────────
  function _renderShell() {
    const el = document.getElementById('twt-overlay');
    if (!el) return;
    el.innerHTML = `
      <div class="twto-header">

        <!-- Title row -->
        <div class="twto-title-row">
          <span class="twto-x-icon">𝕏</span>
          <div class="twto-title-block">
            <span class="twto-title">INDIA DEFENCE TWITTER INTEL</span>
            <span class="twto-subtitle">95 curated defence &amp; military accounts · Nitter RSS · No API key</span>
          </div>
          <span class="twto-live-dot" id="twto-live-dot">● LIVE</span>
          <div class="twto-view-sw">
            <button class="twto-vsw active" data-view="feed"     onclick="TWITTER_TRACKER.setView('feed')">⊞ FEED</button>
            <button class="twto-vsw"        data-view="accounts" onclick="TWITTER_TRACKER.setView('accounts')">⊟ ACCOUNTS</button>
          </div>
          <button class="twto-refresh-btn" onclick="TWITTER_TRACKER.refresh()" title="Force refresh">↻ REFRESH</button>
          <button class="twto-close-btn"   onclick="TWITTER_TRACKER.close()"   title="Close (Esc)">✕ CLOSE</button>
        </div>

        <!-- Stats bar -->
        <div class="twto-stats-bar">
          <div class="twto-stat"><span class="twto-sv" id="twts-accounts">—</span><span class="twto-sl">ACCOUNTS</span></div>
          <div class="twto-stat"><span class="twto-sv" id="twts-live" style="color:#00ff88">—</span><span class="twto-sl">LIVE</span></div>
          <div class="twto-stat"><span class="twto-sv" id="twts-posts">—</span><span class="twto-sl">RAW TWEETS</span></div>
          <div class="twto-stat"><span class="twto-sv" id="twts-defence" style="color:#ff9933">—</span><span class="twto-sl">NLP PASSED</span></div>
          <div class="twto-stat"><span class="twto-sv" id="twts-nlp" style="color:#00ff88;font-size:11px">—</span><span class="twto-sl">SIGNAL RATE</span></div>
          <div class="twto-stat"><span class="twto-sv" id="twts-ts" style="font-size:11px">—</span><span class="twto-sl">LAST FETCH</span></div>
          <div class="twto-stat"><span class="twto-sv" id="twts-page" style="font-size:11px">—</span><span class="twto-sl">PAGE</span></div>
        </div>

        <!-- Topic pills -->
        <div class="twto-topic-row" id="twt-topic-row"></div>

        <!-- Search -->
        <div class="twto-search-row">
          <span class="twto-search-icon">🔍</span>
          <input id="twt-search" class="twto-search-input" type="text"
            placeholder="Search tweets, handles, topics…"
            oninput="TWITTER_TRACKER.search(this.value)" autocomplete="off" />
          <span id="twt-result-count" class="twto-result-count"></span>
        </div>

      </div>

      <!-- Tweet grid -->
      <div id="twt-body" class="twto-body">
        <div class="twto-loading-msg">⟳ Fetching India defence-tech feeds from 95 accounts…</div>
      </div>

      <!-- Pagination footer -->
      <div class="twto-footer" id="twt-footer" style="display:none">
        <button class="twto-pg-btn" id="twt-pg-prev" onclick="TWITTER_TRACKER.prevPage()">◀ PREV</button>
        <div class="twto-pg-dots" id="twt-pg-dots"></div>
        <span id="twt-pg-label" class="twto-pg-label"></span>
        <button class="twto-pg-btn" id="twt-pg-next" onclick="TWITTER_TRACKER.nextPage()">NEXT ▶</button>
      </div>
    `;
    _renderTopicPills();
  }

  function _renderTopicPills() {
    const row = document.getElementById('twt-topic-row');
    if (!row) return;
    row.innerHTML = TOPICS.map(t => `
      <button class="twto-tpill${t.id === _topic ? ' active' : ''}"
        data-topic="${t.id}" onclick="TWITTER_TRACKER.setTopic('${t.id}')">
        ${t.icon} ${t.label}
      </button>`).join('');
  }

  // ── Filters (use NLP categories from server, no client-side keyword scan) ──
  function _applyFilters() {
    if (!_data) { _filtered = []; return; }
    // Always start from the NLP-filtered feed (noise already removed server-side)
    let pool = _data.feed || [];

    // Category filter — match against nlp_categories array from server
    if (_topic !== 'all') {
      pool = pool.filter(p =>
        Array.isArray(p.nlp_categories) &&
        p.nlp_categories.some(c => c.id === _topic)
      );
    }

    // Search filter
    if (_search.trim()) {
      const q = _search.trim().toLowerCase();
      pool = pool.filter(p =>
        p.text.toLowerCase().includes(q) ||
        p.handle.toLowerCase().includes(q) ||
        (p.account_label || '').toLowerCase().includes(q)
      );
    }

    _filtered = pool;
    _page = 1;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  function _renderStats() {
    if (!_data) return;
    _set('twts-accounts', _data.profiles ? _data.profiles.length : '—');
    _set('twts-live',     _data.live     !== undefined ? _data.live : '—');
    _set('twts-posts',    _data.total_all !== undefined ? _data.total_all : '—');
    _set('twts-defence',  _data.total    !== undefined ? _data.total : '—');
    // NLP pass-rate stat
    if (_data.nlp) {
      const nlpEl = document.getElementById('twts-nlp');
      if (nlpEl) nlpEl.textContent = _data.nlp.pass_rate + ' signal';
    }
    if (_data.ts) {
      const d = new Date(_data.ts);
      _set('twts-ts', d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
  }

  // ── Feed ───────────────────────────────────────────────────────────────────
  function _renderFeed() {
    const body = document.getElementById('twt-body');
    if (!body) return;

    if (_view === 'accounts') { _renderAccounts(body); return; }

    if (!_data) { body.innerHTML = '<div class="twto-loading-msg">⟳ Fetching…</div>'; return; }
    if (_filtered.length === 0) {
      body.innerHTML = `<div class="twto-empty">No posts match${_search ? ' "' + _esc(_search) + '"' : ''} — try another topic or clear the search.</div>`;
      document.getElementById('twt-footer').style.display = 'none';
      _set('twt-result-count', '0 posts');
      _set('twts-page', '—');
      return;
    }

    const totalPages = Math.ceil(_filtered.length / PAGE_SIZE);
    _page = Math.max(1, Math.min(_page, totalPages));
    const slice = _filtered.slice((_page - 1) * PAGE_SIZE, _page * PAGE_SIZE);

    body.innerHTML = `<div class="twto-grid">${slice.map(_renderCard).join('')}</div>`;

    // Footer
    const footer = document.getElementById('twt-footer');
    footer.style.display = 'flex';
    _set('twt-pg-label', `PAGE ${_page} / ${totalPages}`);
    _set('twts-page', `${_page} / ${totalPages}`);
    document.getElementById('twt-pg-prev').disabled = _page <= 1;
    document.getElementById('twt-pg-next').disabled = _page >= totalPages;

    // Dot indicators (max 12 shown)
    const dotsEl = document.getElementById('twt-pg-dots');
    if (dotsEl) {
      const show = Math.min(totalPages, 12);
      dotsEl.innerHTML = Array.from({ length: show }, (_, i) =>
        `<span class="twto-dot${i + 1 === _page ? ' active' : ''}" onclick="TWITTER_TRACKER.goPage(${i+1})"></span>`
      ).join('');
      if (totalPages > 12) dotsEl.innerHTML += `<span class="twto-dot-more">+${totalPages - 12}</span>`;
    }

    _set('twt-result-count', `${_filtered.length} post${_filtered.length !== 1 ? 's' : ''}`);
    body.scrollTop = 0;
  }

  function _renderCard(p) {
    const relTime  = _relativeTime(p.date);
    const absTime  = p.date ? new Date(p.date).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    const initial  = (p.account_label || p.handle || '?')[0].toUpperCase();
    // Use server-side NLP categories (colour-coded by the nlp.js corpus)
    const cats     = Array.isArray(p.nlp_categories) ? p.nlp_categories : [];
    const score    = p.nlp_score || 0;
    // Score → signal bar width (capped at 100%)
    const sigPct   = Math.min(100, Math.round((score / 20) * 100));
    const sigColor = score >= 12 ? '#ff3366' : score >= 8 ? '#ff9933' : score >= 5 ? '#1da1f2' : '#3d5a78';

    return `
      <div class="twto-card">
        <div class="twto-card-head">
          <div class="twto-avatar">${_esc(initial)}</div>
          <div class="twto-card-meta">
            <span class="twto-card-name">${_esc(p.account_label || p.handle)}</span>
            <span class="twto-card-handle">@${_esc(p.handle)}</span>
          </div>
          <span class="twto-card-time" title="${_esc(absTime)}">${_esc(relTime)}</span>
        </div>
        <!-- NLP signal bar -->
        <div class="twto-sig-bar" title="NLP signal score: ${score}">
          <div class="twto-sig-fill" style="width:${sigPct}%;background:${sigColor}"></div>
        </div>
        <div class="twto-card-text">${_esc(p.text)}</div>
        <div class="twto-card-footer">
          <div class="twto-card-tags">
            ${cats.map(c => `<span class="twto-tag" style="border-color:${c.color}33;color:${c.color};background:${c.color}11">${c.icon} ${c.label}</span>`).join('')}
          </div>
          <div class="twto-card-meta-right">
            ${p.likes    ? `<span class="twto-stat-pill">♥ ${p.likes}</span>` : ''}
            ${p.retweets ? `<span class="twto-stat-pill">↺ ${p.retweets}</span>` : ''}
            ${p.link ? `<a class="twto-ext-link" href="${_esc(p.link)}" target="_blank" rel="noopener">↗ VIEW</a>` : ''}
          </div>
        </div>
      </div>`;
  }

  function _renderAccounts(body) {
    if (!_data || !_data.profiles) { body.innerHTML = '<div class="twto-empty">No data yet.</div>'; return; }
    const profiles = _data.profiles;
    const live = profiles.filter(p => p.available);
    body.innerHTML = `
      <div class="twto-acc-summary">
        <span style="color:#00ff88">${live.length} live</span> &nbsp;·&nbsp;
        <span style="color:#ff4444">${profiles.length - live.length} unavailable</span> &nbsp;·&nbsp;
        <span style="color:#5a7a9a">${profiles.length} total</span>
      </div>
      <div class="twto-acc-grid">
        ${profiles.map(p => `
          <div class="twto-acc-card ${p.available ? 'twto-acc-live' : 'twto-acc-dead'}">
            <div class="twto-acc-top">
              <div class="twto-avatar twto-avatar-sm">${(p.label||p.handle)[0].toUpperCase()}</div>
              <div style="flex:1;min-width:0">
                <div class="twto-acc-name">${_esc(p.label || p.handle)}</div>
                <div class="twto-acc-handle">@${_esc(p.handle)}</div>
              </div>
              <div class="twto-acc-status ${p.available ? 'twto-status-live' : 'twto-status-dead'}">
                ${p.available ? '● ' + (p.posts ? p.posts.length : 0) + ' posts' : '○ offline'}
              </div>
            </div>
            ${p.focus_area ? `<div class="twto-acc-focus">${_esc(p.focus_area)}</div>` : ''}
          </div>`).join('')}
      </div>`;
    document.getElementById('twt-footer').style.display = 'none';
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _relativeTime(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (isNaN(diff)) return dateStr;
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function _setStatus(state, msg) {
    const body = document.getElementById('twt-body');
    if (!body) return;
    if (state === 'loading') body.innerHTML = '<div class="twto-loading-msg">⟳ Fetching India defence-tech feeds from 95 accounts…</div>';
    if (state === 'error')   body.innerHTML = `<div class="twto-error-msg">⚠ ${_esc(msg || 'Error loading feed')}<br><small>Nitter mirrors may be unreachable from this network</small></div>`;
  }

  function _set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Public controls ────────────────────────────────────────────────────────
  function setTopic(id) {
    _topic = id;
    document.querySelectorAll('.twto-tpill').forEach(b => b.classList.toggle('active', b.dataset.topic === id));
    _applyFilters(); _renderFeed();
  }

  function setView(v) {
    _view = v;
    document.querySelectorAll('.twto-vsw').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    _renderFeed();
  }

  function search(val) { _search = val; _applyFilters(); _renderFeed(); }
  function nextPage()  { _page++; _renderFeed(); }
  function prevPage()  { _page--; _renderFeed(); }
  function goPage(n)   { _page = n; _renderFeed(); }

  function refresh() {
    _data = null;
    fetch('/api/feedchannel/india-defence/flush').finally(() => load());
  }

  return { init, open, close, load, refresh, setTopic, setView, search, nextPage, prevPage, goPage };

})();
