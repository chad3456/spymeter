/* ── SPYMETER — War Simulation Module ──────────────────────────
   Iran-Israel April 13, 2024 attack simulation.
   Oil price impact, commodity effects.
   Renders into #ctab-simulation panel.                          */
const SIMULATION = (() => {
  let running    = false;
  let simTimer   = null;
  let step       = 0;

  // ── April 13, 2024 Attack Data ─────────────────────────
  const ATTACK = {
    date: 'April 13–14, 2024',
    duration: '~5 hours (22:00–03:00 local)',
    waves: [
      { time:'T+0h',   type:'drone',   icon:'✈', count:170, label:'Shahed-136 One-Way Drones', origin:'Iran/Iraq/Yemen', color:'#ff6600',
        intercepted:162, notes:'Launched from multiple vectors; ~5.5h flight time to Israel' },
      { time:'T+1.5h', type:'cruise',  icon:'🚀', count:30,  label:'Cruise Missiles (Soumar/Quds-1)', origin:'Iran', color:'#ff4400',
        intercepted:25, notes:'Subsonic; engaged by Arrow-3 + Israeli F-35s + Jordanian/UK assets' },
      { time:'T+4.5h', type:'ballistic',icon:'💥',count:120, label:'Ballistic Missiles (Emad/Fattah)', origin:'Iran', color:'#ff2200',
        intercepted:116, notes:'Hypersonic approach; Arrow-2/3, David\'s Sling, US THAAD & Navy SM-3' },
    ],
    interceptors: [
      { name:'Iron Dome',        country:'Israel', type:'short-range (<70km)', targets:'rockets/drones',  color:'#00d4ff' },
      { name:'David\'s Sling',   country:'Israel', type:'medium-range',        targets:'cruise missiles', color:'#0099ff' },
      { name:'Arrow-2/3',        country:'Israel', type:'ballistic/exo-atmos', targets:'ballistic',       color:'#0055ff' },
      { name:'US THAAD',         country:'USA',    type:'terminal high altitude',targets:'ballistic',      color:'#4488ff' },
      { name:'F-15/16 CAP',      country:'Jordan', type:'air-intercept',        targets:'drones/cruise',  color:'#44aa88' },
      { name:'RAF Typhoons',     country:'UK',     type:'air-intercept',        targets:'drones',         color:'#4466cc' },
    ],
    result: { intercepted_pct: 99, impacts: 1, location: 'Nevatim AFB (superficial runway damage)', casualties: 0 },
  };

  // ── Oil Price Impact ────────────────────────────────────
  const OIL_DATA = {
    brentBefore: 86.5,   // USD/barrel before Apr 13
    brentAfter:  91.2,   // peak Apr 14 (+5.4%)
    brentCurrent:78.3,   // approx mid-2025 (supply easing, recession fears)
    wtiCurrent:  74.1,
    key_events: [
      { date:'Apr 13 2024', event:'Iran attack night — Brent spikes +5.4% to $91.2', delta:'+5.4%', color:'#ff4400' },
      { date:'Apr 14 2024', event:'US confirms no major Israeli damage — rally fades', delta:'-2.1%', color:'#00cc44' },
      { date:'Oct 1 2024', event:'2nd Iran attack (180 missiles) — Brent +3.7%', delta:'+3.7%', color:'#ff4400' },
      { date:'Oct 26 2024', event:'Israel strikes Iran sites — Brent -1.8% (limited damage)', delta:'-1.8%', color:'#00cc44' },
      { date:'Dec 2024', event:'Houthi ongoing Red Sea disruptions — +$4-8/bbl premium', delta:'+6.5%', color:'#ff6600' },
    ],
    chokepoints: [
      { name:'Strait of Hormuz', pct:'21% of global oil', risk:'CRITICAL', color:'#ff2200' },
      { name:'Bab-el-Mandeb',   pct:'12% of global oil', risk:'HIGH',     color:'#ff6600' },
      { name:'Suez Canal',       pct:'12% of global cargo',risk:'HIGH',   color:'#ff6600' },
    ],
  };

  // ── Commodity Effects ───────────────────────────────────
  const COMMODITIES = [
    { name:'Crude Oil (Brent)', before:'$86.5/bbl', current:'$78.3/bbl', change:'-9.5%', risk:'SUPPLY RISK',   color:'#ff6600', icon:'🛢' },
    { name:'LNG / Natural Gas', before:'$8.4/MMBtu',current:'$9.8/MMBtu',change:'+16.7%',risk:'HIGH',         color:'#ff9900', icon:'🔥' },
    { name:'Gold',              before:'$2,300/oz',  current:'$2,890/oz', change:'+25.7%',risk:'SAFE HAVEN',   color:'#ffd700', icon:'🥇' },
    { name:'Shipping Rates',    before:'$1,400 TEU', current:'$4,200 TEU',change:'+200%', risk:'CRITICAL',     color:'#ff4400', icon:'🚢' },
    { name:'Phosphates',        before:'$380/ton',   current:'$410/ton',  change:'+7.9%', risk:'MODERATE',     color:'#ffaa00', icon:'🌾' },
    { name:'Defense Stocks',    before:'Base',       current:'+34%',      change:'+34%',  risk:'UPWARD',       color:'#00ff88', icon:'⚔' },
    { name:'Airline Fuel',      before:'Base',       current:'+18%',      change:'+18%',  risk:'ELEVATED',     color:'#ffcc00', icon:'✈' },
    { name:'Potash/Fertilizer', before:'$280/ton',   current:'$295/ton',  change:'+5.4%', risk:'MODERATE',     color:'#aaffaa', icon:'🌱' },
  ];

  // ── Render simulation panel ─────────────────────────────
  function renderPanel() {
    const el = document.getElementById('ctab-simulation');
    if (!el) return;

    const totalLaunched   = ATTACK.waves.reduce((a, w) => a + w.count, 0);
    const totalIntercepted = ATTACK.waves.reduce((a, w) => a + w.intercepted, 0);
    const totalPenetrated  = totalLaunched - totalIntercepted;

    el.innerHTML = `
      <div class="sim-header">
        <div class="sim-title">💥 IRAN-ISRAEL WAR SIMULATION</div>
        <div class="sim-subtitle">April 13–14, 2024 · Operation True Promise</div>
      </div>

      <!-- ── Attack Waves ─────────────────── -->
      <div class="sim-section-lbl">ATTACK WAVES</div>
      ${ATTACK.waves.map(w => {
        const pct = Math.round((w.intercepted / w.count) * 100);
        const hit = w.count - w.intercepted;
        return `
        <div class="sim-wave" style="border-left:3px solid ${w.color}">
          <div class="sim-wave-hdr">
            <span class="sim-wave-icon">${w.icon}</span>
            <span class="sim-wave-label" style="color:${w.color}">${w.label}</span>
            <span class="sim-wave-time">${w.time}</span>
          </div>
          <div class="sim-wave-stats">
            <span class="sim-stat-pill" style="background:${w.color}22;border-color:${w.color}">
              🚀 ${w.count} launched
            </span>
            <span class="sim-stat-pill" style="background:#00ff8822;border-color:#00ff88">
              ✓ ${w.intercepted} intercepted (${pct}%)
            </span>
            ${hit > 0 ? `<span class="sim-stat-pill" style="background:#ff220022;border-color:#ff2200">
              ✗ ${hit} hit
            </span>` : ''}
          </div>
          <div class="sim-wave-note">${w.notes}</div>
          <div class="sim-bar-wrap">
            <div class="sim-bar-fill" style="width:${pct}%;background:${w.color}"></div>
          </div>
        </div>`;
      }).join('')}

      <!-- ── Summary ────────────────────── -->
      <div class="sim-summary">
        <div class="sim-sum-row"><span>Total Launched</span><span style="color:#ff9900">${totalLaunched}</span></div>
        <div class="sim-sum-row"><span>Intercepted</span><span style="color:#00ff88">${totalIntercepted} (${ATTACK.result.intercepted_pct}%)</span></div>
        <div class="sim-sum-row"><span>Penetrated</span><span style="color:#ff4400">${totalPenetrated}</span></div>
        <div class="sim-sum-row"><span>Impact Site</span><span style="color:#ffaa00">${ATTACK.result.location}</span></div>
        <div class="sim-sum-row"><span>Casualties</span><span style="color:#00ff88">${ATTACK.result.casualties}</span></div>
      </div>

      <!-- ── Interceptor Systems ─────────── -->
      <div class="sim-section-lbl" style="margin-top:8px">INTERCEPTOR SYSTEMS</div>
      <div class="sim-interceptors">
        ${ATTACK.interceptors.map(i => `
          <div class="sim-irow" style="border-left:2px solid ${i.color}">
            <span class="sim-iname" style="color:${i.color}">${i.name}</span>
            <span class="sim-icountry">${i.country}</span>
            <span class="sim-itarget">${i.targets}</span>
          </div>`).join('')}
      </div>

      <!-- ── Oil Price Impact ─────────────── -->
      <div class="sim-section-lbl" style="margin-top:10px">OIL PRICE IMPACT</div>
      <div class="sim-oil-grid">
        <div class="sim-oil-cell">
          <div class="sim-oil-lbl">Brent (Pre-attack)</div>
          <div class="sim-oil-val" style="color:#ffcc00">$${OIL_DATA.brentBefore}/bbl</div>
        </div>
        <div class="sim-oil-cell">
          <div class="sim-oil-lbl">Peak (Apr 14)</div>
          <div class="sim-oil-val" style="color:#ff6600">$${OIL_DATA.brentAfter}/bbl</div>
        </div>
        <div class="sim-oil-cell">
          <div class="sim-oil-lbl">Brent Now</div>
          <div class="sim-oil-val" style="color:#00ff88">$${OIL_DATA.brentCurrent}/bbl</div>
        </div>
        <div class="sim-oil-cell">
          <div class="sim-oil-lbl">WTI Now</div>
          <div class="sim-oil-val" style="color:#00dd88">$${OIL_DATA.wtiCurrent}/bbl</div>
        </div>
      </div>

      ${OIL_DATA.key_events.map(e => `
        <div class="sim-oil-event" style="border-left:2px solid ${e.color}">
          <span class="sim-oe-date">${e.date}</span>
          <span class="sim-oe-delta" style="color:${e.color}">${e.delta}</span>
          <div class="sim-oe-text">${e.event}</div>
        </div>`).join('')}

      <!-- ── Chokepoints ────────────────── -->
      <div class="sim-section-lbl" style="margin-top:8px">STRATEGIC CHOKEPOINTS</div>
      ${OIL_DATA.chokepoints.map(c => `
        <div class="sim-choke" style="border-left:2px solid ${c.color}">
          <span class="sim-choke-name">${c.name}</span>
          <span class="sim-choke-pct">${c.pct}</span>
          <span class="sim-choke-risk" style="color:${c.color}">${c.risk}</span>
        </div>`).join('')}

      <!-- ── Commodities Affected ─────────── -->
      <div class="sim-section-lbl" style="margin-top:10px">COMMODITIES AFFECTED</div>
      ${COMMODITIES.map(c => `
        <div class="sim-commodity">
          <span class="sim-com-icon">${c.icon}</span>
          <div class="sim-com-body">
            <div class="sim-com-name">${c.name}</div>
            <div class="sim-com-vals">
              <span class="sim-com-before">${c.before}</span>
              <span class="sim-com-arrow">→</span>
              <span class="sim-com-current" style="color:${c.color}">${c.current}</span>
              <span class="sim-com-change" style="color:${c.color}">${c.change}</span>
            </div>
          </div>
          <span class="sim-com-risk" style="color:${c.color};border-color:${c.color}">${c.risk}</span>
        </div>`).join('')}
    `;
  }

  // ── Public API ────────────────────────────────────────────
  function init() {
    renderPanel();
  }

  return { init };
})();
