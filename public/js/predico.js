'use strict';

/* ══════════════════════════════════════════════════════════════════════════════
   PREDICO — Polymarket War Prediction Intelligence
   Fetches live prediction market data from Polymarket Gamma API (via backend)
   and renders it as a war-intelligence panel.
══════════════════════════════════════════════════════════════════════════════ */
const PREDICO = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let _markets    = [];
  let _filtered   = [];
  let _category   = 'all';
  let _sort       = 'volume';
  let _search     = '';
  let _inited     = false;
  let _loading    = false;
  let _refreshTmr = null;

  // ── Category config ────────────────────────────────────────────────────────
  const CATS = [
    { id: 'all',       label: 'ALL',       color: '#c8dff0' },
    { id: 'iran',      label: '🇮🇷 IRAN',   color: '#ff6633' },
    { id: 'ukraine',   label: '🇺🇦 UKR/RUS',color: '#ffdd00' },
    { id: 'china',     label: '🇨🇳 CHINA',  color: '#ff4444' },
    { id: 'nuclear',   label: '☢ NUCLEAR', color: '#ff9900' },
    { id: 'drone',     label: '🛸 DRONE',  color: '#9b59ff' },
    { id: 'arms',      label: '🔫 ARMS',   color: '#ff3366' },
    { id: 'military',  label: '🎖 MIL',    color: '#00d4ff' },
    { id: 'sanctions', label: '⛔ SANCT',  color: '#ffaa00' },
    { id: 'ceasefire', label: '🕊 PEACE',  color: '#00ff88' },
    { id: 'conflict',  label: '💥 CONFCT', color: '#ff8800' },
  ];

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _pColor(p) {
    if (p >= 0.75) return '#ff2222';
    if (p >= 0.60) return '#ff6600';
    if (p >= 0.45) return '#ffcc00';
    if (p >= 0.30) return '#00d4ff';
    return '#00ff88';
  }

  function _fmtVol(v) {
    if (!v) return '$0';
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${Math.round(v)}`;
  }

  function _fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d)) return s.slice(0, 10);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  }

  function _timeAgo(s) {
    if (!s) return '';
    const sec = (Date.now() - new Date(s)) / 1000;
    if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
    return `${Math.round(sec / 86400)}d ago`;
  }

  function _catColor(id) {
    return (CATS.find(c => c.id === id) || CATS[0]).color;
  }

  // ── Inject CSS once ────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('predico-styles')) return;
    const s = document.createElement('style');
    s.id = 'predico-styles';
    s.textContent = `
      #rptab-predico { display:flex; flex-direction:column; height:calc(100vh - 42px); overflow:hidden; }

      /* Header */
      .pdc-header { background:rgba(255,50,50,.06); border-bottom:1px solid rgba(255,50,50,.2); flex-shrink:0; }
      .pdc-title-row { display:flex; align-items:center; gap:8px; padding:7px 10px 3px; }
      .pdc-icon { font-size:16px; }
      .pdc-title { font-size:9px; font-weight:700; letter-spacing:2px; color:#ff4444; }
      .pdc-badge { font-size:6.5px; padding:1px 5px; border-radius:2px; letter-spacing:.5px; }
      .pdc-refresh-btn { margin-left:auto; background:transparent; border:1px solid #1a3040; color:#3d5a78; font-size:7.5px; padding:2px 7px; border-radius:2px; cursor:pointer; }
      .pdc-refresh-btn:hover { border-color:#ff4444; color:#ff4444; }

      /* Risk dial */
      .pdc-risk-row { display:flex; align-items:center; gap:10px; padding:5px 10px 6px; border-bottom:1px solid #0d1e2e; }
      .pdc-dial-wrap { position:relative; width:54px; height:54px; flex-shrink:0; }
      .pdc-dial-svg { width:54px; height:54px; }
      .pdc-dial-val { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
      .pdc-dial-num { font-size:13px; font-weight:700; line-height:1; }
      .pdc-dial-lbl { font-size:5.5px; color:#3d5a78; letter-spacing:.5px; margin-top:1px; }
      .pdc-stats-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px; flex:1; }
      .pdc-stat { background:rgba(255,255,255,.03); border:1px solid #0d1e2e; border-radius:2px; padding:3px 6px; text-align:center; }
      .pdc-stat-v { font-size:12px; font-weight:700; color:#c8dff0; line-height:1; }
      .pdc-stat-l { font-size:5.5px; color:#3d5a78; letter-spacing:.5px; margin-top:1px; }

      /* Filters */
      .pdc-filters { flex-shrink:0; border-bottom:1px solid #0d1e2e; padding:4px 6px; display:flex; flex-direction:column; gap:3px; }
      .pdc-cat-row { display:flex; gap:3px; flex-wrap:wrap; }
      .pdc-cpill { background:transparent; border:1px solid #1a3040; color:#3d5a78; font-size:6.5px; padding:2px 6px; border-radius:10px; cursor:pointer; white-space:nowrap; transition:all .15s; }
      .pdc-cpill.active { border-color:currentColor; background:rgba(255,255,255,.06); }
      .pdc-cpill:hover { color:#c8dff0; border-color:#3d5a78; }
      .pdc-sort-search { display:flex; gap:4px; align-items:center; }
      .pdc-sort-btn { background:transparent; border:1px solid #1a3040; color:#3d5a78; font-size:6.5px; padding:2px 7px; border-radius:2px; cursor:pointer; transition:all .15s; }
      .pdc-sort-btn.active { background:rgba(255,68,68,.12); border-color:rgba(255,68,68,.5); color:#ff6666; }
      .pdc-search { flex:1; background:rgba(255,255,255,.04); border:1px solid #1a3040; color:#c8dff0; font-size:7px; padding:3px 6px; border-radius:2px; outline:none; }
      .pdc-search::placeholder { color:#3d5a78; }
      .pdc-search:focus { border-color:#ff4444; }
      .pdc-count { font-size:6.5px; color:#3d5a78; white-space:nowrap; }

      /* Cards */
      .pdc-list { flex:1; overflow-y:auto; padding:4px; display:flex; flex-direction:column; gap:4px; }
      .pdc-list::-webkit-scrollbar { width:3px; }
      .pdc-list::-webkit-scrollbar-track { background:#06090e; }
      .pdc-list::-webkit-scrollbar-thumb { background:#1a3040; border-radius:2px; }

      .pdc-card { display:flex; gap:0; background:rgba(8,15,26,.9); border:1px solid #121e30; border-radius:3px; text-decoration:none; color:inherit; transition:border-color .15s, background .15s; overflow:hidden; }
      .pdc-card:hover { border-color:#ff4444; background:rgba(20,10,10,.9); }
      .pdc-card.hot { border-color:rgba(255,34,34,.4); box-shadow:0 0 6px rgba(255,34,34,.15); }
      .pdc-card.high { border-color:rgba(255,102,0,.3); }

      .pdc-card-left { flex:1; padding:6px 8px; border-left:3px solid #1a3040; min-width:0; }
      .pdc-cat-tag { display:inline-block; font-size:6px; font-weight:700; letter-spacing:.8px; padding:1px 4px; border-radius:2px; background:rgba(255,255,255,.06); margin-bottom:3px; }
      .pdc-question { font-size:7.5px; color:#c8dff0; line-height:1.4; margin-bottom:4px; word-break:break-word; }
      .pdc-meta { display:flex; gap:8px; font-size:6px; color:#3d5a78; align-items:center; flex-wrap:wrap; }
      .pdc-vol { color:#5a7a9a; }
      .pdc-vol24 { color:#4a8a6a; }
      .pdc-exp { color:#4a5a6a; }
      .pdc-badge-hot  { font-size:5.5px; background:#ff2200; color:#fff; padding:1px 3px; border-radius:2px; letter-spacing:.5px; }
      .pdc-badge-new  { font-size:5.5px; background:#9b59ff; color:#fff; padding:1px 3px; border-radius:2px; letter-spacing:.5px; }
      .pdc-badge-feat { font-size:5.5px; background:#ffaa00; color:#000; padding:1px 3px; border-radius:2px; letter-spacing:.5px; }

      .pdc-card-right { width:52px; flex-shrink:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6px 4px; border-left:1px solid #121e30; background:rgba(0,0,0,.3); gap:4px; }
      .pdc-pct { font-size:16px; font-weight:700; line-height:1; }
      .pdc-bar-wrap { width:6px; height:36px; background:#0d1e2e; border-radius:3px; overflow:hidden; flex-shrink:0; }
      .pdc-bar-fill  { width:100%; border-radius:3px; transition:height .4s; }
      .pdc-yes-label { font-size:5px; color:#3d5a78; letter-spacing:.5px; }

      /* Loading / empty */
      .pdc-loading { text-align:center; padding:30px 10px; font-size:8px; color:#3d5a78; letter-spacing:1px; animation:pulse 1.5s infinite; }
      .pdc-empty   { text-align:center; padding:20px 10px; font-size:8px; color:#3d5a78; }
      .pdc-error   { text-align:center; padding:20px 10px; font-size:8px; color:#ff4444; }
    `;
    document.head.appendChild(s);
  }

  // ── Shell HTML ─────────────────────────────────────────────────────────────
  function _shell() {
    const catPills = CATS.map(c =>
      `<button class="pdc-cpill${c.id === 'all' ? ' active' : ''}" data-cat="${c.id}" style="color:${c.color}">${c.label}</button>`
    ).join('');

    return `
      <div class="pdc-header">
        <div class="pdc-title-row">
          <span class="pdc-icon">🎲</span>
          <span class="pdc-title">PREDICO</span>
          <span class="pdc-badge" id="pdc-live-badge" style="background:rgba(255,170,0,.15);color:#ffaa00">● LOADING</span>
          <button class="pdc-refresh-btn" id="pdc-refresh-btn">↻ REFRESH</button>
        </div>
        <div class="pdc-risk-row">
          <div class="pdc-dial-wrap">
            <svg class="pdc-dial-svg" viewBox="0 0 54 54">
              <circle cx="27" cy="27" r="22" fill="none" stroke="#0d1e2e" stroke-width="5"/>
              <circle id="pdc-dial-arc" cx="27" cy="27" r="22" fill="none" stroke="#ff4444" stroke-width="5"
                stroke-dasharray="0 138" stroke-dashoffset="34.5" stroke-linecap="round" style="transition:stroke-dasharray .6s,stroke .6s"/>
            </svg>
            <div class="pdc-dial-val">
              <div class="pdc-dial-num" id="pdc-risk-num" style="color:#ff4444">—</div>
              <div class="pdc-dial-lbl">WAR RISK</div>
            </div>
          </div>
          <div class="pdc-stats-grid">
            <div class="pdc-stat">
              <div class="pdc-stat-v" id="pdc-s-total">—</div>
              <div class="pdc-stat-l">MARKETS</div>
            </div>
            <div class="pdc-stat">
              <div class="pdc-stat-v" id="pdc-s-vol">—</div>
              <div class="pdc-stat-l">TOTAL VOL</div>
            </div>
            <div class="pdc-stat">
              <div class="pdc-stat-v" id="pdc-s-highrisk" style="color:#ff4444">—</div>
              <div class="pdc-stat-l">HIGH RISK ≥60%</div>
            </div>
            <div class="pdc-stat">
              <div class="pdc-stat-v" id="pdc-s-shown">—</div>
              <div class="pdc-stat-l">SHOWING</div>
            </div>
          </div>
        </div>
      </div>

      <div class="pdc-filters">
        <div class="pdc-cat-row">${catPills}</div>
        <div class="pdc-sort-search">
          <button class="pdc-sort-btn" data-sort="volume">💰 VOL</button>
          <button class="pdc-sort-btn active" data-sort="risk">🔴 RISK</button>
          <button class="pdc-sort-btn" data-sort="expiry">📅 EXP</button>
          <button class="pdc-sort-btn" data-sort="activity">⚡ 24H</button>
          <input class="pdc-search" id="pdc-search" placeholder="🔍 search…" autocomplete="off">
        </div>
      </div>

      <div class="pdc-list" id="pdc-list">
        <div class="pdc-loading">⟳ FETCHING PREDICTION MARKETS…</div>
      </div>`;
  }

  // ── Render one card ────────────────────────────────────────────────────────
  function _card(m) {
    const pct    = Math.round(m.probability * 100);
    const col    = _pColor(m.probability);
    const catCol = _catColor(m.category);
    const q      = (m.question || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const qShort = q.length > 100 ? q.slice(0, 97) + '…' : q;
    const isHot  = m.probability >= 0.7 && m.volume >= 50000;
    const circumference = 138;
    const fillLen = (pct / 100) * circumference;

    let badges = '';
    if (isHot)      badges += '<span class="pdc-badge-hot">🔥 HOT</span> ';
    if (m.isNew)    badges += '<span class="pdc-badge-new">NEW</span> ';
    if (m.featured) badges += '<span class="pdc-badge-feat">⭐ FEAT</span> ';

    return `<a class="pdc-card${isHot ? ' hot' : m.probability >= 0.6 ? ' high' : ''}"
               href="${m.url}" target="_blank" rel="noopener noreferrer">
      <div class="pdc-card-left" style="border-left-color:${catCol}">
        <div class="pdc-cat-tag" style="color:${catCol}">${(m.category || 'conflict').toUpperCase()}</div>
        ${badges ? `<div style="margin-bottom:3px">${badges}</div>` : ''}
        <div class="pdc-question">${qShort}</div>
        <div class="pdc-meta">
          <span class="pdc-vol">💰 ${_fmtVol(m.volume)}</span>
          ${m.volume24h > 0 ? `<span class="pdc-vol24">24h ${_fmtVol(m.volume24h)}</span>` : ''}
          <span class="pdc-exp">exp ${_fmtDate(m.endDate)}</span>
        </div>
      </div>
      <div class="pdc-card-right">
        <div class="pdc-pct" style="color:${col}">${pct}<span style="font-size:9px">%</span></div>
        <div class="pdc-bar-wrap">
          <div class="pdc-bar-fill" style="height:${pct}%;background:${col};box-shadow:0 0 5px ${col}66;margin-top:${100 - pct}%"></div>
        </div>
        <div class="pdc-yes-label">YES</div>
      </div>
    </a>`;
  }

  // ── Dial updater ───────────────────────────────────────────────────────────
  function _updateDial(score) {
    const arc = document.getElementById('pdc-dial-arc');
    const num = document.getElementById('pdc-risk-num');
    if (!arc || !num) return;
    const col  = _pColor(score / 100);
    const fill = (score / 100) * 138;
    arc.setAttribute('stroke-dasharray', `${fill} ${138 - fill}`);
    arc.setAttribute('stroke', col);
    num.textContent = score + '%';
    num.style.color = col;
  }

  // ── Apply filters + render ─────────────────────────────────────────────────
  function _render() {
    const list = document.getElementById('pdc-list');
    if (!list) return;

    let data = [..._markets];

    if (_category !== 'all') data = data.filter(m => m.category === _category);

    if (_search) {
      const q = _search.toLowerCase();
      data = data.filter(m =>
        (m.question || '').toLowerCase().includes(q) ||
        (m.category || '').includes(q)
      );
    }

    // Sort
    if (_sort === 'volume')   data.sort((a, b) => b.volume - a.volume);
    if (_sort === 'risk')     data.sort((a, b) => b.probability - a.probability);
    if (_sort === 'expiry')   data.sort((a, b) => (a.endDate || '').localeCompare(b.endDate || ''));
    if (_sort === 'activity') data.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));

    _filtered = data;

    const shown = document.getElementById('pdc-s-shown');
    if (shown) shown.textContent = data.length;

    if (!data.length) {
      list.innerHTML = `<div class="pdc-empty">No markets match — try a different filter</div>`;
      return;
    }
    list.innerHTML = data.map(_card).join('');
  }

  // ── Bind events ────────────────────────────────────────────────────────────
  function _bindEvents(el) {
    // Category pills
    el.querySelectorAll('.pdc-cpill').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.pdc-cpill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _category = btn.dataset.cat;
        _render();
      });
    });

    // Sort buttons
    el.querySelectorAll('.pdc-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.pdc-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _sort = btn.dataset.sort;
        _render();
      });
    });

    // Search
    const searchEl = document.getElementById('pdc-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        _search = searchEl.value.toLowerCase().trim();
        _render();
      });
    }

    // Refresh button
    document.getElementById('pdc-refresh-btn')?.addEventListener('click', () => load(true));
  }

  // ── Fetch from API ─────────────────────────────────────────────────────────
  async function load(force = false) {
    if (_loading) return;
    _loading = true;

    const list  = document.getElementById('pdc-list');
    const badge = document.getElementById('pdc-live-badge');
    if (list) list.innerHTML = '<div class="pdc-loading">⟳ FETCHING POLYMARKET DATA…</div>';
    if (badge) { badge.textContent = '● LOADING'; badge.style.color = '#ffaa00'; }

    try {
      const url = force ? '/api/predico?flush=1' : '/api/predico';
      const r   = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d   = await r.json();

      _markets = d.markets || [];

      // Update stats
      const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      setEl('pdc-s-total',    _markets.length);
      setEl('pdc-s-vol',      _fmtVol(d.totalVolume || 0));
      setEl('pdc-s-highrisk', d.highRisk || 0);
      _updateDial(d.warRiskScore || 50);

      if (badge) {
        const stale = d.stale ? ' (CACHED)' : '';
        badge.textContent = `● LIVE${stale}`;
        badge.style.color  = d.stale ? '#ffaa00' : '#00ff88';
        badge.style.background = d.stale ? 'rgba(255,170,0,.15)' : 'rgba(0,255,136,.15)';
      }

      _render();
    } catch (err) {
      const list = document.getElementById('pdc-list');
      if (list) list.innerHTML = `<div class="pdc-error">⚠ ${err.message} — Polymarket API unreachable</div>`;
      const badge = document.getElementById('pdc-live-badge');
      if (badge) { badge.textContent = '● ERROR'; badge.style.color = '#ff4444'; }
    } finally {
      _loading = false;
    }
  }

  // ── Public init ────────────────────────────────────────────────────────────
  function init() {
    const el = document.getElementById('rptab-predico');
    if (!el || _inited) return;
    _inited = true;

    _injectCSS();
    el.innerHTML = _shell();
    _bindEvents(el);
    load();

    // Refresh every 10 minutes
    _refreshTmr = setInterval(() => {
      if (document.getElementById('rptab-predico')?.style.display !== 'none') load();
    }, 10 * 60_000);
  }

  return { init, load, getMarkets: () => _filtered };
})();
