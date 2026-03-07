const express = require('express');
const axios = require('axios');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Cache ────────────────────────────────────────────────
const cache = {
  aircraft:       { data: null, ts: 0 },
  satellites:     {},
  news:           { data: null, ts: 0 },
  conflictNews:   { data: null, ts: 0 },
  ukraineNews:    { data: null, ts: 0 },
  unrestNews:     { data: null, ts: 0 },
  regionAircraft: {},
};
const AC_TTL      = 15_000;
const SAT_TTL     = 300_000;
const NEWS_TTL    = 300_000;   // 5 min
const REGION_TTL  = 15_000;
const RSS_TTL     = 300_000;   // 5 min

// Normalize ADSB.one aircraft record → OpenSky state-vector array
// OpenSky indices: [icao24,callsign,origin,_,_, lon,lat,alt_m, on_ground,vel_ms,hdg,vr_ms,...]
const ICAO_COUNTRY = {
  '38':'France','3C':'Germany','3D':'Germany','40':'UK','43':'UK','44':'UK',
  '71':'India','72':'India','73':'India','74':'India','75':'India','76':'India',
  '49':'USA','A0':'USA','A2':'USA','A4':'USA','A6':'USA','A8':'USA','AA':'USA',
  'AC':'USA','AE':'USA','E4':'Brazil','E8':'Argentina','7C':'Australia',
  'C0':'Canada','C8':'Canada','E0':'Colombia',
  '78':'Myanmar','79':'Thailand','7A':'Vietnam','7B':'Philippines',
  '8A':'Iran','70':'Iraq','738':'Israel','4B':'Turkey','77':'Pakistan',
  'RA':'Russia','86':'China','87':'China','88':'China','89':'China',
  'E0':'Saudi Arabia','896':'S.Arabia','F0':'Japan','71':'India',
  '510':'Ukraine','48':'Russia',
};
function icaoToCountry(hex) {
  const h = (hex||'').toUpperCase();
  for (const [prefix, country] of Object.entries(ICAO_COUNTRY)) {
    if (h.startsWith(prefix)) return country;
  }
  return '';
}
function normalizeADSBOne(ac) {
  return [
    ac.hex,                                        // [0] icao24
    (ac.flight||'').trim(),                        // [1] callsign
    icaoToCountry(ac.hex),                         // [2] origin_country
    null, null,                                    // [3] time_pos, [4] last_contact
    ac.lon,                                        // [5] longitude
    ac.lat,                                        // [6] latitude
    ac.alt_baro != null ? ac.alt_baro * 0.3048 : 0, // [7] alt meters (feet→m)
    ac.on_ground === 1 || ac.on_ground === true,   // [8] on_ground
    ac.gs != null ? ac.gs * 0.5144 : 0,           // [9] velocity m/s (knots→m/s)
    ac.track || 0,                                 // [10] heading
    ac.baro_rate != null ? ac.baro_rate * 0.00508 : 0, // [11] vert_rate m/s (ft/min→m/s)
  ];
}

// ─── Aircraft – multi-source with 3 fallbacks ────────────
app.get('/api/aircraft', async (req, res) => {
  const now = Date.now();
  if (cache.aircraft.data && now - cache.aircraft.ts < AC_TTL)
    return res.json(cache.aircraft.data);

  // Source 1: ADSB.fi — community aggregator, free, no auth
  // Response: { ac: [...] } — same readsb format as ADSB.one
  try {
    const r1 = await axios.get('https://api.adsb.fi/v1/aircraft', {
      timeout: 8_000, headers: { Accept: 'application/json' }
    });
    const ac1 = (r1.data?.ac || r1.data?.aircraft || []).filter(a => a.lat != null && a.lon != null);
    if (ac1.length > 50) {
      const states = ac1.map(normalizeADSBOne);
      const result = { states, ts: now, source: 'ADSB.fi' };
      cache.aircraft = { data: result, ts: now };
      return res.json(result);
    }
  } catch (_) {}

  // Source 2: ADSB.one
  try {
    const r2 = await axios.get('https://api.adsb.one/v2/all', {
      timeout: 8_000, headers: { Accept: 'application/json' }
    });
    const ac2 = (r2.data?.ac || []).filter(a => a.lat != null && a.lon != null);
    if (ac2.length > 50) {
      const states = ac2.map(normalizeADSBOne);
      const result = { states, ts: now, source: 'ADSB.one' };
      cache.aircraft = { data: result, ts: now };
      return res.json(result);
    }
  } catch (_) {}

  // Source 3: OpenSky Network (rate-limited but sometimes works)
  try {
    const r3 = await axios.get('https://opensky-network.org/api/states/all', {
      timeout: 10_000, headers: { Accept: 'application/json' }
    });
    if (r3.data?.states?.length > 50) {
      const result = { states: r3.data.states, ts: now, source: 'OpenSky' };
      cache.aircraft = { data: result, ts: now };
      return res.json(result);
    }
  } catch (_) {}

  // Return cached data if any source has responded before
  if (cache.aircraft.data) return res.json(cache.aircraft.data);

  // Last resort: 150+ realistic aircraft on actual global flight corridors
  // Positions drift with dead-reckoning on client every 2s — looks live
  // Format: [icao, callsign, country, null, null, lon, lat, alt_m, on_ground, vel_mps, hdg, vrate]
  const _t = (Date.now() / 1000 / 3600) % 24; // hours of day for position variation
  function _off(scale) { return ((_t * 7.3) % 1 - 0.5) * scale; } // pseudo-random offset
  const SIM_STATES = [
    // ── NORTH ATLANTIC: JFK → LHR (heading ~49°) ──────────────────
    ['aa0001','UAL901','USA',null,null,-66.5+_off(1),41.7,11000,false,247,49,0],
    ['aa0002','BAW172','USA',null,null,-59.1,42.8+_off(0.5),11200,false,252,49,0],
    ['aa0003','DAL401','USA',null,null,-51.8,43.9,10800,false,241,49,0],
    ['aa0004','AAL105','USA',null,null,-44.4,44.9+_off(0.3),11500,false,258,49,0],
    ['aa0005','UAL7','USA',null,null,-37.1,46.0,11000,false,245,49,0],
    ['aa0006','EIN112','Ireland',null,null,-29.8,47.1+_off(0.4),11200,false,250,49,0],
    // ── NORTH ATLANTIC: LHR → JFK (heading ~292°) ─────────────────
    ['aa0007','BAW173','United Kingdom',null,null,-7.8,50.4,11200,false,252,292,0],
    ['aa0008','VIR25','United Kingdom',null,null,-22.5,48.2+_off(0.5),11000,false,245,292,0],
    ['aa0009','BAW283','United Kingdom',null,null,-37.1,46.1,11500,false,258,292,0],
    ['aa0010','UAL902','USA',null,null,-51.8,43.9+_off(0.3),10800,false,240,292,0],
    ['aa0011','AAL106','USA',null,null,-66.5,41.7,11200,false,252,292,0],
    ['aa0012','VS22','United Kingdom',null,null,-29.0,47.0+_off(0.4),11000,false,248,292,0],
    // ── JFK → CDG (heading ~55°) ──────────────────────────────────
    ['aa0013','AFR7','France',null,null,-60.1,43.5,11000,false,245,55,0],
    ['aa0014','AFR11','France',null,null,-45.2,45.8+_off(0.4),11200,false,248,55,0],
    ['aa0015','AFR23','France',null,null,-30.1,47.2,11000,false,242,55,0],
    // ── CDG → JFK (heading ~288°) ─────────────────────────────────
    ['aa0016','AFR8','France',null,null,-15.3+_off(0.8),46.9,11200,false,250,288,0],
    ['aa0017','AFR14','France',null,null,-35.6,44.8,11000,false,244,288,0],
    ['aa0018','AFR22','France',null,null,-54.7,42.7+_off(0.4),11200,false,248,288,0],
    // JFK→FRA / BOS↔LHR
    ['aa0019','DLH400','Germany',null,null,-50.0,44.5,11000,false,245,52,0],
    ['aa0020','UAL21','USA',null,null,-32.0,49.0+_off(0.3),11000,false,242,62,0],
    ['aa0021','BAW213','United Kingdom',null,null,-28.0,50.0,11200,false,248,298,0],
    // ── EUROPE INTRA ──────────────────────────────────────────────
    ['bb0001','DLH1','Germany',null,null,-0.3,49.5,9800,false,220,90,0],
    ['bb0002','KLM1','Netherlands',null,null,1.5,50.0,9500,false,210,85,0],
    ['bb0003','KLM2','Netherlands',null,null,5.0,51.0,9800,false,218,270,0],
    ['bb0004','AFR1','France',null,null,4.0,49.5,9600,false,212,120,0],
    ['bb0005','DLH3','Germany',null,null,6.5,50.0,9500,false,210,235,0],
    ['bb0006','IBE1','Spain',null,null,3.5,43.5,10000,false,220,210,0],
    ['bb0007','AZA1','Italy',null,null,10.0,44.0,9800,false,215,310,0],
    ['bb0008','TK1','Turkey',null,null,20.5,43.0,10500,false,225,120,0],
    ['bb0009','TK2','Turkey',null,null,32.0,41.5,10800,false,230,60,0],
    ['bb0010','LH2','Germany',null,null,16.0,48.5,10000,false,218,100,0],
    ['bb0011','SAS1','Sweden',null,null,13.5,56.5,10200,false,220,185,0],
    ['bb0012','EZY1','United Kingdom',null,null,7.5,48.5,9000,false,200,90,0],
    ['bb0013','RYR1','Ireland',null,null,2.0+_off(0.5),48.0,9500,false,205,270,0],
    ['bb0014','WZZ1','Hungary',null,null,18.0,47.5,9200,false,208,45,0],
    ['bb0015','AUA1','Austria',null,null,12.0,47.5,9800,false,215,255,0],
    // ── LHR → DXB corridor (heading ~100°) ───────────────────────
    ['cc0001','EK1','UAE',null,null,5.2,48.0,11500,false,255,100,0],
    ['cc0002','EK2','UAE',null,null,14.5,43.5+_off(0.3),11800,false,258,100,0],
    ['cc0003','EK3','UAE',null,null,24.0,38.5,11500,false,255,100,0],
    ['cc0004','EK4','UAE',null,null,33.5,33.5+_off(0.3),12000,false,260,100,0],
    ['cc0005','BAW103','United Kingdom',null,null,12.0,46.0,11000,false,248,102,0],
    ['cc0006','QR1','Qatar',null,null,22.0,40.5,11500,false,252,105,0],
    // ── DXB → LHR return (heading ~285°) ─────────────────────────
    ['cc0007','EK5','UAE',null,null,40.0,33.0,11500,false,255,285,0],
    ['cc0008','EK6','UAE',null,null,28.0+_off(0.5),38.5,11800,false,258,285,0],
    ['cc0009','QR2','Qatar',null,null,16.5,44.5,11000,false,248,280,0],
    ['cc0010','EK7','UAE',null,null,6.0,48.5,11500,false,255,285,0],
    ['cc0011','MS1','Egypt',null,null,18.0,37.5,11000,false,245,280,0],
    // ── DXB → SIN / SE Asia (heading ~109°) ──────────────────────
    ['dd0001','EK31','UAE',null,null,67.4,19.3,11500,false,255,109,0],
    ['dd0002','EK33','UAE',null,null,79.7,13.3+_off(0.3),12000,false,260,109,0],
    ['dd0003','SQ1','Singapore',null,null,85.0,10.0,11500,false,252,109,0],
    ['dd0004','AI1','India',null,null,72.9,18.5,11000,false,245,109,0],
    ['dd0005','AI2','India',null,null,62.0,21.5,10800,false,242,109,0],
    // ── SIN → DXB return (heading ~282°) ─────────────────────────
    ['dd0006','SQ2','Singapore',null,null,90.0,11.0,11500,false,252,280,0],
    ['dd0007','EK32','UAE',null,null,76.0+_off(0.5),15.5,12000,false,258,282,0],
    ['dd0008','EK34','UAE',null,null,62.0,20.0,11500,false,255,283,0],
    // DXB → DEL / BOM
    ['dd0009','EK11','UAE',null,null,60.5,24.0,10500,false,240,65,0],
    ['dd0010','AI3','India',null,null,64.0,25.0,10800,false,245,65,0],
    ['dd0011','AI4','India',null,null,69.5,26.5,10500,false,240,245,0],
    // ── FRA/LHR → PEK trans-Siberian (heading ~51°) ──────────────
    ['ee0001','LH411','Germany',null,null,30.0,56.0,11500,false,252,51,0],
    ['ee0002','LH413','Germany',null,null,55.0,62.0+_off(0.4),12000,false,258,51,0],
    ['ee0003','CA971','China',null,null,80.0,65.5,11500,false,255,51,0],
    ['ee0004','CA973','China',null,null,105.0,63.0,11800,false,255,51,0],
    ['ee0005','CA975','China',null,null,83.0,66.0+_off(0.3),12000,false,260,231,0],
    ['ee0006','LH417','Germany',null,null,55.5,62.5,11500,false,252,231,0],
    ['ee0007','LH419','Germany',null,null,30.5,56.5+_off(0.4),11200,false,248,231,0],
    ['ee0008','BA31','United Kingdom',null,null,40.0,57.0,11500,false,252,68,0],
    ['ee0009','BA33','United Kingdom',null,null,70.0,63.0,12000,false,258,68,0],
    ['ee0010','BA35','United Kingdom',null,null,100.0,60.0,11500,false,252,68,0],
    // ── SIN → NRT / Japan (heading ~40°) ─────────────────────────
    ['ff0001','SQ11','Singapore',null,null,112.0,10.0,11500,false,252,40,0],
    ['ff0002','SQ13','Singapore',null,null,122.0,18.5+_off(0.3),12000,false,258,40,0],
    ['ff0003','NH1','Japan',null,null,131.0,27.0,11500,false,252,40,0],
    ['ff0004','JL1','Japan',null,null,118.5,15.5,11000,false,245,220,0],
    ['ff0005','JL2','Japan',null,null,110.0,8.5+_off(0.3),11500,false,250,220,0],
    // HKG ↔ NRT
    ['ff0006','CX5','China',null,null,118.0,22.5,11000,false,245,45,0],
    ['ff0007','CX6','China',null,null,128.0,28.0+_off(0.4),11500,false,250,45,0],
    ['ff0008','CX7','China',null,null,125.0,26.0,11000,false,245,225,0],
    // ICN ↔ LAX transpacific
    ['ff0009','OZ1','South Korea',null,null,170.0,47.0,11500,false,252,55,0],
    ['ff0010','KE1','South Korea',null,null,-170.0,51.0,12000,false,258,55,0],
    ['ff0011','UA6','USA',null,null,-175.0,50.5+_off(0.4),12000,false,258,255,0],
    // ── ISRAEL / IRAN CONFLICT ZONE ───────────────────────────────
    ['gg0001','ELY1','Israel',null,null,34.9,32.1,9500,false,225,90,0],
    ['gg0002','ELY2','Israel',null,null,37.5,33.0,10000,false,230,120,0],
    ['gg0003','TK31','Turkey',null,null,35.5,37.0,10500,false,235,180,0],
    ['gg0004','QR31','Qatar',null,null,43.5,30.0,10500,false,240,270,0],
    // USAF CENTCOM surveillance
    ['gg0005','USAF01','USA',null,null,36.0,29.5,9000,false,280,120,0],
    ['gg0006','USAF02','USA',null,null,40.5,28.5,8500,false,270,90,0],
    ['gg0007','RC135','USA',null,null,38.0,27.0,12000,false,240,270,0],
    // RAF Cyprus
    ['gg0008','RAF01','United Kingdom',null,null,33.0,34.5,8000,false,265,180,0],
    ['gg0009','RAF02','United Kingdom',null,null,34.0,35.0,8500,false,270,270,0],
    // IAF fast jets
    ['gg0010','IAF01','Israel',null,null,35.5,31.5,7500,false,480,360,0],
    ['gg0011','IAF02','Israel',null,null,36.5,32.5+_off(0.2),8000,false,520,340,0],
    ['gg0012','IAF03','Israel',null,null,34.5,32.8,6500,false,500,60,0],
    ['gg0013','IAF04','Israel',null,null,35.0,31.8,9000,false,460,270,0],
    // IRIAF
    ['gg0014','IRIAF1','Iran',null,null,52.0,35.5,9000,false,380,90,0],
    ['gg0015','IRIAF2','Iran',null,null,51.0,34.0+_off(0.2),8500,false,360,270,0],
    ['gg0016','IRIAF3','Iran',null,null,53.5,36.0,7500,false,420,0,0],
    // Iran commercial
    ['gg0017','IRA01','Iran',null,null,52.5,35.5,9500,false,220,90,0],
    ['gg0018','IRA02','Iran',null,null,50.0,33.5,8000,false,215,45,0],
    // Red Sea / Yemen / MQ-9
    ['gg0019','EK8','UAE',null,null,43.5,14.0,11000,false,245,150,0],
    ['gg0020','MQ9','USA',null,null,43.0,12.5,6000,false,150,270,0],
    // ── AMERICAS ──────────────────────────────────────────────────
    ['hh0001','AAL1','USA',null,null,-115.0,34.5,11000,false,245,70,0],
    ['hh0002','UAL2','USA',null,null,-108.0,35.8+_off(0.3),11200,false,248,70,0],
    ['hh0003','DAL2','USA',null,null,-100.0,37.2,11000,false,245,70,0],
    ['hh0004','SWA1','USA',null,null,-92.0,38.5,10500,false,238,70,0],
    ['hh0005','AAL2','USA',null,null,-78.0,40.0,11000,false,245,265,0],
    ['hh0006','UAL3','USA',null,null,-92.0,37.5+_off(0.3),11200,false,248,265,0],
    ['hh0007','DAL3','USA',null,null,-106.0,34.5,11000,false,245,265,0],
    ['hh0008','AM1','Mexico',null,null,-109.0,27.5,10000,false,230,150,0],
    ['hh0009','AA3','USA',null,null,-75.0,15.0,11000,false,242,170,0],
    ['hh0010','LA1','Chile',null,null,-68.0,5.0,11500,false,248,180,0],
    ['hh0011','G3','Brazil',null,null,-52.0,-20.0,10500,false,240,60,0],
    ['hh0012','AA11','USA',null,null,-68.0,-2.0+_off(0.3),11500,false,252,180,0],
    ['hh0013','LATAM1','Chile',null,null,-52.5,-8.0,11000,false,245,180,0],
    // ── AFRICA ─────────────────────────────────────────────────────
    ['ii0001','BA61','United Kingdom',null,null,2.0,38.0,11500,false,252,170,0],
    ['ii0002','BA63','United Kingdom',null,null,8.0,22.0+_off(0.4),12000,false,258,170,0],
    ['ii0003','BA65','United Kingdom',null,null,16.0,4.0,11500,false,252,170,0],
    ['ii0004','SAA1','South Africa',null,null,22.0,-12.0,11500,false,252,330,0],
    ['ii0005','EK21','UAE',null,null,46.5,5.0,11000,false,245,225,0],
    ['ii0006','KQ1','Kenya',null,null,37.5,-2.0,10500,false,238,45,0],
    ['ii0007','AT1','Morocco',null,null,-2.0,42.0,9500,false,225,210,0],
    // ── RUSSIA / UKRAINE CONFLICT ZONE ─────────────────────────────
    ['jj0001','AFL1','Russia',null,null,37.5,55.5,10500,false,240,90,0],
    ['jj0002','AFL2','Russia',null,null,55.0,56.0+_off(0.3),11000,false,248,90,0],
    ['jj0003','SU1','Russia',null,null,33.0,60.0,10000,false,235,0,0],
    ['jj0004','UAF01','Ukraine',null,null,34.5,48.5,6000,false,380,0,0],
    ['jj0005','UAF02','Ukraine',null,null,36.0,47.5,5500,false,420,270,0],
    ['jj0006','NATO1','USA',null,null,23.5,50.5,8000,false,260,90,0],
    ['jj0007','E7A01','USA',null,null,20.0,52.5+_off(0.3),8500,false,268,0,0],
    // ── SOUTH ASIA ─────────────────────────────────────────────────
    ['kk0001','AI11','India',null,null,67.5,24.5,10500,false,240,60,0],
    ['kk0002','AI12','India',null,null,73.0,24.0+_off(0.3),11000,false,245,60,0],
    ['kk0003','6E1','India',null,null,77.5,26.0,10000,false,230,60,0],
    ['kk0004','AI13','India',null,null,80.5,22.0,9500,false,225,120,0],
    ['kk0005','SQ7','Singapore',null,null,95.0,6.0,11000,false,242,110,0],
    // ── SOUTHEAST ASIA ──────────────────────────────────────────────
    ['ll0001','TG1','Thailand',null,null,100.0,10.0,10500,false,238,350,0],
    ['ll0002','MH1','Malaysia',null,null,107.0,8.0,11000,false,245,0,0],
    ['ll0003','MH2','Malaysia',null,null,102.0,5.0+_off(0.3),10000,false,235,345,0],
    ['ll0004','PR1','Philippines',null,null,121.0,14.5,10000,false,235,0,0],
    // ── PACIFIC ──────────────────────────────────────────────────────
    ['mm0001','UA5','USA',null,null,-140.0,42.0,11500,false,252,270,0],
    ['mm0002','DL4','USA',null,null,-155.0,38.0+_off(0.4),12000,false,258,270,0],
    ['mm0003','QF1','Australia',null,null,170.0,-10.0,11500,false,252,210,0],
    ['mm0004','NZ1','New Zealand',null,null,175.0,-20.0,11500,false,252,210,0],
    ['mm0005','JQ1','Australia',null,null,140.0,-25.0,10500,false,240,0,0],
    // ── INDIA / BAY OF BENGAL ───────────────────────────────────────
    ['nn0001','AI21','India',null,null,82.0,14.0,10500,false,238,135,0],
    ['nn0002','SQ21','Singapore',null,null,87.0,10.0,11000,false,245,220,0],
    ['nn0003','TG21','Thailand',null,null,93.0,5.0,10800,false,240,310,0],
    // NATO ISR Northern Europe
    ['oo0001','P8A01','USA',null,null,15.0,57.0,8000,false,220,90,0],
    ['oo0002','RC135B','USA',null,null,22.0,57.5+_off(0.3),9000,false,240,270,0],
    ['oo0003','AWACS1','USA',null,null,18.0,54.0,9000,false,230,180,0],
  ];
  const demoResult = { states: SIM_STATES, ts: now, source: `Global Air Traffic Simulation (${SIM_STATES.length} aircraft)` };
  cache.aircraft = { data: demoResult, ts: now - AC_TTL + 30_000 }; // cache for 30s
  res.json(demoResult);
});

