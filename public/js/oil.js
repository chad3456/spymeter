/* ── SPYMETER — Oil & Energy Geopolitical Layer ────────────
   Chokepoints, oil facilities, tanker routes, Houthi zones,
   submarine cable paths, crude-price impact display.        */
const OIL = (() => {
  let map      = null;
  let layer    = null;
  let enabled  = false;

  // ── Oil Chokepoints ──────────────────────────────────
  const CHOKEPOINTS = [
    { name:'Strait of Hormuz', lat:26.6,  lng:56.5,  threat:'CRITICAL', pct:'20%', detail:'20% of global oil. Iran controls closure threat.', color:'#ff2200' },
    { name:'Suez Canal',       lat:30.5,  lng:32.3,  threat:'HIGH',     pct:'8%',  detail:'8% global trade. Houthi attacks diverted ships.', color:'#ff6600' },
    { name:'Bab el-Mandab',    lat:12.5,  lng:43.5,  threat:'CRITICAL', pct:'12%', detail:'Houthi anti-ship missiles. 150+ attacks in 2024-25.', color:'#ff2200' },
    { name:'Strait of Malacca',lat:2.5,   lng:103.5, threat:'MODERATE', pct:'25%', detail:'25% global trade. China-US rivalry flashpoint.', color:'#ffaa00' },
    { name:'Turkish Straits',  lat:41.0,  lng:29.0,  threat:'MODERATE', pct:'3%',  detail:'Black Sea Russian oil. Ukraine war impact.', color:'#ffaa00' },
    { name:'Cape of Good Hope',lat:-34.4, lng:18.5,  threat:'LOW',      pct:'—',   detail:'Alternate Suez route — 10,000km extra per voyage.', color:'#00ff88' },
    { name:'Strait of Gibraltar',lat:35.9,lng:-5.6,  threat:'LOW',      pct:'15%', detail:'Atlantic-Mediterranean gateway.', color:'#ffcc00' },
  ];

  // ── Oil Production & Export Facilities ───────────────
  const OIL_FACILITIES = [
    { name:'Kharg Island — Iran',        lat:29.2,  lng:50.3,  type:'export',    bpd:'1.5M', color:'#ff4400', detail:'Iran primary oil export terminal. Sanctions target.' },
    { name:'Ras Tanura — Saudi Arabia',  lat:26.6,  lng:50.2,  type:'export',    bpd:'6.5M', color:'#ffaa00', detail:'World\'s largest single oil export facility.' },
    { name:'Basra Oil Terminal — Iraq',  lat:29.3,  lng:48.5,  type:'export',    bpd:'3.0M', color:'#ff8800', detail:'Iraq main export terminal. PMF influence zone.' },
    { name:'Abqaiq — Saudi Arabia',      lat:25.9,  lng:49.7,  type:'processing',bpd:'7.0M', color:'#ffcc00', detail:'Largest oil processing plant. Drone-attacked 2019.' },
    { name:'Qeshm Island — Iran',        lat:26.8,  lng:56.1,  type:'military',  bpd:'0.5M', color:'#ff0000', detail:'IRGC naval base. Tanker seizure operations.' },
    { name:'Bandar Abbas — Iran',        lat:27.2,  lng:56.4,  type:'port',      bpd:'—',    color:'#ff4400', detail:'Iran\'s main port. IRGC gunboat base.' },
    { name:'Jubail — Saudi Arabia',      lat:27.0,  lng:49.7,  type:'industrial',bpd:'2.5M', color:'#ffaa00', detail:'King Fahd Industrial Port. Key Saudi export.' },
    { name:'Al-Zakum — UAE',             lat:24.1,  lng:53.6,  type:'offshore',  bpd:'1.0M', detail:'UAE offshore field. ADNOC.',color:'#ff9900' },
    { name:'Rumaila Field — Iraq',       lat:30.1,  lng:47.5,  type:'field',     bpd:'1.4M', detail:'Iraq largest oilfield. BP/PetroChina operated.', color:'#ff8800' },
    { name:'Baku-Ceyhan Pipeline',       lat:40.4,  lng:50.0,  type:'pipeline',  bpd:'1.2M', detail:'BTC pipeline — Azerbaijan to Turkey.', color:'#ffdd00' },
    { name:'Golan Pipeline Junction',    lat:33.0,  lng:36.5,  type:'pipeline',  bpd:'—',    detail:'Syria/Israel contested energy corridor.',color:'#ff6600' },
    { name:'Oman LNG Terminal',          lat:22.5,  lng:59.5,  type:'lng',       bpd:'1.0M', detail:'LNG exports to Asia. Gulf of Oman route.', color:'#00ccff' },
  ];

  // ── Houthi Threat Zones (Red Sea) ────────────────────
  const HOUTHI_THREAT = [
    { name:'Red Sea — N. Corridor',  lat:17.5, lng:39.0, attacks:150, color:'#ff2200', risk:'CRITICAL' },
    { name:'Gulf of Aden',           lat:12.0, lng:48.0, attacks:45,  color:'#ff6600', risk:'HIGH'     },
    { name:'Bab el-Mandab Zone',     lat:12.5, lng:43.3, attacks:90,  color:'#ff2200', risk:'CRITICAL' },
  ];

  // ── Submarine Cable Routes (energy data) ─────────────
  const PIPELINES = [
    { name:'Nord Stream Route (severed)', from:[57.0, 13.0], to:[54.5, 19.5], status:'SEVERED', color:'#ff3333' },
    { name:'BTC Pipeline Azerbaijan',    from:[40.4, 50.0],  to:[36.9, 36.8], status:'ACTIVE',  color:'#00ff88' },
    { name:'Trans-Arabian Pipeline',     from:[26.3, 50.0],  to:[33.0, 35.5], status:'PARTIAL', color:'#ffaa00' },
    { name:'Arab Gas Pipeline',          from:[30.5, 32.3],  to:[33.9, 35.5], status:'PARTIAL', color:'#ffaa00' },
  ];

  // ── Current crude price display ───────────────────────
  const OIL_PRICE_IMPACT = [
    { event:'Houthi Red Sea attacks',         pct:'+18%', bbl:'$92',  desc:'Shipping insurance +400%. 700 ships diverted.' },
    { event:'Iran sanctions tightening',      pct:'+9%',  bbl:'+$7',  desc:'1.5M bpd off market. IRGC tanker seizures.' },
    { event:'OPEC+ voluntary cuts',           pct:'+6%',  bbl:'+$5',  desc:'Saudi/Russia 2.5M bpd combined cuts.' },
    { event:'Gaza War geopolitical premium',  pct:'+4%',  bbl:'+$3',  desc:'Regional escalation risk premium.' },
    { event:'Ukraine energy infrastructure',  pct:'+3%',  bbl:'+$2',  desc:'Russian gas supply disruption to Europe.' },
  ];

  // ── SVG icons ─────────────────────────────────────────
  function chokeIcon(threat) {
    const c = threat === 'CRITICAL' ? '#ff2200' : threat === 'HIGH' ? '#ff6600' : '#ffaa00';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" style="filter:drop-shadow(0 0 5px ${c})">
      <polygon points="12,2 20,8 17,18 7,18 4,8" fill="${c}22" stroke="${c}" stroke-width="1.5"/>
      <text x="12" y="15" text-anchor="middle" font-size="10" font-weight="bold" fill="${c}">⚠</text>
    </svg>`;
  }

  function oilIcon(type) {
    const c = type === 'military' ? '#ff2200' : type === 'lng' ? '#00ccff' : type === 'pipeline' ? '#ffdd00' : '#ff8800';
    const glyph = type === 'lng' ? '⬡' : type === 'pipeline' ? '═' : type === 'military' ? '✦' : '⬟';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" style="filter:drop-shadow(0 0 4px ${c})">
      <rect x="8" y="4" width="8" height="12" rx="3" fill="${c}33" stroke="${c}" stroke-width="1.5"/>
      <rect x="9" y="14" width="6" height="4" fill="${c}55"/>
      <ellipse cx="12" cy="4" rx="4" ry="1.5" fill="${c}"/>
      <text x="12" y="22" text-anchor="middle" font-size="7" fill="${c}">${glyph}</text>
    </svg>`;
  }

  function houthiIcon() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" style="filter:drop-shadow(0 0 6px #ff2200)">
      <circle cx="12" cy="12" r="10" fill="rgba(255,34,0,0.12)" stroke="#ff2200" stroke-width="1.5" stroke-dasharray="3,2"/>
      <text x="12" y="16" text-anchor="middle" font-size="12">🚢</text>
    </svg>`;
  }

  // ── Build popup HTML ───────────────────────────────────
  function chokePopup(cp) {
    return `<div class="popup-box">
      <div class="popup-title" style="color:${cp.color}">⚠ CHOKEPOINT: ${cp.name}</div>
      <div class="popup-row"><span class="popup-key">THREAT</span><span class="popup-val" style="color:${cp.color}">${cp.threat}</span></div>
      <div class="popup-row"><span class="popup-key">GLOBAL FLOW</span><span class="popup-val green">${cp.pct} of world oil</span></div>
      <div class="popup-row" style="margin-top:4px;font-size:9px;color:#c8dff0">${cp.detail}</div>
    </div>`;
  }
  function oilFacPopup(f) {
    return `<div class="popup-box">
      <div class="popup-title" style="color:${f.color}">🛢 ${f.name}</div>
      <div class="popup-row"><span class="popup-key">TYPE</span><span class="popup-val">${f.type.toUpperCase()}</span></div>
      ${f.bpd !== '—' ? `<div class="popup-row"><span class="popup-key">CAPACITY</span><span class="popup-val green">${f.bpd} bpd</span></div>` : ''}
      <div class="popup-row" style="margin-top:4px;font-size:9px;color:#c8dff0">${f.detail}</div>
    </div>`;
  }
  function houthiPopup(h) {
    return `<div class="popup-box">
      <div class="popup-title" style="color:${h.color}">🚢 HOUTHI THREAT: ${h.name}</div>
      <div class="popup-row"><span class="popup-key">RISK</span><span class="popup-val" style="color:${h.color}">${h.risk}</span></div>
      <div class="popup-row"><span class="popup-key">ATTACKS</span><span class="popup-val red">${h.attacks}+ documented</span></div>
      <div class="popup-row" style="font-size:9px;color:#c8dff0;margin-top:4px">Yemen Houthi anti-ship ballistic missiles + drones targeting commercial shipping.</div>
    </div>`;
  }

  // ── Add markers ───────────────────────────────────────
  function renderLayer() {
    layer.clearLayers();

    // Chokepoints
    CHOKEPOINTS.forEach(cp => {
      const icon = L.divIcon({ html: `<div class="oil-marker-wrap">${chokeIcon(cp.threat)}</div>`, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
      const m = L.marker([cp.lat, cp.lng], { icon, zIndexOffset: 500 });
      m.bindPopup(chokePopup(cp), { maxWidth: 240, className: 'osint-popup' });
      m.addTo(layer);
      // Pulsing circle
      L.circle([cp.lat, cp.lng], { radius: 120000, color: cp.color, fillColor: cp.color, fillOpacity: 0.06, weight: 1, dashArray: '6,4' }).addTo(layer);
    });

    // Oil facilities
    OIL_FACILITIES.forEach(f => {
      const icon = L.divIcon({ html: `<div class="oil-marker-wrap">${oilIcon(f.type)}</div>`, className: '', iconSize: [20, 20], iconAnchor: [10, 10] });
      const m = L.marker([f.lat, f.lng], { icon, zIndexOffset: 400 });
      m.bindPopup(oilFacPopup(f), { maxWidth: 240, className: 'osint-popup' });
      m.addTo(layer);
    });

    // Houthi threat zones
    HOUTHI_THREAT.forEach(h => {
      const icon = L.divIcon({ html: `<div class="oil-marker-wrap">${houthiIcon()}</div>`, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
      const m = L.marker([h.lat, h.lng], { icon, zIndexOffset: 600 });
      m.bindPopup(houthiPopup(h), { maxWidth: 240, className: 'osint-popup' });
      m.addTo(layer);
      L.circle([h.lat, h.lng], { radius: 250000, color: h.color, fillColor: h.color, fillOpacity: 0.08, weight: 1.5, dashArray: '4,3' }).addTo(layer);
    });

    // Pipelines as polylines
    PIPELINES.forEach(p => {
      const col = p.status === 'SEVERED' ? '#ff2200' : p.status === 'ACTIVE' ? '#00ff88' : '#ffaa00';
      const dash = p.status === 'SEVERED' ? '8,4' : p.status === 'PARTIAL' ? '4,4' : null;
      L.polyline([p.from, p.to], { color: col, weight: 2, opacity: 0.7, dashArray: dash })
        .bindTooltip(`${p.name} — ${p.status}`, { className: 'oil-tooltip' })
        .addTo(layer);
    });

    // Oil price impact panel (floating map control)
    updateOilPanel();
  }

  function updateOilPanel() {
    let panel = document.getElementById('oil-impact-panel');
    if (!panel) return;
    panel.innerHTML = `
      <div class="oil-panel-hdr">🛢 CRUDE OIL IMPACT <span class="badge-live">● GEOPOLITICAL</span></div>
      ${OIL_PRICE_IMPACT.map(o => `
        <div class="oil-impact-row">
          <div class="oil-evt">${o.event}</div>
          <div class="oil-imp"><span class="oil-pct" style="color:${o.pct.startsWith('+') ? '#ff4400' : '#00ff88'}">${o.pct}</span> <span class="oil-bbl">${o.bbl}/bbl</span></div>
          <div class="oil-desc">${o.desc}</div>
        </div>`).join('')}`;
  }

  // ── Globe integration ──────────────────────────────────
  function getGlobePoints() {
    const pts = [];
    CHOKEPOINTS.forEach(cp => {
      pts.push({ lat: cp.lat, lng: cp.lng, color: cp.color, size: 0.9, label: `⚠ ${cp.name} — ${cp.pct} global oil` });
    });
    OIL_FACILITIES.forEach(f => {
      pts.push({ lat: f.lat, lng: f.lng, color: f.color, size: 0.55, label: `🛢 ${f.name} — ${f.bpd} bpd` });
    });
    HOUTHI_THREAT.forEach(h => {
      pts.push({ lat: h.lat, lng: h.lng, color: h.color, size: 0.8, label: `🚢 HOUTHI: ${h.name} — ${h.attacks}+ attacks` });
    });
    return pts;
  }

  function getPipelines() { return PIPELINES; }
  function getChokepoints() { return CHOKEPOINTS; }

  // ── Init / enable / disable ────────────────────────────
  function init(mapInstance) {
    map = mapInstance;
    layer = L.layerGroup();
  }

  function setEnabled(on) {
    enabled = on;
    if (on) {
      layer.addTo(map);
      renderLayer();
      const panel = document.getElementById('oil-impact-panel');
      if (panel) panel.style.display = 'block';
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      const panel = document.getElementById('oil-impact-panel');
      if (panel) panel.style.display = 'none';
    }
  }

  function isEnabled() { return enabled; }

  return { init, setEnabled, isEnabled, getGlobePoints, getPipelines, getChokepoints };
})();
