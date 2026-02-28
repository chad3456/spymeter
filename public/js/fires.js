/* ── FIRMS Active Fire Data – NASA MODIS ──────────────────
   Fetches CSV from server proxy and plots fire hotspots.   */
const FIRES = (() => {
  let map     = null;
  let layer   = null;
  let enabled = false;
  let count   = 0;

  // Parse NASA FIRMS CSV (lat,lon,brightness,scan,track,acq_date,acq_time,…)
  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const pts = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const lat  = parseFloat(cols[0]);
      const lon  = parseFloat(cols[1]);
      const bright = parseFloat(cols[2]) || 300;
      if (isNaN(lat) || isNaN(lon)) continue;
      pts.push({ lat, lon, bright });
    }
    return pts;
  }

  function brightColor(b) {
    if (b > 420) return '#ff2200';
    if (b > 380) return '#ff6600';
    if (b > 340) return '#ff9900';
    return '#ffcc00';
  }

  function addFireDots(pts) {
    if (!layer) return;
    layer.clearLayers();
    count = 0;
    pts.forEach(p => {
      const col  = brightColor(p.bright);
      const icon = L.divIcon({
        html: `<div class="fire-dot" style="background:${col};box-shadow:0 0 4px ${col}"></div>`,
        className: '',
        iconSize: [5, 5],
        iconAnchor: [2, 2]
      });
      const m = L.marker([p.lat, p.lon], { icon });
      m.bindPopup(`
        <div class="popup-box">
          <div class="popup-title">🔥 ACTIVE FIRE</div>
          <div class="popup-row"><span class="popup-key">LAT/LNG</span><span class="popup-val">${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</span></div>
          <div class="popup-row"><span class="popup-key">BRIGHTNESS</span><span class="popup-val orange">${p.bright.toFixed(0)} K</span></div>
        </div>`, { maxWidth: 200 });
      m.addTo(layer);
      count++;
    });
    const el = document.getElementById('sv-fires');
    if (el) el.textContent = count.toLocaleString();
    SIDEBAR.addFeedItem('alert', `🔥 Loaded ${count} active fire hotspots (NASA MODIS 24h)`);
  }

  async function load() {
    try {
      const resp = await window.fetch('/api/fires');
      if (!resp.ok) throw new Error(resp.status);
      const text = await resp.text();
      const pts  = parseCSV(text);
      addFireDots(pts);
    } catch (e) {
      console.warn('[Fires] fetch error:', e.message);
      SIDEBAR.addFeedItem('alert', 'Fire data temporarily unavailable');
    }
  }

  function init(mapInstance) {
    map   = mapInstance;
    layer = L.layerGroup(); // off by default
  }

  function setEnabled(on) {
    enabled = on;
    if (!layer) return;
    if (on) {
      layer.addTo(map);
      if (count === 0) load();
      SIDEBAR.addFeedItem('alert', 'NASA FIRMS fire layer enabled');
    } else {
      map.removeLayer(layer);
    }
  }

  function getCount() { return count; }

  return { init, setEnabled, getCount };
})();
