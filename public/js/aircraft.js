/* ── Live Aircraft – OpenSky Network ──────────────────── */
const AIRCRAFT = (() => {
  let map          = null;
  let layer        = null;
  let enabled      = true;
  let markers      = {};   // icao24 → marker
  let data         = [];   // current states
  let activeCountries = new Set();
  let selectedIcao = null;

  // OpenSky state vector indices
  const I = {
    icao: 0, callsign: 1, origin: 2, lat: 6, lon: 5,
    alt: 7, on_ground: 8, velocity: 9, heading: 10, vert_rate: 11
  };

  const MIL_PATTERNS = [
    /^(AF|USAF|NAVY|USMC|USCG|RRR|RCH|SPAR|EXEC|PAT|SKILL|REACH|ATLAS|VIPER|HAWK|EAGLE|JOLLY|PEDRO|GHOST|REAPER|GLOBAL|IRON|STEEL|KNIGHT)/i,
    /^(RFF|GAF|FAF|FAB|RAFAIR|NATO|NATA|CANAV|RAAF)/i,
    /^(KNIFE|SWORD|SABRE|LANCE|ARROW|SHIELD|SPEAR|FURY|DRAGON|THUNDER)/i,
  ];

  function isMilitary(callsign = '') {
    return MIL_PATTERNS.some(r => r.test(callsign.trim()));
  }

  function aircraftEmoji(callsign = '', heading = 0, alt = 0, onGround = false) {
    if (onGround) return '🛬';
    if (isMilitary(callsign)) return '🛩';
    return '✈';
  }

  function headingToCSS(deg) {
    return `rotate(${(deg || 0) - 45}deg)`;
  }

  function speedKts(mps) {
    return mps ? Math.round(mps * 1.944) : '?';
  }

  function altFt(m) {
    return m ? Math.round(m * 3.281).toLocaleString() : '?';
  }

  function makePopup(s) {
    const cs     = (s[I.callsign] || '').trim() || 'N/A';
    const origin = s[I.origin] || 'Unknown';
    const spd    = speedKts(s[I.velocity]);
    const alt    = altFt(s[I.alt]);
    const hdg    = s[I.heading] ? Math.round(s[I.heading]) + '°' : '?';
    const vr     = s[I.vert_rate] ? s[I.vert_rate].toFixed(1) + ' m/s' : '0';
    const ground = s[I.on_ground] ? 'YES' : 'NO';
    const mil    = isMilitary(cs);
    return `
      <div class="popup-box">
        <div class="popup-title">${mil ? '🛩 MIL ' : '✈ '}${cs}</div>
        <div class="popup-row"><span class="popup-key">ICAO24</span><span class="popup-val">${s[I.icao]}</span></div>
        <div class="popup-row"><span class="popup-key">ORIGIN</span><span class="popup-val">${origin}</span></div>
        <div class="popup-row"><span class="popup-key">ALT</span><span class="popup-val green">${alt} ft</span></div>
        <div class="popup-row"><span class="popup-key">SPEED</span><span class="popup-val">${spd} kts</span></div>
        <div class="popup-row"><span class="popup-key">HEADING</span><span class="popup-val">${hdg}</span></div>
        <div class="popup-row"><span class="popup-key">VERT RATE</span><span class="popup-val ${parseFloat(vr) < 0 ? 'red' : 'green'}">${vr}</span></div>
        <div class="popup-row"><span class="popup-key">ON GROUND</span><span class="popup-val ${ground==='YES'?'orange':''}">${ground}</span></div>
      </div>`;
  }

  function updateMarker(s) {
    const icao = s[I.icao];
    const lat  = s[I.lat];
    const lon  = s[I.lon];
    if (!lat || !lon) return;

    const country = s[I.origin] || '';
    if (activeCountries.size > 0 && !activeCountries.has(country)) return;

    const cs      = (s[I.callsign] || '').trim();
    const color   = UTILS.countryColor(country);
    const mil     = isMilitary(cs);
    const heading = s[I.heading] || 0;
    const icon    = mil ? '🛩' : '✈';

    const html = `<div class="ac-icon" style="color:${mil ? '#ff9900' : color};transform:${headingToCSS(heading)}" title="${cs}">${icon}</div>`;
    const divIcon = L.divIcon({ html, className: 'ac-marker', iconSize: [14,14], iconAnchor: [7,7] });

    if (markers[icao]) {
      markers[icao].setLatLng([lat, lon]);
      markers[icao].setIcon(divIcon);
    } else {
      const m = L.marker([lat, lon], { icon: divIcon, zIndexOffset: mil ? 200 : 0 });
      m.bindPopup(makePopup(s), { maxWidth: 250, className: 'osint-popup' });
      m.on('click', () => {
        selectedIcao = icao;
        SIDEBAR.addFeedItem('aircraft', `Tracking ${cs || icao} | ${country} | ${altFt(s[I.alt])} ft`);
      });
      if (layer) m.addTo(layer);
      markers[icao] = m;
    }
    // Update popup if open
    if (markers[icao].isPopupOpen()) {
      markers[icao].setPopupContent(makePopup(s));
    }
  }

  function purgeStale(currentIcaos) {
    const cur = new Set(currentIcaos);
    Object.keys(markers).forEach(icao => {
      if (!cur.has(icao)) {
        if (layer) layer.removeLayer(markers[icao]);
        delete markers[icao];
      }
    });
  }

  function processStates(states) {
    if (!states || !Array.isArray(states)) return;
    data = states;
    const icaos = [];
    let milCount = 0, comCount = 0;
    const countryCounts = {};

    states.forEach(s => {
      if (!s[I.lat] || !s[I.lon]) return;
      icaos.push(s[I.icao]);
      if (enabled) updateMarker(s);

      const cs = (s[I.callsign] || '').trim();
      if (isMilitary(cs)) milCount++;
      else comCount++;

      const c = s[I.origin] || 'Unknown';
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    });

    purgeStale(icaos);

    // Update stats
    const total = icaos.length;
    const el = document.getElementById('sv-aircraft');
    if (el) el.textContent = total.toLocaleString();

    SIDEBAR.updateAircraftStats({ total, milCount, comCount, countryCounts });
    EFFECTS.setLastUpdate();
  }

  async function fetch() {
    try {
      const resp = await window.fetch('/api/aircraft');
      if (!resp.ok) throw new Error(resp.status);
      const json = await resp.json();
      processStates(json.states || []);
    } catch (e) {
      console.warn('[Aircraft] fetch error:', e.message);
    }
  }

  function init(mapInstance) {
    map   = mapInstance;
    layer = L.layerGroup().addTo(map);
    fetch();
    setInterval(fetch, 15_000);
  }

  function setEnabled(on) {
    enabled = on;
    if (layer) {
      if (on) { layer.addTo(map); fetch(); }
      else    { map.removeLayer(layer); }
    }
  }

  function setCountryFilter(countries) {
    activeCountries = new Set(countries);
    // Rebuild markers
    Object.values(markers).forEach(m => layer && layer.removeLayer(m));
    markers = {};
    if (data.length) processStates(data);
  }

  function handleWSUpdate(payload) {
    processStates(payload.states || []);
  }

  function getData() { return data; }

  return { init, setEnabled, setCountryFilter, handleWSUpdate, getData, isMilitary };
})();