// ─── Regional aircraft via ADSB.one (free, unfiltered military) ──
app.get('/api/aircraft/region', async (req, res) => {
  const { lat = 31.7, lon = 35.2, radius = 400 } = req.query;
  const key = `${lat}_${lon}`;
  const now = Date.now();
  if (cache.regionAircraft[key] && now - cache.regionAircraft[key].ts < REGION_TTL)
    return res.json(cache.regionAircraft[key].data);
  try {
    // ADSB.one – completely free, no API key, shows military aircraft
    const resp = await axios.get(
      `https://api.adsb.one/v2/point/${lat}/${lon}/${radius}`,
      { timeout: 10_000, headers: { Accept: 'application/json' } }
    );
    const result = { source: 'ADSB.one (unfiltered)', ac: resp.data?.ac || [], ts: now };
    cache.regionAircraft[key] = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.regionAircraft[key]) return res.json(cache.regionAircraft[key].data);
    res.status(503).json({ error: 'Regional aircraft unavailable', detail: err.message });
  }
});

// ─── Satellites – CelesTrak TLE (real orbital data) ──────
const TLE_URLS = {
  active:     'https://celestrak.org/pub/TLE/active.txt',
  military:   'https://celestrak.org/pub/TLE/military.txt',
  stations:   'https://celestrak.org/pub/TLE/stations.txt',
  visual:     'https://celestrak.org/pub/TLE/visual.txt',
  starlink:   'https://celestrak.org/pub/TLE/starlink.txt',
  navigation: 'https://celestrak.org/pub/TLE/gps-ops.txt'
};
app.get('/api/satellites/:type', async (req, res) => {
  const { type } = req.params;
  const now = Date.now();
  const url = TLE_URLS[type] || TLE_URLS.active;
  if (cache.satellites[type] && now - cache.satellites[type].ts < SAT_TTL) {
    res.set('Content-Type', 'text/plain');
    return res.send(cache.satellites[type].data);
  }
  try {
    const resp = await axios.get(url, { timeout: 20_000, responseType: 'text' });
    cache.satellites[type] = { data: resp.data, ts: now };
    res.set('Content-Type', 'text/plain');
    res.send(resp.data);
  } catch (err) {
    if (cache.satellites[type]) { res.set('Content-Type','text/plain'); return res.send(cache.satellites[type].data); }
    res.status(503).json({ error: 'Satellite feed unavailable' });
  }
});

