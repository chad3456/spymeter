'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   WEBCAMS MODULE — Live World Webcam Map
   Data: Windy.com Webcams API (WINDY_KEY env) or curated ~90-cam fallback
   UI:   Full-page overlay with Leaflet world map + MarkerCluster
         Click camera marker → live webcam stream popup
════════════════════════════════════════════════════════════════════════════ */
const WEBCAMS = (() => {

  let _inited   = false;
  let _map      = null;
  let _cluster  = null;
  let _all      = [];
  let _country  = 'all';
  let _cat      = 'all';
  let _search   = '';
  let _overlay  = null;
  let _refreshT = null;

  const CAT_COLORS = {
    landmark: '#ffaa00',
    city:     '#00d4ff',
    nature:   '#00ff88',
    mountain: '#a0c8ff',
    beach:    '#ff9933',
    wildlife: '#88dd44',
    webcam:   '#9b59ff',
  };

  const CAT_ICONS = {
    landmark: '🏛',
    city:     '🏙',
    nature:   '🌿',
    mountain: '⛰',
    beach:    '🏖',
    wildlife: '🦁',
    webcam:   '📷',
  };

  // ── Inject CSS ─────────────────────────────────────────────────────────────
  function _css() {
    if (document.getElementById('wc-styles')) return;
    const s = document.createElement('style');
    s.id = 'wc-styles';
    s.textContent = `
      /* Overlay */
      #wc-overlay{position:fixed;inset:0;z-index:3000;display:none;flex-direction:column;background:#04060a;font-family:'Courier New',monospace}
      #wc-overlay.open{display:flex}

      /* Topbar */
      #wc-topbar{display:flex;align-items:center;gap:10px;padding:6px 12px;background:rgba(0,0,0,.7);border-bottom:1px solid #0d1e2e;flex-shrink:0;z-index:10}
      #wc-title{font-size:10px;font-weight:700;letter-spacing:2px;color:#00d4ff}
      #wc-badge{font-size:7px;padding:2px 6px;border-radius:2px;background:rgba(0,212,255,.15);color:#00d4ff;letter-spacing:.5px}
      #wc-close-btn{margin-left:auto;background:rgba(255,68,68,.15);border:1px solid rgba(255,68,68,.4);color:#ff6666;font-size:8px;padding:4px 10px;border-radius:2px;cursor:pointer;letter-spacing:1px;transition:all .15s}
      #wc-close-btn:hover{background:rgba(255,68,68,.3);color:#fff}
      #wc-refresh-btn{background:transparent;border:1px solid #1a3040;color:#3d5a78;font-size:8px;padding:4px 9px;border-radius:2px;cursor:pointer;transition:all .15s}
      #wc-refresh-btn:hover{border-color:#00d4ff;color:#00d4ff}

      /* Filters row */
      #wc-filters{display:flex;align-items:center;gap:6px;padding:5px 12px;background:rgba(0,0,0,.5);border-bottom:1px solid #0d1e2e;flex-shrink:0;flex-wrap:wrap}
      .wc-pill{background:transparent;border:1px solid #1a3040;color:#3d5a78;font-size:6.5px;padding:2px 7px;border-radius:10px;cursor:pointer;white-space:nowrap;transition:all .15s}
      .wc-pill.active{background:rgba(0,212,255,.12);border-color:rgba(0,212,255,.5);color:#00d4ff}
      .wc-pill:hover:not(.active){border-color:#3d5a78;color:#c8dff0}
      #wc-search{background:rgba(255,255,255,.05);border:1px solid #1a3040;color:#c8dff0;font-size:7.5px;padding:3px 8px;border-radius:2px;outline:none;width:160px}
      #wc-search::placeholder{color:#3d5a78}
      #wc-search:focus{border-color:#00d4ff}
      #wc-count{font-size:7px;color:#3d5a78;margin-left:auto;white-space:nowrap}

      /* Map */
      #wc-map{flex:1;z-index:1}
      #wc-map .leaflet-container{background:#04060a}
      #wc-map .leaflet-tile{filter:brightness(.85) saturate(.7) hue-rotate(170deg)}

      /* Custom camera icon */
      .wc-cam-icon{background:none;border:none}
      .wc-cam-dot{width:18px;height:18px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-size:9px;cursor:pointer;transition:transform .15s;box-shadow:0 0 6px currentColor}
      .wc-cam-dot:hover{transform:scale(1.3)}

      /* Popup */
      .wc-popup{min-width:260px;max-width:300px;font-family:'Courier New',monospace}
      .wc-popup-img{width:100%;height:160px;object-fit:cover;border-radius:2px;margin-bottom:6px;background:#0d1e2e;display:block}
      .wc-popup-title{font-size:10px;font-weight:700;color:#c8dff0;margin-bottom:2px}
      .wc-popup-loc{font-size:8px;color:#3d5a78;margin-bottom:6px}
      .wc-popup-btns{display:flex;gap:5px}
      .wc-popup-btn{flex:1;padding:5px 8px;font-size:7.5px;font-weight:700;letter-spacing:.5px;border-radius:2px;cursor:pointer;text-align:center;text-decoration:none;display:block;border:1px solid}
      .wc-popup-btn.primary{background:rgba(0,212,255,.15);border-color:rgba(0,212,255,.4);color:#00d4ff}
      .wc-popup-btn.primary:hover{background:rgba(0,212,255,.3)}
      .wc-popup-btn.secondary{background:rgba(255,255,255,.05);border-color:#1a3040;color:#5a7a9a}
      .wc-popup-btn.secondary:hover{border-color:#3d5a78;color:#c8dff0}

      /* Stream modal */
      #wc-stream-modal{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;background:#04060a;border:1px solid #0d1e2e;border-radius:4px;padding:0;overflow:hidden;box-shadow:0 0 40px rgba(0,0,0,.8);display:none}
      #wc-stream-modal.open{display:block}
      #wc-stream-hdr{display:flex;align-items:center;padding:6px 10px;background:rgba(0,0,0,.5);border-bottom:1px solid #0d1e2e;gap:8px}
      #wc-stream-title{font-size:8.5px;font-weight:700;color:#00d4ff;flex:1}
      #wc-stream-close{background:transparent;border:none;color:#ff4444;font-size:14px;cursor:pointer;padding:0 2px;line-height:1}
      #wc-stream-iframe{display:block;border:none}

      /* Cluster style overrides */
      .marker-cluster-small,.marker-cluster-medium,.marker-cluster-large{background:rgba(0,212,255,.15)!important}
      .marker-cluster-small div,.marker-cluster-medium div,.marker-cluster-large div{background:rgba(0,212,255,.35)!important;color:#00d4ff!important;font-size:10px!important;font-weight:700!important}

      /* Leaflet popup dark */
      .wc-popup-container .leaflet-popup-content-wrapper{background:#060e1a;border:1px solid #1a3040;border-radius:4px;color:#c8dff0;box-shadow:0 0 20px rgba(0,0,0,.8)}
      .wc-popup-container .leaflet-popup-tip{background:#060e1a}
      .wc-popup-container .leaflet-popup-close-button{color:#3d5a78!important}
      .wc-popup-container .leaflet-popup-close-button:hover{color:#ff4444!important}
    `;
    document.head.appendChild(s);
  }

  // ── Build overlay HTML ─────────────────────────────────────────────────────
  function _buildOverlay() {
    const el = document.createElement('div');
    el.id = 'wc-overlay';
    el.innerHTML = `
      <div id="wc-topbar">
        <span style="font-size:18px">🎥</span>
        <span id="wc-title">LIVE WORLD WEBCAMS</span>
        <span id="wc-badge">● LOADING</span>
        <button id="wc-refresh-btn">↻ REFRESH</button>
        <button id="wc-close-btn">✕ CLOSE</button>
      </div>

      <div id="wc-filters">
        <span style="font-size:7px;color:#3d5a78;letter-spacing:.5px">COUNTRY</span>
        <div id="wc-country-pills" style="display:flex;gap:3px;flex-wrap:wrap"></div>
        <span style="font-size:7px;color:#3d5a78;letter-spacing:.5px;margin-left:8px">TYPE</span>
        <div id="wc-cat-pills" style="display:flex;gap:3px;flex-wrap:wrap"></div>
        <input id="wc-search" placeholder="🔍 search city or country…" autocomplete="off">
        <span id="wc-count">—</span>
      </div>

      <div id="wc-map"></div>

      <div id="wc-stream-modal">
        <div id="wc-stream-hdr">
          <span id="wc-stream-title">WEBCAM LIVE</span>
          <button id="wc-stream-close">✕</button>
        </div>
        <iframe id="wc-stream-iframe" src="" width="640" height="380" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(el);
    _overlay = el;
  }

  // ── Init Leaflet map ───────────────────────────────────────────────────────
  function _initMap() {
    if (_map) return;
    _map = L.map('wc-map', {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 16,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CartoDB',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(_map);

    _cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction(cluster) {
        const cnt = cluster.getChildCount();
        return L.divIcon({
          html: `<div style="background:rgba(0,212,255,.2);border:2px solid rgba(0,212,255,.6);border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#00d4ff;box-shadow:0 0 10px rgba(0,212,255,.3)">${cnt}</div>`,
          className: '',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
      },
    });
    _map.addLayer(_cluster);
  }

  // ── Make camera icon ───────────────────────────────────────────────────────
  function _camIcon(cat) {
    const col  = CAT_COLORS[cat] || '#9b59ff';
    const icon = CAT_ICONS[cat]  || '📷';
    return L.divIcon({
      html: `<div class="wc-cam-dot" style="color:${col};border-color:${col};background:${col}22">${icon}</div>`,
      className: 'wc-cam-icon',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  // ── Build popup content ────────────────────────────────────────────────────
  function _popupHtml(w) {
    const col = CAT_COLORS[w.cat] || '#9b59ff';
    return `<div class="wc-popup">
      <img class="wc-popup-img" src="${w.thumb}"
           onerror="this.src='';this.style.background='#0d1e2e';this.style.height='40px';this.alt='No preview'"
           alt="${w.title} preview" loading="lazy">
      <div class="wc-popup-title">${w.title}</div>
      <div class="wc-popup-loc" style="color:${col}">📍 ${w.city}, ${w.country} · ${(w.cat||'').toUpperCase()}</div>
      <div class="wc-popup-btns">
        <span class="wc-popup-btn primary" onclick="WEBCAMS.openStream('${w.id}','${w.title.replace(/'/g,'')}','${w.embed}')">▶ LIVE STREAM</span>
        <a class="wc-popup-btn secondary" href="${w.url}" target="_blank" rel="noopener">↗ WINDY.COM</a>
      </div>
    </div>`;
  }

  // ── Place markers on map ───────────────────────────────────────────────────
  function _placeMarkers(list) {
    _cluster.clearLayers();
    list.forEach(w => {
      if (!w.lat || !w.lon) return;
      const marker = L.marker([w.lat, w.lon], { icon: _camIcon(w.cat) });
      marker.bindPopup(_popupHtml(w), {
        className: 'wc-popup-container',
        maxWidth: 300,
        autoPanPadding: [30, 30],
      });
      _cluster.addLayer(marker);
    });
    const cnt = document.getElementById('wc-count');
    if (cnt) cnt.textContent = `${list.length} webcams`;
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  function _applyFilters() {
    let data = _all.slice();
    if (_country !== 'all') data = data.filter(w => w.country === _country);
    if (_cat     !== 'all') data = data.filter(w => w.cat     === _cat);
    if (_search) {
      const q = _search.toLowerCase();
      data = data.filter(w =>
        w.title.toLowerCase().includes(q)   ||
        w.city.toLowerCase().includes(q)    ||
        w.country.toLowerCase().includes(q)
      );
    }
    _placeMarkers(data);
  }

  // ── Build filter pills ─────────────────────────────────────────────────────
  function _buildFilters() {
    // Countries
    const countries = ['all', ...new Set(_all.map(w => w.country).sort())];
    const cpEl = document.getElementById('wc-country-pills');
    if (cpEl) {
      cpEl.innerHTML = countries.map(c =>
        `<button class="wc-pill${c==='all'?' active':''}" data-filter="country" data-val="${c}">${c==='all'?'ALL':c}</button>`
      ).join('');
    }

    // Categories
    const cats = ['all', ...new Set(_all.map(w => w.cat).filter(Boolean).sort())];
    const catEl = document.getElementById('wc-cat-pills');
    if (catEl) {
      catEl.innerHTML = cats.map(c =>
        `<button class="wc-pill${c==='all'?' active':''}" data-filter="cat" data-val="${c}">${c==='all'?'ALL TYPES':(CAT_ICONS[c]||'')+ ' '+c.toUpperCase()}</button>`
      ).join('');
    }
  }

  // ── Bind events ────────────────────────────────────────────────────────────
  function _bindEvents() {
    document.getElementById('wc-close-btn')?.addEventListener('click', close);
    document.getElementById('wc-refresh-btn')?.addEventListener('click', () => load(true));
    document.getElementById('wc-stream-close')?.addEventListener('click', closeStream);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (document.getElementById('wc-stream-modal')?.classList.contains('open')) {
          closeStream();
        } else if (_overlay?.classList.contains('open')) {
          close();
        }
      }
    });

    _overlay.addEventListener('click', e => {
      const pill = e.target.closest('.wc-pill');
      if (!pill) return;
      const { filter, val } = pill.dataset;
      _overlay.querySelectorAll(`.wc-pill[data-filter="${filter}"]`).forEach(b => b.classList.remove('active'));
      pill.classList.add('active');
      if (filter === 'country') _country = val;
      if (filter === 'cat')     _cat     = val;
      _applyFilters();
    });

    const searchEl = document.getElementById('wc-search');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        _search = searchEl.value.trim();
        _applyFilters();
      });
    }
  }

  // ── Fetch data ─────────────────────────────────────────────────────────────
  async function load(force = false) {
    const badge = document.getElementById('wc-badge');
    if (badge) { badge.textContent = '● LOADING'; badge.style.color = '#ffaa00'; }

    try {
      const r = await fetch(force ? '/api/webcams?flush=1' : '/api/webcams');
      const d = r.ok ? await r.json() : { webcams: [] };
      _all = d.webcams || [];

      _buildFilters();
      _applyFilters();

      if (badge) {
        const isLive = d.source === 'windy_api';
        badge.textContent = isLive ? `● LIVE — ${_all.length} WEBCAMS` : `● ${_all.length} CURATED CAMS`;
        badge.style.color  = isLive ? '#00ff88' : '#00d4ff';
        badge.style.background = isLive ? 'rgba(0,255,136,.1)' : 'rgba(0,212,255,.1)';
      }
    } catch (err) {
      if (badge) { badge.textContent = '● ERROR'; badge.style.color = '#ff4444'; }
      console.error('[Webcams] load error:', err);
    }
  }

  // ── Public: open stream modal ──────────────────────────────────────────────
  function openStream(id, title, embedUrl) {
    const modal  = document.getElementById('wc-stream-modal');
    const iframe = document.getElementById('wc-stream-iframe');
    const hdr    = document.getElementById('wc-stream-title');
    if (!modal || !iframe) return;
    if (hdr) hdr.textContent = title || 'WEBCAM LIVE';
    iframe.src = embedUrl || `https://webcams.windy.com/webcams/public/embed/player/${id}`;
    modal.classList.add('open');
  }

  function closeStream() {
    const modal  = document.getElementById('wc-stream-modal');
    const iframe = document.getElementById('wc-stream-iframe');
    if (modal)  modal.classList.remove('open');
    if (iframe) iframe.src = '';
  }

  // ── Public: open overlay ───────────────────────────────────────────────────
  function open() {
    if (!_overlay) return;
    _overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Leaflet needs a moment after display before rendering correctly
    setTimeout(() => {
      if (_map) _map.invalidateSize();
      else { _initMap(); load(); }
    }, 80);
  }

  function close() {
    closeStream();
    if (_overlay) _overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Init (called from right-panel tab click) ───────────────────────────────
  function init() {
    if (_inited) { open(); return; }
    _inited = true;
    _css();
    _buildOverlay();
    _bindEvents();
    _initMap();
    load();
    open();

    // Auto-refresh thumbnails every 15 min
    _refreshT = setInterval(() => { if (_overlay?.classList.contains('open')) load(); }, 15 * 60_000);
  }

  return { init, open, close, load, openStream, closeStream };
})();
