/* ── SPYMETER — Military Equipment & Weapons Layer ─────────
   Data: SIPRI, IISS Military Balance, GlobalFirepower (public)
   Types: Air Defense, Anti-Tank, Ballistic Missiles, Artillery
   ────────────────────────────────────────────────────────── */
const WEAPONS = (() => {
  let map          = null;
  let layer        = null;
  let enabled      = false;
  let activeFilter = 'all';

  // ── Curated weapons data (SIPRI/IISS/public sources) ────
  const SYSTEMS = [
    // ── AIR DEFENSE SYSTEMS ──────────────────────────────
    { name:'Patriot PAC-3 MSE',     country:'USA',           lat:38.90,  lng:-77.00,  type:'air-defense', status:'active', qty:240,   range:160,   notes:'Theater ballistic missile defense — deployed globally. Supplied to Ukraine, Saudi, Qatar, Japan, Taiwan.' },
    { name:'THAAD System',          country:'USA',           lat:36.50,  lng:127.80,  type:'air-defense', status:'active', qty:7,     range:200,   notes:'Terminal High Altitude Area Defense — 7 batteries, $3B/unit. Deployed: Guam, S.Korea, Israel, UAE.' },
    { name:'S-400 Triumf',          country:'Russia',        lat:55.75,  lng:37.61,   type:'air-defense', status:'active', qty:36,    range:400,   notes:'Russia premier long-range SAM. Exported to China, India, Turkey, Belarus. Can target F-35.' },
    { name:'S-350 Poliment-Redut',  country:'Russia',        lat:59.95,  lng:30.32,   type:'air-defense', status:'active', qty:12,    range:150,   notes:'Russia medium-range, replaces S-300. Active since 2019.' },
    { name:'Iron Dome (C-RAM)',     country:'Israel',        lat:31.80,  lng:35.20,   type:'air-defense', status:'active', qty:10,    range:70,    notes:'Rafael short-range counter-rocket, mortar and artillery. 90%+ intercept rate confirmed Apr/Oct 2024.' },
    { name:'Arrow-3',               country:'Israel',        lat:31.50,  lng:34.90,   type:'air-defense', status:'active', qty:4,     range:2400,  notes:'Exo-atmospheric interceptor for ballistic missiles. Intercepted Iranian missiles Oct 2024.' },
    { name:"David's Sling",         country:'Israel',        lat:31.60,  lng:35.00,   type:'air-defense', status:'active', qty:6,     range:300,   notes:'Stunner/SkyCeptor — medium-to-long range, replaces Hawk. Uses active radar seeker.' },
    { name:'HQ-9B (FD-2000)',       country:'China',         lat:39.90,  lng:116.40,  type:'air-defense', status:'active', qty:64,    range:200,   notes:'China long-range SAM, S-300 class. Deployed PLA AF + exported to Saudi Arabia, Uzbekistan, Turkmenistan.' },
    { name:'HQ-19 (ABM)',           country:'China',         lat:32.06,  lng:118.77,  type:'air-defense', status:'active', qty:8,     range:400,   notes:'Anti-ballistic missile system, China newest SAM. Under deployment 2024.' },
    { name:'Bavar-373',             country:'Iran',          lat:35.70,  lng:51.40,   type:'air-defense', status:'active', qty:6,     range:200,   notes:'Iran domestic long-range SAM system, claimed S-300 equivalent. Evaded Israeli strikes Oct 2024.' },
    { name:'Buk-M3 Viking',         country:'Russia',        lat:51.70,  lng:39.20,   type:'air-defense', status:'active', qty:48,    range:70,    notes:'Russia medium-range SAM, used extensively in Ukraine. Responsible for MH17.' },
    { name:'NASAMS',                country:'USA',           lat:38.90,  lng:-77.00,  type:'air-defense', status:'active', qty:50,    range:25,    notes:'National Advanced SAM — AIM-120 AMRAAM-based, supplied Ukraine, Norway, Finland, Netherlands.' },
    { name:'Mistral VSHORAD',       country:'France',        lat:48.85,  lng:2.35,    type:'air-defense', status:'active', qty:400,   range:6,     notes:'MBDA man-portable + vehicle-mounted SHORAD. Widely exported to 40+ countries.' },

    // ── ANTI-TANK MISSILES ────────────────────────────────
    { name:'FGM-148 Javelin',       country:'USA',           lat:38.90,  lng:-77.00,  type:'anti-tank', status:'active', qty:45000, range:4.75,  notes:'Lockheed/Raytheon fire-and-forget ATGM. 45,000+ units. 80,000+ sent to Ukraine. Tandem warhead.' },
    { name:'NLAW (MBT LAW)',        country:'United Kingdom',lat:51.50,  lng:-0.12,   type:'anti-tank', status:'active', qty:10000, range:0.8,   notes:'SAAB/Thales next-gen LAW. 10,000+ sent to Ukraine. Single shot, 400mm penetration.' },
    { name:'9M133 Kornet-EM',       country:'Russia',        lat:55.75,  lng:37.61,   type:'anti-tank', status:'active', qty:30000, range:10,    notes:'Russia 3rd-gen laser-guided ATGM. 30,000+ in service. Exported to 20+ countries.' },
    { name:'Spike LR2',             country:'Israel',        lat:31.50,  lng:34.90,   type:'anti-tank', status:'active', qty:5000,  range:5.5,   notes:'Rafael electro-optical/IIR fire-and-forget. Used by IDF + 40+ export countries.' },
    { name:'9M119 Refleks (AT-11)', country:'Russia',        lat:55.75,  lng:37.61,   type:'anti-tank', status:'active', qty:20000, range:5,     notes:'Laser-guided ATGM fired through T-72/T-80/T-90 gun barrel.' },
    { name:'HJ-12 Red Arrow',       country:'China',         lat:39.90,  lng:116.40,  type:'anti-tank', status:'active', qty:8000,  range:4,     notes:'China 3rd-gen ATGM, similar to Javelin. Fire-and-forget, IIR seeker.' },
    { name:'Panzerfaust 3-IT',      country:'Germany',       lat:51.20,  lng:10.40,   type:'anti-tank', status:'active', qty:15000, range:0.6,   notes:'Recoilless ATGM — 50,000+ sent to Ukraine. Simple operation, 800mm penetration.' },
    { name:'Milan ER',              country:'France',        lat:48.85,  lng:2.35,    type:'anti-tank', status:'active', qty:10000, range:3,     notes:'MBDA SACLOS ATGM. 350,000+ produced. Widely exported — Algeria, Egypt, India, Pakistan.' },
    { name:'Konkurs-M (AT-5)',      country:'Russia',        lat:55.75,  lng:37.61,   type:'anti-tank', status:'active', qty:50000, range:4,     notes:'SACLOS-guided ATGM, BMP-2 mounted. Extensively used Ukraine/Syria conflict.' },
    { name:'Ataka-V (AT-9)',        country:'Russia',        lat:55.75,  lng:37.61,   type:'anti-tank', status:'active', qty:10000, range:8,     notes:'Radio command ATGM, Ka-52 helicopter launched.' },

    // ── BALLISTIC MISSILES ────────────────────────────────
    { name:'LGM-30 Minuteman III',  country:'USA',           lat:47.51,  lng:-111.18, type:'ballistic', status:'active', qty:400,   range:13000, notes:'US land-based ICBM. 400 silos at Malmstrom/Minot/Warren AFB. W78/W87 MIRVed.' },
    { name:'UGM-133 Trident II D5', country:'USA',           lat:30.35,  lng:-81.66,  type:'ballistic', status:'active', qty:200,   range:12000, notes:'US SSBN SLBM — Ohio-class subs. 14 SSBNs, each up to 20 missiles. Most accurate ICBM.' },
    { name:'RS-28 Sarmat (Satan-2)',country:'Russia',        lat:56.10,  lng:59.80,   type:'ballistic', status:'active', qty:6,     range:18000, notes:'Russia new heavy ICBM. 10+ MIRV warheads, hypersonic glide option. Strategic deterrent.' },
    { name:'RS-24 Yars ICBM',      country:'Russia',        lat:56.64,  lng:47.90,   type:'ballistic', status:'active', qty:185,   range:11000, notes:'Russia road-mobile ICBM. 4 MIRVed warheads. Replacing SS-18/SS-19.' },
    { name:'DF-41 ICBM',           country:'China',         lat:43.12,  lng:93.20,   type:'ballistic', status:'active', qty:30,    range:14000, notes:'China road-mobile ICBM — silos in Xinjiang, Inner Mongolia. 10-12 MIRV capable.' },
    { name:'DF-5B ICBM',           country:'China',         lat:40.00,  lng:116.00,  type:'ballistic', status:'active', qty:20,    range:13000, notes:'China silo-based ICBM. Liquid fueled, MIRV warheads. Targets CONUS.' },
    { name:'Agni-V ICBM',          country:'India',         lat:13.10,  lng:80.30,   type:'ballistic', status:'active', qty:6,     range:5500,  notes:'DRDO India ICBM. MIRV-capable (tested 2024). China/Europe in range. Road-mobile.' },
    { name:'Shaheen-III MRBM',     country:'Pakistan',      lat:30.40,  lng:69.30,   type:'ballistic', status:'active', qty:50,    range:2750,  notes:'Pakistan solid-fuel MRBM. Andaman & Nicobar Islands in range — India deterrent.' },
    { name:'Hwasong-17 ICBM',      country:'North Korea',   lat:39.80,  lng:125.70,  type:'ballistic', status:'active', qty:8,     range:15000, notes:'NK largest ICBM. MIRV potentially capable. CONUS in range. TEL road-mobile.' },
    { name:'Hwasong-11 (KN-23)',   country:'North Korea',   lat:38.80,  lng:125.60,  type:'ballistic', status:'active', qty:100,   range:700,   notes:'NK SRBM with quasi-ballistic depressed trajectory. Evades THAAD/PAC-3.' },
    { name:'Shahab-3/Emad MRBM',   country:'Iran',          lat:34.00,  lng:52.00,   type:'ballistic', status:'active', qty:200,   range:1800,  notes:'IRGC MRBM — Israel + US Gulf bases in range. Used in Apr/Oct 2024 attacks vs Israel.' },
    { name:'Zolfaghar SRBM',       country:'Iran',          lat:32.40,  lng:51.70,   type:'ballistic', status:'active', qty:300,   range:700,   notes:'IRGC SRBM — accurate sub-10m CEP. Used in Jan 2024 attacks Iraq/Syria.' },

    // ── ARTILLERY & PRECISION MLRS ────────────────────────
    { name:'M142 HIMARS',          country:'USA',           lat:36.80,  lng:-76.30,  type:'artillery', status:'active', qty:500,   range:300,   notes:'GPS MLRS — game-changer in Ukraine. GLSDB (range 150km) + ATACMS (300km). 60+ sent Ukraine.' },
    { name:'M270 MLRS',            country:'USA',           lat:36.60,  lng:-87.47,  type:'artillery', status:'active', qty:840,   range:300,   notes:'Tracked MLRS, 12-round full salvo. ATACMS-capable. Key NATO stockpile.' },
    { name:'PzH 2000',             country:'Germany',       lat:51.20,  lng:10.40,   type:'artillery', status:'active', qty:185,   range:67,    notes:'Germany Krauss-Maffei SPH. 67km with V-LAP. 18 sent to Ukraine. Best in class accuracy.' },
    { name:'Caesar SPH 155mm',     country:'France',        lat:48.85,  lng:2.35,    type:'artillery', status:'active', qty:254,   range:42,    notes:'Nexter wheeled self-propelled howitzer. 18+ sent Ukraine. 6-round burst in 60s.' },
    { name:'BM-21 Grad MLRS',      country:'Russia',        lat:55.75,  lng:37.61,   type:'artillery', status:'active', qty:2500,  range:40,    notes:'Russia 40-round 122mm MLRS. Most-used weapon Ukraine. 2,500+ Russian, 400+ Ukrainian.' },
    { name:'9A52-4 Tornado-G',     country:'Russia',        lat:51.40,  lng:46.10,   type:'artillery', status:'active', qty:500,   range:120,   notes:'Upgraded Grad replacement. GPS-guided munitions, 120km range. Used extensively Ukraine.' },
    { name:'TOS-1A Buratino',      country:'Russia',        lat:55.75,  lng:37.61,   type:'artillery', status:'active', qty:48,    range:6,     notes:'Thermobaric MLRS — 220mm incendiary. T-72 chassis. Burns oxygen out of underground shelters.' },
    { name:'WS-2 MLRS',           country:'China',         lat:39.90,  lng:116.40,  type:'artillery', status:'active', qty:600,   range:480,   notes:'China 400mm MLRS. 480km range. GPS-guided. Threatens Taiwan + US bases Guam.' },
    { name:'Pinaka Mk2 MLRS',     country:'India',         lat:17.45,  lng:78.53,   type:'artillery', status:'active', qty:400,   range:90,    notes:'India DRDO 214mm MLRS. 90km range guided version. Ordered 6,000+ rockets.' },
    { name:'Fatah-II MLRS',       country:'Pakistan',      lat:33.87,  lng:72.40,   type:'artillery', status:'active', qty:150,   range:400,   notes:'Pakistan guided MLRS. 400km range, GPS precision. Tested 2023 — covers all of India Punjab/Gujarat.' },
  ];

  const FILTER_TYPES = [
    { id:'all',         label:'ALL',        emoji:'⊛' },
    { id:'air-defense', label:'AIR DEF',    emoji:'△' },
    { id:'anti-tank',   label:'ANTI-TANK',  emoji:'⊞' },
    { id:'ballistic',   label:'BALLISTIC',  emoji:'🚀' },
    { id:'artillery',   label:'ARTILLERY',  emoji:'⊕' },
  ];

  function systemColor(country) {
    const c = {
      'USA':'#3399ff','Russia':'#ff3333','China':'#ffaa00','United Kingdom':'#cc44ff',
      'France':'#4488ff','Israel':'#00ff88','NATO':'#00d4ff','North Korea':'#aa0033',
      'Iran':'#ff6600','India':'#ff8844','Germany':'#44dd88','Pakistan':'#88cc00',
    };
    return c[country] || '#8899aa';
  }

  function typeEmoji(t) {
    return { 'air-defense':'△', 'anti-tank':'⊞', 'ballistic':'🚀', 'artillery':'⊕' }[t] || '⊛';
  }

  function typeColor(t) {
    return { 'air-defense':'#00ccff', 'anti-tank':'#ff9900', 'ballistic':'#ff3333', 'artillery':'#ffdd00' }[t] || '#88aacc';
  }

  function makeMarker(sys) {
    const cc = systemColor(sys.country);
    const tc = typeColor(sys.type);
    const em = typeEmoji(sys.type);

    const icon = L.divIcon({
      html: `<div class="weapon-icon" style="--cc:${cc};--tc:${tc}" title="${sys.name}">${em}</div>`,
      className: '',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    const statusColor = sys.status === 'active' ? '#00ff88' : '#ff9900';
    const popup = `
      <div class="popup-box" style="min-width:230px">
        <div class="popup-title" style="color:${tc}">${em} ${sys.name}</div>
        <div class="popup-row"><span class="popup-key">COUNTRY</span><span class="popup-val" style="color:${cc}">${sys.country}</span></div>
        <div class="popup-row"><span class="popup-key">TYPE</span><span class="popup-val orange">${sys.type.replace('-',' ').toUpperCase()}</span></div>
        <div class="popup-row"><span class="popup-key">STATUS</span><span class="popup-val" style="color:${statusColor}">${sys.status.toUpperCase()}</span></div>
        <div class="popup-row"><span class="popup-key">QUANTITY</span><span class="popup-val">${sys.qty.toLocaleString()} units</span></div>
        <div class="popup-row"><span class="popup-key">RANGE</span><span class="popup-val">${sys.range < 1 ? sys.range * 1000 + 'm' : sys.range + ' km'}</span></div>
        <div style="font-size:9.5px;color:#8ba4c0;padding:5px 0;line-height:1.45">${sys.notes}</div>
      </div>`;

    const m = L.marker([sys.lat, sys.lng], { icon, zIndexOffset: 55 }).bindPopup(popup, { maxWidth: 300 });
    m.on('click', () => {
      if (typeof SIDEBAR !== 'undefined')
        SIDEBAR.addFeedItem('military', `${em} ${sys.name} — ${sys.country} | ${sys.qty.toLocaleString()} units | Range: ${sys.range}km`);
    });
    return m;
  }

  function renderLayer() {
    if (!layer) return;
    layer.clearLayers();
    const filtered = activeFilter === 'all' ? SYSTEMS : SYSTEMS.filter(s => s.type === activeFilter);
    filtered.forEach(sys => makeMarker(sys).addTo(layer));
  }

  function init(mapInstance) {
    map   = mapInstance;
    layer = L.layerGroup();
  }

  function setEnabled(on) {
    enabled = on;
    if (!map) return;
    if (on) { renderLayer(); layer.addTo(map); }
    else if (layer) map.removeLayer(layer);
  }

  function setFilter(f) {
    activeFilter = f;
    if (enabled) renderLayer();
    // Update UI buttons
    document.querySelectorAll('.wfbtn').forEach(b => b.classList.toggle('active', b.dataset.wf === f));
  }

  return { init, setEnabled, setFilter, FILTER_TYPES, getSystems: () => SYSTEMS };
})();
