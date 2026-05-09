'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   DRONES MODULE — Global Drone Manufacturer Database
   Covers 90+ companies across 30+ countries
   Status: operational | development | proposed | future | cancelled
   Type:   private | government | startup | joint
   Tab:    #rptab-drones (right panel lazy-init)
══════════════════════════════════════════════════════════════════════════ */
const DRONES_MODULE = (() => {

  // ── State ─────────────────────────────────────────────────────────────────
  let _country  = 'all';
  let _status   = 'all';
  let _type     = 'all';
  let _category = 'all';
  let _search   = '';
  let _inited   = false;

  // ── Database ──────────────────────────────────────────────────────────────
  const DB = [
    // ── USA ──────────────────────────────────────────────────────────────
    { id:'ga-asi',      name:'General Atomics ASI',             short:'GA-ASI',
      flag:'🇺🇸', country:'USA',      type:'private',    status:'operational', category:'combat',
      programs:['MQ-9 Reaper','MQ-1C Gray Eagle','MQ-9B SkyGuardian','Avenger UCAV'],
      hq:'San Diego, USA',
      desc:'World leader in MALE/HALE combat RPAs. MQ-9 Reaper deployed in 20+ nations.' },

    { id:'northrop',    name:'Northrop Grumman',                short:'Northrop',
      flag:'🇺🇸', country:'USA',      type:'private',    status:'operational', category:'surveillance',
      programs:['RQ-4 Global Hawk','MQ-4C Triton','X-47B','MQ-8C Fire Scout'],
      hq:'Falls Church, USA',
      desc:'HALE surveillance and first carrier-capable UCAV demonstrator (X-47B).' },

    { id:'boeing-insitu', name:'Boeing / Insitu',              short:'Boeing Insitu',
      flag:'🇺🇸', country:'USA',      type:'private',    status:'operational', category:'surveillance',
      programs:['ScanEagle','RQ-21A Blackjack','MQ-25 Stingray (carrier tanker)'],
      hq:'Bingen, USA',
      desc:'ScanEagle is NATO standard small tactical UAS; MQ-25 is carrier-borne autonomous tanker.' },

    { id:'aerovironment', name:'AeroVironment',                short:'AeroVironment',
      flag:'🇺🇸', country:'USA',      type:'private',    status:'operational', category:'multi-role',
      programs:['Switchblade 300/600','RQ-11 Raven','Puma AE','JUMP 20','Snipe Nano'],
      hq:'Arlington, USA',
      desc:'Dominant in small UAS and loitering munitions. Switchblade 600 used in Ukraine.' },

    { id:'kratos',      name:'Kratos Defense',                 short:'Kratos',
      flag:'🇺🇸', country:'USA',      type:'private',    status:'development', category:'combat',
      programs:['XQ-58A Valkyrie','Firejet','UTAP-22 Mako','Gremlins (DARPA)'],
      hq:'San Diego, USA',
      desc:'Affordable attritable UCAV. XQ-58A Valkyrie flew with F-22 and F-35 in trials.' },

    { id:'anduril',     name:'Anduril Industries',             short:'Anduril',
      flag:'🇺🇸', country:'USA',      type:'startup',    status:'development', category:'combat',
      programs:['Ghost Shark (AUV)','Roadrunner-M','Fury UCAV','Altius-700M'],
      hq:'Costa Mesa, USA',
      desc:'AI-first defence startup backed by Peter Thiel. Fury UCAV won USAF CCA contract.' },

    { id:'shield-ai',   name:'Shield AI',                      short:'Shield AI',
      flag:'🇺🇸', country:'USA',      type:'startup',    status:'development', category:'combat',
      programs:['V-BAT VTOL UAS','Nova autonomous fighter','Hivemind AI pilot stack'],
      hq:'San Diego, USA',
      desc:'Hivemind AI enables fully autonomous combat flight. V-BAT deployed by US Marines.' },

    { id:'textron',     name:'Textron Systems',                short:'Textron',
      flag:'🇺🇸', country:'USA',      type:'private',    status:'operational', category:'surveillance',
      programs:['Aerosonde Mk 4.7','RQ-7 Shadow 200','ALTIUS-600'],
      hq:'Providence, USA',
      desc:'RQ-7 Shadow is primary US Army tactical ISR drone; Aerosonde used in arctic ops.' },

    { id:'skydio',      name:'Skydio',                         short:'Skydio',
      flag:'🇺🇸', country:'USA',      type:'startup',    status:'operational', category:'surveillance',
      programs:['Skydio 2+','X2D','X10D (military ISR)'],
      hq:'San Mateo, USA',
      desc:'AI obstacle-avoidance leader; US DoD banned DJI so Skydio fills the tactical gap.' },

    { id:'vanilla',     name:'Vanilla Aircraft',               short:'Vanilla',
      flag:'🇺🇸', country:'USA',      type:'startup',    status:'development', category:'surveillance',
      programs:['VA001 (30-day endurance UAS)'],
      hq:'Falls Church, USA',
      desc:'Gasoline-powered ultra-long-endurance HALE targeting 30+ consecutive flight days.' },

    { id:'l3harris-us', name:'L3Harris Technologies',          short:'L3Harris',
      flag:'🇺🇸', country:'USA',      type:'private',    status:'operational', category:'multi-role',
      programs:['FVR-90','V-150','Wescam MX-series EO/IR sensors','Compact Laser Designator'],
      hq:'Melbourne, USA',
      desc:'Major sensor and electronics integrator; FVR-90 used by multiple NATO allies.' },

    // ── China ─────────────────────────────────────────────────────────────
    { id:'casc',        name:'China Aerospace Science & Technology Corp', short:'CASC',
      flag:'🇨🇳', country:'China',    type:'government', status:'operational', category:'combat',
      programs:['CH-4 Rainbow','CH-5','CH-7 (stealth flying-wing)','ASN-301'],
      hq:'Beijing, China',
      desc:'CH-4 and CH-5 exported to 12+ countries as low-cost Reaper alternative. CH-7 is stealth UCAV.' },

    { id:'avic',        name:'AVIC (Aviation Industry Corp of China)', short:'AVIC',
      flag:'🇨🇳', country:'China',    type:'government', status:'operational', category:'combat',
      programs:['Wing Loong I / II / III','Sky Eagle','Xianglong HALE'],
      hq:'Beijing, China',
      desc:'Wing Loong II rivals Predator; exported to UAE, Saudi Arabia, Pakistan and others.' },

    { id:'dji',         name:'DJI (Da-Jiang Innovations)',     short:'DJI',
      flag:'🇨🇳', country:'China',    type:'private',    status:'operational', category:'commercial',
      programs:['Matrice 30T','Agras T40','Avata FPV','Mavic 3 Enterprise'],
      hq:'Shenzhen, China',
      desc:'Controls ~70% of global commercial drone market. FPV variants widely used in Ukraine war.' },

    { id:'ziyan',       name:'Ziyan UAV',                      short:'Ziyan',
      flag:'🇨🇳', country:'China',    type:'private',    status:'operational', category:'combat',
      programs:['Blowfish A3 (armed autonomous helicopter)','Blowfish A2'],
      hq:'Shenzhen, China',
      desc:'First commercially marketed fully autonomous armed rotary-wing drone.' },

    { id:'cetc',        name:'China Electronics Technology Group', short:'CETC',
      flag:'🇨🇳', country:'China',    type:'government', status:'operational', category:'experimental',
      programs:['119-drone swarm (world record)','EW drones','Fixed-wing cluster UAV'],
      hq:'Beijing, China',
      desc:'Set world record with 119-drone light swarm. Electronic warfare and ISR platforms.' },

    { id:'caig',        name:'Chengdu Aircraft Industry Group', short:'CAIG',
      flag:'🇨🇳', country:'China',    type:'government', status:'development', category:'combat',
      programs:['Lijian (Sharp Sword) stealth UCAV','GJ-11 production variant'],
      hq:'Chengdu, China',
      desc:'Developed alongside J-20; GJ-11 stealth flying-wing UCAV expected in PLA service.' },

    { id:'norinco',     name:'NORINCO',                        short:'NORINCO',
      flag:'🇨🇳', country:'China',    type:'government', status:'operational', category:'combat',
      programs:['CS/UA series armed UAVs','CH-91 mini loitering munition'],
      hq:'Beijing, China',
      desc:'State arms conglomerate producing armed UAVs for PLA ground forces and export.' },

    // ── Israel ────────────────────────────────────────────────────────────
    { id:'iai',         name:'Israel Aerospace Industries',    short:'IAI',
      flag:'🇮🇱', country:'Israel',   type:'joint',      status:'operational', category:'multi-role',
      programs:['Heron TP (Eitan)','Heron 1','Harop anti-radiation UCAV','Harpy','Bird-Eye 650D'],
      hq:'Lod, Israel',
      desc:'Heron TP has 26m wingspan — world\'s largest MALE UAV. Harop has struck targets in Nagorno-Karabakh.' },

    { id:'elbit',       name:'Elbit Systems',                  short:'Elbit',
      flag:'🇮🇱', country:'Israel',   type:'private',    status:'operational', category:'multi-role',
      programs:['Hermes 900','Hermes 450','Skylark I/III','WanderB VTOL','Seagull USV'],
      hq:'Haifa, Israel',
      desc:'Hermes 900 operates in 10+ countries. Skylark is hand-launched battalion-level ISR.' },

    { id:'rafael',      name:'Rafael Advanced Defense Systems', short:'Rafael',
      flag:'🇮🇱', country:'Israel',   type:'joint',      status:'operational', category:'combat',
      programs:['Harop loitering munition','Firefly urban UCAV','Spike NLOS air-launched'],
      hq:'Haifa, Israel',
      desc:'Harop autonomously locks onto enemy radar emissions. Used by Azerbaijan in 2020 war.' },

    { id:'uvision',     name:'UVision Air',                   short:'UVision',
      flag:'🇮🇱', country:'Israel',   type:'private',    status:'operational', category:'combat',
      programs:['Hero-120','Hero-30','Hero-400 (anti-armour)','Hero-120 naval'],
      hq:'Or Yehuda, Israel',
      desc:'Hero loitering munition family covers anti-personnel to bunker-busting missions.' },

    { id:'bluebird',    name:'BlueBird Aerosystems',           short:'BlueBird',
      flag:'🇮🇱', country:'Israel',   type:'private',    status:'operational', category:'surveillance',
      programs:['ThunderB','SpyLite','WanderB','ViXen electric VTOL'],
      hq:'Yavne, Israel',
      desc:'Mini and small UAS for ISR; ThunderB is twin-boom pusher; SpyLite is backpackable.' },

    // ── Turkey ────────────────────────────────────────────────────────────
    { id:'baykar',      name:'Baykar Makina',                  short:'Baykar',
      flag:'🇹🇷', country:'Turkey',   type:'private',    status:'operational', category:'combat',
      programs:['Bayraktar TB2','Bayraktar TB3 (carrier)','Bayraktar Akıncı','Kizilelma (jet UCAV)'],
      hq:'Istanbul, Turkey',
      desc:'TB2 reshaped modern warfare in Ukraine, Libya and Nagorno-Karabakh. Exported to 30+ countries.' },

    { id:'tai',         name:'Turkish Aerospace Industries',   short:'TAI',
      flag:'🇹🇷', country:'Turkey',   type:'joint',      status:'operational', category:'multi-role',
      programs:['Anka-S MALE','Aksungur heavy MALE','Anka-3 stealth UCAV','TAI Tiha'],
      hq:'Ankara, Turkey',
      desc:'Anka-3 is Turkey\'s stealth flying-wing UCAV comparable to X-47B. Aksungur carries 750 kg payload.' },

    { id:'stm-tr',      name:'STM Defence Technologies',       short:'STM',
      flag:'🇹🇷', country:'Turkey',   type:'private',    status:'operational', category:'combat',
      programs:['Kargu-2 autonomous swarm','Alpagu fixed-wing kamikaze','Togan mini loitering'],
      hq:'Ankara, Turkey',
      desc:'Kargu-2 is reported first AI autonomous drone used in active combat (Libya 2020, per UN report).' },

    { id:'vestel-tr',   name:'Vestel Defence',                 short:'Vestel',
      flag:'🇹🇷', country:'Turkey',   type:'private',    status:'operational', category:'surveillance',
      programs:['Karayel-SU MALE','Tirfil mini UAV'],
      hq:'Istanbul, Turkey',
      desc:'Karayel-SU is medium-altitude surveillance drone; exported to Turkmenistan.' },

    { id:'roketsan-tr', name:'Roketsan',                       short:'Roketsan',
      flag:'🇹🇷', country:'Turkey',   type:'government', status:'development', category:'combat',
      programs:['SARPER loitering munition','TOGAN kamikaze','Çakır cruise missile (UAV-launched)'],
      hq:'Ankara, Turkey',
      desc:'Expanding from missiles into loitering munitions. Çakır targets deep-strike requirements.' },

    // ── India ─────────────────────────────────────────────────────────────
    { id:'hal-india',   name:'Hindustan Aeronautics Limited',  short:'HAL',
      flag:'🇮🇳', country:'India',    type:'government', status:'development', category:'multi-role',
      programs:['TAPAS-BH (Rustom-2) MALE','CATS Warrior UCAV','CATS Hunter loitering','Rustom-H HALE'],
      hq:'Bengaluru, India',
      desc:'TAPAS is India\'s MALE UAV under final trials. CATS Warrior is AI loyal wingman for Tejas / Su-30.' },

    { id:'drdo-ade',    name:'DRDO / ADE Bengaluru',           short:'DRDO ADE',
      flag:'🇮🇳', country:'India',    type:'government', status:'development', category:'multi-role',
      programs:['Rustom-I','Nishant','AURA stealth UCAV (concept)','Archer mini-UAV','Lakshya target'],
      hq:'Bengaluru, India',
      desc:'R&D backbone of India\'s UAV programme. AURA is a stealth UCAV concept with internal weapons bay.' },

    { id:'ideaforge',   name:'ideaForge Technology',           short:'ideaForge',
      flag:'🇮🇳', country:'India',    type:'startup',    status:'operational', category:'surveillance',
      programs:['SWITCH UAV','NETRA V','HEX 22','Q6 Pro'],
      hq:'Mumbai, India',
      desc:'Largest Indian tactical drone company. SWITCH selected by Indian Army in ₹100 Cr contract.' },

    { id:'garuda-aero', name:'Garuda Aerospace',               short:'Garuda',
      flag:'🇮🇳', country:'India',    type:'startup',    status:'operational', category:'commercial',
      programs:['Kisan Drone','Dragonfly surveillance','Trishul border patrol','GD-8 survey'],
      hq:'Chennai, India',
      desc:'Fastest-growing Indian drone startup. PM Modi\'s "Drone Didi" campaign partner.' },

    { id:'solar-ind',   name:'Solar Industries — Nagastra',    short:'Solar Ind.',
      flag:'🇮🇳', country:'India',    type:'private',    status:'operational', category:'combat',
      programs:['Nagastra-1 loitering munition','Nagastra-2 (in development)'],
      hq:'Nagpur, India',
      desc:'Nagastra-1 is India\'s first indigenous loitering munition. Indian Army ordered 480 units in 2023.' },

    { id:'newspace',    name:'NewSpace Research & Technologies', short:'NewSpace R&T',
      flag:'🇮🇳', country:'India',    type:'startup',    status:'development', category:'multi-role',
      programs:['Pegasus VTOL ISR','NRT-S series','Cargo UAV prototype'],
      hq:'Bengaluru, India',
      desc:'Hybrid fixed-wing VTOL drones for ISR and logistics. DRDO technology partner.' },

    { id:'paras-def',   name:'Paras Defence & Space Technologies', short:'Paras Defence',
      flag:'🇮🇳', country:'India',    type:'private',    status:'development', category:'surveillance',
      programs:['Night Hawk EO/IR UAV','Multi-sensor surveillance','Nano UAV'],
      hq:'Mumbai, India',
      desc:'Defence-grade optics and surveillance UAV platforms; listed on NSE/BSE.' },

    { id:'tata-as',     name:'Tata Advanced Systems (TASL)',    short:'TASL',
      flag:'🇮🇳', country:'India',    type:'private',    status:'proposed',    category:'combat',
      programs:['MQ-28 Ghost Bat studies (Boeing JV)','Apache MRO hub','Drone assembly JV'],
      hq:'Hyderabad, India',
      desc:'Tata-Boeing JV exploring loyal-wingman UCAV assembly and drone maintenance hub in India.' },

    { id:'raphe',       name:'Raphe mPhibr',                   short:'Raphe mPhibr',
      flag:'🇮🇳', country:'India',    type:'startup',    status:'development', category:'experimental',
      programs:['Indra eVTOL','Bhrigu ISR UAV','Electric coaxial rotorcraft'],
      hq:'Bengaluru, India',
      desc:'Electric vertical take-off drones with coaxial rotor design; DRDO funded trials.' },

    // ── Russia ────────────────────────────────────────────────────────────
    { id:'kronshtadt',  name:'Kronshtadt Group',               short:'Kronshtadt',
      flag:'🇷🇺', country:'Russia',   type:'private',    status:'operational', category:'combat',
      programs:['Orion (Pacer) MALE','Grom jet UCAV','Sirius heavy MALE','Helios RLD'],
      hq:'Moscow, Russia',
      desc:'Orion is Russia\'s first operational strike UAV. Grom is jet-powered UCAV for Orion mothership.' },

    { id:'kalashnikov-uav', name:'Kalashnikov Group UAV',      short:'Kalashnikov',
      flag:'🇷🇺', country:'Russia',   type:'joint',      status:'operational', category:'combat',
      programs:['Lancet-3 loitering munition','KUB-BLA kamikaze','Lancet-1'],
      hq:'Izhevsk, Russia',
      desc:'Lancet-3 is the most-used Russian loitering munition in Ukraine war. Highly effective vs armour.' },

    { id:'okhotnik',    name:'UAC / Sukhoi — S-70 Okhotnik',  short:'S-70 Okhotnik',
      flag:'🇷🇺', country:'Russia',   type:'government', status:'development', category:'combat',
      programs:['S-70 Okhotnik stealth UCAV','Su-57 loyal wingman role'],
      hq:'Moscow, Russia',
      desc:'Heavy stealth flying-wing UCAV; first flight 2019. Will fly as Su-57 wingman by ~2025.' },

    { id:'rostec-alt',  name:'Rostec — Altius',                short:'Rostec',
      flag:'🇷🇺', country:'Russia',   type:'government', status:'development', category:'surveillance',
      programs:['Altius-RU HALE','Sirius heavy ISR MALE'],
      hq:'Moscow, Russia',
      desc:'Altius is Russia\'s equivalent of Global Hawk. Plagued by delays but continues development.' },

    // ── UK ────────────────────────────────────────────────────────────────
    { id:'bae-uav',     name:'BAE Systems (UAV)',              short:'BAE Systems',
      flag:'🇬🇧', country:'UK',       type:'private',    status:'development', category:'combat',
      programs:['Taranis stealth UCAV demo','Mosquito loyal wingman','Fury UCAV','Mantis MALE'],
      hq:'London, UK',
      desc:'Taranis proved UK stealth UCAV capability; Mosquito is AI loyal wingman for Typhoon/F-35.' },

    { id:'qinetiq',     name:'QinetiQ Group',                  short:'QinetiQ',
      flag:'🇬🇧', country:'UK',       type:'private',    status:'operational', category:'multi-role',
      programs:['Zephyr HAPS (solar, 64-day flight record)','Banshee target drone','Peregrine','Mojave STOL'],
      hq:'Farnborough, UK',
      desc:'Zephyr S set world record of 64 days continuous flight at 70,000 ft on solar power alone.' },

    { id:'tekever',     name:'Tekever',                        short:'Tekever',
      flag:'🇬🇧', country:'UK',       type:'private',    status:'operational', category:'surveillance',
      programs:['AR5 Maritime Patrol','AR3','AR8 (next-gen)'],
      hq:'London, UK',
      desc:'AR5 patrols Atlantic for UK Border Force. Supports maritime surveillance in 8+ EU countries.' },

    // ── France ────────────────────────────────────────────────────────────
    { id:'dassault-uav', name:'Dassault Aviation',             short:'Dassault',
      flag:'🇫🇷', country:'France',   type:'private',    status:'development', category:'combat',
      programs:['nEUROn stealth UCAV demo','FCAS Remote Carriers (6th gen)'],
      hq:'Paris, France',
      desc:'nEUROn validated stealth UCAV design shared with EU partners; feeding FCAS programme.' },

    { id:'airbus-uav',  name:'Airbus Defence & Space',         short:'Airbus DS',
      flag:'🇫🇷', country:'France',   type:'private',    status:'operational', category:'multi-role',
      programs:['Zephyr HAPS (solar)','VSR700 naval VTOL','EuroDrone MALE','Aarok MALE'],
      hq:'Toulouse, France',
      desc:'EuroDrone is the pan-European MALE RPAS. VSR700 is a naval helicopter UAV for French frigates.' },

    { id:'safran',      name:'Safran Electronics & Defense',   short:'Safran',
      flag:'🇫🇷', country:'France',   type:'private',    status:'operational', category:'surveillance',
      programs:['Patroller MALE','Sperwer tactical','Sagem Watchkeeper (UK)'],
      hq:'Paris, France',
      desc:'Patroller selected by French Army for corps-level ISR. Long-endurance and sensor-rich.' },

    // ── Germany ───────────────────────────────────────────────────────────
    { id:'eurodrone',   name:'EuroDrone (Airbus/Dassault/Leonardo)', short:'EuroDrone',
      flag:'🇩🇪', country:'Germany',  type:'joint',      status:'development', category:'surveillance',
      programs:['EuroDrone MALE RPAS','Armed variant planned for post-2029'],
      hq:'Manching, Germany',
      desc:'EU joint programme for Germany, France, Italy, Spain. IOC expected ~2029. Cost €7B+.' },

    { id:'quantum-sys', name:'Quantum-Systems',                short:'Quantum-Systems',
      flag:'🇩🇪', country:'Germany',  type:'startup',    status:'operational', category:'surveillance',
      programs:['Trinity F90+','Vector','Scorpion VTOL'],
      hq:'Munich, Germany',
      desc:'Hybrid VTOL fixed-wing for precision mapping and military ISR. Deployed by NATO members.' },

    { id:'emt-penzberg', name:'EMT Penzberg',                  short:'EMT',
      flag:'🇩🇪', country:'Germany',  type:'private',    status:'operational', category:'surveillance',
      programs:['LUNA NG','Aladin hand-launched','Fancopter'],
      hq:'Penzberg, Germany',
      desc:'LUNA NG is Germany\'s primary army UAS. Aladin is dismounted infantry recon drone.' },

    // ── Italy ─────────────────────────────────────────────────────────────
    { id:'leonardo-it', name:'Leonardo (UAV Division)',        short:'Leonardo',
      flag:'🇮🇹', country:'Italy',    type:'private',    status:'operational', category:'surveillance',
      programs:['Falco Evo','Falco Xplorer MALE (EASA-certified)','Mirach target drones'],
      hq:'Rome, Italy',
      desc:'Falco Xplorer is first MALE UAS with EASA Type Certificate for civil/military operations.' },

    { id:'piaggio',     name:'Piaggio Aerospace',              short:'Piaggio',
      flag:'🇮🇹', country:'Italy',    type:'private',    status:'development', category:'surveillance',
      programs:['P.1HH HammerHead MALE RPAS','P180 Avanti conversion'],
      hq:'Villanova d\'Albenga, Italy',
      desc:'HammerHead is twin-turboprop MALE based on P180; Italy/UAE co-development history.' },

    // ── Australia ─────────────────────────────────────────────────────────
    { id:'boeing-au',   name:'Boeing Australia — Ghost Bat',   short:'Boeing AU',
      flag:'🇦🇺', country:'Australia', type:'private',   status:'development', category:'combat',
      programs:['MQ-28A Ghost Bat (Loyal Wingman)','AI wingman for F/A-18 & JSF'],
      hq:'Brisbane, Australia',
      desc:'Ghost Bat is AI loyal wingman UCAV; first non-US country to develop 6th-gen wing concept.' },

    { id:'insitu-pac',  name:'Insitu Pacific (Boeing)',         short:'Insitu Pacific',
      flag:'🇦🇺', country:'Australia', type:'private',   status:'operational', category:'surveillance',
      programs:['ScanEagle (local ops)','Integrator','Tern'],
      hq:'Jandakot, Australia',
      desc:'Provides ScanEagle maritime surveillance for ADF and neighbouring nations.' },

    { id:'sypaq',       name:'SYPAQ Systems',                  short:'SYPAQ',
      flag:'🇦🇺', country:'Australia', type:'startup',   status:'operational', category:'logistics',
      programs:['Corvo PPDS (flat-pack cardboard cargo drone)'],
      hq:'Melbourne, Australia',
      desc:'Disposable flat-pack cardboard drone; supplied to Ukraine for tactical cargo drops.' },

    // ── South Korea ───────────────────────────────────────────────────────
    { id:'kai-kr',      name:'Korea Aerospace Industries',     short:'KAI',
      flag:'🇰🇷', country:'S. Korea', type:'joint',      status:'development', category:'multi-role',
      programs:['KUS-9 tactical UAV','KUS-FC MALE concept','KF-21 loyal wingman study'],
      hq:'Sacheon, S. Korea',
      desc:'KUS-9 under development for ROK Army. KF-21 Boramae program includes unmanned companion.' },

    { id:'lig-nex1',    name:'LIG Nex1',                       short:'LIG Nex1',
      flag:'🇰🇷', country:'S. Korea', type:'private',    status:'development', category:'surveillance',
      programs:['Night Intruder 300','Mideum VTOL','Loitering munition studies'],
      hq:'Seongnam, S. Korea',
      desc:'South Korea\'s top missile/electronics firm expanding into UAV and loitering munitions.' },

    // ── Japan ─────────────────────────────────────────────────────────────
    { id:'yamaha-jp',   name:'Yamaha Motor (RMAX)',             short:'Yamaha',
      flag:'🇯🇵', country:'Japan',    type:'private',    status:'operational', category:'commercial',
      programs:['RMAX agricultural / ISR','Fazer R G2','YMR-08'],
      hq:'Iwata, Japan',
      desc:'RMAX has 30-year track record; longest-running industrial helicopter UAV in production.' },

    { id:'subaru-jp',   name:'Subaru Corporation',             short:'Subaru',
      flag:'🇯🇵', country:'Japan',    type:'private',    status:'development', category:'multi-role',
      programs:['Bell 412 UAV conversion','i-MXT VTOL','Rotorcraft UAV family'],
      hq:'Tokyo, Japan',
      desc:'Partnership with Bell; developing rotary-wing UAVs for JGSDF logistics and ISR.' },

    { id:'atla-jp',     name:'ATLA / Japan MoD',               short:'ATLA Japan',
      flag:'🇯🇵', country:'Japan',    type:'government', status:'proposed',    category:'combat',
      programs:['F-X loyal wingman UCAV','Advanced stealth UAS studies','Future combat air concept'],
      hq:'Tokyo, Japan',
      desc:'Japan\'s F-X 6th-gen fighter expected to field AI wingman UCAV. Budget approved 2023.' },

    // ── UAE ───────────────────────────────────────────────────────────────
    { id:'adasi',       name:'ADASI (Abu Dhabi Autonomous Systems)', short:'ADASI',
      flag:'🇦🇪', country:'UAE',      type:'government', status:'operational', category:'multi-role',
      programs:['REACH-100','REACH-200','Yabhon-R','SW-4 SOLO rotary UAV'],
      hq:'Abu Dhabi, UAE',
      desc:'UAE\'s sovereign autonomous systems company. REACH-200 is medium-altitude maritime ISR.' },

    { id:'edge-uae',    name:'EDGE Group',                     short:'EDGE UAE',
      flag:'🇦🇪', country:'UAE',      type:'government', status:'development', category:'combat',
      programs:['HALCON precision munitions','JENAH UCAV','Hunter UAV','Hybrid VTOL fleet'],
      hq:'Abu Dhabi, UAE',
      desc:'UAE defence conglomerate (25 entities merged). JENAH is an armed tactical UCAV.' },

    { id:'adcom',       name:'Adcom Systems',                  short:'Adcom',
      flag:'🇦🇪', country:'UAE',      type:'private',    status:'operational', category:'multi-role',
      programs:['Yabhon United-40 MALE','Yabhon Flash HALE','RX-6 Rayan'],
      hq:'Abu Dhabi, UAE',
      desc:'United-40 carries 450 kg payload and 40-hour endurance; exported to Libya and others.' },

    // ── Iran ──────────────────────────────────────────────────────────────
    { id:'hesa-ir',     name:'HESA (Iran Aircraft Manufacturing)', short:'HESA',
      flag:'🇮🇷', country:'Iran',     type:'government', status:'operational', category:'combat',
      programs:['Shahed-136 kamikaze','Shahed-129 MALE','Shahed-238 (jet)','Mohajer-10'],
      hq:'Isfahan, Iran',
      desc:'Shahed-136 exported to Russia; widely used in Ukraine. Shahed-238 is jet-powered variant.' },

    { id:'qods-ir',     name:'Qods Aeronautics Industry',      short:'Qods',
      flag:'🇮🇷', country:'Iran',     type:'government', status:'operational', category:'multi-role',
      programs:['Mohajer-2/4/6','Fotros MALE (longest-range Iranian UAV)','Karrar combat jet'],
      hq:'Tehran, Iran',
      desc:'Mohajer family spans 4 decades. Fotros has 2,000 km range; Karrar is jet-powered armed drone.' },

    { id:'irgc-aero',   name:'IRGC Aerospace Organisation',    short:'IRGC Aero',
      flag:'🇮🇷', country:'Iran',     type:'government', status:'operational', category:'combat',
      programs:['Arash-2 kamikaze','Raad-85','Gaza (UAV)','Meraj-532'],
      hq:'Tehran, Iran',
      desc:'IRGC operates Iran\'s largest drone arsenal. Supplied Shahed series to Russia, Houthis, Hezbollah.' },

    // ── Pakistan ──────────────────────────────────────────────────────────
    { id:'nescom-pk',   name:'NESCOM / NDC',                   short:'NESCOM',
      flag:'🇵🇰', country:'Pakistan', type:'government', status:'operational', category:'combat',
      programs:['Burraq armed MALE (Hellfire-capable)','Shahpar-2 ISR','Uqab mini-UAV'],
      hq:'Islamabad, Pakistan',
      desc:'Burraq is Pakistan\'s first armed drone in PAF service. Shahpar-2 used for corps-level ISR.' },

    // ── Poland ────────────────────────────────────────────────────────────
    { id:'wb-elec',     name:'WB Electronics',                 short:'WB Electronics',
      flag:'🇵🇱', country:'Poland',   type:'private',    status:'operational', category:'multi-role',
      programs:['FlyEye tactical ISR','Warmate loitering munition','Fly-X'],
      hq:'Warsaw, Poland',
      desc:'FlyEye deployed in Ukraine. Warmate loitering munition used by Poland, UAE and others.' },

    // ── Sweden ────────────────────────────────────────────────────────────
    { id:'saab-sv',     name:'Saab Group (UAV)',               short:'Saab',
      flag:'🇸🇪', country:'Sweden',   type:'private',    status:'operational', category:'surveillance',
      programs:['Skeldar V-200 (NATO shipborne VTOL)','Schiebel partnership'],
      hq:'Linköping, Sweden',
      desc:'Skeldar V-200 is maritime rotary UAV operated by 10+ NATO navies from frigates and OPVs.' },

    // ── Switzerland ───────────────────────────────────────────────────────
    { id:'schiebel',    name:'Schiebel Aircraft',              short:'Schiebel',
      flag:'🇨🇭', country:'Switzerland', type:'private', status:'operational', category:'surveillance',
      programs:['Camcopter S-100 VTOL','S-300'],
      hq:'Vienna, Austria',
      desc:'S-100 is world\'s most widely deployed maritime VTOL UAV with 40+ government operators.' },

    // ── Brazil ────────────────────────────────────────────────────────────
    { id:'avibras-br',  name:'Avibras',                        short:'Avibras',
      flag:'🇧🇷', country:'Brazil',   type:'private',    status:'development', category:'combat',
      programs:['Falcão loitering munition','ASTROS target drone'],
      hq:'São José dos Campos, Brazil',
      desc:'Expanding MLRS/rocket portfolio into loitering munitions for Brazilian Army.' },

    { id:'embraer-def', name:'Embraer Defense & Security',     short:'Embraer Def.',
      flag:'🇧🇷', country:'Brazil',   type:'private',    status:'development', category:'surveillance',
      programs:['HERMES 450 (IAI licensed)','Heron licensed production','NAURU ISR'],
      hq:'São José dos Campos, Brazil',
      desc:'Licensed Israeli UAV production for Brazilian Armed Forces; exploring indigenous designs.' },

    // ── Taiwan ────────────────────────────────────────────────────────────
    { id:'ncsist-tw',   name:'National Chung-Shan Institute of Science & Technology', short:'NCSIST',
      flag:'🇹🇼', country:'Taiwan',   type:'government', status:'development', category:'combat',
      programs:['Teng Yun 2 MALE','Chien Hsiang anti-radiation UCAV','Blue Magpie','Cardinal logistics'],
      hq:'Taoyuan, Taiwan',
      desc:'Chien Hsiang UCAV autonomously targets Chinese air-defence radars. Teng Yun in final trials.' },

    // ── Ukraine ───────────────────────────────────────────────────────────
    { id:'ukroboprom',  name:'Ukroboronprom',                  short:'Ukroboronprom',
      flag:'🇺🇦', country:'Ukraine',  type:'government', status:'operational', category:'combat',
      programs:['UJ-22 Airborne','ST-35 Silent Thunder','Bayraktar TB2 (licensed)','FPV mass production'],
      hq:'Kyiv, Ukraine',
      desc:'Scaling FPV drone production to thousands/month during war. UJ-22 struck Moscow suburbs.' },

    { id:'ua-defense',  name:'UA Defense / Saker Scout',       short:'UA Defense',
      flag:'🇺🇦', country:'Ukraine',  type:'startup',    status:'operational', category:'surveillance',
      programs:['Saker Scout fixed-wing ISR','Vector VTOL','Shark ISR'],
      hq:'Kyiv, Ukraine',
      desc:'Saker Scout provides battalion-level ISR. Shark has 700 km range and used for deep recon.' },

    // ── Singapore ─────────────────────────────────────────────────────────
    { id:'st-eng',      name:'ST Engineering',                 short:'ST Engineering',
      flag:'🇸🇬', country:'Singapore', type:'private',   status:'operational', category:'surveillance',
      programs:['Skyblade 360','Hermes 450 (IAI licensed)','LEAPP logistics UAV'],
      hq:'Singapore',
      desc:'Skyblade 360 provides urban ISR for Singapore Armed Forces and police.' },

    // ── Greece ────────────────────────────────────────────────────────────
    { id:'hai-gr',      name:'Hellenic Aerospace Industry',    short:'HAI Greece',
      flag:'🇬🇷', country:'Greece',   type:'government', status:'proposed',    category:'surveillance',
      programs:['Pegasus ISR UAV (concept)','Heron TP operator (not manufacturer)'],
      hq:'Tanagra, Greece',
      desc:'HAI operates Israeli Heron TP; studying indigenous MALE development with EU EDIDP funds.' },

    // ── Canada ────────────────────────────────────────────────────────────
    { id:'l3-canada',   name:'L3Harris WESCAM Canada',         short:'WESCAM',
      flag:'🇨🇦', country:'Canada',   type:'private',    status:'operational', category:'surveillance',
      programs:['MX-10 EO/IR turret','MX-15','MX-20 (Global Hawk sensor)'],
      hq:'Burlington, Canada',
      desc:'WESCAM MX-series is the primary sensor suite for MQ-9 Reaper and many allied UAVs.' },

    // ── Argentina ────────────────────────────────────────────────────────
    { id:'invap-ar',    name:'INVAP',                          short:'INVAP',
      flag:'🇦🇷', country:'Argentina', type:'government', status:'development', category:'surveillance',
      programs:['SARA MALE UAV','VANT border surveillance concept'],
      hq:'Bariloche, Argentina',
      desc:'State nuclear/aerospace entity. SARA is Argentina\'s first indigenous MALE drone.' },
  ];

  // ── CSS (injected once) ────────────────────────────────────────────────────
  function _css() {
    if (document.getElementById('drn-styles')) return;
    const el = document.createElement('style');
    el.id = 'drn-styles';
    el.textContent = `
      #rptab-drones{display:flex;flex-direction:column;height:calc(100vh - 42px);overflow:hidden;background:#040608}

      .drn-hdr{background:rgba(155,89,255,.06);border-bottom:1px solid rgba(155,89,255,.2);flex-shrink:0;padding:6px 10px 4px}
      .drn-hdr-row{display:flex;align-items:center;gap:6px;margin-bottom:3px}
      .drn-title{font-size:9px;font-weight:700;letter-spacing:2px;color:#9b59ff}
      .drn-stats-inline{display:flex;gap:6px;margin-left:auto}
      .drn-stat-chip{font-size:6px;padding:2px 5px;border-radius:2px;background:rgba(255,255,255,.06);color:#5a7a9a;letter-spacing:.5px}

      .drn-filters{flex-shrink:0;border-bottom:1px solid #0d1e2e;padding:4px 6px 3px;display:flex;flex-direction:column;gap:3px}
      .drn-row{display:flex;gap:3px;flex-wrap:wrap;align-items:center}
      .drn-lbl{font-size:6px;color:#3d5a78;letter-spacing:.5px;white-space:nowrap;min-width:32px}
      .drn-pill{background:transparent;border:1px solid #1a3040;color:#3d5a78;font-size:6.5px;padding:2px 6px;border-radius:10px;cursor:pointer;white-space:nowrap;transition:all .15s}
      .drn-pill.active{background:rgba(155,89,255,.12);border-color:rgba(155,89,255,.5);color:#b389ff}
      .drn-pill:hover:not(.active){border-color:#3d5a78;color:#c8dff0}
      .drn-search{flex:1;min-width:80px;background:rgba(255,255,255,.04);border:1px solid #1a3040;color:#c8dff0;font-size:7px;padding:3px 7px;border-radius:2px;outline:none}
      .drn-search::placeholder{color:#3d5a78}
      .drn-search:focus{border-color:#9b59ff}
      .drn-count-bar{font-size:6.5px;color:#3d5a78;padding:2px 6px;flex-shrink:0;border-bottom:1px solid #0a1520}

      .drn-list{flex:1;overflow-y:auto;padding:4px;display:flex;flex-direction:column;gap:4px}
      .drn-list::-webkit-scrollbar{width:3px}
      .drn-list::-webkit-scrollbar-track{background:#04060a}
      .drn-list::-webkit-scrollbar-thumb{background:#1a3040;border-radius:2px}

      .drn-card{background:rgba(8,12,22,.95);border:1px solid #101828;border-radius:3px;padding:7px 8px;transition:border-color .15s,background .15s}
      .drn-card:hover{border-color:#9b59ff;background:rgba(15,8,30,.95)}
      .drn-card-top{display:flex;align-items:flex-start;gap:6px;margin-bottom:4px}
      .drn-flag{font-size:14px;line-height:1;flex-shrink:0}
      .drn-name-block{flex:1;min-width:0}
      .drn-name{font-size:8px;font-weight:700;color:#c8dff0;line-height:1.2;margin-bottom:1px}
      .drn-hq{font-size:6px;color:#3d5a78;letter-spacing:.3px}
      .drn-badges{display:flex;gap:3px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
      .drn-badge{font-size:6px;font-weight:700;padding:1px 5px;border-radius:2px;letter-spacing:.5px;white-space:nowrap}
      .drn-programs{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px}
      .drn-prog{font-size:6.5px;background:rgba(155,89,255,.1);border:1px solid rgba(155,89,255,.2);color:#9b59ff;padding:1px 5px;border-radius:2px;white-space:nowrap}
      .drn-desc{font-size:7px;color:#5a7a9a;line-height:1.4}

      /* status colors */
      .drn-s-operational{background:rgba(0,255,136,.15);color:#00ff88;border:1px solid rgba(0,255,136,.3)}
      .drn-s-development{background:rgba(255,170,0,.15);color:#ffaa00;border:1px solid rgba(255,170,0,.3)}
      .drn-s-proposed{background:rgba(0,212,255,.12);color:#00d4ff;border:1px solid rgba(0,212,255,.3)}
      .drn-s-future{background:rgba(155,89,255,.12);color:#b389ff;border:1px solid rgba(155,89,255,.3)}
      .drn-s-cancelled{background:rgba(255,68,68,.1);color:#ff6666;border:1px solid rgba(255,68,68,.25)}
      /* type colors */
      .drn-t-private{background:rgba(0,212,255,.1);color:#00d4ff}
      .drn-t-government{background:rgba(255,153,0,.1);color:#ff9900}
      .drn-t-startup{background:rgba(155,89,255,.1);color:#b389ff}
      .drn-t-joint{background:rgba(0,255,136,.1);color:#00ff88}
      /* category colors */
      .drn-c-combat{background:rgba(255,51,102,.1);color:#ff5577}
      .drn-c-surveillance{background:rgba(0,212,255,.1);color:#00d4ff}
      .drn-c-multi-role{background:rgba(255,220,0,.1);color:#ffdd00}
      .drn-c-commercial{background:rgba(100,200,100,.1);color:#88dd88}
      .drn-c-logistics{background:rgba(255,170,0,.1);color:#ffaa00}
      .drn-c-experimental{background:rgba(200,100,255,.1);color:#cc88ff}
    `;
    document.head.appendChild(el);
  }

  // ── Shell HTML ─────────────────────────────────────────────────────────────
  function _shell() {
    const countries = ['all', ...new Set(DB.map(d => d.country).sort())];
    const statuses  = ['all','operational','development','proposed','future','cancelled'];
    const types     = ['all','private','government','startup','joint'];
    const cats      = ['all','combat','surveillance','multi-role','commercial','logistics','experimental'];

    const cPills = countries.map(c =>
      `<button class="drn-pill${c==='all'?' active':''}" data-filter="country" data-val="${c}">${c==='all'?'ALL':c}</button>`
    ).join('');

    const sPills = statuses.map(s =>
      `<button class="drn-pill${s==='all'?' active':''}" data-filter="status" data-val="${s}">${s==='all'?'ALL STATUS':s.toUpperCase()}</button>`
    ).join('');

    const tPills = types.map(t =>
      `<button class="drn-pill${t==='all'?' active':''}" data-filter="type" data-val="${t}">${t==='all'?'ALL TYPES':t.toUpperCase()}</button>`
    ).join('');

    const catPills = cats.map(c =>
      `<button class="drn-pill${c==='all'?' active':''}" data-filter="category" data-val="${c}">${c==='all'?'ALL CATEG':c.toUpperCase()}</button>`
    ).join('');

    const op  = DB.filter(d=>d.status==='operational').length;
    const dev = DB.filter(d=>d.status==='development').length;
    const pro = DB.filter(d=>d.status==='proposed'||d.status==='future').length;

    return `
      <div class="drn-hdr">
        <div class="drn-hdr-row">
          <span style="font-size:15px">🛸</span>
          <span class="drn-title">GLOBAL DRONE MANUFACTURERS</span>
          <div class="drn-stats-inline">
            <span class="drn-stat-chip" style="color:#00ff88">${op} OPERATIONAL</span>
            <span class="drn-stat-chip" style="color:#ffaa00">${dev} IN DEV</span>
            <span class="drn-stat-chip" style="color:#00d4ff">${pro} PROPOSED</span>
            <span class="drn-stat-chip">${DB.length} TOTAL</span>
          </div>
        </div>
      </div>

      <div class="drn-filters">
        <div class="drn-row">
          <span class="drn-lbl">COUNTRY</span>
          <div style="display:flex;gap:3px;flex-wrap:wrap;flex:1">${cPills}</div>
        </div>
        <div class="drn-row">
          <span class="drn-lbl">STATUS</span>
          ${sPills}
        </div>
        <div class="drn-row">
          <span class="drn-lbl">TYPE</span>
          ${tPills}
          <span class="drn-lbl" style="margin-left:6px">CAT</span>
          ${catPills}
        </div>
        <div class="drn-row">
          <input class="drn-search" id="drn-search" placeholder="🔍 search company, program or country…" autocomplete="off">
          <span style="font-size:6.5px;color:#3d5a78;white-space:nowrap" id="drn-count">${DB.length} companies</span>
        </div>
      </div>

      <div class="drn-list" id="drn-list"></div>`;
  }

  // ── Render a card ──────────────────────────────────────────────────────────
  function _card(c) {
    const sCls = `drn-s-${c.status}`;
    const tCls = `drn-t-${c.type}`;
    const catCls = `drn-c-${c.category}`;

    const progs = c.programs.slice(0, 4).map(p =>
      `<span class="drn-prog">${p.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`
    ).join('');

    const sLabel = c.status === 'operational' ? '● OPERATIONAL'
                 : c.status === 'development' ? '◎ IN DEV'
                 : c.status === 'proposed'    ? '◌ PROPOSED'
                 : c.status === 'future'      ? '◌ FUTURE'
                 : c.status === 'cancelled'   ? '✕ CANCELLED'
                 : c.status.toUpperCase();

    return `<div class="drn-card">
      <div class="drn-card-top">
        <span class="drn-flag">${c.flag}</span>
        <div class="drn-name-block">
          <div class="drn-name">${c.name}</div>
          <div class="drn-hq">${c.hq}</div>
        </div>
        <div class="drn-badges">
          <span class="drn-badge ${sCls}">${sLabel}</span>
          <span class="drn-badge ${tCls}">${c.type.toUpperCase()}</span>
          <span class="drn-badge ${catCls}">${c.category.toUpperCase()}</span>
        </div>
      </div>
      <div class="drn-programs">${progs}</div>
      <div class="drn-desc">${c.desc}</div>
    </div>`;
  }

  // ── Filter + render ────────────────────────────────────────────────────────
  function _render() {
    let data = DB.slice();
    if (_country  !== 'all') data = data.filter(d => d.country  === _country);
    if (_status   !== 'all') data = data.filter(d => d.status   === _status);
    if (_type     !== 'all') data = data.filter(d => d.type     === _type);
    if (_category !== 'all') data = data.filter(d => d.category === _category);
    if (_search) {
      const q = _search.toLowerCase();
      data = data.filter(d =>
        d.name.toLowerCase().includes(q)    ||
        d.country.toLowerCase().includes(q) ||
        d.desc.toLowerCase().includes(q)    ||
        d.programs.some(p => p.toLowerCase().includes(q))
      );
    }

    const list  = document.getElementById('drn-list');
    const count = document.getElementById('drn-count');
    if (count) count.textContent = `${data.length} compan${data.length===1?'y':'ies'}`;
    if (!list) return;
    list.innerHTML = data.length
      ? data.map(_card).join('')
      : `<div style="text-align:center;padding:30px 10px;font-size:8px;color:#3d5a78">No companies match — try a different filter</div>`;
  }

  // ── Bind events ────────────────────────────────────────────────────────────
  function _bind(el) {
    el.addEventListener('click', e => {
      const pill = e.target.closest('.drn-pill');
      if (!pill) return;
      const { filter, val } = pill.dataset;
      el.querySelectorAll(`.drn-pill[data-filter="${filter}"]`).forEach(b => b.classList.remove('active'));
      pill.classList.add('active');
      if (filter === 'country')  _country  = val;
      if (filter === 'status')   _status   = val;
      if (filter === 'type')     _type     = val;
      if (filter === 'category') _category = val;
      _render();
    });

    const search = document.getElementById('drn-search');
    if (search) {
      search.addEventListener('input', () => {
        _search = search.value.trim();
        _render();
      });
    }
  }

  // ── Public init ────────────────────────────────────────────────────────────
  function init() {
    const el = document.getElementById('rptab-drones');
    if (!el || _inited) return;
    _inited = true;
    _css();
    el.innerHTML = _shell();
    _bind(el);
    _render();
  }

  return { init };
})();
