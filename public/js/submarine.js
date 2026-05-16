/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — Submarine & Warhead OSINT Layer
   Data: FAS Nuclear Notebook 2024 · SIPRI · IISS Military Balance · GlobalSecurity.org
   NOTE: Real submarine positions are CLASSIFIED. All positions are ESTIMATED
         from OSINT, homeports, and publicly known patrol areas.
════════════════════════════════════════════════════════════════════════════ */
const SUBMARINE = (() => {
  let map     = null;
  let enabled = false;
  let markers = [];
  let zones   = [];
  let data    = null;
  let refreshTimer = null;

  const TYPE_CONFIG = {
    SSBN: { color:'#ff2222', icon:'☢',  label:'SSBN — Nuclear Ballistic Missile Submarine', z:900 },
    SSN:  { color:'#4488ff', icon:'⚛',  label:'SSN  — Nuclear Attack Submarine',            z:800 },
    SSGN: { color:'#ff6600', icon:'🚀', label:'SSGN — Nuclear Cruise Missile Submarine',    z:850 },
    SSB:  { color:'#ff9900', icon:'🎯', label:'SSB  — Ballistic Missile Submarine',         z:700 },
    SSK:  { color:'#00cc88', icon:'⚓', label:'SSK  — Conventional Submarine',              z:600 },
    UUV:  { color:'#cc44ff', icon:'🤖', label:'UUV  — Unmanned Underwater Vehicle',         z:950 },
    'SSBN BASE': { color:'#ff4444', icon:'⬡', label:'SSBN Base — Nuclear submarine homeport', z:1000 },
    'SSN BASE':  { color:'#4488ff', icon:'⬡', label:'SSN Base',  z:990 },
    'SSK BASE':  { color:'#00cc88', icon:'⬡', label:'SSK Base',  z:980 },
  };

  const COUNTRY_FLAGS = {
    'USA':'🇺🇸','Russia':'🇷🇺','China':'🇨🇳','UK':'🇬🇧','France':'🇫🇷',
    'India':'🇮🇳','North Korea':'🇰🇵','Pakistan':'🇵🇰','Israel':'🇮🇱',
    'South Korea':'🇰🇷','Japan':'🇯🇵','Australia':'🇦🇺','Germany':'🇩🇪',
    'Iran':'🇮🇷','Brazil':'🇧🇷',
  };

  // ── Known SSBN patrol zone circles ─────────────────────────────────────────
  const PATROL_ZONES = [
    { lat:63.0,  lng:-35.0,  r:500, name:'US SSBN Atlantic Patrol Box',     color:'#4488ff', note:'US Ohio-class primary Atlantic deterrent patrol. ~6 SSBNs assigned.' },
    { lat:48.0,  lng:-140.0, r:600, name:'US SSBN Pacific Patrol Box',      color:'#4488ff', note:'US SSBN Pacific routes — Bangor-based boats.' },
    { lat:72.0,  lng:32.0,   r:400, name:'Russian SSBN Bastion (Barents)',  color:'#ff4444', note:'Russian Borei/Delta IV SSBN protective bastion. Shielded by ASW forces.' },
    { lat:54.0,  lng:158.0,  r:380, name:'Russian SSBN Pacific Bastion',   color:'#ff4444', note:'Russia Pacific Fleet SSBN patrol zone — Sea of Okhotsk.' },
    { lat:19.0,  lng:114.0,  r:450, name:'PLAN SSBN Patrol (South China Sea)',color:'#ffcc00',note:'PLAN Type 094 Jin-class SSBN patrol routes.' },
    { lat:60.0,  lng:-10.0,  r:320, name:'UK CASD Zone (Atlantic)',         color:'#00ccff', note:'UK Vanguard SSBN Continuous At-Sea Deterrent zone.' },
    { lat:47.0,  lng:-12.0,  r:300, name:'French SNLE Zone (Atlantic)',     color:'#aaddff', note:'French Triomphant-class nuclear deterrent patrol area.' },
    { lat:15.0,  lng:82.0,   r:280, name:'Indian SSBN Zone (Bay of Bengal)',color:'#ff9900', note:'INS Arihant / Arighat patrol zone.' },
    { lat:50.0,  lng:4.0,    r:220, name:'NATO GIUK Gap',                   color:'#ffffff', note:'GIUK Gap — critical NATO ASW chokepoint. SOSUS monitored.' },
    { lat:40.0,  lng:128.0,  r:180, name:'DPRK SSBN Zone (East Sea)',       color:'#ff0066', note:'North Korea Hero Kim Kun Ok Sinpo-C SSBN patrol area.' },
  ];

  // ── Fetch ───────────────────────────────────────────────────────────────────
  async function _fetch() {
    try {
      const r = await fetch('/api/submarine-enhanced');
      if (!r.ok) return;
      data = await r.json();
      if (enabled) _render();
      _updatePanel();
    } catch(_) {}
  }

  // ── Render all layers ────────────────────────────────────────────────────────
  function _render() {
    if (!map) return;
    markers.forEach(m => map.removeLayer(m));
    zones.forEach(z => map.removeLayer(z));
    markers = []; zones = [];

    // Patrol zone circles
    PATROL_ZONES.forEach(z => {
      const c = L.circle([z.lat, z.lng], {
        radius:z.r*1000, color:z.color, fillColor:z.color,
        fillOpacity:0.07, weight:0.6, opacity:0.25, dashArray:'5 5',
      });
      c.bindTooltip(`<div style="font-family:monospace;font-size:8px;color:${z.color};background:#04060a;padding:4px 7px;border:1px solid ${z.color}44;border-radius:3px"><b>${z.name}</b><br><span style="color:#5a7a9a">${z.note}</span></div>`,
        { permanent:false, className:'sub-tt' });
      c.addTo(map); zones.push(c);
    });

    if (!data) return;

    // Submarine bases
    (data.bases || []).forEach(b => {
      const cfg = TYPE_CONFIG[b.type] || TYPE_CONFIG['SSN BASE'];
      const icon = L.divIcon({
        html:`<div class="sub-base-icon" style="color:${cfg.color};border-color:${cfg.color}">
          ⬡<span class="sub-base-count">${b.subs}</span>
        </div>`,
        className:'', iconSize:[28,28], iconAnchor:[14,14],
      });
      const pop = `<div class="sub-popup" style="border-left:2px solid ${cfg.color}">
        <div class="sp-hdr" style="color:${cfg.color}">${b.flag} ${b.name}</div>
        <div class="sp-row"><span class="sp-lbl">TYPE</span> ${b.type}</div>
        <div class="sp-row"><span class="sp-lbl">SUBS</span> <span style="color:${cfg.color}">${b.subs} submarines homeported</span></div>
        <div class="sp-row"><span class="sp-lbl">NOTES</span> ${b.notes}</div>
        <div class="sp-src">Source: OSINT / open-source naval records</div>
      </div>`;
      const mk = L.marker([b.lat, b.lng], { icon, zIndexOffset:1000 })
        .bindPopup(pop, { className:'leaflet-popup-dark', maxWidth:300 });
      mk.addTo(map); markers.push(mk);
    });

    // Submarines
    (data.submarines || []).forEach(s => {
      const cfg = TYPE_CONFIG[s.type] || TYPE_CONFIG.SSK;
      const isNuke = ['SSBN','SSN','SSGN'].includes(s.type);
      const icon = L.divIcon({
        html:`<div class="sub-marker" style="color:${cfg.color};border-color:${cfg.color};background:${cfg.color}18">
          ${cfg.icon}${s.type==='UUV'?'<span class="sub-uuv-pulse" style="background:${cfg.color}"></span>':''}
        </div>`,
        className:'', iconSize:[22,22], iconAnchor:[11,11],
      });
      const threatBadge = s.totalWarheads > 0
        ? `<div class="sp-warhead-bar"><span class="sp-warhead-count" style="color:#ff2222">☢ ${s.totalWarheads} nuclear warheads</span></div>`
        : '';
      const pop = `<div class="sub-popup" style="border-left:2px solid ${cfg.color}">
        <div class="sp-hdr" style="color:${cfg.color}">${s.flag} ${s.name}</div>
        <div class="sp-type-badge" style="background:${cfg.color}22;color:${cfg.color};border:1px solid ${cfg.color}44">${s.type} — ${s.clazz}</div>
        <div class="sp-row"><span class="sp-lbl">STATUS</span> <span style="color:${cfg.color}">${s.status.toUpperCase()}</span></div>
        <div class="sp-row"><span class="sp-lbl">ARMAMENT</span> ${s.warheads}</div>
        <div class="sp-row"><span class="sp-lbl">MISSILES</span> ${s.missiles}</div>
        ${threatBadge}
        <div class="sp-row"><span class="sp-lbl">NOTES</span> ${s.notes}</div>
        <div class="sp-src">⚠ Position ESTIMATED from OSINT · Source: ${s.source}</div>
      </div>`;
      const mk = L.marker([s.lat, s.lng], { icon, zIndexOffset: cfg.z || 600 })
        .bindPopup(pop, { className:'leaflet-popup-dark', maxWidth:320 });
      mk.addTo(map); markers.push(mk);
    });
  }

  // ── Update left panel ────────────────────────────────────────────────────────
  function _updatePanel() {
    const statsEl = document.getElementById('sub-stats-list');
    const newsEl  = document.getElementById('sub-news-list');
    if (!data) return;

    // Warhead summary table
    if (statsEl && data.warheadSummary) {
      const ws = data.warheadSummary;
      statsEl.innerHTML = Object.entries(ws).sort((a,b)=>b[1].total-a[1].total).map(([country, w]) => {
        const flag = COUNTRY_FLAGS[country] || '🌐';
        const pct  = Math.min(100, Math.round(w.total / 63));
        return `<div class="sub-stat-row">
          <span class="sub-flag">${flag}</span>
          <div class="sub-stat-info">
            <div class="sub-stat-name">${country}</div>
            <div class="sub-stat-bar-wrap">
              <div class="sub-stat-bar" style="width:${pct}%;background:${pct>50?'#ff2222':pct>20?'#ff9900':'#00cc88'}"></div>
            </div>
            <div class="sub-stat-detail">☢ ${w.total.toLocaleString()} total · ${w.deployed.toLocaleString()} deployed · ${w.ssbns} SSBNs</div>
          </div>
        </div>`;
      }).join('');
    }

    // OSINT news (repurpose news area as submarine fleet table)
    if (newsEl && data.submarines) {
      const byType = {};
      data.submarines.forEach(s => { (byType[s.type]||(byType[s.type]=[])).push(s); });
      newsEl.innerHTML = Object.entries(byType).map(([type, arr]) => {
        const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.SSK;
        return `<div class="sub-fleet-group">
          <div class="sub-fleet-hdr" style="color:${cfg.color}">${cfg.icon} ${type} (${arr.length})</div>
          ${arr.map(s=>`<div class="sub-fleet-row">
            <span>${s.flag}</span>
            <span class="sfr-name">${s.name}</span>
            <span class="sfr-wh" style="color:${s.totalWarheads>0?'#ff4444':'#3d5a78'}">${s.totalWarheads>0?'☢ '+s.totalWarheads:'—'}</span>
          </div>`).join('')}
        </div>`;
      }).join('');
    }
  }

  // ── CSS injection ────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('sub-css')) return;
    const s = document.createElement('style');
    s.id = 'sub-css';
    s.textContent = `
      .sub-marker{width:22px;height:22px;border-radius:50%;border:2px solid;
        display:flex;align-items:center;justify-content:center;font-size:11px;
        cursor:pointer;transition:transform .2s;box-shadow:0 0 8px currentColor;position:relative}
      .sub-marker:hover{transform:scale(1.5)}
      .sub-base-icon{width:28px;height:28px;display:flex;align-items:center;justify-content:center;
        font-size:14px;cursor:pointer;position:relative;filter:drop-shadow(0 0 4px currentColor)}
      .sub-base-count{position:absolute;top:-4px;right:-6px;font-size:7px;font-weight:700;
        background:#04060a;border:1px solid currentColor;border-radius:8px;padding:0 3px;line-height:1.4}
      .sub-uuv-pulse{position:absolute;inset:-4px;border-radius:50%;
        animation:sub-pulse 2s ease-in-out infinite;opacity:.4}
      @keyframes sub-pulse{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.6);opacity:0}}

      .sub-popup{min-width:260px;max-width:300px;font-family:'Courier New',monospace;padding:2px}
      .sp-hdr{font-size:10px;font-weight:700;margin-bottom:5px}
      .sp-type-badge{font-size:6.5px;font-weight:700;padding:2px 6px;border-radius:2px;
        display:inline-block;margin-bottom:5px;letter-spacing:.5px}
      .sp-row{font-size:7.5px;color:#c8dff0;margin:2px 0;line-height:1.4}
      .sp-lbl{color:#3d5a78;display:inline-block;width:70px;font-size:7px;letter-spacing:.3px}
      .sp-warhead-bar{margin:5px 0;padding:3px 6px;background:rgba(255,34,34,.1);
        border:1px solid rgba(255,34,34,.3);border-radius:2px}
      .sp-warhead-count{font-size:8px;font-weight:700}
      .sp-src{font-size:6.5px;color:#3d5a78;margin-top:6px;border-top:1px solid #0d1e2e;padding-top:4px}

      .sub-stat-row{display:flex;align-items:flex-start;gap:6px;padding:4px 0;
        border-bottom:1px solid #0d1e2e}
      .sub-flag{font-size:14px;flex-shrink:0}
      .sub-stat-info{flex:1;min-width:0}
      .sub-stat-name{font-size:7.5px;font-weight:700;color:#c8dff0;margin-bottom:2px}
      .sub-stat-bar-wrap{height:3px;background:#0d1e2e;border-radius:2px;margin-bottom:2px}
      .sub-stat-bar{height:100%;border-radius:2px;transition:width .5s}
      .sub-stat-detail{font-size:6.5px;color:#3d5a78}

      .sub-fleet-group{margin-bottom:8px}
      .sub-fleet-hdr{font-size:7px;font-weight:700;letter-spacing:.5px;padding:3px 0;
        border-bottom:1px solid #0d1e2e;margin-bottom:3px}
      .sub-fleet-row{display:flex;align-items:center;gap:5px;padding:1.5px 0;font-size:7px;color:#5a7a9a}
      .sfr-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c8dff0}
      .sfr-wh{font-size:6.5px;font-weight:700;white-space:nowrap}
      .sub-tt{background:#04060a!important;border:1px solid #1a3040!important;
        color:#c8dff0!important;font-family:'Courier New',monospace!important}
    `;
    document.head.appendChild(s);
  }

  return {
    init(m) {
      map = m;
      _injectCSS();
      _fetch();
    },
    setEnabled(on) {
      enabled = on;
      if (on) {
        if (data) _render(); else _fetch();
        _updatePanel();
        refreshTimer = setInterval(_fetch, 600_000);
      } else {
        clearInterval(refreshTimer);
        markers.forEach(m => map?.removeLayer(m));
        zones.forEach(z => map?.removeLayer(z));
        markers = []; zones = [];
      }
    },
    refresh() { _fetch(); },
    getData() { return data; },
  };
})();
