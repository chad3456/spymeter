/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — Nuclear Intelligence OSINT Layer
   Data: SIPRI Yearbook 2024 · FAS Nuclear Notebook · public OSINT reporting
   Covers: ICBM silo complexes, SSBN submarine bases, nuclear weapons labs,
           tactical/deployed nuclear weapons, test sites, warhead storage.
════════════════════════════════════════════════════════════════════════════ */
const NUCLEAR_INTEL = (() => {
  let map     = null;
  let enabled = false;
  let markers = [];

  const CAT = {
    SILO:     { color:'#ff2222', icon:'⬆',  label:'ICBM Silo Complex',        z:1100 },
    SSBN:     { color:'#0088ff', icon:'🚢', label:'SSBN Submarine Base',       z:1050 },
    LAB:      { color:'#ff8800', icon:'⚛',  label:'Nuclear Weapons Lab',       z:900  },
    TACTICAL: { color:'#ffcc00', icon:'☢',  label:'Tactical/Deployed Nuke',    z:950  },
    TESTSITE: { color:'#cc44ff', icon:'💥', label:'Nuclear Test Site',         z:850  },
    STORAGE:  { color:'#00cc88', icon:'🏛',  label:'Warhead Storage',           z:800  },
  };

  // ── ICBM Silo Complexes ───────────────────────────────────────────────────
  const SILOS = [
    { lat:47.5057,  lng:-111.1879, cat:'SILO', name:'Malmstrom AFB',                  country:'USA',
      warheads:'150 Minuteman III', status:'Active',
      notes:'150 Minuteman III silos spread across central Montana. 341st Missile Wing. On alert 24/7.' },
    { lat:48.4159,  lng:-101.3585, cat:'SILO', name:'Minot AFB',                      country:'USA',
      warheads:'150 Minuteman III', status:'Active',
      notes:'150 Minuteman III silos across western North Dakota. 91st Missile Wing. Also B-52H bombers.' },
    { lat:41.1450,  lng:-104.8631, cat:'SILO', name:'F.E. Warren AFB',                country:'USA',
      warheads:'150 Minuteman III', status:'Active',
      notes:'150 Minuteman III silos spanning WY/CO/NE. 90th Missile Wing. Largest ICBM wing by area.' },
    { lat:53.9814,  lng:35.7762,   cat:'SILO', name:'Kozelsk ICBM Base',              country:'Russia',
      warheads:'RS-24 Yars MIRVed', status:'Active',
      notes:'Kozelsk, Kaluga Oblast. RS-24 Yars ICBM (MIRV, 3–6 warheads). Upgraded from SS-19 Stiletto.' },
    { lat:51.7064,  lng:45.8231,   cat:'SILO', name:'Tatishchevo ICBM Base',          country:'Russia',
      warheads:'RS-18 Stiletto / RS-24', status:'Active',
      notes:'Saratov Oblast. Mix of RS-18B Stiletto and RS-24 Yars. Largest silo field in Russia.' },
    { lat:56.0811,  lng:89.8316,   cat:'SILO', name:'Uzhur ICBM Base',               country:'Russia',
      warheads:'RS-20V Satan', status:'Active',
      notes:'Krasnoyarsk Krai. RS-20V Voevoda (SS-18 Satan). 10 MIRVed warheads per missile. Phasing out 2024–2026.' },
    { lat:51.1178,  lng:59.6028,   cat:'SILO', name:'Dombarovsky ICBM Base',          country:'Russia',
      warheads:'RS-28 Sarmat', status:'Transitioning',
      notes:'Orenburg Oblast. Transitioning from RS-20V to RS-28 Sarmat (Satan II). First regiment declared 2023.' },
    { lat:56.6354,  lng:47.8865,   cat:'SILO', name:'Yoshkar-Ola Mobile ICBM',        country:'Russia',
      warheads:'RS-24 Yars road-mobile', status:'Active',
      notes:'Mari El Republic. RS-24 Yars road-mobile TEL regiments. Dual-capable fixed/mobile deployment.' },
    { lat:54.9884,  lng:82.9381,   cat:'SILO', name:'Novosibirsk ICBM Complex',       country:'Russia',
      warheads:'RS-24 Yars', status:'Active',
      notes:'Novosibirsk Oblast. RS-24 Yars ICBM regiment. Road-mobile and silo variants.' },
    { lat:33.3119,  lng:112.4631,  cat:'SILO', name:'China DF-5 Silo Field — Henan',  country:'China',
      warheads:'DF-5B (MIRVed)', status:'Active',
      notes:'Henan Province. DF-5B silo-based ICBM. 2–5 MIRVed warheads. Long-standing Chinese deterrent.' },
    { lat:39.7500,  lng:101.5500,  cat:'SILO', name:'China DF-41 Silo Field — Gansu', country:'China',
      warheads:'DF-41 (MIRVed ~120 silos)', status:'Under construction/active',
      notes:'Gansu Province. ~120 new silos identified via satellite imagery 2021. DF-41, 10 MIRVs, ~12,000 km range.' },
    { lat:41.8500,  lng:88.3500,   cat:'SILO', name:'China DF-41 Silo Field — Xinjiang', country:'China',
      warheads:'DF-41 (MIRVed ~110 silos)', status:'Under construction/active',
      notes:'Xinjiang (Hami area). ~110 silos identified 2021. Part of China rapid nuclear expansion.' },
    { lat:25.1000,  lng:102.5000,  cat:'SILO', name:'China DF-5 Base — Yunnan',       country:'China',
      warheads:'DF-5A/B', status:'Active',
      notes:'Yunnan Province. DF-5A/B silo complex targeting South and Southeast Asia.' },
    { lat:39.7931,  lng:125.7534,  cat:'SILO', name:'Yongbyon Nuclear Complex',        country:'DPRK',
      warheads:'Estimated ~50 devices', status:'Active/Expanding',
      notes:'Yongbyon-kun, North Pyongan. 5 MWe reactor, reprocessing, centrifuge enrichment. Primary Pu/HEU source for DPRK arsenal.' },
  ];

  // ── SSBN Submarine Bases ──────────────────────────────────────────────────
  const SSBNS = [
    { lat:30.7876,  lng:-81.5589,  cat:'SSBN', name:'Naval Sub Base Kings Bay',        country:'USA',
      warheads:'~960 warheads (8 SSBNs)', status:'Active',
      notes:'Kings Bay, Georgia. Home to Atlantic Fleet Ohio-class SSBNs. Trident II D5 missiles. 6 boats typically home-ported.' },
    { lat:47.7343,  lng:-122.7114, cat:'SSBN', name:'Submarine Base Bangor',           country:'USA',
      warheads:'~960 warheads (8 SSBNs)', status:'Active',
      notes:'Kitsap County, Washington. Home to Pacific Fleet Ohio-class SSBNs. Trident II D5. 6 boats home-ported.' },
    { lat:69.2633,  lng:33.3125,   cat:'SSBN', name:'Gadzhiyevo Naval Base',           country:'Russia',
      warheads:'Borei/Delta IV (multiple)', status:'Active',
      notes:'Gadzhiyevo, Murmansk Oblast. Northern Fleet SSBN base. Delta IV Project 667BDRM and Borei Project 955 boats.' },
    { lat:69.3167,  lng:33.2833,   cat:'SSBN', name:'Yagelnaya Bay (Olenya)',          country:'Russia',
      warheads:'Borei-A class', status:'Active',
      notes:'Murmansk Oblast. Secondary Northern Fleet SSBN anchorage. Borei-A (Project 955A) submarines. RSM-56 Bulava missiles.' },
    { lat:52.9458,  lng:158.4161,  cat:'SSBN', name:'Vilyuchinsk Naval Base',          country:'Russia',
      warheads:'Pacific Fleet SSBNs', status:'Active',
      notes:'Kamchatka Krai. Pacific Fleet SSBN base. Borei-class submarines replacing Delta III boats. RSM-56 Bulava.' },
    { lat:56.0756,  lng:-4.8036,   cat:'SSBN', name:'HMNB Clyde — Faslane',           country:'UK',
      warheads:'~225 warheads (4 SSBNs)', status:'Active',
      notes:'Faslane, Scotland. Home of UK Continuous at Sea Deterrent. Vanguard-class SSBN. Trident II D5 missiles.' },
    { lat:48.3286,  lng:-4.5639,   cat:'SSBN', name:'Île Longue — Brest',             country:'France',
      warheads:'~290 warheads (4 SSBNs)', status:'Active',
      notes:'Île Longue, Finistère. French Force Océanique Stratégique (FOST). Le Triomphant-class SSBN. M51 SLBM.' },
    { lat:17.6868,  lng:83.2185,   cat:'SSBN', name:'INS Arihant — Visakhapatnam',    country:'India',
      warheads:'~172 warheads total', status:'Active patrol',
      notes:'Visakhapatnam (Vizag) naval base. Home to Arihant-class SSBN. K-15 Sagarika SLBM (750 km range). India sea-based deterrent.' },
    { lat:36.1127,  lng:120.5958,  cat:'SSBN', name:'Jianggezhuang Naval Base',       country:'China',
      warheads:'Jin-class (Type-094)', status:'Active',
      notes:'Qingdao, Shandong. North Sea Fleet SSBN base. Jin-class Type-094 boats with JL-2 SLBM (7,400 km range). ~4–6 vessels.' },
    { lat:36.0561,  lng:120.3225,  cat:'SSBN', name:'Qingdao Naval Base',             country:'China',
      warheads:'Type-096 (emerging)', status:'Development',
      notes:'Qingdao, Shandong. Future home of Type-096 SSBN with JL-3 SLBM (~10,000+ km). China expanding fleet to 8+ boats.' },
  ];

  // ── Nuclear Weapons Labs ───────────────────────────────────────────────────
  const LABS = [
    { lat:35.8801,  lng:-106.2965, cat:'LAB', name:'Los Alamos National Laboratory',   country:'USA',
      warheads:'Pit production', status:'Active',
      notes:'Los Alamos, NM. NNSA lab. W88/W80 warhead design. Plutonium pit manufacturing. Founded Manhattan Project 1943.' },
    { lat:37.6882,  lng:-121.7059, cat:'LAB', name:'Lawrence Livermore National Lab',  country:'USA',
      warheads:'W87/W93 design', status:'Active',
      notes:'Livermore, CA. NNSA lab. W87-1 warhead for Sentinel ICBM. Inertial confinement fusion (NIF). Founded 1952.' },
    { lat:35.0553,  lng:-106.5436, cat:'LAB', name:'Sandia National Laboratories',     country:'USA',
      warheads:'Non-nuclear components', status:'Active',
      notes:'Albuquerque, NM. NNSA lab. Responsible for all non-nuclear components of US warheads. Arming/fuzing/firing systems.' },
    { lat:35.2357,  lng:-101.5083, cat:'LAB', name:'Pantex Plant',                     country:'USA',
      warheads:'Assembly/disassembly', status:'Active',
      notes:'Amarillo, TX. Only US nuclear warhead assembly and disassembly facility. B61-12 refurbishment. NNSA operated by BWXT.' },
    { lat:36.0084,  lng:-84.2563,  cat:'LAB', name:'Y-12 National Security Complex',  country:'USA',
      warheads:'HEU storage/processing', status:'Active',
      notes:'Oak Ridge, TN. Primary US HEU storage and processing. Secondary enriched uranium manufacturing. Uranium secondaries for thermonuclear warheads.' },
    { lat:33.3466,  lng:-81.7235,  cat:'LAB', name:'Savannah River Site',              country:'USA',
      warheads:'Tritium production', status:'Active',
      notes:'Aiken, SC. Only US tritium production facility. Tritium loading/unloading for all US warheads. Critical bottleneck for stockpile size.' },
    { lat:54.9259,  lng:43.3294,   cat:'LAB', name:'VNIIEF Sarov (Arzamas-16)',        country:'Russia',
      warheads:'Primary design center', status:'Active',
      notes:'Sarov, Nizhny Novgorod Oblast. Russian Federal Nuclear Center. Primary nuclear weapons design lab. Equivalent of US LANL/LLNL combined.' },
    { lat:56.0892,  lng:60.7347,   cat:'LAB', name:'VNIITF Snezhinsk (Chelyabinsk-70)', country:'Russia',
      warheads:'Secondary design center', status:'Active',
      notes:'Snezhinsk, Chelyabinsk Oblast. Russian Federal Nuclear Center — Zababakhin Institute. Second design bureau. Thermonuclear weapon specialization.' },
    { lat:51.3850,  lng:-1.2228,   cat:'LAB', name:'AWE Aldermaston',                  country:'UK',
      warheads:'Trident warhead design', status:'Active',
      notes:'Aldermaston, Berkshire. Atomic Weapons Establishment. UK warhead design and production. Warhead replacement programme underway.' },
    { lat:48.4464,  lng:2.3567,    cat:'LAB', name:'CEA DAM Île-de-France',            country:'France',
      warheads:'French warhead design', status:'Active',
      notes:'Bruyères-le-Châtel, Essonne. Direction des Applications Militaires. French nuclear warhead design center. TN75/TNO warheads.' },
    { lat:19.0144,  lng:72.9200,   cat:'LAB', name:'BARC Trombay',                    country:'India',
      warheads:'Plutonium production', status:'Active',
      notes:'Mumbai, Maharashtra. Bhabha Atomic Research Centre. Dhruva reactor produces weapons-grade Pu. India primary nuclear research complex.' },
    { lat:33.5878,  lng:73.3897,   cat:'LAB', name:'Khan Research Laboratories — Kahuta', country:'Pakistan',
      warheads:'HEU enrichment', status:'Active',
      notes:'Kahuta, Punjab. Pakistan centrifuge uranium enrichment facility. Founded by A.Q. Khan. Primary HEU source for Pakistan arsenal.' },
    { lat:32.0617,  lng:72.1986,   cat:'LAB', name:'Khushab Plutonium Reactors',       country:'Pakistan',
      warheads:'Plutonium production', status:'Active',
      notes:'Khushab, Punjab. Four heavy-water reactors for weapons-grade plutonium production. Expanded to four reactors by 2015. Major Pu source.' },
    { lat:30.9654,  lng:35.1483,   cat:'LAB', name:'Negev Nuclear Research Center — Dimona', country:'Israel',
      warheads:'~90 (estimated)', status:'Active (undeclared)',
      notes:'Dimona, Negev Desert. Unacknowledged Israeli nuclear research complex. Plutonium production reactor. Israel maintains deliberate ambiguity policy.' },
    { lat:31.4670,  lng:104.6820,  cat:'LAB', name:'CAEP — Mianyang',                 country:'China',
      warheads:'Chinese warhead design', status:'Active',
      notes:'Mianyang, Sichuan. China Academy of Engineering Physics. Primary Chinese nuclear weapons design institute. HEU and Pu processing. Founded 1958.' },
  ];

  // ── Tactical / Deployed Nuclear Weapons ───────────────────────────────────
  const TACTICAL = [
    { lat:50.1733,  lng:7.0631,    cat:'TACTICAL', name:'Büchel Air Base',             country:'Germany',
      warheads:'~20 B61-12', status:'Active NATO sharing',
      notes:'Büchel, Rhineland-Palatinate. US B61-12 gravity bombs stored under NATO nuclear sharing. German Tornado (transitioning to F-35A) delivery.' },
    { lat:51.1678,  lng:5.4699,    cat:'TACTICAL', name:'Kleine Brogel Air Base',      country:'Belgium',
      warheads:'~20 B61-12', status:'Active NATO sharing',
      notes:'Kleine Brogel, Limburg. US B61-12 under NATO nuclear sharing. Belgian F-16 (transitioning to F-35A) delivery aircraft.' },
    { lat:46.0319,  lng:12.5961,   cat:'TACTICAL', name:'Aviano Air Base',             country:'Italy',
      warheads:'~35 B61-12', status:'Active NATO sharing',
      notes:'Aviano, Friuli-Venezia Giulia. US 31st FW F-16s. B61-12 stored for NATO DCA missions. Largest B61 stockpile in Europe.' },
    { lat:37.0021,  lng:35.4258,   cat:'TACTICAL', name:'Incirlik Air Base',           country:'Turkey',
      warheads:'~50 B61-12', status:'Active NATO sharing',
      notes:'Adana, Turkey. US B61-12 bombs in underground WS3 vaults. Turkish F-16 delivery aircraft. Politically sensitive storage site.' },
    { lat:51.6564,  lng:5.7069,    cat:'TACTICAL', name:'Volkel Air Base',             country:'Netherlands',
      warheads:'~20 B61-12', status:'Active NATO sharing',
      notes:'Volkel, North Brabant. Dutch F-35A (replacing F-16) delivery. US B61-12 under NATO DCA. Dutch parliament informed 2013.' },
    { lat:45.4317,  lng:10.2683,   cat:'TACTICAL', name:'Ghedi Air Base',              country:'Italy',
      warheads:'~40 B61-12', status:'Active NATO sharing',
      notes:'Ghedi, Lombardy. Italian Tornado (transitioning to F-35A). US B61-12 gravity bombs. Italian air force DCA role.' },
    { lat:55.1500,  lng:36.5000,   cat:'TACTICAL', name:'Russia Tactical Depots — Western MD', country:'Russia',
      warheads:'~1,000 est. tactical', status:'Active',
      notes:'Western Military District storage. Short-range ballistic missiles (Iskander), air-launched, naval tactical warheads. Exact locations classified.' },
    { lat:54.7104,  lng:20.4522,   cat:'TACTICAL', name:'Russia Tactical Depot — Kaliningrad', country:'Russia',
      warheads:'Iskander-M capable', status:'Active/Suspected',
      notes:'Kaliningrad exclave. Iskander-M ballistic missiles with nuclear capability reported deployed. NATO Article 5 concern since 2016.' },
    { lat:50.5833,  lng:36.5792,   cat:'TACTICAL', name:'Russia Tactical Depot — Belgorod Region', country:'Russia',
      warheads:'Tactical warheads', status:'Active',
      notes:'Belgorod Oblast. Tactical nuclear weapon storage site near Ukraine border. Iskander and potentially Kinzhal-capable systems.' },
    { lat:52.1744,  lng:26.1356,   cat:'TACTICAL', name:'Ziabrauka — Belarus Storage', country:'Belarus',
      warheads:'Tactical warheads (Russia)', status:'Deployed 2023',
      notes:'Ziabrauka (Zyabrovka) airfield area, Gomel Oblast. Russia announced tactical nuclear weapons transferred to Belarus June 2023. Iskander-M.' },
  ];

  // ── Nuclear Test Sites ────────────────────────────────────────────────────
  const TESTSITES = [
    { lat:37.1133,  lng:-116.0492, cat:'TESTSITE', name:'Nevada National Security Site', country:'USA',
      warheads:'928 tests 1951–1992', status:'Inactive (CTBT)',
      notes:'Nye County, Nevada. Formerly Nevada Test Site. 928 nuclear tests conducted. Now NNSA stockpile stewardship experiments. No explosive nuclear tests since 1992.' },
    { lat:50.0705,  lng:78.4335,   cat:'TESTSITE', name:'Semipalatinsk Test Site',     country:'Kazakhstan',
      warheads:'456 Soviet tests 1949–1989', status:'Closed 1991',
      notes:'Semey region, Kazakhstan. "The Polygon." 456 Soviet nuclear tests. Significant radiation contamination. Closed by Nazarbayev 1991. IAEA remediation ongoing.' },
    { lat:73.4034,  lng:54.8222,   cat:'TESTSITE', name:'Novaya Zemlya Test Site',     country:'Russia',
      warheads:'224 tests 1955–1990', status:'Inactive (maintained)',
      notes:'Novaya Zemlya archipelago. 224 Soviet/Russian tests. Site of Tsar Bomba 1961 (50 MT). Russia maintains readiness capability. Last test 1990.' },
    { lat:40.6744,  lng:89.3142,   cat:'TESTSITE', name:'Lop Nur Test Site',           country:'China',
      warheads:'45 tests 1964–1996', status:'Inactive (CTBT)',
      notes:'Xinjiang. China conducted 45 nuclear tests 1964–1996. First test 596 (1964). Last test 29 July 1996. CTBT signed but not ratified by China.' },
    { lat:-21.8435, lng:-138.8728, cat:'TESTSITE', name:'Mururoa Atoll',               country:'France',
      warheads:'193 tests 1966–1996', status:'Inactive (CTBT)',
      notes:'Tuamotu Archipelago, French Polynesia. France conducted 193 nuclear tests 1966–1996. 41 atmospheric, 147 underground. Significant atoll subsidence.' },
    { lat:-30.1773, lng:131.5986,  cat:'TESTSITE', name:'Maralinga Test Site',         country:'Australia',
      warheads:'7 UK major tests 1956–1957', status:'Remediated',
      notes:'South Australia. UK conducted 7 nuclear tests and numerous minor trials. Indigenous Anangu land contaminated. Remediated 1990s–2000s. Legacy contamination persists.' },
    { lat:41.2981,  lng:129.0893,  cat:'TESTSITE', name:'Punggye-ri Test Site',        country:'DPRK',
      warheads:'6 tests 2006–2017', status:'Partially collapsed/inactive',
      notes:'North Hamgyong Province. Six North Korean nuclear tests 2006–2017. Test 6 (Sept 2017) estimated 140–250 kt. Mount Mantap partially collapsed. "Demolished" 2018 but OSINT shows activity.' },
    { lat:27.0565,  lng:71.7341,   cat:'TESTSITE', name:'Pokhran Test Range',          country:'India',
      warheads:'3 tests 1974, 5 tests 1998', status:'Inactive',
      notes:'Rajasthan Desert. Smiling Buddha 1974 (first test). Operation Shakti 1998 (5 tests). Triggered US/international sanctions. India declared NFU policy after 1998.' },
    { lat:29.1058,  lng:64.8987,   cat:'TESTSITE', name:'Chagai Hills Test Site',      country:'Pakistan',
      warheads:'6 tests 1998', status:'Inactive',
      notes:'Chagai District, Balochistan. Pakistan conducted 6 tests (Chagai-I and II) May 1998. Direct response to India Shakti tests. Turned mountain visibly white from heat.' },
    { lat:26.3283,  lng:0.0969,    cat:'TESTSITE', name:'Ekker/Reggane Test Site',     country:'Algeria',
      warheads:'17 French tests 1960–1966', status:'Abandoned',
      notes:'Saharan Algeria. France conducted 4 atmospheric (Reggane) and 13 underground (In Ekker/Ekker) tests 1960–1966. Pre-independence Algeria. Contamination unresolved.' },
  ];

  // ── Warhead Storage ───────────────────────────────────────────────────────
  const STORAGE = [
    { lat:34.9483,  lng:-106.5486, cat:'STORAGE', name:'Kirtland Underground Munitions Storage', country:'USA',
      warheads:'~2,500 warheads (est.)', status:'Active',
      notes:'Kirtland AFB, Albuquerque NM. KUMSC — largest US nuclear weapons storage facility. B61, W80, W87 warheads. FAS 2021 estimate ~2,500 stored.' },
    { lat:36.2361,  lng:-115.0342, cat:'STORAGE', name:'Nellis AFB Weapons Storage',   country:'USA',
      warheads:'Classified', status:'Active',
      notes:'Nellis AFB, Nevada. Underground weapons storage area. Adjacent to TTR and NNSS. B61-12 and cruise missile warheads.' },
    { lat:32.5017,  lng:-93.6625,  cat:'STORAGE', name:'Barksdale AFB Weapons Storage', country:'USA',
      warheads:'B61 / W80 cruise', status:'Active',
      notes:'Barksdale AFB, Louisiana. 2nd Bomb Wing (B-52H). Nuclear weapons storage for bomber-delivered B61s and W80-1 cruise missile warheads.' },
    { lat:38.7228,  lng:-93.5489,  cat:'STORAGE', name:'Whiteman AFB Weapons Storage', country:'USA',
      warheads:'B61-12 / B83-1', status:'Active',
      notes:'Whiteman AFB, Missouri. 509th Bomb Wing (B-2 Spirit). B61-12 gravity bombs and B83-1 stored. B83-1 retirement delayed by NNSA.' },
    { lat:55.9876,  lng:-4.8747,   cat:'STORAGE', name:'RNAD Coulport — Trident Warheads', country:'UK',
      warheads:'~225 UK warheads total', status:'Active',
      notes:'Coulport, Loch Long, Scotland. Royal Navy Armaments Depot. Storage and loading of Trident II D5 missiles and UK warheads for Vanguard-class SSBNs.' },
    { lat:55.7600,  lng:60.7000,   cat:'STORAGE', name:'Ozersk (Chelyabinsk-65)',       country:'Russia',
      warheads:'Weapons-grade Pu storage', status:'Active',
      notes:'Ozersk, Chelyabinsk Oblast. Mayak Production Association. Weapons-grade plutonium storage and reprocessing. Site of 1957 Kyshtym nuclear disaster.' },
    { lat:56.2500,  lng:93.5300,   cat:'STORAGE', name:'Zheleznogorsk (Krasnoyarsk-26)', country:'Russia',
      warheads:'HEU/Pu storage', status:'Active',
      notes:'Zheleznogorsk, Krasnoyarsk Krai. Mining Chemical Combine. HEU and plutonium storage. Underground reactor (closed 2010). Spent fuel reprocessing.' },
  ];

  // ── All sites combined ────────────────────────────────────────────────────
  const ALL_SITES = [
    ...SILOS,
    ...SSBNS,
    ...LABS,
    ...TACTICAL,
    ...TESTSITES,
    ...STORAGE,
  ];

  // ── SIPRI 2024 warhead totals ─────────────────────────────────────────────
  const COUNTRY_TOTALS = [
    { country:'Russia',    total:5889, flag:'🇷🇺' },
    { country:'USA',       total:5374, flag:'🇺🇸' },
    { country:'China',     total:500,  flag:'🇨🇳' },
    { country:'France',    total:290,  flag:'🇫🇷' },
    { country:'UK',        total:225,  flag:'🇬🇧' },
    { country:'Pakistan',  total:170,  flag:'🇵🇰' },
    { country:'India',     total:172,  flag:'🇮🇳' },
    { country:'Israel',    total:90,   flag:'🇮🇱' },
    { country:'DPRK',      total:50,   flag:'🇰🇵' },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  function _render() {
    if (!map) return;
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    ALL_SITES.forEach(s => {
      const cfg = CAT[s.cat] || CAT.STORAGE;
      const icon = L.divIcon({
        html: `<div class="nuc-marker" style="color:${cfg.color};border-color:${cfg.color};background:${cfg.color}18">${cfg.icon}</div>`,
        className: '', iconSize: [22, 22], iconAnchor: [11, 11],
      });
      const pop = `<div class="nuc-popup" style="border-left:2px solid ${cfg.color}">
        <div class="nuc-hdr" style="color:${cfg.color}">${s.name}</div>
        <div class="nuc-badge" style="background:${cfg.color}22;color:${cfg.color};border:1px solid ${cfg.color}44">${cfg.label} · ${s.country}</div>
        <div class="nuc-row"><span class="nuc-lbl">WARHEADS</span> ${s.warheads}</div>
        <div class="nuc-row"><span class="nuc-lbl">STATUS</span> ${s.status}</div>
        <div class="nuc-row"><span class="nuc-lbl">NOTES</span> ${s.notes}</div>
        <div class="nuc-src">Source: SIPRI 2024 · FAS Nuclear Notebook · OSINT</div>
      </div>`;
      const mk = L.marker([s.lat, s.lng], { icon, zIndexOffset: cfg.z || 800 })
        .bindPopup(pop, { className: 'leaflet-popup-dark', maxWidth: 320 });
      mk.addTo(map);
      markers.push(mk);
    });
  }

  function _injectCSS() {
    if (document.getElementById('nuc-css')) return;
    const s = document.createElement('style');
    s.id = 'nuc-css';
    s.textContent = `
      .nuc-marker{width:22px;height:22px;border-radius:4px;border:2px solid;
        display:flex;align-items:center;justify-content:center;font-size:11px;
        cursor:pointer;transition:transform .2s;animation:nuc-pulse 2s ease-in-out infinite}
      .nuc-marker:hover{transform:scale(1.5)}
      @keyframes nuc-pulse{
        0%,100%{box-shadow:0 0 6px currentColor}
        50%{box-shadow:0 0 18px currentColor,0 0 30px currentColor}
      }
      .nuc-popup{min-width:260px;max-width:300px;font-family:'Courier New',monospace;padding:2px}
      .nuc-hdr{font-size:9.5px;font-weight:700;margin-bottom:5px}
      .nuc-badge{font-size:6.5px;font-weight:700;padding:2px 6px;border-radius:2px;
        display:inline-block;margin-bottom:5px;letter-spacing:.5px}
      .nuc-row{font-size:7.5px;color:#c8dff0;margin:2px 0;line-height:1.4}
      .nuc-lbl{color:#3d5a78;display:inline-block;width:55px;font-size:7px;letter-spacing:.3px}
      .nuc-src{font-size:6.5px;color:#3d5a78;margin-top:6px;border-top:1px solid #0d1e2e;padding-top:4px}
      .nuc-stat-row{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #0d1e2e}
      .nuc-stat-row:last-child{border-bottom:none}
      .nuc-stat-info{flex:1}
      .nuc-stat-name{font-size:7.5px;font-weight:700;letter-spacing:.3px}
      .nuc-stat-count{font-size:6.5px;color:#3d5a78}
      .nuc-country-table{width:100%;border-collapse:collapse;margin-top:6px}
      .nuc-country-table th{font-size:6px;color:#3d5a78;letter-spacing:.4px;text-align:left;
        padding:2px 3px;border-bottom:1px solid #0d1e2e}
      .nuc-country-table td{font-size:7px;color:#c8dff0;padding:2px 3px}
      .nuc-country-table tr:nth-child(even) td{background:#0d1e2e44}
      .nuc-section-hdr{font-size:6.5px;color:#3d5a78;letter-spacing:.5px;
        margin:8px 0 3px;border-bottom:1px solid #0d1e2e;padding-bottom:2px}
    `;
    document.head.appendChild(s);
  }

  // ── Left panel ────────────────────────────────────────────────────────────
  function _updatePanel() {
    const el = document.getElementById('nuc-panel-body');
    if (!el) return;

    const counts = {};
    ALL_SITES.forEach(s => { counts[s.cat] = (counts[s.cat] || 0) + 1; });

    const catRows = Object.entries(CAT).map(([key, cfg]) => {
      const n = counts[key] || 0;
      return `<div class="nuc-stat-row">
        <span style="font-size:13px">${cfg.icon}</span>
        <div class="nuc-stat-info">
          <div class="nuc-stat-name" style="color:${cfg.color}">${cfg.label}</div>
          <div class="nuc-stat-count">${n} location${n !== 1 ? 's' : ''}</div>
        </div>
      </div>`;
    }).join('');

    const countryRows = COUNTRY_TOTALS.map(c =>
      `<tr>
        <td>${c.flag} ${c.country}</td>
        <td style="text-align:right;font-weight:700;color:#ff2222">${c.total.toLocaleString()}</td>
      </tr>`
    ).join('');

    const grandTotal = COUNTRY_TOTALS.reduce((a, c) => a + c.total, 0);

    el.innerHTML = `
      ${catRows}
      <div class="nuc-section-hdr">SIPRI 2024 — WARHEAD TOTALS</div>
      <table class="nuc-country-table">
        <thead>
          <tr><th>COUNTRY</th><th style="text-align:right">WARHEADS</th></tr>
        </thead>
        <tbody>
          ${countryRows}
          <tr>
            <td style="font-weight:700;color:#c8dff0">GLOBAL TOTAL</td>
            <td style="text-align:right;font-weight:700;color:#ff2222">${grandTotal.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  return {
    init(m)       { map = m; _injectCSS(); },
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
    getData()     { return ALL_SITES; },
  };
})();