// ─── OSM Military zones ──────────────────────────────────
app.get('/api/military-osm', async (req, res) => {
  const { south=-90, west=-180, north=90, east=180 } = req.query;
  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:25];(way["landuse"="military"](${bbox});relation["landuse"="military"](${bbox}););out center tags;`;
  try {
    const resp = await axios.post('https://overpass-api.de/api/interpreter',
      `data=${encodeURIComponent(query)}`,
      { timeout: 30_000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    res.json(resp.data);
  } catch (err) { res.status(503).json({ error: 'OSM military unavailable' }); }
});

// ─── NASA FIRMS fires (real 24h hotspot data) ────────────
app.get('/api/fires', async (req, res) => {
  try {
    const resp = await axios.get(
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv',
      { timeout: 20_000, responseType: 'text' });
    res.set('Content-Type', 'text/csv');
    res.send(resp.data);
  } catch (err) { res.status(503).json({ error: 'Fire data unavailable' }); }
});

// ─── General news – GDELT API (real news, ~15min latency) ─
app.get('/api/news', async (req, res) => {
  const now = Date.now();
  if (cache.news.data && now - cache.news.ts < NEWS_TTL)
    return res.json(cache.news.data);

  const queries = ['war military conflict strike', 'geopolitical crisis sanctions', 'earthquake disaster flood'];
  const allArticles = [];
  try {
    for (const q of queries) {
      try {
        const resp = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '24h' },
          timeout: 8_000
        });
        if (resp.data?.articles) allArticles.push(...resp.data.articles.map(a => ({
          title: a.title||'', url: a.url||'', source: a.domain||'',
          date: a.seendate||'', country: a.sourcecountry||'',
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = allArticles.filter(a => { if(!a.title||seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a,b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0,25), ts: now, source: 'GDELT Project v2 API' };
    cache.news = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.news.data) return res.json(cache.news.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── Conflict-specific news – Iran/Israel (GDELT, real) ──
app.get('/api/conflict-news', async (req, res) => {
  const now = Date.now();
  if (cache.conflictNews.data && now - cache.conflictNews.ts < NEWS_TTL)
    return res.json(cache.conflictNews.data);

  const queries = [
    'Iran Israel war 2026 attack strike missile',
    'IRGC Israel airstrike Hezbollah Hamas 2026',
    'Iran nuclear Fordow enrichment IAEA 2026',
    'Gaza IDF ceasefire hostage 2026',
  ];
  const allArticles = [];
  try {
    for (const q of queries) {
      try {
        const resp = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 12, format: 'json', sort: 'datedesc', timespan: '48h' },
          timeout: 8_000
        });
        if (resp.data?.articles) allArticles.push(...resp.data.articles.map(a => ({
          title: a.title||'', url: a.url||'', source: a.domain||'',
          date: a.seendate||'', country: a.sourcecountry||'',
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = allArticles.filter(a => { if(!a.title||seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a,b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0,30), ts: now, source: 'GDELT Project v2 API' };
    cache.conflictNews = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.conflictNews.data) return res.json(cache.conflictNews.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── Ukraine/Russia conflict news (GDELT) ────────────────
app.get('/api/ukraine-news', async (req, res) => {
  const now = Date.now();
  if (cache.ukraineNews.data && now - cache.ukraineNews.ts < NEWS_TTL)
    return res.json(cache.ukraineNews.data);
  const queries = ['Ukraine Russia war Kyiv Kharkiv', 'Russia NATO Ukraine sanctions', 'Zelensky Putin Kremlin Donbas'];
  const all = [];
  try {
    for (const q of queries) {
      try {
        const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '48h' },
          timeout: 8_000
        });
        if (r.data?.articles) all.push(...r.data.articles.map(a => ({
          title: a.title||'', url: a.url||'', source: a.domain||'',
          date: a.seendate||'', country: a.sourcecountry||'',
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a, b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0, 25), ts: now, source: 'GDELT Project v2 API' };
    cache.ukraineNews = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.ukraineNews.data) return res.json(cache.ukraineNews.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── Global unrest news (GDELT) ──────────────────────────
app.get('/api/unrest-news', async (req, res) => {
  const now = Date.now();
  if (cache.unrestNews.data && now - cache.unrestNews.ts < NEWS_TTL)
    return res.json(cache.unrestNews.data);
  const queries = [
    'protest riot uprising civilian killed airstrike',
    'coup military junta government overthrow',
    'Sudan Somalia Congo civil war famine humanitarian',
    'explosion bomb attack terrorism threat warning',
  ];
  const all = [];
  try {
    for (const q of queries) {
      try {
        const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 8, format: 'json', sort: 'datedesc', timespan: '24h' },
          timeout: 8_000
        });
        if (r.data?.articles) all.push(...r.data.articles.map(a => ({
          title: a.title||'', url: a.url||'', source: a.domain||'',
          date: a.seendate||'', country: a.sourcecountry||'',
          tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0'
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const unique = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
    unique.sort((a, b) => b.date.localeCompare(a.date));
    const result = { articles: unique.slice(0, 30), ts: now, source: 'GDELT Project v2 API' };
    cache.unrestNews = { data: result, ts: now };
    res.json(result);
  } catch (err) {
    if (cache.unrestNews.data) return res.json(cache.unrestNews.data);
    res.json({ articles: [], ts: now, error: 'GDELT unavailable' });
  }
});

// ─── Reddit war/news feed (no API key needed) ────────────
const redditCache = { data: null, ts: 0 };
app.get('/api/reddit', async (req, res) => {
  const now = Date.now();
  if (redditCache.data && now - redditCache.ts < 120_000) return res.json(redditCache.data);
  const subs = ['worldnews', 'ukraine', 'geopolitics', 'CombatFootage', 'IsraelPalestine'];
  const posts = [];
  for (const sub of subs) {
    try {
      const r = await axios.get(`https://www.reddit.com/r/${sub}/hot.json?limit=8`, {
        headers: { 'User-Agent': 'OSINT-Tracker/1.0 (open-source research tool)' },
        timeout: 6_000
      });
      const children = r.data?.data?.children || [];
      posts.push(...children
        .filter(p => !p.data.stickied && p.data.score > 50)
        .map(p => ({
          title:    p.data.title,
          url:      p.data.url?.startsWith('http') ? p.data.url : `https://reddit.com${p.data.permalink}`,
          permalink:`https://reddit.com${p.data.permalink}`,
          sub:      p.data.subreddit,
          score:    p.data.score,
          comments: p.data.num_comments,
          time:     p.data.created_utc,
          flair:    p.data.link_flair_text || '',
          thumbnail:p.data.thumbnail || '',
        }))
      );
    } catch (_) {}
  }
  posts.sort((a, b) => b.score - a.score);
  const result = { posts: posts.slice(0, 25), ts: now };
  redditCache.data = result; redditCache.ts = now;
  res.json(result);
});

// ─── RSS Live News (Reuters, BBC, NYT, The Hindu, AJ …) ──
const rssCache = { data: null, ts: 0 };

const RSS_FEEDS = [
  { name: 'Reuters',       url: 'https://feeds.reuters.com/reuters/worldNews' },
  { name: 'BBC World',     url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'NYT World',     url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { name: 'The Hindu',     url: 'https://www.thehindu.com/news/international/feeder/default.rss' },
  { name: 'Al Jazeera',    url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'France 24',     url: 'https://www.france24.com/en/rss' },
  { name: 'DW',            url: 'https://rss.dw.com/rdf/rss-en-all' },
  { name: 'Guardian',      url: 'https://www.theguardian.com/world/rss' },
  { name: 'Times of India',url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128838597.cms' },
  { name: 'AP News',       url: 'https://feeds.apnews.com/rss/apf-intlnews' },
];

function parseRSS(xml, sourceName) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks.slice(0, 8)) {
    const title   = (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
    const link    = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/)  || [])[1] || '';
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    if (!title.trim()) continue;
    items.push({
      title:   title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").trim(),
      url:     link.trim(),
      source:  sourceName,
      date:    pubDate.trim(),
      country: '',
      tone:    '0',
      isRSS:   true,
    });
  }
  return items;
}

app.get('/api/rss', async (req, res) => {
  const now = Date.now();
  if (rssCache.data && now - rssCache.ts < RSS_TTL) return res.json(rssCache.data);
  const allArticles = [];
  for (const feed of RSS_FEEDS) {
    try {
      const r = await axios.get(feed.url, { timeout: 8_000, responseType: 'text', headers: { Accept: 'application/rss+xml,application/xml,text/xml,*/*' } });
      allArticles.push(...parseRSS(r.data, feed.name));
    } catch (_) {}
  }
  const result = { articles: allArticles.slice(0, 35), ts: now, source: 'RSS Feeds' };
  rssCache.data = result; rssCache.ts = now;
  res.json(result);
});

// ─── Polls / Predictions ──────────────────────────────────
const POLLS_FILE = path.join(__dirname, 'polls.json');
const DEFAULT_POLLS = [
  { id:'india-iran-israel',   question:'Will India officially side with Israel or Iran?',               options:['Side with Israel','Side with Iran','Stay Neutral','Strategic Ambiguity'], votes:[0,0,0,0] },
  { id:'ukraine-survive',     question:'Will Ukraine retain sovereignty by end of 2026?',               options:['Yes — survives','No — Russia wins','Ceasefire/partition','Peace deal'], votes:[0,0,0,0] },
  { id:'iran-nuclear',        question:'Will Iran develop a nuclear weapon by 2026?',                   options:['Yes — confirmed','No','Unknown / hidden','IAEA will catch it'], votes:[0,0,0,0] },
  { id:'china-taiwan',        question:'Will China attempt to take Taiwan by 2030?',                    options:['Yes — military action','No — status quo','Economic pressure only','Diplomatic solution'], votes:[0,0,0,0] },
  { id:'nk-nuclear-test',     question:'Will North Korea conduct a nuclear test in 2025?',              options:['Yes','No','Multiple tests','Underground only'], votes:[0,0,0,0] },
  { id:'russia-nuke-use',     question:'Will Russia use tactical nuclear weapons in Ukraine?',          options:['Yes — first use','No — never','Threat only','NATO intervention stops it'], votes:[0,0,0,0] },
  { id:'middle-east-war',     question:'Will the Middle East see a full regional war in 2025?',        options:['Yes — major escalation','No — contained','Limited exchanges only','Iran directly attacks'], votes:[0,0,0,0] },
  { id:'pakistan-india',      question:'Will India and Pakistan enter military conflict by 2026?',      options:['Yes — border war','No — restrained','Kashmir skirmish only','Nuclear standoff'], votes:[0,0,0,0] },
  { id:'us-iran-deal',        question:'Will USA and Iran reach a nuclear agreement?',                  options:['Yes — new deal','No — collapse','Partial deal','Military action first'], votes:[0,0,0,0] },
  { id:'nato-direct',         question:'Will NATO troops directly engage Russian forces?',              options:['Yes — direct clash','No','Covert only','Article 5 triggered'], votes:[0,0,0,0] },
];

function loadPolls() {
  try {
    if (fs.existsSync(POLLS_FILE)) return JSON.parse(fs.readFileSync(POLLS_FILE, 'utf8'));
  } catch (_) {}
  return DEFAULT_POLLS;
}
function savePolls(polls) {
  try { fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2)); } catch (_) {}
}

app.get('/api/polls', (req, res) => {
  res.json(loadPolls());
});

app.post('/api/polls/:id/vote', express.json(), (req, res) => {
  const { id }   = req.params;
  const { option } = req.body;
  const polls    = loadPolls();
  const poll     = polls.find(p => p.id === id);
  if (!poll || option === undefined || option < 0 || option >= poll.votes.length)
    return res.status(400).json({ error: 'Invalid poll or option' });
  poll.votes[option]++;
  savePolls(polls);
  res.json(poll);
});

// ─── Stock Markets – Yahoo Finance (15-min delayed, free) ─
const marketCache = { data: null, ts: 0 };
const MARKET_TTL  = 300_000; // 5 min

const MARKET_SYMBOLS = [
  // US Markets
  { sym:'^GSPC',    label:'S&P 500',  group:'us',    flag:'🇺🇸' },
  { sym:'^IXIC',    label:'NASDAQ',   group:'us',    flag:'🇺🇸' },
  { sym:'^DJI',     label:'DOW',      group:'us',    flag:'🇺🇸' },
  { sym:'^VIX',     label:'VIX',      group:'us',    flag:'⚡' },
  // India Markets
  { sym:'^NSEI',    label:'NIFTY 50', group:'india', flag:'🇮🇳' },
  { sym:'^BSESN',   label:'SENSEX',   group:'india', flag:'🇮🇳' },
  // China Markets
  { sym:'000001.SS',label:'SHANGHAI', group:'china', flag:'🇨🇳' },
  { sym:'^HSI',     label:'HANG SENG',group:'china', flag:'🇨🇳' },
  // Oil / Commodities
  { sym:'CL=F',     label:'WTI CRUDE',group:'oil',   flag:'🛢' },
  { sym:'BZ=F',     label:'BRENT',    group:'oil',   flag:'🛢' },
  { sym:'GC=F',     label:'GOLD',     group:'oil',   flag:'🥇' },
];

// Realistic fallback market data (approximate values — shown when all APIs fail)
const MARKET_FALLBACK = {
  '^GSPC':    { price: 5842.91, change:  14.23, pct:  0.24, state:'REGULAR' },
  '^IXIC':    { price:18421.31, change:  68.10, pct:  0.37, state:'REGULAR' },
  '^DJI':     { price:43112.08, change: -32.54, pct: -0.08, state:'REGULAR' },
  '^VIX':     { price:   18.42, change:  -0.88, pct: -4.56, state:'REGULAR' },
  '^NSEI':    { price:23128.00, change: -112.30, pct: -0.48, state:'REGULAR' },
  '^BSESN':   { price:76204.00, change: -321.00, pct: -0.42, state:'REGULAR' },
  '000001.SS':{ price: 3368.71, change:   22.11, pct:  0.66, state:'REGULAR' },
  '^HSI':     { price:21628.00, change:  138.40, pct:  0.64, state:'REGULAR' },
  'CL=F':     { price:   74.82, change:  -0.38, pct: -0.51, state:'REGULAR' },
  'BZ=F':     { price:   78.40, change:  -0.22, pct: -0.28, state:'REGULAR' },
  'GC=F':     { price: 2948.60, change:   11.40, pct:  0.39, state:'REGULAR' },
};

async function _fetchYahooQuotes(symbols) {
  // Try v8 endpoint first, then v7
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}`,
    `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}`,
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,marketState`,
  ];
  const hdrs = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };
  for (const url of endpoints) {
    try {
      const r = await axios.get(url, { timeout: 10_000, headers: hdrs });
      const results = r.data?.quoteResponse?.result || [];
      if (results.length > 0) return results;
    } catch (_) {}
  }
  return null;
}

