'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   DRONE FPV MODULE — Floating draggable panel
   Panel: bottom-left, draggable, resizable, minimize/maximize
   Videos: open on YouTube in new tab (no iframe / no CSP error)
════════════════════════════════════════════════════════════════════════════ */
const DRONE_FPV = (() => {

  let _inited    = false;
  let _panel     = null;
  let _filter    = 'all';
  let _minimised = false;
  let _expanded  = false;
  let _savedPos  = {};

  const _VIDEOS = [
    // ── Live / ISS ───────────────────────────────────────────────────────────
    { id:'ZHSQ6YGJ4AI', type:'live',     title:'NASA Earth Live — ISS Cam',            src:'NASA',          desc:'24/7 HD live feed from the International Space Station.' },
    { id:'21X5lGlDOfg', type:'live',     title:'NASA TV Live',                          src:'NASA TV',       desc:'NASA TV continuous broadcast — missions, launches, EVAs.' },
    { id:'xRPjKQpKSs8', type:'live',     title:'ISS HDEV Earth Timelapse',              src:'NASA JSC',      desc:'High-definition Earth views from the ISS external cameras.' },
    // ── Military / OSINT ────────────────────────────────────────────────────
    { id:'LcSMlsMoTiw', type:'military', title:'Ukraine FPV Drone Strikes',             src:'Ukraine MoD',   desc:'Open-source FPV kamikaze strike footage — Ukraine conflict zone.' },
    { id:'BQ2oDShDShE', type:'military', title:'Bayraktar TB2 Combat Ops',              src:'Baykar',        desc:'TB2 MALE UAS strike footage from multiple conflict theatres.' },
    { id:'cqEFOLlBb5E', type:'military', title:'IDF Drone Strike Footage',              src:'IDF / OSINT',   desc:'Israeli Air Force UAV operational footage, officially released.' },
    { id:'nYGAOoSwZjA', type:'military', title:'FPV Anti-Armour Ukraine',               src:'OSINT',         desc:'FPV loitering munitions engaging armoured vehicles.' },
    { id:'0cFbzx4MPGU', type:'military', title:'US Drone Swarm Exercise',               src:'US DoD',        desc:'Autonomous drone swarm demonstration, DARPA / US military.' },
    { id:'XkFdGWKnNDY', type:'military', title:'Border Patrol UAV Surveillance',        src:'US CBP',        desc:'CBP Predator-B drone surveillance — live border operations footage.' },
    // ── Racing ───────────────────────────────────────────────────────────────
    { id:'Y2YQUL2Mh44', type:'racing',   title:'MultiGP FPV Championship 2024',         src:'MultiGP',       desc:'Top pilots, tight gates, 200 km/h — full race coverage.' },
    { id:'GfMB6lMgXIA', type:'racing',   title:'Drone Racing League Season Highlights', src:'DRL',           desc:'Official DRL Season 8 — 160 km/h custom-built race drones.' },
    { id:'9Xbfy8rUkEQ', type:'racing',   title:'FPV Cockpit POV Full Lap',              src:'JohnnyFPV',     desc:'Raw pilot POV — what a racer actually sees at full speed.' },
    { id:'ezGtNqYHXIM', type:'racing',   title:'FPV Street Circuit Race',               src:'FAI Drone',     desc:'Urban street circuit FPV racing in a closed city environment.' },
    // ── Cinematic ────────────────────────────────────────────────────────────
    { id:'RK1K2bzoSH4', type:'cinematic',title:'Cinematic FPV Iceland 4K',              src:'Drone Film',    desc:'Volcanic landscapes, waterfalls and fjords — stunning aerial FPV.' },
    { id:'bFHSwZcBEYk', type:'cinematic',title:'DJI Mini 4 Pro Showcase 4K',            src:'DJI Official',  desc:'Official DJI Mini 4 Pro — landscapes, cities, ocean wide shots.' },
    { id:'7tFQb7CBULQ', type:'cinematic',title:'Dubai 8K Aerial Film',                  src:'Aerial Dubai',  desc:'Ultra-high-definition aerial tour — Burj Khalifa, Palm, Marina.' },
    { id:'5aL9JJkBPGM', type:'cinematic',title:'Amazon Rainforest Low-Level FPV',       src:'Aerial Nature', desc:'Cinematic low-altitude drone flight through the Amazon canopy.' },
    { id:'MMviMqRvINc', type:'cinematic',title:'Swiss Alps Cinematic FPV 4K',           src:'Alpine FPV',    desc:'FPV through Swiss mountain gaps — 4K RAW colour grade.' },
    { id:'p0TrTfKSwSY', type:'cinematic',title:'Japan Cherry Blossom Aerial',           src:'Aerial Japan',  desc:'Sakura season aerial tour — DJI 4K, spring drone cinematics.' },
    // ── DJI / Commercial ─────────────────────────────────────────────────────
    { id:'1sS7vGHRFTU', type:'dji',      title:'DJI FPV Drone Official',                src:'DJI',           desc:'DJI FPV — hybrid professional aerial meets first-person racing.' },
    { id:'kKWrDJmxKj8', type:'dji',      title:'DJI Inspire 3 Cinema Drone',            src:'DJI Pro',       desc:'Cinema-grade aerial platform used in major film productions.' },
    { id:'vRPjTqIhvrM', type:'dji',      title:'DJI Matrice 350 Industrial RTK',        src:'DJI Enterprise',desc:'Industrial inspection, mapping, and surveillance operations.' },
    { id:'5_5CDLPUASQ', type:'dji',      title:'DJI Agras Agricultural Drone',          src:'DJI Agri',      desc:'Precision agriculture spraying drone — field operations demo.' },
    // ── Freestyle ────────────────────────────────────────────────────────────
    { id:'Lwi-RDmJaFg', type:'freestyle',title:'Urban FPV Freestyle Tricks',            src:'Mr. Steele',    desc:'Freestyle FPV through urban ruins — proximity flying at its best.' },
    { id:'uN3_KZE-YnE', type:'freestyle',title:'Mountain Gap Freestyle FPV',            src:'FPV Freestyle', desc:'Extreme precision flying through narrow mountain rock gaps.' },
    { id:'GkS7DpAWtKM', type:'freestyle',title:'Night FPV LED Freestyle',               src:'FPV Collective',desc:'LED-equipped drone freestyle at night — stunning light trail footage.' },
    { id:'rjDX5RLyCb8', type:'freestyle',title:'FPV Through Moving Traffic',            src:'OSINT FPV',     desc:'Weaving through moving cars in a closed circuit — precision showcase.' },
  ];

  const TYPE_COL = { live:'#ff44ff', military:'#ff4444', racing:'#00ff88',
    cinematic:'#a0c8ff', dji:'#00d4ff', freestyle:'#ff9933' };
  const TYPE_LBL = { live:'🔴 LIVE', military:'⚔ MILITARY', racing:'🏁 RACING',
    cinematic:'🎬 CINEMATIC', dji:'🚁 DJI', freestyle:'🌀 FREESTYLE' };

  // ── CSS ───────────────────────────────────────────────────────────────────────
  function _css() {
    if (document.getElementById('dfpv-styles')) return;
    const s = document.createElement('style');
    s.id = 'dfpv-styles';
    s.textContent = `
      #dfpv-panel{
        position:fixed;bottom:48px;left:22px;width:680px;height:460px;
        min-width:300px;min-height:200px;background:#04060a;
        border:1px solid #1a3040;border-radius:6px;display:none;
        flex-direction:column;z-index:4000;resize:both;overflow:hidden;
        box-shadow:0 0 40px rgba(0,0,0,.85);font-family:'Courier New',monospace;
      }
      #dfpv-panel.open{display:flex}
      #dfpv-panel.minimised #dfpv-filters,
      #dfpv-panel.minimised #dfpv-grid{display:none}
      #dfpv-panel.expanded{
        inset:0!important;width:100vw!important;height:100vh!important;
        border-radius:0;resize:none;
      }
      #dfpv-hdr{
        display:flex;align-items:center;gap:6px;padding:0 10px;height:34px;
        flex-shrink:0;background:rgba(0,0,0,.65);border-bottom:1px solid #1a2a1a;
        cursor:grab;user-select:none;
      }
      #dfpv-hdr:active{cursor:grabbing}
      #dfpv-title{font-size:9px;font-weight:700;letter-spacing:1.5px;color:#00ff88;pointer-events:none}
      #dfpv-badge{font-size:6.5px;padding:2px 7px;border-radius:10px;pointer-events:none;
        background:rgba(255,68,68,.1);border:1px solid rgba(255,68,68,.2);color:#ff6666;
        animation:dfpv-pulse 2s ease-in-out infinite}
      @keyframes dfpv-pulse{0%,100%{opacity:1}50%{opacity:.4}}
      .dfpv-spacer{flex:1}
      .dfpv-hbtn{background:transparent;border:1px solid #1a3040;color:#3d5a78;
        font-size:9px;padding:1px 7px;border-radius:3px;cursor:pointer;line-height:1.5;transition:all .15s}
      .dfpv-hbtn:hover{border-color:#00ff88;color:#00ff88}
      #dfpv-close{border-color:rgba(255,68,68,.3);color:#ff6666}
      #dfpv-close:hover{background:rgba(255,68,68,.2);color:#fff;border-color:#ff4444}

      #dfpv-filters{display:flex;align-items:center;gap:4px;padding:5px 10px;
        background:rgba(0,0,0,.4);border-bottom:1px solid #0d1e0d;flex-shrink:0;flex-wrap:wrap}
      .dfpv-pill{background:transparent;border:1px solid #1a3040;color:#3d5a78;
        font-size:6.5px;padding:2px 8px;border-radius:10px;cursor:pointer;letter-spacing:.4px;transition:all .15s}
      .dfpv-pill.on{background:rgba(0,255,136,.08);border-color:rgba(0,255,136,.4);color:#00ff88}
      .dfpv-pill:hover:not(.on){border-color:#3d5a78;color:#c8dff0}
      #dfpv-cnt{margin-left:auto;font-size:6.5px;color:#3d5a78}

      #dfpv-grid{flex:1;overflow-y:auto;display:grid;
        grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;padding:10px}
      #dfpv-grid::-webkit-scrollbar{width:3px}
      #dfpv-grid::-webkit-scrollbar-thumb{background:#1a3040}

      .dfpv-card{background:rgba(0,255,136,.03);border:1px solid #0d1e0d;
        border-radius:4px;overflow:hidden;cursor:pointer;transition:all .18s;text-decoration:none;display:block}
      .dfpv-card:hover{border-color:rgba(0,255,136,.3);box-shadow:0 0 10px rgba(0,255,136,.07);transform:translateY(-1px)}
      .dfpv-thumb{position:relative;width:100%;padding-top:56.25%;background:#060e1a}
      .dfpv-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .dfpv-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,.45);transition:background .2s}
      .dfpv-card:hover .dfpv-play{background:rgba(0,0,0,.2)}
      .dfpv-play span{font-size:26px;filter:drop-shadow(0 0 8px rgba(0,255,136,.7))}
      .dfpv-live-dot{position:absolute;top:5px;left:5px;background:rgba(255,68,68,.9);
        color:#fff;font-size:6px;font-weight:700;padding:1px 5px;border-radius:10px}
      .dfpv-badge{position:absolute;top:5px;right:5px;font-size:5.5px;font-weight:700;
        padding:1px 5px;border-radius:2px}
      .dfpv-info{padding:7px 9px}
      .dfpv-card-title{font-size:8px;font-weight:700;color:#c8dff0;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
      .dfpv-src{font-size:6.5px;color:#3d5a78;margin-bottom:3px}
      .dfpv-desc{font-size:6.5px;color:#5a7a9a;line-height:1.5;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .dfpv-open{display:block;margin-top:6px;padding:3px;font-size:6.5px;font-weight:700;
        border-radius:2px;text-align:center;background:rgba(0,255,136,.08);
        border:1px solid rgba(0,255,136,.3);color:#00ff88;transition:all .15s}
      .dfpv-open:hover{background:rgba(0,255,136,.2)}
    `;
    document.head.appendChild(s);
  }

  // ── Build panel ──────────────────────────────────────────────────────────────
  function _build() {
    _panel = document.createElement('div');
    _panel.id = 'dfpv-panel';
    _panel.innerHTML = `
      <div id="dfpv-hdr">
        <span style="font-size:13px;pointer-events:none">🎮</span>
        <span id="dfpv-title">DRONE FPV FEED</span>
        <span id="dfpv-badge">● OSINT LIVE</span>
        <span class="dfpv-spacer"></span>
        <button class="dfpv-hbtn" id="dfpv-min">─</button>
        <button class="dfpv-hbtn" id="dfpv-exp">⛶</button>
        <button class="dfpv-hbtn" id="dfpv-close">✕</button>
      </div>
      <div id="dfpv-filters">
        <button class="dfpv-pill on"  data-f="all">ALL</button>
        <button class="dfpv-pill" data-f="live"      style="color:#ff44ff;border-color:rgba(255,68,255,.25)">🔴 LIVE</button>
        <button class="dfpv-pill" data-f="military"  style="color:#ff4444;border-color:rgba(255,68,68,.25)">⚔ MILITARY</button>
        <button class="dfpv-pill" data-f="racing"    style="color:#00ff88;border-color:rgba(0,255,136,.25)">🏁 RACING</button>
        <button class="dfpv-pill" data-f="cinematic" style="color:#a0c8ff;border-color:rgba(160,200,255,.25)">🎬 CINEMATIC</button>
        <button class="dfpv-pill" data-f="dji"       style="color:#00d4ff;border-color:rgba(0,212,255,.25)">🚁 DJI</button>
        <button class="dfpv-pill" data-f="freestyle" style="color:#ff9933;border-color:rgba(255,153,51,.25)">🌀 FREESTYLE</button>
        <span id="dfpv-cnt"></span>
      </div>
      <div id="dfpv-grid"></div>`;
    document.body.appendChild(_panel);
  }

  // ── Render card (links open in new tab — avoids iframe CSP issues) ───────────
  function _card(v) {
    const col = TYPE_COL[v.type]||'#9b59ff';
    const lbl = TYPE_LBL[v.type]||v.type.toUpperCase();
    return `<a class="dfpv-card" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">
      <div class="dfpv-thumb">
        <img src="https://img.youtube.com/vi/${v.id}/hqdefault.jpg"
             onerror="this.src='https://img.youtube.com/vi/${v.id}/default.jpg'" loading="lazy" alt="${v.title}">
        <div class="dfpv-play"><span>▶</span></div>
        ${v.live?'<div class="dfpv-live-dot">🔴 LIVE</div>':''}
        <div class="dfpv-badge" style="background:${col}22;color:${col};border:1px solid ${col}44">${lbl}</div>
      </div>
      <div class="dfpv-info">
        <div class="dfpv-card-title">${v.title}</div>
        <div class="dfpv-src">📡 ${v.src}</div>
        <div class="dfpv-desc">${v.desc}</div>
        <span class="dfpv-open">▶ OPEN ON YOUTUBE ↗</span>
      </div>
    </a>`;
  }

  function _render() {
    const list  = _filter==='all' ? _VIDEOS : _VIDEOS.filter(v=>v.type===_filter);
    const grid  = document.getElementById('dfpv-grid');
    const cnt   = document.getElementById('dfpv-cnt');
    if (grid) grid.innerHTML = list.map(_card).join('');
    if (cnt)  cnt.textContent = list.length + ' videos';
  }

  // ── Drag ─────────────────────────────────────────────────────────────────────
  function _drag() {
    const hdr = _panel.querySelector('#dfpv-hdr');
    let on=false, ox=0, oy=0;
    hdr.addEventListener('mousedown', e => {
      if (e.target.tagName==='BUTTON' || _expanded) return;
      on=true; ox=e.clientX-_panel.offsetLeft; oy=e.clientY-_panel.offsetTop;
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    const mv = e => { if (!on) return;
      _panel.style.left=(e.clientX-ox)+'px'; _panel.style.top=(e.clientY-oy)+'px';
      _panel.style.right='auto'; _panel.style.bottom='auto'; };
    const up = () => { on=false;
      document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
  }

  // ── Bind ─────────────────────────────────────────────────────────────────────
  function _bind() {
    _panel.querySelector('#dfpv-close').addEventListener('click', close);

    _panel.querySelector('#dfpv-min').addEventListener('click', () => {
      _minimised = !_minimised;
      _panel.classList.toggle('minimised', _minimised);
      _panel.querySelector('#dfpv-min').textContent = _minimised ? '□' : '─';
    });

    _panel.querySelector('#dfpv-exp').addEventListener('click', () => {
      if (!_expanded) {
        _savedPos = { left:_panel.style.left, top:_panel.style.top,
          right:_panel.style.right, bottom:_panel.style.bottom,
          width:_panel.style.width, height:_panel.style.height };
        _panel.classList.add('expanded');
      } else {
        _panel.classList.remove('expanded');
        Object.assign(_panel.style, _savedPos);
      }
      _expanded = !_expanded;
    });

    _panel.addEventListener('click', e => {
      const p = e.target.closest('.dfpv-pill');
      if (!p) return;
      _panel.querySelectorAll('.dfpv-pill').forEach(b=>b.classList.remove('on'));
      p.classList.add('on');
      _filter = p.dataset.f;
      _render();
    });

    _drag();
  }

  // ── Public ───────────────────────────────────────────────────────────────────
  function open()  { _panel?.classList.add('open'); }
  function close() { _panel?.classList.remove('open'); }
  function init()  {
    if (_inited) { open(); return; }
    _inited=true; _css(); _build(); _bind(); _render(); open();
  }
  return { init, open, close };
})();
