/* ── EDUCATION / ARMS INVENTORY DASHBOARD ──────────────────────
   OSINT-curated missile, drone, and defence inventories
   for 8 nations + live defence AI news feed                    */

const EDUCATION = (() => {
  let _tab       = 'missiles';  // missiles | drones | aircraft | news
  let _country   = 'all';
  let _newsCache = null;
  let _newsTs    = 0;
  const NEWS_TTL = 300_000;

  // ── OSINT Missile Inventory ─────────────────────────────────
  // Sources: IISS Military Balance 2024, SIPRI, Federation of American Scientists,
  //          Arms Control Association, publicly available MOD reports
  const MISSILE_INVENTORY = [
    // ─── USA ───
    { country:'USA', flag:'🇺🇸', name:'LGM-30G Minuteman III', type:'ICBM', range:'13,000 km',
      warhead:'W78/W87 (300–475 kt)', qty:'400 deployed', status:'operational',
      note:'Land-based ICBM; modernization via Sentinel program underway' },
    { country:'USA', flag:'🇺🇸', name:'UGM-133A Trident II D5', type:'SLBM', range:'12,000 km',
      warhead:'W76/W88 (100–475 kt)', qty:'~890 on 14 SSBNs', status:'operational',
      note:'Deployed on Ohio-class submarines; most accurate SLBM in service' },
    { country:'USA', flag:'🇺🇸', name:'AGM-86B ALCM', type:'Air-launched cruise', range:'2,400 km',
      warhead:'W80-1 (5–150 kt variable)', qty:'~500', status:'operational',
      note:'Carried by B-52H; W80-4 life-extension variant in development' },
    { country:'USA', flag:'🇺🇸', name:'BGM-109 Tomahawk', type:'LACM / SLCM', range:'1,600 km',
      warhead:'Conventional (1,000 lb)', qty:'~4,000 stockpile', status:'operational',
      note:'Block V SLCM-N nuclear variant approved under FY2022 NDAA' },
    { country:'USA', flag:'🇺🇸', name:'AGM-158B JASSM-ER', type:'Air-launched cruise', range:'925 km',
      warhead:'WDU-42/B (1,000 lb)', qty:'3,000+ ordered', status:'operational',
      note:'Low-observable; F-35, B-1B, B-52, F/A-18 compatible' },
    { country:'USA', flag:'🇺🇸', name:'AGM-183A ARRW', type:'Hypersonic (HGB)', range:'1,600+ km',
      warhead:'Conventional', qty:'prototype/testing', status:'development',
      note:'Air-breathing hypersonic; carried by B-52H; test failures 2022–23' },
    { country:'USA', flag:'🇺🇸', name:'Patriot PAC-3', type:'SAM / ABM', range:'35 km (MSE: 60 km)',
      warhead:'Hit-to-kill', qty:'16 battalions', status:'operational',
      note:'Upgrades to GaN radar + LTAMDS ongoing; widely exported' },

    // ─── Russia ───
    { country:'Russia', flag:'🇷🇺', name:'RS-28 Sarmat', type:'ICBM (Super-heavy)', range:'18,000 km',
      warhead:'Up to 15 MIRV (750 kt each)', qty:'~6 deployed (Uzhur)', status:'limited deployment',
      note:'Replacement for R-36M2 Voevoda; capable of polar trajectory' },
    { country:'Russia', flag:'🇷🇺', name:'RT-2PM2 Topol-M / RS-12M2', type:'ICBM', range:'11,000 km',
      warhead:'Single 800 kt', qty:'~60', status:'operational',
      note:'Road-mobile and silo-based; road version being replaced by RS-24 Yars' },
    { country:'Russia', flag:'🇷🇺', name:'RS-24 Yars', type:'ICBM (MIRV)', range:'11,000+ km',
      warhead:'4–6 MIRV (150–300 kt)', qty:'~170+', status:'operational',
      note:'Backbone of Russian land-based nuclear force; mobile & silo variants' },
    { country:'Russia', flag:'🇷🇺', name:'9M729 Novator (SSC-8)', type:'GLCM', range:'2,500+ km',
      warhead:'Conventional / nuclear capable', qty:'~100 launchers', status:'operational',
      note:'Caused INF Treaty collapse 2019; deployed in western Russia' },
    { country:'Russia', flag:'🇷🇺', name:'3M22 Zircon / Tsirkon', type:'Hypersonic ASCM', range:'1,000 km',
      warhead:'Conventional', qty:'~80 (est.)', status:'operational',
      note:'Mach 9 anti-ship; deployed on Admiral Gorshkov frigate from 2023' },
    { country:'Russia', flag:'🇷🇺', name:'Kh-47M2 Kinzhal', type:'Air-launched aero-ballistic', range:'2,000 km',
      warhead:'Conventional/nuclear (est. 100–500 kt)', qty:'~50 missiles (est.)', status:'operational',
      note:'Mach 10+; MiG-31K carrier; used in Ukraine from 2022' },
    { country:'Russia', flag:'🇷🇺', name:'Avangard HGV', type:'Hypersonic glide vehicle', range:'Global (ICBM-delivered)',
      warhead:'2 Mt (nuclear)', qty:'6 reg. on UR-100N UTTKh', status:'operational',
      note:'Manoeuvring re-entry; reportedly immune to existing missile defense' },
    { country:'Russia', flag:'🇷🇺', name:'S-400 Triumf', type:'SAM (long-range)', range:'400 km',
      warhead:'Hit-to-kill + frag', qty:'56+ battalions', status:'operational',
      note:'Widely exported; Turkey CAATSA controversy; can target aircraft, cruise missiles, TBMs' },

    // ─── India ───
    { country:'India', flag:'🇮🇳', name:'Agni-V', type:'ICBM-class (MRBM+)', range:'5,500–8,000 km',
      warhead:'Multiple RV / MIRV capable (est. 200–300 kt)', qty:'~50 (est.)', status:'operational',
      note:'MIRV variant tested March 2024; road-mobile canister; DRDO developed' },
    { country:'India', flag:'🇮🇳', name:'Agni-IV', type:'IRBM', range:'3,500–4,000 km',
      warhead:'Single (est. 200 kt)', qty:'~20 (est.)', status:'operational',
      note:'Two-stage solid fuel; road-mobile; targets Pakistan & western China' },
    { country:'India', flag:'🇮🇳', name:'BrahMos', type:'Supersonic cruise missile', range:'290–500 km (Block III: 800 km)',
      warhead:'200–300 kg conventional', qty:'~200+ in service', status:'operational',
      note:'Joint India-Russia; Mach 2.8; land/sea/air launched; exported to Philippines' },
    { country:'India', flag:'🇮🇳', name:'BrahMos-NG', type:'Next-gen cruise missile', range:'290–800 km',
      warhead:'Conventional', qty:'development', status:'development',
      note:'Lightweight variant for Su-30MKI, Tejas, naval vessels; trials 2024' },
    { country:'India', flag:'🇮🇳', name:'K-4 / K-15 Sagarika', type:'SLBM', range:'700–3,500 km',
      warhead:'Nuclear capable', qty:'Arihant SSBN', status:'operational',
      note:'K-4: 3,500 km range; K-15: 700 km; deployed on INS Arihant' },
    { country:'India', flag:'🇮🇳', name:'Pralay', type:'Quasi-ballistic missile (SRBM)', range:'150–500 km',
      warhead:'Conventional 350–700 kg', qty:'~120 ordered', status:'operational',
      note:'Manoeuvrable; China-Pakistan focus; inducted Indian Army 2023' },
    { country:'India', flag:'🇮🇳', name:'Nirbhay', type:'Subsonic LACM', range:'1,000–1,500 km',
      warhead:'Conventional', qty:'development', status:'development',
      note:'Indigenous cruise missile; turbofan powered; multiple test failures; revised for 2025 IOP' },
    { country:'India', flag:'🇮🇳', name:'S-400 Triumf', type:'SAM (long-range)', range:'400 km',
      warhead:'Hit-to-kill + frag', qty:'5 squadrons (deliveries ongoing)', status:'operational',
      note:'Contracted 2018 ($5.43B); deliveries 2021–2024; CAATSA waiver granted' },

    // ─── China ───
    { country:'China', flag:'🇨🇳', name:'DF-41 (CSS-X-10)', type:'ICBM (MIRV)', range:'12,000–15,000 km',
      warhead:'10 MIRV (est. 200–400 kt)', qty:'~120 (est. 2024)', status:'operational',
      note:'Road-mobile + silo; DoD 2024 estimates China will have 1,500 warheads by 2035' },
    { country:'China', flag:'🇨🇳', name:'DF-5B', type:'ICBM (silo-based)', range:'13,000 km',
      warhead:'5 MIRV (5 Mt)', qty:'~20', status:'operational',
      note:'Liquid fuel; silo-based; major payload capacity; oldest Chinese ICBM still deployed' },
    { country:'China', flag:'🇨🇳', name:'DF-21D', type:'ASBM (carrier killer)', range:'1,800 km',
      warhead:'Conventional maneuverable RV', qty:'~100+', status:'operational',
      note:'World\'s first deployed ASBM; specific threat to USN CSGs; road-mobile' },
    { country:'China', flag:'🇨🇳', name:'DF-26', type:'IRBM (dual-capable)', range:'4,000 km',
      warhead:'Conventional + nuclear capable', qty:'~200', status:'operational',
      note:'"Guam killer"; fast retargeting; conventional strike + anti-ship role' },
    { country:'China', flag:'🇨🇳', name:'DF-17', type:'MRV + HGV', range:'1,800–2,500 km',
      warhead:'Conventional HGV + nuclear capable', qty:'~72+', status:'operational',
      note:'DF-ZF HGV; Mach 10; designed to defeat THAAD/Patriot; debuted 2019 parade' },
    { country:'China', flag:'🇨🇳', name:'YJ-12 / YJ-18', type:'Supersonic ASCM', range:'400–540 km',
      warhead:'Conventional', qty:'~600 total (est.)', status:'operational',
      note:'H-6 and submarine launched; threat to carrier groups; Mach 2–3 terminal' },
    { country:'China', flag:'🇨🇳', name:'JL-3', type:'SLBM', range:'10,000+ km',
      warhead:'MIRV capable', qty:'Type 096 SSBN (in construction)', status:'development',
      note:'New-generation SLBM for Type 096; JL-2 currently deployed on Type 094' },

    // ─── Israel ───
    { country:'Israel', flag:'🇮🇱', name:'Jericho III', type:'ICBM-class (IRBM+)', range:'6,500–11,500 km',
      warhead:'Nuclear (est. 750 kt–1 Mt)', qty:'~25–50 est.', status:'operational',
      note:'Undisclosed nuclear capability; solid fuel; silo or mobile; estimated 90 warheads total' },
    { country:'Israel', flag:'🇮🇱', name:'Delilah', type:'Loitering cruise missile', range:'250 km',
      warhead:'30 kg conventional', qty:'Active service', status:'operational',
      note:'Air-launched; man-in-loop; can abort; used against radar and comms' },
    { country:'Israel', flag:'🇮🇱', name:'Popeye Turbo (AGM-142)', type:'ALCM', range:'320 km',
      warhead:'340 kg conventional / SLCM nuclear variant rumoured', qty:'Several hundred', status:'operational',
      note:'F-16I / F-15I launched; SLCM-T variant suspected on Dolphin submarines' },
    { country:'Israel', flag:'🇮🇱', name:'Iron Dome', type:'SHORAD / CRAM', range:'4–70 km',
      warhead:'Hit-to-kill interceptor (Tamir)', qty:'10+ batteries', status:'operational',
      note:'93%+ interception rate claimed; $50k per intercept vs $800 RPG; C-RAM for mortars' },
    { country:'Israel', flag:'🇮🇱', name:'David\'s Sling', type:'SAM (medium-high alt)', range:'300 km',
      warhead:'Stunner hit-to-kill', qty:'2+ batteries', status:'operational',
      note:'Jointly with Raytheon; intercepts ballistic missiles, cruise missiles, large rockets' },
    { country:'Israel', flag:'🇮🇱', name:'Arrow-3', type:'ABM (exo-atmospheric)', range:'2,400 km',
      warhead:'Hit-to-kill in space', qty:'2 batteries + Germany deal', status:'operational',
      note:'World\'s only operational exo-atmospheric interceptor; Germany purchased 2023 ($3.5B)' },
    { country:'Israel', flag:'🇮🇱', name:'Barak-8 (MR-SAM)', type:'Naval/land SAM', range:'70–100 km',
      warhead:'Blast frag hit-to-kill', qty:'Indian Navy + IAF', status:'operational',
      note:'Joint Israel-India development (IAI + DRDO); used by India, Israel, Azerbaijan' },

    // ─── Pakistan ───
    { country:'Pakistan', flag:'🇵🇰', name:'Shaheen-III', type:'MRBM', range:'2,750 km',
      warhead:'Nuclear (est. 40 kt–1 Mt)', qty:'~30 est.', status:'operational',
      note:'Solid fuel; road mobile; can reach Andaman & Nicobar Islands' },
    { country:'Pakistan', flag:'🇵🇰', name:'Shaheen-II (Hatf-6)', type:'MRBM', range:'2,000 km',
      warhead:'Nuclear capable', qty:'~50', status:'operational',
      note:'Deployed; mobile launcher; two-stage solid fuel; India-focused' },
    { country:'Pakistan', flag:'🇵🇰', name:'Ghauri (Hatf-5)', type:'MRBM', range:'1,300 km',
      warhead:'Nuclear (est. 5–12 kt to 200 kt)', qty:'~25–50', status:'operational',
      note:'Liquid fuel; Rodong-derivative (N. Korea); longer range Ghauri-III unconfirmed' },
    { country:'Pakistan', flag:'🇵🇰', name:'Babur-3 SLCM', type:'SLCM (LACM)', range:'450 km',
      warhead:'Nuclear capable', qty:'Agosta 90B subs (est.)', status:'operational',
      note:'Second-strike capability; ship / submarine launched; tests 2017–2020' },
    { country:'Pakistan', flag:'🇵🇰', name:'Nasr (Hatf-9)', type:'SRBM (tactical)', range:'70 km',
      warhead:'Nuclear (tactical, low yield)', qty:'~100+', status:'operational',
      note:'Counter India\'s Cold Start Doctrine; multiple warhead salvo; controversial tactical nuke' },
    { country:'Pakistan', flag:'🇵🇰', name:'HQ-9/BE', type:'SAM (long-range)', range:'200 km',
      warhead:'Hit-to-kill + frag', qty:'6+ batteries', status:'operational',
      note:'Chinese S-300 equivalent; acquired 2015; additional batteries ordered 2023' },

    // ─── North Korea ───
    { country:'North Korea', flag:'🇰🇵', name:'Hwasong-17', type:'ICBM (Super-heavy)', range:'15,000+ km',
      warhead:'Nuclear (est. multi-Mt or MIRV capable)', qty:'~20 launchers (est.)', status:'operational',
      note:'World\'s largest road-mobile ICBM; Mach 22 reentry; tested Nov 2022, Feb 2023' },
    { country:'North Korea', flag:'🇰🇵', name:'Hwasong-15', type:'ICBM', range:'13,000 km',
      warhead:'Single large nuclear warhead', qty:'~15 (est.)', status:'operational',
      note:'Can reach all of continental US; tested Nov 2017; silo trials 2023' },
    { country:'North Korea', flag:'🇰🇵', name:'Hwasong-12', type:'IRBM', range:'5,000 km',
      warhead:'Nuclear capable', qty:'~20 est.', status:'operational',
      note:'Can reach Guam; fired over Japan 2017; road mobile Transporter-Erector-Launcher (TEL)' },
    { country:'North Korea', flag:'🇰🇵', name:'KN-23 (Hwasong-11Ra)', type:'Quasi-ballistic SRBM', range:'600–900 km',
      warhead:'Nuclear capable (0.5–2 kt tactical)', qty:'~100+ est.', status:'operational',
      note:'Maneuverable; depressed trajectory; "Korean Iskander"; can evade PAC-3' },
    { country:'North Korea', flag:'🇰🇵', name:'Pukguksong-3/4/5', type:'SLBM', range:'2,000–3,000 km',
      warhead:'Nuclear capable', qty:'GORAE/SINPO-C SSBN', status:'development/operational',
      note:'Solid fuel; longer range variants in development; potential 2nd strike force' },
    { country:'North Korea', flag:'🇰🇵', name:'Haeil / Haeil-2', type:'Nuclear underwater drone (UUV)', range:'~1,000 km',
      warhead:'Nuclear (est. massive underwater detonation)', qty:'prototype/testing', status:'development',
      note:'Claimed ocean nuclear torpedo; similar concept to Russia\'s Poseidon; verified tests unclear' },

    // ─── Japan ───
    { country:'Japan', flag:'🇯🇵', name:'Type 12 (改) SSM', type:'Extended-range ASCM/LACM', range:'1,000+ km',
      warhead:'Conventional (est. 300–450 kg)', qty:'~1,000 ordered (FY2023–27)', status:'procurement',
      note:'Counterattack capability declared 2022; air/ship/land launched versions; domestic production scaling' },
    { country:'Japan', flag:'🇯🇵', name:'12式地対艦誘導弾 (Baseline)', type:'ASCM', range:'200 km',
      warhead:'Conventional', qty:'~200+ deployed', status:'operational',
      note:'Installed on GSDF, Type 88 replacement; island chain defense focus' },
    { country:'Japan', flag:'🇯🇵', name:'PAC-3 MSE', type:'SAM / ABM', range:'60 km',
      warhead:'Hit-to-kill', qty:'24 fire units', status:'operational',
      note:'Upgraded from PAC-2; Kasado FH96 units; protects Tokyo, Okinawa, air bases' },
    { country:'Japan', flag:'🇯🇵', name:'SM-3 Block IIA', type:'ABM (exo-atmospheric)', range:'2,500 km',
      warhead:'Hit-to-kill (EKV)', qty:'Aegis DDGs (8+)', status:'operational',
      note:'Joint US-Japan development; deployed on Atago and Maya class; Aegis Ashore cancelled' },
    { country:'Japan', flag:'🇯🇵', name:'Hypersonic Gliding Projectile (HGP)', type:'Hypersonic (HGV)', range:'500+ km',
      warhead:'Conventional', qty:'development', status:'development',
      note:'ATLA development; first test 2024; island defense vs amphibious assault' },
    { country:'Japan', flag:'🇯🇵', name:'Stand-off Electronic Warfare (SOEW)', type:'Electronic attack', range:'classified',
      warhead:'Electronic payload', qty:'development', status:'development',
      note:'Kawasaki/Mitsubishi; F-2 + F-35 launched; part of 5-year $315B defense buildup' },
  ];

  // ── OSINT Drone Inventory ───────────────────────────────────
  // Sources: IISS, SIPRI, Drones-of-India OSINT, APA, ACIG, open government procurement records
  const DRONE_INVENTORY = [
    // USA
    { country:'USA', flag:'🇺🇸', name:'MQ-9B Reaper', type:'MALE UCAV', range:'6,000 km ferry',
      qty:'~300 total USAF+DoD', status:'operational',
      note:'Hellfire, GBU-38, Viper Strike; 14+ hours loiter; 27 countries use or ordered' },
    { country:'USA', flag:'🇺🇸', name:'RQ-4 Global Hawk', type:'HALE ISR', range:'22,780 km',
      qty:'~36 (USAF)', status:'operational',
      note:'Triton naval variant (MQ-4C); replaced U-2 in some roles; SIGINT/IMINT payload' },
    { country:'USA', flag:'🇺🇸', name:'MQ-1C Gray Eagle (ER)', type:'MALE UCAV', range:'4,000 km',
      qty:'~160 (US Army)', status:'operational',
      note:'Hellfire + GBU-44; requested by Ukraine; JLTV-compatible SATCOM; upgraded to GE-ER' },
    { country:'USA', flag:'🇺🇸', name:'X-47B / MQ-25 Stingray', type:'UCAS / tanker drone', range:'Mission-radius classified',
      qty:'7 MQ-25 (carrier-based)', status:'development/limited',
      note:'MQ-25: F/A-18 aerial refueling carrier drone; X-47B retired after deck trials' },
    { country:'USA', flag:'🇺🇸', name:'AeroVironment Switchblade 600', type:'Loitering munition', range:'40 km',
      qty:'2,000+ to Ukraine; US stockpile est.', status:'operational',
      note:'Anti-armor loitering munition; 40 min loiter; 8 kg warhead; man-portable' },
    { country:'USA', flag:'🇺🇸', name:'Kratos XQ-58A Valkyrie', type:'Loyal wingman UCAV', range:'3,700+ km',
      qty:'prototype fleet', status:'development',
      note:'Expendable attritable; F-22/F-35 wingman; launched Mako UCAV from bay; $3M unit cost' },

    // Russia
    { country:'Russia', flag:'🇷🇺', name:'Shahed-136 (Geran-2)', type:'Loitering munition / kamikaze', range:'2,500 km',
      qty:'~4,000+ acquired from Iran', status:'operational',
      note:'Iranian origin; 50 kg HE warhead; used mass strikes on Ukraine infrastructure 2022–2025' },
    { country:'Russia', flag:'🇷🇺', name:'Orion (Pacer)', type:'MALE UCAV', range:'250 km',
      qty:'~30 (est.)', status:'limited operational',
      note:'Russia\'s first domestic UCAV; strikes in Syria & Ukraine; Kronshtadt improved variant' },
    { country:'Russia', flag:'🇷🇺', name:'S-70 Okhotnik-B', type:'Heavy UCAS (stealth)', range:'5,000 km',
      qty:'prototype', status:'development',
      note:'Flying wing; Su-57 wingman; reported Mach 1 capable; armed tests 2022–2023' },
    { country:'Russia', flag:'🇷🇺', name:'Lancet-3', type:'Loitering munition', range:'40 km',
      qty:'~1,000/month est. production', status:'operational',
      note:'Most effective Russian drone in Ukraine; anti-armor; 3 kg HE or HEAT warhead; low RCS' },

    // India
    { country:'India', flag:'🇮🇳', name:'MQ-9B SeaGuardian / SkyGuardian', type:'MALE UCAV (ISR+)', range:'6,000 km',
      qty:'31 ordered ($4B MQ-9B deal)', status:'procurement',
      note:'$4B deal finalized Oct 2023; 15 Navy + 8 Army + 8 IAF; maritime strike + ISR' },
    { country:'India', flag:'🇮🇳', name:'Rustom-2 (TAPAS BH-201)', type:'MALE ISR', range:'250 km radius',
      qty:'20+ trials; limited IOC', status:'development',
      note:'DRDO developed; persistent ISR; 24h loiter; delayed IOC; armed variant RUSTOM-H planned' },
    { country:'India', flag:'🇮🇳', name:'CATS Warrior', type:'Loyal wingman UCAV', range:'~1,500 km',
      qty:'HAL/HFCL prototype', status:'development',
      note:'Combat Air Teaming System; Tejas + CATS Hunter wingman; swarm integration target' },
    { country:'India', flag:'🇮🇳', name:'SkyStriker (Elbit)', type:'Loitering munition', range:'100 km',
      qty:'~100+ procured', status:'operational',
      note:'Israeli origin; used in border areas; 5–10 kg warhead; 2 hr loiter; ₹800 crore deal' },
    { country:'India', flag:'🇮🇳', name:'Harop / Harpy NG', type:'Anti-radiation loitering munition', range:'1,000 km',
      qty:'~100 (est.)', status:'operational',
      note:'Israeli IAI; autonomous SEAD; homing on radar emissions; used 2019 vs Pakistan radar' },
    { country:'India', flag:'🇮🇳', name:'Abhyas (DRDO)', type:'HEAT target drone / UCAV base', range:'150 km',
      qty:'50+ delivered', status:'operational',
      note:'High-speed aerial target; gas-turbine; also testbed for loitering munition development' },
    { country:'India', flag:'🇮🇳', name:'nEUROn / Ghatak UCAV', type:'Stealth UCAV', range:'classified',
      qty:'demonstrator', status:'development',
      note:'DRDO advanced project; delta flying wing; parallel to Tejas development timeline' },

    // China
    { country:'China', flag:'🇨🇳', name:'Wing Loong II (CASC)', type:'MALE UCAV', range:'4,000 km',
      qty:'100+ in PLAAF; 10+ export customers', status:'operational',
      note:'Exported to UAE, Pakistan, Saudi, Ethiopia, Myanmar; 480 kg payload; Blue Arrow-7 ATGM' },
    { country:'China', flag:'🇨🇳', name:'CH-5 Rainbow (CASC)', type:'MALE UCAV', range:'6,500 km',
      qty:'50+ PLAAF/PLA; widely exported', status:'operational',
      note:'1,000 kg payload; longest Chinese UCAV endurance (60 hr); anti-ship role tested' },
    { country:'China', flag:'🇨🇳', name:'TB-001 Twin-Tailed Scorpion', type:'MALE UCAV', range:'6,000 km',
      qty:'PLA operational', status:'operational',
      note:'Twin boom; ISR + strike; 12 hardpoints; 1,800 kg payload; recon-strike integration' },
    { country:'China', flag:'🇨🇳', name:'GJ-11 (Sharp Sword)', type:'UCAS (stealth)', range:'classified',
      qty:'limited production (est.)', status:'limited operational',
      note:'Flying wing; carrier and ground base; 2 kt bomb bay; J-35 wingman candidate' },
    { country:'China', flag:'🇨🇳', name:'WZ-8 (supersonic recon)', type:'HALE ISR / hypersonic drone', range:'7,000+ km (air launched)',
      qty:'~few dozen (H-6M launched)', status:'operational',
      note:'Mach 4; air-launched from H-6M; imagery drone over Taiwan Strait; paraded 2019' },

    // Israel
    { country:'Israel', flag:'🇮🇱', name:'Heron TP (Eitan)', type:'HALE UCAV', range:'7,400 km',
      qty:'~20 (IAF)', status:'operational',
      note:'Largest Israeli UAV; turboprop; MALE+ altitude; EW + ISR + strike; armed ops in Gaza/Lebanon' },
    { country:'Israel', flag:'🇮🇱', name:'Hermes 900', type:'MALE ISR/UCAV', range:'1,000 km radius',
      qty:'100+ inc exports to 8+ countries', status:'operational',
      note:'Elbit Systems; widely exported; Azerbaijan decisive use vs Armenia 2020' },
    { country:'Israel', flag:'🇮🇱', name:'Harop (HARPY NG)', type:'Anti-radiation loitering munition', range:'1,000 km',
      qty:'Active Israel + India + Azerbaijan + more', status:'operational',
      note:'Autonomous SEAD; no human-in-loop (LAWS); extremely effective vs radar-emitting air defense' },
    { country:'Israel', flag:'🇮🇱', name:'Rotem-L', type:'Tactical loitering munition', range:'10 km',
      qty:'Classified', status:'operational',
      note:'Man-portable; 4-rotor with shaped charge; used by Israeli special forces; 30 min loiter' },
    { country:'Israel', flag:'🇮🇱', name:'Lanius', type:'Autonomous indoor swarm drone', range:'<1 km',
      qty:'prototype', status:'development',
      note:'Rafael + Elbit; explosive charge; AI-enabled target identification; CQB focus' },

    // Pakistan
    { country:'Pakistan', flag:'🇵🇰', name:'AKINCI (Bayraktar)', type:'HALE UCAV', range:'7,500 km',
      qty:'3+ delivered 2023', status:'operational',
      note:'Turkish origin; 1,350 kg payload; Mach 0.45; MAM-C/L + SOM cruise missile capable' },
    { country:'Pakistan', flag:'🇵🇰', name:'Bayraktar TB2', type:'MALE UCAV', range:'300 km radius',
      qty:'~24 (est.)', status:'operational',
      note:'Turkish origin; MAM-L smart munition; widely proven in combat; 27 hr endurance' },
    { country:'Pakistan', flag:'🇵🇰', name:'BURRAQ (NESCOM)', type:'Domestic MALE UCAV', range:'Classified',
      qty:'PAF operational', status:'operational',
      note:'Based on Chinese CH-3 design; Barq laser-guided munition; domestic assembly' },
    { country:'Pakistan', flag:'🇵🇰', name:'Shahpar-I/II', type:'Tactical ISR UAV', range:'250 km',
      qty:'~50+ delivered', status:'operational',
      note:'NESCOM domestic; ISR + limited strike; Shahpar-II can carry micro-munitions' },

    // North Korea
    { country:'North Korea', flag:'🇰🇵', name:'Shahed-like kamikaze drones', type:'Loitering munition', range:'est. 1,000–1,500 km',
      qty:'~1,000s claimed (supplied to Russia)', status:'operational',
      note:'Supplied to Russia for Ukraine war per US/Ukraine intel; indigenous or Iranian-licensed' },
    { country:'North Korea', flag:'🇰🇵', name:'Saetbyol-4/9 (civilian/dual-use)', type:'Quadcopter ISR', range:'~30 km',
      qty:'Multiple filmed in parades/operations', status:'operational',
      note:'Commercial-grade DJI-type; used for ISR/leaflet drop; vulnerable to EW' },
    { country:'North Korea', flag:'🇰🇵', name:'WPK Strategic UAV', type:'HALE ISR (claimed)', range:'claimed strategic',
      qty:'limited (est.)', status:'development',
      note:'Kim Jong Un unveiled new strategic UAV 2023; US Global Hawk-like appearance; unverified capability' },

    // Japan
    { country:'Japan', flag:'🇯🇵', name:'RQ-4B Global Hawk', type:'HALE ISR', range:'22,780 km',
      qty:'3 (JASDF)', status:'operational',
      note:'US-supplied; based at Misawa; primary ISR over NE Asia; NK missile monitoring' },
    { country:'Japan', flag:'🇯🇵', name:'Wingman UCAV (indigenous)', type:'Loyal wingman UCAV', range:'classified',
      qty:'prototype', status:'development',
      note:'ATLA project; F-35 + F-2X companion; part of 43.5T yen defense buildup; 2035 target IOC' },
    { country:'Japan', flag:'🇯🇵', name:'Ninja (mine countermeasure UUV)', type:'Maritime UUV', range:'classified',
      qty:'JMSDF trials', status:'development',
      note:'Mine clearing focus; NEC + TRDI; part of underwater domain awareness (UDA) expansion' },
  ];

  // ── Render helpers ──────────────────────────────────────────
  const STATUS_STYLE = {
    operational:        'color:#00ff88;background:rgba(0,255,136,0.08);border:1px solid rgba(0,255,136,0.3)',
    'limited operational': 'color:#ffcc00;background:rgba(255,204,0,0.08);border:1px solid rgba(255,204,0,0.3)',
    development:        'color:#00b4ff;background:rgba(0,180,255,0.08);border:1px solid rgba(0,180,255,0.3)',
    procurement:        'color:#ff9933;background:rgba(255,153,51,0.08);border:1px solid rgba(255,153,51,0.3)',
    'limited deployment': 'color:#ffaa00;background:rgba(255,170,0,0.08);border:1px solid rgba(255,170,0,0.3)',
  };

  function _statusBadge(status) {
    const s = (status || 'unknown').toLowerCase();
    const style = STATUS_STYLE[s] || 'color:#8a9aaa;border:1px solid #2a3a4a';
    return `<span class="edu-status-badge" style="${style}">${status.toUpperCase()}</span>`;
  }

  const COUNTRIES = [
    { id:'all',          label:'ALL',    flag:'🌍' },
    { id:'USA',          label:'USA',    flag:'🇺🇸' },
    { id:'Russia',       label:'RUS',    flag:'🇷🇺' },
    { id:'China',        label:'CHN',    flag:'🇨🇳' },
    { id:'India',        label:'IND',    flag:'🇮🇳' },
    { id:'Israel',       label:'ISR',    flag:'🇮🇱' },
    { id:'Pakistan',     label:'PAK',    flag:'🇵🇰' },
    { id:'North Korea',  label:'DPRK',   flag:'🇰🇵' },
    { id:'Japan',        label:'JPN',    flag:'🇯🇵' },
  ];

  function _countryBar() {
    return `<div class="edu-country-bar">
      ${COUNTRIES.map(c => `
        <button class="edu-country-btn${_country === c.id ? ' active' : ''}"
          onclick="EDUCATION.setCountry('${c.id}')">
          ${c.flag} ${c.label}
        </button>`).join('')}
    </div>`;
  }

  function _renderMissiles() {
    const items = _country === 'all'
      ? MISSILE_INVENTORY
      : MISSILE_INVENTORY.filter(m => m.country === _country);

    if (!items.length) return `<div class="edu-empty">No missile data for selected country</div>`;

    // Group by country
    const groups = {};
    items.forEach(m => {
      if (!groups[m.country]) groups[m.country] = [];
      groups[m.country].push(m);
    });

    return Object.entries(groups).map(([country, missiles]) => `
      <div class="edu-country-section">
        <div class="edu-country-hdr">${missiles[0].flag} ${country.toUpperCase()}</div>
        ${missiles.map(m => `
          <div class="edu-item-card">
            <div class="edu-item-top">
              <span class="edu-item-name">${m.name}</span>
              ${_statusBadge(m.status)}
              <span class="edu-type-tag">${m.type}</span>
            </div>
            <div class="edu-item-specs">
              <span>📏 ${m.range}</span>
              ${m.warhead ? `<span>💥 ${m.warhead}</span>` : ''}
              <span>📦 ${m.qty}</span>
            </div>
            <div class="edu-item-note">${m.note}</div>
          </div>`).join('')}
      </div>`).join('');
  }

  function _renderDrones() {
    const items = _country === 'all'
      ? DRONE_INVENTORY
      : DRONE_INVENTORY.filter(d => d.country === _country);

    if (!items.length) return `<div class="edu-empty">No drone data for selected country</div>`;

    const groups = {};
    items.forEach(d => {
      if (!groups[d.country]) groups[d.country] = [];
      groups[d.country].push(d);
    });

    return Object.entries(groups).map(([country, drones]) => `
      <div class="edu-country-section">
        <div class="edu-country-hdr">${drones[0].flag} ${country.toUpperCase()}</div>
        ${drones.map(d => `
          <div class="edu-item-card">
            <div class="edu-item-top">
              <span class="edu-item-name">${d.name}</span>
              ${_statusBadge(d.status)}
              <span class="edu-type-tag">${d.type}</span>
            </div>
            <div class="edu-item-specs">
              <span>📏 ${d.range}</span>
              <span>📦 ${d.qty}</span>
            </div>
            <div class="edu-item-note">${d.note}</div>
          </div>`).join('')}
      </div>`).join('');
  }

  function _renderNews(data) {
    if (!data) return `<div class="edu-loading">⟳ Loading defence AI news…</div>`;
    const items = data.articles || [];
    if (!items.length) return `<div class="edu-empty">No defence AI news available</div>`;
    return `
      <div class="edu-news-meta">
        ${items.length} articles · sorted by date · sources: HackerNews, TechCrunch, RSS
        <button class="edu-refresh-btn" onclick="EDUCATION.refreshNews()">↻ Refresh</button>
      </div>
      ${items.map(a => {
        const d = a.date ? new Date(a.date) : null;
        const dateStr = d ? d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' }) : '—';
        const timeStr = d ? d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : '';
        return `<a class="edu-news-item" href="${a.url || '#'}" target="_blank" rel="noopener">
          <div class="edu-news-top">
            <span class="edu-news-src">${a.source || ''}</span>
            <span class="edu-news-cat" style="${_catStyle(a.category)}">${(a.category || 'defence').toUpperCase()}</span>
            <span class="edu-news-date">${dateStr} ${timeStr}</span>
          </div>
          <div class="edu-news-title">${a.title || ''}</div>
        </a>`;
      }).join('')}`;
  }

  function _catStyle(cat) {
    const map = {
      ai:        'color:#00d4ff',
      missile:   'color:#ff4444',
      drone:     'color:#ff9933',
      cyber:     'color:#aa44ff',
      space:     'color:#44ccff',
      india:     'color:#ff9933',
      general:   'color:#8a9aaa',
    };
    return map[(cat||'').toLowerCase()] || map.general;
  }

  function _renderSummary() {
    const missileCounts = {};
    const droneCounts   = {};
    MISSILE_INVENTORY.forEach(m => { missileCounts[m.country] = (missileCounts[m.country]||0)+1; });
    DRONE_INVENTORY.forEach(d => {   droneCounts[d.country]   = (droneCounts[d.country]||0)+1; });

    const countries = COUNTRIES.filter(c => c.id !== 'all');
    return `
      <div class="edu-summary-grid">
        ${countries.map(c => `
          <div class="edu-summary-card" onclick="EDUCATION.setCountry('${c.id}')">
            <div class="edu-sum-flag">${c.flag}</div>
            <div class="edu-sum-name">${c.label}</div>
            <div class="edu-sum-stats">
              <span class="edu-sum-stat">🚀 ${missileCounts[c.id] || 0}</span>
              <span class="edu-sum-stat">🛸 ${droneCounts[c.id]   || 0}</span>
            </div>
          </div>`).join('')}
      </div>
      <div class="edu-osint-note">
        ⚠ Data from open-source OSINT: IISS Military Balance 2024, SIPRI, FAS, Arms Control Association,
        publicly available MOD / procurement reports. Classified capabilities not included.
        Figures are estimates unless otherwise noted.
      </div>
      <div class="edu-sources-list">
        <div class="edu-src-hdr">📚 PRIMARY SOURCES</div>
        <a class="edu-src-link" href="https://duorope.github.io/Drones-of-India/" target="_blank" rel="noopener">Drones of India (OSINT GitHub)</a>
        <a class="edu-src-link" href="https://fas.org/issues/nuclear-weapons/" target="_blank" rel="noopener">Federation of American Scientists — Nuclear</a>
        <a class="edu-src-link" href="https://www.sipri.org/databases/milex" target="_blank" rel="noopener">SIPRI Military Expenditure DB</a>
        <a class="edu-src-link" href="https://www.armscontrol.org/factsheets" target="_blank" rel="noopener">Arms Control Association Fact Sheets</a>
        <a class="edu-src-link" href="https://www.iiss.org/publications/the-military-balance/" target="_blank" rel="noopener">IISS Military Balance 2024</a>
        <a class="edu-src-link" href="https://breakingdefense.com" target="_blank" rel="noopener">Breaking Defense</a>
        <a class="edu-src-link" href="https://www.thedrive.com/the-war-zone" target="_blank" rel="noopener">The War Zone (The Drive)</a>
      </div>`;
  }

  // ── Main render ─────────────────────────────────────────────
  function _render() {
    const body = document.getElementById('education-body');
    if (!body) return;

    let content = '';
    if (_tab === 'overview') {
      content = _renderSummary();
    } else if (_tab === 'missiles') {
      content = _countryBar() + _renderMissiles();
    } else if (_tab === 'drones') {
      content = _countryBar() + _renderDrones();
    } else if (_tab === 'news') {
      content = _renderNews(_newsCache);
    }
    body.innerHTML = content;
  }

  // ── Fetch defence AI news ───────────────────────────────────
  async function _fetchNews() {
    const now = Date.now();
    if (_newsCache && now - _newsTs < NEWS_TTL) { _render(); return; }
    try {
      const r    = await fetch('/api/defence-ai-news');
      const data = await r.json();
      _newsCache = data;
      _newsTs    = now;
      if (_tab === 'news') _render();
    } catch (e) { console.warn('[Education] news fetch error:', e.message); }
  }

  // ── Public API ──────────────────────────────────────────────
  function setTab(t) {
    _tab = t;
    document.querySelectorAll('.edu-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.eduTab === t));
    if (t === 'news' && !_newsCache) {
      document.getElementById('education-body').innerHTML = '<div class="edu-loading">⟳ Loading defence AI news…</div>';
      _fetchNews();
      return;
    }
    _render();
  }

  function setCountry(c) {
    _country = c;
    _render();
  }

  function refreshNews() {
    _newsCache = null;
    document.getElementById('education-body').innerHTML = '<div class="edu-loading">⟳ Refreshing…</div>';
    _fetchNews();
  }

  function init() {
    _render();
  }

  return { init, setTab, setCountry, refreshNews };
})();
