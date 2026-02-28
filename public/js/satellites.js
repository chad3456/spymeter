/* ── Satellite Tracking – CelesTrak TLE + satellite.js ── */
const SATELLITES = (() => {
  let map      = null;
  let layer    = null;
  let enabled  = true;
  let satData  = [];         // { name, line1, line2, satrec, marker, path }
  let maxSats  = 200;        // render budget
  let selected = null;
  let currentType = 'active';
  let pathLine    = null;    // orbit path polyline for selected sat

  const SAT_COLORS = {
    default:  '#00ff88',
    military: '#ff9900',
    spy:      '#ff3355',
    station:  '#00d4ff',
    nav:      '#aa44ff',
  };

  const MIL_PATTERNS = [/USA-\d+/, /NOSS/, /KH-\d+/, /LACROSSE/, /MISTY/, /TRUMPET/, /ADVANCED KH/, /WGS-/i, /MUOS-/i, /AEHF-/i, /MILSTAR/i, /DSP-/i, /SBIRS-/i, /NAVSTAR/i];
  const NAV_PATTERNS = [/GPS/, /GLONASS/, /GALILEO/, /BEIDOU/, /IRNSS/, /QZSS/];

  function classifySat(name) {
    const n = name.toUpperCase();
    if (MIL_PATTERNS.some(r => r.test(n))) return 'military';
    if (NAV_PATTERNS.some(r => r.test(n)))  return 'nav';
    if (/ISS|TIANGONG|CSS/.test(n))         return 'station';
    return 'default';
  }

  function satColor(name) {
    return SAT_COLORS[classifySat(name)] || SAT_COLORS.default;
  }

  function propagate(satrec, date = new Date()) {
    try {
      const pv = satellite.propagate(satrec, date);
      if (!pv.position) return null;
      const gmst = satellite.gstime(date);
      const gd   = satellite.eciToGeodetic(pv.position, gmst);
      const lat  = satellite.degreesLat(gd.latitude);
      const lng  = satellite.degreesLong(gd.longitude);
      const alt  = gd.height; // km
      if (isNaN(lat) || isNaN(lng)) return null;
      return { lat, lng, alt };
    } catch (_) { return null; }
  }

  function orbitPath(satrec, steps = 180) {
    const period = (2 * Math.PI / satrec.no) * 60; // seconds
    const now    = Date.now();
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t   = new Date(now + (i / steps) * period * 1000);
      const pos = propagate(satrec, t);
      if (pos) points.push([pos.lat, pos.lng]);
    }
    // Handle antimeridian crossing
    const segs = [];
    let seg = [];
    for (let i = 0; i < points.length; i++) {
      if (i > 0 && Math.abs(points[i][1] - points[i-1][1]) > 180) {
        segs.push(seg);
        seg = [];
      }
      seg.push(points[i]);
    }
    segs.push(seg);
    return segs;
  }

  function makePopup(s) {
    const cls = classifySat(s.name);
    const tag = cls === 'military' ? '🛰 MIL SAT' : cls === 'station' ? '🌍 STATION' : '🛰 SAT';
    const pos = s.pos || {};
    return `
      <div class="popup-box">
        <div class="popup-title">${tag}: ${s.name}</div>
        <div class="popup-row"><span class="popup-key">LAT</span><span class="popup-val">${(pos.lat||0).toFixed(3)}°</span></div>
        <div class="popup-row"><span class="popup-key">LNG</span><span class="popup-val">${(pos.lng||0).toFixed(3)}°</span></div>
        <div class="popup-row"><span class="popup-key">ALT</span><span class="popup-val green">${Math.round(pos.alt||0)} km</span></div>
        <div class="popup-row"><span class="popup-key">CLASS</span><span class="popup-val orange">${cls.toUpperCase()}</span></div>
        <div class="popup-row"><span class="popup-key">NORAD</span><span class="popup-val">${s.line1.substring(2,7).trim()}</span></div>
      </div>`;
  }

  function showOrbitPath(s) {
    if (pathLine) { map.removeLayer(pathLine); pathLine = null; }
    try {
      const segs = orbitPath(s.satrec);
      pathLine = L.polyline(segs, {
        color: satColor(s.name),
        weight: 1,
        opacity: 0.5,
        dashArray: '6 4',
        className: 'sat-trail'
      }).addTo(map);
    } catch (_) {}
  }

  function createMarker(s) {
    const color = satColor(s.name);
    const icon  = L.divIcon({
      html: `<div class="sat-icon-div" style="color:${color}" title="${s.name}">◉</div>`,
      className: '',
      iconSize: [10,10],
      iconAnchor: [5,5]
    });
    const m = L.marker([s.pos.lat, s.pos.lng], { icon, zIndexOffset: 100 });
    m.bindPopup(makePopup(s), { maxWidth: 260 });
    m.on('click', () => {
      selected = s;
      showOrbitPath(s);
      SIDEBAR.addFeedItem('satellite', `Tracking ${s.name} | ALT ${Math.round(s.pos?.alt||0)} km`);
      SIDEBAR.highlightSat(s.name);
    });
    if (layer) m.addTo(layer);
    return m;
  }

  function updatePositions() {
    if (!enabled) return;
    const now = new Date();
    satData.forEach(s => {
      const pos = propagate(s.satrec, now);
      if (!pos) return;
      s.pos = pos;
      if (s.marker) {
        s.marker.setLatLng([pos.lat, pos.lng]);
        if (s.marker.isPopupOpen()) s.marker.setPopupContent(makePopup(s));
      }
    });
    // Update selected orbit path
    if (selected && pathLine) showOrbitPath(selected);
  }

  async function loadTLE(type = 'active') {
    currentType = type;
    try {
      const resp = await window.fetch(`/api/satellites/${type}`);
      if (!resp.ok) throw new Error(resp.status);
      const text = await resp.text();
      const parsed = UTILS.parseTLE(text);

      // Clear old
      if (layer) layer.clearLayers();
      if (pathLine) { map.removeLayer(pathLine); pathLine = null; }
      satData = [];

      // Build satrec, limit render budget
      const subset = parsed.slice(0, maxSats);
      const now    = new Date();

      subset.forEach(({ name, line1, line2 }) => {
        try {
          const satrec = satellite.twoline2satrec(line1, line2);
          const pos    = propagate(satrec, now);
          if (!pos) return;
          const entry = { name, line1, line2, satrec, pos, marker: null };
          entry.marker = createMarker(entry);
          satData.push(entry);
        } catch (_) {}
      });

      const el = document.getElementById('sv-sats');
      if (el) el.textContent = satData.length.toLocaleString();

      SIDEBAR.populateSatList(satData);
      SIDEBAR.addFeedItem('satellite', `Loaded ${satData.length} satellites [${type.toUpperCase()}]`);
    } catch (e) {
      console.warn('[Satellites] fetch error:', e.message);
    }
  }

  function init(mapInstance) {
    map   = mapInstance;
    layer = L.layerGroup().addTo(map);
    loadTLE('active');
    // Update positions every 5 seconds
    setInterval(updatePositions, 5000);
    // Reload TLE every 5 minutes
    setInterval(() => loadTLE(currentType), 300_000);
  }

  function setEnabled(on) {
    enabled = on;
    if (layer) {
      if (on) { layer.addTo(map); }
      else    { map.removeLayer(layer); if (pathLine) map.removeLayer(pathLine); }
    }
  }

  function switchType(type) { loadTLE(type); }

  return { init, setEnabled, switchType, loadTLE };
})();
