/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — AI Infrastructure Layer
   Data: Public announcements, press releases, corporate filings, OSINT
   Covers: Meta · Amazon AWS · Google Cloud · Microsoft Azure · Apple · NVIDIA
           CoreWeave · Oracle · IBM · Equinix · Jio · Tata · NTT · CtrlS · STT GDC
   Countries: USA · Canada · India · UK
════════════════════════════════════════════════════════════════════════════ */
const AI_INFRA = (() => {
  let map     = null;
  let enabled = false;
  let markers = [];
  let _filter = 'ALL'; // company filter

  // ── Company config ─────────────────────────────────────────────────────────
  const CO = {
    META:   { color:'#1877f2', short:'META', name:'Meta Platforms',     flag:'🇺🇸' },
    AWS:    { color:'#ff9900', short:'AWS',  name:'Amazon Web Services', flag:'🇺🇸' },
    GCP:    { color:'#34a853', short:'GCP',  name:'Google Cloud',        flag:'🇺🇸' },
    AZURE:  { color:'#00a4ef', short:'AZ',   name:'Microsoft Azure',     flag:'🇺🇸' },
    APPLE:  { color:'#8e8e93', short:'APPL', name:'Apple',               flag:'🇺🇸' },
    NVDA:   { color:'#76b900', short:'NVDA', name:'NVIDIA',              flag:'🇺🇸' },
    CWVE:   { color:'#7c3aed', short:'CW',   name:'CoreWeave',           flag:'🇺🇸' },
    ORACLE: { color:'#f80000', short:'OCI',  name:'Oracle Cloud',        flag:'🇺🇸' },
    IBM:    { color:'#1f70c1', short:'IBM',  name:'IBM Cloud',           flag:'🇺🇸' },
    EQUINIX:{ color:'#ff4a00', short:'EQX',  name:'Equinix',             flag:'🇺🇸' },
    JIO:    { color:'#0f5499', short:'JIO',  name:'Jio Platforms',       flag:'🇮🇳' },
    TATA:   { color:'#003087', short:'TATA', name:'Tata Communications', flag:'🇮🇳' },
    NTT:    { color:'#cf0000', short:'NTT',  name:'NTT Ltd',             flag:'🇯🇵' },
    CTRLS:  { color:'#00b050', short:'CTRL', name:'CtrlS Datacenters',   flag:'🇮🇳' },
    STT:    { color:'#e60028', short:'STT',  name:'STT GDC',             flag:'🇸🇬' },
    ARK:    { color:'#2c7d32', short:'ARK',  name:'Ark Data Centres',    flag:'🇬🇧' },
    VIRTUS: { color:'#1e3a5f', short:'VDC',  name:'Virtus Data Centres', flag:'🇬🇧' },
  };

  // ── Facilities — ~130 named locations ─────────────────────────────────────
  //  { co, name, city, region, country, lat, lng, mw, status, opened, notes }
  //  status: 'operational' | 'construction' | 'planned'
  const DCS = [

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // META  — USA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'META', name:'Prineville Campus (OR)',   city:'Prineville',    region:'OR', country:'USA', lat:44.3044, lng:-120.8448, mw:500, status:'operational', opened:2011, notes:'First Meta-owned DC. 3 main halls + Project Cambria AI expansion. Hydro power.' },
    { co:'META', name:'Forest City Campus (NC)',  city:'Forest City',   region:'NC', country:'USA', lat:35.3385, lng:-81.8651,  mw:100, status:'operational', opened:2012, notes:'MetaVerse AI training. Rutherford County NC.' },
    { co:'META', name:'Altoona Campus (IA)',      city:'Altoona',       region:'IA', country:'USA', lat:41.6495, lng:-93.4703,  mw:200, status:'operational', opened:2013, notes:'Powered by Microsoft wind PPAs. AI inference serving.' },
    { co:'META', name:'Fort Worth Campus (TX)',   city:'Fort Worth',    region:'TX', country:'USA', lat:32.6878, lng:-97.4286,  mw:300, status:'operational', opened:2014, notes:'Eagle Mountain Lake area. Major AI training cluster.' },
    { co:'META', name:'Clarksville Campus (TN)',  city:'Clarksville',   region:'TN', country:'USA', lat:36.4619, lng:-87.3641,  mw:150, status:'operational', opened:2016, notes:'Near Google campus. TVA hydropower. Llama training.' },
    { co:'META', name:'Wenatchee Campus (WA)',    city:'Wenatchee',     region:'WA', country:'USA', lat:47.4235, lng:-120.3103, mw:150, status:'operational', opened:2015, notes:'Columbia River hydropower. ~15 buildings planned.' },
    { co:'META', name:'New Albany Campus (OH)',   city:'New Albany',    region:'OH', country:'USA', lat:40.0820, lng:-82.8021,  mw:400, status:'operational', opened:2017, notes:'$1B+ investment. AI Llama 3/4 training workloads.' },
    { co:'META', name:'Huntsville Campus (AL)',   city:'Huntsville',    region:'AL', country:'USA', lat:34.7304, lng:-86.5861,  mw:500, status:'operational', opened:2019, notes:'$750M AI infrastructure hub. Canebrake Rd. 100% renewable.' },
    { co:'META', name:'DeKalb Campus (IL)',       city:'DeKalb',        region:'IL', country:'USA', lat:41.9292, lng:-88.7504,  mw:200, status:'operational', opened:2020, notes:'Northern Illinois wind power. AI training.' },
    { co:'META', name:'Eagle Mountain Campus (UT)',city:'Eagle Mountain',region:'UT', country:'USA', lat:40.3136, lng:-111.9982,mw:300, status:'operational', opened:2023, notes:'$800M campus. Utah Lake area. AI + AR/VR infrastructure.' },
    { co:'META', name:'Gallatin Campus (TN)',     city:'Gallatin',      region:'TN', country:'USA', lat:36.3887, lng:-86.4469,  mw:150, status:'operational', opened:2019, notes:'Sumner County. Significant AI inference serving capacity.' },
    { co:'META', name:'Kuna Campus (ID)',         city:'Kuna',          region:'ID', country:'USA', lat:43.4913, lng:-116.4192, mw:150, status:'operational', opened:2021, notes:'$750M Idaho facility. Snake River wind power.' },
    { co:'META', name:'Stanton Springs Campus (GA)',city:'Social Circle',region:'GA',country:'USA', lat:33.6368, lng:-83.4930,  mw:200, status:'operational', opened:2019, notes:'Newton County GA. AI inference and storage.' },
    { co:'META', name:'Omaha Campus (NE)',        city:'Omaha',         region:'NE', country:'USA', lat:41.2565, lng:-95.9345,  mw:250, status:'construction', opened:2025, notes:'$800M announced 2023. AI training cluster expansion.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // AMAZON AWS — USA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'AWS', name:'US-EAST-1 — Ashburn, VA',     city:'Ashburn',       region:'VA', country:'USA', lat:39.0438, lng:-77.4874, mw:1500, status:'operational', opened:2006, notes:'Largest AWS region globally. 16+ AZs. Dulles tech corridor. Trainium/Inferentia AI chips.' },
    { co:'AWS', name:'US-EAST-1 — Manassas, VA',    city:'Manassas',      region:'VA', country:'USA', lat:38.7510, lng:-77.4775, mw:600,  status:'operational', opened:2010, notes:'Secondary Ashburn region campus. Prince William County.' },
    { co:'AWS', name:'US-EAST-2 — Columbus, OH',    city:'Dublin',        region:'OH', country:'USA', lat:40.0992, lng:-83.1141, mw:400,  status:'operational', opened:2016, notes:'US-EAST-2. Central US hub. EC2 UltraClusters for Trainium2.' },
    { co:'AWS', name:'US-WEST-2 — Hillsboro, OR',   city:'Hillsboro',     region:'OR', country:'USA', lat:45.5229, lng:-122.9898,mw:500,  status:'operational', opened:2011, notes:'Largest US West region. Intel HQ nearby. AI training.' },
    { co:'AWS', name:'US-WEST-1 — San Jose, CA',    city:'San Jose',      region:'CA', country:'USA', lat:37.3382, lng:-121.8863,mw:200,  status:'operational', opened:2010, notes:'N. California. SFO-adjacent. AI inference serving west coast.' },
    { co:'AWS', name:'US-EAST — Chicago, IL',       city:'Chicago',       region:'IL', country:'USA', lat:41.9558, lng:-87.8614, mw:300,  status:'operational', opened:2018, notes:'Elk Grove Village campus. AWS Local Zone. UltraCluster.' },
    { co:'AWS', name:'US-EAST — Dallas, TX',        city:'Irving',        region:'TX', country:'USA', lat:32.8140, lng:-96.9489, mw:300,  status:'operational', opened:2018, notes:'Las Colinas / DFW. AWS Local Zone. Bedrock AI inference.' },
    { co:'AWS', name:'US-EAST — Atlanta, GA',       city:'Atlanta',       region:'GA', country:'USA', lat:33.8748, lng:-84.3733, mw:200,  status:'operational', opened:2018, notes:'AWS Local Zone. SageMaker AI hub for southeast US.' },
    { co:'AWS', name:'US — Phoenix, AZ',            city:'Phoenix',       region:'AZ', country:'USA', lat:33.5680, lng:-112.0940,mw:400,  status:'operational', opened:2022, notes:'AWS US-WEST new expansion. GPU cluster for Bedrock/Nova.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GOOGLE CLOUD — USA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'GCP', name:'The Dalles, OR',            city:'The Dalles',    region:'OR', country:'USA', lat:45.5945, lng:-121.1787, mw:300, status:'operational', opened:2006, notes:'First purpose-built Google DC. Columbia River cooling. TPU v4/v5 pods.' },
    { co:'GCP', name:'Pryor Creek (Mayes County), OK',city:'Pryor Creek',region:'OK',country:'USA', lat:36.3084, lng:-95.3175,  mw:400, status:'operational', opened:2007, notes:'Largest Google DC site. GRDA hydropower. TPU supercomputers.' },
    { co:'GCP', name:'Lenoir, NC',                city:'Lenoir',        region:'NC', country:'USA', lat:35.9382, lng:-81.5404,  mw:200, status:'operational', opened:2007, notes:'Caldwell County. On-site solar. Gemini inference serving east.' },
    { co:'GCP', name:'Council Bluffs, IA',        city:'Council Bluffs',region:'IA', country:'USA', lat:41.2619, lng:-95.8608,  mw:300, status:'operational', opened:2008, notes:'MidAmerican Energy wind. Multiple buildings. AI training.' },
    { co:'GCP', name:'Clarksville, TN',           city:'Clarksville',   region:'TN', country:'USA', lat:36.4690, lng:-87.3500,  mw:300, status:'operational', opened:2012, notes:'Montgomery County. TVA power. Gemini / DeepMind TPU cluster.' },
    { co:'GCP', name:'Bridgeport, AL',            city:'Bridgeport',    region:'AL', country:'USA', lat:34.9371, lng:-85.7133,  mw:150, status:'operational', opened:2015, notes:'Jackson County. Tennessee River power. AI serving southeast.' },
    { co:'GCP', name:'Papillion, NE',             city:'Papillion',     region:'NE', country:'USA', lat:41.1544, lng:-96.0422,  mw:200, status:'operational', opened:2016, notes:'Sarpy County. Wind PPA. Cloud TPU v5p cluster.' },
    { co:'GCP', name:'Midlothian, TX',            city:'Midlothian',    region:'TX', country:'USA', lat:32.4749, lng:-96.9942,  mw:300, status:'operational', opened:2019, notes:'Ellis County. $600M campus. AI Gemini serving south-central US.' },
    { co:'GCP', name:'Henderson, NV',             city:'Henderson',     region:'NV', country:'USA', lat:36.0397, lng:-114.9817, mw:200, status:'operational', opened:2019, notes:'Clark County. NV Energy. TPU pod AI inference west.' },
    { co:'GCP', name:'Storey County, NV',         city:'Reno',          region:'NV', country:'USA', lat:39.5296, lng:-119.4100, mw:200, status:'operational', opened:2020, notes:'Tesla Gigafactory neighbor. Wind/solar. AI training cluster.' },
    { co:'GCP', name:'Wichita Falls, TX',         city:'Wichita Falls', region:'TX', country:'USA', lat:33.9137, lng:-98.4934,  mw:200, status:'operational', opened:2021, notes:'Windthorst area. 100% renewable. Duet AI / Gemini serving.' },
    { co:'GCP', name:'Columbus, OH',              city:'New Albany',    region:'OH', country:'USA', lat:40.0862, lng:-82.7888,  mw:300, status:'operational', opened:2022, notes:'Licking County. Adjacent to Meta campus. AI UltraCluster.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // MICROSOFT AZURE — USA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'AZURE', name:'East US — Boydton, VA',        city:'Boydton',      region:'VA', country:'USA', lat:36.6680, lng:-78.3875, mw:800,  status:'operational', opened:2010, notes:'Largest Azure region globally. Mecklenburg County VA. OpenAI GPT-4 training.' },
    { co:'AZURE', name:'East US 2 — Sterling, VA',     city:'Sterling',     region:'VA', country:'USA', lat:39.0032, lng:-77.3955, mw:600,  status:'operational', opened:2014, notes:'Loudoun County. OpenAI Codex/DALL-E inference. Azure AI Studio.' },
    { co:'AZURE', name:'Central US — Des Moines, IA',  city:'Des Moines',   region:'IA', country:'USA', lat:41.5868, lng:-93.6250, mw:400,  status:'operational', opened:2012, notes:'MidAmerican wind. Azure OpenAI Service central US hub.' },
    { co:'AZURE', name:'West US — San Jose, CA',       city:'San Jose',     region:'CA', country:'USA', lat:37.4419, lng:-121.9943,mw:300,  status:'operational', opened:2012, notes:'N. California. OpenAI inference west coast. AI Foundry.' },
    { co:'AZURE', name:'West US 2 — Quincy, WA',       city:'Quincy',       region:'WA', country:'USA', lat:47.2349, lng:-119.8523,mw:400,  status:'operational', opened:2012, notes:'Columbia River hydro. Azure OpenAI GPT-4o inference.' },
    { co:'AZURE', name:'North Central — Chicago, IL',  city:'Chicago',      region:'IL', country:'USA', lat:42.0011, lng:-87.8605, mw:300,  status:'operational', opened:2010, notes:'Northlake/Elk Grove. Azure AI + OpenAI serving midwest.' },
    { co:'AZURE', name:'South Central — San Antonio, TX',city:'San Antonio',region:'TX', country:'USA', lat:29.4241, lng:-98.4936, mw:300,  status:'operational', opened:2010, notes:'Alamo Quarry area. OpenAI inference hub for south US.' },
    { co:'AZURE', name:'West Central — Cheyenne, WY',  city:'Cheyenne',     region:'WY', country:'USA', lat:41.1400, lng:-104.8202,mw:200,  status:'operational', opened:2014, notes:'Geo-redundancy hub. $100M Wyoming facility. Azure AI.' },
    { co:'AZURE', name:'East US — Phoenix, AZ',        city:'Phoenix',      region:'AZ', country:'USA', lat:33.5710, lng:-112.1340,mw:500,  status:'operational', opened:2023, notes:'OpenAI partnership $5B+ campus. AI Stargate expansion.' },
    { co:'AZURE', name:'Stargate — Abilene, TX',       city:'Abilene',      region:'TX', country:'USA', lat:32.4487, lng:-99.7331, mw:800,  status:'construction',opened:2024, notes:'$100B OpenAI Stargate Phase 1. Dedicated GPT-5 training. Microsoft + OpenAI + SoftBank.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // APPLE — USA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'APPLE', name:'Maiden Campus (NC)',       city:'Maiden',        region:'NC', country:'USA', lat:35.6440, lng:-81.3148, mw:500, status:'operational', opened:2012, notes:'500,000 sq ft. Apple Intelligence processing. Solar/fuel cell 100% renewable.' },
    { co:'APPLE', name:'Mesa Campus (AZ)',         city:'Mesa',          region:'AZ', country:'USA', lat:33.4152, lng:-111.8315,mw:400, status:'operational', opened:2017, notes:'Former GT Advanced sapphire plant. Apple AI neural engine serving.' },
    { co:'APPLE', name:'Reno / Washoe Valley (NV)',city:'Reno',          region:'NV', country:'USA', lat:39.3470, lng:-119.7390,mw:200, status:'operational', opened:2012, notes:'NV Energy. iCloud + Apple Intelligence serving western US.' },
    { co:'APPLE', name:'Prineville Campus (OR)',   city:'Prineville',    region:'OR', country:'USA', lat:44.3070, lng:-120.8300,mw:200, status:'operational', opened:2015, notes:'Next to Meta campus. Columbia River hydro. Siri AI backend.' },
    { co:'APPLE', name:'Waukee Campus (IA)',       city:'Waukee',        region:'IA', country:'USA', lat:41.6110, lng:-93.8785, mw:200, status:'operational', opened:2021, notes:'$1.3B investment. Renewable energy. Apple Intelligence midwest hub.' },
    { co:'APPLE', name:'Raleigh-Durham (NC)',      city:'Raleigh',       region:'NC', country:'USA', lat:35.9940, lng:-78.8986, mw:150, status:'construction',opened:2024, notes:'$1B announced 2023. Apple Intelligence AI research and serving hub.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // NVIDIA — USA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'NVDA', name:'Santa Clara HQ — DGX SuperPOD',city:'Santa Clara', region:'CA', country:'USA', lat:37.3875, lng:-122.0575,mw:50,  status:'operational', opened:2022, notes:'HQ-based DGX SuperPOD H100 cluster. 1,024 H100 GPUs. Reference AI system.' },
    { co:'NVDA', name:'The Woodlands HQ2 (TX)',    city:'The Woodlands', region:'TX', country:'USA', lat:30.1658, lng:-95.4613, mw:30,  status:'operational', opened:2023, notes:'NVIDIA Texas campus. Blackwell B200 systems test environment.' },
    { co:'NVDA', name:'NVIDIA Quantum AI Cluster — Boca Raton',city:'Boca Raton',region:'FL',country:'USA', lat:26.3683, lng:-80.1289,mw:40,  status:'construction',opened:2025, notes:'Earth-2 climate AI and Omniverse simulation. NVIDIA-operated GPU cluster.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // COREWEAVE — USA (AI-native cloud)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'CWVE', name:'CoreWeave — Livingston, NJ',    city:'Livingston',    region:'NJ', country:'USA', lat:40.7960, lng:-74.3154, mw:120, status:'operational', opened:2022, notes:'HQ + primary GPU cluster. 20,000+ H100s. Cohere/Mistral customers.' },
    { co:'CWVE', name:'CoreWeave — Chicago, IL',       city:'Elk Grove Village',region:'IL',country:'USA',lat:41.9820, lng:-87.9340, mw:150, status:'operational', opened:2023, notes:'Second-largest cluster. Blackwell-ready. OpenAI training offload.' },
    { co:'CWVE', name:'CoreWeave — Las Vegas, NV',     city:'Las Vegas',     region:'NV', country:'USA', lat:36.1699, lng:-115.1398,mw:100, status:'operational', opened:2023, notes:'Switch SUPERNAP campus. H100/H200 GPU cluster.' },
    { co:'CWVE', name:'CoreWeave — Dallas, TX',        city:'Irving',        region:'TX', country:'USA', lat:32.8568, lng:-96.9590, mw:120, status:'operational', opened:2023, notes:'DFW corridor. QTS campus. AI model inference.' },
    { co:'CWVE', name:'CoreWeave — Portland, OR',      city:'Hillsboro',     region:'OR', country:'USA', lat:45.5228, lng:-122.9580,mw:100, status:'construction',opened:2024, notes:'Umpqua expansion. H200/Blackwell. Microsoft capacity contract.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ORACLE CLOUD — USA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'ORACLE', name:'Oracle — Ashburn, VA (us-ashburn-1)',  city:'Ashburn',   region:'VA', country:'USA', lat:39.0500, lng:-77.4950, mw:200, status:'operational', opened:2016, notes:'Oracle primary East US region. OCI AI GPU shapes. NVIDIA L40S cluster.' },
    { co:'ORACLE', name:'Oracle — Phoenix, AZ (us-phoenix-1)', city:'Phoenix',   region:'AZ', country:'USA', lat:33.5800, lng:-112.0800,mw:150, status:'operational', opened:2016, notes:'OCI West US. AI GPU capacity. Government cloud zone.' },
    { co:'ORACLE', name:'Oracle — Chicago, IL (us-chicago-1)', city:'Chicago',   region:'IL', country:'USA', lat:41.8781, lng:-87.7300, mw:150, status:'operational', opened:2022, notes:'OCI Central US. Microsoft + Oracle cloud interconnect hub.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EQUINIX — USA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'EQUINIX', name:'Equinix NY2/NY5 — Secaucus, NJ',    city:'Secaucus',  region:'NJ', country:'USA', lat:40.7800, lng:-74.0565, mw:100, status:'operational', opened:2000, notes:'NY metro campus. AI model API interconnect hub. IBM/AWS Direct Connect.' },
    { co:'EQUINIX', name:'Equinix SV1/SV5 — San Jose, CA',    city:'San Jose',  region:'CA', country:'USA', lat:37.3969, lng:-121.9620,mw:90,  status:'operational', opened:2000, notes:'Silicon Valley hub. Direct interconnect to AWS/Azure/GCP/CoreWeave.' },
    { co:'EQUINIX', name:'Equinix DA1 — Dallas, TX',           city:'Dallas',    region:'TX', country:'USA', lat:32.9320, lng:-96.8360, mw:60,  status:'operational', opened:2001, notes:'DFW AI interconnect hub. Model API colocation.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CANADA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'META',  name:'Meta — Sherbrooke, QC',             city:'Sherbrooke',   region:'QC', country:'CAN', lat:45.4042, lng:-71.8929, mw:100, status:'operational', opened:2013, notes:'Meta Canada DC. Hydro-Québec powered. Feed for North American AI workloads.' },
    { co:'AWS',   name:'AWS ca-central-1 — Montreal, QC',   city:'Montreal',     region:'QC', country:'CAN', lat:45.5017, lng:-73.5673, mw:200, status:'operational', opened:2016, notes:'Canada primary AWS region. 3 AZs. Bedrock AI serving Canada East.' },
    { co:'AWS',   name:'AWS ca-west-1 — Calgary, AB',       city:'Calgary',      region:'AB', country:'CAN', lat:51.0447, lng:-114.0719,mw:150, status:'operational', opened:2023, notes:'Canada West region launched 2023. AI inference for Western Canada.' },
    { co:'AZURE', name:'Azure Canada Central — Toronto, ON',  city:'Toronto',     region:'ON', country:'CAN', lat:43.6532, lng:-79.3832, mw:200, status:'operational', opened:2016, notes:'Canada primary Azure region. OpenAI Canadian sovereignty. Federal cloud.' },
    { co:'AZURE', name:'Azure Canada East — Quebec City, QC', city:'Quebec City', region:'QC', country:'CAN', lat:46.8139, lng:-71.2080, mw:100, status:'operational', opened:2016, notes:'Hydro-Québec clean power. DR/backup for Canada Central Azure.' },
    { co:'GCP',   name:'GCP Montreal (northamerica-northeast1)',city:'Montreal',  region:'QC', country:'CAN', lat:45.5080, lng:-73.5540, mw:150, status:'operational', opened:2018, notes:'Google Cloud Canada. Vertex AI + Gemini serving Canadian east.' },
    { co:'GCP',   name:'GCP Toronto (northamerica-northeast2)',city:'Toronto',    region:'ON', country:'CAN', lat:43.6580, lng:-79.3780, mw:120, status:'operational', opened:2021, notes:'Toronto GCP region. TPU v5 AI workloads. Finance/health sector AI.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // INDIA
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'AWS',   name:'AWS ap-south-1 — Mumbai (AZ-a)',    city:'Mumbai',       region:'MH', country:'IND', lat:19.1134, lng:72.8637,  mw:150, status:'operational', opened:2016, notes:'Mumbai Airoli campus (Navi Mumbai). Primary India AWS region. Bedrock AI India.' },
    { co:'AWS',   name:'AWS ap-south-1 — Mumbai (AZ-b)',    city:'Mumbai',       region:'MH', country:'IND', lat:19.0710, lng:72.8770,  mw:120, status:'operational', opened:2016, notes:'Mumbai BKC campus AZ. SageMaker AI + Trainium inference.' },
    { co:'AWS',   name:'AWS ap-south-2 — Hyderabad',        city:'Hyderabad',    region:'TS', country:'IND', lat:17.4065, lng:78.4772,  mw:120, status:'operational', opened:2022, notes:'Second India region. Launched Nov 2022. Graviton + AI instances.' },
    { co:'AZURE', name:'Azure Central India — Pune',         city:'Pune',         region:'MH', country:'IND', lat:18.5204, lng:73.8567,  mw:100, status:'operational', opened:2015, notes:'India primary Azure region. OpenAI India API serving. Government India.' },
    { co:'AZURE', name:'Azure West India — Mumbai',          city:'Mumbai',       region:'MH', country:'IND', lat:19.0890, lng:72.8680,  mw:80,  status:'operational', opened:2015, notes:'Mumbai secondary. Azure AI Language + OpenAI west India.' },
    { co:'AZURE', name:'Azure South India — Chennai',        city:'Chennai',      region:'TN', country:'IND', lat:13.1067, lng:80.2206,  mw:80,  status:'operational', opened:2015, notes:'Third India region. DR + AI inference south India. Microsoft AI for Good India.' },
    { co:'GCP',   name:'GCP asia-south1 — Mumbai',           city:'Mumbai',       region:'MH', country:'IND', lat:19.0590, lng:72.8997,  mw:100, status:'operational', opened:2017, notes:'Google Cloud India primary. Vertex AI / Gemini India API.' },
    { co:'GCP',   name:'GCP asia-south2 — Delhi',            city:'Delhi',        region:'DL', country:'IND', lat:28.6139, lng:77.2090,  mw:80,  status:'operational', opened:2021, notes:'Second India GCP region. Low latency for North India AI serving.' },
    { co:'META',  name:'Meta AI DC — Odisha (announced)',    city:'Bhubaneswar',  region:'OD', country:'IND', lat:20.2961, lng:85.8246,  mw:200, status:'planned',     opened:2026, notes:'$800M announced 2023. Dedicated AI training hub for India/Asia. Llama Asia.' },
    { co:'JIO',   name:'Jio Cloud DC — Mumbai (Turbhe)',     city:'Mumbai',       region:'MH', country:'IND', lat:19.0750, lng:73.0050,  mw:80,  status:'operational', opened:2020, notes:'Reliance Jio primary DC. JioCloud AI services. Airtel DCs nearby.' },
    { co:'JIO',   name:'Jio Cloud DC — Nagpur',              city:'Nagpur',       region:'MH', country:'IND', lat:21.1458, lng:79.0882,  mw:60,  status:'operational', opened:2021, notes:'Central India hub. Jio AI and 5G edge compute node.' },
    { co:'JIO',   name:'Jio Cloud DC — Bengaluru',           city:'Bengaluru',    region:'KA', country:'IND', lat:12.9716, lng:77.5946,  mw:80,  status:'operational', opened:2021, notes:'Tech corridor. AI startup serving. JioMeet/JioSaavan AI backend.' },
    { co:'TATA',  name:'Tata Comm DC — Mumbai (Dighi)',      city:'Mumbai',       region:'MH', country:'IND', lat:18.9220, lng:72.8347,  mw:70,  status:'operational', opened:2010, notes:'Tier 3 DC. 150,000 sq ft. IXcellerate / submarine cable landing.' },
    { co:'TATA',  name:'Tata Comm DC — Chennai (Ambattur)',  city:'Chennai',      region:'TN', country:'IND', lat:13.1012, lng:80.1654,  mw:50,  status:'operational', opened:2012, notes:'Ambattur IT Park. South India hub. Tier 3+.' },
    { co:'TATA',  name:'Tata Comm DC — Hyderabad (Hitech)',  city:'Hyderabad',    region:'TS', country:'IND', lat:17.4435, lng:78.3772,  mw:50,  status:'operational', opened:2014, notes:'HITEC City. Tier 3. State/central government AI cloud.' },
    { co:'TATA',  name:'Tata Comm DC — Noida',               city:'Noida',        region:'UP', country:'IND', lat:28.5355, lng:77.3910,  mw:50,  status:'operational', opened:2015, notes:'NCR/Delhi hub. 2.5MW. Tier 3. North India cloud serving.' },
    { co:'NTT',   name:'NTT Mumbai (NAG1)',                  city:'Mumbai',       region:'MH', country:'IND', lat:19.1050, lng:72.8720,  mw:55,  status:'operational', opened:2016, notes:'Navi Mumbai Tier IV. 180,000 sq ft. AI colocation for global clients.' },
    { co:'NTT',   name:'NTT Chennai (CHN1)',                  city:'Chennai',      region:'TN', country:'IND', lat:12.9141, lng:80.2318,  mw:40,  status:'operational', opened:2018, notes:'OMR (Old Mahabalipuram Rd). Tier IV. South India hyperscale colo.' },
    { co:'NTT',   name:'NTT Bengaluru (BLR1)',               city:'Bengaluru',    region:'KA', country:'IND', lat:12.9350, lng:77.6240,  mw:40,  status:'operational', opened:2019, notes:'Whitefield tech corridor. Tier III+. AWS/Azure India interconnect.' },
    { co:'CTRLS', name:'CtrlS Hyderabad — HYD1/2',           city:'Hyderabad',    region:'TS', country:'IND', lat:17.4483, lng:78.3915,  mw:60,  status:'operational', opened:2012, notes:'Asia largest Tier 4 certified DC. 450,000 sq ft. Govt India AI cloud.' },
    { co:'CTRLS', name:'CtrlS Mumbai',                        city:'Mumbai',       region:'MH', country:'IND', lat:19.0815, lng:72.8920,  mw:40,  status:'operational', opened:2014, notes:'Andheri East. Tier 4. BFSI sector AI. SEBI regulated cloud.' },
    { co:'CTRLS', name:'CtrlS Noida',                         city:'Noida',        region:'UP', country:'IND', lat:28.5650, lng:77.3212,  mw:30,  status:'operational', opened:2016, notes:'NCR. Government cloud India. Tier 4. UIDAI / DigiLocker.' },
    { co:'STT',   name:'STT GDC Mumbai (GGP1)',               city:'Mumbai',       region:'MH', country:'IND', lat:19.1136, lng:72.8697,  mw:50,  status:'operational', opened:2013, notes:'Ghansoli, Navi Mumbai. Tier 3+. 300,000+ sq ft. Singapore Tech.' },
    { co:'STT',   name:'STT GDC Chennai (CHE1)',              city:'Chennai',      region:'TN', country:'IND', lat:13.0000, lng:80.2180,  mw:40,  status:'operational', opened:2016, notes:'OMR Tech Corridor. Tier 3+. Cable landing interconnect.' },
    { co:'STT',   name:'STT GDC Hyderabad (HYD1)',            city:'Hyderabad',    region:'TS', country:'IND', lat:17.4100, lng:78.4600,  mw:35,  status:'operational', opened:2019, notes:'HITEC City adjacent. Tier 3. Pharma/biotech AI sector.' },
    { co:'STT',   name:'STT GDC Kolkata (KOL1)',              city:'Kolkata',      region:'WB', country:'IND', lat:22.5726, lng:88.3639,  mw:30,  status:'operational', opened:2019, notes:'Salt Lake City IT hub. Tier 3. East India cloud node.' },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // UK
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    { co:'AWS',   name:'AWS eu-west-2 — London AZ-a',         city:'Slough',       region:'ENG', country:'GBR', lat:51.5105, lng:-0.5960,  mw:250, status:'operational', opened:2016, notes:'London primary AWS region. 3 AZs. Bedrock Titan/Nova UK serving. Docklands.' },
    { co:'AWS',   name:'AWS eu-west-2 — London AZ-b',         city:'London',       region:'ENG', country:'GBR', lat:51.5074, lng:-0.0278,  mw:200, status:'operational', opened:2016, notes:'Docklands / East London AZ. AI Bedrock UK sovereign cloud.' },
    { co:'AWS',   name:'AWS eu-west-2 — London AZ-c',         city:'London',       region:'ENG', country:'GBR', lat:51.4890, lng:-0.1420,  mw:150, status:'operational', opened:2018, notes:'South London AZ. AWS Outposts / GovCloud adjacent.' },
    { co:'AZURE', name:'Azure UK South — London / Slough',    city:'Slough',       region:'ENG', country:'GBR', lat:51.5107, lng:-0.5950,  mw:300, status:'operational', opened:2017, notes:'Primary UK Azure region. OpenAI UK API. NHS AI Digital.' },
    { co:'AZURE', name:'Azure UK West — Cardiff, Wales',      city:'Cardiff',      region:'WLS', country:'GBR', lat:51.4816, lng:-3.1791,  mw:150, status:'operational', opened:2017, notes:'DR/backup UK region. Welsh Gov AI. 100% renewable energy.' },
    { co:'GCP',   name:'GCP europe-west2 — London',           city:'London',       region:'ENG', country:'GBR', lat:51.5074, lng:-0.1878,  mw:200, status:'operational', opened:2017, notes:'Google Cloud UK primary. Vertex AI + Gemini UK API serving.' },
    { co:'ORACLE',name:'Oracle — UK South (London)',          city:'London',       region:'ENG', country:'GBR', lat:51.5060, lng:-0.0100,  mw:100, status:'operational', opened:2019, notes:'OCI UK region. NHS / government cloud. AI GPU cluster shapes.' },
    { co:'IBM',   name:'IBM Cloud — London 6',                city:'London',       region:'ENG', country:'GBR', lat:51.5074, lng:-0.0750,  mw:60,  status:'operational', opened:2017, notes:'Wapping / E London. watsonx.ai UK. Financial sector AI.' },
    { co:'IBM',   name:'IBM Cloud — London 4',                city:'Portsmouth',   region:'ENG', country:'GBR', lat:50.8198, lng:-1.0880,  mw:40,  status:'operational', opened:2015, notes:'Portsmouth. Government UK sovereign cloud. IBM Watson UK.' },
    { co:'EQUINIX',name:'Equinix LD4 — Slough (Thames Valley)',city:'Slough',      region:'ENG', country:'GBR', lat:51.5107, lng:-0.5970,  mw:100, status:'operational', opened:2000, notes:'Largest EU Equinix site. 60,000 sq ft. AWS/Azure UK interconnect.' },
    { co:'EQUINIX',name:'Equinix LD5 — Slough',               city:'Slough',       region:'ENG', country:'GBR', lat:51.5082, lng:-0.5942,  mw:80,  status:'operational', opened:2005, notes:'Adjacent to LD4. Direct AWS/GCP/Azure Direct Connect UK.' },
    { co:'EQUINIX',name:'Equinix LD8 — Slough',               city:'Slough',       region:'ENG', country:'GBR', lat:51.5065, lng:-0.5930,  mw:60,  status:'operational', opened:2012, notes:'Third Slough campus building. AI colocation hub west of London.' },
    { co:'EQUINIX',name:'Equinix MA1 — Manchester',            city:'Manchester',   region:'ENG', country:'GBR', lat:53.4808, lng:-2.2426,  mw:40,  status:'operational', opened:2007, notes:'North England hub. MediaCity adjacent. AI/cloud interconnect.' },
    { co:'ARK',   name:'Ark — Corsham (Wiltshire)',            city:'Corsham',      region:'ENG', country:'GBR', lat:51.4310, lng:-2.1958,  mw:100, status:'operational', opened:2009, notes:'UK government / MoD cloud. Classified workloads. AI defence systems.' },
    { co:'ARK',   name:'Ark A2 — Farnborough',                 city:'Farnborough',  region:'ENG', country:'GBR', lat:51.2914, lng:-0.7787,  mw:60,  status:'operational', opened:2012, notes:'Surrey/Hampshire. Secure govt tier. GCHQ / NCSC adjacent ecosystem.' },
    { co:'ARK',   name:'Ark Reading',                          city:'Reading',      region:'ENG', country:'GBR', lat:51.4543, lng:-0.9781,  mw:40,  status:'operational', opened:2016, notes:'M4 corridor. Commercial AI + public sector cloud. DSTL links.' },
    { co:'VIRTUS',name:'Virtus LONDON1 — Hayes',               city:'Hayes',        region:'ENG', country:'GBR', lat:51.5099, lng:-0.4191,  mw:80,  status:'operational', opened:2014, notes:'West London Heathrow corridor. Tier 3+. AI colocation hub.' },
    { co:'VIRTUS',name:'Virtus LONDON2 — Hayes',               city:'Hayes',        region:'ENG', country:'GBR', lat:51.5068, lng:-0.4175,  mw:80,  status:'operational', opened:2017, notes:'Adjacent LONDON1. Hyperscale capable. AWS/Azure colo expansion.' },
    { co:'VIRTUS',name:'Virtus LONDON5 — Stockley Park',       city:'Uxbridge',     region:'ENG', country:'GBR', lat:51.5018, lng:-0.4590,  mw:100, status:'operational', opened:2022, notes:'130MW campus planned. M25/M4 junction. AI hyperscale campus.' },
  ];

  // ── Status display config ──────────────────────────────────────────────────
  const STATUS = {
    operational: { color:'#00cc66', label:'OPERATIONAL' },
    construction:{ color:'#ffaa00', label:'UNDER CONSTRUCTION' },
    planned:     { color:'#4488ff', label:'PLANNED/ANNOUNCED' },
  };

  // ── Render all markers ─────────────────────────────────────────────────────
  function _render() {
    if (!map) return;
    markers.forEach(m => { try { map.removeLayer(m); } catch(_) {} });
    markers = [];

    const visible = _filter === 'ALL' ? DCS : DCS.filter(d => d.co === _filter);

    visible.forEach(dc => {
      const co  = CO[dc.co] || { color:'#888', short:dc.co, name:dc.co };
      const sta = STATUS[dc.status] || STATUS.operational;
      const mwW = dc.mw ? Math.max(18, Math.min(34, 18 + Math.round(dc.mw / 80))) : 20;

      const icon = L.divIcon({
        html: `<div class="aidc-marker" style="
          background:${co.color}22;border:1.5px solid ${co.color};
          color:${co.color};width:${mwW}px;height:14px;">
          ${co.short}
          ${dc.status !== 'operational' ? `<span class="aidc-status-dot" style="background:${sta.color}"></span>` : ''}
        </div>`,
        className:'',
        iconSize:[mwW, 14],
        iconAnchor:[mwW / 2, 7],
      });

      const pop = `<div class="aidc-popup" style="border-left:3px solid ${co.color}">
        <div class="aidc-pop-hdr" style="color:${co.color}">${dc.name}</div>
        <div class="aidc-pop-badge" style="background:${co.color}22;color:${co.color};border:1px solid ${co.color}44">
          ${co.name} · ${dc.city}, ${dc.region} · ${dc.country}
        </div>
        <div class="aidc-pop-row"><span class="aidc-pop-lbl">STATUS</span>
          <span style="color:${sta.color};font-weight:700">${sta.label}</span>
          ${dc.opened ? `<span style="color:#3d5a78"> · since ${dc.opened}</span>` : ''}
        </div>
        ${dc.mw ? `<div class="aidc-pop-row"><span class="aidc-pop-lbl">CAPACITY</span> <span style="color:#ffcc00">~${dc.mw} MW</span></div>` : ''}
        <div class="aidc-pop-row aidc-pop-notes">${dc.notes}</div>
        <div class="aidc-pop-src">Source: public announcements · corporate filings · OSINT press</div>
      </div>`;

      const mk = L.marker([dc.lat, dc.lng], { icon, zIndexOffset: 1200 })
        .bindPopup(pop, { className:'leaflet-popup-dark', maxWidth:320 });
      mk.addTo(map);
      markers.push(mk);
    });
  }

  // ── Left panel stats ───────────────────────────────────────────────────────
  function _updatePanel() {
    const el = document.getElementById('aidc-panel-body');
    if (!el) return;

    // Count by company
    const byCo = {};
    DCS.forEach(d => {
      if (!byCo[d.co]) byCo[d.co] = { count: 0, mw: 0 };
      byCo[d.co].count++;
      byCo[d.co].mw += d.mw || 0;
    });

    const sorted = Object.entries(byCo).sort((a, b) => b[1].mw - a[1].mw);

    el.innerHTML = sorted.map(([key, v]) => {
      const co  = CO[key] || { color:'#888', name:key, short:key };
      const pct = Math.min(100, Math.round(v.mw / 16));
      return `<div class="aidc-stat-row" onclick="AI_INFRA.filterTo('${key}')" style="cursor:pointer"
               title="Filter to ${co.name}">
        <div class="aidc-stat-co" style="color:${co.color}">${co.short}</div>
        <div class="aidc-stat-info">
          <div class="aidc-stat-name">${co.name}</div>
          <div class="aidc-stat-bar-wrap">
            <div class="aidc-stat-bar" style="width:${pct}%;background:${co.color}"></div>
          </div>
          <div class="aidc-stat-detail">${v.count} facilities · ~${v.mw.toLocaleString()} MW</div>
        </div>
      </div>`;
    }).join('') +
    `<div class="aidc-stat-total">
       <span style="color:#c8dff0">${DCS.length} total facilities</span> ·
       <span style="color:#ffcc00">${DCS.reduce((a,d)=>a+(d.mw||0),0).toLocaleString()} MW</span>
       <button class="aidc-reset-btn" onclick="AI_INFRA.filterTo('ALL')">SHOW ALL</button>
     </div>
     <div class="aidc-country-row">
       ${['USA','CAN','IND','GBR'].map(c => {
         const n = DCS.filter(d => d.country === c).length;
         const flag = {USA:'🇺🇸',CAN:'🇨🇦',IND:'🇮🇳',GBR:'🇬🇧'}[c];
         return `<span class="aidc-ctry">${flag} ${c} <b>${n}</b></span>`;
       }).join('')}
     </div>`;
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('aidc-css')) return;
    const s = document.createElement('style');
    s.id = 'aidc-css';
    s.textContent = `
      .aidc-marker {
        border-radius:3px; font-size:6.5px; font-weight:900; letter-spacing:.3px;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; white-space:nowrap; box-shadow:0 0 5px currentColor;
        transition:transform .15s; position:relative;
      }
      .aidc-marker:hover { transform:scale(1.5); z-index:9999!important; }
      .aidc-status-dot {
        position:absolute; top:-2px; right:-2px; width:4px; height:4px;
        border-radius:50%; border:1px solid #030508;
      }

      .aidc-popup { min-width:270px; font-family:'Courier New',monospace; padding:2px; }
      .aidc-pop-hdr { font-size:9.5px; font-weight:700; margin-bottom:4px; line-height:1.3; }
      .aidc-pop-badge {
        font-size:6.5px; font-weight:700; padding:2px 6px; border-radius:2px;
        display:inline-block; margin-bottom:5px; letter-spacing:.4px;
      }
      .aidc-pop-row { font-size:7.5px; color:#c8dff0; margin:2px 0; line-height:1.4; }
      .aidc-pop-lbl { color:#3d5a78; display:inline-block; width:65px; font-size:7px; letter-spacing:.3px; }
      .aidc-pop-notes { color:#5a7a9a; font-size:7px; margin-top:4px; }
      .aidc-pop-src { font-size:6.5px; color:#3d5a78; margin-top:5px; border-top:1px solid #0d1e2e; padding-top:4px; }

      .aidc-stat-row {
        display:flex; align-items:center; gap:6px; padding:3px 0;
        border-bottom:1px solid #0d1e2e; transition:background .12s;
      }
      .aidc-stat-row:hover { background:rgba(255,255,255,.02); }
      .aidc-stat-co { font-size:7px; font-weight:900; width:30px; text-align:center; flex-shrink:0; }
      .aidc-stat-info { flex:1; min-width:0; }
      .aidc-stat-name { font-size:7.5px; font-weight:700; color:#c8dff0; margin-bottom:2px; }
      .aidc-stat-bar-wrap { height:2px; background:#0d1e2e; border-radius:1px; margin-bottom:2px; }
      .aidc-stat-bar { height:100%; border-radius:1px; transition:width .4s; }
      .aidc-stat-detail { font-size:6.5px; color:#3d5a78; }
      .aidc-stat-total {
        font-size:7px; color:#5a7a9a; padding:5px 0 3px; border-top:1px solid #0d1e2e;
        display:flex; align-items:center; gap:4px; flex-wrap:wrap;
      }
      .aidc-reset-btn {
        margin-left:auto; font-size:6.5px; font-weight:700; padding:1px 5px;
        border:1px solid #1a2e42; background:transparent; color:#5a7a9a;
        cursor:pointer; border-radius:2px; font-family:'Courier New',monospace;
      }
      .aidc-reset-btn:hover { color:#00ff88; border-color:#00ff8844; }
      .aidc-country-row { display:flex; gap:6px; padding-top:4px; flex-wrap:wrap; }
      .aidc-ctry { font-size:7px; color:#3d5a78; }
      .aidc-ctry b { color:#c8dff0; }
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
      const card = document.getElementById('aidc-stats-card');
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
    filterTo(co) {
      _filter = co;
      if (enabled) _render();
      _updatePanel();
    },
    getData() { return DCS; },
  };
})();
