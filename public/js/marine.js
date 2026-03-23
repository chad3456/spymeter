/* ── SPYMETER — Real-Time Marine Activity Panel ─────────────────────────────
   Primary: AISstream.io WebSocket (wss://stream.aisstream.io/v0/stream)
   Fallback: AISHub · VesselFinder · MyShipTracking (3-source triangulation)
   Coverage: Arabian Sea · Bay of Bengal · Indian Ocean · Hormuz · Red Sea
             Malacca · South China Sea · Bosphorus + 54 maritime port markers
   Push: WebSocket every 30s from server broadcast                            */

const MARINE_LIVE = (() => {

  // ── Vessel type registry ──────────────────────────────────────────────────
  const VTYPES = {
    naval:      { icon:'⚔️',  label:'NAVAL',      color:'#ff2244', pri:1 },
    carrier:    { icon:'✈️',  label:'CARRIER',    color:'#ff0000', pri:2 },
    tanker:     { icon:'🛢',  label:'TANKER',     color:'#ff9900', pri:3 },
    lng:        { icon:'🔵',  label:'LNG',        color:'#00aaff', pri:4 },
    container:  { icon:'📦',  label:'CONTAINER',  color:'#00d4ff', pri:5 },
    cargo:      { icon:'🚢',  label:'CARGO',      color:'#00ff88', pri:6 },
    passenger:  { icon:'🛳',  label:'PASSENGER',  color:'#ff88cc', pri:7 },
    tug:        { icon:'⚓',  label:'TUG',        color:'#aaaaaa', pri:8 },
    fishing:    { icon:'🎣',  label:'FISHING',    color:'#88cc44', pri:9 },
    cable:      { icon:'🔌',  label:'CABLE',      color:'#9b59ff', pri:10},
    vessel:     { icon:'🚤',  label:'VESSEL',     color:'#555555', pri:11},
  };
  const vtInfo = t => VTYPES[(t||'vessel').toLowerCase().split(/[^a-z]/)[0]] || VTYPES.vessel;

  // ── Country filter definitions ────────────────────────────────────────────
  const CFILTERS = [
    { code:'ALL',   label:'ALL',    emoji:'🌐', color:'#aaa' },
    { code:'IN',    label:'INDIA',  emoji:'🇮🇳', color:'#ff9933' },
    { code:'IR',    label:'IRAN',   emoji:'🇮🇷', color:'#ff4400' },
    { code:'CN',    label:'CHINA',  emoji:'🇨🇳', color:'#ff4444' },
    { code:'RU',    label:'RUSSIA', emoji:'🇷🇺', color:'#4488ff' },
    { code:'US',    label:'USA',    emoji:'🇺🇸', color:'#6699ff' },
    { code:'NAVAL', label:'NAVAL',  emoji:'⚔️',  color:'#ff2244' },
  ];

  // ── Region filter definitions ─────────────────────────────────────────────
  const REGIONS = [
    { id:'all',         label:'ALL WATERS',   icon:'🌊', match: () => true },
    { id:'indian',      label:'INDIA',        icon:'🇮🇳', match: r => /arabian|bay of bengal|indian ocean|andaman/i.test(r) },
    { id:'hormuz',      label:'HORMUZ',       icon:'🛢',  match: r => /hormuz|persian/i.test(r) },
    { id:'red_sea',     label:'RED SEA',      icon:'🔴',  match: r => /red sea|bab|suez/i.test(r) },
    { id:'malacca',     label:'MALACCA',      icon:'⚓',  match: r => /malacca/i.test(r) },
    { id:'south_china', label:'S.CHINA',      icon:'🇨🇳', match: r => /south china|taiwan/i.test(r) },
    { id:'bosphorus',   label:'BOSPHORUS',    icon:'🌊',  match: r => /bosphorus|black sea/i.test(r) },
  ];

  const SEVERITY_ORDER = { critical:0, high:1, india:2, normal:3, unknown:4 };
  const SEV_COLOR = { critical:'#ff2244', high:'#ff6600', india:'#ff9933', normal:'#00ff88', unknown:'#444' };

  let _vessels     = [];
  let _ports       = [];
  let _chokepoints = [];
  let _filtered    = [];
  let _country     = 'ALL';
  let _region      = 'all';
  let _view        = 'vessels';   // 'vessels' | 'ports'
  let _mapOpen     = false;
  let _mapRegion   = 'india';
  let _wsConnected = false;
  let _sourceType  = 'http';
  let _initialized = false;

  // ── Public init ───────────────────────────────────────────────────────────
  function init() {
    if (_initialized) return;
    _initialized = true;
    _buildShell();
    _loadPorts();
    _load();
    _pollStatus();
  }

  // ── Build shell ───────────────────────────────────────────────────────────
  function _buildShell() {
    const el = document.getElementById('rptab-marine-live');
    if (!el) return;
    el.innerHTML = `
      <!-- Header -->
      <div class="mrl-header">
        <div class="mrl-title-row">
          <span class="mrl-title">🚢 MARINE AIS LIVE</span>
          <span id="mrl-src-badge" class="badge-static" style="font-size:6.5px;margin-left:4px">HTTP</span>
          <span id="mrl-ws-dot" style="font-size:10px;color:#ff4444;margin-left:3px" title="AISstream WS status">●</span>
          <button class="mini-btn" onclick="MARINE_LIVE.refresh()" style="margin-left:auto" title="Force refresh">↻</button>
          <button class="mini-btn" id="mrl-map-btn" onclick="MARINE_LIVE.toggleMap()" title="Toggle MarineTraffic live map">🗺 MAP</button>
        </div>

        <!-- Live stats row -->
        <div class="mrl-stats">
          <div class="mrl-stat"><span id="mrl-total"  class="mrl-sv">—</span><span class="mrl-sl">VESSELS</span></div>
          <div class="mrl-stat"><span id="mrl-naval"  class="mrl-sv" style="color:#ff2244">—</span><span class="mrl-sl">NAVAL</span></div>
          <div class="mrl-stat"><span id="mrl-india"  class="mrl-sv" style="color:#ff9933">—</span><span class="mrl-sl">🇮🇳</span></div>
          <div class="mrl-stat"><span id="mrl-iran"   class="mrl-sv" style="color:#ff4400">—</span><span class="mrl-sl">🇮🇷</span></div>
          <div class="mrl-stat"><span id="mrl-tanker" class="mrl-sv" style="color:#ff9900">—</span><span class="mrl-sl">TANKER</span></div>
          <div class="mrl-stat"><span id="mrl-conf"   class="mrl-sv" style="color:#00ff88">—</span><span class="mrl-sl">LIVE</span></div>
        </div>

        <!-- Country filter pills -->
        <div class="mrl-filter-row">
          ${CFILTERS.map(c => `
            <button class="mrl-cfpill ${c.code==='ALL'?'active':''}"
              data-cf="${c.code}" style="--cf-color:${c.color}"
              onclick="MARINE_LIVE.setCountry('${c.code}',this)">
              ${c.emoji} ${c.label}
            </button>`).join('')}
        </div>

        <!-- Region filter + view toggle -->
        <div class="mrl-filter-row" style="gap:3px;padding-bottom:4px">
          ${REGIONS.map((r,i) => `
            <button class="mrl-rfpill ${i===0?'active':''}"
              data-rf="${r.id}" onclick="MARINE_LIVE.setRegion('${r.id}',this)">
              ${r.icon} ${r.label}
            </button>`).join('')}
          <button class="mrl-rfpill" id="mrl-view-ports" style="margin-left:auto;color:#ff9933;border-color:rgba(255,153,51,.3)"
            onclick="MARINE_LIVE.setView('ports')">⚓ PORTS</button>
          <button class="mrl-rfpill active" id="mrl-view-vessels"
            onclick="MARINE_LIVE.setView('vessels')">🚢 VESSELS</button>
        </div>
      </div>

      <!-- MarineTraffic embed (hidden by default) -->
      <div id="mrl-map-wrap" class="mrl-map-wrap" style="display:none">
        <div class="mrl-map-tabs">
          <button class="mrl-mtab active"  onclick="MARINE_LIVE.setMapRegion('india',this)">🇮🇳 INDIA WATERS</button>
          <button class="mrl-mtab"         onclick="MARINE_LIVE.setMapRegion('hormuz',this)">🛢 HORMUZ</button>
          <button class="mrl-mtab"         onclick="MARINE_LIVE.setMapRegion('redsea',this)">🔴 RED SEA</button>
          <button class="mrl-mtab"         onclick="MARINE_LIVE.setMapRegion('malacca',this)">⚓ MALACCA</button>
          <button class="mrl-mtab"         onclick="MARINE_LIVE.setMapRegion('southchina',this)">🇨🇳 S.CHINA</button>
          <button class="mrl-mtab"         onclick="MARINE_LIVE.setMapRegion('global',this)">🌐 GLOBAL</button>
        </div>
        <iframe id="mrl-mt-frame"
          src="https://www.marinetraffic.com/en/ais/embed/zoom:5/centery:15/centerx:73/maptype:4/shownames:false/mmsi:0/shipid:0/fleet:/fleet_id:/vtypes:/showmenu:/remember:false"
          frameborder="0" allowfullscreen
          style="width:100%;height:300px;border:none;background:#040608">
        </iframe>
        <div style="font-size:6.5px;color:#2a4060;padding:2px 8px;background:rgba(0,0,0,.6)">
          MarineTraffic live AIS · positions update every 2 min · 54 ports in database
        </div>
      </div>

      <!-- Content area -->
      <div id="mrl-content" style="overflow-y:auto;height:calc(100vh - 280px)">
        <div class="mrl-loading">⟳ Connecting to AIS network…</div>
      </div>

      <!-- Footer -->
      <div class="mrl-footer">
        <span id="mrl-upd-lbl" style="color:#2a4060">—</span>
        <span id="mrl-src-lbl" style="color:#1a3040;font-size:6px;margin-left:auto">—</span>
      </div>
    `;
  }

  // ── MarineTraffic embed regions ───────────────────────────────────────────
  const MT_VIEWS = {
    india:      { lat:15,   lng:73,   zoom:5 },
    hormuz:     { lat:26.5, lng:56.5, zoom:8 },
    redsea:     { lat:18,   lng:40,   zoom:6 },
    malacca:    { lat:3,    lng:102,  zoom:7 },
    southchina: { lat:14,   lng:114,  zoom:6 },
    global:     { lat:20,   lng:60,   zoom:3 },
  };
  function setMapRegion(key, btn) {
    const v = MT_VIEWS[key] || MT_VIEWS.india;
    const frame = document.getElementById('mrl-mt-frame');
    if (frame) frame.src = `https://www.marinetraffic.com/en/ais/embed/zoom:${v.zoom}/centery:${v.lat}/centerx:${v.lng}/maptype:4/shownames:false/mmsi:0/shipid:0/fleet:/fleet_id:/vtypes:/showmenu:/remember:false`;
    document.querySelectorAll('.mrl-mtab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  function toggleMap() {
    _mapOpen = !_mapOpen;
    const wrap = document.getElementById('mrl-map-wrap');
    const btn  = document.getElementById('mrl-map-btn');
    const content = document.getElementById('mrl-content');
    if (wrap) wrap.style.display = _mapOpen ? 'block' : 'none';
    if (btn)  btn.style.background = _mapOpen ? 'rgba(0,212,255,.12)' : '';
    if (content) content.style.height = _mapOpen ? 'calc(100vh - 600px)' : 'calc(100vh - 280px)';
  }

  // ── Load ports data ───────────────────────────────────────────────────────
  async function _loadPorts() {
    try {
      const r = await fetch('/api/marine/ports');
      const d = await r.json();
      _ports       = d.ports || [];
      _chokepoints = d.chokepoints || [];
    } catch (_) {}
  }

  // ── Load vessel data ──────────────────────────────────────────────────────
  async function _load() {
    try {
      const r = await fetch('/api/marine');
      const d = await r.json();
      _ingest(d);
    } catch (e) {
      _setContent('<div class="mrl-loading" style="color:#ff4444">⚠ AIS fetch failed — check sources</div>');
    }
  }

  // ── Ingest from HTTP or WS ────────────────────────────────────────────────
  function _ingest(d) {
    if (!d?.vessels) return;
    _vessels    = d.vessels;
    _sourceType = d.source_type || 'http';
    _updateStats(d);
    _applyFilters();
  }

  // ── Handle WebSocket push ─────────────────────────────────────────────────
  function handleWSUpdate(d) {
    _wsConnected = true;
    const dot = document.getElementById('mrl-ws-dot');
    const badge = document.getElementById('mrl-src-badge');
    if (dot) { dot.style.color = '#00ff88'; }
    if (badge) {
      const isLive = d.source_type === 'aisstream';
      badge.textContent = isLive ? '⚡ AISstream LIVE' : '🔄 HTTP POLL';
      badge.style.color = isLive ? '#00ff88' : '#aaa';
    }
    _ingest(d);
  }

  // ── Poll AISstream status ──────────────────────────────────────────────────
  async function _pollStatus() {
    try {
      const r = await fetch('/api/aisstream/status');
      const d = await r.json();
      const dot   = document.getElementById('mrl-ws-dot');
      const badge = document.getElementById('mrl-src-badge');
      if (dot)   dot.style.color = d.connected ? '#00ff88' : d.key_set ? '#ffaa00' : '#ff4444';
      if (badge) {
        if (!d.key_set)     { badge.textContent = 'NO KEY — SET AISSTREAM_API_KEY'; badge.style.color = '#ff4444'; }
        else if (d.connected){ badge.textContent = `⚡ AISstream LIVE · ${d.vessel_count} vessels`; badge.style.color = '#00ff88'; }
        else                 { badge.textContent = 'AISstream CONNECTING…'; badge.style.color = '#ffaa00'; }
      }
    } catch (_) {}
    setTimeout(_pollStatus, 30_000);
  }

  // ── Stats bar update ──────────────────────────────────────────────────────
  function _updateStats(d) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '—'; };
    set('mrl-total',  d.count);
    set('mrl-naval',  d.naval_vessels);
    set('mrl-india',  d.india_vessels);
    set('mrl-iran',   d.iran_vessels);
    set('mrl-tanker', (d.vessels||[]).filter(v=>/tanker|lng/i.test(v.type||'')).length);
    set('mrl-conf',   d.confirmed_count);
    const upd  = document.getElementById('mrl-upd-lbl');
    const src  = document.getElementById('mrl-src-lbl');
    if (upd && d.ts) upd.textContent = `Updated ${_ago(d.ts)}`;
    if (src) src.textContent = (d.sources||[]).join(' · ');
  }

  // ── Apply all filters ─────────────────────────────────────────────────────
  function _applyFilters() {
    if (_view === 'ports') { _renderPorts(); return; }

    let v = [..._vessels];
    // Country filter
    const mm = s => String(s||'');
    if (_country === 'IN')    v = v.filter(x => x.india_flagged || mm(x.mmsi).startsWith('419'));
    else if (_country === 'IR')    v = v.filter(x => x.iran_flagged);
    else if (_country === 'CN')    v = v.filter(x => x.china_flagged || ['412','413','414'].some(p=>mm(x.mmsi).startsWith(p)));
    else if (_country === 'RU')    v = v.filter(x => mm(x.mmsi).startsWith('273') || (x.flag||'').toLowerCase().includes('russia'));
    else if (_country === 'US')    v = v.filter(x => ['338','366','367','368','369'].some(p=>mm(x.mmsi).startsWith(p)));
    else if (_country === 'NAVAL') v = v.filter(x => x.vessel_class === 'naval' || /naval|warship|corvette|frigate|destroyer/i.test(x.type||''));

    // Region filter
    const region = REGIONS.find(r => r.id === _region);
    if (region && _region !== 'all') v = v.filter(x => region.match(x.route||''));

    v.sort((a,b) => (SEVERITY_ORDER[a.severity]??4) - (SEVERITY_ORDER[b.severity]??4));
    _filtered = v;
    _renderVessels();
  }

  // ── Render vessel cards ───────────────────────────────────────────────────
  function _renderVessels() {
    if (!_filtered.length) {
      _setContent(`<div class="mrl-loading">No vessels match filter. ${!_vessels.length ? '— waiting for AIS data' : ''}</div>`);
      return;
    }
    _setContent(_filtered.slice(0, 100).map(_vesselCard).join(''));
  }

  function _vesselCard(v) {
    const vt  = vtInfo(v.type);
    const sc  = SEV_COLOR[v.severity] || '#444';
    const cc  = { confirmed:'#00ff88', probable:'#ffaa00', conflicted:'#ff4400', unverified:'#333' }[v.confidence] || '#333';
    const arr = v.hdg ? `<span style="display:inline-block;transform:rotate(${v.hdg-90}deg);font-size:8px;line-height:1">➤</span>` : '';
    const spd = v.speed ? `${v.speed.toFixed(1)} kts` : '—';
    const navSt = _navStatus(v.nav_status);
    return `
      <div class="mrl-vcard" style="border-left-color:${sc}" onclick="MARINE_LIVE.flyTo(${v.lat},${v.lng})">
        <div class="mrl-vc-top">
          <span style="font-size:9px;flex-shrink:0">${vt.icon}</span>
          <span class="mrl-vc-name">${(v.name||'UNKNOWN').slice(0,24)}</span>
          <span style="font-size:6px;color:${sc};font-weight:700;flex-shrink:0">${(v.severity||'?').toUpperCase()}</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
          <span style="font-size:7px;color:#5a7a9a">${v.route||'Open Ocean'}</span>
          <span style="margin-left:auto;font-size:7px;color:#3d5a78">${arr} ${spd}${v.hdg?` · ${v.hdg}°`:''}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          ${v.india_flagged?'<span style="font-size:8px">🇮🇳</span>':''}
          ${v.iran_flagged ?'<span style="font-size:8px">🇮🇷</span>':''}
          ${v.china_flagged?'<span style="font-size:8px">🇨🇳</span>':''}
          ${v.vessel_class==='naval'?'<span style="color:#ff2244;font-size:6.5px;font-weight:700">⚔NAVAL</span>':''}
          <span style="font-size:6.5px;color:${cc}">${v.confidence||'?'}</span>
          ${v.source_count>1?`<span style="color:#00ff88;font-size:6px">⊕${v.source_count}src</span>`:''}
          ${navSt?`<span style="font-size:6px;color:#3d5a78">${navSt}</span>`:''}
          <span style="color:#1a3040;font-size:6px;margin-left:auto">${v.mmsi||''}</span>
        </div>
        ${v.cargo?`<div style="font-size:6.5px;color:#2a4060;margin-top:2px">→ ${v.cargo.slice(0,45)}</div>`:''}
      </div>`;
  }

  // ── Render ports list ─────────────────────────────────────────────────────
  function _renderPorts() {
    if (!_ports.length) { _setContent('<div class="mrl-loading">⟳ Loading port database…</div>'); return; }

    // Group ports by type
    const groups = { naval:[], commercial:[], mixed:[], chokepoint:[] };
    for (const p of _ports) groups[p.type]?.push(p) || groups.commercial.push(p);
    groups.chokepoints = _chokepoints;

    let html = '';
    const sectionOrder = [
      ['chokepoints', '🌊 STRATEGIC CHOKEPOINTS'],
      ['naval',       '⚔️ NAVAL BASES & STATIONS'],
      ['mixed',       '🔀 DUAL-USE PORTS'],
      ['commercial',  '📦 COMMERCIAL PORTS'],
    ];
    for (const [key, title] of sectionOrder) {
      const list = groups[key];
      if (!list?.length) continue;
      html += `<div class="mrl-port-hdr">${title}</div>`;
      html += list.map(_portCard).join('');
    }
    _setContent(html);
  }

  function _portCard(p) {
    const impColor = { critical:'#ff4444', major:'#ff9900', regional:'#00d4ff' }[p.importance] || '#888';
    const tType  = { naval:'⚔️ NAVAL', commercial:'📦 COMMERCIAL', mixed:'🔀 MIXED', chokepoint:'🌊 CHOKEPOINT' }[p.type] || '⚓';
    const threat = p.threat ? { critical:'🔴 CRITICAL', high:'🟠 HIGH', medium:'🟡 MEDIUM' }[p.threat] : '';
    return `
      <div class="mrl-vcard" style="border-left-color:${impColor};cursor:pointer"
        onclick="MARINE_LIVE.flyTo(${p.lat},${p.lng})">
        <div class="mrl-vc-top">
          <span style="font-size:11px;flex-shrink:0">${p.flag||'⚓'}</span>
          <span class="mrl-vc-name">${p.name.slice(0,26)}</span>
          <span style="font-size:6px;color:${impColor};font-weight:700">${(p.importance||'').toUpperCase()}</span>
        </div>
        <div style="display:flex;gap:5px;margin-bottom:2px">
          <span style="font-size:6.5px;color:#5a7a9a">${p.country}</span>
          <span style="font-size:6.5px;color:#3d5a78;margin-left:auto">${tType}</span>
          ${threat?`<span style="font-size:6.5px">${threat}</span>`:''}
        </div>
        ${p.throughput_mt?`<div style="font-size:6px;color:#2a4060;margin-bottom:1px">📊 ${p.throughput_mt}M MT/year</div>`:''}
        ${p.notes?`<div style="font-size:6.5px;color:#3d5a78;line-height:1.3">${p.notes.slice(0,90)}${p.notes.length>90?'…':''}</div>`:''}
      </div>`;
  }

  // ── AIS navigational status labels ───────────────────────────────────────
  function _navStatus(code) {
    const MAP = {0:'Underway',1:'At Anchor',2:'Not Under Cmd',3:'Restricted',5:'Moored',7:'Fishing',15:'Undefined'};
    return MAP[code] || null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _setContent(html) {
    const el = document.getElementById('mrl-content');
    if (el) el.innerHTML = html;
  }
  function _ago(ts) {
    const s = Math.floor((Date.now()-ts)/1000);
    if (s<5) return 'now'; if (s<60) return `${s}s ago`; return `${Math.floor(s/60)}m ago`;
  }
  function flyTo(lat, lng) {
    if (window.APP?.flyTo)  window.APP.flyTo(lat, lng, 8);
    else if (window.map)    window.map.setView([lat, lng], 9, { animate:true });
  }

  // ── Public setters ────────────────────────────────────────────────────────
  function setCountry(code, btn) {
    _country = code;
    document.querySelectorAll('.mrl-cfpill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    _applyFilters();
  }
  function setRegion(id, btn) {
    _region = id;
    document.querySelectorAll('.mrl-rfpill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    _applyFilters();
  }
  function setView(v) {
    _view = v;
    document.getElementById('mrl-view-ports')?.classList.toggle('active',   v==='ports');
    document.getElementById('mrl-view-vessels')?.classList.toggle('active', v==='vessels');
    _applyFilters();
  }
  function refresh() { _load(); }

  return { init, refresh, handleWSUpdate, setCountry, setRegion, setView, flyTo, toggleMap, setMapRegion };
})();
