/* ── ATROCITIES — Human Rights & Humanitarian Crisis Layer ────────────────────
   Sources : HDX HAPI · ACLED · UNOCHA · UNHCR · HRW · Amnesty International
   Renders : Leaflet 2D map + Globe.gl 3D globe (shared data, dual render)
   Categories: conflict | famine | displacement | mass_atrocity | crisis | human_rights
   ─────────────────────────────────────────────────────────────────────────── */
const ATROCITIES = (() => {

  // ── Category definitions ──────────────────────────────────────────────────
  const CATS = {
    conflict:      { label:'CONFLICT',     icon:'⚔',  color:'#ff2200', ring:'rgba(255,34,0,ALPHA)',   desc:'Armed conflict, battle deaths, military violence' },
    famine:        { label:'FAMINE',       icon:'🌾', color:'#ff8c00', ring:'rgba(255,140,0,ALPHA)',  desc:'IPC Phase 3–5 food insecurity, acute malnutrition' },
    displacement:  { label:'DISPLACED',   icon:'🏃', color:'#ffd700', ring:'rgba(255,215,0,ALPHA)',  desc:'IDPs, refugees, asylum seekers' },
    mass_atrocity: { label:'ATROCITY',    icon:'💀', color:'#cc00ff', ring:'rgba(200,0,255,ALPHA)',  desc:'Massacre, genocide, ethnic cleansing, war crimes' },
    crisis:        { label:'CRISIS',       icon:'🆘', color:'#ff0066', ring:'rgba(255,0,102,ALPHA)',  desc:'General humanitarian emergency, humanitarian needs' },
    human_rights:  { label:'HUM.RIGHTS',  icon:'⚠',  color:'#00bfff', ring:'rgba(0,191,255,ALPHA)',  desc:'Arbitrary detention, torture, suppression of rights' },
  };

  const ALL_TYPES = Object.keys(CATS);

  function _cfg(type) { return CATS[type] || CATS.conflict; }

  // ── State ─────────────────────────────────────────────────────────────────
  let _map     = null;
  let _globe   = null;
  let _enabled = false;
  let _data    = [];
  let _markers = [];
  let _filter  = 'all';
  let _panel   = null;
  let _fetched = false;

  // ── Severity helpers ──────────────────────────────────────────────────────
  function _sev(ev) {
    if (ev.severity) return ev.severity;
    const d = ev.fatalities || 0, p = ev.people_affected || 0;
    if (d > 10000 || p > 5000000) return 'critical';
    if (d > 1000  || p > 500000)  return 'high';
    if (d > 100   || p > 50000)   return 'medium';
    return 'low';
  }

  function _radius(ev) {
    const s = _sev(ev);
    return s === 'critical' ? 20 : s === 'high' ? 14 : s === 'medium' ? 9 : 6;
  }

  function _sevColor(sev) {
    return sev === 'critical' ? '#ff0000' : sev === 'high' ? '#ff8800' : sev === 'medium' ? '#ffcc00' : '#aaaaaa';
  }

  // ── 2D Leaflet rendering ──────────────────────────────────────────────────
  function _clearMap() {
    _markers.forEach(m => { try { _map?.removeLayer(m); } catch (_) {} });
    _markers = [];
  }

  function _renderMap() {
    _clearMap();
    if (!_map || !_enabled) return;

    const list = _filter === 'all' ? _data : _data.filter(e => e.type === _filter);

    list.forEach(ev => {
      if (!ev.lat || !ev.lng) return;
      const cfg = _cfg(ev.type);
      const sev = _sev(ev);
      const r   = _radius(ev);
      const col = cfg.color;

      // Outer halo for critical events
      if (sev === 'critical' || sev === 'high') {
        const halo = L.circleMarker([ev.lat, ev.lng], {
          radius: r + 10, color: col, fillColor: 'transparent',
          fillOpacity: 0, weight: 1, opacity: 0.25, dashArray: '4,4',
          interactive: false,
        });
        halo.addTo(_map);
        _markers.push(halo);
      }

      // Main circle
      const circle = L.circleMarker([ev.lat, ev.lng], {
        radius: r, color: col, fillColor: col,
        fillOpacity: 0.18, weight: 1.8, opacity: 0.9,
      });

      const deaths  = ev.fatalities     ? `<div style="color:#ff4444;font-size:8px;margin:2px 0">☠ Deaths: <b>${Number(ev.fatalities).toLocaleString()}</b></div>` : '';
      const people  = ev.people_affected ? `<div style="color:#ffaa00;font-size:8px;margin:2px 0">👥 Affected: <b>${_fmtPeople(ev.people_affected)}</b></div>` : '';
      const sevBadge = `<span style="color:${_sevColor(sev)};font-size:7px;font-weight:700;letter-spacing:.5px">${sev.toUpperCase()}</span>`;

      circle.bindPopup(`
        <div style="font-family:monospace;background:#050810;border:1px solid ${col};padding:8px 10px;border-radius:3px;min-width:200px;max-width:280px">
          <div style="color:${col};font-size:9px;font-weight:700;margin-bottom:2px">${cfg.icon} ${ev.country || '—'}</div>
          <div style="color:#c8dff0;font-size:8.5px;line-height:1.45;margin-bottom:5px">${ev.desc || ''}</div>
          ${deaths}${people}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;border-top:1px solid #0d1e2e;padding-top:4px">
            ${sevBadge}
            <span style="color:#3d5a78;font-size:7px">${ev.source || 'HDX HAPI'} · ${ev.date || ''}</span>
          </div>
        </div>
      `, { className: 'leaflet-popup-dark', maxWidth: 300 });

      circle.addTo(_map);
      _markers.push(circle);
    });
  }

  // ── Globe.gl rendering ────────────────────────────────────────────────────
  // Returns ring data for Globe.gl — merged in app.js updateGlobeRings()
  function getGlobeRings() {
    if (!_enabled || !_data.length) return [];
    const list = _filter === 'all' ? _data : _data.filter(e => e.type === _filter);
    return list.filter(e => e.lat && e.lng).map(ev => {
      const cfg  = _cfg(ev.type);
      const sev  = _sev(ev);
      const maxR = sev === 'critical' ? 4.5 : sev === 'high' ? 2.8 : sev === 'medium' ? 1.6 : 0.9;
      const spd  = sev === 'critical' ? 1.2 : sev === 'high' ? 2.0 : 3.0;
      return {
        lat: ev.lat, lng: ev.lng,
        maxR,
        propagationSpeed: spd,
        repeatPeriod: 1200 + Math.random() * 1500,
        color: () => cfg.ring.replace('ALPHA', (0.6 + Math.random() * 0.35).toFixed(2)),
        _isAtrocity: true,
        _label: `${cfg.icon} ${ev.country}: ${ev.desc?.slice(0, 60) || ''}`,
      };
    });
  }

  // Returns label data for Globe.gl
  function getGlobeLabels() {
    if (!_enabled || !_data.length) return [];
    const list = (_filter === 'all' ? _data : _data.filter(e => e.type === _filter))
      .filter(e => _sev(e) === 'critical' && e.lat && e.lng);
    return list.slice(0, 30).map(ev => ({
      lat: ev.lat, lng: ev.lng,
      text: `${_cfg(ev.type).icon} ${ev.country}`,
      color: _cfg(ev.type).color,
      size: 0.4,
      dotRadius: 0.3,
      _isAtrocity: true,
    }));
  }

  // ── Stats panel ───────────────────────────────────────────────────────────
  function _buildPanel() {
    if (_panel || !document.getElementById('map-wrap')) return;
    _panel = document.createElement('div');
    _panel.id = 'atrocity-panel';
    _panel.innerHTML = `
      <div class="atr-hdr">
        <span class="atr-icon">🆘</span>
        <span class="atr-title">HUMAN ATROCITIES</span>
        <span class="atr-src">HDX HAPI · ACLED · UNHCR</span>
      </div>
      <div id="atr-stats" class="atr-stats"></div>
      <div class="atr-filter-row" id="atr-filters">
        ${['all', ...ALL_TYPES].map(k => {
          const c = k === 'all' ? { icon: '◉', label: 'ALL', color: '#c8dff0' } : _cfg(k);
          return `<button class="atr-pill${k === 'all' ? ' active' : ''}" data-cat="${k}"
            style="${k === 'all' ? 'color:#c8dff0;border-color:rgba(200,220,240,.4)' : ''}"
            onclick="ATROCITIES.setFilter('${k}',this)"
            title="${CATS[k]?.desc || 'All categories'}">${c.icon} ${c.label}</button>`;
        }).join('')}
      </div>
      <div id="atr-legend" class="atr-legend">
        <span class="atr-leg-item"><span style="background:#ff0000" class="atr-dot"></span>CRITICAL</span>
        <span class="atr-leg-item"><span style="background:#ff8800" class="atr-dot"></span>HIGH</span>
        <span class="atr-leg-item"><span style="background:#ffcc00" class="atr-dot"></span>MEDIUM</span>
        <span class="atr-leg-item"><span style="background:#555" class="atr-dot"></span>LOW</span>
      </div>
    `;
    document.getElementById('map-wrap').appendChild(_panel);
  }

  function _updateStats() {
    const el = document.getElementById('atr-stats');
    if (!el) return;
    const list  = _filter === 'all' ? _data : _data.filter(e => e.type === _filter);
    const dead  = list.reduce((s, e) => s + (e.fatalities || 0), 0);
    const aff   = list.reduce((s, e) => s + (e.people_affected || 0), 0);
    const crit  = list.filter(e => _sev(e) === 'critical').length;
    el.innerHTML = `
      <div class="atr-stat"><span class="atr-sv" style="color:#ff4444">${dead > 1e6 ? (dead/1e6).toFixed(1)+'M' : dead.toLocaleString()}</span><span class="atr-sl">DEATHS</span></div>
      <div class="atr-stat"><span class="atr-sv" style="color:#ffaa00">${_fmtPeople(aff)}</span><span class="atr-sl">AFFECTED</span></div>
      <div class="atr-stat"><span class="atr-sv" style="color:#ff0066">${crit}</span><span class="atr-sl">CRITICAL</span></div>
      <div class="atr-stat"><span class="atr-sv" style="color:#c8dff0">${list.length}</span><span class="atr-sl">EVENTS</span></div>
    `;
  }

  function _fmtPeople(n) {
    if (!n) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return n.toString();
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  async function _fetch() {
    if (_fetched && _data.length) return;
    try {
      const r = await fetch('/api/atrocities');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      _data   = d.events || [];
      _fetched = true;
    } catch (e) {
      console.warn('[ATROCITIES] fetch failed:', e.message);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {

    init(map) {
      _map = map;
      _buildPanel();
    },

    setGlobe(g) { _globe = g; },

    setEnabled(on) {
      _enabled = on;
      const panel = document.getElementById('atrocity-panel');
      if (panel) panel.style.display = on ? 'block' : 'none';

      if (on && !_fetched) {
        _fetch().then(() => {
          _renderMap();
          _updateStats();
          if (window.APP_updateGlobeRings) window.APP_updateGlobeRings();
        });
      } else if (on) {
        _renderMap();
        _updateStats();
        if (window.APP_updateGlobeRings) window.APP_updateGlobeRings();
      } else {
        _clearMap();
        if (window.APP_updateGlobeRings) window.APP_updateGlobeRings();
      }
    },

    setFilter(cat, btn) {
      _filter = cat;
      document.querySelectorAll('.atr-pill').forEach(b => {
        const isA = b.dataset.cat === cat;
        b.classList.toggle('active', isA);
        if (isA) {
          const cfg = cat === 'all' ? { color: '#c8dff0' } : _cfg(cat);
          b.style.color       = cfg.color;
          b.style.borderColor = cfg.color + '66';
          b.style.background  = cfg.color + '18';
        } else {
          b.style.color = ''; b.style.borderColor = ''; b.style.background = '';
        }
      });
      _renderMap();
      _updateStats();
      if (window.APP_updateGlobeRings) window.APP_updateGlobeRings();
    },

    isEnabled()     { return _enabled; },
    getGlobeRings() { return getGlobeRings(); },
    getGlobeLabels(){ return getGlobeLabels(); },
    getData()       { return _data; },
  };
})();