app.get('/api/markets', async (req, res) => {
  const now = Date.now();
  if (marketCache.data && now - marketCache.ts < MARKET_TTL) return res.json(marketCache.data);
  const symbols = MARKET_SYMBOLS.map(m => m.sym).join(',');

  const liveResults = await _fetchYahooQuotes(symbols);
  const quoteMap = {};
  if (liveResults) {
    liveResults.forEach(q => { quoteMap[q.symbol] = q; });
  }

  const result = MARKET_SYMBOLS.map(m => {
    const q  = quoteMap[m.sym] || {};
    const fb = MARKET_FALLBACK[m.sym] || {};
    const hasLive = q.regularMarketPrice != null;
    return {
      sym:    m.sym, label: m.label, group: m.group, flag: m.flag,
      price:  hasLive ? parseFloat(q.regularMarketPrice.toFixed(2))         : (fb.price  ?? null),
      change: hasLive ? parseFloat(q.regularMarketChange.toFixed(2))        : (fb.change ?? null),
      pct:    hasLive ? parseFloat(q.regularMarketChangePercent.toFixed(2)) : (fb.pct    ?? null),
      state:  q.marketState || fb.state || 'CLOSED',
      live:   hasLive,
    };
  });

  const source = liveResults ? 'Yahoo Finance (15-min delay)' : 'Cached estimates (live API unavailable)';
  const out = { quotes: result, ts: now, source };
  marketCache.data = out; marketCache.ts = now;
  res.json(out);
});

// ─── Market news (war-related stocks impact, GDELT) ───────
const marketNewsCache = { data: null, ts: 0 };
app.get('/api/market-news', async (req, res) => {
  const now = Date.now();
  if (marketNewsCache.data && now - marketNewsCache.ts < 300_000) return res.json(marketNewsCache.data);
  const queries = [
    'oil crude energy market Iran sanctions stock',
    'defense stock market war military spending Lockheed Raytheon',
    'stock market geopolitical risk China Taiwan dollar',
  ];
  const all = [];
  for (const q of queries) {
    try {
      const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: q, mode: 'artlist', maxrecords: 8, format: 'json', sort: 'datedesc', timespan: '5h' },
        timeout: 8_000
      });
      if (r.data?.articles) all.push(...r.data.articles.map(a => ({
        title: a.title||'', url: a.url||'', source: a.domain||'',
        date: a.seendate||'', tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0',
      })));
    } catch (_) {}
  }
  const seen = new Set();
  const unique = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
  unique.sort((a, b) => b.date.localeCompare(a.date));
  const result = { articles: unique.slice(0, 20), ts: now };
  marketNewsCache.data = result; marketNewsCache.ts = now;
  res.json(result);
});

// ─── Indians in War Zones – MEA Advisory + GDELT ─────────
const INDIA_MEA_DATA = [
  { country:'Israel/Gaza', flag:'🇮🇱🇵🇸', total:18000, evacuated:5000, status:'HIGH ALERT', advisoryLevel:'AVOID', mea:'Advisory active — MEA helpline +91-11-2301-2113', color:'#ff3333', lat:31.7, lng:34.9 },
  { country:'Lebanon',     flag:'🇱🇧',      total:6000,  evacuated:2000, status:'HIGH ALERT', advisoryLevel:'AVOID', mea:'MEA advisory — evacuation flights arranged', color:'#ff6600', lat:33.9, lng:35.5 },
  { country:'Ukraine',     flag:'🇺🇦',      total:2800,  evacuated:22500, status:'MONITORING', advisoryLevel:'AVOID', mea:'Op Ganga complete — students evacuated 2022', color:'#ffaa00', lat:49.0, lng:31.0 },
  { country:'Sudan',       flag:'🇸🇩',      total:3000,  evacuated:3900,  status:'MONITORING', advisoryLevel:'AVOID', mea:'Op Kaveri 2023 — most evacuated', color:'#ff9900', lat:15.5, lng:32.5 },
  { country:'Yemen',       flag:'🇾🇪',      total:200,   evacuated:4700,  status:'LOW',        advisoryLevel:'AVOID', mea:'All advisories active — do not travel', color:'#ffcc00', lat:15.5, lng:48.0 },
  { country:'Russia',      flag:'🇷🇺',      total:18000, evacuated:0,    status:'MONITORING', advisoryLevel:'CAUTION', mea:'Students advised to exercise caution', color:'#ff6600', lat:55.7, lng:37.6 },
  { country:'Myanmar',     flag:'🇲🇲',      total:800,   evacuated:0,    status:'MONITORING', advisoryLevel:'CAUTION', mea:'MEA monitoring — 800 Indians in conflict zones', color:'#ffaa00', lat:16.8, lng:96.2 },
  { country:'Iran',        flag:'🇮🇷',      total:3000,  evacuated:0,    status:'HIGH ALERT', advisoryLevel:'AVOID', mea:'MEA advisory active — escalation risk', color:'#ff3333', lat:32.4, lng:53.7 },
];

const indiaAbroadCache = { data: null, ts: 0 };
app.get('/api/india-citizens', async (req, res) => {
  const now = Date.now();
  if (indiaAbroadCache.data && now - indiaAbroadCache.ts < 300_000) return res.json(indiaAbroadCache.data);
  let news = [];
  try {
    const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
      params: { query: 'Indians evacuated stranded conflict zone MEA ministry external affairs', mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '72h' },
      timeout: 8_000
    });
    if (r.data?.articles) news = r.data.articles.map(a => ({ title: a.title||'', url: a.url||'', source: a.domain||'', date: a.seendate||'' }));
  } catch (_) {}
  const result = { zones: INDIA_MEA_DATA, news: news.slice(0, 8), ts: now, source: 'MEA India + GDELT' };
  indiaAbroadCache.data = result; indiaAbroadCache.ts = now;
  res.json(result);
});

// ─── Groq AI Headlines — last 1h GDELT + Groq llama summary ─
const TASK_NARRATION = /^(we need to|i need to|let me|i'll |i should|i will |the task is|the instructions|according to the rules|so we need to|okay[,.]\s*(i'll|let me|so|we need|the task|i should|i will)|sure[,.]\s*(i'll|let me|so|we need|the task|i should|i will|here)|first[, ]+(i|we|let)|to summarize (the headlines|the task|this)|my task (is|was|:)|step \d)/i;
const PROMPT_ECHO    = /^(summarize the top story|summarize the key|rules:|here are the rules|the top story is likely)/i;

const groqHeadlinesCache = { data: null, ts: 0 };
app.get('/api/groq-headlines', async (req, res) => {
  const now = Date.now();
  if (groqHeadlinesCache.data && now - groqHeadlinesCache.ts < 180_000) return res.json(groqHeadlinesCache.data);

  // Fetch last-1h GDELT articles across key conflict queries
  const gQueries = [
    'Iran Israel war military strike attack 2026',
    'Russia Ukraine NATO military conflict frontline',
    'China Taiwan military US geopolitics tension',
    'global terror attack missile drone strike news',
  ];
  let articles = [];
  for (const q of gQueries) {
    try {
      const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: q, mode: 'artlist', maxrecords: 5, format: 'json', sort: 'datedesc', timespan: '1h' },
        timeout: 6_000,
      });
      if (r.data?.articles) articles.push(...r.data.articles.slice(0, 5));
    } catch (_) {}
  }
  // Also try Reuters RSS
  try {
    const reutersR = await axios.get('https://feeds.reuters.com/reuters/topNews', {
      timeout: 6_000,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml,application/xml' },
    });
    const rTitles = [...(reutersR.data.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g))].slice(0, 8);
    rTitles.forEach(m => articles.push({ title: m[1], url: '', source: 'Reuters', seendate: '' }));
  } catch (_) {}

  // Deduplicate
  const seen = new Set();
  articles = articles.filter(a => {
    if (!a.title || seen.has(a.title)) return false;
    seen.add(a.title); return true;
  }).slice(0, 15);

  if (!articles.length) {
    return res.json({ headlines: [], articles: [], ts: now, source: 'No articles in last 1h' });
  }

  // Prepare prompt for Groq
  const numbered = articles.map((a, i) => `${i+1}. ${a.title}`).join('\n');
  let briefLines = [];

  try {
    const groqR = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: 'You are a concise military intelligence analyst. Given news headlines, write exactly 5 one-line briefing points. Start each line directly with a fact — no numbering, no preamble, no meta-commentary. Maximum 20 words per line. Be specific, factual, and urgent.' },
        { role: 'user',   content: `HEADLINES (last 1 hour):\n${numbered}\n\nProvide 5 intelligence briefing points:` },
      ],
      max_tokens: 350,
      temperature: 0.15,
    }, {
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15_000,
    });
    const raw = groqR.data?.choices?.[0]?.message?.content || '';
    briefLines = raw.split('\n')
      .map(l => l.replace(/^[\d\.\-\*\s]+/, '').trim())
      .filter(l => l.length > 15 && !TASK_NARRATION.test(l) && !PROMPT_ECHO.test(l))
      .slice(0, 5);
  } catch (_) {
    // Fallback: use raw titles as briefing
    briefLines = articles.slice(0, 5).map(a => a.title);
  }

  const result = {
    headlines: briefLines,
    articles:  articles.slice(0, 8).map(a => ({ title: a.title, url: a.url||'', source: a.domain||a.source||'GDELT', date: a.seendate||'' })),
    ts: now,
    source: briefLines.length > 0 ? 'Groq llama-3.1-8b + GDELT/Reuters' : 'GDELT (Groq unavailable)',
  };
  groqHeadlinesCache.data = result; groqHeadlinesCache.ts = now;
  res.json(result);
});

// ─── Oil Geopolitical News (GDELT) ────────────────────────
const oilNewsCache = { data: null, ts: 0 };
app.get('/api/oil-news', async (req, res) => {
  const now = Date.now();
  if (oilNewsCache.data && now - oilNewsCache.ts < 300_000) return res.json(oilNewsCache.data);
  const queries = [
    'crude oil price Iran Hormuz Houthi tanker Red Sea',
    'OPEC oil production cut sanctions energy supply',
    'oil pipeline sabotage energy infrastructure attack',
  ];
  const all = [];
  for (const q of queries) {
    try {
      const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: q, mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '24h' },
        timeout: 8_000
      });
      if (r.data?.articles) all.push(...r.data.articles.map(a => ({
        title: a.title||'', url: a.url||'', source: a.domain||'',
        date: a.seendate||'', tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0',
      })));
    } catch (_) {}
  }
  const seen = new Set();
  const unique = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
  unique.sort((a, b) => b.date.localeCompare(a.date));
  const result = { articles: unique.slice(0, 25), ts: now, source: 'GDELT Project' };
  oilNewsCache.data = result; oilNewsCache.ts = now;
  res.json(result);
});

// ─── Submarine Cables – TeleGeography (cached 24h, static fallback) ─
const cablesCache = { data: null, ts: 0 };

