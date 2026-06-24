/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — Thrill Dashboard
   Bottom situational awareness panels: Force Posture · Infrastructure ·
   Escalation · Economic Warfare · Disaster Cascade
   Data: Reuters · AP · Al Jazeera · BBC · ACLED · GDELT · OCHA · OSINT
════════════════════════════════════════════════════════════════════════════ */
const THRILL_DASH = (() => {
  let _open  = false;
  let _timer = null;
  let _cache = { data: null, ts: 0 };
  const TTL  = 5 * 60_000; // 5 min

  const PANELS = [
    { id:'force',   label:'FORCE POSTURE',       icon:'⬡', color:'#ff4444' },
    { id:'infra',   label:'INFRASTRUCTURE',       icon:'⚡', color:'#ffcc00' },
    { id:'escal',   label:'ESCALATION MONITOR',   icon:'🔺', color:'#ff8800' },
    { id:'econ',    label:'ECONOMIC WARFARE',      icon:'💰', color:'#00cc88' },
    { id:'disaster',label:'DISASTER CASCADE',      icon:'🌊', color:'#4488ff' },
  ];

  // ── Keyword classifiers ──────────────────────────────────────────────────
  const _CLASSIFY = [
    { panel:'force',    rx:/\b(military|troops|forces|army|navy|warship|aircraft carrier|missile|strike|bombing|NATO|exercise|deployment|warhead|nuclear alert|DEFCON|mobilization|conscription|invasion|frontline|offensive|ceasefire breach)\b/i },
    { panel:'infra',    rx:/\b(pipeline|power grid|blackout|cyberattack|infrastructure|sabotage|undersea cable|dam|bridge|port|railroad|hack|disruption|outage|energy|electricity|water supply|nuclear plant)\b/i },
    { panel:'escal',    rx:/\b(escalat|conflict|war|attack|battle|airstrike|rocket|shelling|casualties|killed|wounded|explosion|IED|drone strike|assassination|coup|uprising|protest|riot|civil war|genocide)\b/i },
    { panel:'econ',     rx:/\b(sanction|tariff|trade war|export ban|import|embargo|currency|inflation|recession|default|debt|oil price|SWIFT|freeze assets|seize|confiscate|economic|GDP|supply chain|shortage)\b/i },
    { panel:'disaster', rx:/\b(earthquake|tsunami|hurricane|typhoon|flood|wildfire|volcano|cyclone|drought|famine|epidemic|outbreak|disease|COVID|pandemic|disaster|emergency|humanitarian|refugee|displacement)\b/i },
  ];

  function _classify(title, desc) {
    const text = (title + ' ' + desc).toLowerCase();
    for (const rule of _CLASSIFY) {
      if (rule.rx.test(text)) return rule.panel;
    }
    return 'force'; // default bucket
  }

  // ── Fetch from geopolitical tracker feed ────────────────────────────────
  async function _fetch() {
    const now = Date.now();
    if (_cache.data && now - _cache.ts < TTL) return _cache.data;

    try {
      const resp = await fetch('/api/geopolitical-tracker', { signal: AbortSignal.timeout(15_000) });
      if (!resp.ok) throw new Error(resp.status);
      const json = await resp.json();
      _cache = { data: json, ts: now };
      return json;
    } catch (e) {
      return _cache.data || null;
    }
  }

  // ── Render a single panel column ─────────────────────────────────────────
  function _renderPanel(panelId, items, cfg) {
    const el = document.getElementById(`td-panel-${panelId}`);
    if (!el) return;
    const filtered = items.filter(it => _classify(it.title || '', it.desc || '') === panelId);
    const count = filtered.length;

    // Update count badge
    const badge = document.getElementById(`td-badge-${panelId}`);
    if (badge) badge.textContent = count;

    if (count === 0) {
      el.innerHTML = `<div class="td-empty">No active signals detected</div>`;
      return;
    }

    el.innerHTML = filtered.slice(0, 8).map(it => {
      const ago = _timeAgo(it.pubDate);
      const src = it.source ? `<span class="td-src">${it.source}</span>` : '';
      const geo = it.geo ? `<span class="td-geo">📍 ${it.geo}</span>` : '';
      return `<div class="td-item" onclick="THRILL_DASH.openItem(this)" data-url="${it.link || '#'}">
        <div class="td-item-title">${_esc(it.title || 'Untitled')}</div>
        <div class="td-item-meta">${src}${geo}<span class="td-ago">${ago}</span></div>
      </div>`;
    }).join('');
  }

  function _timeAgo(dateStr) {
    if (!dateStr) return '';
    const ms = Date.now() - new Date(dateStr).getTime();
    if (isNaN(ms)) return '';
    const m = Math.floor(ms / 60_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function _esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Render summits strip ─────────────────────────────────────────────────
  function _renderSummits(summits) {
    const el = document.getElementById('td-summits-strip');
    if (!el || !summits) return;
    el.innerHTML = summits.slice(0, 6).map(s => `
      <div class="td-summit">
        <span class="td-summit-flag">${s.flags || ''}</span>
        <div class="td-summit-info">
          <div class="td-summit-name">${_esc(s.name)}</div>
          <div class="td-summit-date">${s.date} · ${s.location || ''}</div>
        </div>
      </div>`).join('');
  }

  // ── Full refresh ─────────────────────────────────────────────────────────
  async function _refresh() {
    const el = document.getElementById('td-status');
    if (el) el.textContent = '⟳ Updating…';

    const data = await _fetch();
    if (!data) {
      if (el) el.textContent = '⚠ Feed unavailable';
      return;
    }

    const items = data.items || [];
    PANELS.forEach(p => _renderPanel(p.id, items, p));
    _renderSummits(data.summits);

    // Total signal count
    const total = document.getElementById('td-total');
    if (total) total.textContent = items.length + ' signals';
    if (el) el.textContent = 'Updated ' + new Date().toUTCString().slice(17, 22) + ' UTC';
  }

  // ── Open/close ───────────────────────────────────────────────────────────
  function _setOpen(on) {
    _open = on;
    const panel = document.getElementById('thrill-dash');
    const btn   = document.getElementById('thrill-dash-btn');
    if (panel) panel.classList.toggle('open', on);
    if (btn)   btn.classList.toggle('active', on);
    if (on) {
      _refresh();
      if (!_timer) _timer = setInterval(_refresh, TTL);
    } else {
      clearInterval(_timer);
      _timer = null;
    }
  }

  // ── CSS injection ────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('td-css')) return;
    const s = document.createElement('style');
    s.id = 'td-css';
    s.textContent = `
      #thrill-dash{
        position:fixed;bottom:0;left:0;right:0;
        height:0;overflow:hidden;
        background:#050e1a;
        border-top:1px solid #0d2035;
        transition:height .3s ease;
        z-index:2100;
        font-family:'Courier New',monospace;
      }
      #thrill-dash.open{ height:300px; }

      #td-header{
        display:flex;align-items:center;gap:10px;
        padding:6px 12px;background:#07111e;
        border-bottom:1px solid #0d2035;
        height:32px;box-sizing:border-box;
      }
      #td-header-title{
        font-size:9px;font-weight:700;color:#00ff88;letter-spacing:1px;
      }
      #td-total{ font-size:7.5px;color:#3d5a78;margin-left:6px; }
      #td-status{ font-size:7px;color:#3d5a78;margin-left:auto; }
      #td-refresh-btn,#td-close-btn{
        font-size:8px;color:#3d5a78;background:none;border:none;
        cursor:pointer;padding:2px 6px;margin-left:4px;
        border:1px solid #0d2035;border-radius:2px;
      }
      #td-refresh-btn:hover,#td-close-btn:hover{ color:#00ff88;border-color:#00ff88; }

      #td-summits-strip{
        display:flex;gap:8px;padding:5px 12px;
        background:#060f1c;border-bottom:1px solid #0a1a2c;
        overflow-x:auto;flex-wrap:nowrap;
        height:38px;box-sizing:border-box;align-items:center;
      }
      .td-summit{
        display:flex;align-items:center;gap:5px;
        background:#0a1827;border:1px solid #0d2035;border-radius:3px;
        padding:3px 8px;white-space:nowrap;flex-shrink:0;
      }
      .td-summit-flag{ font-size:12px; }
      .td-summit-name{ font-size:7px;font-weight:700;color:#c8dff0; }
      .td-summit-date{ font-size:6px;color:#3d5a78; }

      #td-columns{
        display:flex;gap:0;height:calc(300px - 32px - 38px);
        overflow:hidden;
      }
      .td-col{
        flex:1;border-right:1px solid #0a1827;
        display:flex;flex-direction:column;overflow:hidden;
      }
      .td-col:last-child{ border-right:none; }
      .td-col-hdr{
        display:flex;align-items:center;gap:5px;
        padding:4px 8px;background:#070f1c;
        border-bottom:1px solid #0a1827;flex-shrink:0;
      }
      .td-col-icon{ font-size:10px; }
      .td-col-label{ font-size:7px;font-weight:700;color:#c8dff0;letter-spacing:.5px;flex:1; }
      .td-col-badge{
        font-size:7px;font-weight:700;
        padding:1px 5px;border-radius:8px;
        background:#0a1827;color:#3d5a78;
      }
      .td-col-body{
        flex:1;overflow-y:auto;padding:4px 0;
      }
      .td-item{
        padding:4px 8px;border-bottom:1px solid #07111e;
        cursor:pointer;transition:background .15s;
      }
      .td-item:hover{ background:#0a1827; }
      .td-item-title{ font-size:7.5px;color:#c8dff0;line-height:1.3;margin-bottom:2px; }
      .td-item-meta{ display:flex;gap:6px;align-items:center;flex-wrap:wrap; }
      .td-src{ font-size:6px;color:#3d5a78;background:#060d15;padding:1px 4px;border-radius:2px; }
      .td-geo{ font-size:6px;color:#4488ff; }
      .td-ago{ font-size:6px;color:#3d5a78;margin-left:auto; }
      .td-empty{ font-size:7.5px;color:#3d5a78;padding:12px 8px;text-align:center; }

      #thrill-dash-btn.active{ background:#00ff8822;color:#00ff88;border-color:#00ff8888; }
    `;
    document.head.appendChild(s);
  }

  // ── Wire up buttons ──────────────────────────────────────────────────────
  function _bindUI() {
    const openBtn    = document.getElementById('thrill-dash-btn');
    const closeBtn   = document.getElementById('td-close-btn');
    const refreshBtn = document.getElementById('td-refresh-btn');
    if (openBtn)    openBtn.addEventListener('click', () => _setOpen(!_open));
    if (closeBtn)   closeBtn.addEventListener('click', () => _setOpen(false));
    if (refreshBtn) refreshBtn.addEventListener('click', () => { _cache.ts = 0; _refresh(); });
  }

  return {
    init() {
      _injectCSS();
      _bindUI();
    },
    toggle() { _setOpen(!_open); },
    openItem(el) {
      const url = el?.dataset?.url;
      if (url && url !== '#') window.open(url, '_blank', 'noopener');
    },
    refresh() { _cache.ts = 0; _refresh(); },
    isOpen() { return _open; },
  };
})();
