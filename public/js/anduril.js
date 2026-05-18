/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — Anduril Industries OSINT Layer
   Data: Anduril.com · DoD contract awards (SAM.gov) · SIPRI · open-source
   Covers: HQ/facilities, border deployments, overseas contracts, test sites,
           and publicly known product/system locations.
════════════════════════════════════════════════════════════════════════════ */
const ANDURIL = (() => {
  let map     = null;
  let enabled = false;
  let markers = [];

  const CAT = {
    HQ:         { color:'#ff6a00', icon:'🏢', label:'Headquarters / Office',          z:1100 },
    MFG:        { color:'#ffcc00', icon:'🏭', label:'Manufacturing / R&D Facility',   z:1000 },
    BORDER:     { color:'#00ff88', icon:'🗼', label:'Sentry Tower — Border Deployment',z:900  },
    OVERSEAS:   { color:'#4488ff', icon:'🌐', label:'Overseas Deployment / Contract',  z:850  },
    TEST:       { color:'#cc44ff', icon:'⚙',  label:'Test & Evaluation Site',         z:800  },
    PRODUCT:    { color:'#ff2222', icon:'⚡', label:'Known System / Product Sighting', z:950  },
  };

  // ── Facilities ──────────────────────────────────────────────────────────────
  const FACILITIES = [
    { lat:33.6694,  lng:-117.8231, cat:'HQ',  name:'Anduril Industries HQ',           country:'USA',
      product:'Corporate HQ', notes:'Founded 2017 by Palmer Luckey. Costa Mesa, CA. ~3,000+ employees (2024).' },
    { lat:28.0741,  lng:-80.6245,  cat:'MFG', name:'Arsenal-1 Manufacturing Campus',   country:'USA',
      product:'Manufacturing', notes:'590-acre Arsenal-1 facility, Palm Bay FL. $1B+ investment. Ships Roadrunner, Fury, Lattice hardware.' },
    { lat:37.3688,  lng:-121.9698, cat:'MFG', name:'Anduril R&D — San Jose',           country:'USA',
      product:'Software/R&D', notes:'Lattice OS platform development. AI/ML and autonomy engineering hub.' },
    { lat:47.6062,  lng:-122.3321, cat:'MFG', name:'Anduril Seattle Office',           country:'USA',
      product:'Software/R&D', notes:'Cloud and software engineering office. Former Microsoft campus area.' },
    { lat:38.9072,  lng:-77.0369,  cat:'HQ',  name:'Anduril DC Policy Office',         country:'USA',
      product:'Government Relations', notes:'Washington DC policy and DoD liaison office.' },
    { lat:51.5074,  lng:-0.1278,   cat:'HQ',  name:'Anduril UK Office — London',       country:'UK',
      product:'UK MoD Engagement', notes:'Established 2023. UK MoD DSEI presence. Pursuing Stalker and Sentry contracts.' },
    { lat:-31.9505, lng:115.8605,  cat:'HQ',  name:'Anduril Australia — Perth',        country:'AUS',
      product:'AUKUS / ADF', notes:'Established 2022. ADF drone and underwater vehicle contracts. AUKUS pillar II autonomous systems.' },
  ];

  // ── Border / Domestic Deployments ──────────────────────────────────────────
  const BORDER_SITES = [
    { lat:32.6928, lng:-114.6277, cat:'BORDER', name:'Yuma Sector — Sentry Tower Array',     country:'USA',
      product:'Sentry Tower', notes:'CBP/DHS PSTAR contract. Sentry Tower with AI-cueing to human operators. ~200 towers in AZ.' },
    { lat:32.2217, lng:-110.9265, cat:'BORDER', name:'Tucson Sector — Sentry Tower Cluster', country:'USA',
      product:'Sentry Tower', notes:'High-density deployment. Tucson AZ. Covers Sonoran Desert routes.' },
    { lat:31.7619, lng:-106.4850, cat:'BORDER', name:'El Paso Sector — Sentry Tower',        country:'USA',
      product:'Sentry Tower', notes:'US-Mexico land border. Works with CBP Air & Marine Ops Ghost UAS.' },
    { lat:29.3628, lng:-100.8960, cat:'BORDER', name:'Del Rio Sector — Sentry Tower',        country:'USA',
      product:'Sentry Tower', notes:'High-traffic corridor. Del Rio TX. Active 2022–present.' },
    { lat:28.7091, lng:-100.5068, cat:'BORDER', name:'Eagle Pass Sector — Sentry Tower',     country:'USA',
      product:'Sentry Tower', notes:'Surge deployment 2023. Eagle Pass TX border crisis response.' },
    { lat:32.7157, lng:-117.1611, cat:'BORDER', name:'San Diego Sector — Sentry Tower',      country:'USA',
      product:'Sentry Tower', notes:'Urban environment deployment. San Diego CA. Facial recognition integration disputed.' },
    { lat:26.2034, lng:-98.2300,  cat:'BORDER', name:'Rio Grande Valley — Sentry Tower',     country:'USA',
      product:'Sentry Tower', notes:'Southernmost land border sector. McAllen TX. Dense deployment density.' },
    { lat:30.0777, lng:-102.1186, cat:'BORDER', name:'Big Bend Sector — Sentry Tower',       country:'USA',
      product:'Sentry Tower', notes:'Remote desert terrain monitoring. Presidio TX. Long-range EO/IR sensors.' },
  ];

  // ── Test & Evaluation Sites ──────────────────────────────────────────────────
  const TEST_SITES = [
    { lat:34.9054, lng:-117.8839, cat:'TEST', name:'Edwards AFB — Fury CCA Testing',       country:'USA',
      product:'Fury CCA', notes:'Air Force Research Lab. AFWERX Fury Collaborative Combat Aircraft evaluation. 2023–2024.' },
    { lat:35.6840, lng:-117.6817, cat:'TEST', name:'China Lake NWSC — Roadrunner Testing', country:'USA',
      product:'Roadrunner-M', notes:'Roadrunner and Roadrunner-M air-launched loitering munition tests. NWC China Lake CA.' },
    { lat:40.1978, lng:-113.0682, cat:'TEST', name:'Dugway Proving Ground — Ghost/Altius', country:'USA',
      product:'Ghost UAS / ALTIUS-600', notes:'Dugway UT. Army ALTIUS-600 loitering munition and Ghost-X sUAS evaluation.' },
    { lat:35.2628, lng:-116.8853, cat:'TEST', name:'Fort Irwin NTC — Ground Autonomy',     country:'USA',
      product:'Lattice OS / Sentry', notes:'National Training Center. Lattice mesh networking and autonomous ground sensor trials.' },
    { lat:38.3032, lng:-76.4148,  cat:'TEST', name:'Pax River NAS — Maritime UAS',         country:'USA',
      product:'DIVE-LD / Ghost-S',   notes:'Patuxent River MD. Navy Program Office. Maritime Ghost and DIVE-LD UUV testing.' },
    { lat:30.3505, lng:-87.3175,  cat:'TEST', name:'Eglin AFB — Roadrunner Intercept',     country:'USA',
      product:'Roadrunner-M', notes:'Eglin AFB FL. Counter-UAS and intercept mission testing for Roadrunner-M.' },
    { lat:32.3116, lng:-106.7747, cat:'TEST', name:'White Sands Missile Range — Anvil',    country:'USA',
      product:'Anvil c-UAS', notes:'White Sands NM. Anvil counter-drone kinetic effector drop tests.' },
  ];

  // ── Overseas Deployments / Contracts ────────────────────────────────────────
  const OVERSEAS = [
    { lat:24.4539, lng:54.3773,  cat:'OVERSEAS', name:'UAE — Sentry Tower + Lattice',    country:'UAE',
      product:'Sentry + Lattice OS', notes:'Abu Dhabi deployed. UAE signed contract ~2022. Sentry towers and Lattice command node on UAE territory.' },
    { lat:24.7136, lng:46.6753,  cat:'OVERSEAS', name:'Saudi Arabia — Lattice Pilot',    country:'SAU',
      product:'Lattice OS', notes:'Riyadh. Reported interest in Lattice for border monitoring. Status: early-stage / unconfirmed.' },
    { lat:35.6892, lng:51.3890,  cat:'OVERSEAS', name:'Ukraine — Lattice + Ghost',       country:'UKR',
      product:'Ghost UAS / Lattice', notes:'Ghost UAS and Lattice command/control shipped to Ukraine. Confirmed USAF/State Dept transfer 2023.' },
    { lat:-33.8688,lng:151.2093, cat:'OVERSEAS', name:'Australia — Ghost-X + DIVE-LD',   country:'AUS',
      product:'Ghost-X / DIVE-LD', notes:'Australian Dept of Defence contract. Ghost-X sUAS and DIVE-LD UUV evaluation under AUKUS Pillar II.' },
    { lat:-25.2744,lng:133.7751, cat:'OVERSEAS', name:'Australia — Woomera Test Range',  country:'AUS',
      product:'Roadrunner / Altius', notes:'Woomera SA. Joint ADF/Anduril loitering munition and autonomous systems tests 2023–2024.' },
    { lat:51.5074, lng:-0.1278,  cat:'OVERSEAS', name:'UK — MoD DSEI Engagement',        country:'UK',
      product:'Sentry / Fury / Lattice', notes:'London. UK MoD in discussions for Sentry border systems and Fury CCA evaluation under RAF AI programme.' },
    { lat:48.8566, lng:2.3522,   cat:'OVERSEAS', name:'France — NATO Interop Demo',      country:'FRA',
      product:'Lattice OS', notes:'Paris (DSEI France). NATO interoperability demonstration for Lattice autonomous command node.' },
    { lat:52.5200, lng:13.4050,  cat:'OVERSEAS', name:'Germany — EUCOM Engagement',      country:'DEU',
      product:'Ghost UAS / Lattice', notes:'Berlin. EUCOM engagement. US Army Europe evaluating Ghost-X and Lattice for NATO eastern flank.' },
  ];

  // ── Known Product Sightings / Deployments ───────────────────────────────────
  const PRODUCTS = [
    { lat:32.6928, lng:-115.4866, cat:'PRODUCT', name:'Ghost-X sUAS — US Southern Border patrol', country:'USA',
      product:'Ghost-X UAS', notes:'CBP/Air & Marine Operations. Ghost-X persistent surveillance UAS. 40+ hr endurance. ~$15k/unit.' },
    { lat:34.0195, lng:-118.4912, cat:'PRODUCT', name:'Roadrunner Demo — Point Mugu',              country:'USA',
      product:'Roadrunner', notes:'Roadrunner jet-powered loitering munition shown at Point Mugu CA. Reusable, supersonic intercept capable.' },
    { lat:36.8508, lng:-75.9779,  cat:'PRODUCT', name:'DIVE-LD UUV — Atlantic Test Range',         country:'USA',
      product:'DIVE-LD UUV', notes:'DIVE-LD (Long Duration UUV) Atlantic test range. Virginia Beach VA area. Navy LUSV/XLUUV programme.' },
    { lat:32.7157, lng:-117.1611, cat:'PRODUCT', name:'Anvil c-UAS — San Diego Demo',              country:'USA',
      product:'Anvil', notes:'Anvil kinetic counter-drone system demonstrated over San Diego bay area. Deploys from quadcopter to intercept targets.' },
    { lat:35.2271, lng:-80.8431,  cat:'PRODUCT', name:'Fury CCA — Charlotte NAS press reveal',     country:'USA',
      product:'Fury CCA', notes:'Fury Collaborative Combat Aircraft (6th-gen wingman drone). USAF NGAD escort. Charlotte NAS public unveil 2023.' },
    { lat:38.9696, lng:-77.3861,  cat:'PRODUCT', name:'Lattice OS — Pentagon FY2025 Demo',         country:'USA',
      product:'Lattice OS', notes:'Pentagon demonstration of Lattice multi-domain command and control system for JADC2 integration.' },
    { lat:28.5384, lng:-80.6506,  cat:'PRODUCT', name:'Arsenal-1 Deliveries — Launch site',        country:'USA',
      product:'All products', notes:'Cape Canaveral / KSC area. Arsenal-1 delivery logistics for fielded systems.' },
    { lat:48.3794, lng:31.1656,   cat:'PRODUCT', name:'Ghost-X — Ukraine Eastern Front',           country:'UKR',
      product:'Ghost-X UAS', notes:'Ghost-X deployed with Ukrainian forces. Provides ISR and target acquisition near frontline.' },
  ];

  // ── All sites combined ───────────────────────────────────────────────────────
  const ALL_SITES = [
    ...FACILITIES,
    ...BORDER_SITES,
    ...TEST_SITES,
    ...OVERSEAS,
    ...PRODUCTS,
  ];

  const _CATEGORY_LABELS = {
    HQ: 'HQ / Office', MFG: 'Manufacturing', BORDER: 'Border Deploy',
    OVERSEAS: 'Overseas', TEST: 'Test Site', PRODUCT: 'System Sighting',
  };

  function _render() {
    if (!map) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    ALL_SITES.forEach(s => {
      const cfg = CAT[s.cat] || CAT.PRODUCT;
      const icon = L.divIcon({
        html: `<div class="and-marker" style="color:${cfg.color};border-color:${cfg.color};background:${cfg.color}18">${cfg.icon}</div>`,
        className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      });
      const pop = `<div class="and-popup" style="border-left:2px solid ${cfg.color}">
        <div class="and-hdr" style="color:${cfg.color}">${s.name}</div>
        <div class="and-badge" style="background:${cfg.color}22;color:${cfg.color};border:1px solid ${cfg.color}44">${_CATEGORY_LABELS[s.cat] || s.cat} · ${s.country}</div>
        <div class="and-row"><span class="and-lbl">SYSTEM</span> ${s.product}</div>
        <div class="and-row"><span class="and-lbl">NOTES</span> ${s.notes}</div>
        <div class="and-src">Source: Anduril.com · SAM.gov · OSINT press reports</div>
      </div>`;
      const mk = L.marker([s.lat, s.lng], { icon, zIndexOffset: cfg.z || 800 })
        .bindPopup(pop, { className: 'leaflet-popup-dark', maxWidth: 320 });
      mk.addTo(map);
      markers.push(mk);
    });
  }

  function _injectCSS() {
    if (document.getElementById('and-css')) return;
    const s = document.createElement('style');
    s.id = 'and-css';
    s.textContent = `
      .and-marker{width:22px;height:22px;border-radius:4px;border:2px solid;
        display:flex;align-items:center;justify-content:center;font-size:11px;
        cursor:pointer;transition:transform .2s;box-shadow:0 0 8px currentColor}
      .and-marker:hover{transform:scale(1.5)}
      .and-popup{min-width:260px;max-width:300px;font-family:'Courier New',monospace;padding:2px}
      .and-hdr{font-size:9.5px;font-weight:700;margin-bottom:5px}
      .and-badge{font-size:6.5px;font-weight:700;padding:2px 6px;border-radius:2px;
        display:inline-block;margin-bottom:5px;letter-spacing:.5px}
      .and-row{font-size:7.5px;color:#c8dff0;margin:2px 0;line-height:1.4}
      .and-lbl{color:#3d5a78;display:inline-block;width:55px;font-size:7px;letter-spacing:.3px}
      .and-src{font-size:6.5px;color:#3d5a78;margin-top:6px;border-top:1px solid #0d1e2e;padding-top:4px}
    `;
    document.head.appendChild(s);
  }

  // ── Left panel ────────────────────────────────────────────────────────────────
  function _updatePanel() {
    const el = document.getElementById('and-panel-body');
    if (!el) return;
    const counts = {};
    ALL_SITES.forEach(s => { counts[s.cat] = (counts[s.cat] || 0) + 1; });
    el.innerHTML = Object.entries(CAT).map(([key, cfg]) => {
      const n = counts[key] || 0;
      return `<div class="and-stat-row">
        <span style="font-size:13px">${cfg.icon}</span>
        <div class="and-stat-info">
          <div class="and-stat-name" style="color:${cfg.color}">${_CATEGORY_LABELS[key]}</div>
          <div class="and-stat-count">${n} location${n !== 1 ? 's' : ''}</div>
        </div>
      </div>`;
    }).join('');
  }

  return {
    init(m) {
      map = m;
      _injectCSS();
    },
    setEnabled(on) {
      enabled = on;
      if (on) {
        _render();
        _updatePanel();
      } else {
        markers.forEach(m => map?.removeLayer(m));
        markers = [];
      }
    },
    refresh() {
      if (enabled) _render();
    },
    getSites() { return ALL_SITES; },
  };
})();