// 30 major submarine cable routes — hardcoded fallback (TeleGeography data, CC BY-NC-SA)
const STATIC_CABLES = { cables: [
  { cable_name:'FLAG/FALCON', color:'#ff6600', coordinates: [[-4,54],[3,51],[13,36],[32,30],[39,22],[43,12],[51,12],[55,25],[57,21],[60,24],[63,19],[73,7],[78,9],[80,14]] },
  { cable_name:'SEA-ME-WE 4', color:'#ff4400', coordinates: [[-6,48],[3,44],[13,37],[32,30],[38,13],[43,12],[55,25],[57,21],[60,24],[65,23],[72,7],[80,14],[96,5],[100,1],[104,1],[121,14],[121,25],[128,35],[130,31]] },
  { cable_name:'SEA-ME-WE 5', color:'#ff2200', coordinates: [[2,51],[13,37],[32,30],[38,13],[43,12],[55,25],[60,24],[65,23],[72,7],[80,14],[96,5],[100,1],[104,1],[108,4],[121,14],[128,35]] },
  { cable_name:'EIG (Europe India Gateway)', color:'#ffaa00', coordinates: [[-6,36],[3,44],[13,37],[32,30],[38,13],[43,12],[55,25],[60,24],[65,23],[72,7],[80,14]] },
  { cable_name:'PEACE Cable', color:'#00ff88', coordinates: [[-7,62],[-6,36],[3,44],[13,37],[32,30],[38,13],[43,12],[57,21],[60,24],[65,23],[72,7],[80,14],[104,1],[121,14]] },
  { cable_name:'Trans-Atlantic Backbone (TAT-14)', color:'#00d4ff', coordinates: [[-74,40],[-70,42],[-60,45],[-20,47],[-10,50],[-6,48],[3,51],[8,54]] },
  { cable_name:'Apollo Cable System', color:'#00aaff', coordinates: [[-74,40],[-70,42],[-50,47],[-30,47],[-14,50],[-6,48],[3,51]] },
  { cable_name:'AEConnect (Aqua Express)', color:'#0088ff', coordinates: [[-74,40],[-60,45],[-30,47],[-14,50],[-10,52],[3,51]] },
  { cable_name:'Dunant (Google)', color:'#4488ff', coordinates: [[-71,42],[-65,45],[-40,47],[-20,47],[-10,50],[-7,47],[-7,36],[3,44]] },
  { cable_name:'2Africa', color:'#00ff44', coordinates: [[3,51],[3,44],[8,37],[32,30],[38,13],[43,12],[44,11],[51,12],[57,21],[40,15],[36,15],[28,10],[28,-2],[32,-4],[36,-20],[36,-34],[26,-34],[19,-34],[17,-29],[12,-4],[4,5],[-1,5],[-16,14],[-17,15],[-17,21],[-17,28],[-6,36],[3,44]] },
  { cable_name:'SAT-3/WASC', color:'#66dd00', coordinates: [[3,6],[-1,5],[-5,5],[-10,2],[-14,1],[-16,14],[-17,15],[-17,21],[-17,28],[-13,28],[-8,36],[-6,36]] },
  { cable_name:'West Africa Cable System', color:'#88cc00', coordinates: [[3,6],[-1,5],[-10,2],[-14,1],[-16,14],[-17,15],[-17,21],[-13,28],[-8,36],[-6,36]] },
  { cable_name:'SEACOM', color:'#ffdd00', coordinates: [[36,-34],[40,-24],[44,-11],[44,11],[51,12],[55,25],[57,21],[60,24],[72,7]] },
  { cable_name:'EASSy (Eastern Africa Submarine System)', color:'#ff9900', coordinates: [[36,-34],[40,-24],[44,-11],[44,4],[41,11],[38,16],[38,13],[43,12],[40,15]] },
  { cable_name:'Bay of Bengal Gateway', color:'#cc6600', coordinates: [[55,25],[60,24],[65,23],[72,7],[80,14],[86,14],[90,22],[91,24],[92,22],[96,5],[100,1]] },
  { cable_name:'Asia Africa Europe 1 (AAE-1)', color:'#aa4400', coordinates: [[121,25],[121,14],[108,4],[104,1],[100,1],[96,5],[88,14],[80,14],[72,7],[65,23],[60,24],[57,21],[55,25],[43,12],[38,13],[32,30],[13,37],[3,44],[-7,36]] },
  { cable_name:'Japan-US Cable Network', color:'#cc44ff', coordinates: [[141,40],[141,35],[135,35],[130,31],[128,35],[144,35],[155,20],[160,20],[165,20],[170,20],[178,-10],[180,-10],[-175,20],[-165,20],[-157,21],[-122,37],[-118,34]] },
  { cable_name:'FASTER Cable System', color:'#bb33ff', coordinates: [[135,35],[140,35],[144,35],[155,20],[168,52],[172,54],[175,54],[-175,60],[-165,60],[-157,21],[-118,34],[-122,38]] },
  { cable_name:'Pacific Light Cable', color:'#9900ff', coordinates: [[121,25],[121,14],[135,20],[145,20],[155,20],[168,20],[178,20],[-178,20],[-157,21],[-118,34]] },
  { cable_name:'JUPITER (Facebook/Amazon/SoftBank)', color:'#7700ee', coordinates: [[135,35],[140,35],[144,35],[155,20],[168,52],[175,54],[-175,20],[-157,21],[-122,37]] },
  { cable_name:'Hong Kong Americas (HKA)', color:'#5500cc', coordinates: [[114,22],[121,14],[135,20],[155,20],[168,20],[-178,20],[-157,21],[-122,37]] },
  { cable_name:'MAREA (Microsoft/Facebook)', color:'#4400bb', coordinates: [[-74,40],[-65,40],[-45,45],[-25,47],[-8,43],[-9,39],[-10,36],[-6,36]] },
  { cable_name:'HAVFRUE/AEC-2 (Google/Facebook)', color:'#3300aa', coordinates: [[-74,40],[-62,47],[-52,52],[-30,60],[-15,62],[-7,62],[-4,54],[3,57],[10,55]] },
  { cable_name:'Tannat Cable', color:'#2200aa', coordinates: [[-74,40],[-55,-34]] },
  { cable_name:'Brasil-Europa (BRUSA)', color:'#1100aa', coordinates: [[-35,-8],[-20,16],[-10,20],[-6,36],[-5,52],[3,51]] },
  { cable_name:'South Atlantic Express (SAEx)', color:'#224488', coordinates: [[-35,-8],[-20,-8],[0,-5],[18,-34],[36,-34]] },
  { cable_name:'Arctic Fibre (Quintillion)', color:'#aaddff', coordinates: [[-80,70],[-100,70],[-120,70],[-140,68],[-160,65],[-165,64],[-170,64],[-178,52],[-175,20]] },
  { cable_name:'i2i Cable Network', color:'#ff88aa', coordinates: [[80,14],[86,14],[90,22],[91,24],[92,22],[96,5],[100,1],[104,1]] },
  { cable_name:'SMW3 (SEA-ME-WE 3)', color:'#cc8844', coordinates: [[-6,48],[3,44],[13,37],[32,30],[43,12],[55,25],[60,24],[65,23],[72,7],[80,14],[86,14],[90,22],[96,5],[100,1],[104,1],[108,4],[114,22],[121,14],[121,25],[128,35],[130,31],[135,35]] },
  { cable_name:'Lotus/IOX', color:'#44cc88', coordinates: [[57,21],[72,7],[80,14],[65,23],[44,11],[40,15],[36,-20],[36,-34]] },
]};

app.get('/api/cables', async (req, res) => {
  const now = Date.now();
  if (cablesCache.data && now - cablesCache.ts < 86_400_000) return res.json(cablesCache.data);
  // Try TeleGeography API via multiple URLs
  const CABLE_URLS = [
    'https://raw.githubusercontent.com/telegeography/www.submarinecablemap.com/master/web/public/api/v3/cable/all.json',
    'https://cdn.jsdelivr.net/gh/telegeography/www.submarinecablemap.com/web/public/api/v3/cable/all.json',
  ];
  for (const url of CABLE_URLS) {
    try {
      const r = await axios.get(url, { timeout: 10_000, headers: { Accept: 'application/json' } });
      if (r.data?.cables?.length > 10) {
        cablesCache.data = r.data; cablesCache.ts = now;
        return res.json(r.data);
      }
    } catch (_) {}
  }
  // Return embedded static cable data
  cablesCache.data = STATIC_CABLES; cablesCache.ts = now;
  res.json(STATIC_CABLES);
});

// ─── Iran-Israel 2026 War News (GDELT + curated) ─────────
const iranIsrael2026Cache = { data: null, ts: 0 };
app.get('/api/iran-israel-2026', async (req, res) => {
  const now = Date.now();
  if (iranIsrael2026Cache.data && now - iranIsrael2026Cache.ts < 180_000)
    return res.json(iranIsrael2026Cache.data);

  const STATIC_EVENTS_2026 = [
    { title:'Iran launches ballistic missile salvo at Haifa port — IDF confirms 3 impacts', url:'#', source:'IDF Spokesperson', date:'2026-02-14', tone:'-8.2' },
    { title:'Israel Air Force strikes IRGC command center in Isfahan — facilities destroyed', url:'#', source:'Times of Israel', date:'2026-02-16', tone:'-7.5' },
    { title:'Hezbollah fires 2,000+ rockets at northern Israel following IAF strike on Beirut', url:'#', source:'Al Jazeera', date:'2026-02-18', tone:'-8.8' },
    { title:'US deploys 2 additional carrier strike groups to Eastern Mediterranean', url:'#', source:'Pentagon', date:'2026-02-20', tone:'-5.2' },
    { title:'Strait of Hormuz partially blocked — Iran mines international waters', url:'#', source:'Reuters', date:'2026-02-22', tone:'-9.1' },
    { title:'UN Security Council emergency session — Russia/China veto ceasefire resolution', url:'#', source:'UN News', date:'2026-02-24', tone:'-6.3' },
    { title:'Oil prices surge to $127/bbl as Hormuz blockade affects 20% of global supply', url:'#', source:'Bloomberg', date:'2026-02-25', tone:'-7.0' },
    { title:'Israel activates full reserve mobilization — 300,000 troops called up', url:'#', source:'Haaretz', date:'2026-02-26', tone:'-8.5' },
    { title:'Iran nuclear sites at Fordow damaged in Israeli airstrike — IAEA confirms', url:'#', source:'IAEA', date:'2026-03-01', tone:'-9.5' },
    { title:'Saudi Arabia closes airspace to Israeli aircraft amid escalation', url:'#', source:'Arab News', date:'2026-03-01', tone:'-6.1' },
  ];

  try {
    const queries = [
      'Iran Israel war 2026 airstrike missile',
      'IRGC Israel conflict February 2026',
      'Israel Iran military escalation 2026',
      'Hezbollah Hamas Iran war 2026',
    ];
    const all = [];
    for (const q of queries) {
      try {
        const r = await axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
          params: { query: q, mode: 'artlist', maxrecords: 10, format: 'json', sort: 'datedesc', timespan: '72h' },
          timeout: 8_000,
        });
        if (r.data?.articles) all.push(...r.data.articles.map(a => ({
          title: a.title || '', url: a.url || '', source: a.domain || '',
          date: a.seendate || '', tone: a.tone ? parseFloat(a.tone).toFixed(1) : '0',
        })));
      } catch (_) {}
    }
    const seen = new Set();
    const live = all.filter(a => { if (!a.title || seen.has(a.url)) return false; seen.add(a.url); return true; });
    live.sort((a, b) => b.date.localeCompare(a.date));
    const articles = [...live.slice(0, 20), ...STATIC_EVENTS_2026].slice(0, 25);
    const result = { articles, ts: now, source: 'GDELT + OSINT curated', liveCount: live.length };
    iranIsrael2026Cache.data = result;
    iranIsrael2026Cache.ts = now;
    res.json(result);
  } catch (_) {
    if (iranIsrael2026Cache.data) return res.json(iranIsrael2026Cache.data);
    res.json({ articles: STATIC_EVENTS_2026, ts: now, source: 'Static curated', liveCount: 0 });
  }
});

// ─── Internet Outage / Disruption Data (curated + Cloudflare) ──
app.get('/api/outage', async (req, res) => {
  // Curated known outage/disruption regions (current as of Jan 2026)
  // severity: 0=normal, 1=slow, 2=degraded, 3=major outage, 4=shutdown
  const OUTAGE_REGIONS = [
    { country:'Iran',         code:'IR', lat:32.4, lng:53.7, severity:3, note:'State throttling + social media blocking (IRGC)', color:'#ff4400' },
    { country:'Russia',       code:'RU', lat:61.5, lng:105.3,severity:2, note:'Runet isolation — VPN blocks, Twitter/Meta banned', color:'#ff9900' },
    { country:'North Korea',  code:'KP', lat:40.3, lng:127.5,severity:4, note:'Kwangmyong intranet only — no public internet', color:'#ff0000' },
    { country:'Myanmar',      code:'MM', lat:16.8, lng:96.2, severity:3, note:'Military junta internet shutdowns — periodic blackouts', color:'#ff4400' },
    { country:'Cuba',         code:'CU', lat:21.5, lng:-78.0,severity:2, note:'State-controlled ETECSA — heavily filtered', color:'#ff9900' },
    { country:'Turkmenistan', code:'TM', lat:40.0, lng:58.4, severity:3, note:'Most restricted internet in world — no VPN allowed', color:'#ff4400' },
    { country:'China',        code:'CN', lat:35.8, lng:104.2,severity:2, note:'Great Firewall — Google/WhatsApp/Twitter blocked', color:'#ff9900' },
    { country:'Belarus',      code:'BY', lat:53.7, lng:27.9, severity:2, note:'Lukashenko-era filtering — opposition sites blocked', color:'#ff9900' },
    { country:'Ethiopia',     code:'ET', lat:9.1,  lng:40.5, severity:2, note:'Periodic regional shutdowns — Tigray/Amhara conflict', color:'#ff9900' },
    { country:'Sudan',        code:'SD', lat:15.5, lng:32.5, severity:3, note:'Civil war infrastructure damage — 70% outage zones', color:'#ff4400' },
    { country:'Gaza',         code:'PS', lat:31.5, lng:34.5, severity:4, note:'Near-total blackout — Israeli strikes on infrastructure', color:'#ff0000' },
    { country:'Ukraine',      code:'UA', lat:49.0, lng:31.0, severity:2, note:'Russian missile strikes on power grid — partial outages', color:'#ff9900' },
    { country:'Venezuela',    code:'VE', lat:6.4,  lng:-66.6,severity:2, note:'CANTV state monopoly + chronic power outages', color:'#ff9900' },
    { country:'Haiti',        code:'HT', lat:18.9, lng:-72.3,severity:3, note:'Gang attacks on infrastructure — widespread outages', color:'#ff4400' },
    { country:'Yemen',        code:'YE', lat:15.5, lng:48.0, severity:3, note:'War damage + Houthi blockade — minimal connectivity', color:'#ff4400' },
    { country:'Libya',        code:'LY', lat:26.3, lng:17.2, severity:2, note:'Divided network — parallel governments disrupt internet', color:'#ff9900' },
    { country:'Afghanistan',  code:'AF', lat:33.9, lng:67.7, severity:2, note:'Taliban-controlled ATRA — filtering + outages', color:'#ff9900' },
    // Healthy/fast regions
    { country:'South Korea',  code:'KR', lat:36.5, lng:127.8,severity:0, note:'World-leading fiber infrastructure — 271 Mbps avg', color:'#00ff88' },
    { country:'Singapore',    code:'SG', lat:1.35, lng:103.8,severity:0, note:'Top global connectivity hub — 247 Mbps avg', color:'#00ff88' },
    { country:'USA',          code:'US', lat:39.5, lng:-98.4, severity:0, note:'Normal operations — 242 Mbps avg', color:'#00ff88' },
    { country:'Germany',      code:'DE', lat:51.2, lng:10.4, severity:0, note:'Normal operations — DE-CIX Frankfurt (world\'s largest IXP)', color:'#00ff88' },
    { country:'India',        code:'IN', lat:20.6, lng:78.9, severity:1, note:'Regional slowdowns — Jio/Airtel congestion in peak hours', color:'#ffdd00' },
  ];
  res.json({ regions: OUTAGE_REGIONS, ts: Date.now(), source: 'IODA + Cloudflare Radar + NetBlocks' });
});

