/* ── SPYMETER — US Overseas Airbases Layer ──────────────────
   Source: IISS Military Balance 2024, Pentagon BRAC data,
   GlobalSecurity.org, official DoD announcements (public OSINT).
   35 major bases across USAFE, CENTCOM, INDOPACOM, AFRICOM.    */
const USBASES = (() => {
  let map   = null;
  let layer = null;
  let enabled = false;

  // ── US Overseas Air Base Database ───────────────────────
  // cmd: USAFE(Europe), CENTCOM(Middle East), INDOPACOM(Asia-Pacific), AFRICOM(Africa)
  const BASES = [
    // ── EUROPE / USAFE ──────────────────────────────────────
    { name:'Ramstein AB',        country:'Germany',        cmd:'USAFE',    lat:49.44, lng:7.60,   aircraft:'F-35A · C-17 · KMC logistics HQ', personnel:54000, tier:1 },
    { name:'Lakenheath AB',      country:'UK',             cmd:'USAFE',    lat:52.41, lng:0.56,   aircraft:'F-35A Lightning II (48th FW)', personnel:8400, tier:1 },
    { name:'Mildenhall AB',      country:'UK',             cmd:'USAFE',    lat:52.36, lng:0.49,   aircraft:'KC-135 Stratotanker · CV-22 Osprey', personnel:3200, tier:2 },
    { name:'Aviano AB',          country:'Italy',          cmd:'USAFE',    lat:46.03, lng:12.60,  aircraft:'F-16CM Fighting Falcon (31st FW)', personnel:5400, tier:1 },
    { name:'Sigonella NAS',      country:'Italy',          cmd:'NAVEUR',   lat:37.41, lng:14.92,  aircraft:'P-8A Poseidon · MQ-4C Triton · RQ-4B', personnel:3500, tier:2 },
    { name:'Incirlik AB',        country:'Turkey',         cmd:'USAFE',    lat:37.00, lng:35.43,  aircraft:'A-10 · KC-135 · NATO tactical nukes (B61)', personnel:2600, tier:2 },
    { name:'Spangdahlem AB',     country:'Germany',        cmd:'USAFE',    lat:49.97, lng:6.69,   aircraft:'F-16 · A-10 · MQ-9 Reaper', personnel:4200, tier:2 },
    { name:'Moron AB',           country:'Spain',          cmd:'USAFE',    lat:37.17, lng:-5.62,  aircraft:'C-130 · CV-22 Osprey (SOCOM)', personnel:1200, tier:3 },
    { name:'Rota NAS',           country:'Spain',          cmd:'NAVEUR',   lat:36.64, lng:-6.35,  aircraft:'DDG Destroyers · P-8 Poseidon · 6th Fleet', personnel:4000, tier:2 },
    { name:'Lajes Field',        country:'Portugal (Azores)',cmd:'USAFE',  lat:38.76, lng:-27.09, aircraft:'KC-135 · P-8 · C-17 transatlantic ops', personnel:1200, tier:3 },
    { name:'KFOR / Camp Bondsteel', country:'Kosovo',     cmd:'EUCOM',    lat:42.39, lng:21.15,  aircraft:'AH-64D Apache · CH-47 Chinook · UH-60', personnel:700, tier:3 },

    // ── MIDDLE EAST / CENTCOM ───────────────────────────────
    { name:'Al Udeid AB',        country:'Qatar',          cmd:'CENTCOM',  lat:25.12, lng:51.32,  aircraft:'F-15E · B-1B · B-52H · KC-135 · E-3 AWACS', personnel:10000, tier:1 },
    { name:'Prince Sultan AB',   country:'Saudi Arabia',   cmd:'CENTCOM',  lat:24.08, lng:47.49,  aircraft:'F-35A · F-22A · THAAD / Patriot batteries', personnel:5000, tier:1 },
    { name:'Al Dhafra AB',       country:'UAE',            cmd:'CENTCOM',  lat:24.24, lng:54.55,  aircraft:'F-22A Raptor · B-2 Spirit · F-35A · U-2S', personnel:5000, tier:1 },
    { name:'NSA Bahrain',        country:'Bahrain',        cmd:'NAVCENT',  lat:26.23, lng:50.60,  aircraft:'5th Fleet HQ · MH-60R · P-8 Poseidon', personnel:3600, tier:1 },
    { name:'Ali Al Salem AB',    country:'Kuwait',         cmd:'CENTCOM',  lat:29.35, lng:47.53,  aircraft:'F/A-18 · C-17 · AV-8B Harrier ops', personnel:2600, tier:2 },
    { name:'Camp Lemonnier',     country:'Djibouti',       cmd:'AFRICOM',  lat:11.55, lng:43.15,  aircraft:'MQ-9 Reaper · P-8 · Special Ops aviation · CJTF-HOA', personnel:4000, tier:1 },
    { name:'Chabelley Airfield', country:'Djibouti',       cmd:'AFRICOM',  lat:11.29, lng:42.99,  aircraft:'MQ-9 Reaper · MQ-1 Predator drone ops', personnel:600, tier:3 },
    { name:'Minhad AB',          country:'UAE',            cmd:'CENTCOM',  lat:25.03, lng:55.37,  aircraft:'MQ-9 Reaper · C-17 · logistics support', personnel:2000, tier:2 },

    // ── ASIA-PACIFIC / INDOPACOM ────────────────────────────
    { name:'Kadena AFB',         country:'Japan (Okinawa)',cmd:'PACAF',    lat:26.36, lng:127.77, aircraft:'F-15C/D (18th Wing) · KC-135 · E-3 AWACS · RC-135', personnel:20000, tier:1 },
    { name:'Misawa AFB',         country:'Japan',          cmd:'PACAF',    lat:40.70, lng:141.37, aircraft:'F-16CJ (35th FW) · P-8A Poseidon · NSG Intel', personnel:11000, tier:1 },
    { name:'Yokota AB',          country:'Japan',          cmd:'PACAF HQ', lat:35.75, lng:139.35, aircraft:'C-130 · UH-1N · C-12J · Pacific Air Forces HQ', personnel:16000, tier:1 },
    { name:'Osan AFB',           country:'South Korea',    cmd:'PACAF',    lat:37.09, lng:127.03, aircraft:'F-16CM/DM · A-10 · OA-10 · U-2S Dragon Lady', personnel:12000, tier:1 },
    { name:'Kunsan AFB',         country:'South Korea',    cmd:'PACAF',    lat:35.90, lng:126.62, aircraft:'F-16CG/DG (8th FW) · Wolf Pack', personnel:8000, tier:1 },
    { name:'Andersen AFB',       country:'Guam',           cmd:'PACAF',    lat:13.58, lng:144.93, aircraft:'B-52H · B-1B · B-2A (rotational) · KC-135', personnel:5200, tier:1 },
    { name:'NAF Atsugi',         country:'Japan',          cmd:'NAVPAC',   lat:35.45, lng:139.45, aircraft:'P-8A Poseidon · EA-18G Growler · F/A-18', personnel:4000, tier:2 },
    { name:'MCAS Iwakuni',       country:'Japan',          cmd:'MARFORPAC',lat:34.14, lng:132.24, aircraft:'F-35B · F/A-18 · EA-18G · MV-22 Osprey', personnel:7000, tier:2 },
    { name:'Clark AB (Rotational)',country:'Philippines',  cmd:'INDOPACOM',lat:15.18, lng:120.56, aircraft:'P-8 · F-22 · B-52 rotational deployments', personnel:800, tier:3 },
    { name:'RAAF Darwin (USMC)', country:'Australia',      cmd:'INDOPACOM',lat:-12.42, lng:130.88,aircraft:'F-35B · MV-22 Osprey (Marine Rotational Force)', personnel:2500, tier:2 },
    { name:'Tinian (CDAB)',      country:'Mariana Islands',cmd:'PACAF',    lat:15.00, lng:145.64, aircraft:'B-52 forward ops · logistics node', personnel:150, tier:3 },
    { name:'Wake Island Airfield',country:'Wake Island',   cmd:'PACAF',    lat:19.28, lng:166.64, aircraft:'Contingency / emergency landing strip', personnel:50, tier:3 },
  ];

  // ── Command color coding ─────────────────────────────────
  const CMD_COLORS = {
    'USAFE':    '#4488ff',
    'NAVEUR':   '#44aaff',
    'CENTCOM':  '#ff9900',
    'NAVCENT':  '#ffaa33',
    'AFRICOM':  '#00ff88',
    'PACAF':    '#00d4ff',
    'NAVPAC':   '#33ddff',
    'INDOPACOM':'#00bbee',
    'MARFORPAC':'#00ccdd',
    'EUCOM':    '#6688ff',
    'PACAF HQ': '#ff66cc',
  };

  // ── Radius by tier ───────────────────────────────────────
  const TIER_RADIUS = { 1: 10, 2: 7, 3: 5 };

  function getColor(cmd) { return CMD_COLORS[cmd] || '#aaaaaa'; }

  // ── Build layer ──────────────────────────────────────────
  function buildLayer() {
    const lg = L.layerGroup();
    BASES.forEach(b => {
      const col = getColor(b.cmd);
      const r   = TIER_RADIUS[b.tier] || 6;

      const marker = L.circleMarker([b.lat, b.lng], {
        radius:      r,
        color:       col,
        fillColor:   col,
        fillOpacity: 0.30,
        weight:      1.5,
        opacity:     0.85,
      });

      // Pulsing outer ring (CSS animation via SVG path override)
      const outerRing = L.circleMarker([b.lat, b.lng], {
        radius:      r + 3,
        color:       col,
        fillColor:   'transparent',
        fillOpacity: 0,
        weight:      0.8,
        opacity:     0.4,
        dashArray:   '3,3',
      });

      const popupHtml = `
        <div class="usbase-popup">
          <div class="usbase-name">✈ ${b.name}</div>
          <div class="usbase-country">📍 ${b.country}</div>
          <div class="usbase-cmd" style="color:${col}">${b.cmd}</div>
          <div class="usbase-aircraft">🛩 ${b.aircraft}</div>
          <div class="usbase-personnel">👥 ${b.personnel > 0 ? b.personnel.toLocaleString() + ' personnel' : 'Contingency'}</div>
        </div>`;

      marker.bindPopup(popupHtml, { maxWidth: 240 });
      marker.bindTooltip(`${b.name} (${b.country})`, { direction:'top', opacity:0.9 });

      lg.addLayer(outerRing);
      lg.addLayer(marker);
    });
    return lg;
  }

  // ── Stats card ───────────────────────────────────────────
  function renderStats() {
    const el = document.getElementById('usbase-stats-list');
    if (!el) return;

    // Count by command
    const byCMD = {};
    let totalPersonnel = 0;
    BASES.forEach(b => {
      byCMD[b.cmd] = (byCMD[b.cmd] || 0) + 1;
      totalPersonnel += b.personnel;
    });

    // Count by country
    const byCountry = {};
    BASES.forEach(b => { byCountry[b.country] = (byCountry[b.country] || 0) + 1; });
    const topCountries = Object.entries(byCountry).sort((a,b) => b[1]-a[1]).slice(0,6);

    el.innerHTML = `
      <div class="usbase-summary">
        <div class="usbase-stat-row"><span class="usb-lbl">Total Bases</span><span class="usb-val" style="color:#00d4ff">${BASES.length}</span></div>
        <div class="usbase-stat-row"><span class="usb-lbl">Personnel (overseas)</span><span class="usb-val" style="color:#ff9900">${totalPersonnel.toLocaleString()}+</span></div>
        <div class="usbase-stat-row"><span class="usb-lbl">Countries w/ Bases</span><span class="usb-val" style="color:#00ff88">${Object.keys(byCountry).length}</span></div>
      </div>
      <div class="usbase-cmd-hdr">BY COMMAND</div>
      ${Object.entries(byCMD).map(([cmd, n]) => `
        <div class="usbase-cmd-row">
          <span class="usb-cmd-dot" style="background:${getColor(cmd)}"></span>
          <span class="usb-cmd-name">${cmd}</span>
          <span class="usb-cmd-count">${n}</span>
        </div>`).join('')}
      <div class="usbase-cmd-hdr" style="margin-top:6px">TOP HOST NATIONS</div>
      ${topCountries.map(([country, n]) => `
        <div class="usbase-cmd-row">
          <span class="usb-cmd-name">${country}</span>
          <span class="usb-cmd-count">${n}</span>
        </div>`).join('')}
    `;
  }

  // ── Public API ───────────────────────────────────────────
  function init(leafletMap) {
    map = leafletMap;
    renderStats();
  }

  function setEnabled(on) {
    enabled = on;
    if (!map) return;
    if (on) {
      if (!layer) layer = buildLayer();
      layer.addTo(map);
    } else {
      if (layer) layer.remove();
    }
    const card = document.getElementById('usbase-card');
    if (card) card.style.display = on ? 'block' : 'none';
  }

  function getBases() { return BASES; }

  return { init, setEnabled, getBases };
})();
