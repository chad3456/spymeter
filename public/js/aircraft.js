/* ── Live Aircraft – OpenSky Network / ADSB.fi ─────────────
   ADS-B data with type-specific SVG icons, airline names,
   military / drone / cargo / helicopter detection.          */

// ── ICAO airline prefix → airline name ────────────────────
const AIRLINE_CODES = {
  UAL:'United Airlines',  BAW:'British Airways', DAL:'Delta Air Lines',
  AAL:'American Airlines',EIN:'Aer Lingus',      VIR:'Virgin Atlantic',
  AFR:'Air France',       DLH:'Lufthansa',        KLM:'KLM Royal Dutch',
  IBE:'Iberia',           TK :'Turkish Airlines', LH :'Lufthansa',
  SAS:'Scandinavian Air', AZA:'ITA Airways',      EZY:'easyJet',
  RYR:'Ryanair',          WZZ:'Wizz Air',         AUA:'Austrian Airlines',
  EK :'Emirates',         QR :'Qatar Airways',    SQ :'Singapore Airlines',
  AI :'Air India',        CX :'Cathay Pacific',   NH :'All Nippon Airways',
  JL :'Japan Airlines',   CA :'Air China',        MH :'Malaysia Airlines',
  TG :'Thai Airways',     KE :'Korean Air',       OZ :'Asiana Airlines',
  EY :'Etihad Airways',   SV :'Saudi Arabian AL', MS :'EgyptAir',
  ET :'Ethiopian Airlines',LA :'LATAM Airlines',  AV :'Avianca',
  AM :'Aeromexico',       AC :'Air Canada',       WS :'WestJet',
  VS :'Virgin Atlantic',  LX :'Swiss International',FI:'Icelandair',
  SK :'SAS',              AY :'Finnair',          OS :'Austrian Airlines',
  LO :'LOT Polish',       OK :'Czech Airlines',   BT :'airBaltic',
  FR :'Ryanair',          U2 :'easyJet',          PC :'Pegasus Airlines',
  // Cargo / Freight
  FDX:'FedEx Express',    UPS:'UPS Airlines',     DHL:'DHL Aviation',
  CLX:'Cargolux',         PAC:'Polar Air Cargo',  GTI:'Atlas Air',
  // Military / Government callsigns handled by PATTERNS
};

function getAirlineName(callsign) {
  const cs = (callsign || '').trim().toUpperCase();
  // Try 3-char prefix, then 2-char, then 2-char with digit strip
  for (let len = 3; len >= 2; len--) {
    const code = cs.slice(0, len).replace(/\d+$/, ''); // strip trailing digits for 2-char
    const key  = cs.slice(0, len);
    if (AIRLINE_CODES[key])  return AIRLINE_CODES[key];
    if (len === 2 && AIRLINE_CODES[code]) return AIRLINE_CODES[code];
  }
  return null;
}

