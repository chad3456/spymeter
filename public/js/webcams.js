'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   WEBCAMS MODULE — Floating draggable world webcam map
   Panel: bottom-right, draggable, resizable, minimize/maximize
   Map tiles: Dark | Satellite (ESRI) | Terrain | Street
   Stream: opens in new browser tab (avoids iframe CSP / error 153)
════════════════════════════════════════════════════════════════════════════ */
const WEBCAMS = (() => {

  let _inited  = false;
  let _map     = null;
  let _cluster = null;
  let _all     = [];
  let _country = 'all';
  let _search  = '';
  let _panel   = null;
  let _minimised = false;
  let _expanded  = false;
  let _activeTile = 'dark';
  let _tileLayers = {};
  let _savedPos   = {};

  const CAT_COLORS = { landmark:'#ffaa00', city:'#00d4ff', nature:'#00ff88',
    mountain:'#a0c8ff', beach:'#ff9933', wildlife:'#88dd44', webcam:'#9b59ff' };
  const CAT_ICONS  = { landmark:'🏛', city:'🏙', nature:'🌿',
    mountain:'⛰', beach:'🏖', wildlife:'🦁', webcam:'📷' };

  // ── CSS ──────────────────────────────────────────────────────────────────────
  function _css() {
    if (document.getElementById('wc-styles')) return;
    const s = document.createElement('style');
    s.id = 'wc-styles';
    s.textContent = `
      #wc-panel{
        position:fixed;bottom:48px;right:22px;width:700px;height:460px;
        min-width:300px;min-height:200px;background:#04060a;
        border:1px solid #1a3040;border-radius:6px;display:none;
        flex-direction:column;z-index:4000;resize:both;overflow:hidden;
        box-shadow:0 0 40px rgba(0,0,0,.85);font-family:'Courier New',monospace;
      }
      #wc-panel.open{display:flex}
      #wc-panel.minimised #wc-tiles,
      #wc-panel.minimised #wc-filters,
      #wc-panel.minimised #wc-map{display:none}
      #wc-panel.expanded{
        inset:0!important;width:100vw!important;height:100vh!important;
        border-radius:0;resize:none;
      }
      #wc-hdr{
        display:flex;align-items:center;gap:6px;padding:0 10px;height:34px;
        flex-shrink:0;background:rgba(0,0,0,.65);border-bottom:1px solid #0d1e2e;
        cursor:grab;user-select:none;
      }
      #wc-hdr:active{cursor:grabbing}
      #wc-title{font-size:9px;font-weight:700;letter-spacing:1.5px;color:#00d4ff;pointer-events:none}
      #wc-badge{font-size:6.5px;padding:2px 6px;border-radius:10px;pointer-events:none;
        background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.2);color:#00d4ff}
      .wc-spacer{flex:1}
      .wc-hbtn{background:transparent;border:1px solid #1a3040;color:#3d5a78;
        font-size:9px;padding:1px 7px;border-radius:3px;cursor:pointer;line-height:1.5;
        transition:all .15s;white-space:nowrap}
      .wc-hbtn:hover{border-color:#00d4ff;color:#00d4ff}
      #wc-close{border-color:rgba(255,68,68,.3);color:#ff6666}
      #wc-close:hover{background:rgba(255,68,68,.2);color:#fff;border-color:#ff4444}

      #wc-tiles{display:flex;align-items:center;gap:4px;padding:3px 10px;
        background:rgba(0,0,0,.4);border-bottom:1px solid #0d1e2e;flex-shrink:0}
      #wc-tiles label{font-size:6.5px;color:#3d5a78;letter-spacing:.5px;margin-right:3px}
      .wc-tbtn{background:transparent;border:1px solid #1a3040;color:#3d5a78;
        font-size:6.5px;padding:2px 8px;border-radius:10px;cursor:pointer;transition:all .15s}
      .wc-tbtn.on{background:rgba(0,212,255,.1);border-color:rgba(0,212,255,.4);color:#00d4ff}
      .wc-tbtn:hover:not(.on){border-color:#3d5a78;color:#c8dff0}

      #wc-filters{display:flex;align-items:center;gap:3px;padding:3px 10px;
        background:rgba(0,0,0,.35);border-bottom:1px solid #0d1e2e;flex-shrink:0;flex-wrap:wrap}
      .wc-pill{background:transparent;border:1px solid #1a3040;color:#3d5a78;
        font-size:6px;padding:1px 6px;border-radius:10px;cursor:pointer;transition:all .15s}
      .wc-pill.on{background:rgba(0,212,255,.1);border-color:rgba(0,212,255,.4);color:#00d4ff}
      .wc-pill:hover:not(.on){border-color:#3d5a78;color:#c8dff0}
      #wc-search{background:rgba(255,255,255,.04);border:1px solid #1a3040;color:#c8dff0;
        font-size:7px;padding:2px 7px;border-radius:2px;outline:none;width:120px}
      #wc-search::placeholder{color:#3d5a78}
      #wc-search:focus{border-color:#00d4ff}
      #wc-count{font-size:6.5px;color:#3d5a78;margin-left:auto}

      #wc-map{flex:1;min-height:0}
      .wc-cam-icon{background:none;border:none}
      .wc-dot{width:16px;height:16px;border-radius:50%;border:2px solid;
        display:flex;align-items:center;justify-content:center;font-size:8px;
        cursor:pointer;transition:transform .15s;box-shadow:0 0 5px currentColor}
      .wc-dot:hover{transform:scale(1.4)}
      .wc-clust>div{background:rgba(0,212,255,.18);border:2px solid rgba(0,212,255,.5);
        border-radius:50%;width:30px;height:30px;display:flex;align-items:center;
        justify-content:center;font-size:10px;font-weight:700;color:#00d4ff}
      .wc-popup-wrap .leaflet-popup-content-wrapper{
        background:#060e1a;border:1px solid #1a3040;border-radius:4px;
        color:#c8dff0;box-shadow:0 0 20px rgba(0,0,0,.8)}
      .wc-popup-wrap .leaflet-popup-tip{background:#060e1a}
      .wc-popup-wrap .leaflet-popup-close-button{color:#3d5a78!important}
      .wc-pop{min-width:210px;font-family:'Courier New',monospace}
      .wc-pop img{width:100%;height:120px;object-fit:cover;border-radius:2px;
        margin-bottom:4px;background:#0d1e2e}
      .wc-pop-title{font-size:9px;font-weight:700;color:#c8dff0;margin-bottom:2px}
      .wc-pop-loc{font-size:7px;color:#3d5a78;margin-bottom:5px}
      .wc-pop-btns{display:flex;gap:4px}
      .wc-pop-btn{flex:1;padding:4px;font-size:7px;font-weight:700;border-radius:2px;
        cursor:pointer;text-align:center;text-decoration:none;border:1px solid;transition:all .15s}
      .wc-pop-btn.primary{background:rgba(0,212,255,.12);border-color:rgba(0,212,255,.35);color:#00d4ff}
      .wc-pop-btn.primary:hover{background:rgba(0,212,255,.25)}
      .wc-pop-btn.sec{background:rgba(255,255,255,.04);border-color:#1a3040;color:#5a7a9a}
      .wc-pop-btn.sec:hover{border-color:#3d5a78;color:#c8dff0}
    `;
    document.head.appendChild(s);
  }

  // ── Build panel ──────────────────────────────────────────────────────────────
  function _build() {
    _panel = document.createElement('div');
    _panel.id = 'wc-panel';
    _panel.innerHTML = `
      <div id="wc-hdr">
        <span style="font-size:13px;pointer-events:none">🎥</span>
        <span id="wc-title">LIVE WEBCAMS</span>
        <span id="wc-badge">● —</span>
        <span class="wc-spacer"></span>
        <button class="wc-hbtn" id="wc-refresh">↻ REFRESH</button>
        <button class="wc-hbtn" id="wc-min">─</button>
        <button class="wc-hbtn" id="wc-exp">⛶</button>
        <button class="wc-hbtn" id="wc-close">✕</button>
      </div>
      <div id="wc-tiles">
        <label>MAP STYLE</label>
        <button class="wc-tbtn on"  data-tile="dark">🌑 DARK</button>
        <button class="wc-tbtn"     data-tile="satellite">🛰 SATELLITE</button>
        <button class="wc-tbtn"     data-tile="terrain">🗻 TERRAIN</button>
        <button class="wc-tbtn"     data-tile="street">🗺 STREET</button>
      </div>
      <div id="wc-filters">
        <div id="wc-cpills" style="display:flex;gap:3px;flex-wrap:wrap"></div>
        <input id="wc-search" placeholder="🔍 search…" autocomplete="off">
        <span id="wc-count"></span>
      </div>
      <div id="wc-map"></div>`;
    document.body.appendChild(_panel);
  }

  // ── Map + tiles ──────────────────────────────────────────────────────────────
  function _initMap() {
    if (_map) return;
    _map = L.map('wc-map', { center:[20,0], zoom:2, minZoom:2, maxZoom:16 });

    _tileLayers = {
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { attribution:'© OSM © CartoDB', subdomains:'abcd', maxZoom:19 }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution:'© Esri World Imagery', maxZoom:19 }),
      terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        { attribution:'© OpenTopoMap', subdomains:'abc', maxZoom:17 }),
      street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution:'© OpenStreetMap', subdomains:'abc', maxZoom:19 }),
    };
    _tileLayers.dark.addTo(_map);

    _cluster = L.markerClusterGroup({
      maxClusterRadius:50, showCoverageOnHover:false,
      iconCreateFunction(c) {
        return L.divIcon({
          html:`<div class="wc-clust"><div>${c.getChildCount()}</div></div>`,
          className:'', iconSize:[30,30], iconAnchor:[15,15] });
      },
    });
    _map.addLayer(_cluster);

    new ResizeObserver(() => _map?.invalidateSize()).observe(_panel);
  }

  function _switchTile(name) {
    if (!_tileLayers[name] || name === _activeTile) return;
    _map.removeLayer(_tileLayers[_activeTile]);
    _tileLayers[name].addTo(_map);
    _activeTile = name;
    _panel.querySelectorAll('.wc-tbtn').forEach(b =>
      b.classList.toggle('on', b.dataset.tile === name));
  }

  // ── Markers ──────────────────────────────────────────────────────────────────
  function _icon(cat) {
    const col = CAT_COLORS[cat]||'#9b59ff', ic = CAT_ICONS[cat]||'📷';
    return L.divIcon({ html:`<div class="wc-dot" style="color:${col};border-color:${col};background:${col}22">${ic}</div>`,
      className:'wc-cam-icon', iconSize:[16,16], iconAnchor:[8,8] });
  }

  function _popup(w) {
    const col = CAT_COLORS[w.cat]||'#9b59ff';
    return `<div class="wc-pop">
      ${w.thumb?`<img src="${w.thumb}" onerror="this.style.display='none'" alt="${w.title}" loading="lazy">`:''}
      <div class="wc-pop-title">${w.title}</div>
      <div class="wc-pop-loc" style="color:${col}">📍 ${w.city}, ${w.country}</div>
      <div class="wc-pop-btns">
        <a class="wc-pop-btn primary" href="${w.url}" target="_blank" rel="noopener">▶ WATCH LIVE ↗</a>
        <a class="wc-pop-btn sec" href="https://www.windy.com/webcams" target="_blank" rel="noopener">WINDY ↗</a>
      </div>
    </div>`;
  }

  function _placeMarkers(list) {
    _cluster.clearLayers();
    list.forEach(w => {
      if (!w.lat || !w.lon) return;
      const m = L.marker([w.lat,w.lon], { icon:_icon(w.cat) });
      m.bindPopup(_popup(w), { className:'wc-popup-wrap', maxWidth:250, autoPanPadding:[20,20] });
      _cluster.addLayer(m);
    });
    const el = document.getElementById('wc-count');
    if (el) el.textContent = list.length + ' cams';
  }

  function _filter() {
    let d = _all.slice();
    if (_country !== 'all') d = d.filter(w => w.country === _country);
    if (_search) {
      const q = _search.toLowerCase();
      d = d.filter(w => w.title.toLowerCase().includes(q)||w.city.toLowerCase().includes(q)||w.country.toLowerCase().includes(q));
    }
    _placeMarkers(d);
  }

  function _buildPills() {
    const countries = ['all', ...new Set(_all.map(w=>w.country).sort())];
    const el = document.getElementById('wc-cpills');
    if (el) el.innerHTML = countries.map(c=>
      `<button class="wc-pill${c==='all'?' on':''}" data-c="${c}">${c==='all'?'ALL':c}</button>`).join('');
  }

  // ── Drag ─────────────────────────────────────────────────────────────────────
  function _drag() {
    const hdr = _panel.querySelector('#wc-hdr');
    let on=false, ox=0, oy=0;
    hdr.addEventListener('mousedown', e => {
      if (e.target.tagName==='BUTTON' || _expanded) return;
      on=true; ox=e.clientX-_panel.offsetLeft; oy=e.clientY-_panel.offsetTop;
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    const mv = e => { if (!on) return;
      _panel.style.left=(e.clientX-ox)+'px'; _panel.style.top=(e.clientY-oy)+'px';
      _panel.style.right='auto'; _panel.style.bottom='auto'; };
    const up = () => { on=false;
      document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up);
      _map?.invalidateSize(); };
  }

  // ── Bind ─────────────────────────────────────────────────────────────────────
  function _bind() {
    _panel.querySelector('#wc-close').addEventListener('click', close);
    _panel.querySelector('#wc-refresh').addEventListener('click', ()=>load(true));

    _panel.querySelector('#wc-min').addEventListener('click', () => {
      _minimised = !_minimised;
      _panel.classList.toggle('minimised', _minimised);
      _panel.querySelector('#wc-min').textContent = _minimised ? '□' : '─';
      if (!_minimised) setTimeout(()=>_map?.invalidateSize(),60);
    });

    _panel.querySelector('#wc-exp').addEventListener('click', () => {
      if (!_expanded) {
        _savedPos = { left:_panel.style.left, top:_panel.style.top,
          right:_panel.style.right, bottom:_panel.style.bottom,
          width:_panel.style.width, height:_panel.style.height };
        _panel.classList.add('expanded');
      } else {
        _panel.classList.remove('expanded');
        Object.assign(_panel.style, _savedPos);
      }
      _expanded = !_expanded;
      setTimeout(()=>_map?.invalidateSize(),80);
    });

    _panel.querySelectorAll('.wc-tbtn').forEach(b =>
      b.addEventListener('click', ()=>_switchTile(b.dataset.tile)));

    _panel.addEventListener('click', e => {
      const p = e.target.closest('.wc-pill');
      if (!p) return;
      _panel.querySelectorAll('.wc-pill').forEach(b=>b.classList.remove('on'));
      p.classList.add('on');
      _country = p.dataset.c;
      _filter();
    });

    const s = document.getElementById('wc-search');
    if (s) s.addEventListener('input', ()=>{ _search=s.value.trim(); _filter(); });

    _drag();
  }

  // ── Load data ────────────────────────────────────────────────────────────────
  async function load(force=false) {
    const b = document.getElementById('wc-badge');
    if (b) { b.textContent='● LOADING'; b.style.color='#ffaa00'; }
    try {
      const r = await fetch(force ? '/api/webcams?flush=1' : '/api/webcams');
      const d = r.ok ? await r.json() : { webcams:[] };
      _all = d.webcams||[];
      _buildPills(); _filter();
      if (b) {
        b.textContent = `● ${_all.length} CAMS`;
        b.style.color = d.source==='windy_api' ? '#00ff88' : '#00d4ff';
      }
    } catch { if (b) { b.textContent='● ERR'; b.style.color='#ff4444'; } }
  }

  // ── Public ───────────────────────────────────────────────────────────────────
  function open() {
    _panel?.classList.add('open');
    setTimeout(()=>_map?.invalidateSize(),80);
  }
  function close() { _panel?.classList.remove('open'); }
  function init() {
    if (_inited) { open(); return; }
    _inited=true; _css(); _build(); _bind(); _initMap(); load(); open();
  }
  return { init, open, close, load };
})();