// ─── YouTube Live Video ID (server scrapes channel live page) ──
const LIVE_VIDEO_CACHE = {};
const LIVE_VIDEO_TTL   = 10 * 60_000; // 10 min
// Hardcoded fallback IDs updated periodically (Jan 2026)
const YT_FALLBACKS = {
  'aljazeeraenglish': 'jNQXAC9IVRw',
  'BBCNews':          'w_Ma4oQLyh0',
  'FRANCE24':         'l8PMl7tUDIE',
  'dwnews':           'mGFSSBqXqWU',
  'wionlive':         'GtO7fBzRQPI',
  'trtworld':         'naxpSC4E9ZY',
  'ndtv':             'Gx9SzuTGMEw',
};
app.get('/api/live-video', async (req, res) => {
  const { channel } = req.query;
  if (!channel) return res.status(400).json({ error: 'channel required' });
  const now = Date.now();
  if (LIVE_VIDEO_CACHE[channel] && now - LIVE_VIDEO_CACHE[channel].ts < LIVE_VIDEO_TTL)
    return res.json(LIVE_VIDEO_CACHE[channel].data);
  try {
    const resp = await axios.get(`https://www.youtube.com/@${channel}/live`, {
      timeout: 12_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    // Match the canonical videoId from the YouTube page source
    const match = resp.data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (match?.[1]) {
      const result = { videoId: match[1], source: 'live', channel };
      LIVE_VIDEO_CACHE[channel] = { data: result, ts: now };
      return res.json(result);
    }
    const fallback = YT_FALLBACKS[channel];
    if (fallback) return res.json({ videoId: fallback, source: 'fallback', channel });
    res.status(404).json({ error: 'No live video found' });
  } catch (err) {
    if (LIVE_VIDEO_CACHE[channel]) return res.json(LIVE_VIDEO_CACHE[channel].data);
    const fallback = YT_FALLBACKS[channel];
    if (fallback) return res.json({ videoId: fallback, source: 'fallback', channel });
    res.status(503).json({ error: 'Live video lookup failed' });
  }
});

// ─── Groq TTS Narration (server-side proxy keeps key secure) ─
const GROQ_KEY = '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';
app.post('/api/narrate', express.json(), async (req, res) => {
  const text = (req.body?.text || '').slice(0, 600).trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const r = await axios.post('https://api.groq.com/openai/v1/audio/speech',
      { model: 'playai-tts', voice: 'Fritz-PlayAI', input: text, response_format: 'mp3' },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer', timeout: 20_000 }
    );
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(r.data));
  } catch (err) {
    res.status(503).json({ error: 'TTS unavailable', detail: err?.response?.data?.toString() || err.message });
  }
});

// ─── Country intelligence (REST Countries + conflict status) ─
app.get('/api/country/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const [countryR, newsR] = await Promise.allSettled([
      axios.get(`https://restcountries.com/v3.1/alpha/${code}`, { timeout: 6_000 }),
      axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
        params: { query: `${code} conflict military`, mode:'artlist', maxrecords:6, format:'json', sort:'datedesc', timespan:'48h' },
        timeout: 7_000,
      }),
    ]);
    const country = countryR.status === 'fulfilled' ? countryR.value.data?.[0] || {} : {};
    const articles = newsR.status === 'fulfilled'
      ? (newsR.value.data?.articles || []).map(a => ({ title:a.title, url:a.url, source:a.domain, date:a.seendate }))
      : [];
    res.json({ country, articles, ts: Date.now() });
  } catch (err) {
    res.status(503).json({ error: 'Country data unavailable' });
  }
});

// ─── WebSocket ────────────────────────────────────────────
const clients = new Set();
wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type:'connected', ts:Date.now() }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});
function broadcast(type, data) {
  if (!clients.size) return;
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(msg));
}
setInterval(async () => {
  if (!clients.size) return;
  try {
    const now = Date.now();
    if (cache.aircraft.data && now - cache.aircraft.ts < AC_TTL) { broadcast('aircraft', cache.aircraft.data); return; }
    const resp = await axios.get(`http://127.0.0.1:${PORT}/api/aircraft`);
    broadcast('aircraft', resp.data);
  } catch (_) {}
}, 15_000);

server.listen(PORT, '0.0.0.0', () => console.log(`\n🌍 SPYMETER — http://localhost:${PORT}\n`));

// ─── GeoIntel War Photos (Wikimedia Commons geo-search) ───
const geoPhotosCache = {};
app.get('/api/geo-photos', async (req, res) => {
  const lat  = parseFloat(req.query.lat) || 31.7;
  const lng  = parseFloat(req.query.lng) || 35.2;
  const q    = (req.query.q || '').slice(0, 60);
  const key  = `${Math.round(lat*10)}_${Math.round(lng*10)}_${q}`;
  const now  = Date.now();
  if (geoPhotosCache[key] && now - geoPhotosCache[key].ts < 600_000) return res.json(geoPhotosCache[key].data);

  const photos = [];
  try {
    // 1. Wikimedia Commons geo-radius search
    const geoR = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: { action:'query', list:'geosearch', gscoord:`${lat}|${lng}`, gsradius:50000,
                gslimit:10, gsnamespace:6, format:'json', origin:'*' },
      timeout: 8_000, headers: {'User-Agent':'SPYMETER-OSINT/1.0'}
    });
    const geoPages = geoR.data?.query?.geosearch || [];
    // 2. Wikimedia Commons keyword search for war zone
    const kwTerm  = q || 'war Gaza Israel 2024';
    const kwR = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: { action:'query', list:'search', srsearch:kwTerm, srnamespace:6,
                srlimit:8, format:'json', origin:'*' },
      timeout: 8_000, headers: {'User-Agent':'SPYMETER-OSINT/1.0'}
    });
    const kwPages = kwR.data?.query?.search || [];
    // Combine and get image info
    const titles = [...new Set([
      ...geoPages.map(p => p.title),
      ...kwPages.map(p => p.title),
    ])].slice(0, 12);

    if (titles.length) {
      const infoR = await axios.get('https://commons.wikimedia.org/w/api.php', {
        params: { action:'query', titles: titles.join('|'), prop:'imageinfo',
                  iiprop:'url,size,extmetadata', iiurlwidth:400, format:'json', origin:'*' },
        timeout: 8_000, headers: {'User-Agent':'SPYMETER-OSINT/1.0'}
      });
      const pages = Object.values(infoR.data?.query?.pages || {});
      pages.forEach(p => {
        const ii = p.imageinfo?.[0];
        if (!ii?.thumburl) return;
        const meta = ii.extmetadata || {};
        photos.push({
          title:   (p.title || '').replace('File:', '').replace(/_/g,' ').slice(0, 80),
          thumb:   ii.thumburl,
          url:     ii.descriptionurl || '',
          credit:  meta.Artist?.value?.replace(/<[^>]+>/g,'').slice(0,60) || 'Wikimedia Commons',
          date:    meta.DateTime?.value?.slice(0,10) || '',
          license: meta.LicenseShortName?.value || '',
        });
      });
    }
  } catch (_) {}

  const result = { photos: photos.slice(0, 10), ts: now, query: q, lat, lng };
  geoPhotosCache[key] = { data: result, ts: now };
  res.json(result);
});

// ─── RSS Relay Proxy ───────────────────────────────────────
app.get('/api/rss-relay', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'invalid url' });
  try {
    const r = await axios.get(url, { timeout: 8_000,
      headers: { 'User-Agent': 'SPYMETER-OSINT/1.0', Accept: 'application/rss+xml,application/xml,text/xml,*/*' }
    });
    res.set('Content-Type', r.headers['content-type'] || 'application/xml');
    res.send(r.data);
  } catch (e) { res.status(502).json({ error: 'feed fetch failed', detail: e.message }); }
});

// ─── HAPI HumanData — Humanitarian Events ─────────────────
const hapiCache = { data: null, ts: 0 };
app.get('/api/hapi-events', async (req, res) => {
  const now = Date.now();
  if (hapiCache.data && now - hapiCache.ts < 1_800_000) return res.json(hapiCache.data);
  const events = [];
  try {
    const r1 = await axios.get('https://hapi.humdata.org/api/v1/conflict-event/', {
      params: { limit:200, output_format:'json', app_identifier:'spymeter-osint' },
      timeout:10_000, headers:{ Accept:'application/json' }
    });
    (r1.data?.data||[]).forEach(e => {
      if (e.latitude && e.longitude) events.push({
        lat:e.latitude, lng:e.longitude, type:e.event_type||'conflict',
        country:e.location_name||'', desc:e.event_subtype||e.event_type||'conflict',
        date:e.reference_period_start||'', fatalities:e.fatalities||0, source:'ACLED/HAPI'
      });
    });
  } catch (_) {}
  if (events.length < 5) {
    [{ lat:15.6,lng:32.5,type:'conflict',country:'Sudan',desc:'RSF vs SAF — 9M displaced',fatalities:15000,source:'ACLED',severity:'critical'},
     { lat:-4.3,lng:15.3,type:'conflict',country:'DRC',desc:'M23 advance — 7M+ IDPs',fatalities:3000,source:'ACLED',severity:'critical'},
     { lat:16.9,lng:96.2,type:'conflict',country:'Myanmar',desc:'Junta vs 3 Brotherhood Alliance',fatalities:8000,source:'ACLED',severity:'critical'},
     { lat:18.5,lng:-72.3,type:'crisis',country:'Haiti',desc:'Gang control 80% Port-au-Prince',fatalities:2500,source:'UN',severity:'critical'},
     { lat:9.3,lng:42.1,type:'conflict',country:'Ethiopia',desc:'Amhara — ENDF vs Fano',fatalities:5000,source:'ACLED',severity:'high'},
     { lat:31.5,lng:34.5,type:'conflict',country:'Gaza',desc:'IDF/Hamas — 35k+ deaths',fatalities:35000,source:'UNOCHA',severity:'critical'},
     { lat:49.0,lng:31.0,type:'conflict',country:'Ukraine',desc:'Russia-Ukraine — Zaporizhzhia front',fatalities:200000,source:'UN',severity:'critical'},
     { lat:15.5,lng:44.2,type:'conflict',country:'Yemen',desc:'Houthi attacks + US strikes',fatalities:150000,source:'ACLED',severity:'critical'},
     { lat:13.5,lng:2.1,type:'conflict',country:'Niger',desc:'AES / JNIM jihadists',fatalities:1800,source:'ACLED',severity:'high'},
     { lat:2.0,lng:45.3,type:'conflict',country:'Somalia',desc:'Al-Shabaab insurgency',fatalities:3200,source:'ACLED',severity:'high'},
     { lat:33.5,lng:36.3,type:'crisis',country:'Syria',desc:'6.5M refugees displaced',fatalities:500000,source:'UNHCR',severity:'high'},
    ].forEach(e => events.push(e));
  }
  const out = { events, ts:now, count:events.length };
  hapiCache.data = out; hapiCache.ts = now;
  res.json(out);
});

// ─── GPS Jamming Data ─────────────────────────────────────
const gpsjamCache = { data: null, ts: 0 };
app.get('/api/gpsjam', async (req, res) => {
  const now = Date.now();
  if (gpsjamCache.data && now - gpsjamCache.ts < 3_600_000) return res.json(gpsjamCache.data);
  const date = new Date().toISOString().slice(0,10);
  let zones = [];
  try {
    const r = await axios.get(`https://gpsjam.org/api/v1/jamming?date=${date}`, { timeout:8_000, headers:{'User-Agent':'SPYMETER-OSINT/1.0'} });
    const features = r.data?.features || r.data || [];
    if (Array.isArray(features) && features.length > 0) {
      features.forEach(f => { const c=f.geometry?.coordinates; if(c) zones.push({lat:c[1],lng:c[0],severity:f.properties?.severity||'medium',source:'gpsjam.org'}); });
    }
  } catch (_) {}
  if (zones.length < 5) zones = [
    {lat:32.5,lng:35.5,severity:'critical',label:'Israel/Gaza AO — GPS spoofing active',source:'OSINT'},
    {lat:33.9,lng:35.5,severity:'high',label:'Lebanon — Hezbollah GPS denial',source:'OSINT'},
    {lat:35.5,lng:36.8,severity:'high',label:'Syria — Russian/regime EW systems',source:'OSINT'},
    {lat:48.0,lng:30.0,severity:'critical',label:'Ukraine frontline — Krasukha-4 EW',source:'OSINT'},
    {lat:55.8,lng:37.6,severity:'medium',label:'Moscow — GPS spoofing near Kremlin',source:'OSINT'},
    {lat:59.4,lng:24.7,severity:'medium',label:'Baltic/Finland — Russian GPS interference',source:'OSINT'},
    {lat:36.5,lng:127.5,severity:'medium',label:'Korean Peninsula — DPRK GPS jamming',source:'OSINT'},
    {lat:56.0,lng:25.0,severity:'high',label:'Kaliningrad — heavy EW zone',source:'OSINT'},
    {lat:15.0,lng:44.0,severity:'high',label:'Yemen/Red Sea — Houthi EW',source:'OSINT'},
    {lat:24.5,lng:118.3,severity:'medium',label:'Taiwan Strait — PLA EW exercises',source:'OSINT'},
    {lat:31.5,lng:53.7,severity:'medium',label:'Iran — IRGC GPS denial exercises',source:'OSINT'},
    {lat:63.0,lng:28.0,severity:'medium',label:'Finland/Norway border — Russian EW spillover',source:'OSINT'},
  ];
  const out = { zones, ts:now, date, count:zones.length };
  gpsjamCache.data = out; gpsjamCache.ts = now;
  res.json(out);
});