const AIRCRAFT = (() => {
  let map          = null;
  let layer        = null;
  let enabled      = true;
  let markers      = {};
  let data         = [];
  let dataTs       = 0;     // timestamp of last successful fetch
  let activeCountries = new Set();
  let selectedIcao = null;

  // OpenSky state vector field indices
  const I = {
    icao: 0, callsign: 1, origin: 2, lat: 6, lon: 5,
    alt: 7, on_ground: 8, velocity: 9, heading: 10, vert_rate: 11
  };

  // ── Aircraft type detection ───────────────────────────
  const PATTERNS = {
    drone: /^(RQ|MQ|REAPER|PREDATOR|GLOBALHAWK|TRITON|TARANIS|SENTINEL|UAV|UAS|ZEPHYR|WATCHKEEPER)/i,
    helicopter: /^(MEDEVAC|LIFEFLIGHT|BLADE|GUARDIAN|EAGLE\d|WOLF\d|HELIMED|HELO|RESCUE\d)/i,
    military_transport: /^(RCH|REACH|ATLAS|COMET|ASCOT|ENVOY|HUSKY|TARTAN|VIPER|KNIFE|SWORD)/i,
    bomber: /^(BONE|BUFF|DUKE|SPIRIT|RAIDER|LANCER|GHOST|GLOBAL)/i,
    tanker: /^(QUID|SHELL|PETROL|ARCO|TEXACO|ZINC|POLO)/i,
    fighter: /^(AF|USAF|NAVY|USMC|USCG|RFF|GAF|FAF|FAB|RAFAIR|NATO|NATA|CANAV|RAAF|EAGLE|JOLLY|PEDRO|IRON|STEEL|KNIGHT|SABRE|LANCE|ARROW|SHIELD|SPEAR|FURY|DRAGON|THUNDER|VENOM|RAPTOR|HORNET|HAWK|FALCON|VIPER)/i,
    cargo: /^(FEDEX|FDX|UPS\d|UPS|DHL|CARGO|FREIGHT|ATLAS|POLAR|KALITTA|AIRBRIDGE|SILK|ABX)/i,
    vip: /^(AF1|SAM|AIR FORCE ONE|EXEC|SPAR|PAT|SKILL|VENUS|JANET)/i,
  };

  const TYPE_META = {
    drone:              { icon: 'drone',    color: '#ff2200', label: 'UAV/DRONE',     emoji: '⊕' },
    helicopter:         { icon: 'helo',     color: '#00aaff', label: 'HELICOPTER',    emoji: '🚁' },
    military_transport: { icon: 'mil-tx',   color: '#ff9900', label: 'MIL TRANSPORT', emoji: '✈' },
    bomber:             { icon: 'bomber',   color: '#ff6600', label: 'BOMBER',        emoji: '✈' },
    tanker:             { icon: 'tanker',   color: '#ffaa44', label: 'TANKER',        emoji: '✈' },
    fighter:            { icon: 'fighter',  color: '#ff9900', label: 'FIGHTER JET',   emoji: '✈' },
    cargo:              { icon: 'cargo',    color: '#44ffaa', label: 'CARGO',         emoji: '✈' },
    vip:                { icon: 'vip',      color: '#ddaaff', label: 'GOVT/VIP',      emoji: '✈' },
    civilian:           { icon: 'civil',    color: '#3399ff', label: 'CIVILIAN',      emoji: '✈' },
    ground:             { icon: 'ground',   color: '#888888', label: 'ON GROUND',     emoji: '🛬' },
  };

  function detectType(callsign = '', onGround = false) {
    if (onGround) return 'ground';
    const cs = callsign.toUpperCase().trim();
    for (const [type, pat] of Object.entries(PATTERNS)) {
      if (pat.test(cs)) return type;
    }
    return 'civilian';
  }

  function isMilitary(callsign = '') {
    const t = detectType(callsign);
    return ['fighter', 'bomber', 'tanker', 'military_transport', 'drone', 'vip'].includes(t);
  }

  // ── SVG icon builder ─────────────────────────────────
  function buildIcon(type, color, heading, callsign) {
    const deg = (heading || 0) - 90; // rotate so nose points in heading direction
    const glow = `drop-shadow(0 0 3px ${color})`;

    // Each SVG is 20×20 viewBox
    const shapes = {
      fighter: `<polygon points="10,2 13,10 10,18 7,10" fill="${color}"/>
                <polygon points="10,8 16,14 10,12 4,14" fill="${color}" opacity="0.8"/>
                <polygon points="10,14 14,18 10,16 6,18" fill="${color}" opacity="0.6"/>`,

      bomber: `<ellipse cx="10" cy="10" rx="3" ry="8" fill="${color}"/>
               <polygon points="10,5 18,12 10,11 2,12" fill="${color}" opacity="0.8"/>
               <rect x="8" y="13" width="4" height="5" fill="${color}" opacity="0.6"/>`,

      drone: `<circle cx="10" cy="10" r="2.5" fill="${color}"/>
              <line x1="10" y1="10" x2="3" y2="3" stroke="${color}" stroke-width="1.5"/>
              <line x1="10" y1="10" x2="17" y2="3" stroke="${color}" stroke-width="1.5"/>
              <line x1="10" y1="10" x2="3" y2="17" stroke="${color}" stroke-width="1.5"/>
              <line x1="10" y1="10" x2="17" y2="17" stroke="${color}" stroke-width="1.5"/>
              <circle cx="3" cy="3" r="2" fill="${color}"/>
              <circle cx="17" cy="3" r="2" fill="${color}"/>
              <circle cx="3" cy="17" r="2" fill="${color}"/>
              <circle cx="17" cy="17" r="2" fill="${color}"/>`,

      helo: `<rect x="4" y="9" width="12" height="3" rx="1" fill="${color}"/>
             <line x1="2" y1="9" x2="18" y2="9" stroke="${color}" stroke-width="1.5"/>
             <circle cx="6" cy="9" r="1" fill="${color}"/>
             <line x1="10" y1="4" x2="10" y2="9" stroke="${color}" stroke-width="1"/>
             <line x1="6" y1="4" x2="14" y2="4" stroke="${color}" stroke-width="1.5"/>
             <line x1="15" y1="10" x2="18" y2="14" stroke="${color}" stroke-width="1"/>
             <line x1="17" y1="12" x2="19" y2="12" stroke="${color}" stroke-width="1"/>`,

      'mil-tx': `<polygon points="10,3 12,9 18,10 12,11 10,17 8,11 2,10 8,9" fill="${color}"/>`,

      tanker: `<ellipse cx="10" cy="10" rx="2.5" ry="7" fill="${color}"/>
               <polygon points="10,6 17,11 10,10 3,11" fill="${color}" opacity="0.9"/>
               <polygon points="10,10 15,14 10,13 5,14" fill="${color}" opacity="0.7"/>`,

      cargo: `<rect x="7" y="5" width="6" height="11" rx="2" fill="${color}" opacity="0.8"/>
              <polygon points="10,6 17,11 10,10 3,11" fill="${color}"/>
              <polygon points="10,11 14,15 10,14 6,15" fill="${color}" opacity="0.7"/>`,

      vip: `<polygon points="10,3 12,8 18,9 13,13 15,19 10,16 5,19 7,13 2,9 8,8" fill="${color}"/>`,

      civil: `<polygon points="10,3 11,8 17,10 11,12 10,17 9,12 3,10 9,8" fill="${color}"/>`,

      ground: `<rect x="3" y="8" width="14" height="5" rx="2" fill="${color}" opacity="0.8"/>
               <line x1="3" y1="13" x2="3" y2="16" stroke="${color}" stroke-width="1.5"/>
               <line x1="17" y1="13" x2="17" y2="16" stroke="${color}" stroke-width="1.5"/>
               <line x1="10" y1="13" x2="10" y2="16" stroke="${color}" stroke-width="1.5"/>`,
    };

    const shape = shapes[type] || shapes.civil;
    const rotateStyle = type === 'drone' || type === 'helo' ? '' : `transform="rotate(${deg}, 10, 10)"`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"
              style="filter:${glow}" ${rotateStyle}>
              ${shape}
            </svg>`;
  }

  function makeMarkerHTML(type, color, heading, callsign) {
    const svgStr = buildIcon(type, color, heading, callsign);
    return `<div class="ac-marker-wrap" title="${callsign}">${svgStr}</div>`;
  }

  // ── Popup content ─────────────────────────────────────
  function speedKts(mps) { return mps ? Math.round(mps * 1.944) : '?'; }
  function altFt(m)  { return m ? Math.round(m * 3.281).toLocaleString() : '?'; }

  function makePopup(s) {
    const cs       = (s[I.callsign] || '').trim() || 'N/A';
    const origin   = s[I.origin] || 'Unknown';
    const spd      = speedKts(s[I.velocity]);
    const alt      = altFt(s[I.alt]);
    const hdg      = s[I.heading] ? Math.round(s[I.heading]) + '°' : '?';
    const vr       = s[I.vert_rate] ? s[I.vert_rate].toFixed(1) + ' m/s' : '0';
    const ground   = s[I.on_ground] ? 'YES' : 'NO';
    const type     = detectType(cs, s[I.on_ground]);
    const meta     = TYPE_META[type] || TYPE_META.civilian;
    const milFlag  = isMilitary(cs);
    const airline  = getAirlineName(cs);
    // Extended fields from ADSB.fi/ADSB.one/ADSBEx (index 12+ if present)
    const dest     = s[17] || s.dest || '';
    const origin2  = s[16] || s.orig || '';
    const model    = s[18] || s.model || s.t || '';
    const reg      = s[19] || s.r || '';
    const icao24   = s[I.icao] || '?';

    return `
      <div class="popup-box">
        <div class="popup-title" style="color:${meta.color}">${meta.emoji} ${meta.label}: ${cs}</div>
        <div class="popup-row"><span class="popup-key">AIRCRAFT NO</span><span class="popup-val" style="color:#00d4ff">${reg || icao24}</span></div>
        <div class="popup-row"><span class="popup-key">ICAO24</span><span class="popup-val">${icao24}</span></div>
        ${airline ? `<div class="popup-row"><span class="popup-key">AIRLINE</span><span class="popup-val" style="color:#ffaa00">${airline}</span></div>` : ''}
        ${model ? `<div class="popup-row"><span class="popup-key">AIRCRAFT</span><span class="popup-val">${model}</span></div>` : ''}
        <div class="popup-row"><span class="popup-key">TYPE</span><span class="popup-val" style="color:${meta.color}">${meta.label}</span></div>
        <div class="popup-row"><span class="popup-key">SOURCE COUNTRY</span><span class="popup-val">${origin}</span></div>
        ${origin2 ? `<div class="popup-row"><span class="popup-key">ORIGIN AIRPORT</span><span class="popup-val green">${origin2}</span></div>` : ''}
        ${dest   ? `<div class="popup-row"><span class="popup-key">DESTINATION</span><span class="popup-val green">${dest}</span></div>` : ''}
        <div class="popup-row"><span class="popup-key">ALTITUDE</span><span class="popup-val green">${alt} ft</span></div>
        <div class="popup-row"><span class="popup-key">SPEED</span><span class="popup-val">${spd} kts</span></div>
        <div class="popup-row"><span class="popup-key">HEADING</span><span class="popup-val">${hdg}</span></div>
        <div class="popup-row"><span class="popup-key">VERT RATE</span><span class="popup-val ${parseFloat(vr) < 0 ? 'red' : 'green'}">${vr}</span></div>
        <div class="popup-row"><span class="popup-key">ON GROUND</span><span class="popup-val ${ground === 'YES' ? 'orange' : ''}">${ground}</span></div>
        ${milFlag ? '<div class="popup-mil-tag">⚠ MILITARY ASSET — OSINT</div>' : ''}
        <div style="font-size:7px;color:#3d5a78;margin-top:4px;padding-top:4px;border-top:1px solid #182030">Source: OpenSky / ADS-B</div>
      </div>`;
  }

  // ── Marker management ─────────────────────────────────
  function updateMarker(s) {
    const icao    = s[I.icao];
    const lat     = s[I.lat];
    const lon     = s[I.lon];
    if (!lat || !lon) return;

    const country = s[I.origin] || '';
    if (activeCountries.size > 0 && !activeCountries.has(country)) return;

    const cs      = (s[I.callsign] || '').trim();
    const type    = detectType(cs, s[I.on_ground]);
    const meta    = TYPE_META[type] || TYPE_META.civilian;
    const color   = isMilitary(cs) ? meta.color : UTILS.countryColor(country) || meta.color;
    const heading = s[I.heading] || 0;

    const html    = makeMarkerHTML(type, color, heading, cs || icao);
    const divIcon = L.divIcon({ html, className: '', iconSize: [20, 20], iconAnchor: [10, 10] });

    if (markers[icao]) {
      markers[icao].setLatLng([lat, lon]);
      markers[icao].setIcon(divIcon);
    } else {
      const m = L.marker([lat, lon], { icon: divIcon, zIndexOffset: isMilitary(cs) ? 300 : 0 });
      m.bindPopup(makePopup(s), { maxWidth: 260, className: 'osint-popup' });
      m.on('click', () => {
        selectedIcao = icao;
        SIDEBAR.addFeedItem('aircraft',
          `[${meta.label}] ${cs || icao} | ${country} | ${altFt(s[I.alt])} ft | ${speedKts(s[I.velocity])} kts`);
      });
      if (layer) m.addTo(layer);
      markers[icao] = m;
    }
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

  // ── Process ADS-B states array ─────────────────────────
  function processStates(states) {
    if (!states || !Array.isArray(states)) return;
    data = states;
    dataTs = Date.now();
    const icaos = [];
    let milCount = 0, droneCount = 0;
    const countryCounts = {};

    states.forEach(s => {
      if (!s[I.lat] || !s[I.lon]) return;
      icaos.push(s[I.icao]);
      if (enabled) updateMarker(s);

      const cs   = (s[I.callsign] || '').trim();
      const type = detectType(cs, s[I.on_ground]);
      if (['fighter','bomber','tanker','military_transport'].includes(type)) milCount++;
      if (type === 'drone') droneCount++;

      const c = s[I.origin] || 'Unknown';
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    });

    purgeStale(icaos);

    const total = icaos.length;
    const sv = document.getElementById('sv-aircraft');
    if (sv) sv.textContent = total.toLocaleString();

    const milEl = document.getElementById('mil-count');
    if (milEl) milEl.textContent = `${milCount} MIL${droneCount > 0 ? ` | ${droneCount} UAV` : ''}`;

    SIDEBAR.updateAircraftStats({ total, milCount, droneCount, countryCounts });
    EFFECTS.setLastUpdate();
  }

  async function fetchData() {
    try {
      const resp = await window.fetch('/api/aircraft');
      const json = await resp.json();

      if (!resp.ok || json.error) {
        // Show status in the aircraft count widget
        const sv = document.getElementById('sv-aircraft');
        if (sv) sv.textContent = '–';
        const milEl = document.getElementById('mil-count');
        if (milEl) milEl.textContent = json.error || 'No live feed';
        console.warn('[Aircraft] API error:', json.error || resp.status);
        return;
      }

      if (json.stale) console.info('[Aircraft] serving stale cache');
      processStates(json.states || []);

      // Show data source
      const srcEl = document.getElementById('ac-source-tag');
      if (srcEl) srcEl.textContent = json.source + (json.stale ? ' ⚠ stale' : '');
    } catch (e) {
      console.warn('[Aircraft] fetch error:', e.message);
    }
  }

  function init(mapInstance) {
    map   = mapInstance;
    layer = L.layerGroup().addTo(map);
    fetchData();
    setInterval(fetchData, 15_000);
  }

  function setEnabled(on) {
    enabled = on;
    if (layer) {
      if (on) { layer.addTo(map); fetchData(); }
      else    { map.removeLayer(layer); }
    }
  }

  function setCountryFilter(countries) {
    activeCountries = new Set(countries);
    Object.values(markers).forEach(m => layer && layer.removeLayer(m));
    markers = {};
    if (data.length) processStates(data);
  }

  function handleWSUpdate(payload) {
    processStates(payload.states || []);
  }

  function getData()        { return data; }
  function getTs()          { return dataTs; }
  function getMarkers()     { return markers; }

  return {
    init, setEnabled, setCountryFilter, handleWSUpdate,
    getData, getTs, getMarkers, isMilitary, detectType,
    refresh: fetchData,
  };
})();
