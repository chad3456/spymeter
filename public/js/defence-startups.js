/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — Defence Tech Startups & Hubs Layer
   Data: public filings · press releases · DoD contracts · OSINT
   Covers: AI/autonomy · drones/UAS · space/ISR · counter-UAS · robotics ·
           directed energy · cyber/intel · hypersonic · loitering munitions
   Companies: 62 startups + established innovators across USA, Israel, Turkey,
              Germany, UK, France, Australia, India, Portugal, Singapore
════════════════════════════════════════════════════════════════════════════ */
const DEFENCE_STARTUPS = (() => {
  let map     = null;
  let enabled = false;
  let markers = [];
  let _catFilter = 'ALL';

  // ── Category config ────────────────────────────────────────────────────────
  const CAT = {
    AI:       { color:'#00ccff', icon:'🧠', label:'AI / Data Intelligence'    },
    UAS:      { color:'#ff9900', icon:'✈',  label:'Drones / UAS'              },
    SPACE:    { color:'#cc44ff', icon:'🛰',  label:'Space / Satellite ISR'     },
    CUAS:     { color:'#ff4444', icon:'🎯', label:'Counter-UAS'               },
    ROBOT:    { color:'#4488ff', icon:'🤖', label:'Robotics / UGV / USV'      },
    ENERGY:   { color:'#ffff44', icon:'⚡', label:'Directed Energy'           },
    CYBER:    { color:'#ff44ff', icon:'🛡',  label:'Cyber / SIGINT / OSINT'   },
    HYPER:    { color:'#ff2222', icon:'🚀', label:'Hypersonic / High-Speed'   },
    MUNITION: { color:'#ff6600', icon:'💥', label:'Loitering Munitions'       },
    SPACE_DA: { color:'#8844ff', icon:'🔭', label:'Space Domain Awareness'    },
  };

  // ── Country flags ──────────────────────────────────────────────────────────
  const FLAGS = {
    USA:'🇺🇸',GBR:'🇬🇧',AUS:'🇦🇺',CAN:'🇨🇦',DEU:'🇩🇪',FRA:'🇫🇷',ISR:'🇮🇱',
    UKR:'🇺🇦',IND:'🇮🇳',JPN:'🇯🇵',KOR:'🇰🇷',SGP:'🇸🇬',ARE:'🇦🇪',POL:'🇵🇱',
    TUR:'🇹🇷',NZL:'🇳🇿',NOR:'🇳🇴',SWE:'🇸🇪',ITA:'🇮🇹',NLD:'🇳🇱',BRA:'🇧🇷',
    SAU:'🇸🇦',QAT:'🇶🇦',AZE:'🇦🇿',MAR:'🇲🇦',GRC:'🇬🇷',CZE:'🇨🇿',HUN:'🇭🇺',
    ROU:'🇷🇴',LTU:'🇱🇹',LVA:'🇱🇻',EST:'🇪🇪',PHL:'🇵🇭',COL:'🇨🇴',IDN:'🇮🇩',
    BGR:'🇧🇬',SRB:'🇷🇸',ALB:'🇦🇱',KAZ:'🇰🇿',ETH:'🇪🇹',SOM:'🇸🇴',LBY:'🇱🇾',
    DJI:'🇩🇯',RWA:'🇷🇼',SEN:'🇸🇳',TGO:'🇹🇬',PAK:'🇵🇰',NGA:'🇳🇬',SDN:'🇸🇩',
    PRT:'🇵🇹',ESP:'🇪🇸',BEL:'🇧🇪',DNK:'🇩🇰',FIN:'🇫🇮',CHE:'🇨🇭',MYS:'🇲🇾',
    THA:'🇹🇭',ARM:'🇦🇲',VNM:'🇻🇳',MDG:'🇲🇬',NER:'🇳🇪',GHA:'🇬🇭',TUN:'🇹🇳',
    MDA:'🇲🇩',GEO:'🇬🇪',MKD:'🇲🇰',MNE:'🇲🇪',HRV:'🇭🇷',SVN:'🇸🇮',SVK:'🇸🇰',
    LUX:'🇱🇺',PER:'🇵🇪',MEX:'🇲🇽',CHL:'🇨🇱',ECU:'🇪🇨',ZAF:'🇿🇦',KEN:'🇰🇪',
  };

  // ── Company database ───────────────────────────────────────────────────────
  // { name, short, hq, hqCountry, lat, lng, founded, cat, status, valuation,
  //   what, products, partners, contracts, notes }
  const COMPANIES = [

    // ══════════════════════════════════════════════════════
    //  USA — AI / DATA INTELLIGENCE
    // ══════════════════════════════════════════════════════
    {
      name:'Palantir Technologies', short:'PLTR', hq:'Denver, CO', hqCountry:'USA',
      lat:39.7285, lng:-104.9881, founded:2003, cat:'AI',
      status:'Public (PLTR · ~$90B)', valuation:'$90B+',
      what:'AI-powered data analytics platforms for intelligence agencies and military. Gotham for defense/intel, AIP (Artificial Intelligence Platform) for battlefield AI decision-support.',
      products:['Gotham (military AI)','AIP (AI Platform)','Foundry','MetaConstellation','Warp Speed'],
      partners:['USA','GBR','AUS','CAN','DEU','FRA','JPN','UKR','ISR','NOR','GRC','POL','ARE','NLD','DNK'],
      contracts:'NSA, CIA, NGA, US Army, ICE, NHS UK, Ukraine Situation Room, NATO Allied Command',
      notes:'Co-founded by Peter Thiel and Alex Karp. One of biggest US defense AI contractors. $229M Army AI contract 2024.',
    },
    {
      name:'Shield AI', short:'SHLD', hq:'San Diego, CA', hqCountry:'USA',
      lat:32.7057, lng:-117.1560, founded:2015, cat:'AI',
      status:'Private ($2.8B valuation)', valuation:'$2.8B',
      what:'Hivemind AI autonomy platform that flies military aircraft without GPS, comms or human pilot. Currently powers F-16, Black Hawk, V-BAT drone, and MQ-25 tanker.',
      products:['Hivemind AI pilot','V-BAT drone','Nova-2 drone','AI wingman software'],
      partners:['USA','SGP','ARE','GBR','AUS'],
      contracts:'DARPA X-62A VISTA F-16 AI dogfight, UAE armed forces, Singapore Air Force, US Navy MQ-25',
      notes:'Demonstrated AI beating human F-16 pilot in 2024 DARPA ACE trials. Expanding to V-BAT wing of drones.',
    },
    {
      name:'Rebellion Defense', short:'RBLN', hq:'Washington, DC', hqCountry:'USA',
      lat:38.9072, lng:-77.0369, founded:2019, cat:'AI',
      status:'Private (undisclosed)', valuation:'undisclosed',
      what:'AI/ML software tools for Pentagon and allied DoDs. Mission AI for targeting, logistics planning, and sensor fusion. Rebuilding cold-war era defense software stack with modern AI.',
      products:['Rebellion Studio','Mission AI','Ground Control AI'],
      partners:['USA','GBR','AUS'],
      contracts:'US DoD, USAF, Australian Defence Force, UK MoD',
      notes:'Founded by ex-Googlers and defense officials. Backed by In-Q-Tel. NATO AI adoption partnerships.',
    },
    {
      name:'Vannevar Labs', short:'VNNV', hq:'Menlo Park, CA', hqCountry:'USA',
      lat:37.4530, lng:-122.1817, founded:2019, cat:'CYBER',
      status:'Private (undisclosed)', valuation:'undisclosed',
      what:'Vertex OSINT platform: AI-powered intelligence collection from open sources, dark web, social media, and foreign language signals. Deployed on classified DoD networks.',
      products:['Vertex OSINT Platform','Beacon signal intelligence'],
      partners:['USA','GBR','AUS','CAN','NZL'],
      contracts:'NRO, DIA, SOCOM, CIA, Five Eyes intelligence sharing',
      notes:'Named after Vannevar Bush (DARPA precursor). Cleared for Top Secret networks. Five Eyes access.',
    },
    {
      name:'Applied Intuition', short:'APLI', hq:'Mountain View, CA', hqCountry:'USA',
      lat:37.3861, lng:-122.0839, founded:2017, cat:'AI',
      status:'Private ($6B valuation)', valuation:'$6B',
      what:'AI simulation and testing platform for autonomous military ground vehicles. ATLAS program for US Army/USMC. Also dominant in commercial AV development for 19 of top 20 automakers.',
      products:['ROAD (military autonomy)','ATOM simulation','BASIS sensor emulation','AXIOM test platform'],
      partners:['USA','AUS','GBR'],
      contracts:'US Army NGCV (Next Gen Combat Vehicle), USMC autonomy program, AUKUS ground autonomy',
      notes:'Also serves Toyota, BMW, GM, Stellantis, Volvo. Defense division growing rapidly post-2022.',
    },
    {
      name:'Primer AI', short:'PRMR', hq:'San Francisco, CA', hqCountry:'USA',
      lat:37.7749, lng:-122.4000, founded:2015, cat:'AI',
      status:'Private ($200M+ raised)', valuation:'undisclosed',
      what:'NLP/AI engine that reads millions of documents and extracts structured intelligence summaries. Deployed on classified US government networks for intelligence analysis.',
      products:['Primer Command (AI OSINT)','Primer Find','Primer Analyze'],
      partners:['USA','GBR','AUS','CAN'],
      contracts:'DoD intelligence community, DHS, SOCOM, UK GCHQ-adjacent programs',
      notes:'Models run air-gapped on classified networks. Ingests 100M+ documents/day for DoD.',
    },
    {
      name:'Govini', short:'GVNI', hq:'Arlington, VA', hqCountry:'USA',
      lat:38.8799, lng:-77.1067, founded:2011, cat:'AI',
      status:'Private (undisclosed)', valuation:'undisclosed',
      what:'AI analytics platform for DoD procurement and supply chain risk. Ark platform maps $800B DoD supply chain to flag China/adversary dependencies in defense contracts.',
      products:['Ark platform','Supply chain intelligence','AI acquisition analytics'],
      partners:['USA'],
      contracts:'OSD, DCSA, Air Force acquisition command, Army sustainment command',
      notes:'Critical tool for identifying PRC entities in Pentagon supply chain. NDAA Section 889 compliance.',
    },
    {
      name:'SparkCognition', short:'SPRK', hq:'Austin, TX', hqCountry:'USA',
      lat:30.2672, lng:-97.7431, founded:2013, cat:'AI',
      status:'Private ($235M raised)', valuation:'undisclosed',
      what:'AI for military aviation predictive maintenance, counter-drone swarms (DarwinAI), and infrastructure protection. SparkPredict for aircraft engine failure prediction.',
      products:['SparkPredict','DeepArmor','Darwin AI (c-UAS)','DarwinEdge'],
      partners:['USA','ARE','SGP'],
      contracts:'US Air Force (F-35 maintenance AI), Navy, Boeing partnership, UAE Air Force',
      notes:'First private AI company to get DoD AI clearance. Used by Lockheed, Boeing for predictive maintenance.',
    },

    // ══════════════════════════════════════════════════════
    //  USA — DRONES / UAS
    // ══════════════════════════════════════════════════════
    {
      name:'Anduril Industries', short:'ANDR', hq:'Costa Mesa, CA', hqCountry:'USA',
      lat:33.6694, lng:-117.8231, founded:2017, cat:'UAS',
      status:'Private ($14B valuation)', valuation:'$14B',
      what:'Autonomous defense systems: Sentry Tower (AI border surveillance), Ghost UAS (long-endurance drone), Roadrunner jet-powered interceptor, Fury CCA, Anvil counter-drone, DIVE-LD UUV, Lattice OS command platform.',
      products:['Lattice OS','Ghost UAS','Fury CCA','Roadrunner-M','Anvil c-UAS','Sentry Tower','DIVE-LD UUV'],
      partners:['USA','GBR','AUS','ARE'],
      contracts:'CBP $250M Sentry border contract, AUKUS autonomous systems, UAE Sentry deployment, Ukraine Ghost-X aid',
      notes:'Founded by Palmer Luckey (Oculus). Arsenal-1 manufacturing campus in Palm Bay FL ($1B+). AUKUS pillar II lead.',
    },
    {
      name:'AeroVironment', short:'AVAV', hq:'Arlington, VA', hqCountry:'USA',
      lat:38.8799, lng:-77.1060, founded:1971, cat:'MUNITION',
      status:'Public (AVAV · ~$4.5B)', valuation:'$4.5B',
      what:'Switchblade 300/600 loitering munitions proven in Ukraine. Puma 3 AE, JUMP 20 VTOL, Raven B, Wasp AE small UAS. ALTIUS-600M loitering munition for Army.',
      products:['Switchblade 300','Switchblade 600','Puma 3 AE','JUMP 20','Raven B','ALTIUS-600M','Blackwing sub-launched'],
      partners:['USA','UKR','AUS','GBR','FRA','DNK','KOR','JPN','NOR','ARE','POL','LTU'],
      contracts:'$990M US Army JUMP 20 contract, Ukraine Switchblade 600 $45M, Allied rapid capability contracts',
      notes:'Switchblade 300 has destroyed hundreds of Russian armored vehicles. Most battle-tested US loitering munition.',
    },
    {
      name:'Kratos Defense', short:'KTOS', hq:'San Diego, CA', hqCountry:'USA',
      lat:32.9155, lng:-117.1520, founded:1994, cat:'UAS',
      status:'Public (KTOS · ~$2.2B)', valuation:'$2.2B',
      what:'XQ-58A Valkyrie low-cost Collaborative Combat Aircraft (CCA), UTAP-22 Mako UCAV, target drone services. Affordable attritable platforms for large-scale autonomous air combat.',
      products:['XQ-58A Valkyrie','UTAP-22 Mako','MAKO target drone','Firejet','Zeus solid rocket'],
      partners:['USA','AUS'],
      contracts:'USAF CCA program, DARPA LCAAT, Australia loyal wingman evaluation, Army target drone IDIQ',
      notes:'XQ-58A flew with F-22 and tested ALTIUS-600 drone deployment. Key player in USAF Ghost Fleet concept.',
    },
    {
      name:'Skydio', short:'SKDO', hq:'San Mateo, CA', hqCountry:'USA',
      lat:37.5630, lng:-122.3255, founded:2014, cat:'UAS',
      status:'Private ($2.2B valuation)', valuation:'$2.2B',
      what:'AI-autonomous drones with best-in-class obstacle avoidance. X10D and X10 Defense cleared for DoD use. No DJI components. Autonomous inspection, ISR, mapping.',
      products:['X10D Defense','X10 Enterprise','Skydio 2+','Dock (autonomous base)','Skydio 3D Scan'],
      partners:['USA','AUS','JPN','SAU','ARE','BEL','KOR','UKR'],
      contracts:'DoD contract 2022, Ukraine drone donations/sales, Japan Ground Self-Defense Force, 1,500+ police agencies',
      notes:'Led US "Blue UAS" cleared drone list after DJI ban. $115M USAF/Army contract 2024.',
    },
    {
      name:'Elroy Air', short:'ELRY', hq:'San Francisco, CA', hqCountry:'USA',
      lat:37.7849, lng:-122.4094, founded:2016, cat:'UAS',
      status:'Private ($100M+ raised)', valuation:'undisclosed',
      what:'Chaparral autonomous VTOL cargo drone — 300lb payload, 300-mile range, fully autonomous loading/unloading. Targets forward logistics resupply without landing zones.',
      products:['Chaparral C1 VTOL cargo drone'],
      partners:['USA'],
      contracts:'US Army Project Convergence, AFWERX Agility Prime, USMC logistics pilot',
      notes:'Partnered with FedEx for commercial operations. Defense use case: resupply cut-off troops without crewed aircraft.',
    },
    {
      name:'Joby Aviation', short:'JOBY', hq:'Santa Cruz, CA', hqCountry:'USA',
      lat:37.0054, lng:-122.0077, founded:2009, cat:'UAS',
      status:'Public (JOBY · ~$4B)', valuation:'$4B',
      what:'Electric VTOL aircraft (5-seat, 150mph, 150mi range) for urban air mobility and military intra-theater logistics. USAF Agility Prime aircraft.',
      products:['Joby S4 eVTOL'],
      partners:['USA'],
      contracts:'USAF Agility Prime $131M, NASA Urban Air Mobility, Delta Airlines commercial deal',
      notes:'Toyota invested $400M. First eVTOL to fly at Edwards AFB under DoD contract.',
    },
    {
      name:'Archer Aviation', short:'ACHR', hq:'San Jose, CA', hqCountry:'USA',
      lat:37.3382, lng:-121.8863, founded:2018, cat:'UAS',
      status:'Public (ACHR · ~$1B)', valuation:'$1B',
      what:'Midnight eVTOL for US Army intra-theater troop and cargo movement. 60mi range, 150mph. AFWERX Agility Prime contract for military rapid-response logistics.',
      products:['Midnight eVTOL'],
      partners:['USA'],
      contracts:'US Army ERMP contract, United Airlines 200-aircraft pre-order, Stellantis manufacturing deal',
      notes:'Backed by United Airlines and Stellantis. Army evaluating for forward-area resupply replacing UH-60 in some roles.',
    },

    // ══════════════════════════════════════════════════════
    //  USA — SPACE / SATELLITE ISR
    // ══════════════════════════════════════════════════════
    {
      name:'Planet Labs', short:'PL', hq:'San Francisco, CA', hqCountry:'USA',
      lat:37.7849, lng:-122.4194, founded:2010, cat:'SPACE',
      status:'Public (PL · ~$1B)', valuation:'$1B',
      what:'200+ Dove and SkySat satellites providing daily global Earth imaging. Pelican constellation adds 30cm resolution. Government customers use for target tracking, battle damage assessment.',
      products:['PlanetScope (3m daily)','SkySat (50cm rapid)','Pelican (30cm)','Planet Monitoring API'],
      partners:['USA','UKR','CAN','FRA','DEU','JPN','IND','ARE','AUS','GBR','KOR','POL'],
      contracts:'NGA commercial satellite imagery, Ukraine battlefield monitoring, NASA climate, DoD global cover',
      notes:'Ukraine used Planet imagery to confirm Russian armored column withdrawals. EU Copernicus partner.',
    },
    {
      name:'Capella Space', short:'CAPL', hq:'San Francisco, CA', hqCountry:'USA',
      lat:37.7749, lng:-122.4100, founded:2016, cat:'SPACE',
      status:'Private ($97M+ raised)', valuation:'undisclosed',
      what:'SAR (Synthetic Aperture Radar) satellites that image through clouds and darkness. 50cm resolution. Critical for all-weather tracking of military movements and maritime vessels.',
      products:['Capella SAR constellation (10 sats)','Spot mode imaging','Sliding Spotlight'],
      partners:['USA','KOR','ARE','AUS','GBR','JPN'],
      contracts:'NRO, NGA, SOCOM, UAE military SAR, South Korea NIS (intelligence service)',
      notes:'Only US commercial SAR at 50cm. Detects ships in Arctic/clouds impossible for optical. Used for Iran monitoring.',
    },
    {
      name:'Maxar Intelligence', short:'MAXR', hq:'Westminster, CO', hqCountry:'USA',
      lat:39.8370, lng:-105.0372, founded:1994, cat:'SPACE',
      status:'Private (Advent Int\'l $6.4B acq)', valuation:'$6.4B',
      what:'WorldView Legion constellation (30cm resolution). Premier commercial satellite imagery provider. Supplies NGA with classified-quality imagery under EnhancedView contract.',
      products:['WorldView-3/4 (31cm)','WorldView Legion','GeoEye-1','Maxar ARD analytics'],
      partners:['USA','CAN','GBR','AUS','JPN','NATO','UKR','ISR'],
      contracts:'NGA EnhancedView $300M/yr, US Army mapping, Ukraine mapping support, NATO Imagery ISR',
      notes:'Provided first public images confirming Russian military buildup near Ukraine in early 2022.',
    },
    {
      name:'HawkEye 360', short:'HE360', hq:'Herndon, VA', hqCountry:'USA',
      lat:38.9696, lng:-77.3861, founded:2015, cat:'SPACE_DA',
      status:'Private (undisclosed)', valuation:'undisclosed',
      what:'RF signal detection and geolocation via satellite cluster. Detects ship AIS spoofing, GPS jammers, illicit fishing, drone swarms, and radar emissions from space.',
      products:['HawkEye RF constellation (20 sats)','Maritime domain awareness','RF geolocation API'],
      partners:['USA','UKR','GBR','CAN','AUS','NZL','JPN','KOR'],
      contracts:'NGA, Coast Guard, DoD, Ukraine dark ship monitoring, Five Eyes RF intelligence sharing',
      notes:'Detected Iranian vessels illegally transferring oil and GPS jammers over Baltic in near-real-time.',
    },
    {
      name:'Capella · BlackSky · Umbra hub', short:'BKSY', hq:'Herndon, VA', hqCountry:'USA',
      lat:38.9546, lng:-77.3711, founded:2014, cat:'SPACE',
      status:'Public (BKSY · ~$200M)', valuation:'$200M',
      what:'BlackSky AI-tasked Earth observation: 1m resolution Gen-3 satellites plus AI analytics (Spectra AI) for time-critical intelligence. Rapid revisit for hotspot monitoring.',
      products:['BlackSky Gen-3 satellites','Spectra AI analytics','Rapid Revisit service'],
      partners:['USA','UKR','AUS','GBR','JPN'],
      contracts:'NGA, DoD, DHS, Ukraine battlefield imagery 2022-present, Japan JAXA partnership',
      notes:'Delivers imagery within 90 min of order. AI detects vehicles, ships, and facility changes automatically.',
    },
    {
      name:'Umbra Space', short:'UMBR', hq:'Santa Barbara, CA', hqCountry:'USA',
      lat:34.4208, lng:-119.6982, founded:2015, cat:'SPACE',
      status:'Private ($75M+ raised)', valuation:'undisclosed',
      what:'Highest-resolution commercial SAR satellites — 16cm SpotLight mode (finer than some classified systems). Open Data Program shares unclassified imagery widely.',
      products:['Umbra SAR constellation','SpotLight mode (16cm)','Open SAR Library'],
      partners:['USA','AUS','GBR'],
      contracts:'NRO, NGA, Palantir integration, allied intelligence community',
      notes:'16cm SAR can resolve individual soldiers and vehicle models. Publicly released Ukraine SAR imagery.',
    },
    {
      name:'True Anomaly', short:'TRAN', hq:'Denver, CO', hqCountry:'USA',
      lat:39.7385, lng:-104.9781, founded:2022, cat:'SPACE_DA',
      status:'Private ($100M+ raised)', valuation:'undisclosed',
      what:'Jackal autonomous spacecraft for space domain awareness — on-orbit inspection, proximity operations, and potential offensive/defensive space capabilities.',
      products:['Jackal spacecraft','Mosaic SDA software','On-orbit proximity ops'],
      partners:['USA'],
      contracts:'US Space Force SDA contract, AFRL on-orbit servicing, DARPA RSGS adjacent',
      notes:'Founded by ex-SpaceX engineers. Jackal-1/2 launched 2024. Evaluating as potential satellite-disabler/defender.',
    },
    {
      name:'Slingshot Aerospace', short:'SLNG', hq:'El Segundo, CA', hqCountry:'USA',
      lat:33.9192, lng:-118.4100, founded:2017, cat:'SPACE_DA',
      status:'Private (undisclosed)', valuation:'undisclosed',
      what:'Slingshot Beacon space traffic management, Global Sensor Network for tracking objects in all orbital regimes. AI collision avoidance and conjunction alerts.',
      products:['Slingshot Beacon','Global Sensor Network','Orbital Dashboard'],
      partners:['USA','GBR','JPN','AUS'],
      contracts:'US Space Force SSA contract, JAXA space traffic management, UK Space Agency partnership',
      notes:'Tracks 27,000+ objects. Key role in Space Force orbital warfare awareness capability.',
    },
    {
      name:'Rocket Lab USA', short:'RKLB', hq:'Long Beach, CA', hqCountry:'USA',
      lat:33.7701, lng:-118.1937, founded:2006, cat:'SPACE',
      status:'Public (RKLB · ~$2.5B)', valuation:'$2.5B',
      what:'Electron small launch vehicle (30 launches, 99% success), Photon satellite bus, Neutron medium launch in development. Dedicated rapid-launch DoD satellite deployer.',
      products:['Electron rocket','Photon satellite bus','Neutron rocket (dev)','ESCAPADE Mars mission'],
      partners:['USA','NZL','AUS','GBR','JPN','KOR'],
      contracts:'NRO $143M rapid-launch contract, DARPA LLNL, Space Force NSSL, NASA Mars mission',
      notes:'Launches from NZ (Mahia) and Virginia (MARS). Designed for rapid 72-hr responsive launch for DoD.',
    },
    {
      name:'Spire Global', short:'SPIR', hq:'San Francisco, CA', hqCountry:'USA',
      lat:37.7749, lng:-122.3994, founded:2012, cat:'SPACE',
      status:'Public (SPIR · ~$400M)', valuation:'$400M',
      what:'100+ satellite constellation for weather (GNSS-RO), maritime AIS tracking, aviation surveillance, and SIGINT-adjacent RF monitoring. Space-as-a-Service model.',
      products:['Spire SENSE (weather)','Spire MARITIME (AIS)','Spire AVIATION (ADS-B)','Spire STRATOS (RF)'],
      partners:['USA','GBR','AUS','CAN','JPN','NZL','DEU','FRA'],
      contracts:'NOAA COSMIC-2 data buy, US Space Force weather, ESA partnership, NATO maritime domain awareness',
      notes:'Tracks 200,000+ vessels and 12,000+ aircraft daily from space. Used by US Navy for Indo-Pacific MDA.',
    },

    // ══════════════════════════════════════════════════════
    //  USA — COUNTER-UAS
    // ══════════════════════════════════════════════════════
    {
      name:'Dedrone (by Axon)', short:'DDRN', hq:'San Francisco, CA', hqCountry:'USA',
      lat:37.7749, lng:-122.4094, founded:2014, cat:'CUAS',
      status:'Acquired by Axon 2022', valuation:'undisclosed',
      what:'DroneTracker: AI software + sensor hardware to detect, identify and track rogue drones. Deployed at airports, military bases, prisons, borders, and major events worldwide.',
      products:['DroneTracker 4','DFP RF sensors','DedroneDefend','Drone detection API'],
      partners:['USA','DEU','GBR','ARE','SAU','KOR','NLD','AUS','POL','CHE'],
      contracts:'US Army Fort Knox, Heathrow Airport, Super Bowl, NATO summit security, UAE border',
      notes:'Founded in Germany (Kassel). Detects 250+ drone types. Deployed at G7/G20 summits for world leader protection.',
    },
    {
      name:'Fortem Technologies', short:'FRTM', hq:'Pleasant Grove, UT', hqCountry:'USA',
      lat:40.3636, lng:-111.7385, founded:2016, cat:'CUAS',
      status:'Private (Boeing / Shield AI backed)', valuation:'undisclosed',
      what:'DroneHunter autonomous counter-UAS drone fires nets to physically capture rogue drones. TrueView 3D radar detects targets at 2km. SkyDome command software.',
      products:['DroneHunter F700','TrueView 3D radar','SkyDome C2 software'],
      partners:['USA','GBR','ISR','AUS','ARE','NOR','DNK'],
      contracts:'US DoD c-UAS programs, UK government, Israeli Air Force evaluation, Nordic security contracts',
      notes:'Only kinetic-capture counter-drone at scale. UK deployed at major events. Captured 650+ drones to date.',
    },
    {
      name:'Epirus', short:'EPRS', hq:'El Segundo, CA', hqCountry:'USA',
      lat:33.9192, lng:-118.4165, founded:2018, cat:'ENERGY',
      status:'Private ($1.6B valuation)', valuation:'$1.6B',
      what:'LEONIDAS high-power microwave (HPM) directed energy weapon that fries drone electronics with speed-of-light burst. Defeats swarms simultaneously. Truck-mounted and pod-mounted variants.',
      products:['LEONIDAS (vehicle-mounted HPM)','LEONIDAS Pod (aircraft-carried)','Leonidas Tower'],
      partners:['USA'],
      contracts:'US Army c-UAS requirement, USMC INDOPACOM deployment, USAF base defense eval',
      notes:'LEONIDAS defeated a swarm of 66 drones in 2023 DARPA test. $66M Army contract 2023. Speed-of-light engagement.',
    },

    // ══════════════════════════════════════════════════════
    //  USA — ROBOTICS / UGV / USV
    // ══════════════════════════════════════════════════════
    {
      name:'Ghost Robotics', short:'GSTR', hq:'Philadelphia, PA', hqCountry:'USA',
      lat:39.9526, lng:-75.1652, founded:2015, cat:'ROBOT',
      status:'Private (Series C)', valuation:'undisclosed',
      what:'Vision 60 quadruped robot (Q-UGV) for military patrol, ISR, CBRN sensing at perimeter and forward bases. Carries SPUR (Special Purpose Unmanned Rifle) SWORD weapon system.',
      products:['Vision 60 Q-UGV','Spirit 40','SPUR SWORD (armed variant)'],
      partners:['USA','GBR','AUS','SGP','ARE'],
      contracts:'US Air Force base perimeter security, AFSOC, DHS CBP, Singapore SAF, UK MoD trials',
      notes:'Vision 60 has 4-hour endurance, carries 10kg payload. SPUR armed variant tested at Tyndall AFB 2021.',
    },
    {
      name:'Saildrone', short:'SAIL', hq:'Alameda, CA', hqCountry:'USA',
      lat:37.7749, lng:-122.2712, founded:2012, cat:'ROBOT',
      status:'Private (Series C · $300M raised)', valuation:'undisclosed',
      what:'Wind-powered autonomous surface drones for ocean data collection, maritime domain awareness, and undersea acoustic sensing. Saildrone Voyager and Surveyor USVs.',
      products:['Saildrone Explorer','Saildrone Voyager','Saildrone Surveyor (large USV)'],
      partners:['USA','GBR','AUS','NZL','NOR'],
      contracts:'US Navy MDUSV program, NOAA weather monitoring, Coast Guard drug interdiction, UK Royal Navy pilot',
      notes:'Voyager USV circumnavigated Antarctica. Navy using for persistent undersea acoustic sensing near Russia/China.',
    },
    {
      name:'Gecko Robotics', short:'GKRO', hq:'Pittsburgh, PA', hqCountry:'USA',
      lat:40.4406, lng:-79.9959, founded:2013, cat:'ROBOT',
      status:'Private (Series C · $150M raised)', valuation:'undisclosed',
      what:'Wall-climbing inspection robots for Navy ship hulls, nuclear power plants, oil refineries, and aircraft carrier flight decks. Canopy AI software predicts infrastructure failures.',
      products:['Toka ship inspection robot','Scout pipeline robot','Canopy AI software'],
      partners:['USA','GBR','AUS'],
      contracts:'US Navy ship hull inspection at 40+ shipyards, DoE nuclear plants, Army Corps, UK Royal Navy eval',
      notes:'Saves Navy $2B+ annually vs dry-dock inspections. Detects corrosion and cracks missed by human divers.',
    },
    {
      name:'Sarcos Technology', short:'SRCS', hq:'Salt Lake City, UT', hqCountry:'USA',
      lat:40.7608, lng:-111.8910, founded:2000, cat:'ROBOT',
      status:'Private (formerly ROBO on Nasdaq)', valuation:'undisclosed',
      what:'Guardian XO full-body industrial exoskeleton allowing soldiers to lift 200lb as easily as lifting 10lb. Guardian XT dual-arm robotic system for hazmat and bomb disposal.',
      products:['Guardian XO exoskeleton','Guardian XT robot arms','Guardian S inspection bot'],
      partners:['USA'],
      contracts:'US Army Aberdeen Proving Ground eval, USMC logistics, Navy shipyard maintenance',
      notes:'XO suit: 8-hour battery, lifts 90kg effortlessly. USMC interested for amphibious logistics on beaches.',
    },
    {
      name:'Boston Dynamics', short:'BSTD', hq:'Waltham, MA', hqCountry:'USA',
      lat:42.3800, lng:-71.2350, founded:1992, cat:'ROBOT',
      status:'Private (Hyundai 60% ownership)', valuation:'$1.1B',
      what:'Spot quadruped robot for military ISR, CBRN sensing, perimeter patrol. Atlas humanoid (2024) for industrial logistics. Demonstrated autonomous door opening and stair climbing.',
      products:['Spot quadruped','Atlas humanoid','Stretch warehouse robot'],
      partners:['USA','GBR','AUS','KOR','DEU','FRA','SGP','JPN'],
      contracts:'US Army Spot evaluation, DoE nuclear site inspection, Massachusetts State Police, NATO militaries',
      notes:'Hyundai acquired for $1.1B in 2021. Spot deployed at Chernobyl for radiation mapping and South Korea DMZ.',
    },

    // ══════════════════════════════════════════════════════
    //  USA — HYPERSONIC / HIGH-SPEED
    // ══════════════════════════════════════════════════════
    {
      name:'Hermeus', short:'HRMS', hq:'Atlanta, GA', hqCountry:'USA',
      lat:33.7490, lng:-84.3880, founded:2018, cat:'HYPER',
      status:'Private ($100M+ raised)', valuation:'undisclosed',
      what:'Mach 5 aircraft using turbine-based combined cycle (TBCC) engine. Quarterhorse demonstrator for USAF. Halcyon passenger aircraft concept. DARPA / AFWERX contracts.',
      products:['Quarterhorse (Mach 5 unmanned demo)','Halcyon (Mach 5 passenger)','Chimera engine'],
      partners:['USA'],
      contracts:'USAF Vanguard program, DARPA Aeronautics, AFWERX, NASA hypersonic partnership',
      notes:'Chimera engine switches between turbojet (subsonic) and ramjet (hypersonic) modes. US alternative to Chinese DF-17.',
    },
    {
      name:'X-Bow Launch Systems', short:'XBOW', hq:'Albuquerque, NM', hqCountry:'USA',
      lat:35.0844, lng:-106.6504, founded:2016, cat:'MUNITION',
      status:'Private (DARPA SBIR funded)', valuation:'undisclosed',
      what:'Additive manufacturing of solid rocket propellant grains. BOLT and FLITE rocket motors produced via 3D printing — dramatically reducing cost and lead time for missiles and launch vehicles.',
      products:['BOLT solid rocket motor','FLITE upper-stage motor','AM propellant grains'],
      partners:['USA'],
      contracts:'DARPA TTO, Air Force SBIR, Army PEO Missiles contracts for low-cost missile motors',
      notes:'3D-printed rocket propellant reduces manufacturing time from months to days. Critical for surge production.',
    },

    // ══════════════════════════════════════════════════════
    //  USA — CYBER / SIGINT / OSINT
    // ══════════════════════════════════════════════════════
    {
      name:'MORSE Corp', short:'MRSE', hq:'Cambridge, MA', hqCountry:'USA',
      lat:42.3736, lng:-71.1097, founded:2007, cat:'AI',
      status:'Private (employee-owned)', valuation:'undisclosed',
      what:'Autonomy software for ground, air, and sea unmanned systems for DoD. Waveform development, electronic warfare, and signals processing. All customers are US government.',
      products:['Autonomous UGV software','Maritime autonomy','EW signal processing'],
      partners:['USA'],
      contracts:'US Army (CDAS), DARPA OFFSET, AFRL, US Navy, SOCOM',
      notes:'ITAR-controlled company. Deep DARPA relationships. One of few autonomy firms cleared to Tier 1 DARPA programs.',
    },
    {
      name:'Nightwing (ex-Raytheon Cyber)', short:'NWNG', hq:'Herndon, VA', hqCountry:'USA',
      lat:38.9696, lng:-77.3961, founded:2024, cat:'CYBER',
      status:'Private (spun off from Raytheon/RTX)', valuation:'undisclosed',
      what:'Cyber intelligence and geospatial solutions for US intelligence community. Formerly Raytheon Intelligence & Space cyber division. SIGINT, HUMINT data processing, cyber exploitation.',
      products:['Cyber intelligence platforms','SIGINT processing','Geospatial AI analytics'],
      partners:['USA','GBR','AUS','CAN','NZL'],
      contracts:'NSA, CIA, NGA, Five Eyes cyber intelligence contracts',
      notes:'RTX spun out this unit in 2024. Deep IC access. Complements Palantir and Booz Allen in classified cyber market.',
    },

    // ══════════════════════════════════════════════════════
    //  UK / GERMANY — AI / AUTONOMY
    // ══════════════════════════════════════════════════════
    {
      name:'Helsing', short:'HLNG', hq:'Munich / London', hqCountry:'DEU',
      lat:48.1351, lng:11.5820, founded:2021, cat:'AI',
      status:'Private (~$5B valuation)', valuation:'$5B',
      what:'AI for military hardware: HX-1 AI radar processor, cognitive electronic warfare, ISR image analysis. Software-first defense AI company. Deployed to Ukraine. Fastest-growing EU defense startup.',
      products:['HX-1 (AI radar signal processing)','He-Arc EW AI','GS-1 AI rifle sight','Autonomous systems stack'],
      partners:['DEU','GBR','FRA','SWE','UKR','DNK','NOR','POL'],
      contracts:'Bundeswehr €85M radar AI, RAF AI program, DGA France, FMV Sweden, Ukraine armed forces',
      notes:'Unicorn in 23 months. Co-founder Gundbert Scherf is ex-McKinsey/Bundeswehr. HX-1 flies on Eurofighter Typhoon.',
    },

    // ══════════════════════════════════════════════════════
    //  GERMANY — DRONES / ROBOTICS
    // ══════════════════════════════════════════════════════
    {
      name:'Quantum Systems', short:'QSYS', hq:'Munich, Germany', hqCountry:'DEU',
      lat:48.1351, lng:11.5920, founded:2015, cat:'UAS',
      status:'Private ($60M+ raised)', valuation:'undisclosed',
      what:'Vector FX-10 fixed-wing VTOL ISR drone — 2.5hr endurance, fully encrypted, GPS-denied capable. Trinity F90+ mapping drone. Widely used in Ukraine for frontline reconnaissance.',
      products:['Vector FX-10 VTOL ISR drone','Trinity F90+ mapping UAV','Cockpit GCS software'],
      partners:['DEU','UKR','LTU','LVA','NOR','POL','AUS','NLD'],
      contracts:'Bundeswehr procurement, Ukraine 500+ units donated, Baltic NATO members, Dutch military',
      notes:'Vector FX-10 is most widely deployed German drone in Ukraine. Encrypted datalinks resist Russian EW jamming.',
    },
    {
      name:'ARX Robotics', short:'ARXR', hq:'Munich, Germany', hqCountry:'DEU',
      lat:48.1501, lng:11.5720, founded:2022, cat:'ROBOT',
      status:'Private ($38M raised 2024)', valuation:'undisclosed',
      what:'GEREON unmanned ground vehicle — modular, multi-payload platform for logistics, ISR, and direct-fire support. Designed for NATO eastern flank warfare conditions.',
      products:['GEREON UGV (logistics/ISR)','GEREON-A (armed variant)','Modular payload system'],
      partners:['DEU','UKR','LTU','LVA','EST','POL'],
      contracts:'Bundeswehr logistics robot trials, Ukraine ground robot evaluation, Baltic state defense programs',
      notes:'Designed ground-up for urban combat in EU. CES 2024 debut. Backed by Airbus Ventures.',
    },

    // ══════════════════════════════════════════════════════
    //  FRANCE — AI / UAS
    // ══════════════════════════════════════════════════════
    {
      name:'Preligens (now Esri Defense)', short:'PRLG', hq:'Paris, France', hqCountry:'FRA',
      lat:48.8566, lng:2.3522, founded:2016, cat:'AI',
      status:'Acquired by Esri 2024', valuation:'undisclosed',
      what:'AI engine for automated analysis of satellite and aerial imagery. Detects military vehicles, convoys, airfields, and facility changes using computer vision. Used by DGA and NATO allies.',
      products:['Preligens AI engine (GEOINT)','Auto-detection of military objects','Change detection'],
      partners:['FRA','DEU','GBR','AUS','NATO'],
      contracts:'DGA (French Defense Acquisition), DGSE (French intelligence), NATO JISR, allied GEOINT communities',
      notes:'Acquired by Esri to integrate with ArcGIS intelligence workflows. Before acquisition, processed 50M+ km² of imagery.',
    },
    {
      name:'Delair', short:'DLIR', hq:'Toulouse, France', hqCountry:'FRA',
      lat:43.6047, lng:1.4442, founded:2011, cat:'UAS',
      status:'Private (Airbus subsidiary 2023)', valuation:'undisclosed',
      what:'Long-range fixed-wing ISR drones for military and government. DT26X optimized for military ISR with EO/IR/LIDAR payload. Now developing under Airbus umbrella.',
      products:['DT26X ISR fixed-wing UAS','DL18 precision mapping','Delair EL (extended range)'],
      partners:['FRA','NATO','AUS','ARE'],
      contracts:'French Air Force ISR, EU Frontex border patrol, CENTCOM partner nation programs',
      notes:'Airbus acquired majority stake 2023 to strengthen European military UAS capability against US and Turkey competitors.',
    },

    // ══════════════════════════════════════════════════════
    //  PORTUGAL — MARITIME UAS
    // ══════════════════════════════════════════════════════
    {
      name:'TEKEVER', short:'TKVR', hq:'Lisbon, Portugal', hqCountry:'PRT',
      lat:38.7169, lng:-9.1399, founded:2001, cat:'UAS',
      status:'Private (~€150M raised)', valuation:'undisclosed',
      what:'AR3 and AR5 MALE UAS for maritime surveillance — NATO\'s choice for long-endurance ocean patrol. Used by Frontex for Mediterranean border monitoring. 30-hour endurance, satellite datalink.',
      products:['AR3 Maritime UAS','AR5 MALE UAS (30hr endurance)','Ground station software'],
      partners:['PRT','GBR','BRA','PHL','POL','NOR','DEU'],
      contracts:'Frontex EU border patrol €$40M, Royal Navy maritime surveillance trials, Brazil navy evaluation',
      notes:'AR5 is Europe\'s leading maritime MALE drone. Royal Navy selected for North Sea/Atlantic patrol 2023.',
    },

    // ══════════════════════════════════════════════════════
    //  TURKEY — DRONES
    // ══════════════════════════════════════════════════════
    {
      name:'Baykar', short:'BKRT', hq:'Istanbul, Turkey', hqCountry:'TUR',
      lat:41.0082, lng:28.9784, founded:2007, cat:'UAS',
      status:'Private (family-owned, Bayraktar family)', valuation:'~$4B est.',
      what:'Bayraktar TB2 — world\'s most combat-proven MALE armed drone. TB3 for carrier operations. Kızılelma (Mius) UCAV (stealth, jet-powered). Akıncı heavy attack drone. Changed modern warfare in Nagorno-Karabakh and Ukraine.',
      products:['Bayraktar TB2 (MALE armed drone)','Bayraktar TB3 (carrier)','Kızılelma / Mius (UCAV)','Akıncı (heavy attack)','Bayraktar Miniature (MAM munitions)'],
      partners:['UKR','QAT','AZE','ALB','POL','MAR','ETH','SOM','LBY','DJI','RWA','SEN','TGO','PAK','KAZ','NGA','SDN','GHA','TUN','MDG','NER','TUR'],
      contracts:'Ukraine 50+ TB2 (destroyed $3B+ Russian equipment), Azerbaijan Karabakh war, Qatar AF, Poland export',
      notes:'TB2 destroyed 1,000+ Russian vehicles in Ukraine. Selçuk Bayraktar (CEO) married to Erdoğan\'s daughter. 27 export customers.',
    },

    // ══════════════════════════════════════════════════════
    //  UAE — DEFENSE TECH
    // ══════════════════════════════════════════════════════
    {
      name:'EDGE Group', short:'EDGE', hq:'Abu Dhabi, UAE', hqCountry:'ARE',
      lat:24.4539, lng:54.3773, founded:2019, cat:'UAS',
      status:'State-owned (UAE Govt)', valuation:'~$5B revenue',
      what:'UAE\'s national defense technology conglomerate — merger of 25 defense entities. Makes HALCON loitering munitions, cyber weapons (Karma/Pegasus partnership), armed drones, EW systems, AI C2, smart munitions.',
      products:['HALCON Caracal (loitering munition)','HAVEN EW system','REACH satellite','Hunter UAS','EDGE cyber tools'],
      partners:['ARE','GBR','FRA','PAK','SGP','USA (selective)','EGY','JOR'],
      contracts:'UAE armed forces entire inventory, Pakistan drone export, Egypt defense supply, EW exports globally',
      notes:'Emerged from merger of Caracal (guns), Nimr (vehicles), Caracal. Deeply invested in AI warfare + drone swarms.',
    },

    // ══════════════════════════════════════════════════════
    //  ISRAEL — ESTABLISHED + STARTUPS
    // ══════════════════════════════════════════════════════
    {
      name:'Elbit Systems', short:'ESLT', hq:'Haifa, Israel', hqCountry:'ISR',
      lat:32.7940, lng:34.9896, founded:1966, cat:'UAS',
      status:'Public (ESLT · ~$7B)', valuation:'$7B',
      what:'Full-spectrum defense electronics: Hermes drone family, Seagull USV, Iron Vision helicopter helmet, EW suites, TORCH-X battlefield management, digital communications, DIRCM laser countermeasures.',
      products:['Hermes 450/900 MALE drone','Seagull USV (mine hunting)','Iron Vision HMD','DIRCM laser','TORCH-X C2'],
      partners:['USA','IND','GBR','DEU','BRA','AUS','PHL','COL','NLD','AZE','KAZ','CZE','ROU','BGR','SGP','THA','VNM','GRC'],
      contracts:'India $1.7B drone contract, UK helmet-mounted display, US DIRCM on CH-47, Brazil armed forces',
      notes:'Israel\'s largest defense exporter. Iron Vision helmet enables helicopter pilot to "see through" fuselage. $5B+ annual sales.',
    },
    {
      name:'Rafael Advanced Defense Systems', short:'RFAL', hq:'Haifa, Israel', hqCountry:'ISR',
      lat:32.7990, lng:34.9846, founded:1948, cat:'MUNITION',
      status:'State-owned (Israeli MoD)', valuation:'$3.5B+ revenue',
      what:'Iron Dome (96%+ intercept rate), David\'s Sling, Barak-8 naval/land air defense, Spike missile family (350,000+ sold), Trophy active protection for tanks, Spice precision bombs.',
      products:['Iron Dome (c-rocket/mortar)','David\'s Sling','Barak-8','Spike NLOS/ER/LR','Trophy APS','Spice-250/1000'],
      partners:['USA','IND','GBR','DEU','FRA','ITA','GRC','POL','FIN','NOR','ESP','NLD','CZE','ROU','AZE','SGP','KOR','AUS'],
      contracts:'Israel Iron Dome $3B US co-production, India Barak-8 $2B, Germany Trophy for Leopard, South Korea Spike',
      notes:'Iron Dome has made 2,500+ intercepts since 2011. Trophy saved 100+ Israeli tank crews. Most combat-tested AD system.',
    },
    {
      name:'Israel Aerospace Industries (IAI)', short:'IAI', hq:'Lod, Israel', hqCountry:'ISR',
      lat:31.9500, lng:34.8900, founded:1953, cat:'UAS',
      status:'State-owned (Israeli MoD)', valuation:'$4B+ revenue',
      what:'Heron TP MALE drone (largest Israeli drone), Harop loitering munition (autonomous anti-radiation), Barak-8 co-developed with India, Arrow 3 exo-atmospheric missile defense, Amos satellites.',
      products:['Heron TP/2 (MALE drone)','Harop anti-radiation loitering munition','Arrow 3 missile defense','Barak-8','Amos comms satellites'],
      partners:['IND','USA','FRA','DEU','AZE','MAR','THA','SRB','GRC','AUS','KAZ','BRA','CHE','SGP'],
      contracts:'India Heron TP $400M, Azerbaijan Harop (used in 2020 war), Morocco drone/SAM deal, NATO allies',
      notes:'Harop autonomously hunts and destroys radar sites — seen as precursor to fully autonomous lethal AI. Used by Azerbaijan in Karabakh.',
    },
    {
      name:'Windward', short:'WNDW', hq:'Tel Aviv, Israel', hqCountry:'ISR',
      lat:32.0853, lng:34.7818, founded:2011, cat:'CYBER',
      status:'Public (WNWD on AIM London · ~$150M)', valuation:'$150M',
      what:'AI maritime intelligence platform. Tracks 500,000+ vessels globally, detects AIS spoofing/dark-ship behavior, sanctions violations, and suspicious rendezvous. Used by navies and coast guards.',
      products:['Windward Maritime AI','Dark vessel detection','Sanctions compliance tracking','Port intelligence'],
      partners:['USA','GBR','ISR','AUS','NLD','ESP','NOR','JPN','IND'],
      contracts:'UK Royal Navy, US Coast Guard, EU EFCA fisheries, NATO maritime commands',
      notes:'Detected Iranian oil-to-oil transfers at sea and North Korean coal smuggling before US/EU sanctioned vessels.',
    },

    // ══════════════════════════════════════════════════════
    //  AUSTRALIA — DRONES / UAS
    // ══════════════════════════════════════════════════════
    {
      name:'SYPAQ Systems', short:'SYPQ', hq:'Melbourne, Australia', hqCountry:'AUS',
      lat:-37.8136, lng:144.9631, founded:2003, cat:'UAS',
      status:'Private (undisclosed)', valuation:'undisclosed',
      what:'PPDS (Precision Payload Delivery System) — cardboard/wax-coated one-way autonomous expendable drone. Simple, cheap ($3,500/unit), field-assembled. Donated 100+ to Ukraine. Corvo precision delivery drone.',
      products:['Corvo PPDS (expendable cardboard drone)','WASM autonomous maritime drone'],
      partners:['AUS','UKR'],
      contracts:'Australian Defence Force, Ukraine Armed Forces 100+ units, UK defense interest',
      notes:'Built from cardboard to be cheap and expendable. Assembly takes 10 minutes. Ukraine used to strike Russian logistics.',
    },
    {
      name:'DefendTex', short:'DFTX', hq:'Melbourne, Australia', hqCountry:'AUS',
      lat:-37.8136, lng:144.9531, founded:2011, cat:'MUNITION',
      status:'Private (undisclosed)', valuation:'undisclosed',
      what:'Drone40 multi-role loitering munition launched from standard 40mm grenade launcher — enables any infantry soldier to deploy a drone/munition without specialist equipment. ISR, EW, and attack variants.',
      products:['Drone40 (ISR variant)','Drone40 (attack variant)','Drone40 (EW/comms relay)','Cortex EW payload'],
      partners:['AUS','GBR','USA'],
      contracts:'Australian Army, UK SOCOM evaluation, US SOCOM interest for unconventional warfare',
      notes:'Fits in a 40mm grenade — revolutionary miniaturization. Soldiers can deploy from standard rifle-mounted launcher.',
    },
    {
      name:'Electro Optic Systems (EOS)', short:'EOS', hq:'Queanbeyan, Australia', hqCountry:'AUS',
      lat:-35.3533, lng:149.2336, founded:1983, cat:'ENERGY',
      status:'Public (ASX:EOS · ~$500M)', valuation:'$500M',
      what:'Remote weapon stations (R400S-MK2 used on Australian vehicles), space laser communications and directed energy, space situational awareness. Only ASX-listed directed energy company.',
      products:['R400S-MK2 remote weapon station','SLWRM directed energy','Space SSA telescopes','Space optical comms'],
      partners:['AUS','USA','GBR','CAN','IND','ARE'],
      contracts:'Australian Army vehicle RWS, US Army/SOCOM RWS evaluation, UAE defense forces',
      notes:'Space laser comms systems transmit classified data between satellites and ground at 10Gb/s. SSA telescopes track debris.',
    },

    // ══════════════════════════════════════════════════════
    //  INDIA — INDIGENOUS DEFENCE TECH
    // ══════════════════════════════════════════════════════
    {
      name:'ideaForge Technology', short:'IDFC', hq:'Mumbai, India', hqCountry:'IND',
      lat:19.2183, lng:72.9781, founded:2011, cat:'UAS',
      status:'Public (NSE: IDEAFORGE · ~$500M)', valuation:'$500M',
      what:'SWITCH UAV (hand-launched, 120min endurance), NETRA V2 mini-quadcopter, NINJA rotary-wing, Q-series heavy lifter. Dominant Indian defense drone maker for all armed forces and paramilitary.',
      products:['SWITCH UAV (hand-launch, 120min)','NETRA V2 mini-UAV','NINJA rotary-wing','Q6 heavy-lift hexacopter'],
      partners:['IND'],
      contracts:'Indian Army (Siachen glacier deployments), IAF, Indian Navy, BSF, NSG, CRPF, ITBP, 30+ state police forces',
      notes:'Only Indian drone company in all three armed forces simultaneously. Certified under iDEX. Operating at Siachen at 5,400m altitude.',
    },
    {
      name:'Sagar Defence Engineering', short:'SGRD', hq:'Surat, India', hqCountry:'IND',
      lat:21.1702, lng:72.8311, founded:2012, cat:'ROBOT',
      status:'Private (DRDO-backed)', valuation:'undisclosed',
      what:'Autonomous surface vessels and underwater vehicles for Indian Navy. ANMUN USV for underwater mine neutralization, ocean surveillance, and anti-submarine warfare support.',
      products:['ANMUN USV (mine hunting)','RUDRA UUV','Naval patrol USV'],
      partners:['IND'],
      contracts:'Indian Navy evaluation, DRDO joint development, iDEX defense innovation challenge winner',
      notes:'First Indian company to develop an operational mine-hunting USV. Building DRDO\'s vision for unmanned naval swarms.',
    },

    // ══════════════════════════════════════════════════════
    //  SINGAPORE — AEROSPACE / UAS
    // ══════════════════════════════════════════════════════
    {
      name:'H3 Dynamics', short:'H3DY', hq:'Singapore', hqCountry:'SGP',
      lat:1.3521, lng:103.8198, founded:2014, cat:'UAS',
      status:'Private (undisclosed)', valuation:'undisclosed',
      what:'Hydrogen fuel cell autonomous drones for ultra-long-endurance ISR. HYWING fixed-wing hydrogen drone: 8+ hour endurance vs 30 minutes for battery drones. HyDrone for offshore/maritime.',
      products:['HYWING hydrogen fixed-wing UAS','HyDrone 1800 (offshore)','Hydrogen fuel cell packs'],
      partners:['SGP','FRA','JPN','GBR','AUS'],
      contracts:'Singapore Air Force endurance trials, French DNRED (customs) maritime patrol, JGSDF evaluation',
      notes:'Hydrogen enables 10x longer endurance than lithium batteries. Critical for maritime domain awareness over vast ocean areas.',
    },
  ];

  // ── Render markers ─────────────────────────────────────────────────────────
  function _render() {
    if (!map) return;
    markers.forEach(m => { try { map.removeLayer(m); } catch(_) {} });
    markers = [];

    const visible = _catFilter === 'ALL'
      ? COMPANIES
      : COMPANIES.filter(c => c.cat === _catFilter);

    visible.forEach(co => {
      const cat   = CAT[co.cat] || CAT.AI;
      const hqFlag= FLAGS[co.hqCountry] || '🌐';
      const partnerCount = co.partners.length;
      const pxW = Math.max(26, Math.min(42, 26 + partnerCount));

      const icon = L.divIcon({
        html:`<div class="dst-marker" style="
          background:${cat.color}18;border:1.5px solid ${cat.color};
          color:${cat.color};min-width:${pxW}px;">
          <span class="dst-m-icon">${hqFlag}</span>
          <span class="dst-m-name">${co.short}</span>
        </div>`,
        className:'',
        iconSize:[pxW + 4, 16],
        iconAnchor:[(pxW + 4) / 2, 8],
      });

      const partnerFlags = co.partners.slice(0, 20)
        .map(p => FLAGS[p] || p)
        .join(' ');

      const productList = co.products.slice(0, 5)
        .map(p => `<div class="dst-pop-product">▸ ${p}</div>`)
        .join('');

      const pop = `<div class="dst-popup" style="border-left:3px solid ${cat.color}">
        <div class="dst-pop-hdr" style="color:${cat.color}">${hqFlag} ${co.name}</div>
        <div class="dst-pop-badges">
          <span class="dst-pop-cat" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.icon} ${cat.label}</span>
          <span class="dst-pop-year">Est. ${co.founded}</span>
          <span class="dst-pop-val">${co.status}</span>
        </div>
        <div class="dst-pop-hq">📍 ${co.hq} · ${co.valuation !== co.status ? co.valuation : ''}</div>
        <div class="dst-pop-section">WHAT THEY DO</div>
        <div class="dst-pop-what">${co.what}</div>
        <div class="dst-pop-section">KEY PRODUCTS</div>
        <div class="dst-pop-products">${productList}</div>
        <div class="dst-pop-section">PARTNER NATIONS (${partnerCount})</div>
        <div class="dst-pop-flags">${partnerFlags}</div>
        <div class="dst-pop-section">CONTRACTS / INTEL</div>
        <div class="dst-pop-contracts">${co.contracts}</div>
        ${co.notes ? `<div class="dst-pop-notes">💡 ${co.notes}</div>` : ''}
        <div class="dst-pop-src">Source: public filings · DoD contracts · OSINT press · SAM.gov</div>
      </div>`;

      const mk = L.marker([co.lat, co.lng], { icon, zIndexOffset:1300 })
        .bindPopup(pop, { className:'leaflet-popup-dark', maxWidth:360 });
      mk.addTo(map);
      markers.push(mk);
    });
  }

  // ── Left panel stats ───────────────────────────────────────────────────────
  function _updatePanel() {
    const el = document.getElementById('dst-panel-body');
    if (!el) return;

    const byCat = {};
    COMPANIES.forEach(c => { byCat[c.cat] = (byCat[c.cat] || 0) + 1; });

    const byCountry = {};
    COMPANIES.forEach(c => { byCountry[c.hqCountry] = (byCountry[c.hqCountry] || 0) + 1; });

    el.innerHTML = `
      <div class="dst-filter-row" id="dst-cat-filters">
        <button class="dst-filt active" data-dcat="ALL">ALL (${COMPANIES.length})</button>
        ${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,n])=>{
          const c = CAT[k]||CAT.AI;
          return `<button class="dst-filt" data-dcat="${k}" style="--fc:${c.color}">${c.icon} ${k} <span>${n}</span></button>`;
        }).join('')}
      </div>
      <div class="dst-country-row">
        ${Object.entries(byCountry).sort((a,b)=>b[1]-a[1]).map(([co,n])=>
          `<span class="dst-co-pill">${FLAGS[co]||'🌐'} ${co} <b>${n}</b></span>`
        ).join('')}
      </div>
      <div class="dst-company-list" id="dst-co-list">
        ${COMPANIES.map(c=>{
          const cat=CAT[c.cat]||CAT.AI;
          return `<div class="dst-co-row" onclick="APP.flyTo(${c.lat},${c.lng},6)">
            <span class="dst-co-icon" style="color:${cat.color}">${cat.icon}</span>
            <div class="dst-co-info">
              <div class="dst-co-name">${FLAGS[c.hqCountry]||'🌐'} ${c.name}</div>
              <div class="dst-co-sub" style="color:${cat.color}">${c.hq} · ${c.partners.length} partner nations</div>
            </div>
            <div class="dst-co-val">${c.valuation.replace('undisclosed','—').replace(/ ?\(.*\)/,'')}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="dst-total">
        ${COMPANIES.length} companies · ${[...new Set(COMPANIES.flatMap(c=>c.partners))].length} partner nations total
      </div>`;

    // Wire filter buttons
    el.querySelectorAll('.dst-filt').forEach(btn => {
      btn.addEventListener('click', () => {
        _catFilter = btn.dataset.dcat;
        el.querySelectorAll('.dst-filt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _render();
      });
    });
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('dst-css')) return;
    const s = document.createElement('style');
    s.id = 'dst-css';
    s.textContent = `
      .dst-marker {
        border-radius:9px; font-size:6px; font-weight:900; letter-spacing:.2px;
        display:flex; align-items:center; gap:2px; padding:1px 4px;
        cursor:pointer; box-shadow:0 0 5px currentColor;
        transition:transform .15s; white-space:nowrap;
      }
      .dst-marker:hover { transform:scale(1.5); z-index:9999!important; }
      .dst-m-icon { font-size:7px; }
      .dst-m-name { font-size:6px; }

      .dst-popup { min-width:300px; max-width:340px; font-family:'Courier New',monospace; padding:2px; }
      .dst-pop-hdr { font-size:10px; font-weight:700; margin-bottom:5px; line-height:1.2; }
      .dst-pop-badges { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:4px; }
      .dst-pop-cat { font-size:6.5px; font-weight:700; padding:1px 5px; border-radius:2px; }
      .dst-pop-year { font-size:6.5px; color:#3d5a78; padding:1px 4px; border:1px solid #1a2e42; border-radius:2px; }
      .dst-pop-val { font-size:6px; color:#3d5a78; padding:1px 4px; border:1px solid #0d1e2e; border-radius:2px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dst-pop-hq { font-size:7px; color:#5a7a9a; margin-bottom:5px; }
      .dst-pop-section { font-size:6px; font-weight:700; letter-spacing:.6px; color:#3d5a78; margin:5px 0 2px; border-bottom:1px solid #0d1e2e; padding-bottom:2px; }
      .dst-pop-what { font-size:7.5px; color:#c8dff0; line-height:1.4; margin-bottom:3px; }
      .dst-pop-products { margin-bottom:3px; }
      .dst-pop-product { font-size:7px; color:#5a7a9a; line-height:1.5; }
      .dst-pop-flags { font-size:13px; letter-spacing:1px; margin:2px 0 3px; line-height:1.8; }
      .dst-pop-contracts { font-size:7px; color:#5a7a9a; line-height:1.4; margin-bottom:3px; }
      .dst-pop-notes { font-size:7px; color:#ffcc00; line-height:1.4; margin:4px 0; background:rgba(255,204,0,.06); padding:3px 5px; border-radius:2px; }
      .dst-pop-src { font-size:6.5px; color:#3d5a78; margin-top:5px; border-top:1px solid #0d1e2e; padding-top:4px; }

      .dst-filter-row { display:flex; gap:3px; flex-wrap:wrap; padding:4px 0; margin-bottom:4px; }
      .dst-filt {
        font-size:6.5px; font-weight:700; padding:2px 5px; border-radius:10px;
        border:1px solid #1a2e42; background:transparent; color:#5a7a9a;
        cursor:pointer; font-family:'Courier New',monospace; transition:all .15s;
        white-space:nowrap;
      }
      .dst-filt:hover { color:var(--fc, #c8dff0); border-color:var(--fc, #3d5a78); }
      .dst-filt.active { background:rgba(0,255,136,.08); color:#00ff88; border-color:#00ff8844; }

      .dst-country-row { display:flex; gap:4px; flex-wrap:wrap; padding:3px 0 5px; border-bottom:1px solid #0d1e2e; margin-bottom:4px; }
      .dst-co-pill { font-size:7px; color:#3d5a78; white-space:nowrap; }
      .dst-co-pill b { color:#c8dff0; }

      .dst-company-list { max-height:340px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:#1a2e42 transparent; }
      .dst-co-row {
        display:flex; align-items:center; gap:6px; padding:3px 0;
        border-bottom:1px solid #0a1520; cursor:pointer; transition:background .12s;
      }
      .dst-co-row:hover { background:rgba(255,255,255,.02); }
      .dst-co-icon { font-size:11px; flex-shrink:0; }
      .dst-co-info { flex:1; min-width:0; }
      .dst-co-name { font-size:7.5px; font-weight:700; color:#c8dff0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .dst-co-sub { font-size:6.5px; }
      .dst-co-val { font-size:6.5px; color:#ffcc00; white-space:nowrap; flex-shrink:0; }

      .dst-total { font-size:7px; color:#3d5a78; padding:4px 0; border-top:1px solid #0d1e2e; margin-top:2px; }
    `;
    document.head.appendChild(s);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init(m) {
      map = m;
      _injectCSS();
    },
    setEnabled(on) {
      enabled = on;
      const card = document.getElementById('dst-panel-card');
      if (on) {
        _render();
        _updatePanel();
        if (card) card.style.display = 'block';
      } else {
        markers.forEach(m => { try { map?.removeLayer(m); } catch(_) {} });
        markers = [];
        if (card) card.style.display = 'none';
      }
    },
    getData() { return COMPANIES; },
  };
})();