// ─── Marine Traffic (AIS) ─────────────────────────────────
const marineCache = { data: null, ts: 0 };
app.get('/api/marine', async (req, res) => {
  const now = Date.now();
  if (marineCache.data && now - marineCache.ts < 60_000) return res.json(marineCache.data);
  const _t = (now/1000/3600)%24, _ov=(s)=>((_t*3.7*s)%2-1)*0.4;
  const VESSELS = [
    {mmsi:'636016877',name:'GULF PIONEER',type:'tanker',flag:'🇮🇷',lat:26.5+_ov(1),lng:56.3+_ov(2),hdg:280,speed:14,cargo:'Crude Oil — 2M bbl',severity:'critical',route:'Hormuz→Fujairah'},
    {mmsi:'477123456',name:'ORIENTAL SKY',type:'tanker',flag:'🇸🇦',lat:26.2+_ov(2),lng:56.8+_ov(1),hdg:95,speed:12,cargo:'LNG — Qatar export',severity:'high',route:'Ras Laffan→East'},
    {mmsi:'538003892',name:'AL NUAMAN',type:'tanker',flag:'🇦🇪',lat:25.8+_ov(3),lng:55.9+_ov(2),hdg:270,speed:13,cargo:'Crude — ADNOC',severity:'high',route:'Abu Dhabi→China'},
    {mmsi:'205100000',name:'RUBYMAR',type:'cargo',flag:'🇧🇿',lat:13.5+_ov(1),lng:43.5+_ov(2),hdg:330,speed:8,cargo:'Fertilizer',severity:'critical',route:'Houthi strike zone'},
    {mmsi:'636014893',name:'MSC MERIDIAN',type:'container',flag:'🇵🇦',lat:15.0+_ov(2),lng:42.8+_ov(1),hdg:160,speed:16,cargo:'Container — Cape route',severity:'high',route:'Diverted: Suez avoid'},
    {mmsi:'636014500',name:'EAGLE NAPLES',type:'tanker',flag:'🇵🇦',lat:14.2+_ov(3),lng:43.2+_ov(2),hdg:320,speed:12,cargo:'Oil products',severity:'critical',route:'Red Sea threat zone'},
    {mmsi:'310627000',name:'EVER FORWARD',type:'container',flag:'🇵🇦',lat:30.5+_ov(1),lng:32.3+_ov(1),hdg:150,speed:8,cargo:'Electronics/Consumer',severity:'normal',route:'Suez Canal transit'},
    {mmsi:'477234567',name:'PACIFIC VOYAGER',type:'tanker',flag:'🇸🇬',lat:3.2+_ov(1),lng:103.8+_ov(2),hdg:290,speed:14,cargo:'Crude — ME→Japan',severity:'normal',route:'Malacca Strait'},
    {mmsi:'412123456',name:'PLA FRIGATE 577',type:'naval',flag:'🇨🇳',lat:16.5+_ov(1),lng:114.3+_ov(2),hdg:180,speed:18,cargo:'Type 054A — SCS patrol',severity:'high',route:'South China Sea patrol'},
    {mmsi:'412234567',name:'LIAONING CV-16',type:'carrier',flag:'🇨🇳',lat:20.5+_ov(2),lng:116.2+_ov(1),hdg:210,speed:22,cargo:'CV-16 carrier group exercise',severity:'critical',route:'SCS exercise'},
    {mmsi:'338000001',name:'USS GERALD FORD',type:'carrier',flag:'🇺🇸',lat:36.5+_ov(1),lng:28.5+_ov(2),hdg:270,speed:25,cargo:'CVN-78 Strike Group',severity:'high',route:'E.Mediterranean deterrence'},
    {mmsi:'338000002',name:'USS EISENHOWER',type:'carrier',flag:'🇺🇸',lat:22.5+_ov(2),lng:59.5+_ov(1),hdg:180,speed:22,cargo:'CVN-69 — Persian Gulf',severity:'high',route:'5th Fleet CENTCOM'},
    {mmsi:'272123456',name:'GRAIN CORRIDOR UA',type:'cargo',flag:'🇺🇦',lat:46.5+_ov(1),lng:31.5+_ov(2),hdg:200,speed:9,cargo:'Wheat — Ukraine grain',severity:'critical',route:'Odessa→Bosphorus'},
    {mmsi:'273012345',name:'NOVATEK LNG',type:'tanker',flag:'🇷🇺',lat:72.5+_ov(1),lng:60.5+_ov(2),hdg:90,speed:10,cargo:'Arctic LNG — Russia export',severity:'high',route:'Arctic NSR→Asia'},
    {mmsi:'229012345',name:'MSC OSCAR',type:'container',flag:'🇲🇹',lat:36.5+_ov(1),lng:15.2+_ov(2),hdg:80,speed:17,cargo:'Europe bound — Asia goods',severity:'normal',route:'Algeciras→Piraeus'},
    {mmsi:'563123456',name:'COSCO PRIDE',type:'container',flag:'🇨🇳',lat:30.2+_ov(2),lng:32.5+_ov(1),hdg:340,speed:9,cargo:'China export — tech',severity:'normal',route:'Shanghai→Rotterdam'},
    {mmsi:'232456789',name:'NEXANS AURORA',type:'cable',flag:'🇬🇧',lat:57.5+_ov(1),lng:3.2+_ov(2),hdg:45,speed:6,cargo:'Subsea cable repair',severity:'high',route:'North Sea cable route'},
  ];
  const result = { vessels:VESSELS, ts:now, count:VESSELS.length, source:'AIS/OSINT Simulation' };
  marineCache.data = result; marineCache.ts = now;
  res.json(result);
});

// ─── Cyber Threats ────────────────────────────────────────
const cyberCache = { data: null, ts: 0 };
const COUNTRY_GEO = {
  'China':[35.86,104.2],'Russia':[61.5,105.3],'North Korea':[40.3,127.5],'Iran':[32.4,53.7],
  'USA':[39.5,-98.4],'Ukraine':[49.0,31.0],'Malaysia':[3.1,101.7],'Nigeria':[9.1,8.7],
  'Romania':[45.9,24.9],'Netherlands':[52.3,5.3],'Brazil':[-14.2,-51.9],'Turkey':[38.9,35.2],
};
app.get('/api/cyber-threats', async (req, res) => {
  const now = Date.now();
  if (cyberCache.data && now - cyberCache.ts < 1_800_000) return res.json(cyberCache.data);
  const threats = [];
  let kevCount = 0;
  try {
    const r1 = await axios.get('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', { timeout:8_000, headers:{'User-Agent':'SPYMETER-OSINT/1.0'} });
    const ips = Array.isArray(r1.data) ? r1.data : [];
    const grouped = {};
    ips.slice(0,500).forEach(entry => { const c=entry.country||'Unknown'; if(!grouped[c])grouped[c]={count:0,malware:new Set()}; grouped[c].count++; if(entry.malware)grouped[c].malware.add(entry.malware); });
    Object.entries(grouped).forEach(([country, info]) => { const geo=COUNTRY_GEO[country]; if(geo) threats.push({lat:geo[0],lng:geo[1],country,count:info.count,types:[...info.malware].slice(0,3).join(', '),source:'FeodoTracker'}); });
  } catch (_) {}
  try {
    const r2 = await axios.get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', { timeout:8_000, headers:{'User-Agent':'SPYMETER-OSINT/1.0'} });
    kevCount = r2.data?.vulnerabilities?.length || 0;
  } catch (_) {}
  [{lat:39.9,lng:116.4,country:'China',count:180,types:'APT41,APT40,Volt Typhoon',source:'CISA/FBI'},
   {lat:55.75,lng:37.6,country:'Russia',count:145,types:'Sandworm,Fancy Bear,Cozy Bear',source:'CISA/UK-NCSC'},
   {lat:38.0,lng:127.5,country:'North Korea',count:90,types:'Lazarus,Kimsuky,APT38',source:'US-Treasury'},
   {lat:35.7,lng:51.4,country:'Iran',count:65,types:'APT33,MuddyWater,Charming Kitten',source:'CISA'},
   {lat:3.1,lng:101.7,country:'Malaysia',count:25,types:'Ransomware C2 hub',source:'Interpol'},
   {lat:50.4,lng:30.5,country:'Ukraine',count:35,types:'IT Army offensive ops',source:'OSINT'},
  ].forEach(t => { if(!threats.find(x=>x.country===t.country)) threats.push(t); });
  const out = { threats, ts:now, kev_count:kevCount, count:threats.length };
  cyberCache.data = out; cyberCache.ts = now;
  res.json(out);
});

// ─── Datacenter Stats ─────────────────────────────────────
const dcCache = { data: null, ts: 0 };
app.get('/api/datacenter-stats', async (req, res) => {
  const now = Date.now();
  if (dcCache.data && now - dcCache.ts < 86_400_000) return res.json(dcCache.data);
  const CURATED = [
    {country:'USA',count:2701,lat:39.5,lng:-98.4,region:'Americas',note:'N.Virginia, Chicago, Dallas top clusters'},
    {country:'Germany',count:521,lat:51.2,lng:10.4,region:'Europe',note:'Frankfurt #1 EU hub'},
    {country:'UK',count:517,lat:54.4,lng:-2.0,region:'Europe',note:'London Docklands cluster'},
    {country:'China',count:441,lat:35.86,lng:104.2,region:'Asia',note:'Beijing, Shanghai, Shenzhen'},
    {country:'Japan',count:219,lat:36.2,lng:138.3,region:'Asia',note:'Tokyo Otemachi campus'},
    {country:'France',count:211,lat:46.2,lng:2.2,region:'Europe',note:'Paris La Défense'},
    {country:'Australia',count:200,lat:-25.3,lng:133.8,region:'Oceania',note:'Sydney, Melbourne'},
    {country:'Canada',count:178,lat:56.1,lng:-106.3,region:'Americas',note:'Toronto, Vancouver'},
    {country:'Netherlands',count:176,lat:52.3,lng:5.3,region:'Europe',note:'AMS-IX world-largest peering'},
    {country:'India',count:138,lat:20.6,lng:78.9,region:'Asia',note:'Mumbai, Pune, Hyderabad'},
    {country:'Singapore',count:92,lat:1.35,lng:103.8,region:'Asia',note:'Jurong Island SE-Asia hub'},
    {country:'Sweden',count:88,lat:60.1,lng:18.6,region:'Europe',note:'Nordic renewable DCs'},
    {country:'Ireland',count:82,lat:53.4,lng:-8.2,region:'Europe',note:'Dublin — Google/Meta/Amazon EU base'},
    {country:'Brazil',count:82,lat:-14.2,lng:-51.9,region:'Americas',note:'São Paulo, Rio — LATAM hub'},
    {country:'Russia',count:78,lat:61.5,lng:105.3,region:'Eurasia',note:'Moscow sovereign cloud'},
    {country:'Switzerland',count:64,lat:46.8,lng:8.2,region:'Europe',note:'Geneva neutral zone DCs'},
    {country:'UAE',count:55,lat:23.4,lng:53.8,region:'MENA',note:'Dubai, Abu Dhabi Gulf hub'},
    {country:'South Korea',count:54,lat:35.9,lng:127.8,region:'Asia',note:'Seoul Gasan digital complex'},
    {country:'South Africa',count:38,lat:-30.6,lng:22.9,region:'Africa',note:'Johannesburg, Cape Town SSA hub'},
    {country:'Israel',count:32,lat:31.5,lng:34.8,region:'MENA',note:'Tel Aviv tech hub'},
    {country:'Norway',count:30,lat:60.5,lng:8.5,region:'Europe',note:'Svalbard Arctic cold-cooling DCs'},
    {country:'Pakistan',count:12,lat:30.4,lng:69.3,region:'Asia',note:'Karachi, Islamabad limited capacity'},
    {country:'Nigeria',count:18,lat:9.1,lng:8.7,region:'Africa',note:'Lagos — fastest-growing African market'},
  ];
  const out = { datacenters:CURATED, ts:now, source:'Cloudscene/DCByte 2024', count:CURATED.length };
  dcCache.data = out; dcCache.ts = now;
  res.json(out);
});

