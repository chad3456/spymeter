/* ═══════════════════════════════════════════════════════════════════════════
   SPYMETER — India Defence Twitter Tracker
   Fetches tweets from 95 curated Indian defence/military X accounts
   via Nitter RSS. Topic-filters from tweet content. Paginated feed.
   ═══════════════════════════════════════════════════════════════════════════ */

const TWITTER_TRACKER = (() => {

  // ── Topic filters (derived from tweet content) ────────────────────────────
  const TOPICS = [
    { id: 'all',        label: 'ALL',         icon: '🌐', kw: null },
    { id: 'missiles',   label: 'MISSILES',    icon: '🚀', kw: ['missile','brahmos','akash','agni','astra','nirbhay','prithvi','bvr','sam','aam','ballistic','cruise missile','interceptor','hypersonic'] },
    { id: 'drones',     label: 'DRONES / UAV',icon: '🛸', kw: ['drone','uav','uas','ucav','suas','remotely piloted','unmanned','mq-9','predator','tapas','rustom'] },
    { id: 'iaf',        label: 'AIR FORCE',   icon: '✈️', kw: ['iaf','air force','fighter','rafale','tejas','lca','su-30','mig','apache','chinook','helicopter','squadron','sortie'] },
    { id: 'navy',       label: 'NAVY',        icon: '⚓', kw: ['navy','naval','warship','frigate','destroyer','submarine','ins ','aircraft carrier','vikrant','torpedo','sonar','p-8'] },
    { id: 'army',       label: 'ARMY',        icon: '🪖', kw: ['army','adgpi','infantry','tank','artillery','arjun','bmp','loc','lac','border','surgical strike','corps','regiment'] },
    { id: 'drdo',       label: 'DRDO / R&D',  icon: '🔬', kw: ['drdo','drdl','ade ','cair','dmsrde','research','development','test','trial','indigenous','prototype'] },
    { id: 'space',      label: 'SPACE',       icon: '🛰', kw: ['isro','space','satellite','rocket','launch','orbit','asat','pslv','gslv','gaganyaan','agnikul'] },
    { id: 'geopolitics',label: 'GEO / INTEL', icon: '🌏', kw: ['pakistan','china','border','lac','loc','pla','iaf strike','tension','conflict','standoff','quad','indo-pacific','ceasefire'] },
  ];

  const PAGE_SIZE = 20;

  // ── State ──────────────────────────────────────────────────────────────────
  let _data      = null;   // raw API response
  let _filtered  = [];     // currently displayed list
  let _page      = 1;
  let _topic     = 'all';
  let _view      = 'feed'; // 'feed' | 'accounts'
  let _search    = '';
  let _timer     = null;
  let _loading   = false;

  // ── Public API ─────────────────────────────────────────────────────────────
  function init() {
    _renderShell();
    load();
    _timer = setInterval(() => { if (!document.hidden) load(true); }, 10 * 60_000);
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

  // ── Shell HTML ─────────────────────────────────────────────────────────────
  function _renderShell() {
    const el = document.getElementById('rptab-twtracker');
    if (!el) return;
    el.innerHTML = `
      <!-- Header -->
      <div class="twt-header">
        <div class="twt-title-row">
          <span class="twt-icon">𝕏</span>
          <span class="twt-title">INDIA DEFENCE TRACKER</span>
          <span id="twt-live-dot" class="twt-live-dot">●</span>
          <div class="twt-view-sw" style="margin-left:auto">
            <button class="twt-vsw active" data-view="feed"     onclick="TWITTER_TRACKER.setView('feed')">FEED</button>
            <button class="twt-vsw"        data-view="accounts" onclick="TWITTER_TRACKER.setView('accounts')">ACCOUNTS</button>
          </div>
          <button class="mini-btn" onclick="TWITTER_TRACKER.refresh()" title="Refresh feed" style="margin-left:6px">↻</button>
        </div>
        <!-- Stats bar -->
        <div class="twt-stats-bar" id="twt-stats-bar">
          <div class="twt-stat"><span class="twt-sv" id="twts-accounts">—</span><span class="twt-sl">ACCOUNTS</span></div>
          <div class="twt-stat"><span class="twt-sv" id="twts-live">—</span><span class="twt-sl">LIVE</span></div>
          <div class="twt-stat"><span class="twt-sv" id="twts-posts">—</span><span class="twt-sl">POSTS</span></div>
          <div class="twt-stat"><span class="twt-sv" id="twts-defence">—</span><span class="twt-sl">DEFENCE</span></div>
          <div class="twt-stat" style="flex:2"><span class="twt-sv twt-sv-ts" id="twts-ts">—</span><span class="twt-sl">LAST FETCH</span></div>
        </div>
        <!-- Topic filter pills -->
        <div class="twt-topic-row" id="twt-topic-row"></div>
        <!-- Search -->
        <div class="twt-search-row">
          <input id="twt-search" class="twt-search-input" type="text"
            placeholder="Search tweets…" oninput="TWITTER_TRACKER.search(this.value)" autocomplete="off" />
          <span id="twt-result-count" class="twt-result-count"></span>
        </div>
      </div>

      <!-- Feed body -->
      <div id="twt-body" class="twt-body">
        <div class="twt-loading-msg">⟳ Loading India defence feed…</div>
      </div>

      <!-- Pagination footer -->
      <div class="twt-footer" id="twt-footer" style="display:none">
        <button class="twt-pg-btn" id="twt-pg-prev" onclick="TWITTER_TRACKER.prevPage()">◀ PREV</button>
        <span id="twt-pg-label" class="twt-pg-label"></span>
        <button class="twt-pg-btn" id="twt-pg-next" onclick="TWITTER_TRACKER.nextPage()">NEXT ▶</button>
      </div>
    `;
    _renderTopicPills();
  }

  function _renderTopicPills() {
    const row = document.getElementById('twt-topic-row');
    if (!row) return;
    row.innerHTML = TOPICS.map(t => `
      <button class="twt-tpill${t.id === _topic ? ' active' : ''}"
        data-topic="${t.id}" onclick="TWITTER_TRACKER.setTopic('${t.id}')">
        ${t.icon} ${t.label}
      </button>`).join('');
  }

  // ── Filter logic ───────────────────────────────────────────────────────────
  function _applyFilters() {
    if (!_data) { _filtered = []; return; }

    // Start from defence-filtered feed (or all_feed if topic is 'all' but search active)
    let pool = _data.feed && _data.feed.length > 0 ? _data.feed : _data.all_feed || [];

    // Topic filter
    const topicDef = TOPICS.find(t => t.id === _topic);
    if (topicDef && topicDef.kw) {
      pool = pool.filter(p => {
        const lower = p.text.toLowerCase();
        return topicDef.kw.some(kw => lower.includes(kw));
      });
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
    _page = 1; // reset to first page on filter change
  }

  // ── Stats bar ─────────────────────────────────────────────────────────────
  function _renderStats() {
    if (!_data) return;
    _set('twts-accounts', _data.profiles ? _data.profiles.length : '—');
    _set('twts-live',     _data.live     !== undefined ? _data.live : '—');
    _set('twts-posts',    _data.total_all !== undefined ? _data.total_all : '—');
    _set('twts-defence',  _data.total    !== undefined ? _data.total : '—');
    if (_data.ts) {
      const d = new Date(_data.ts);
      _set('twts-ts', d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
  }

  // ── Feed renderer ─────────────────────────────────────────────────────────
  function _renderFeed() {
    const body = document.getElementById('twt-body');
    if (!body) return;

    if (_view === 'accounts') { _renderAccounts(body); return; }

    if (!_data) { body.innerHTML = '<div class="twt-loading-msg">⟳ Fetching…</div>'; return; }
    if (_filtered.length === 0) {
      body.innerHTML = `<div class="twt-empty">No posts found${_search ? ' for "' + _esc(_search) + '"' : ''} — try a different topic or search term.</div>`;
      document.getElementById('twt-footer').style.display = 'none';
      _set('twt-result-count', '');
      return;
    }

    const totalPages = Math.ceil(_filtered.length / PAGE_SIZE);
    _page = Math.max(1, Math.min(_page, totalPages));
    const slice = _filtered.slice((_page - 1) * PAGE_SIZE, _page * PAGE_SIZE);

    body.innerHTML = slice.map(_renderTweetCard).join('');

    // Pagination
    const footer = document.getElementById('twt-footer');
    footer.style.display = totalPages > 1 ? 'flex' : 'none';
    _set('twt-pg-label', `PAGE ${_page} / ${totalPages}`);
    document.getElementById('twt-pg-prev').disabled = _page <= 1;
    document.getElementById('twt-pg-next').disabled = _page >= totalPages;

    // Result count
    _set('twt-result-count', `${_filtered.length} post${_filtered.length !== 1 ? 's' : ''}`);

    // Scroll to top of feed
    body.scrollTop = 0;
  }

  function _renderTweetCard(p) {
    const relTime = _relativeTime(p.date);
    const absTime = p.date ? new Date(p.date).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
    const initial = (p.account_label || p.handle || '?')[0].toUpperCase();
    const tags    = _detectTopics(p.text);
    const tweetLink = p.link
      ? p.link.replace(/nitter\.[^/]+/, 'twitter.com').replace(/lightbrd\.com/, 'twitter.com')
      : '#';
    const safeText = _esc(p.text);

    return `
      <div class="twt-card">
        <div class="twt-card-head">
          <div class="twt-avatar">${_esc(initial)}</div>
          <div class="twt-card-meta">
            <span class="twt-card-name">${_esc(p.account_label || p.handle)}</span>
            <span class="twt-card-handle">@${_esc(p.handle)}</span>
          </div>
          <span class="twt-card-time" title="${_esc(absTime)}">${_esc(relTime)}</span>
        </div>
        <div class="twt-card-text">${safeText}</div>
        <div class="twt-card-footer">
          <div class="twt-card-tags">${tags.map(t => `<span class="twt-tag twt-tag-${t.id}">${t.icon} ${t.label}</span>`).join('')}</div>
          ${tweetLink !== '#' ? `<a class="twt-view-link" href="${_esc(tweetLink)}" target="_blank" rel="noopener">↗ VIEW</a>` : ''}
        </div>
      </div>`;
  }

  function _renderAccounts(body) {
    if (!_data || !_data.profiles) { body.innerHTML = '<div class="twt-empty">No data yet.</div>'; return; }
    const profiles = _data.profiles;
    const live = profiles.filter(p => p.available);
    const dead = profiles.filter(p => !p.available);

    body.innerHTML = `
      <div class="twt-acc-summary">
        <span style="color:#00ff88">${live.length} live</span> &nbsp;·&nbsp;
        <span style="color:#ff4444">${dead.length} unavailable</span> &nbsp;·&nbsp;
        <span style="color:#5a7a9a">${profiles.length} total accounts</span>
      </div>
      ${profiles.map(p => `
        <div class="twt-acc-row ${p.available ? 'twt-acc-live' : 'twt-acc-dead'}">
          <div class="twt-acc-dot ${p.available ? 'twt-dot-live' : 'twt-dot-dead'}">●</div>
          <div class="twt-acc-info">
            <span class="twt-acc-name">${_esc(p.label || p.handle)}</span>
            <span class="twt-acc-handle">@${_esc(p.handle)}</span>
            ${p.focus_area ? `<span class="twt-acc-focus">${_esc(p.focus_area)}</span>` : ''}
          </div>
          <div class="twt-acc-count">${p.available ? (p.posts ? p.posts.length : 0) + ' posts' : 'offline'}</div>
        </div>`).join('')}
    `;
    document.getElementById('twt-footer').style.display = 'none';
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _detectTopics(text) {
    const lower = text.toLowerCase();
    return TOPICS.filter(t => t.kw && t.kw.some(kw => lower.includes(kw))).slice(0, 3);
  }

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
    if (state === 'loading') body.innerHTML = '<div class="twt-loading-msg">⟳ Fetching India defence-tech feeds…</div>';
    if (state === 'error')   body.innerHTML = `<div class="twt-error-msg">⚠ ${_esc(msg || 'Error')}<br><small style="color:#3d5a78">Nitter instances may be unreachable in this environment</small></div>`;
  }

  function _set(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Public methods (called from HTML) ─────────────────────────────────────
  function setTopic(id) {
    _topic = id;
    document.querySelectorAll('.twt-tpill').forEach(b => b.classList.toggle('active', b.dataset.topic === id));
    _applyFilters();
    _renderFeed();
  }

  function setView(v) {
    _view = v;
    document.querySelectorAll('.twt-vsw').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    _renderFeed();
  }

  function search(val) {
    _search = val;
    _applyFilters();
    _renderFeed();
  }

  function nextPage() { _page++; _renderFeed(); }
  function prevPage() { _page--; _renderFeed(); }

  function refresh() {
    _cache_bust = true;
    _data = null;
    fetch('/api/feedchannel/india-defence/flush').finally(() => load());
  }

  return { init, load, refresh, setTopic, setView, search, nextPage, prevPage };

})();
