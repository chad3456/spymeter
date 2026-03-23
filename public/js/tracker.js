/* ── SPYMETER — India Defence Deal Tracker ──────────────────────────────────
   Kanban board tracking Indian defence procurement deals by lifecycle stage.
   Sources: ANI · Swarajya · NDTV · ORF · WIRED · Livefist · The Print
            + Nitter: Abhijeet Iyer-Mitra · ANI · Sidhant Sibal · Ajai Shukla
            + Substacks: Geopolitics India · Aircraft Journey · OSINT India
   Refresh: 15 minutes                                                       */

const TRACKER = (() => {

  // ── Stage metadata ─────────────────────────────────────────────────────────
  const STAGES = [
    { id: 'concept',    label: 'CONCEPT',    icon: '💡', color: '#7c5cfc', desc: 'RFI · EOI · AoN · Feasibility' },
    { id: 'planned',    label: 'PLANNED',    icon: '📋', color: '#3399ff', desc: 'RFP · DAC Approval · Budget' },
    { id: 'trials',     label: 'TRIALS',     icon: '🧪', color: '#ff9900', desc: 'Field Trials · User Evaluation' },
    { id: 'prototype',  label: 'PROTOTYPE',  icon: '⚙️',  color: '#ff6600', desc: 'First Flight · Demonstrator' },
    { id: 'contract',   label: 'CONTRACT',   icon: '✍️',  color: '#ff3366', desc: 'Signed · Awarded · MoU' },
    { id: 'production', label: 'PRODUCTION', icon: '🏭', color: '#00cc88', desc: 'Manufacturing · Deliveries' },
    { id: 'inducted',   label: 'INDUCTED',   icon: '✅', color: '#00ff88', desc: 'Commissioned · In Service' },
  ];

  // ── Domain metadata ────────────────────────────────────────────────────────
  const DOMAINS = [
    { id: 'all',         label: 'ALL',         icon: '🌐' },
    { id: 'air',         label: 'AIR FORCE',   icon: '✈️' },
    { id: 'naval',       label: 'NAVAL',       icon: '⚓' },
    { id: 'army',        label: 'ARMY',        icon: '🪖' },
    { id: 'missiles',    label: 'MISSILES',    icon: '🚀' },
    { id: 'space',       label: 'SPACE',       icon: '🛸' },
    { id: 'cyber',       label: 'CYBER / EW',  icon: '🛡' },
    { id: 'electronics', label: 'ELECTRONICS', icon: '📡' },
    { id: 'general',     label: 'GENERAL',     icon: '📰' },
  ];

  const SOURCE_TYPE = {
    rss:    { icon: '📰', badge: 'RSS' },
    social: { icon: '🐦', badge: 'SOCIAL' },
  };

  let _items      = [];
  let _domain     = 'all';
  let _view       = 'kanban'; // 'kanban' | 'list'
  let _timer      = null;
  let _lastLoaded = 0;

  // ── Public init ───────────────────────────────────────────────────────────
  function init() {
    _renderShell();
    load();
    _timer = setInterval(load, 15 * 60_000);
  }

  // ── Render static shell ───────────────────────────────────────────────────
  function _renderShell() {
    const el = document.getElementById('rptab-tracker');
    if (!el) return;
    el.innerHTML = `
      <!-- Header bar -->
      <div class="trk-header">
        <div class="trk-title-row">
          <span class="trk-flag">🇮🇳</span>
          <span class="trk-title">INDIA DEFENCE DEAL TRACKER</span>
          <span class="badge-live" style="margin-left:6px">● LIVE</span>
          <div class="trk-view-sw">
            <button class="trk-vsw active" id="trk-vsw-kanban" onclick="TRACKER.setView('kanban')">⬡ BOARD</button>
            <button class="trk-vsw"        id="trk-vsw-list"   onclick="TRACKER.setView('list')">☰ LIST</button>
          </div>
          <button class="mini-btn" onclick="TRACKER.load(true)" style="margin-left:6px" title="Refresh">↻</button>
        </div>

        <!-- Domain filter pills -->
        <div class="trk-domain-row" id="trk-domain-row">
          ${DOMAINS.map(d => `
            <button class="trk-dpill ${d.id === 'all' ? 'active' : ''}"
              data-dom="${d.id}" onclick="TRACKER.setDomain('${d.id}',this)">
              ${d.icon} ${d.label}
            </button>`).join('')}
        </div>

        <!-- Stats bar -->
        <div class="trk-stats-bar" id="trk-stats-bar">
          ${STAGES.map(s => `
            <div class="trk-stat-cell" id="trk-stat-${s.id}" onclick="TRACKER.highlightStage('${s.id}')">
              <div class="trk-stat-val" style="color:${s.color}">—</div>
              <div class="trk-stat-lbl">${s.label}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Sources legend -->
      <div class="trk-sources-strip" id="trk-sources-strip">
        <span style="color:#3d5a78;font-size:7px;letter-spacing:1px">SOURCES:</span>
        <span class="trk-src-badge">ANI</span>
        <span class="trk-src-badge">Swarajya</span>
        <span class="trk-src-badge">NDTV</span>
        <span class="trk-src-badge">ORF Online</span>
        <span class="trk-src-badge">WIRED</span>
        <span class="trk-src-badge">The Print</span>
        <span class="trk-src-badge">Livefist</span>
        <span class="trk-src-badge">FE Defence</span>
        <span class="trk-src-badge" style="background:rgba(29,161,242,.15);color:#1da1f2">@ANI</span>
        <span class="trk-src-badge" style="background:rgba(29,161,242,.15);color:#1da1f2">@Iyervval</span>
        <span class="trk-src-badge" style="background:rgba(29,161,242,.15);color:#1da1f2">@sidhant</span>
        <span class="trk-src-badge" style="background:rgba(29,161,242,.15);color:#1da1f2">@ajaishukla</span>
        <span class="trk-src-badge" style="background:rgba(29,161,242,.15);color:#1da1f2">@LiveFist</span>
        <span class="trk-src-badge" style="background:rgba(138,43,226,.15);color:#a855f7">Substacks</span>
      </div>

      <!-- Kanban board -->
      <div class="trk-board" id="trk-board">
        ${STAGES.map(s => `
          <div class="trk-col" id="trk-col-${s.id}" data-stage="${s.id}">
            <div class="trk-col-hdr" style="border-top-color:${s.color}">
              <span class="trk-col-icon">${s.icon}</span>
              <span class="trk-col-name" style="color:${s.color}">${s.label}</span>
              <span class="trk-col-count badge-static" id="trk-cnt-${s.id}">0</span>
            </div>
            <div class="trk-col-desc">${s.desc}</div>
            <div class="trk-col-cards" id="trk-cards-${s.id}">
              <div class="trk-loading">⟳ Loading…</div>
            </div>
          </div>`).join('')}
      </div>

      <!-- List view (hidden by default) -->
      <div class="trk-list-view" id="trk-list-view" style="display:none">
        <div id="trk-list-items" class="scroll-list" style="height:calc(100vh - 230px);overflow-y:auto;padding:6px"></div>
      </div>

      <!-- Loading overlay -->
      <div class="trk-overlay" id="trk-overlay" style="display:none">
        <div class="trk-loading-box">⟳ Fetching deal data from 10+ sources…</div>
      </div>
    `;
  }

  // ── Load data ─────────────────────────────────────────────────────────────
  async function load(force = false) {
    const now = Date.now();
    if (!force && now - _lastLoaded < 60_000) return;
    _lastLoaded = now;
    const overlay = document.getElementById('trk-overlay');
    if (overlay) overlay.style.display = 'flex';
    try {
      const r = await fetch('/api/tracker');
      const d = await r.json();
      _items = d.items || [];
      _renderAll(d);
    } catch (e) {
      _showError('Failed to load tracker data — check network.');
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  }

  // ── Render all views ──────────────────────────────────────────────────────
  function _renderAll(data) {
    _renderStats(data.byStage || {});
    _renderBoard();
    _renderList();
  }

  // ── Stats bar ─────────────────────────────────────────────────────────────
  function _renderStats(byStage) {
    for (const s of STAGES) {
      const el = document.getElementById(`trk-stat-${s.id}`);
      if (el) el.querySelector('.trk-stat-val').textContent = byStage[s.id] || 0;
    }
  }

  // ── Kanban board ─────────────────────────────────────────────────────────
  function _renderBoard() {
    const filtered = _domain === 'all' ? _items : _items.filter(it => it.domain === _domain);
    for (const s of STAGES) {
      const col   = filtered.filter(it => it.stage === s.id);
      const cntEl = document.getElementById(`trk-cnt-${s.id}`);
      if (cntEl) cntEl.textContent = col.length;
      const cardsEl = document.getElementById(`trk-cards-${s.id}`);
      if (!cardsEl) continue;
      cardsEl.innerHTML = col.length
        ? col.slice(0, 25).map(it => _cardHTML(it, s)).join('')
        : `<div class="trk-empty">No items in this stage</div>`;
    }
  }

  // ── Single card ───────────────────────────────────────────────────────────
  function _cardHTML(it, stage) {
    const srcType = SOURCE_TYPE[it.type] || SOURCE_TYPE.rss;
    const safeSrc = (it.source || '').replace(/</g, '&lt;');
    const safeT   = (it.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeD   = (it.desc  || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const ts      = it.pub ? _timeAgo(it.pub) : '';
    const domMeta = DOMAINS.find(d => d.id === it.domain) || DOMAINS[0];
    const confColor = it.confidence === 'high' ? '#00ff88' : it.confidence === 'low' ? '#ff8800' : '#aaa';
    return `
      <a class="trk-card" href="${it.url || '#'}" target="_blank" rel="noopener noreferrer">
        ${it.programme ? `<div class="trk-card-prog">${it.programme}</div>` : ''}
        <div class="trk-card-title">${safeT}</div>
        ${safeD ? `<div class="trk-card-desc">${safeD.slice(0, 110)}${safeD.length > 110 ? '…' : ''}</div>` : ''}
        <div class="trk-card-footer">
          <span class="trk-card-dom" style="color:${_domColor(it.domain)}">${domMeta.icon} ${domMeta.label}</span>
          <span class="trk-card-src">${srcType.icon} ${safeSrc}</span>
          ${ts ? `<span class="trk-card-ts">${ts}</span>` : ''}
        </div>
        <div class="trk-card-conf" style="border-left-color:${confColor}">
          <span style="color:${confColor}">${it.confidence || 'medium'}</span>
          <span class="trk-src-tag">${srcType.badge}</span>
        </div>
      </a>`;
  }

  // ── List view ─────────────────────────────────────────────────────────────
  function _renderList() {
    const el = document.getElementById('trk-list-items');
    if (!el) return;
    const filtered = _domain === 'all' ? _items : _items.filter(it => it.domain === _domain);
    if (!filtered.length) { el.innerHTML = '<div class="trk-empty">No items match filter.</div>'; return; }
    el.innerHTML = filtered.slice(0, 100).map(it => {
      const s = STAGES.find(s => s.id === it.stage) || STAGES[0];
      const safeSrc = (it.source || '').replace(/</g, '&lt;');
      const safeT   = (it.title  || '').replace(/</g, '&lt;');
      const ts      = it.pub ? _timeAgo(it.pub) : '';
      const srcType = SOURCE_TYPE[it.type] || SOURCE_TYPE.rss;
      return `
        <a class="trk-list-item" href="${it.url || '#'}" target="_blank" rel="noopener noreferrer">
          <div class="trk-li-stage" style="color:${s.color};border-color:${s.color}">${s.icon} ${s.label}</div>
          <div class="trk-li-body">
            ${it.programme ? `<span class="trk-li-prog">[${it.programme}]</span>` : ''}
            <span class="trk-li-title">${safeT}</span>
          </div>
          <div class="trk-li-meta">
            <span>${srcType.icon} ${safeSrc}</span>
            ${ts ? `<span class="trk-card-ts">${ts}</span>` : ''}
          </div>
        </a>`;
    }).join('');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _domColor(domain) {
    const map = { air:'#00d4ff', naval:'#4488ff', army:'#00cc88', missiles:'#ff6600', space:'#9b59ff', cyber:'#ff3366', electronics:'#ffaa00', general:'#888' };
    return map[domain] || '#888';
  }

  function _timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return '';
    const m = Math.floor(diff / 60_000);
    if (m < 1)   return 'now';
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function _showError(msg) {
    for (const s of STAGES) {
      const el = document.getElementById(`trk-cards-${s.id}`);
      if (el) el.innerHTML = `<div class="trk-empty" style="color:#ff4444">${msg}</div>`;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function setDomain(dom, btn) {
    _domain = dom;
    document.querySelectorAll('.trk-dpill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    _renderBoard();
    _renderList();
  }

  function setView(v) {
    _view = v;
    const board = document.getElementById('trk-board');
    const list  = document.getElementById('trk-list-view');
    if (board) board.style.display = v === 'kanban' ? 'flex'  : 'none';
    if (list)  list.style.display  = v === 'list'   ? 'block' : 'none';
    document.getElementById('trk-vsw-kanban')?.classList.toggle('active', v === 'kanban');
    document.getElementById('trk-vsw-list')?.classList.toggle('active',   v === 'list');
  }

  function highlightStage(stageId) {
    document.querySelectorAll('.trk-col').forEach(c => {
      c.style.opacity = c.dataset.stage === stageId ? '1' : '0.35';
    });
    setTimeout(() => {
      document.querySelectorAll('.trk-col').forEach(c => c.style.opacity = '1');
    }, 2000);
  }

  return { init, load, setDomain, setView, highlightStage };
})();
