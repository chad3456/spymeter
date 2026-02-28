/* ── Visual effects: night vision, clock, HUD ─────────── */
const EFFECTS = (() => {
  let nvActive = false;

  function initClock() {
    const el = document.getElementById('utc-clock');
    function tick() {
      const now = new Date();
      const h = String(now.getUTCHours()).padStart(2,'0');
      const m = String(now.getUTCMinutes()).padStart(2,'0');
      const s = String(now.getUTCSeconds()).padStart(2,'0');
      el.textContent = `${h}:${m}:${s} UTC`;
    }
    tick();
    setInterval(tick, 1000);
  }

  function toggleNightVision() {
    nvActive = !nvActive;
    document.body.classList.toggle('nv-mode', nvActive);
    const btn = document.getElementById('nv-btn');
    btn.classList.toggle('active', nvActive);
    btn.title = nvActive ? 'Disable Night Vision' : 'Enable Night Vision';
    addScanlineNoise(nvActive);
  }

  function addScanlineNoise(on) {
    const sl = document.getElementById('scanlines');
    if (on) {
      sl.style.opacity = '1';
      // Occasional flicker
      setInterval(() => {
        if (!nvActive) return;
        sl.style.opacity = Math.random() > 0.95 ? String(0.3 + Math.random()*0.5) : '1';
      }, 100);
    } else {
      sl.style.opacity = '0';
    }
  }

  function initCoordHud(map) {
    const latEl  = document.getElementById('hud-lat');
    const lngEl  = document.getElementById('hud-lng');
    const zoomEl = document.getElementById('hud-zoom');

    map.on('mousemove', e => {
      latEl.textContent  = `LAT ${e.latlng.lat.toFixed(4)}°`;
      lngEl.textContent  = `LNG ${e.latlng.lng.toFixed(4)}°`;
    });
    map.on('zoom', () => {
      zoomEl.textContent = `Z ${map.getZoom()}`;
    });
    zoomEl.textContent = `Z ${map.getZoom()}`;
  }

  function setLastUpdate() {
    const el = document.getElementById('last-upd');
    if (el) el.textContent = 'UPD ' + UTILS.fmtTime();
  }

  function setWsStatus(status) {
    const el = document.getElementById('ws-status');
    if (!el) return;
    el.textContent = 'WS: ' + status.toUpperCase();
    el.className   = status === 'connected' ? 'connected' : '';
  }

  return { initClock, toggleNightVision, initCoordHud, setLastUpdate, setWsStatus };
})();
