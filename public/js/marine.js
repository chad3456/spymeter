/* ── SPYMETER — Real-Time Marine Activity Panel ─────────────────────────────
   WebSocket-powered AIS vessel tracker with country/type/region filtering.
   Sources: AISHub · VesselFinder · MyShipTracking (3-source triangulation)
   Coverage: Hormuz · Red Sea · Malacca · Suez · Arabian Sea · Bay of Bengal
             Indian Ocean · Andaman Sea · South China Sea · Persian Gulf
   Push interval: 30s via WebSocket                                          */

const MARINE_LIVE = (() => {

  // ── Vessel type registry ──────────────────────────────────────────────────
  const VTYPES = {
    naval:     { icon:'⚔️',  label:'NAVAL',     color:'#ff2244', pri:1 },
    carrier:   { icon:'✈️',  label:'CARRIER',   color:'#ff0000', pri:2 },
    tanker:    { icon:'🛢',  label:'TANKER',    color:'#ff9900', pri:3 },
    lng:       { icon:'🔵', label:'LNG',       color:'#00aaff', pri:4 },
    container: { icon:'📦', label:'CONTAINER', color:'#00d4ff', pri:5 },
    cargo:     { icon:'🚢', label:'CARGO',     color:'#00ff88', pri:6 },
    cable:     { icon:'🔌', label:'CABLE',     color:'#9b59ff', pri:7 },
    vessel:    { icon:'⚓', label:'VESSEL',    color:'#888888', pri:8 },
  };
  const vtInfo = t => VTYPES[t] || VTYPES.vessel;

  // ── Country filter registry ───────────────────────────────────────────────
  const COUNTRY_FILTERS = [
    { code:'ALL', label:'ALL',    emoji:'🌐', color:'#aaaaaa' },
    { code:'IN',  label:'INDIA',  emoji:'🇮🇳', color:'#ff9933' },
    { code:'IR',  label:'IRAN',   emoji:'🇮🇷', color:'#ff4400' },
    { code:'CN',  label:'CHINA',  emoji:'🇨🇳', color:'#ff4444' },
    { code:'RU',  label:'RUSSIA', emoji:'🇷🇺', color:'#4488ff' },
    { code:'US',  label:'USA',    emoji:'🇺🇸', color:'#6699ff' },
    { code:'NAVAL',label:'NAVAL', emoji:'⚔️',  color:'#ff2244' },
  ];

  // ── Region registry ───────────────────────────────────────────────────────
  const REGIONS = [
    { id:'all',          label:'ALL WATERS',        icon:'🌊' },
    { id:'indian',       label:'INDIA REGION',       icon:'🇮🇳' },
    { id:'hormuz',       label:'STRAIT HORMUZ',      icon:'🛢' },
    { id:'red_sea',      label:'RED SEA',            icon:'🔴' },
    { id:'malacca',      label:'MALACCA',            icon:'⚓' },
    { id:'south_china',  label:'S. CHINA SEA',       icon:'🇨🇳' },
    { id:'persian',      label:'PERSIAN GULF',       icon:'☪️' },
  ];

  let _vessels     = [];
  let _filtered    = [];
  let _countryCode = 'ALL';
  let _typeFilter  = 'ALL';
  let _regionId    = 'all';
  let _wsConnected = false;
  let _lastTs      = 0;
  let _sortBy      = 'severity'; // 'severity' | 'speed' | 'name' | 'country'
  let _mapEmbed    = false;
  let _initialized = false;

  // ── Public init ───────────────────────────────────────────────────────────
  function init() {
    if (_initialized) return;
    _initialized = true;
    _buildShell();
    _load();
  }

  // ── Build static shell HTML ───────────────────────────────────────────────
  function _buildShell() {
    const el = document.getElementById('rptab-marine-live');
    if (!el) return;
    el.innerHTML = `
      <!-- Header -->
      <div class="mrl-header">
        <div class="mrl-title-row">
          <span class="mrl-title">🚢 MARINE LIVE TRACKER</span>
          <span class="mrl-ws-dot" id="mrl-ws-dot" title="WebSocket status">●</span>
          <span class="badge-live" style="margin-left:2px;font-size:7px" id="mrl-ws-lbl">POLLING</span>
          <button class="mini-btn" onclick="MARINE_LIVE.refresh()" title="Force refresh" style="margin-left:auto">↻</button>
          <button class="mini-btn" id="mrl-map-btn" onclick="MARINE_LIVE.toggleMap()" title="Toggle MarineTraffic map overlay" style="margin-left:3px">🗺 MAP</button>
        </div>

        <!-- Stats strip -->
        <div class="mrl-stats" id="mrl-stats">
          <div class="mrl-stat"><span id="mrl-total" class="mrl-sv">—</span><span class="mrl-sl">VESSELS</span></div>
          <div class="mrl-stat"><span id="mrl-naval" class="mrl-sv" style="color:#ff2244">—</span><span class="mrl-sl">NAVAL</span></div>
          <div class="mrl-stat"><span id="mrl-india" class="mrl-sv" style="color:#ff9933">—</span><span class="mrl-sl">🇮🇳 INDIA</span></div>
          <div class="mrl-stat"><span id="mrl-iran"  class="mrl-sv" style="color:#ff4400">—</span><span class="mrl-sl">🇮🇷 IRAN</span></div>
          <div class="mrl-stat"><span id="mrl-conf"  class="mrl-sv" style="color:#00ff88">—</span><span class="mrl-sl">CONFIRMED</span></div>
          <div class="mrl-stat"><span id="mrl-tanker" class="mrl-sv" style="color:#ff9900">—</span><span class="mrl-sl">TANKER</span></div>
        </div>

        <!-- Country filter pills -->
        <div class="mrl-filter-row" id="mrl-country-row">
          ${COUNTRY_FILTERS.map(c => `
            <button class="mrl-cfpill ${c.code === 'ALL' ? 'active' : ''}"
              data-cf="${c.code}" style="--cf-color:${c.color}"
              onclick="MARINE_LIVE.setCountry('${c.code}',this)">
              ${c.emoji} ${c.label}
            </button>`).join('')}
        </div>

        <!-- Region + type filter row -->
        <div class="mrl-filter-row mrl-region-row" id="mrl-region-row">
          ${REGIONS.map((r,i) => `
            <button class="mrl-rfpill ${i===0?'active':''}"
              data-rf="${r.id}" onclick="MARINE_LIVE.setRegion('${r.id}',this)">
              ${r.icon} ${r.label}
            </button>`).join('')}
        </div>
      </div>

      <!-- MarineTraffic embed (hidden by default) -->
      <div id="mrl-map-embed" class="mrl-map-wrap" style="display:none">
        <div class="mrl-map-tabs">
          <button class="mrl-mtab active" onclick="MARINE_LIVE.setMapRegion('india')">🇮🇳 INDIA WATERS</button>
          <button class="mrl-mtab" onclick="MARINE_LIVE.setMapRegion('hormuz')">🛢 HORMUZ</button>
          <button class="mrl-mtab" onclick="MARINE_LIVE.setMapRegion('global')">🌐 GLOBAL</button>
          <button class="mrl-mtab" onclick="MARINE_LIVE.setMapRegion('southchina')">🇨🇳 S. CHINA</button>
        </div>
        <iframe id="mrl-mt-frame"
          src="https://www.marinetraffic.com/en/ais/embed/zoom:5/centery:15/centerx:73/maptype:4/shownames:false/mmsi:0/shipid:0/fleet:/fleet_id:/vtypes:/showmenu:/remember:false"
          frameborder="0" allow="fullscreen"
          style="width:100%;height:320px;border:none;background:#040608">
        </iframe>
        <div style="font-size:7px;color:#2a4060;padding:3px 8px;background:#040608">
          📡 MarineTraffic · Live AIS data · Vessel positions updated every 2 min
        </div>
      </div>

      <!-- Vessel list -->
      <div id="mrl-vessel-list" style="overflow-y:auto;height:calc(100vh - 290px);padding:4px 6px">
        <div class="mrl-loading">⟳ Connecting to AIS network…</div>
      </div>

      <!-- Footer -->
      <div class="mrl-footer">
        <span id="mrl-last-upd">—</span>
        <span class="mrl-src-strip">AISHub · VesselFinder · MyShipTracking</span>
        <span id="mrl-conf-detail" style="color:#00ff88;font-size:7px"></span>
      </div>
    `;
  }

  // ── Load / refresh data ───────────────────────────────────────────────────
  async function _load() {
    try {
      const r = await fetch('/api/marine');
      const d = await r.json();
      _ingestData(d);
    } catch (e) {
      const el = document.getElementById('mrl-vessel-list');
      if (el) el.innerHTML = `<div class="mrl-loading" style="color:#ff4444">⚠ AIS fetch failed — check network</div>`;
    }
  }

  // ── Ingest data (from HTTP poll or WebSocket push) ────────────────────────
  function _ingestData(d) {
    if (!d?.vessels) return;
    _vessels = d.vessels;
    _lastTs  = d.ts || Date.now();
    _updateStats(d);
    _applyFilters();
  }

  // ── Handle WebSocket marine push ──────────────────────────────────────────
  function handleWSUpdate(d) {
    _wsConnected = true;
    const dot = document.getElementById('mrl-ws-dot');
    const lbl = document.getElementById('mrl-ws-lbl');
    if (dot) { dot.style.color = '#00ff88'; dot.style.animation = 'pulse 1s ease-in-out'; }
    if (lbl) { lbl.textContent = 'LIVE WS'; lbl.style.color = '#00ff88'; }
    _ingestData(d);
  }

  // ── Stats bar ─────────────────────────────────────────────────────────────
  function _updateStats(d) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
    set('mrl-total',  d.count);
    set('mrl-naval',  d.naval_vessels);
    set('mrl-india',  d.india_vessels);
    set('mrl-iran',   d.iran_vessels);
    set('mrl-conf',   d.confirmed_count);
    set('mrl-tanker', (d.vessels||[]).filter(v => /tanker|lng/i.test(v.type)).length);
    const upd = document.getElementById('mrl-last-upd');
    if (upd && d.ts) upd.textContent = `Updated ${_ago(d.ts)} · ${(d.sources||[]).join(' · ')}`;
    const cd = document.getElementById('mrl-conf-detail');
    if (cd && d.confirmed_count != null)
      cd.textContent = `${d.confirmed_count} confirmed · ${d.count - d.confirmed_count} unverified`;
  }

  // ── Apply all active filters ──────────────────────────────────────────────
  function _applyFilters() {
    let v = [..._vessels];

    // Country filter
    if (_countryCode !== 'ALL') {
      if (_countryCode === 'NAVAL') {
        v = v.filter(x => x.vessel_class === 'naval' || /naval|warship|corvette|frigate|destroyer/i.test(x.type));
      } else if (_countryCode === 'IN') {
        v = v.filter(x => x.india_flagged || String(x.mmsi||'').startsWith('419'));
      } else if (_countryCode === 'IR') {
        v = v.filter(x => x.iran_flagged);
      } else if (_countryCode === 'CN') {
        v = v.filter(x => x.china_flagged);
      } else if (_countryCode === 'RU') {
        v = v.filter(x => String(x.mmsi||'').startsWith('273') || (x.flag||'').toLowerCase().includes('russia'));
      } else if (_countryCode === 'US') {
        v = v.filter(x => ['338','366','367','368','369'].some(p => String(x.mmsi||'').startsWith(p)));
      }
    }

    // Region filter
    if (_regionId !== 'all') {
      const regionMap = {
        indian:      r => /arabian|bay of bengal|indian ocean|andaman/i.test(r),
        hormuz:      r => /hormuz/i.test(r),
        red_sea:     r => /red sea|bab/i.test(r),
        malacca:     r => /malacca/i.test(r),
        south_china: r => /south china/i.test(r),
        persian:     r => /persian/i.test(r),
      };
      const fn = regionMap[_regionId];
      if (fn) v = v.filter(x => fn(x.route || ''));
    }

    // Sort
    const SEV_ORDER = { critical:0, high:1, india:2, normal:3, unknown:4 };
    v.sort((a, b) => (SEV_ORDER[a.severity]??4) - (SEV_ORDER[b.severity]??4));

    _filtered = v;
    _render();
  }

  // ── Render vessel list ────────────────────────────────────────────────────
  function _render() {
    const el = document.getElementById('mrl-vessel-list');
    if (!el) return;
    if (!_filtered.length) {
      el.innerHTML = '<div class="mrl-loading">No vessels match current filter.</div>';
      return;
    }
    el.innerHTML = _filtered.slice(0, 80).map(_vesselCard).join('');
  }

  // ── Single vessel card ────────────────────────────────────────────────────
  function _vesselCard(v) {
    const vt     = vtInfo((v.type || 'vessel').toLowerCase().replace(/\s+/g,''));
    const sevCol = { critical:'#ff2244', high:'#ff6600', india:'#ff9933', normal:'#00ff88', unknown:'#555' }[v.severity] || '#555';
    const confCol= { confirmed:'#00ff88', probable:'#ffaa00', conflicted:'#ff4400', unverified:'#444' }[v.confidence] || '#444';
    const hdgArr = v.hdg ? `<span style="display:inline-block;transform:rotate(${v.hdg}deg);font-size:9px">▲</span>` : '';
    const srcBadge = v.source_count > 1
      ? `<span style="color:#00ff88;font-size:6.5px">⊕ ${v.source_count} SRC</span>`
      : `<span style="color:#333;font-size:6.5px">◯ 1 SRC</span>`;
    const navalBadge = v.vessel_class === 'naval'
      ? `<span style="color:#ff2244;font-size:6.5px;font-weight:700">⚔ NAVAL</span>` : '';
    const indiaBadge = v.india_flagged
      ? `<span style="color:#ff9933;font-size:6.5px">🇮🇳</span>` : '';
    const iranBadge  = v.iran_flagged
      ? `<span style="color:#ff4400;font-size:6.5px">🇮🇷 IRAN</span>` : '';

    return `<div class="mrl-vcard" style="border-left-color:${sevCol}" onclick="MARINE_LIVE.flyTo(${v.lat},${v.lng})">
      <div class="mrl-vc-top">
        <span class="mrl-vc-type" style="color:${vt.color}">${vt.icon} ${vt.label}</span>
        <span class="mrl-vc-name">${(v.name||'UNKNOWN').slice(0,22)}</span>
        <span class="mrl-vc-sev" style="color:${sevCol}">${(v.severity||'?').toUpperCase()}</span>
      </div>
      <div class="mrl-vc-mid">
        <span style="color:#5a7a9a;font-size:7px">${v.route||'—'}</span>
        <span style="color:#3d5a78;font-size:7px;margin-left:auto">
          ${hdgArr} ${v.speed||0} kts
          ${v.hdg ? `· ${v.hdg}°` : ''}
        </span>
      </div>
      <div class="mrl-vc-bot">
        ${indiaBadge}${iranBadge}${navalBadge}
        <span style="color:${confCol};font-size:6.5px">${v.confidence||'?'}</span>
        ${srcBadge}
        <span style="color:#2a4060;font-size:6.5px;margin-left:auto">${v.mmsi||''}</span>
      </div>
      ${v.cargo ? `<div style="font-size:6.5px;color:#2a4060;margin-top:2px">→ ${v.cargo.slice(0,40)}</div>` : ''}
    </div>`;
  }

  // ── Fly to vessel on map ──────────────────────────────────────────────────
  function flyTo(lat, lng) {
    if (window.APP?.flyTo) window.APP.flyTo(lat, lng, 8);
    else if (window.map)    window.map.setView([lat, lng], 9, { animate: true });
  }

  // ── Toggle MarineTraffic embed map ────────────────────────────────────────
  function toggleMap() {
    _mapEmbed = !_mapEmbed;
    const wrap = document.getElementById('mrl-map-embed');
    const btn  = document.getElementById('mrl-map-btn');
    if (wrap) wrap.style.display = _mapEmbed ? 'block' : 'none';
    if (btn)  btn.style.background = _mapEmbed ? 'rgba(0,212,255,.12)' : '';
    // Adjust list height
    const list = document.getElementById('mrl-vessel-list');
    if (list) list.style.height = _mapEmbed ? 'calc(100vh - 640px)' : 'calc(100vh - 290px)';
  }

  // ── Set MarineTraffic map region ──────────────────────────────────────────
  const MT_REGIONS = {
    india:      { lat:15,  lng:73,  zoom:5 },
    hormuz:     { lat:26,  lng:56,  zoom:8 },
    global:     { lat:20,  lng:60,  zoom:3 },
    southchina: { lat:14,  lng:114, zoom:6 },
  };
  function setMapRegion(key) {
    const r = MT_REGIONS[key] || MT_REGIONS.india;
    const frame = document.getElementById('mrl-mt-frame');
    if (frame) {
      frame.src = `https://www.marinetraffic.com/en/ais/embed/zoom:${r.zoom}/centery:${r.lat}/centerx:${r.lng}/maptype:4/shownames:false/mmsi:0/shipid:0/fleet:/fleet_id:/vtypes:/showmenu:/remember:false`;
    }
    document.querySelectorAll('.mrl-mtab').forEach(b => b.classList.remove('active'));
    event?.target?.classList.add('active');
  }

  // ── Filter setters ────────────────────────────────────────────────────────
  function setCountry(code, btn) {
    _countryCode = code;
    document.querySelectorAll('.mrl-cfpill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    _applyFilters();
  }

  function setRegion(id, btn) {
    _regionId = id;
    document.querySelectorAll('.mrl-rfpill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    _applyFilters();
  }

  function refresh() { _load(); }

  function _ago(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s/60)}m ago`;
  }

  return { init, refresh, handleWSUpdate, setCountry, setRegion, flyTo, toggleMap, setMapRegion };
})();
