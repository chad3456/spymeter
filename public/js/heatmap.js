/* ── SPYMETER — Heatmap Overlay Layers ────────────────────
   Three choropleth-style layers rendered as sized/colored
   circles at country centroids (no GeoJSON lib needed):
   1. 🌐 Internet Speed   — Ookla Speedtest Global Index 2024
   2. ✈  Tourism Safety   — Travel advisory level (State Dept)
   3. 🇮🇳 Indian Embassy  — MEA offices in conflict zones       */
const HEATMAP = (() => {
  let map   = null;
  let layer = null;
  let mode  = null;

  // ── Country data: [lat, lng, speed Mbps, advisory 1-4, flag] ─
  // advisory: 1=Normal, 2=Exercise Caution, 3=Reconsider, 4=Do Not Travel
  const COUNTRIES = [
    { name:'United States',   lat:39.5,  lng:-98.4,  speed:242, advisory:1, flag:'🇺🇸', pop:335 },
    { name:'United Kingdom',  lat:54.0,  lng:-2.0,   speed:230, advisory:1, flag:'🇬🇧', pop:67  },
    { name:'South Korea',     lat:36.5,  lng:127.8,  speed:271, advisory:1, flag:'🇰🇷', pop:52  },
    { name:'Singapore',       lat:1.35,  lng:103.8,  speed:247, advisory:1, flag:'🇸🇬', pop:6   },
    { name:'Norway',          lat:60.5,  lng:8.5,    speed:196, advisory:1, flag:'🇳🇴', pop:5   },
    { name:'Sweden',          lat:60.1,  lng:18.6,   speed:190, advisory:1, flag:'🇸🇪', pop:10  },
    { name:'Denmark',         lat:56.3,  lng:10.2,   speed:195, advisory:1, flag:'🇩🇰', pop:6   },
    { name:'Finland',         lat:64.0,  lng:26.0,   speed:186, advisory:1, flag:'🇫🇮', pop:6   },
    { name:'Switzerland',     lat:46.8,  lng:8.2,    speed:178, advisory:1, flag:'🇨🇭', pop:9   },
    { name:'Netherlands',     lat:52.1,  lng:5.3,    speed:173, advisory:1, flag:'🇳🇱', pop:18  },
    { name:'France',          lat:46.2,  lng:2.2,    speed:165, advisory:1, flag:'🇫🇷', pop:68  },
    { name:'Germany',         lat:51.2,  lng:10.4,   speed:162, advisory:1, flag:'🇩🇪', pop:83  },
    { name:'Japan',           lat:36.2,  lng:138.3,  speed:196, advisory:1, flag:'🇯🇵', pop:124 },
    { name:'UAE',             lat:24.0,  lng:53.8,   speed:236, advisory:2, flag:'🇦🇪', pop:10  },
    { name:'Canada',          lat:56.1,  lng:-106.3, speed:153, advisory:1, flag:'🇨🇦', pop:38  },
    { name:'Australia',       lat:-25.3, lng:133.8,  speed:140, advisory:1, flag:'🇦🇺', pop:26  },
    { name:'New Zealand',     lat:-40.9, lng:174.9,  speed:138, advisory:1, flag:'🇳🇿', pop:5   },
    { name:'Spain',           lat:40.5,  lng:-3.7,   speed:108, advisory:1, flag:'🇪🇸', pop:47  },
    { name:'Italy',           lat:41.9,  lng:12.6,   speed:103, advisory:1, flag:'🇮🇹', pop:60  },
    { name:'Portugal',        lat:39.4,  lng:-8.2,   speed:100, advisory:1, flag:'🇵🇹', pop:10  },
    { name:'Austria',         lat:47.5,  lng:14.6,   speed:118, advisory:1, flag:'🇦🇹', pop:9   },
    { name:'Belgium',         lat:50.8,  lng:4.5,    speed:116, advisory:1, flag:'🇧🇪', pop:12  },
    { name:'Poland',          lat:52.1,  lng:19.1,   speed:122, advisory:2, flag:'🇵🇱', pop:38  },
    { name:'Romania',         lat:45.9,  lng:24.9,   speed:170, advisory:1, flag:'🇷🇴', pop:19  },
    { name:'Israel',          lat:31.5,  lng:34.8,   speed:110, advisory:3, flag:'🇮🇱', pop:9   },
    { name:'Saudi Arabia',    lat:23.9,  lng:45.1,   speed:88,  advisory:2, flag:'🇸🇦', pop:35  },
    { name:'China',           lat:35.8,  lng:104.2,  speed:218, advisory:2, flag:'🇨🇳', pop:1400 },
    { name:'India',           lat:20.6,  lng:78.9,   speed:50,  advisory:2, flag:'🇮🇳', pop:1400 },
    { name:'Brazil',          lat:-14.2, lng:-51.9,  speed:82,  advisory:2, flag:'🇧🇷', pop:215 },
    { name:'Mexico',          lat:23.6,  lng:-102.6, speed:75,  advisory:2, flag:'🇲🇽', pop:130 },
    { name:'Argentina',       lat:-38.4, lng:-63.6,  speed:70,  advisory:2, flag:'🇦🇷', pop:46  },
    { name:'Chile',           lat:-35.7, lng:-71.5,  speed:80,  advisory:2, flag:'🇨🇱', pop:19  },
    { name:'Russia',          lat:61.5,  lng:105.3,  speed:78,  advisory:4, flag:'🇷🇺', pop:144 },
    { name:'Ukraine',         lat:49.0,  lng:31.0,   speed:55,  advisory:4, flag:'🇺🇦', pop:43  },
    { name:'Turkey',          lat:38.9,  lng:35.2,   speed:60,  advisory:2, flag:'🇹🇷', pop:85  },
    { name:'Iran',            lat:32.4,  lng:53.7,   speed:12,  advisory:4, flag:'🇮🇷', pop:87  },
    { name:'Iraq',            lat:33.2,  lng:43.7,   speed:10,  advisory:4, flag:'🇮🇶', pop:41  },
    { name:'Afghanistan',     lat:33.9,  lng:67.7,   speed:4,   advisory:4, flag:'🇦🇫', pop:40  },
    { name:'Yemen',           lat:15.5,  lng:48.5,   speed:5,   advisory:4, flag:'🇾🇪', pop:33  },
    { name:'Syria',           lat:34.8,  lng:38.9,   speed:5,   advisory:4, flag:'🇸🇾', pop:21  },
    { name:'Libya',           lat:26.3,  lng:17.2,   speed:8,   advisory:4, flag:'🇱🇾', pop:7   },
    { name:'Sudan',           lat:12.9,  lng:30.2,   speed:6,   advisory:4, flag:'🇸🇩', pop:45  },
    { name:'Somalia',         lat:5.2,   lng:46.2,   speed:4,   advisory:4, flag:'🇸🇴', pop:17  },
    { name:'Myanmar',         lat:16.9,  lng:96.2,   speed:20,  advisory:3, flag:'🇲🇲', pop:54  },
    { name:'Pakistan',        lat:30.4,  lng:69.3,   speed:20,  advisory:3, flag:'🇵🇰', pop:230 },
    { name:'Lebanon',         lat:33.9,  lng:35.5,   speed:25,  advisory:4, flag:'🇱🇧', pop:5   },
    { name:'North Korea',     lat:40.3,  lng:127.5,  speed:2,   advisory:4, flag:'🇰🇵', pop:26  },
    { name:'Egypt',           lat:26.8,  lng:30.8,   speed:18,  advisory:2, flag:'🇪🇬', pop:104 },
    { name:'Nigeria',         lat:9.1,   lng:8.7,    speed:15,  advisory:3, flag:'🇳🇬', pop:218 },
    { name:'Kenya',           lat:-0.2,  lng:37.9,   speed:20,  advisory:2, flag:'🇰🇪', pop:56  },
    { name:'South Africa',    lat:-29.0, lng:25.1,   speed:35,  advisory:2, flag:'🇿🇦', pop:60  },
    { name:'Ethiopia',        lat:9.1,   lng:40.5,   speed:8,   advisory:3, flag:'🇪🇹', pop:123 },
    { name:'Indonesia',       lat:-0.8,  lng:113.9,  speed:45,  advisory:2, flag:'🇮🇩', pop:277 },
    { name:'Vietnam',         lat:14.1,  lng:108.3,  speed:70,  advisory:1, flag:'🇻🇳', pop:98  },
    { name:'Thailand',        lat:15.9,  lng:100.9,  speed:190, advisory:1, flag:'🇹🇭', pop:72  },
    { name:'Philippines',     lat:12.9,  lng:121.8,  speed:40,  advisory:2, flag:'🇵🇭', pop:113 },
    { name:'Malaysia',        lat:4.2,   lng:108.0,  speed:82,  advisory:1, flag:'🇲🇾', pop:33  },
    { name:'Bangladesh',      lat:23.7,  lng:90.4,   speed:18,  advisory:2, flag:'🇧🇩', pop:170 },
    { name:'Venezuela',       lat:6.4,   lng:-66.6,  speed:8,   advisory:4, flag:'🇻🇪', pop:28  },
    { name:'Cuba',            lat:21.5,  lng:-78.0,  speed:5,   advisory:2, flag:'🇨🇺', pop:11  },
    { name:'Chad',            lat:15.5,  lng:18.7,   speed:3,   advisory:4, flag:'🇹🇩', pop:17  },
    { name:'Haiti',           lat:18.9,  lng:-72.3,  speed:5,   advisory:4, flag:'🇭🇹', pop:12  },
  ];

  // ── Color scales ──────────────────────────────────────
  function speedColor(mbps) {
    if (mbps >= 150) return '#00ff88';
    if (mbps >= 100) return '#44dd66';
    if (mbps >= 60)  return '#88cc44';
    if (mbps >= 30)  return '#ffcc00';
    if (mbps >= 10)  return '#ff8800';
    return '#ff2200';
  }

  function advisoryColor(level) {
    return ['','#00ff88','#ffcc00','#ff8800','#ff2200'][level] || '#888';
  }
  const ADVISORY_LABEL = ['','Exercise Normal Precautions','Exercise Increased Caution','Reconsider Travel','DO NOT TRAVEL'];

  // ── Indian Embassy / Consulate list ───────────────────
  const EMBASSIES = [
    { country:'Israel',      city:'Tel Aviv',   lat:32.08, lng:34.78, phone:'+972-3-629-6888', status:'OPERATIONAL', statusColor:'#00ff88', advisory:'HIGH ALERT' },
    { country:'Lebanon',     city:'Beirut',     lat:33.89, lng:35.50, phone:'+961-1-374-588',  status:'LIMITED',     statusColor:'#ff8800', advisory:'HIGH ALERT' },
    { country:'Ukraine',     city:'Kyiv',       lat:50.43, lng:30.51, phone:'+380-44-468-6503',status:'OPERATIONAL', statusColor:'#00ff88', advisory:'DO NOT TRAVEL' },
    { country:'Russia',      city:'Moscow',     lat:55.73, lng:37.57, phone:'+7-495-783-7535', status:'OPERATIONAL', statusColor:'#00ff88', advisory:'CAUTION' },
    { country:'Sudan',       city:'Khartoum',   lat:15.55, lng:32.53, phone:'MEA Helpline',    status:'SUSPENDED',   statusColor:'#ff2200', advisory:'DO NOT TRAVEL' },
    { country:'Yemen',       city:'Sana\'a',    lat:15.35, lng:44.21, phone:'MEA Only',        status:'CLOSED',      statusColor:'#ff2200', advisory:'DO NOT TRAVEL' },
    { country:'Iran',        city:'Tehran',     lat:35.72, lng:51.41, phone:'+98-21-2200-1677',status:'OPERATIONAL', statusColor:'#ffaa00', advisory:'HIGH ALERT' },
    { country:'Iraq',        city:'Baghdad',    lat:33.33, lng:44.37, phone:'+964-780-654-3210',status:'OPERATIONAL',statusColor:'#ffaa00', advisory:'HIGH ALERT' },
    { country:'Afghanistan', city:'Kabul',      lat:34.52, lng:69.18, phone:'MEA Only',        status:'SUSPENDED',   statusColor:'#ff2200', advisory:'DO NOT TRAVEL' },
    { country:'Myanmar',     city:'Yangon',     lat:16.83, lng:96.17, phone:'+95-1-254-045',   status:'CAUTION',     statusColor:'#ff8800', advisory:'RECONSIDER' },
    { country:'Syria',       city:'Damascus',   lat:33.51, lng:36.29, phone:'CLOSED',          status:'CLOSED',      statusColor:'#ff2200', advisory:'DO NOT TRAVEL' },
    { country:'Libya',       city:'Tripoli',    lat:32.89, lng:13.18, phone:'MEA Only',        status:'SUSPENDED',   statusColor:'#ff2200', advisory:'DO NOT TRAVEL' },
    { country:'Pakistan',    city:'Islamabad',  lat:33.73, lng:73.09, phone:'+92-51-206-0101', status:'OPERATIONAL', statusColor:'#00ff88', advisory:'CAUTION' },
    { country:'Palestine',   city:'Ramallah',   lat:31.90, lng:35.21, phone:'+972-2-240-4012', status:'LIMITED',     statusColor:'#ff8800', advisory:'HIGH ALERT' },
    { country:'Lebanon',     city:'Beirut (Consulate)', lat:33.87, lng:35.52, phone:'+961-1-374-588', status:'LIMITED', statusColor:'#ff8800', advisory:'HIGH ALERT' },
    { country:'Egypt',       city:'Cairo',      lat:30.04, lng:31.24, phone:'+20-2-2736-8577', status:'OPERATIONAL', statusColor:'#00ff88', advisory:'NORMAL' },
    { country:'Saudi Arabia',city:'Riyadh',     lat:24.69, lng:46.72, phone:'+966-11-488-5844', status:'OPERATIONAL',statusColor:'#00ff88', advisory:'NORMAL' },
    { country:'Jordan',      city:'Amman',      lat:31.96, lng:35.95, phone:'+962-6-593-2366', status:'OPERATIONAL', statusColor:'#00ff88', advisory:'CAUTION' },
    { country:'Turkey',      city:'Ankara',     lat:39.92, lng:32.85, phone:'+90-312-438-2195', status:'OPERATIONAL',statusColor:'#00ff88', advisory:'NORMAL' },
    { country:'Ethiopia',    city:'Addis Ababa',lat:9.02,  lng:38.74, phone:'+251-11-551-2050', status:'OPERATIONAL',statusColor:'#00ff88', advisory:'CAUTION' },
  ];

  // ── MEA Emergency Helpline (global) ──────────────────
  const MEA_HELPLINE = '+91-11-2301-2113';

  // ── Embassy SVG icon ─────────────────────────────────
  function embassyIcon(status, col) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 28" width="26" height="28"
              style="filter:drop-shadow(0 0 5px ${col})">
      <rect x="3" y="8" width="20" height="16" rx="2" fill="${col}22" stroke="${col}" stroke-width="1.5"/>
      <rect x="7" y="2" width="12" height="8" rx="1" fill="${col}33" stroke="${col}" stroke-width="1"/>
      <rect x="10" y="0" width="6" height="4" rx="1" fill="${col}"/>
      <text x="13" y="20" text-anchor="middle" font-size="9" fill="${col}">🇮🇳</text>
      <line x1="3" y1="8" x2="23" y2="8" stroke="${col}" stroke-width="1"/>
    </svg>`;
  }

  // ── Render functions ──────────────────────────────────
  function renderInternetSpeed() {
    layer.clearLayers();
    const maxSpeed = 280;
    COUNTRIES.forEach(c => {
      const radius = 80000 + (c.speed / maxSpeed) * 320000;
      const col    = speedColor(c.speed);
      L.circle([c.lat, c.lng], {
        radius, color: col, fillColor: col, fillOpacity: 0.25,
        weight: 1.2, opacity: 0.7,
      })
      .bindPopup(`<div class="popup-box">
        <div class="popup-title" style="color:${col}">🌐 ${c.flag} ${c.name}</div>
        <div class="popup-row"><span class="popup-key">AVG SPEED</span><span class="popup-val" style="color:${col}">${c.speed} Mbps</span></div>
        <div class="popup-row"><span class="popup-key">RANK</span><span class="popup-val">${c.speed >= 150 ? '🟢 Top Tier' : c.speed >= 60 ? '🟡 Mid Tier' : '🔴 Low Tier'}</span></div>
        <div class="popup-row" style="font-size:8px;color:#888">Source: Ookla Speedtest Global Index 2024</div>
      </div>`, { className: 'osint-popup', maxWidth: 240 })
      .addTo(layer);

      L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          html: `<div style="background:${col};color:#000;font-size:7.5px;font-weight:700;padding:1px 3px;border-radius:2px;white-space:nowrap;font-family:monospace">${c.speed}</div>`,
          className: '', iconAnchor: [16, 8]
        })
      }).addTo(layer);
    });
    updateLegend('internet');
  }

  function renderTourism() {
    layer.clearLayers();
    COUNTRIES.forEach(c => {
      const col    = advisoryColor(c.advisory);
      const radius = 150000 + (c.pop / 1400) * 250000;
      L.circle([c.lat, c.lng], {
        radius, color: col, fillColor: col, fillOpacity: 0.22,
        weight: 1.5, opacity: 0.8,
      })
      .bindPopup(`<div class="popup-box">
        <div class="popup-title" style="color:${col}">${c.flag} ${c.name} — Travel Advisory</div>
        <div class="popup-row"><span class="popup-key">LEVEL</span><span class="popup-val" style="color:${col}">Level ${c.advisory}</span></div>
        <div class="popup-row"><span class="popup-key">STATUS</span><span class="popup-val" style="color:${col}">${ADVISORY_LABEL[c.advisory]}</span></div>
        <div class="popup-row" style="font-size:8px;color:#888">Source: US State Dept Travel Advisory 2025</div>
      </div>`, { className: 'osint-popup', maxWidth: 240 })
      .addTo(layer);
    });
    updateLegend('tourism');
  }

  function renderEmbassies() {
    layer.clearLayers();

    // Add visual circle for each conflict zone country
    EMBASSIES.forEach(emb => {
      const col = emb.statusColor;

      // Embassy marker
      const icon = L.divIcon({
        html: `<div class="hm-emb-wrap">${embassyIcon(emb.status, col)}</div>`,
        className: '', iconSize: [26, 28], iconAnchor: [13, 28],
      });
      L.marker([emb.lat, emb.lng], { icon, zIndexOffset: 600 })
        .bindPopup(`<div class="popup-box">
          <div class="popup-title" style="color:${col}">🇮🇳 Indian Embassy — ${emb.country}</div>
          <div class="popup-row"><span class="popup-key">CITY</span><span class="popup-val">${emb.city}</span></div>
          <div class="popup-row"><span class="popup-key">STATUS</span><span class="popup-val" style="color:${col}">${emb.status}</span></div>
          <div class="popup-row"><span class="popup-key">ADVISORY</span><span class="popup-val" style="color:${col}">${emb.advisory}</span></div>
          <div class="popup-row"><span class="popup-key">PHONE</span><span class="popup-val green">${emb.phone}</span></div>
          <div class="popup-row"><span class="popup-key">MEA 24/7</span><span class="popup-val">${MEA_HELPLINE}</span></div>
          <div class="popup-row"><span class="popup-key">MADAD</span><span class="popup-val">madad.gov.in</span></div>
        </div>`, { className: 'osint-popup', maxWidth: 260 })
        .addTo(layer);
    });
    updateLegend('embassy');
  }

  // ── Legend panel ──────────────────────────────────────
  function updateLegend(m) {
    const el = document.getElementById('heatmap-legend');
    if (!el) return;
    if (m === 'internet') {
      el.innerHTML = `
        <div class="hm-legend-title">🌐 INTERNET SPEED (Mbps)</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#00ff88"></span> 150+ Mbps — Top Tier</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#88cc44"></span> 60–149 Mbps — Good</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#ffcc00"></span> 30–59 Mbps — Average</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#ff8800"></span> 10–29 Mbps — Slow</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#ff2200"></span> &lt;10 Mbps — Critical</div>
        <div class="hm-src">Ookla Speedtest Global Index Q4 2024</div>`;
    } else if (m === 'tourism') {
      el.innerHTML = `
        <div class="hm-legend-title">✈ TRAVEL ADVISORY LEVEL</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#00ff88"></span> L1 — Normal Precautions</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#ffcc00"></span> L2 — Increased Caution</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#ff8800"></span> L3 — Reconsider Travel</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#ff2200"></span> L4 — DO NOT TRAVEL</div>
        <div class="hm-src">US State Dept + MEA India 2025</div>`;
    } else if (m === 'embassy') {
      el.innerHTML = `
        <div class="hm-legend-title">🇮🇳 INDIAN EMBASSY STATUS</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#00ff88"></span> Operational</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#ff8800"></span> Limited Operations</div>
        <div class="hm-legend-row"><span class="hm-swatch" style="background:#ff2200"></span> Suspended / Closed</div>
        <div class="hm-legend-row" style="margin-top:4px">📞 MEA 24/7: +91-11-2301-2113</div>
        <div class="hm-legend-row">🔗 madad.gov.in</div>
        <div class="hm-src">Ministry of External Affairs India 2025</div>`;
    } else {
      el.innerHTML = '';
    }
    el.style.display = m ? 'block' : 'none';
  }

  // ── Public API ────────────────────────────────────────
  function setMode(m) {
    mode = m;
    if (m === 'internet') renderInternetSpeed();
    else if (m === 'tourism') renderTourism();
    else if (m === 'embassy') renderEmbassies();
    else { layer.clearLayers(); updateLegend(null); }
  }

  function setEnabled(on, m) {
    if (on) {
      if (!map.hasLayer(layer)) layer.addTo(map);
      setMode(m || 'internet');
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      mode = null;
      updateLegend(null);
    }
  }

  function init(mapInstance) {
    map   = mapInstance;
    layer = L.layerGroup();
  }

  function getMode() { return mode; }

  return { init, setEnabled, setMode, getMode };
})();
