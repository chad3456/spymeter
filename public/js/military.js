/* ── Military Bases + Nuclear Sites (Public OSINT data) ─ */
const MILITARY = (() => {
  let map          = null;
  let baseLayer    = null;
  let nuclearLayer = null;
  let gpsjamLayer  = null;
  let baseEnabled    = true;
  let nuclearEnabled = false;
  let gpsjamEnabled  = false;

  // Country name → ISO2 code + flag for instability panel
  const COUNTRY_CODE_MAP = {
    'USA':'US','Russia':'RU','China':'CN','India':'IN','Pakistan':'PK',
    'UK':'GB','France':'FR','Germany':'DE','Japan':'JP','South Korea':'KR',
    'Israel':'IL','Iran':'IR','Turkey':'TR','Saudi Arabia':'SA','UAE':'AE',
    'Australia':'AU','Canada':'CA','Ukraine':'UA','NATO':'—',
    'North Korea':'KP','Taiwan':'TW','Iraq':'IQ','Syria':'SY','Libya':'LY',
    'Egypt':'EG','Qatar':'QA','Kuwait':'KW','Bahrain':'BH','Djibouti':'DJ',
    'Philippines':'PH','Guam':'GU','Singapore':'SG','Spain':'ES','Italy':'IT',
    'Romania':'RO','Poland':'PL','Lithuania':'LT','Estonia':'EE','Bulgaria':'BG',
    'Kazakhstan':'KZ','Kyrgyzstan':'KG','Uzbekistan':'UZ','Tajikistan':'TJ',
  };
  const COUNTRY_FLAG_MAP = {
    'USA':'🇺🇸','Russia':'🇷🇺','China':'🇨🇳','India':'🇮🇳','Pakistan':'🇵🇰',
    'UK':'🇬🇧','France':'🇫🇷','Germany':'🇩🇪','Japan':'🇯🇵','South Korea':'🇰🇷',
    'Israel':'🇮🇱','Iran':'🇮🇷','Turkey':'🇹🇷','Saudi Arabia':'🇸🇦','UAE':'🇦🇪',
    'Australia':'🇦🇺','Canada':'🇨🇦','Ukraine':'🇺🇦','NATO':'🛡',
    'North Korea':'🇰🇵','Taiwan':'🇹🇼','Iraq':'🇮🇶','Syria':'🇸🇾',
  };

  /* ── Public OSINT military base dataset ──────────────── */
  const BASES = [
    // ── USA ──
    { name:'Ramstein Air Base',         country:'USA', type:'air',    lat:49.437,  lng:7.600,   notes:'NATO/USAF hub, Europe' },
    { name:'Naval Station Norfolk',     country:'USA', type:'naval',  lat:36.942,  lng:-76.289,  notes:'Largest naval base, world' },
    { name:'Al Udeid Air Base',         country:'USA', type:'air',    lat:25.117,  lng:51.315,   notes:'CENTCOM forward HQ, Qatar' },
    { name:'Kadena Air Base',           country:'USA', type:'air',    lat:26.356,  lng:127.768,  notes:'Largest USAF base, Asia-Pacific' },
    { name:'Yokota Air Base',           country:'USA', type:'air',    lat:35.748,  lng:139.348,  notes:'USFJ HQ, Japan' },
    { name:'Osan Air Base',             country:'USA', type:'air',    lat:37.090,  lng:127.030,  notes:'7th AF HQ, South Korea' },
    { name:'Camp Lejeune',              country:'USA', type:'ground', lat:34.658,  lng:-77.341,  notes:'USMC II MEF, NC' },
    { name:'Diego Garcia',              country:'USA', type:'naval',  lat:-7.313,  lng:72.411,   notes:'Remote Indian Ocean base' },
    { name:'Incirlik Air Base',         country:'USA', type:'air',    lat:37.002,  lng:35.426,   notes:'NATO/USAF, Turkey' },
    { name:'Nellis AFB',                country:'USA', type:'air',    lat:36.235,  lng:-115.034, notes:'Fighter weapons school, NV' },
    { name:'Minot AFB',                 country:'USA', type:'air',    lat:48.416,  lng:-101.358, notes:'B-52H + ICBM base' },
    { name:'Barksdale AFB',             country:'USA', type:'air',    lat:32.502,  lng:-93.663,  notes:'B-52H base, AFGSC' },
    { name:'Whiteman AFB',              country:'USA', type:'air',    lat:38.727,  lng:-93.547,  notes:'B-2 Spirit base, MO' },
    { name:'Kirtland AFB',              country:'USA', type:'air',    lat:35.055,  lng:-106.609, notes:'Nuclear weapons storage, NM' },
    { name:'F.E. Warren AFB',           country:'USA', type:'air',    lat:41.145,  lng:-104.921, notes:'ICBM Minuteman III, WY' },
    { name:'Malmstrom AFB',             country:'USA', type:'air',    lat:47.511,  lng:-111.186, notes:'ICBM Minuteman III, MT' },
    { name:'Ellsworth AFB',             country:'USA', type:'air',    lat:44.145,  lng:-103.102, notes:'B-21 Raider base, SD' },
    { name:'NAS Patuxent River',        country:'USA', type:'naval',  lat:38.286,  lng:-76.412,  notes:'Naval Air Warfare Center, MD' },
    { name:'Fort Liberty (Bragg)',      country:'USA', type:'ground', lat:35.139,  lng:-79.006,  notes:'82nd Airborne, USASOC, NC' },
    { name:'Fort Campbell',             country:'USA', type:'ground', lat:36.661,  lng:-87.475,  notes:'101st Airborne, KY/TN' },
    { name:'Camp Humphreys',            country:'USA', type:'ground', lat:36.966,  lng:127.007,  notes:'USFK HQ, South Korea' },
    { name:'Guantanamo Bay NB',         country:'USA', type:'naval',  lat:19.904,  lng:-75.099,  notes:'Cuba, SOUTHCOM' },
    // ── Russia ──
    { name:'Hmeimim Air Base',          country:'Russia', type:'air',  lat:35.401,  lng:35.948,  notes:'Russia Syria ops base' },
    { name:'Tartus Naval Base',         country:'Russia', type:'naval',lat:34.889,  lng:35.887,  notes:'Russia Mediterranean port' },
    { name:'Severomorsk Naval',         country:'Russia', type:'naval',lat:69.075,  lng:33.416,  notes:'Northern Fleet HQ' },
    { name:'Vladivostok Naval',         country:'Russia', type:'naval',lat:43.115,  lng:131.882, notes:'Pacific Fleet HQ' },
    { name:'Dombarovsky ICBM Base',     country:'Russia', type:'air',  lat:50.800,  lng:59.832,  notes:'SS-18 Satan ICBM base' },
    { name:'Yars ICBM Base Yoshkar-Ola',country:'Russia', type:'ground',lat:56.638, lng:47.898,  notes:'RS-24 Yars ICBM site' },
    { name:'Engels Air Base',           country:'Russia', type:'air',  lat:51.463,  lng:46.173,  notes:'Tu-160/Tu-95 strategic bombers' },
    { name:'Belaya Air Base',           country:'Russia', type:'air',  lat:52.914,  lng:103.576, notes:'Tu-22M3 bombers, Siberia' },
    { name:'Olenya Air Base',           country:'Russia', type:'air',  lat:68.152,  lng:33.464,  notes:'Tu-22M3 Northern Fleet aviation' },
    { name:'Akhtubinsk Test Center',    country:'Russia', type:'air',  lat:48.285,  lng:46.181,  notes:'Flight testing, Gromov institute' },
    // ── China ──
    { name:'Sanya Naval Base',          country:'China', type:'naval', lat:18.227,  lng:109.569,  notes:'PLAN South Sea nuclear subs' },
    { name:'Qingdao Naval Base',        country:'China', type:'naval', lat:36.065,  lng:120.326,  notes:'North Sea Fleet HQ' },
    { name:'Ningbo Naval Base',         country:'China', type:'naval', lat:29.931,  lng:121.573,  notes:'East Sea Fleet' },
    { name:'Mischief Reef',             country:'China', type:'air',   lat:9.907,   lng:115.534,  notes:'Artificial island base, SCS' },
    { name:'Fiery Cross Reef',          country:'China', type:'air',   lat:9.547,   lng:114.214,  notes:'Airstrip + missile garrison, SCS' },
    { name:'Woody Island',              country:'China', type:'air',   lat:16.835,  lng:112.338,  notes:'HQ Sansha, Paracel Islands' },
    { name:'Dingxin Test Base',         country:'China', type:'air',   lat:40.394,  lng:99.836,   notes:'PLAAF weapons testing' },
    { name:'Jiuquan Satellite Center',  country:'China', type:'air',   lat:40.958,  lng:100.291,  notes:'Space launch + ICBM test' },
    { name:'Lüliang ICBM Silo Field',  country:'China', type:'ground', lat:37.300,  lng:111.200,  notes:'DF-41 ICBM silo field (sat imagery)' },
    { name:'Hami ICBM Silo Field',      country:'China', type:'ground', lat:43.117,  lng:93.200,   notes:'DF-41 ICBM silos, Xinjiang' },
    // ── UK ──
    { name:'RAF Brize Norton',          country:'United Kingdom', type:'air',   lat:51.750, lng:-1.583,  notes:'RAF Air Mobility, largest RAF base' },
    { name:'RAF Lossiemouth',           country:'United Kingdom', type:'air',   lat:57.705, lng:-3.339,  notes:'Typhoon + P-8 Poseidon base' },
    { name:'HMNB Clyde (Faslane)',      country:'United Kingdom', type:'naval', lat:56.038, lng:-4.816,  notes:'Trident SSBN base, UK nuclear' },
    { name:'RAF Akrotiri',              country:'United Kingdom', type:'air',   lat:34.589, lng:32.987,  notes:'Sovereign base, Cyprus' },
    { name:'AWE Aldermaston',           country:'United Kingdom', type:'ground',lat:51.390, lng:-1.145,  notes:'UK nuclear warhead facility' },
    // ── France ──
    { name:'Base Aérienne Istres',      country:'France', type:'air',   lat:43.523, lng:4.924,   notes:'French nuclear bombers ASMP-A' },
    { name:'Île Longue SSBN Base',      country:'France', type:'naval', lat:48.356, lng:-4.461,  notes:'French Trident submarine base' },
    { name:'Camp de Gaulle, Djibouti',  country:'France', type:'ground',lat:11.519, lng:43.163,  notes:'French Horn of Africa base' },
    // ── Israel ──
    { name:'Nevatim Air Base',          country:'Israel', type:'air',  lat:31.208, lng:34.997,  notes:'F-35I Adir base, Negev' },
    { name:'Palmachim Air Base',        country:'Israel', type:'air',  lat:31.896, lng:34.691,  notes:'Space launch + UAV, Jericho missiles' },
    { name:'Hatzerim Air Base',         country:'Israel', type:'air',  lat:31.225, lng:34.663,  notes:'F-16 + aerobatics school' },
    // ── NATO ──
    { name:'NATO HQ Mons (SHAPE)',      country:'NATO', type:'ground', lat:50.448, lng:3.945,   notes:'Supreme Allied Commander Europe HQ' },
    { name:'Ramstein (NATO Allied AC)', country:'NATO', type:'air',    lat:49.437, lng:7.600,   notes:'NATO AIRCOM HQ' },
    { name:'Kleine Brogel',            country:'NATO', type:'air',    lat:51.168, lng:5.470,   notes:'Belgian F-16, B61 nuclear storage' },
    { name:'Büchel Air Base',           country:'NATO', type:'air',    lat:50.174, lng:7.063,   notes:'Tornado, B61 nuclear storage Germany' },
    { name:'Aviano Air Base',           country:'NATO', type:'air',    lat:46.032, lng:12.595,  notes:'USAF 31st FW, Italy, B61 storage' },
    { name:'Volkel Air Base',           country:'NATO', type:'air',    lat:51.656, lng:5.708,   notes:'Dutch F-35A, B61 nuclear storage' },
    // ── North Korea ──
    { name:'Yongbyon Nuclear Complex',  country:'North Korea', type:'ground',lat:39.795, lng:125.742, notes:'NK plutonium + enrichment site' },
    { name:'Sunchon UGF ICBM Base',    country:'North Korea', type:'ground',lat:39.437, lng:125.941, notes:'Hwasong ICBM underground facility' },
    { name:'Sunan International (NK)',  country:'North Korea', type:'air',   lat:39.124, lng:125.670, notes:'Hwasong-15/17 launch complex' },
    // ── Iran ──
    { name:'Natanz Nuclear Site',       country:'Iran', type:'ground', lat:33.724, lng:51.727,  notes:'Uranium enrichment, underground' },
    { name:'Fordow Enrichment Plant',   country:'Iran', type:'ground', lat:34.887, lng:50.993,  notes:'Underground enrichment, Qom' },
    { name:'Shahid Nojeh Air Base',     country:'Iran', type:'air',    lat:35.211, lng:48.654,  notes:'IRGC, F-14 Tomcat remaining' },
    // ── India ──
    { name:'INS Karwar (Seabird)',      country:'India', type:'naval', lat:14.804, lng:74.123,  notes:'India largest naval base — under expansion' },
    { name:'Ambala Air Force Station',  country:'India', type:'air',   lat:30.370, lng:76.817,  notes:'IAF Rafale home base — 17 Golden Arrows Sqn' },
    { name:'Leh Air Base',             country:'India', type:'air',   lat:34.135, lng:77.546,  notes:'Highest operational airbase in Asia — Ladakh (14,000ft)' },
    { name:'Hindon Air Force Station', country:'India', type:'air',   lat:28.698, lng:77.473,  notes:'Largest IAF base, near Delhi — Su-30MKI' },
    { name:'INS Visakhapatnam',        country:'India', type:'naval', lat:17.693, lng:83.314,  notes:'Eastern Naval Command HQ — submarine & P-8I base' },
    { name:'Pathankot Air Force Station',country:'India',type:'air',  lat:32.233, lng:75.634,  notes:'IAF forward base, Punjab — Mirage 2000' },
    // ── Saudi Arabia ──
    { name:'Prince Sultan Air Base',   country:'Saudi Arabia', type:'air', lat:24.062, lng:47.580, notes:'USAF forward deployed, key Gulf hub' },
    { name:'King Khalid Military City',country:'Saudi Arabia', type:'ground',lat:27.895, lng:45.527, notes:'Large military complex, NE Saudi Arabia' },
    // ── Pakistan ──
    { name:'Minhas Air Base',          country:'Pakistan', type:'air',   lat:33.869, lng:72.400, notes:'PAF No.2 FW — F-16, JF-17 Thunder' },
    { name:'Masroor Air Base',         country:'Pakistan', type:'air',   lat:24.893, lng:66.938, notes:'PAF southern base, Karachi — F-7PG' },
    { name:'PNS Mehran',              country:'Pakistan', type:'naval', lat:24.923, lng:67.141, notes:'Pakistan Navy HQ Karachi — P-3C Orion' },
  ];

  /* ── Nuclear sites (public data from FAS/SIPRI/news) ── */
  const NUCLEAR_SITES = [
    { name:'Los Alamos National Lab',   country:'USA',    lat:35.844,  lng:-106.285, type:'research',  warheads:0,   notes:'Nuclear weapons design lab' },
    { name:'Pantex Plant',             country:'USA',    lat:35.247,  lng:-101.497, type:'assembly',  warheads:0,   notes:'US warhead assembly/disassembly' },
    { name:'Y-12 Complex Oak Ridge',   country:'USA',    lat:36.016,  lng:-84.258,  type:'production',warheads:0,   notes:'HEU production and storage' },
    { name:'Savannah River Site',      country:'USA',    lat:33.349,  lng:-81.711,  type:'production',warheads:0,   notes:'Tritium production' },
    { name:'Nevada Test Site (NTS)',   country:'USA',    lat:37.120,  lng:-116.060, type:'test',      warheads:0,   notes:'US nuclear test site (inactive)' },
    { name:'Seversk (Tomsk-7)',        country:'Russia', lat:56.600,  lng:84.950,   type:'production',warheads:0,   notes:'Russian plutonium production' },
    { name:'Ozersk (Chelyabinsk-65)', country:'Russia', lat:55.757,  lng:60.696,   type:'production',warheads:0,   notes:'Mayak Chemical Combine' },
    { name:'Sarov (Arzamas-16)',       country:'Russia', lat:54.920,  lng:43.290,   type:'research',  warheads:0,   notes:'Russian nuclear weapons lab VNIIEF' },
    { name:'Semey (Semipalatinsk)',    country:'Kazakhstan',lat:50.407,lng:78.183,  type:'test',      warheads:0,   notes:'Soviet test site (inactive)' },
    { name:'AWE Aldermaston',          country:'United Kingdom',lat:51.390,lng:-1.145,type:'research',warheads:0,   notes:'UK nuclear weapons design' },
    { name:'CEA Valduc',               country:'France', lat:47.540,  lng:4.974,    type:'production',warheads:0,   notes:'French warhead facility' },
    { name:'Dimona Nuclear Reactor',   country:'Israel', lat:31.002,  lng:35.140,   type:'production',warheads:0,   notes:'Unconfirmed; Israel undeclared' },
    { name:'Kahuta Research Labs',     country:'Pakistan',lat:33.634, lng:73.387,   type:'production',warheads:0,   notes:'Pakistan HEU enrichment (PAEC)' },
    { name:'Khushab Reactor Complex',  country:'Pakistan',lat:32.076, lng:72.200,   type:'production',warheads:0,   notes:'Pakistan plutonium production' },
    { name:'Yongbyon Complex',         country:'North Korea',lat:39.795,lng:125.742,type:'production',warheads:0,   notes:'NK plutonium + enrichment' },
    { name:'Baotou Nuclear Plant',     country:'China',  lat:40.616,  lng:110.017,  type:'production',warheads:0,   notes:'China fuel fabrication' },
    { name:'Jiuquan (PLARF ICBM)',     country:'China',  lat:40.958,  lng:100.291,  type:'test',      warheads:0,   notes:'China ICBM test range' },
    // ── India nuclear sites (public OSINT / SIPRI / BARC) ──
    { name:'BARC Trombay',            country:'India',  lat:19.017,  lng:73.017,   type:'research',  warheads:0,   notes:'Bhabha Atomic Research Centre — India primary nuclear weapons design lab' },
    { name:'Pokhran Test Range',      country:'India',  lat:27.067,  lng:71.437,   type:'test',      warheads:0,   notes:'Site of Pokhran-I (1974 Smiling Buddha) and Pokhran-II (1998 Shakti) nuclear tests' },
    { name:'Tarapur Atomic Power',    country:'India',  lat:19.833,  lng:72.649,   type:'production',warheads:0,   notes:'India first nuclear power plant — operational, generates fissile material' },
    { name:'IGCAR Kalpakkam',         country:'India',  lat:12.557,  lng:80.174,   type:'research',  warheads:0,   notes:'Indira Gandhi Centre for Atomic Research — fast breeder reactor program' },
    { name:'NFC Hyderabad',           country:'India',  lat:17.407,  lng:78.396,   type:'production',warheads:0,   notes:'Nuclear Fuel Complex — HEU/LEU fuel fabrication for weapons and reactors' },
    { name:'DRDO DRDL Hyderabad',     country:'India',  lat:17.452,  lng:78.534,   type:'research',  warheads:0,   notes:'Defence R&D Lab — Agni ICBM/MRBM missile design and test' },
    // ── Pakistan ──
    { name:'Kahuta Research Labs',    country:'Pakistan',lat:33.634, lng:73.387,   type:'production',warheads:0,   notes:'Pakistan HEU enrichment (PAEC) — Khan Research Laboratories' },
    { name:'Khushab Reactor Complex', country:'Pakistan',lat:32.076, lng:72.200,   type:'production',warheads:0,   notes:'Pakistan plutonium production reactors (4 reactors)' },
    { name:'Chasma Nuclear Complex',  country:'Pakistan',lat:32.390, lng:71.460,   type:'production',warheads:0,   notes:'Civilian nuclear power + weapons-grade material speculation' },
  ];

  /* ── Known GPS jamming zones (public/news-reported) ─── */
  const GPSJAM_ZONES = [
    { name:'Eastern Mediterranean',  lat:34.5,  lng:33.5,  radius:250, severity:'HIGH',  source:'EUROCONTROL NOTAM' },
    { name:'Black Sea region',       lat:43.0,  lng:34.0,  radius:300, severity:'HIGH',  source:'EUROCONTROL NOTAM' },
    { name:'Finland/Baltic border',  lat:60.5,  lng:28.0,  radius:200, severity:'MED',   source:'Finnish ATC' },
    { name:'Baltic States',          lat:57.0,  lng:24.0,  radius:180, severity:'HIGH',  source:'EUROCONTROL' },
    { name:'Northern Syria',         lat:36.5,  lng:38.0,  radius:150, severity:'HIGH',  source:'Aviation safety reports' },
    { name:'Baghdad airspace',       lat:33.3,  lng:44.4,  radius:120, severity:'MED',   source:'ICAO report' },
    { name:'Korea DMZ',              lat:38.0,  lng:127.0, radius:100, severity:'MED',   source:'Korean aviation authority' },
    { name:'Kaliningrad region',     lat:54.7,  lng:20.5,  radius:200, severity:'HIGH',  source:'EUROCONTROL' },
  ];

  // SVG icon HTML per base type
  function typeSVG(type, color) {
    const c = color;
    const g = `filter:drop-shadow(0 0 3px ${c})`;
    const svgs = {
      air: `<svg viewBox="0 0 22 22" width="22" height="22" style="${g}">
              <path fill="${c}" d="M11 2l1.5 5.5H18l-4.5 3.3 1.7 5.2L11 13l-4.2 3 1.7-5.2L4 7.5h5.5z"/>
              <rect fill="${c}" opacity=".5" x="10" y="14" width="2" height="5" rx="1"/>
            </svg>`,
      naval: `<svg viewBox="0 0 22 22" width="22" height="22" style="${g}">
               <circle cx="11" cy="7" r="2.5" fill="none" stroke="${c}" stroke-width="1.8"/>
               <line x1="11" y1="2" x2="11" y2="20" stroke="${c}" stroke-width="1.8"/>
               <path fill="none" stroke="${c}" stroke-width="1.8" d="M4 16 Q11 20 18 16"/>
               <path fill="none" stroke="${c}" stroke-width="1.5" d="M8 11 Q11 9 14 11"/>
             </svg>`,
      ground: `<svg viewBox="0 0 22 22" width="22" height="22" style="${g}">
                <polygon points="11,3 20,18 2,18" fill="none" stroke="${c}" stroke-width="1.8"/>
                <circle cx="11" cy="12" r="2" fill="${c}"/>
              </svg>`,
      test: `<svg viewBox="0 0 22 22" width="22" height="22" style="${g}">
              <circle cx="11" cy="11" r="8" fill="none" stroke="${c}" stroke-width="1.5"/>
              <circle cx="11" cy="11" r="4" fill="none" stroke="${c}" stroke-width="1.5"/>
              <circle cx="11" cy="11" r="1.5" fill="${c}"/>
              <line x1="3" y1="11" x2="19" y2="11" stroke="${c}" stroke-width="1" opacity=".4"/>
              <line x1="11" y1="3" x2="11" y2="19" stroke="${c}" stroke-width="1" opacity=".4"/>
            </svg>`,
      research: `<svg viewBox="0 0 22 22" width="22" height="22" style="${g}">
                  <path fill="none" stroke="${c}" stroke-width="1.8" d="M8 3h6l1 8H7z"/>
                  <path fill="${c}" opacity=".5" d="M6 11 Q5 18 11 19 Q17 18 16 11z"/>
                  <circle cx="11" cy="5.5" r="1" fill="${c}"/>
                </svg>`,
      assembly: `<svg viewBox="0 0 22 22" width="22" height="22" style="${g}">
                  <rect x="4" y="4" width="14" height="14" fill="none" stroke="${c}" stroke-width="1.8" rx="2"/>
                  <path fill="${c}" d="M11 7l2 4h-4z"/>
                  <rect x="9" y="12" width="4" height="4" fill="${c}" opacity=".7" rx="1"/>
                </svg>`,
      production: `<svg viewBox="0 0 22 22" width="22" height="22" style="${g}">
                    <polygon points="11,2 20.5,17 1.5,17" fill="none" stroke="${c}" stroke-width="1.8"/>
                    <text x="11" y="16" text-anchor="middle" font-size="9" fill="${c}">☢</text>
                  </svg>`,
    };
    return svgs[type] || svgs.ground;
  }

  function typeIcon(type, country) {
    const icons = { air:'✈', naval:'⚓', ground:'★', test:'◎', research:'⊗', assembly:'⊞', production:'☢' };
    return icons[type] || '◈';
  }

  function baseColor(country) {
    const colors = {
      'USA':'#3399ff','Russia':'#ff3333','China':'#ffaa00','United Kingdom':'#cc44ff',
      'France':'#4488ff','Israel':'#8888ff','NATO':'#00d4ff','North Korea':'#aa0033',
      'Iran':'#aa4400','Pakistan':'#44aa00','Kazakhstan':'#888800',
      'India':'#ff8844','Saudi Arabia':'#aacc00','Germany':'#44dd88',
    };
    return colors[country] || '#888888';
  }

  function makeBasePopup(b) {
    const code = COUNTRY_CODE_MAP[b.country] || '';
    const flag = COUNTRY_FLAG_MAP[b.country] || '🌐';
    const intelBtn = code && code !== '—'
      ? `<button onclick="if(window.INSTABILITY)INSTABILITY.show('${code}','${flag}','${b.country}')" style="margin-top:6px;width:100%;background:rgba(0,212,255,0.08);border:1px solid #1e3a5f;color:#00d4ff;font-family:monospace;font-size:9px;padding:4px;cursor:pointer;letter-spacing:1px">◈ COUNTRY INTELLIGENCE →</button>`
      : '';
    return `
      <div class="popup-box">
        <div class="popup-title">${typeIcon(b.type)} ${b.name}</div>
        <div class="popup-row"><span class="popup-key">COUNTRY</span><span class="popup-val" style="color:${baseColor(b.country)}">${flag} ${b.country}</span></div>
        <div class="popup-row"><span class="popup-key">TYPE</span><span class="popup-val orange">${b.type.toUpperCase()}</span></div>
        <div class="popup-row"><span class="popup-key">LAT/LNG</span><span class="popup-val">${b.lat.toFixed(2)}, ${b.lng.toFixed(2)}</span></div>
        <div class="popup-row"><span class="popup-key">NOTES</span></div>
        <div style="font-size:10px;color:#8ba4c0;padding:2px 0">${b.notes}</div>
        ${intelBtn}
      </div>`;
  }

  function makeNuclearPopup(n) {
    return `
      <div class="popup-box">
        <div class="popup-title">☢ ${n.name}</div>
        <div class="popup-row"><span class="popup-key">COUNTRY</span><span class="popup-val red">${n.country}</span></div>
        <div class="popup-row"><span class="popup-key">TYPE</span><span class="popup-val orange">${n.type.toUpperCase()}</span></div>
        <div class="popup-row"><span class="popup-key">NOTES</span></div>
        <div style="font-size:10px;color:#8ba4c0;padding:2px 0">${n.notes}</div>
      </div>`;
  }

  function addBase(b) {
    const color = baseColor(b.country);
    const svg   = typeSVG(b.type, color);
    const icon  = L.divIcon({
      html: `<div class="mil-icon-wrap" title="${b.name}: ${b.type.toUpperCase()} | ${b.country}">${svg}</div>`,
      className: '',
      iconSize:   [22, 22],
      iconAnchor: [11, 11],
    });
    const m = L.marker([b.lat, b.lng], { icon, zIndexOffset: 50 });
    m.bindPopup(makeBasePopup(b), { maxWidth: 300 });
    m.on('click', () => SIDEBAR.addFeedItem('military',
      `${typeIcon(b.type)} ${b.name} | ${b.country} | ${b.type.toUpperCase()}`));
    if (baseLayer) m.addTo(baseLayer);
  }

  function addNuclear(n) {
    const color = '#ff2244';
    const svg   = typeSVG(n.type || 'production', color);
    const icon  = L.divIcon({
      html: `<div class="mil-icon-wrap mil-nuclear-wrap" title="☢ ${n.name}">${svg}</div>`,
      className: '',
      iconSize:   [22, 22],
      iconAnchor: [11, 11],
    });
    const m = L.marker([n.lat, n.lng], { icon, zIndexOffset: 80 });
    m.bindPopup(makeNuclearPopup(n), { maxWidth: 300 });
    m.on('click', () => SIDEBAR.addFeedItem('military', `☢ NUCLEAR: ${n.name} | ${n.country}`));
    if (nuclearLayer) m.addTo(nuclearLayer);
  }

  function addGPSJamZones() {
    GPSJAM_ZONES.forEach(z => {
      const col = z.severity === 'HIGH' ? '#ff3333' : '#ffaa00';
      L.circle([z.lat, z.lng], {
        radius: z.radius * 1000,
        color: col,
        weight: 1,
        opacity: 0.6,
        fillColor: col,
        fillOpacity: 0.08,
        dashArray: '6 4',
      }).bindPopup(`
        <div class="popup-box">
          <div class="popup-title">⊗ GPS JAMMING</div>
          <div class="popup-row"><span class="popup-key">AREA</span><span class="popup-val red">${z.name}</span></div>
          <div class="popup-row"><span class="popup-key">SEVERITY</span><span class="popup-val orange">${z.severity}</span></div>
          <div class="popup-row"><span class="popup-key">RADIUS</span><span class="popup-val">${z.radius} km</span></div>
          <div class="popup-row"><span class="popup-key">SOURCE</span><span class="popup-val">${z.source}</span></div>
        </div>`).addTo(gpsjamLayer);
    });
  }

  function init(mapInstance) {
    map          = mapInstance;
    baseLayer    = L.layerGroup().addTo(map);
    nuclearLayer = L.layerGroup(); // off by default
    gpsjamLayer  = L.layerGroup(); // off by default

    BASES.forEach(b => addBase(b));
    NUCLEAR_SITES.forEach(n => addNuclear(n));
    addGPSJamZones();

    const el = document.getElementById('sv-bases');
    if (el) el.textContent = BASES.length;

    SIDEBAR.populateWarheads();
    SIDEBAR.populateGPSJam(GPSJAM_ZONES);
    SIDEBAR.addFeedItem('military', `Loaded ${BASES.length} military bases`);
  }

  function setEnabled(layer_name, on) {
    if (layer_name === 'military')  { baseEnabled    = on; on ? baseLayer.addTo(map)    : map.removeLayer(baseLayer);    }
    if (layer_name === 'nuclear')   { nuclearEnabled = on; on ? nuclearLayer.addTo(map) : map.removeLayer(nuclearLayer); }
    if (layer_name === 'gpsjam')    { gpsjamEnabled  = on; on ? gpsjamLayer.addTo(map)  : map.removeLayer(gpsjamLayer);  }
  }

  function getBases()    { return BASES; }
  function getNuclear()  { return NUCLEAR_SITES; }
  function getGPSJam()   { return GPSJAM_ZONES; }

  return { init, setEnabled, getBases, getNuclear, getGPSJam };
})();