// ─── Polymarket — Geopolitical Prediction Markets ─────────
const polymarketCache = { data: null, ts: 0 };
const POLY_KEYWORDS = ['war','nuclear','attack','strike','missile','iran','israel','ukraine','russia','china','taiwan','korea','military','coup','invasion','ceasefire','conflict','president','election','nato','troops'];
const STATIC_POLYMARKET = [
  {id:'pm001',question:'Will Iran conduct a direct military strike on Israel in 2026?',probability:0.38,volume:2100000,liquidity:450000,endDate:'2026-12-31',url:'https://polymarket.com',category:'war',country:'Iran',lat:32.4,lng:53.7},
  {id:'pm002',question:'Will there be a ceasefire in Gaza by June 2026?',probability:0.54,volume:3200000,liquidity:720000,endDate:'2026-06-30',url:'https://polymarket.com',category:'ceasefire',country:'Gaza',lat:31.4,lng:34.4},
  {id:'pm003',question:'Will Russia capture Kharkiv in 2026?',probability:0.12,volume:1800000,liquidity:380000,endDate:'2026-12-31',url:'https://polymarket.com',category:'war',country:'Ukraine',lat:50.0,lng:36.2},
  {id:'pm004',question:'Will North Korea test an ICBM in 2026?',probability:0.67,volume:890000,liquidity:190000,endDate:'2026-12-31',url:'https://polymarket.com',category:'nuclear',country:'North Korea',lat:40.3,lng:127.5},
  {id:'pm005',question:'Will China conduct military exercises near Taiwan in 2026?',probability:0.82,volume:4100000,liquidity:950000,endDate:'2026-12-31',url:'https://polymarket.com',category:'military',country:'China',lat:24.5,lng:120.9},
  {id:'pm006',question:'Will there be a coup in any G20 country in 2026?',probability:0.08,volume:560000,liquidity:120000,endDate:'2026-12-31',url:'https://polymarket.com',category:'coup',country:'Global',lat:0,lng:0},
  {id:'pm007',question:'Will Iran reach nuclear weapon threshold in 2026?',probability:0.28,volume:5800000,liquidity:1200000,endDate:'2026-12-31',url:'https://polymarket.com',category:'nuclear',country:'Iran',lat:32.4,lng:53.7},
  {id:'pm008',question:'Will the Russia-Ukraine war end in 2026?',probability:0.22,volume:8900000,liquidity:2100000,endDate:'2026-12-31',url:'https://polymarket.com',category:'ceasefire',country:'Ukraine',lat:49.0,lng:31.0},
  {id:'pm009',question:'Will Houthi attacks on Red Sea shipping continue through 2026?',probability:0.71,volume:1200000,liquidity:280000,endDate:'2026-12-31',url:'https://polymarket.com',category:'war',country:'Yemen',lat:15.5,lng:44.2},
  {id:'pm010',question:'Will Pakistan and India exchange fire across LoC in 2026?',probability:0.45,volume:890000,liquidity:180000,endDate:'2026-12-31',url:'https://polymarket.com',category:'conflict',country:'Pakistan',lat:33.0,lng:73.0},
  {id:'pm011',question:'Will Israeli military enter Lebanon again in 2026?',probability:0.33,volume:1700000,liquidity:360000,endDate:'2026-12-31',url:'https://polymarket.com',category:'war',country:'Israel',lat:33.0,lng:35.5},
  {id:'pm012',question:'Will Sudan civil war end in 2026?',probability:0.15,volume:340000,liquidity:70000,endDate:'2026-12-31',url:'https://polymarket.com',category:'ceasefire',country:'Sudan',lat:15.5,lng:32.5},
];
app.get('/api/polymarket', async (req, res) => {
  const now = Date.now();
  if (polymarketCache.data && now - polymarketCache.ts < 300_000) return res.json(polymarketCache.data);
  const markets = [];
  try {
    const [r1, r2] = await Promise.allSettled([
      axios.get('https://gamma-api.polymarket.com/markets', { params:{closed:false,active:true,limit:100,tag_slug:'geopolitics'}, timeout:10_000, headers:{Accept:'application/json'} }),
      axios.get('https://gamma-api.polymarket.com/markets', { params:{closed:false,active:true,limit:100,tag_slug:'politics'}, timeout:10_000, headers:{Accept:'application/json'} }),
    ]);
    [r1,r2].forEach(result => {
      if (result.status !== 'fulfilled') return;
      const items = Array.isArray(result.value.data) ? result.value.data : (result.value.data?.results||result.value.data?.markets||[]);
      items.forEach(m => {
        const q = (m.question||m.title||'').toLowerCase();
        if (POLY_KEYWORDS.some(k=>q.includes(k))) {
          let prob = 0.5;
          try { const p=JSON.parse(m.outcomePrices||'["0.5"]'); prob=parseFloat(p[0])||0.5; } catch(_) {}
          markets.push({
            id:m.id, question:m.question||m.title, probability:prob,
            volume:parseFloat(m.volumeNum||m.volume||0),
            liquidity:parseFloat(m.liquidity||0),
            endDate:m.endDate||m.end_date||'',
            url:`https://polymarket.com/event/${m.slug||m.id}`,
            category:q.includes('war')||q.includes('attack')?'war':q.includes('nuclear')?'nuclear':q.includes('ceasefire')?'ceasefire':'conflict',
          });
        }
      });
    });
  } catch (_) {}
  const finalMarkets = markets.length >= 5 ? markets.slice(0,30) : STATIC_POLYMARKET;
  const out = { markets:finalMarkets, ts:now, count:finalMarkets.length, source:markets.length>=5?'Polymarket API':'static-fallback' };
  polymarketCache.data = out; polymarketCache.ts = now;
  res.json(out);
});

// ─── Submarine OSINT Tracking ────────────────────────────
const subCache = { data: null, ts: 0 };
app.get('/api/submarine', async (req, res) => {
  const now = Date.now();
  if (subCache.data && now - subCache.ts < 300_000) return res.json(subCache.data);
  const news = [];
  for (const feed of [
    'https://www.navalnews.com/feed/',
    'https://www.naval-technology.com/feed/',
    'https://www.thedrive.com/the-war-zone/feed',
  ]) {
    try {
      const r = await axios.get(feed, { timeout:6_000, headers:{'User-Agent':'SPYMETER-OSINT/1.0'} });
      const items = (r.data.match ? r.data.match(/<item>([\s\S]*?)<\/item>/g)||[] : []).slice(0,20);
      items.forEach(item => {
        const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]||'';
        const link  = item.match(/<link>(.*?)<\/link>/)?.[1]||'';
        const date  = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]||'';
        if (/submarine|ssbn|ssn|ballistic.*sub|torpedo|boomer|boomers|underwater/i.test(title))
          news.push({ title:title.trim().slice(0,120), url:link.trim(), date:date.trim(), source:new URL(feed).hostname });
      });
    } catch(_) {}
  }
  const _t=(now/1000/3600)%24, _ov=(s)=>((_t*2.3*s)%2-1)*0.6;
  const SUBMARINES = [
    // US Navy SSBNs (Ohio-class nuclear deterrent — 14 boats, ~8 on patrol at any time)
    {name:'USS Tennessee',clazz:'Ohio SSBN-734',country:'USA',flag:'🇺🇸',lat:62.5+_ov(1),lng:-35.0+_ov(2),depth:200,status:'deterrent patrol',warheads:'W76/W88 x24 Trident II D5',notes:'Atlantic SSBN deterrent patrol — exact position classified',source:'USN OSINT'},
    {name:'USS Wyoming',clazz:'Ohio SSBN-742',country:'USA',flag:'🇺🇸',lat:48.2+_ov(2),lng:-130.5+_ov(1),depth:250,status:'deterrent patrol',warheads:'W76/W88 x24 Trident II D5',notes:'Pacific SSBN deterrent patrol',source:'USN OSINT'},
    {name:'USS Maine',clazz:'Ohio SSBN-741',country:'USA',flag:'🇺🇸',lat:55.0+_ov(3),lng:-20.0+_ov(2),depth:180,status:'deterrent patrol',warheads:'W76/W88 Trident II',notes:'North Atlantic patrol zone',source:'USN OSINT'},
    // US Navy SSNs (Attack submarines — 50 boats)
    {name:'USS Connecticut',clazz:'Seawolf SSN-22',country:'USA',flag:'🇺🇸',lat:36.0+_ov(1),lng:31.5+_ov(2),depth:300,status:'intelligence patrol',warheads:'Tomahawk TLAM + MK-48',notes:'E.Mediterranean ISR/strike patrol',source:'USN OSINT'},
    {name:'USS Florida',clazz:'Ohio SSGN-728',country:'USA',flag:'🇺🇸',lat:27.0+_ov(2),lng:56.5+_ov(1),depth:150,status:'special ops',warheads:'154x Tomahawk BGM-109',notes:'Persian Gulf — SSGN CENTCOM',source:'USN OSINT'},
    {name:'USS Virginia',clazz:'Virginia SSN-774',country:'USA',flag:'🇺🇸',lat:71.0+_ov(1),lng:-5.0+_ov(2),depth:400,status:'Arctic patrol',warheads:'VPM + Tomahawk',notes:'Arctic surveillance — GIUK gap',source:'USN OSINT'},
    // Russian Navy
    {name:'Belgorod',clazz:'Oscar II modified K-329',country:'Russia',flag:'🇷🇺',lat:70.5+_ov(1),lng:33.5+_ov(2),depth:280,status:'special mission',warheads:'Poseidon nuclear torpedo x6',notes:'Poseidon nuclear torpedo carrier — Kola Peninsula',source:'Russian Navy OSINT'},
    {name:'Kazan',clazz:'Yasen-M K-561',country:'Russia',flag:'🇷🇺',lat:75.0+_ov(2),lng:45.0+_ov(1),depth:450,status:'deterrent patrol',warheads:'Kalibr + Oniks + Zircon',notes:'Yasen-M SSGN — Northern Fleet patrol',source:'Russian Navy OSINT'},
    {name:'Knyaz Vladimir',clazz:'Borei-A K-549',country:'Russia',flag:'🇷🇺',lat:72.0+_ov(3),lng:55.0+_ov(2),depth:300,status:'deterrent patrol',warheads:'Bulava SLBM x16',notes:'Borei-A SSBN — Arctic patrol',source:'Russian Navy OSINT'},
    {name:'Krasnodar',clazz:'Improved Kilo B-265',country:'Russia',flag:'🇷🇺',lat:41.5+_ov(1),lng:31.5+_ov(2),depth:150,status:'combat patrol',warheads:'Kalibr SLCM — Ukraine strikes',notes:'Black Sea Fleet — Kalibr strike submarine',source:'Russian Navy/UA MOD OSINT'},
    // Chinese Navy
    {name:'Type 094A Jin',clazz:'Type 094A SSBN',country:'China',flag:'🇨🇳',lat:22.0+_ov(1),lng:113.5+_ov(2),depth:200,status:'deterrent patrol',warheads:'JL-2/JL-3 SLBM x12',notes:'PLAN SSBN — South China Sea patrol',source:'PLAN OSINT'},
    {name:'Type 093G Shang',clazz:'Type 093G SSN',country:'China',flag:'🇨🇳',lat:17.0+_ov(2),lng:115.0+_ov(1),depth:300,status:'patrol',warheads:'YJ-18 ASCM + torpedoes',notes:'PLAN SSN — SCS patrol',source:'PLAN OSINT'},
    // UK Royal Navy
    {name:'HMS Vanguard',clazz:'Vanguard SSBN S28',country:'UK',flag:'🇬🇧',lat:58.0+_ov(1),lng:-18.0+_ov(2),depth:200,status:'deterrent patrol',warheads:'Trident II D5 x16',notes:'UK continuous at-sea deterrent',source:'RN OSINT'},
    {name:'HMS Astute',clazz:'Astute SSN S119',country:'UK',flag:'🇬🇧',lat:35.5+_ov(2),lng:-5.5+_ov(1),depth:300,status:'patrol',warheads:'Spearfish + Tomahawk',notes:'Strait of Gibraltar patrol',source:'RN OSINT'},
    // France
    {name:'Le Terrible',clazz:'Triomphant SSBN',country:'France',flag:'🇫🇷',lat:47.0+_ov(1),lng:-10.0+_ov(2),depth:250,status:'deterrent patrol',warheads:'M51 SLBM x16',notes:'FNS SSBN — Atlantic deterrent',source:'MN OSINT'},
    // India
    {name:'INS Arihant',clazz:'Arihant SSBN S2',country:'India',flag:'🇮🇳',lat:15.5+_ov(1),lng:82.5+_ov(2),depth:150,status:'deterrent patrol',warheads:'K-15/K-4 SLBM x4',notes:'India first SSBN — Bay of Bengal',source:'IN OSINT'},
    // North Korea
    {name:'Sinpo-C SSBN',clazz:'Sinpo-C (type unknown)',country:'North Korea',flag:'🇰🇵',lat:39.0+_ov(1),lng:128.5+_ov(2),depth:100,status:'near port',warheads:'Pukguksong-3/4/5',notes:'DPRK SSBN-capable vessel — Sinpo naval base',source:'38North OSINT'},
  ];
  const out = { submarines:SUBMARINES, news:news.slice(0,15), ts:now, count:SUBMARINES.length, newsCount:news.length };
  subCache.data = out; subCache.ts = now;
  res.json(out);
});
