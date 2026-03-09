/* ── INDIA DASHBOARD ──────────────────────────────────────────
   Claude AI agent briefs + live airspace + news + airports     */

const INDIA = (() => {
  let _tab    = 'flights';   // flights | intel | news | defence
  let _data   = {};          // cached /api/india-intel response
  let _timer  = null;

  const INDIAN_AIRPORTS = [
    { iata:'DEL', name:'Indira Gandhi Intl',  city:'Delhi',     lat:28.56, lon:77.10 },
    { iata:'BOM', name:'Chhatrapati Shivaji', city:'Mumbai',    lat:19.09, lon:72.87 },
    { iata:'BLR', name:'Kempegowda Intl',     city:'Bangalore', lat:13.20, lon:77.71 },
    { iata:'MAA', name:'Chennai Intl',         city:'Chennai',   lat:12.99, lon:80.17 },
    { iata:'HYD', name:'Rajiv Gandhi Intl',   city:'Hyderabad', lat:17.24, lon:78.43 },
    { iata:'CCU', name:'Netaji Subhas Intl',  city:'Kolkata',   lat:22.65, lon:88.45 },
    { iata:'AMD', name:'Sardar Vallabhbhai',  city:'Ahmedabad', lat:23.07, lon:72.63 },
    { iata:'COK', name:'Kochi Intl',          city:'Kochi',     lat: 9.99, lon:76.39 },
    { iata:'GAU', name:'Lokpriya Gopinath',   city:'Guwahati',  lat:26.11, lon:91.59 },
    { iata:'IXC', name:'Chandigarh Intl',     city:'Chandigarh',lat:30.67, lon:76.79 },
  ];

  const INDIAN_AIRLINES = {
    AI: 'Air India',      '6E': 'IndiGo',      SG: 'SpiceJet',
    UK: 'Vistara',        QP: 'Akasa Air',     IX: 'Air India Express',
    G8: 'Go First',       I5: 'AirAsia India', S2: 'Jet Airways',
    '9W': 'Jet (Legacy)', IT: 'IndiGo (IT)',
  };

  const THREAT_COLORS = {
    LOW: '#00ff88', MEDIUM: '#ffaa00', HIGH: '#ff6600', CRITICAL: '#ff2200', unknown: '#4a5568',
  };

  // ── render helpers ────────────────────────────────────────
  function _threatBadge(brief) {
    const m = (brief || '').match(/threat level[:\s]+([A-Z]+)/i);
    const level = m ? m[1].toUpperCase() : 'unknown';
    const col   = THREAT_COLORS[level] || THREAT_COLORS.unknown;
    return `<span class="ind-threat-badge" style="background:${col}22;border:1px solid ${col};color:${col}">${level}</span>`;
  }

  function _renderFlights(d) {
    if (d.status === 'loading') return `<div class="ind-loading">⟳ Fetching India airspace data…</div>`;
    const total  = d.acCount || 0;
    const indian = d.indianAc || 0;
    const foreign= d.foreignAc || 0;
    return `
      <div class="ind-stat-row">
        <div class="ind-stat">
          <div class="ind-stat-val ind-blue">${total.toLocaleString()}</div>
          <div class="ind-stat-lbl">ACTIVE FLIGHTS</div>
        </div>
        <div class="ind-stat">
          <div class="ind-stat-val ind-green">${indian}</div>
          <div class="ind-stat-lbl">INDIAN AIRLINES</div>
        </div>
        <div class="ind-stat">
          <div class="ind-stat-val ind-amber">${foreign}</div>
          <div class="ind-stat-lbl">FOREIGN AIRCRAFT</div>
        </div>
      </div>

      <div class="ind-section-hdr">MAJOR AIRPORTS</div>
      <div class="ind-airport-grid">
        ${INDIAN_AIRPORTS.map(ap => `
          <div class="ind-airport-card">
            <span class="ind-iata">${ap.iata}</span>
            <span class="ind-ap-city">${ap.city}</span>
          </div>`).join('')}
      </div>

      <div class="ind-section-hdr">AIRLINE BREAKDOWN</div>
      <div class="ind-airline-list">
        ${Object.entries(INDIAN_AIRLINES).map(([code, name]) => `
          <div class="ind-airline-row">
            <span class="ind-airline-code">${code}</span>
            <span class="ind-airline-name">${name}</span>
          </div>`).join('')}
      </div>

      <div class="ind-ts">Updated: ${d.ts ? new Date(d.ts).toLocaleTimeString() : '–'}</div>`;
  }

  function _renderIntel(d) {
    if (d.status === 'loading') return `<div class="ind-loading">⟳ Claude AI agent initialising… (runs every 10 min)</div>`;
    const brief = (d.brief || '').replace(/\n/g, '<br>');
    return `
      <div class="ind-intel-header">
        <span class="ind-intel-badge">AI OSINT BRIEF</span>
        ${_threatBadge(d.brief)}
        <span class="ind-ts" style="margin-left:auto">${d.ts ? new Date(d.ts).toLocaleTimeString() : ''}</span>
      </div>
      <div class="ind-intel-body">${brief}</div>
      <div class="ind-intel-meta">Source: ${d.source || 'Claude AI + GDELT + airplanes.live'} · Refreshes every 10 min</div>`;
  }

  function _renderNews(d) {
    if (d.status === 'loading') return `<div class="ind-loading">⟳ Loading India news…</div>`;
    const items = d.headlines || [];
    if (!items.length) return `<div class="ind-loading">No headlines available</div>`;
    return `
      <div class="ind-section-hdr">INDIA NEWS (last 24h · GDELT)</div>
      ${items.map(h => `
        <a class="ind-news-item" href="${h.url || '#'}" target="_blank" rel="noopener">
          <div class="ind-news-source">${h.source || 'news'}</div>
          <div class="ind-news-title">${h.title || ''}</div>
        </a>`).join('')}`;
  }

  function _renderDefence(d) {
    if (d.status === 'loading') return `<div class="ind-loading">⟳ Loading India defence feed…</div>`;
    const items = d.defItems || [];
    if (!items.length) return `<div class="ind-loading">No defence items — check RSS sources</div>`;
    return `
      <div class="ind-section-hdr">INDIA DEFENCE / OSINT</div>
      ${items.map(t => `
        <div class="ind-def-item">
          <span class="ind-def-bullet">▶</span>
          <span class="ind-def-text">${t}</span>
        </div>`).join('')}`;
  }

  // ── main render ───────────────────────────────────────────
  function _render() {
    const wrap = document.getElementById('india-body');
    if (!wrap) return;
    const d = _data;
    switch (_tab) {
      case 'flights': wrap.innerHTML = _renderFlights(d);  break;
      case 'intel':   wrap.innerHTML = _renderIntel(d);    break;
      case 'news':    wrap.innerHTML = _renderNews(d);      break;
      case 'defence': wrap.innerHTML = _renderDefence(d);   break;
    }
  }

  async function _fetch() {
    try {
      const r   = await fetch('/api/india-intel');
      const json = await r.json();
      _data = json;

      // Update header badge
      const badge = document.getElementById('india-threat-badge');
      const m     = (json.brief || '').match(/threat level[:\s]+([A-Z]+)/i);
      const level = m ? m[1].toUpperCase() : '';
      if (badge && level) {
        badge.textContent = level;
        badge.style.color = THREAT_COLORS[level] || '#fff';
      }

      // Update top stats
      const el = id => document.getElementById(id);
      if (el('india-ac-count'))  el('india-ac-count').textContent  = json.acCount  ?? '–';
      if (el('india-in-count'))  el('india-in-count').textContent  = json.indianAc ?? '–';
      if (el('india-for-count')) el('india-for-count').textContent = json.foreignAc ?? '–';

      _render();
    } catch (e) {
      console.warn('[India] fetch error:', e.message);
    }
  }

  // ── INDIA OSINT DATABASE ───────────────────────────────────
  // Sources: SIPRI, IISS, Drones-of-India OSINT, PIB MOD, DRDO, Global Firepower,
  //          Stockholm Peace Research Institute, Jane's, Breaking Defense, Our World in Data
  const INDIA_DRONES = [
    { name:'MQ-9B SeaGuardian / SkyGuardian', type:'MALE UCAV', status:'procurement',
      developer:'General Atomics (USA)', qty:'31 ordered ($4B deal Oct 2023)',
      note:'15 Navy + 8 Army + 8 IAF. Maritime patrol, ISR, and strike. First deliveries expected 2025.' },
    { name:'Rustom-2 / TAPAS BH-201', type:'MALE ISR UAV', status:'development',
      developer:'DRDO / HAL', qty:'20+ test flights; Limited IOC',
      note:'Persistent ISR; 24hr endurance; 350 kg payload; armed variant RUSTOM-H planned. Delayed from 2019 IOC.' },
    { name:'CATS Warrior', type:'Loyal Wingman UCAV', status:'development',
      developer:'HAL + HFCL + CSIR-NAL', qty:'Prototype phase (2023)',
      note:'Tejas MK1A wingman system; AI-enabled autonomous mission; can carry BVRAAM / PGM; swarm-capable.' },
    { name:'CATS Hunter', type:'Expendable UCAV', status:'development',
      developer:'HAL', qty:'Concept / prototype',
      note:'Launched from CATS Warrior; designed to hit hardened targets; loitering munition class.' },
    { name:'Ghatak UCAV (Advanced Medium Combat Aircraft UAV)', type:'Stealth UCAV', status:'development',
      developer:'DRDO ADE', qty:'Demonstrator flight 2022',
      note:'Flying wing delta design; subsonic stealth; parallel to Tejas; eventual carrier ops planned.' },
    { name:'SkyStriker (Elbit)', type:'Loitering Munition', status:'operational',
      developer:'Elbit Systems (Israel) — India licence', qty:'~100+ procured',
      note:'₹800 crore deal; 5–10 kg warhead; 2hr loiter; used in border area operations. India also exploring local production.' },
    { name:'Harop / Harpy NG', type:'Anti-radiation Loitering Munition', status:'operational',
      developer:'IAI Israel', qty:'~100 (est.)',
      note:'Autonomous SEAD; homes on radar emissions; reportedly used in 2019 Balakot aftermath vs Pakistani radar sites.' },
    { name:'Heron I', type:'MALE ISR UAV', status:'operational',
      developer:'IAI Israel (operated IAF/Army)', qty:'~50 in service',
      note:'8,000m ceiling; 52hr endurance; ISR over LAC (China border) and LoC (Pakistan). High Altitude variant deployed Ladakh.' },
    { name:'Heron TP (Eitan)', type:'HALE UCAV', status:'operational',
      developer:'IAI Israel', qty:'~10+ (IAF)', note:'Turboprop; armed with air-to-ground missiles; used for precision strike & ISR. Deployed for LAC monitoring.' },
    { name:'Searcher Mk II', type:'MALE ISR UAV', status:'operational',
      developer:'IAI Israel', qty:'~60+', note:'Army + Navy; surveillance; Ladakh border ops. Being replaced by Rustom-2 and Heron.' },
    { name:'Abhyas (High-speed target drone)', type:'HEAT target / testbed', status:'operational',
      developer:'DRDO', qty:'50+ delivered', note:'Gas turbine; Mach 0.6; used for missile system testing; also explored as loitering munition platform.' },
    { name:'DRDO Mini UAV (Panchi)', type:'Mini tactical ISR', status:'operational',
      developer:'DRDO / private (ideaForge, IdeaForge SWITCH)', qty:'Army inducted 2022',
      note:'Hand-launched; 2kg; ISR for infantry; IdeaForge SWITCH UAV selected under AatmaNirbhar for 100+ units.' },
    { name:'ideaForge SWITCH UAV', type:'Tactical ISR / VTOL', status:'operational',
      developer:'ideaForge (India)', qty:'200+ ordered (Army 2023)',
      note:'First major Indian commercial drone in military service; ₹5.4 crore per system; electric VTOL; AatmaNirbhar Bharat.' },
    { name:'Nagastra-1 (loitering munition)', type:'Loitering Munition', status:'operational',
      developer:'Economic Explosives Ltd (India)', qty:'480 units (Army, 2024)',
      note:'First indigenous loitering munition inducted into Indian Army. 30-min loiter, 1–2 kg warhead, GPS-guided.' },
  ];

  const INDIA_DEALS = [
    { year:'2024', country:'USA',     value:'$4B',    item:'31× MQ-9B SeaGuardian/SkyGuardian (MALE UCAV)', status:'contracted' },
    { year:'2023', country:'USA',     value:'$2.96B', item:'31× General Electric F414 engines for Tejas MK2', status:'contracted' },
    { year:'2023', country:'France',  value:'$7.5B',  item:'26× Rafale-M (Navy carrier fighters)', status:'contracted' },
    { year:'2022', country:'France',  value:'~$4B',   item:'3× Scorpène submarines (additional batch)', status:'negotiation' },
    { year:'2021', country:'Russia',  value:'$5.43B', item:'S-400 Triumf SAM system (5 squadrons)', status:'delivered (partial)' },
    { year:'2021', country:'India',   value:'$1.26B', item:'97× Tejas MK1A (HAL, domestic)', status:'contracted / production' },
    { year:'2020', country:'Russia',  value:'~$1B',   item:'AK-203 Kalashnikov rifles (6.71 lakh), Korwa plant', status:'production ongoing' },
    { year:'2019', country:'USA',     value:'$2.6B',  item:'24× MH-60R Seahawk naval helicopters', status:'delivered' },
    { year:'2019', country:'USA',     value:'$1.9B',  item:'6× AH-64E Apache attack helicopters (Army)', status:'delivered' },
    { year:'2018', country:'Russia',  value:'$3B',    item:'4× additional Kilo-class submarines (Project 75I)', status:'under negotiation' },
    { year:'2016', country:'France',  value:'€7.87B', item:'36× Rafale (IAF, Dassault)', status:'delivered (all 36)' },
    { year:'2016', country:'USA',     value:'$1.3B',  item:'22× AH-64E Apache (IAF)', status:'delivered' },
    { year:'2015', country:'USA',     value:'$3B',    item:'Boeing C-17 Globemaster III (10 units)', status:'delivered' },
    { year:'2012', country:'Russia',  value:'$2.9B',  item:'INS Vikramaditya (refurbished carrier)', status:'delivered 2013' },
    { year:'2011', country:'USA',     value:'$4.1B',  item:'10× C-17 Globemaster III strategic transport', status:'delivered' },
    { year:'2010', country:'Russia',  value:'$10.5B', item:'FGFA / PAK-FA joint development (cancelled 2018)', status:'cancelled' },
    { year:'2008', country:'USA',     value:'$1.05B', item:'8× Boeing P-8I Neptune maritime patrol aircraft', status:'delivered, 4 more added' },
    { year:'2004', country:'Israel',  value:'$1.1B',  item:'Phalcon AWACS (IL-76 platform)', status:'delivered (3 units)' },
    { year:'2001', country:'Russia',  value:'$3.5B',  item:'Su-30MKI licence production (HAL Nasik)', status:'272 produced by 2024' },
    { year:'2000', country:'Israel',  value:'$250M',  item:'Barak-1 missile + MR-SAM joint development', status:'operational' },
  ];

  const INDIA_AMMO = [
    { name:'AK-203 (Kalashnikov)', type:'Assault rifle', calibre:'7.62×39mm', qty:'6.71 lakh ordered',
      status:'production', developer:'India-Russia JV — Korwa, UP',
      note:'Replaces INSAS. Production at Korwa Ordnance Factory. Target: 7.5 lakh total. Export potential.' },
    { name:'INSAS Rifle', type:'Assault rifle', calibre:'5.56×45mm', qty:'~700,000 in service',
      status:'operational (phasing out)', developer:'DRDO / Ordnance Factories',
      note:'Inducted 1996; issues in Kargil 1999 (jamming in cold). Being replaced by AK-203 and SIG716.' },
    { name:'SIG Sauer SIG716 (SIG 716i)', type:'Battle rifle', calibre:'7.62×51mm NATO', qty:'72,400 ordered',
      status:'operational', developer:'SIG Sauer USA (direct import)',
      note:'Para SF and line infantry; replacing INSAS in select units. Direct purchase under emergency procurement.' },
    { name:'Excalibur (IWI Tavor X95)', type:'Assault carbine', calibre:'5.56×45mm', qty:'~15,000+',
      status:'operational', developer:'Israel Weapon Industries (SF)',
      note:'Para SF and NSG; bullpup design; extensively used by MARCOS, Para SF, SFFC.' },
    { name:'Bofors FH-77B / FH-77 BUG L52', type:'Howitzer (155mm/52 cal)', calibre:'155mm', qty:'145 ordered',
      status:'procurement', developer:'BAE Systems / Swedish Bofors heritage',
      note:'Part of 155mm self-propelled howitzer programme. Part of Dhanush HDU replacement.' },
    { name:'Dhanush (Upgraded FH-77)', type:'Towed howitzer', calibre:'155mm/45 cal', qty:'114 delivered by 2022',
      status:'operational', developer:'Gun Carriage Factory, Jabalpur (India)',
      note:'First 155mm howitzer made in India; derivative of Bofors FH-77B; inducted since 2019.' },
    { name:'K9 Vajra-T (Samsung Techwin)', type:'Self-propelled howitzer', calibre:'155mm/52 cal', qty:'100 ordered',
      status:'operational', developer:'L&T Defence (India) + Hanwha Aerospace Korea',
      note:'K9 variant adapted for Indian desert/mountain terrain; 50% local content; 100% indigenised target.' },
    { name:'ATAGS (Advanced Towed Artillery Gun)', type:'Towed howitzer', calibre:'155mm/52 cal', qty:'~150 planned',
      status:'trials / procurement', developer:'DRDO + Tata Advanced Systems + BEL',
      note:'World\'s longest range 155mm gun (48 km Rocket-assisted). Competing with M777 for mountain artillery role.' },
    { name:'M777 Ultra-Lightweight Howitzer', type:'Towed howitzer', calibre:'155mm/39 cal', qty:'145 delivered',
      status:'operational', developer:'BAE Systems USA — FMS deal 2016',
      note:'Helicopter-slung; ideal Himalayan deployment; inducted after Doklam 2017. All 145 delivered by 2023.' },
    { name:'BrahMos Block III (Land Attack)', type:'Supersonic cruise missile', calibre:'—', qty:'~200+',
      status:'operational', developer:'BrahMosCorp (India-Russia JV)',
      note:'Mach 2.8; 290-800 km range; regiment-based; deployed along China and Pakistan border sectors.' },
    { name:'Nirbhay LACM', type:'Subsonic cruise missile', calibre:'—', qty:'development',
      status:'development', developer:'DRDO / BEL', note:'1,000 km range; turbofan; multiple failures; IOP expected 2025-26.' },
    { name:'Pralay SRBM', type:'Quasi-ballistic missile', calibre:'—', qty:'~120 ordered',
      status:'operational', developer:'DRDO', note:'150-500 km; manoeuvrable; induction 2023; China/Pakistan focus.' },
    { name:'Astra Mk-1 BVRAAM', type:'Air-to-air BVR missile', calibre:'—', qty:'Tejas, Su-30MKI',
      status:'operational', developer:'DRDO', note:'80 km range; active radar homing; Mach 4.5; fully indigenous BVR missile.' },
  ];

  const INDIA_MILITARY_STATS = [
    { label:'Active Military Personnel', value:'1,455,550', source:'IISS 2024', note:'3rd largest in world' },
    { label:'Reserve Personnel', value:'1,155,000', source:'IISS 2024', note:'' },
    { label:'Defence Budget FY2024–25', value:'₹6.21 lakh crore ($74.7B)', source:'GoI Budget 2024', note:'2.39% of GDP; 13% YoY increase' },
    { label:'Capital Procurement Budget', value:'₹1.72 lakh crore ($20.7B)', source:'MoD 2024', note:'Highest ever capital outlay' },
    { label:'Defence Exports FY2023–24', value:'₹21,083 crore ($2.53B)', source:'MoD SIDM', note:'Record high; grew 30× since 2016' },
    { label:'Nuclear Warheads (est.)', value:'172 (est.)', source:'FAS Nuclear Notebook 2024', note:'Minimum credible deterrence posture' },
    { label:'Combat Aircraft (total)', value:'~600+', source:'IISS 2024', note:'Su-30MKI (272), Rafale (36), Mirage-2000 (49), Jaguar, MiG-29' },
    { label:'Main Battle Tanks', value:'~3,740', source:'IISS 2024', note:'T-90S Bhishma (1,657), T-72 (2,000+), Arjun MK1A (~100)' },
    { label:'Naval Vessels', value:'~140 commissioned', source:'IN 2024', note:'2 carriers, 14 destroyers, 13 frigates, 17 submarines' },
    { label:'SIPRI Arms Import Rank', value:'#1 globally (2019–23)', source:'SIPRI TIV 2024', note:'9.8% of global arms imports; Russia 36%, France 33%, USA 13%' },
    { label:'Defence R&D Budget', value:'₹23,855 crore ($2.87B)', source:'MoD 2024', note:'DRDO allocation; 25,000+ scientists' },
    { label:'iDEX Startups Funded', value:'400+ (as of 2024)', source:'DDP MoD', note:'Innovation for Defence Excellence; 300+ defence startups' },
  ];

  function _renderOsint() {
    return `
      <div class="ind-osint-section">

        <!-- Drone Systems -->
        <div class="ind-section-hdr">🛸 INDIA UAV / DRONE SYSTEMS <span class="ind-src-badge">OSINT · duorope/Drones-of-India · DRDO · SIPRI</span></div>
        ${INDIA_DRONES.map(d => `
          <div class="ind-osint-card">
            <div class="ind-oc-top">
              <span class="ind-oc-name">${d.name}</span>
              <span class="ind-oc-status" style="${_statusStyle(d.status)}">${d.status.toUpperCase()}</span>
              <span class="ind-oc-type">${d.type}</span>
            </div>
            <div class="ind-oc-meta">
              <span>🏭 ${d.developer}</span>
              <span>📦 ${d.qty}</span>
            </div>
            <div class="ind-oc-note">${d.note}</div>
          </div>`).join('')}

        <!-- Defence Deals -->
        <div class="ind-section-hdr" style="margin-top:10px">🤝 MAJOR DEFENCE DEALS (2000–2024) <span class="ind-src-badge">PIB · SIPRI · MoD</span></div>
        <div class="ind-deals-table">
          <div class="ind-deals-hdr-row">
            <span>Year</span><span>Supplier</span><span>Value</span><span>Item</span><span>Status</span>
          </div>
          ${INDIA_DEALS.map(d => `
            <div class="ind-deal-row">
              <span class="ind-deal-year">${d.year}</span>
              <span class="ind-deal-country">${d.country}</span>
              <span class="ind-deal-value">${d.value}</span>
              <span class="ind-deal-item">${d.item}</span>
              <span class="ind-deal-status" style="color:${d.status==='contracted'||d.status==='delivered'?'#00ff88':d.status==='cancelled'?'#ff4444':'#ffaa00'}">${d.status}</span>
            </div>`).join('')}
        </div>

        <!-- Ammunition & Guns -->
        <div class="ind-section-hdr" style="margin-top:10px">🔫 WEAPONS & AMMUNITION INVENTORY <span class="ind-src-badge">Ordnance Factories · MoD PIB · SIPRI</span></div>
        ${INDIA_AMMO.map(a => `
          <div class="ind-osint-card">
            <div class="ind-oc-top">
              <span class="ind-oc-name">${a.name}</span>
              <span class="ind-oc-status" style="${_statusStyle(a.status)}">${a.status.toUpperCase()}</span>
              <span class="ind-oc-type">${a.type}</span>
            </div>
            <div class="ind-oc-meta">
              <span>📐 ${a.calibre}</span>
              <span>🏭 ${a.developer}</span>
              <span>📦 ${a.qty}</span>
            </div>
            <div class="ind-oc-note">${a.note}</div>
          </div>`).join('')}

        <!-- Military Statistics -->
        <div class="ind-section-hdr" style="margin-top:10px">📊 MILITARY STATISTICS <span class="ind-src-badge">IISS · FAS · GoI Budget · SIPRI</span></div>
        <div class="ind-stats-grid">
          ${INDIA_MILITARY_STATS.map(s => `
            <div class="ind-stat-card">
              <div class="ind-sc-val">${s.value}</div>
              <div class="ind-sc-lbl">${s.label}</div>
              ${s.note ? `<div class="ind-sc-note">${s.note}</div>` : ''}
              <div class="ind-sc-src">Source: ${s.source}</div>
            </div>`).join('')}
        </div>

        <div class="ind-osint-footer">
          ⚠ Open-source data only. Sources: IISS Military Balance 2024, SIPRI Arms Transfers DB,
          FAS Nuclear Notebook 2024, Ministry of Defence PIB releases, duorope/Drones-of-India OSINT,
          Our World in Data Military Spending, Global Firepower Index 2024.
        </div>
      </div>`;
  }

  function _statusStyle(s) {
    const map = {
      'operational':          'color:#00ff88;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3)',
      'production':           'color:#00ff88;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3)',
      'contracted':           'color:#00d4ff;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3)',
      'delivered':            'color:#00ff88;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3)',
      'procurement':          'color:#ffaa00;background:rgba(255,170,0,0.1);border:1px solid rgba(255,170,0,0.3)',
      'development':          'color:#4a90d9;background:rgba(74,144,217,0.1);border:1px solid rgba(74,144,217,0.3)',
      'cancelled':            'color:#ff4444;background:rgba(255,68,68,0.1);border:1px solid rgba(255,68,68,0.3)',
      'trials / procurement': 'color:#ffaa00;background:rgba(255,170,0,0.1);border:1px solid rgba(255,170,0,0.3)',
    };
    return map[(s||'').toLowerCase()] || 'color:#8a9aaa;border:1px solid #2a3a4a';
  }

  // Update _render to handle 'osint' tab
  const _renderBase = _render;

  function _render() {
    const wrap = document.getElementById('india-body');
    if (!wrap) return;
    const d = _data;
    switch (_tab) {
      case 'flights': wrap.innerHTML = _renderFlights(d);  break;
      case 'intel':   wrap.innerHTML = _renderIntel(d);    break;
      case 'news':    wrap.innerHTML = _renderNews(d);      break;
      case 'defence': wrap.innerHTML = _renderDefence(d);   break;
      case 'osint':   wrap.innerHTML = _renderOsint();      break;
    }
  }

  function setTab(t) {
    _tab = t;
    document.querySelectorAll('.ind-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === t));
    _render();
  }

  function init() {
    _fetch();
    _timer = setInterval(_fetch, 10 * 60 * 1000);
  }

  return { init, setTab, refresh: _fetch };
})();
