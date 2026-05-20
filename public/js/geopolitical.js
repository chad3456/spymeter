/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — Geopolitical Intel Tracker
   Aggregates: Reuters · BBC · Al Jazeera · The Guardian · DW · France 24 (global)
               The Hindu · Dawn · Daily Sabah · ABC Australia · Korea Herald ·
               Japan Today · CNA Singapore · Punch Nigeria (local/regional)
   Tracks: Defence deals · Trade agreements · World summits · Leader tours · Diplomatic
════════════════════════════════════════════════════════════════════════════ */
const GEO_TRACKER = (() => {
  let _open  = false;
  let _data  = null;
  let _cat   = 'ALL';
  let _timer = null;

  const CAT = {
    ALL:         { color:'#c8dff0', icon:'◈',  label:'All'          },
    DEFENCE:     { color:'#ff4444', icon:'⚔',  label:'Defence'      },
    TRADE:       { color:'#ffcc00', icon:'💹', label:'Trade'        },
    SUMMIT:      { color:'#00ccff', icon:'🌐', label:'Summits'      },
    LEADER_TOUR: { color:'#00ff88', icon:'👤', label:'Leader Tour'  },
    DIPLOMATIC:  { color:'#cc88ff', icon:'◈',  label:'Diplomatic'   },
  };

  // ── Fetch ──────────────────────────────────────────────────────────────────
  async function _fetch() {
    const feedEl = document.getElementById('geo-feed-list');
    if (feedEl) feedEl.innerHTML = '<div class="geo-loading">⟳ Fetching intelligence from 14 sources…</div>';
    try {
      const r = await fetch('/api/geopolitical-tracker');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      _data = await r.json();
      _render();
    } catch(e) {
      if (feedEl) feedEl.innerHTML = `<div class="geo-error">⚠ Feed error: ${e.message}. Server may still be starting.</div>`;
    }
  }

  // ── Full render ────────────────────────────────────────────────────────────
  function _render() {
    if (!_data) return;
    _renderSummits();
    _renderSourceStrip();
    _renderFeed();
    _updateCounts();
    const tsEl = document.getElementById('geo-ts');
    if (tsEl && _data.ts) {
      const d = new Date(_data.ts);
      tsEl.textContent = d.toUTCString().slice(17, 25) + ' UTC · ' + (_data.total || 0) + ' articles';
    }
  }

  // ── Tab counts ─────────────────────────────────────────────────────────────
  function _updateCounts() {
    if (!_data) return;
    const c   = _data.counts || {};
    const tot = Object.values(c).reduce((a, b) => a + b, 0);
    const allEl = document.getElementById('gct-ALL');
    if (allEl) allEl.textContent = tot;
    ['DEFENCE','TRADE','SUMMIT','LEADER_TOUR','DIPLOMATIC'].forEach(cat => {
      const el = document.getElementById('gct-' + cat);
      if (el) el.textContent = c[cat] || 0;
    });
  }

  // ── Summits column ─────────────────────────────────────────────────────────
  function _renderSummits() {
    const el = document.getElementById('geo-summits-list');
    if (!el || !_data.summits) return;
    el.innerHTML = _data.summits.map(s => `
      <div class="geo-summit-card">
        <div class="geo-sc-date">${s.date}</div>
        <div class="geo-sc-title">${s.title}</div>
        <div class="geo-sc-loc">📍 ${s.location}</div>
        <div class="geo-sc-note">${s.note}</div>
      </div>
    `).join('');
  }

  // ── Source pills strip ─────────────────────────────────────────────────────
  function _renderSourceStrip() {
    const el = document.getElementById('geo-source-strip');
    if (!el || !_data.sources) return;
    el.innerHTML = _data.sources.map(s => {
      const ok    = s.status === 'ok';
      const cls   = ok ? s.type : 'error';
      const count = ok ? ` (${s.matched})` : ' ✗';
      return `<span class="geo-src-pill ${cls}" title="${s.region} — ${ok ? s.matched + ' matched' : 'feed failed'}">${s.flag} ${s.name}${count}</span>`;
    }).join('');
  }

  // ── News feed cards ────────────────────────────────────────────────────────
  function _renderFeed() {
    const el = document.getElementById('geo-feed-list');
    if (!el || !_data.items) return;
    const items = _cat === 'ALL'
      ? _data.items
      : _data.items.filter(i => i.category === _cat);

    if (!items.length) {
      el.innerHTML = '<div class="geo-empty">No items matched for this category yet. Try ALL or refresh.</div>';
      return;
    }
    el.innerHTML = items.map(item => {
      const cfg    = CAT[item.category] || CAT.DIPLOMATIC;
      const timeStr = _relTime(item.pubDate);
      const desc   = item.description ? item.description.replace(/</g,'&lt;').slice(0, 140) : '';
      return `<a class="geo-card" href="${item.link || '#'}" target="_blank" rel="noopener noreferrer"
               style="border-top:2px solid ${cfg.color}">
        <div class="geo-card-top">
          <span class="geo-card-cat" style="color:${cfg.color};border-color:${cfg.color}55">${cfg.icon} ${cfg.label.toUpperCase()}</span>
          <span class="geo-card-src">${item.flag} ${item.source}</span>
        </div>
        <div class="geo-card-title">${item.title.replace(/</g,'&lt;')}</div>
        ${desc ? `<div class="geo-card-desc">${desc}…</div>` : ''}
        <div class="geo-card-foot">
          <span class="geo-card-region">${item.region}</span>
          ${timeStr ? `<span class="geo-card-time">${timeStr}</span>` : ''}
        </div>
      </a>`;
    }).join('');
  }

  function _relTime(iso) {
    if (!iso) return '';
    try {
      const diff = Date.now() - new Date(iso).getTime();
      if (isNaN(diff) || diff < 0) return '';
      const h = Math.floor(diff / 3600000);
      if (h < 1)  return Math.floor(diff / 60000) + 'm ago';
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    } catch(_) { return ''; }
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('geo-css')) return;
    const s = document.createElement('style');
    s.id = 'geo-css';
    s.textContent = `
      /* ── Panel shell ── */
      #geo-panel {
        position:fixed; bottom:0; left:0; right:0; z-index:2000;
        height:0; overflow:hidden;
        transition:height .3s cubic-bezier(.4,0,.2,1);
        background:#030508;
        border-top:2px solid #0d2035;
        font-family:'Courier New',monospace;
        display:flex; flex-direction:column;
      }
      #geo-panel.open { height:360px; }

      /* ── Header bar ── */
      #geo-hdr {
        display:flex; align-items:center; gap:8px;
        padding:0 12px; height:38px; flex-shrink:0;
        background:#040a14; border-bottom:1px solid #0d1e2e;
        overflow:hidden;
      }
      #geo-hdr-left { display:flex; align-items:center; gap:7px; flex-shrink:0; min-width:0; }
      #geo-title    { font-size:9px; font-weight:700; color:#c8dff0; letter-spacing:.8px; white-space:nowrap; }
      .geo-live-dot { width:6px; height:6px; border-radius:50%; background:#00ff88;
                      box-shadow:0 0 5px #00ff88; animation:geo-blink 2s ease-in-out infinite; flex-shrink:0; }
      @keyframes geo-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
      #geo-src-info { font-size:7px; color:#3d5a78; white-space:nowrap; }

      /* ── Category tabs ── */
      #geo-tabs { display:flex; gap:2px; flex:1; overflow-x:auto; scrollbar-width:none; padding:0 4px; }
      #geo-tabs::-webkit-scrollbar { display:none; }
      .geo-tab {
        flex-shrink:0; padding:3px 9px; font-size:7.5px; font-weight:700;
        letter-spacing:.4px; border:1px solid #0d1e2e; background:transparent;
        color:#5a7a9a; cursor:pointer; border-radius:2px;
        font-family:'Courier New',monospace; transition:all .15s; white-space:nowrap;
      }
      .geo-tab:hover { color:#c8dff0; border-color:#3d5a78; }
      .geo-tab.active { color:#00ff88; border-color:rgba(0,255,136,.4); background:rgba(0,255,136,.06); }
      .geo-ct { margin-left:5px; font-size:6.5px; color:#3d5a78; background:#0d1e2e; padding:0 3px; border-radius:2px; }
      .geo-tab.active .geo-ct { color:#00ff88; background:rgba(0,255,136,.12); }

      /* ── Header right ── */
      #geo-hdr-right { display:flex; align-items:center; gap:6px; flex-shrink:0; }
      #geo-ts { font-size:6.5px; color:#3d5a78; white-space:nowrap; }
      .geo-ctrl {
        padding:2px 8px; font-size:7px; font-weight:700; letter-spacing:.3px;
        border:1px solid #1a2e42; background:transparent; color:#5a7a9a;
        cursor:pointer; border-radius:2px; font-family:'Courier New',monospace; transition:all .15s;
      }
      .geo-ctrl:hover      { color:#00ff88; border-color:rgba(0,255,136,.4); }
      #geo-close-btn:hover { color:#ff4444; border-color:rgba(255,68,68,.4); }

      /* ── Body layout ── */
      #geo-body { display:flex; flex:1; overflow:hidden; min-height:0; }

      /* ── Summits left column ── */
      #geo-summits-panel {
        width:260px; flex-shrink:0; border-right:1px solid #0d1e2e;
        display:flex; flex-direction:column; overflow:hidden;
      }
      #geo-feed-panel { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }

      .geo-sub-hdr {
        font-size:7px; font-weight:700; letter-spacing:.6px; color:#3d5a78;
        padding:4px 10px; background:#040810; border-bottom:1px solid #0d1e2e;
        flex-shrink:0; white-space:nowrap;
      }

      #geo-summits-list {
        overflow-y:auto; flex:1; padding:5px;
        scrollbar-width:thin; scrollbar-color:#0d1e2e transparent;
      }
      .geo-summit-card {
        padding:6px 8px; margin-bottom:4px;
        border:1px solid #1a3a5c; border-left:3px solid #00ccff;
        border-radius:2px; background:rgba(0,204,255,.04);
      }
      .geo-sc-date  { font-size:6.5px; color:#00ccff; font-weight:700; letter-spacing:.3px; margin-bottom:2px; }
      .geo-sc-title { font-size:8px; font-weight:700; color:#c8dff0; margin-bottom:2px; line-height:1.3; }
      .geo-sc-loc   { font-size:7px; color:#5a7a9a; margin-bottom:2px; }
      .geo-sc-note  { font-size:6.5px; color:#3d5a78; line-height:1.3; }

      /* ── Source strip ── */
      #geo-source-strip {
        display:flex; gap:4px; flex-wrap:wrap; padding:4px 10px;
        border-bottom:1px solid #0d1e2e; background:#030508; flex-shrink:0;
        max-height:48px; overflow:hidden;
      }
      .geo-src-pill {
        font-size:6.5px; padding:1px 6px; border-radius:10px;
        border:1px solid #0d1e2e; color:#5a7a9a; cursor:default; white-space:nowrap;
      }
      .geo-src-pill.global { border-color:rgba(68,136,255,.4); color:#4488ff; background:rgba(68,136,255,.06); }
      .geo-src-pill.local  { border-color:rgba(0,255,136,.35); color:#00cc66; background:rgba(0,255,136,.05); }
      .geo-src-pill.error  { border-color:rgba(255,68,68,.3); color:#ff4444; background:rgba(255,68,68,.05); opacity:.6; }

      /* ── Feed horizontal scroll ── */
      #geo-feed-list {
        display:flex; gap:9px; padding:8px 10px;
        overflow-x:auto; flex:1; align-items:flex-start;
        scrollbar-width:thin; scrollbar-color:#1a2e42 transparent;
      }
      #geo-feed-list::-webkit-scrollbar { height:4px; }
      #geo-feed-list::-webkit-scrollbar-track { background:transparent; }
      #geo-feed-list::-webkit-scrollbar-thumb { background:#1a2e42; border-radius:2px; }

      /* ── Cards ── */
      .geo-card {
        flex-shrink:0; width:230px; padding:8px 9px;
        border:1px solid #0d1e2e; border-radius:3px; background:#040a14;
        text-decoration:none; color:inherit;
        display:flex; flex-direction:column; transition:background .15s, border-color .15s;
        cursor:pointer;
      }
      .geo-card:hover { background:#071424; border-color:#1a3a5c; }
      .geo-card-top {
        display:flex; align-items:center; justify-content:space-between;
        margin-bottom:5px; gap:4px;
      }
      .geo-card-cat {
        font-size:6.5px; font-weight:700; letter-spacing:.4px;
        padding:1px 5px; border:1px solid; border-radius:2px;
        white-space:nowrap; flex-shrink:0;
      }
      .geo-card-src { font-size:6.5px; color:#3d5a78; text-align:right; flex:1; overflow:hidden;
                      text-overflow:ellipsis; white-space:nowrap; }
      .geo-card-title {
        font-size:8px; color:#c8dff0; line-height:1.35; margin-bottom:4px;
        display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
      }
      .geo-card-desc {
        font-size:7px; color:#5a7a9a; line-height:1.3; margin-bottom:4px;
        display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        flex:1;
      }
      .geo-card-foot {
        display:flex; justify-content:space-between; align-items:center; margin-top:auto;
      }
      .geo-card-region { font-size:6.5px; color:#3d5a78; }
      .geo-card-time   { font-size:6.5px; color:#1a3a5c; }

      /* ── States ── */
      .geo-loading { padding:24px 16px; color:#3d5a78; font-size:8px; text-align:center; flex-shrink:0; }
      .geo-error   { padding:24px 16px; color:#ff4444; font-size:8px; text-align:center; }
      .geo-empty   { padding:24px 16px; color:#3d5a78; font-size:8px; }

      /* ── Launch button active state ── */
      #geo-open-btn.active {
        color:#00ff88 !important;
        border-color:rgba(0,255,136,.35) !important;
        background:rgba(0,255,136,.07) !important;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  function _setOpen(on) {
    _open = on;
    const panel = document.getElementById('geo-panel');
    const btn   = document.getElementById('geo-open-btn');
    if (panel) panel.classList.toggle('open', on);
    if (btn)   btn.classList.toggle('active', on);
    if (on) {
      if (!_data) _fetch();
      if (!_timer) _timer = setInterval(_fetch, 900_000);
    } else {
      clearInterval(_timer);
      _timer = null;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init() {
      _injectCSS();
      document.querySelectorAll('.geo-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          _cat = btn.dataset.gcat;
          document.querySelectorAll('.geo-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _renderFeed();
        });
      });
      document.getElementById('geo-refresh-btn')?.addEventListener('click', _fetch);
      document.getElementById('geo-close-btn')?.addEventListener('click', () => _setOpen(false));
      document.getElementById('geo-open-btn')?.addEventListener('click',  () => _setOpen(!_open));
    },
    open()   { _setOpen(true);  },
    close()  { _setOpen(false); },
    toggle() { _setOpen(!_open); },
  };
})();
