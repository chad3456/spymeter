/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — Spy Satellites OSINT Layer
   Data: CelesTrak TLE feeds · NRO · USAF · open-source satellite databases
   Covers: NRO IMINT/SIGINT, USAF X-37B, Russian Kosmos, Chinese Yaogan,
           allied military satellites — propagated via satellite.js SGP4
════════════════════════════════════════════════════════════════════════════ */
const SPY_SATS = (() => {
  let map = null;
  let enabled = false;
  let markers = [];
  let trackLines = [];
  let _timer = null;

  // Known military satellite catalog - name → classification
  const KNOWN_SATS = {
    // USA NRO (National Reconnaissance Office)
    'USA 224':    { type:'IMINT',    country:'USA', agency:'NRO',  system:'KH-11 Kennen',    notes:'Optical imaging reconnaissance. Continuously upgraded Hubble-class telescope.' },
    'USA 245':    { type:'IMINT',    country:'USA', agency:'NRO',  system:'KH-11 Kennen',    notes:'Optical IMINT.' },
    'USA 314':    { type:'IMINT',    country:'USA', agency:'NRO',  system:'NROL-68',         notes:'2022 launch. Latest generation IMINT.' },
    'USA 326':    { type:'IMINT',    country:'USA', agency:'NRO',  system:'NROL-107',        notes:'2023 Falcon Heavy launch.' },
    'USA 336':    { type:'IMINT',    country:'USA', agency:'NRO',  system:'NROL-129',        notes:'2024 launch.' },
    'USA 202':    { type:'SIGINT',   country:'USA', agency:'NRO',  system:'Orion/Mentor',    notes:'Geosynchronous SIGINT. Very large deployable antenna.' },
    'USA 223':    { type:'SIGINT',   country:'USA', agency:'NRO',  system:'Orion/Mentor',    notes:'GEO SIGINT satellite.' },
    'USA 237':    { type:'ELINT',    country:'USA', agency:'NRO',  system:'Trumpet-FO',      notes:'ELINT/SIGINT HEO orbit.' },
    'USA 267':    { type:'ELINT',    country:'USA', agency:'NRO',  system:'Trumpet-FO',      notes:'HEO ELINT.' },
    'USA 276':    { type:'IMINT',    country:'USA', agency:'NRO',  system:'EIS radar',       notes:'SAR imaging radar satellite.' },
    // USAF
    'USA 288':    { type:'MILCOM',   country:'USA', agency:'USAF', system:'X-37B OTV-5',     notes:'X-37B Orbital Test Vehicle. Classified payload. Maneuverable.' },
    'USA 342':    { type:'MILCOM',   country:'USA', agency:'USAF', system:'X-37B OTV-7',     notes:'X-37B 7th mission. Secret payload 2023.' },
    // Russia
    'KOSMOS 2543':  { type:'IMINT',    country:'RUS', agency:'VKS', system:'Persona',         notes:'Russian IMINT satellite. Optical reconnaissance.' },
    'KOSMOS 2560':  { type:'IMINT',    country:'RUS', agency:'VKS', system:'Persona-3',       notes:'Latest Russian IMINT.' },
    'KOSMOS 2558':  { type:'INSPECTOR',country:'RUS', agency:'VKS', system:'Inspector',       notes:'Known satellite inspector — flew within 100km of USA 326 in 2022.' },
    'KOSMOS 2553':  { type:'SIGINT',   country:'RUS', agency:'VKS', system:'Lotos-S',         notes:'Russian SIGINT. Liana ocean surveillance system.' },
    'KOSMOS 2545':  { type:'SIGINT',   country:'RUS', agency:'VKS', system:'Lotos-S1',        notes:'Liana ELINT/SIGINT.' },
    'KOSMOS 2491':  { type:'INSPECTOR',country:'RUS', agency:'VKS', system:'Nivelir',         notes:'Maneuvering inspector satellite. Close approach to debris 2014-2022.' },
    // China
    'YAOGAN-30A': { type:'ELINT',    country:'CHN', agency:'PLA', system:'Yaogan-30',        notes:'Chinese ELINT triplet constellation. Ocean surveillance.' },
    'YAOGAN-33':  { type:'IMINT',    country:'CHN', agency:'PLA', system:'Yaogan-33',        notes:'Chinese SAR imaging satellite.' },
    'YAOGAN-35':  { type:'IMINT',    country:'CHN', agency:'PLA', system:'Yaogan-35',        notes:'Chinese IMINT triplet.' },
    'YAOGAN-39':  { type:'IMINT',    country:'CHN', agency:'PLA', system:'Yaogan-39',        notes:'2023. Latest PLA IMINT.' },
    'SHIYAN-21':  { type:'INSPECTOR',country:'CHN', agency:'PLA', system:'Shiyan',           notes:'Chinese experimental inspector satellite. Demonstrated grappling arm.' },
    // Other
    'OFEK-16':    { type:'IMINT',    country:'ISR', agency:'IAF', system:'Ofek',             notes:'Israel optical reconnaissance. Retrograde orbit.' },
    'OFEQ-11':    { type:'IMINT',    country:'ISR', agency:'IAF', system:'Ofeq',             notes:'Israeli IMINT.' },
    'HELIOS 2B':  { type:'IMINT',    country:'FRA', agency:'DGA', system:'Helios',           notes:'French military IMINT.' },
    'CSO-1':      { type:'IMINT',    country:'FRA', agency:'DGA', system:'CSO',              notes:'French Composante Spatiale Optique. Next-gen IMINT.' },
    'CSO-2':      { type:'IMINT',    country:'FRA', agency:'DGA', system:'CSO',              notes:'French CSO-2 optical recon.' },
    'SKYNET 5A':  { type:'MILCOM',   country:'GBR', agency:'RAF', system:'Skynet',           notes:'UK military communications satellite.' },
    'SKYNET 5D':  { type:'MILCOM',   country:'GBR', agency:'RAF', system:'Skynet',           notes:'UK MILCOM.' },
    'SYRACUSE 4A':{ type:'MILCOM',   country:'FRA', agency:'DGA', system:'Syracuse',         notes:'French military SATCOM.' },
    'WGS-11':     { type:'MILCOM',   country:'USA', agency:'USAF',system:'Wideband GS',      notes:'Wideband Global SATCOM — high capacity X/Ka band military comm.' },
    'AEHF-6':     { type:'MILCOM',   country:'USA', agency:'USAF',system:'AEHF',             notes:'Advanced Extremely High Frequency — nuclear-hardened MILCOM.' },
    'GPS IIR-20': { type:'NAVSAT',   country:'USA', agency:'USAF',system:'GPS Block IIR',    notes:'GPS navigation — military P(Y) code.' },
    'GPS III SV06':{ type:'NAVSAT',  country:'USA', agency:'USAF',system:'GPS III',          notes:'Latest GPS Block III — M-code military signal.' },
    'GLONASS-M':  { type:'NAVSAT',   country:'RUS', agency:'VKS', system:'GLONASS',          notes:'Russian military navigation constellation.' },
    'BEIDOU-3':   { type:'NAVSAT',   country:'CHN', agency:'PLA', system:'BeiDou-3',         notes:'Chinese military/civil navigation. BDS-3 global.' }
  };

  const TYPE_CFG = {
    IMINT:    { color:'#ff4444', icon:'📷', label:'Optical Imaging (IMINT)' },
    SIGINT:   { color:'#ff8800', icon:'📡', label:'Signals Intelligence (SIGINT)' },
    ELINT:    { color:'#ffcc00', icon:'⚡', label:'Electronic Intelligence (ELINT)' },
    MILCOM:   { color:'#4488ff', icon:'📶', label:'Military Communications' },
    NAVSAT:   { color:'#00cc88', icon:'🛰', label:'Navigation Satellite' },
    INSPECTOR:{ color:'#cc44ff', icon:'🔍', label:'Inspector/Maneuver Sat' },
    UNKNOWN:  { color:'#888888', icon:'?',  label:'Military (Classified)' }
  };

  // ── TLE parser ──────────────────────────────────────────────────────────────
  function _parseTLEs(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const tles = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const name  = lines[i];
      const line1 = lines[i + 1];
      const line2 = lines[i + 2];
      if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
        tles.push({ name, line1, line2 });
      }
    }
    return tles;
  }

  // ── Ground track computation ─────────────────────────────────────────────────
  function _computeTrack(satrec) {
    const points = [];
    const now = Date.now();
    for (let dt = -45; dt <= 45; dt += 2) {
      const t = new Date(now + dt * 60 * 1000);
      try {
        const pv = satellite.propagate(satrec, t);
        if (!pv || !pv.position) continue;
        const gmst = satellite.gstime(t);
        const geo  = satellite.eciToGeodetic(pv.position, gmst);
        const lat  = satellite.degreesLat(geo.latitude);
        const lng  = satellite.degreesLong(geo.longitude);
        if (isFinite(lat) && isFinite(lng)) {
          points.push([lat, lng]);
        }
      } catch (e) {
        // skip bad propagation steps
      }
    }
    return points;
  }

  // ── Clear all track lines ────────────────────────────────────────────────────
  function _clearTracks() {
    trackLines.forEach(l => { if (map) map.removeLayer(l); });
    trackLines = [];
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  async function _render() {
    if (!map || !enabled) return;

    // Remove existing markers
    markers.forEach(m => { if (map) map.removeLayer(m); });
    markers = [];
    _clearTracks();

    let tleText;
    try {
      const res = await fetch('/api/satellites/military');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      tleText = await res.text();
    } catch (err) {
      console.warn('[SPY_SATS] fetch failed:', err);
      return;
    }

    const tles = _parseTLEs(tleText);
    const now  = new Date();

    tles.forEach(({ name, line1, line2 }) => {
      let satrec, posVel, geo, lat, lng;
      try {
        satrec = satellite.twoline2satrec(line1, line2);
        posVel = satellite.propagate(satrec, now);
        if (!posVel || !posVel.position) return;
        const gmst = satellite.gstime(now);
        geo = satellite.eciToGeodetic(posVel.position, gmst);
        lat = satellite.degreesLat(geo.latitude);
        lng = satellite.degreesLong(geo.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return;
      } catch (e) {
        return;
      }

      const altKm  = (geo.height * 6371).toFixed(0);
      const nameTrim = name.trim();
      const info   = KNOWN_SATS[nameTrim] || null;
      const cfg    = info ? (TYPE_CFG[info.type] || TYPE_CFG.UNKNOWN) : TYPE_CFG.UNKNOWN;
      const type   = info ? info.type : 'UNKNOWN';

      const marker = L.circleMarker([lat, lng], {
        radius:      5,
        color:       cfg.color,
        fillColor:   cfg.color,
        fillOpacity: 0.8,
        weight:      1.5,
        opacity:     1
      });

      // Build popup content
      const infoRows = info
        ? `<div class="ssat-row"><span class="ssat-lbl">TYPE</span> ${info.type}</div>
           <div class="ssat-row"><span class="ssat-lbl">COUNTRY</span> ${info.country}</div>
           <div class="ssat-row"><span class="ssat-lbl">AGENCY</span> ${info.agency}</div>
           <div class="ssat-row"><span class="ssat-lbl">SYSTEM</span> ${info.system}</div>
           <div class="ssat-row"><span class="ssat-lbl">ALT</span> ${altKm} km</div>
           <div class="ssat-row ssat-notes"><span class="ssat-lbl">NOTES</span> ${info.notes}</div>`
        : `<div class="ssat-row"><span class="ssat-lbl">TYPE</span> Military (Unclassified)</div>
           <div class="ssat-row"><span class="ssat-lbl">ALT</span> ${altKm} km</div>`;

      const popHTML = `<div class="ssat-popup" style="border-left:2px solid ${cfg.color}">
        <div class="ssat-hdr" style="color:${cfg.color}">${cfg.icon} ${nameTrim}</div>
        <div class="ssat-badge" style="background:${cfg.color}22;color:${cfg.color};border:1px solid ${cfg.color}44">${type}</div>
        ${infoRows}
        <div class="ssat-src">Source: CelesTrak · NRO · OSINT classification · satellite.js SGP4</div>
      </div>`;

      marker.bindPopup(popHTML, { className:'leaflet-popup-dark', maxWidth:320 });

      // Show ground track on popup open, remove on close
      marker.on('popupopen', () => {
        _clearTracks();
        try {
          const pts = _computeTrack(satrec);
          if (pts.length > 1) {
            const line = L.polyline(pts, {
              color:     cfg.color,
              weight:    1,
              opacity:   0.6,
              dashArray: '4,4'
            }).addTo(map);
            trackLines.push(line);
          }
        } catch (e) {
          // ground track optional — silently skip
        }
      });

      marker.on('popupclose', () => {
        _clearTracks();
      });

      marker.addTo(map);
      markers.push(marker);
    });

    _updatePanel();
  }

  // ── Panel update ────────────────────────────────────────────────────────────
  function _updatePanel() {
    const el = document.getElementById('ssat-panel-body');
    if (!el) return;

    // Count by type from current markers (use KNOWN_SATS keys)
    const typeCounts = {};
    Object.values(KNOWN_SATS).forEach(info => {
      typeCounts[info.type] = (typeCounts[info.type] || 0) + 1;
    });

    const typeRows = Object.entries(TYPE_CFG).map(([key, cfg]) => {
      const n = typeCounts[key] || 0;
      if (n === 0) return '';
      return `<div class="ssat-stat-row">
        <span style="font-size:13px">${cfg.icon}</span>
        <div class="ssat-stat-info">
          <div class="ssat-stat-name" style="color:${cfg.color}">${cfg.label}</div>
          <div class="ssat-stat-count">${n} sat${n !== 1 ? 's' : ''}</div>
        </div>
      </div>`;
    }).join('');

    const knownList = Object.entries(KNOWN_SATS).map(([name, info]) => {
      const cfg = TYPE_CFG[info.type] || TYPE_CFG.UNKNOWN;
      const flagMap = { USA:'🇺🇸', RUS:'🇷🇺', CHN:'🇨🇳', GBR:'🇬🇧', FRA:'🇫🇷', ISR:'🇮🇱' };
      const flag = flagMap[info.country] || '🌐';
      return `<div class="ssat-list-row">
        <span class="ssat-list-flag">${flag}</span>
        <span class="ssat-list-name" style="color:${cfg.color}">${name}</span>
        <span class="ssat-list-type" style="color:${cfg.color}99">${info.type}</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="ssat-section-hdr">BY TYPE</div>
      ${typeRows}
      <div class="ssat-section-hdr" style="margin-top:8px">KNOWN SATS (${Object.keys(KNOWN_SATS).length})</div>
      <div class="ssat-list">${knownList}</div>
    `;
  }

  // ── CSS injection ────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('ssat-css')) return;
    const s = document.createElement('style');
    s.id = 'ssat-css';
    s.textContent = `
      .ssat-popup{min-width:260px;max-width:310px;font-family:'Courier New',monospace;padding:2px}
      .ssat-hdr{font-size:9.5px;font-weight:700;margin-bottom:5px}
      .ssat-badge{font-size:6.5px;font-weight:700;padding:2px 6px;border-radius:2px;
        display:inline-block;margin-bottom:5px;letter-spacing:.5px}
      .ssat-row{font-size:7.5px;color:#c8dff0;margin:2px 0;line-height:1.4}
      .ssat-notes{color:#a0bcd0}
      .ssat-lbl{color:#3d5a78;display:inline-block;width:55px;font-size:7px;letter-spacing:.3px}
      .ssat-src{font-size:6.5px;color:#3d5a78;margin-top:6px;border-top:1px solid #0d1e2e;padding-top:4px}
      .ssat-section-hdr{font-size:6.5px;color:#3d5a78;letter-spacing:.8px;font-weight:700;
        margin:4px 0 3px 0;border-bottom:1px solid #0d1e2e;padding-bottom:2px}
      .ssat-stat-row{display:flex;align-items:center;gap:6px;padding:2px 0}
      .ssat-stat-info{flex:1}
      .ssat-stat-name{font-size:7.5px;font-weight:600}
      .ssat-stat-count{font-size:7px;color:#3d5a78}
      .ssat-list{max-height:180px;overflow-y:auto}
      .ssat-list-row{display:flex;align-items:center;gap:4px;padding:1px 0;font-size:7px}
      .ssat-list-flag{font-size:10px;flex-shrink:0}
      .ssat-list-name{flex:1;font-weight:600}
      .ssat-list-type{flex-shrink:0;font-size:6.5px}
    `;
    document.head.appendChild(s);
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  return {
    init(m) {
      map = m;
      _injectCSS();
    },
    setEnabled(on) {
      enabled = on;
      if (on) {
        _render();
        _timer = setInterval(_render, 30000);
      } else {
        if (_timer) { clearInterval(_timer); _timer = null; }
        markers.forEach(m => { if (map) map.removeLayer(m); });
        markers = [];
        _clearTracks();
      }
    },
    getData() {
      return {
        known:   KNOWN_SATS,
        typeCfg: TYPE_CFG,
        active:  markers.length
      };
    }
  };
})();
