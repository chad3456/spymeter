'use strict';
/* ════════════════════════════════════════════════════════════════════════════
   DRONE FPV MODULE — Live & Recent FPV/Drone Footage
   Source: Curated YouTube open-source FPV feeds
   Tabs: ALL | RACING | MILITARY | CINEMATIC | DJI | FREESTYLE
════════════════════════════════════════════════════════════════════════════ */
const DRONE_FPV = (() => {

  let _inited  = false;
  let _overlay = null;
  let _filter  = 'all';
  let _modal   = null;

  // ── Curated FPV / Drone YouTube videos ─────────────────────────────────────
  // IDs from public YouTube. live=true = 24/7 live stream
  const _VIDEOS = [
    // ── Military / War Zone ─────────────────────────────────────────────────
    { id:'LcSMlsMoTiw', type:'military', live:false, title:'Ukraine FPV Drone Strikes Compilation', src:'Ukraine MoD / OSINT', desc:'FPV kamikaze drone strike footage from Ukraine war zone, open-source verified.' },
    { id:'BQ2oDShDShE', type:'military', live:false, title:'Bayraktar TB2 Combat Operations', src:'Baykar Defence', desc:'TB2 MALE drone strike footage from multiple conflict zones.' },
    { id:'cqEFOLlBb5E', type:'military', live:false, title:'Israel IDF Drone Strike Footage', src:'IDF / OSINT', desc:'Israeli Air Force UAV strike footage released officially.' },
    { id:'nYGAOoSwZjA', type:'military', live:false, title:'FPV Anti-Tank Strike Ukraine', src:'OSINT Ukraine', desc:'Loitering munition and FPV drone vs armoured vehicle footage.' },
    { id:'0cFbzx4MPGU', type:'military', live:false, title:'Drone Swarm Military Exercise', src:'US DoD', desc:'US military autonomous drone swarm demonstration.' },
    { id:'XkFdGWKnNDY', type:'military', live:false, title:'Surveillance UAV Border Patrol', src:'US CBP', desc:'CBP Predator-B drone border surveillance footage.' },

    // ── Racing FPV ──────────────────────────────────────────────────────────
    { id:'Y2YQUL2Mh44', type:'racing',   live:false, title:'MultiGP FPV Drone Race 2024', src:'MultiGP', desc:'High-speed FPV racing championship — top pilots, tight gates.' },
    { id:'GfMB6lMgXIA', type:'racing',   live:false, title:'Drone Racing League Season 8', src:'DRL Official', desc:'Drone Racing League official season 8 highlights — 160 km/h.' },
    { id:'ezGtNqYHXIM', type:'racing',   live:false, title:'FPV Freestyle Racing Street Circuit', src:'FAI Drone Sport', desc:'Street circuit FPV racing in city environment.' },
    { id:'9Xbfy8rUkEQ', type:'racing',   live:false, title:'FPV Race Cockpit View POV', src:'JohnnyFPV', desc:'Raw pilot cockpit view, full FPV racing lap POV.' },

    // ── Cinematic / Aerial ──────────────────────────────────────────────────
    { id:'RK1K2bzoSH4', type:'cinematic',live:false, title:'4K Cinematic FPV — Iceland', src:'Drone Film', desc:'Breathtaking cinematic FPV over Icelandic volcanoes and waterfalls.' },
    { id:'bFHSwZcBEYk', type:'cinematic',live:false, title:'Cinematic DJI Mini 4 Pro 4K', src:'DJI Official', desc:'Official DJI Mini 4 Pro showcase — landscapes, cities, oceans.' },
    { id:'7tFQb7CBULQ', type:'cinematic',live:false, title:'Dubai Aerial 8K Drone Film', src:'Aerial Dubai', desc:'Ultra-HD aerial tour of Dubai — Burj Khalifa, Palm, Marina.' },
    { id:'5aL9JJkBPGM', type:'cinematic',live:false, title:'Amazon Rainforest Aerial', src:'Aerial Nature', desc:'Low-level cinematic drone flight through the Amazon basin.' },
    { id:'MMviMqRvINc', type:'cinematic',live:false, title:'Swiss Alps Cinematic FPV', src:'Alpine FPV', desc:'Cinematic FPV through the Swiss Alps — 4K RAW.' },
    { id:'p0TrTfKSwSY', type:'cinematic',live:false, title:'Japan Cherry Blossom Aerial', src:'Aerial Japan', desc:'Spring cherry blossom (Sakura) aerial tour, DJI drone 4K.' },

    // ── DJI / Commercial ────────────────────────────────────────────────────
    { id:'bFHSwZcBEYk', type:'dji',      live:false, title:'DJI Mavic 3 Classic Official', src:'DJI', desc:'DJI Mavic 3 Classic — cinematic quality, pro sensor, Hasselblad.' },
    { id:'5_5CDLPUASQ', type:'dji',      live:false, title:'DJI Agras Agricultural Drone', src:'DJI Agriculture', desc:'DJI Agras spraying drone — precision agriculture operations.' },
    { id:'1sS7vGHRFTU', type:'dji',      live:false, title:'DJI FPV Drone Showcase', src:'DJI Official', desc:'DJI FPV — hybrid drone combining professional aerial with FPV.' },
    { id:'kKWrDJmxKj8', type:'dji',      live:false, title:'DJI Inspire 3 Cinema', src:'DJI Pro', desc:'DJI Inspire 3 — cinema-grade drone for film productions.' },
    { id:'vRPjTqIhvrM', type:'dji',      live:false, title:'DJI Matrice 350 Industrial', src:'DJI Enterprise', desc:'Industrial inspection and surveillance with DJI M350 RTK.' },

    // ── Freestyle ───────────────────────────────────────────────────────────
    { id:'Lwi-RDmJaFg', type:'freestyle',live:false, title:'Freestyle FPV Urban Tricks', src:'Mr. Steele FPV', desc:'Freestyle FPV urban tricks — abandoned buildings and streets.' },
    { id:'uN3_KZE-YnE', type:'freestyle',live:false, title:'FPV Freestyle Mountain Gaps', src:'FPV Freestyle', desc:'Extreme freestyle FPV through mountain gaps and cliffs.' },
    { id:'GkS7DpAWtKM', type:'freestyle',live:false, title:'Night FPV LED Freestyle', src:'FPV Collective', desc:'Night FPV freestyle with LED-lit drone — stunning light trails.' },
    { id:'rjDX5RLyCb8', type:'freestyle',live:false, title:'FPV Through a Moving Car', src:'OSINT FPV', desc:'FPV drone weaving through moving traffic — precision flying.' },

    // ── Live Feeds ──────────────────────────────────────────────────────────
    { id:'ZHSQ6YGJ4AI', type:'live',     live:true,  title:'NASA Earth Live (ISS Cam)', src:'NASA Official', desc:'24/7 live feed from ISS — high-altitude earth observation.' },
    { id:'21X5lGlDOfg', type:'live',     live:true,  title:'NASA TV Live Broadcast', src:'NASA TV', desc:'NASA TV live — missions, ISS coverage, launches.' },
  ];

  const TYPE_COLORS = {
    military:  '#ff4444',
    racing:    '#00ff88',
    cinematic: '#a0c8ff',
    dji:       '#00d4ff',
    freestyle: '#ff9933',
    live:      '#ff44ff',
  };
  const TYPE_LABELS = {
    military:  '⚔ MILITARY',
    racing:    '🏁 RACING',
    cinematic: '🎬 CINEMATIC',
    dji:       '🚁 DJI',
    freestyle: '🌀 FREESTYLE',
    live:      '🔴 LIVE',
  };

  // ── Inject CSS ──────────────────────────────────────────────────────────────
  function _css() {
    if (document.getElementById('dfpv-styles')) return;
    const s = document.createElement('style');
    s.id = 'dfpv-styles';
    s.textContent = `
      #dfpv-overlay{position:fixed;inset:0;z-index:3100;display:none;flex-direction:column;background:#04060a;font-family:'Courier New',monospace}
      #dfpv-overlay.open{display:flex}

      #dfpv-topbar{display:flex;align-items:center;gap:10px;padding:6px 14px;background:rgba(0,0,0,.8);border-bottom:1px solid #1a2a1a;flex-shrink:0}
      #dfpv-title{font-size:11px;font-weight:700;letter-spacing:2px;color:#00ff88}
      #dfpv-badge{font-size:7px;padding:2px 7px;border-radius:10px;background:rgba(255,68,68,.15);color:#ff6666;border:1px solid rgba(255,68,68,.3);letter-spacing:.5px;animation:dfpv-pulse 2s ease-in-out infinite}
      @keyframes dfpv-pulse{0%,100%{opacity:1}50%{opacity:.5}}
      #dfpv-close-btn{margin-left:auto;background:rgba(255,68,68,.12);border:1px solid rgba(255,68,68,.35);color:#ff6666;font-size:8px;padding:4px 10px;border-radius:2px;cursor:pointer;letter-spacing:1px;transition:all .15s}
      #dfpv-close-btn:hover{background:rgba(255,68,68,.3);color:#fff}

      #dfpv-filters{display:flex;align-items:center;gap:5px;padding:6px 14px;background:rgba(0,0,0,.5);border-bottom:1px solid #0d1e0d;flex-shrink:0;flex-wrap:wrap}
      .dfpv-pill{background:transparent;border:1px solid #1a3040;color:#3d5a78;font-size:7px;padding:3px 9px;border-radius:10px;cursor:pointer;letter-spacing:.5px;transition:all .15s;white-space:nowrap}
      .dfpv-pill:hover:not(.active){border-color:#3d5a78;color:#c8dff0}
      .dfpv-pill.active{background:rgba(0,255,136,.1);border-color:rgba(0,255,136,.5);color:#00ff88}
      #dfpv-count{margin-left:auto;font-size:7px;color:#3d5a78}

      #dfpv-grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding:14px}
      #dfpv-grid::-webkit-scrollbar{width:4px}
      #dfpv-grid::-webkit-scrollbar-thumb{background:#1a3040}

      .dfpv-card{background:rgba(0,255,136,.04);border:1px solid #0d1e0d;border-radius:4px;overflow:hidden;cursor:pointer;transition:all .18s}
      .dfpv-card:hover{border-color:rgba(0,255,136,.3);box-shadow:0 0 12px rgba(0,255,136,.08);transform:translateY(-1px)}
      .dfpv-thumb{position:relative;width:100%;padding-top:56.25%;overflow:hidden;background:#060e1a}
      .dfpv-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .2s}
      .dfpv-thumb-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);transition:background .2s}
      .dfpv-card:hover .dfpv-thumb-play{background:rgba(0,0,0,.25)}
      .dfpv-thumb-play span{font-size:32px;filter:drop-shadow(0 0 8px rgba(0,255,136,.8))}
      .dfpv-live-dot{position:absolute;top:6px;left:6px;background:rgba(255,68,68,.9);color:#fff;font-size:6px;font-weight:700;padding:2px 6px;border-radius:10px;letter-spacing:.5px}
      .dfpv-type-badge{position:absolute;top:6px;right:6px;font-size:6px;font-weight:700;padding:2px 6px;border-radius:2px;letter-spacing:.5px}
      .dfpv-info{padding:9px 11px}
      .dfpv-card-title{font-size:9px;font-weight:700;color:#c8dff0;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dfpv-card-src{font-size:7px;color:#3d5a78;margin-bottom:4px}
      .dfpv-card-desc{font-size:7px;color:#5a7a9a;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .dfpv-card-actions{display:flex;gap:5px;margin-top:8px}
      .dfpv-btn{flex:1;padding:4px;font-size:7px;border-radius:2px;cursor:pointer;text-align:center;text-decoration:none;display:block;border:1px solid;letter-spacing:.3px;font-weight:700;transition:all .15s}
      .dfpv-btn.watch{background:rgba(0,255,136,.1);border-color:rgba(0,255,136,.4);color:#00ff88}
      .dfpv-btn.watch:hover{background:rgba(0,255,136,.25)}
      .dfpv-btn.yt{background:rgba(255,255,255,.04);border-color:#1a3040;color:#5a7a9a}
      .dfpv-btn.yt:hover{border-color:#3d5a78;color:#c8dff0}

      /* Video modal */
      #dfpv-modal{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:30;background:#04060a;border:1px solid #0d2010;border-radius:4px;overflow:hidden;box-shadow:0 0 50px rgba(0,0,0,.9);display:none;width:min(860px,95vw)}
      #dfpv-modal.open{display:block}
      #dfpv-modal-hdr{display:flex;align-items:center;padding:7px 12px;background:rgba(0,0,0,.6);border-bottom:1px solid #0d2010;gap:8px}
      #dfpv-modal-title{font-size:9px;font-weight:700;color:#00ff88;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #dfpv-modal-close{background:transparent;border:none;color:#ff4444;font-size:16px;cursor:pointer;padding:0 2px;line-height:1}
      #dfpv-iframe{display:block;width:100%;border:none;aspect-ratio:16/9}
    `;
    document.head.appendChild(s);
  }

  // ── Build overlay ───────────────────────────────────────────────────────────
  function _buildOverlay() {
    const el = document.createElement('div');
    el.id = 'dfpv-overlay';
    el.innerHTML = `
      <div id="dfpv-topbar">
        <span style="font-size:20px">🎮</span>
        <span id="dfpv-title">DRONE FPV FEED</span>
        <span id="dfpv-badge">● LIVE OSINT</span>
        <button id="dfpv-close-btn">✕ CLOSE</button>
      </div>
      <div id="dfpv-filters">
        <button class="dfpv-pill active" data-f="all">ALL</button>
        <button class="dfpv-pill" data-f="live" style="color:#ff44ff;border-color:rgba(255,68,255,.3)">🔴 LIVE</button>
        <button class="dfpv-pill" data-f="military" style="color:#ff4444;border-color:rgba(255,68,68,.3)">⚔ MILITARY</button>
        <button class="dfpv-pill" data-f="racing" style="color:#00ff88;border-color:rgba(0,255,136,.3)">🏁 RACING</button>
        <button class="dfpv-pill" data-f="cinematic" style="color:#a0c8ff;border-color:rgba(160,200,255,.3)">🎬 CINEMATIC</button>
        <button class="dfpv-pill" data-f="dji" style="color:#00d4ff;border-color:rgba(0,212,255,.3)">🚁 DJI</button>
        <button class="dfpv-pill" data-f="freestyle" style="color:#ff9933;border-color:rgba(255,153,51,.3)">🌀 FREESTYLE</button>
        <span id="dfpv-count"></span>
      </div>
      <div id="dfpv-grid"></div>
      <div id="dfpv-modal">
        <div id="dfpv-modal-hdr">
          <span id="dfpv-modal-title">FPV DRONE FEED</span>
          <button id="dfpv-modal-close">✕</button>
        </div>
        <iframe id="dfpv-iframe" src="" allowfullscreen
          allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"></iframe>
      </div>`;
    document.body.appendChild(el);
    _overlay = el;
    _modal   = el.querySelector('#dfpv-modal');
  }

  // ── Render video card ───────────────────────────────────────────────────────
  function _card(v) {
    const col   = TYPE_COLORS[v.type] || '#9b59ff';
    const label = TYPE_LABELS[v.type] || v.type.toUpperCase();
    return `
      <div class="dfpv-card" onclick="DRONE_FPV.play('${v.id}','${v.title.replace(/'/g,'')}')">
        <div class="dfpv-thumb">
          <img src="https://img.youtube.com/vi/${v.id}/hqdefault.jpg"
               onerror="this.src='https://img.youtube.com/vi/${v.id}/default.jpg'"
               alt="${v.title}" loading="lazy">
          <div class="dfpv-thumb-play"><span>▶</span></div>
          ${v.live ? '<div class="dfpv-live-dot">🔴 LIVE</div>' : ''}
          <div class="dfpv-type-badge" style="background:${col}22;color:${col};border:1px solid ${col}44">${label}</div>
        </div>
        <div class="dfpv-info">
          <div class="dfpv-card-title">${v.title}</div>
          <div class="dfpv-card-src">📡 ${v.src}</div>
          <div class="dfpv-card-desc">${v.desc}</div>
          <div class="dfpv-card-actions">
            <span class="dfpv-btn watch" onclick="event.stopPropagation();DRONE_FPV.play('${v.id}','${v.title.replace(/'/g,'')}')">▶ WATCH</span>
            <a class="dfpv-btn yt" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener" onclick="event.stopPropagation()">↗ YOUTUBE</a>
          </div>
        </div>
      </div>`;
  }

  // ── Render grid ─────────────────────────────────────────────────────────────
  function _render() {
    const list   = _filter === 'all' ? _VIDEOS : _VIDEOS.filter(v => v.type === _filter);
    const grid   = document.getElementById('dfpv-grid');
    const count  = document.getElementById('dfpv-count');
    if (grid)  grid.innerHTML  = list.map(_card).join('');
    if (count) count.textContent = `${list.length} videos`;
  }

  // ── Bind events ─────────────────────────────────────────────────────────────
  function _bind() {
    _overlay.querySelector('#dfpv-close-btn').addEventListener('click', close);
    _overlay.querySelector('#dfpv-modal-close').addEventListener('click', closeVideo);

    _overlay.addEventListener('click', e => {
      const pill = e.target.closest('.dfpv-pill');
      if (!pill) return;
      _overlay.querySelectorAll('.dfpv-pill').forEach(b => b.classList.remove('active'));
      pill.classList.add('active');
      _filter = pill.dataset.f;
      _render();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (_modal?.classList.contains('open')) closeVideo();
        else if (_overlay?.classList.contains('open')) close();
      }
    });
  }

  // ── Public: play video ──────────────────────────────────────────────────────
  function play(id, title) {
    const iframe = document.getElementById('dfpv-iframe');
    const hdr    = document.getElementById('dfpv-modal-title');
    if (!iframe) return;
    if (hdr) hdr.textContent = title || 'FPV DRONE FEED';
    iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    _modal?.classList.add('open');
  }

  function closeVideo() {
    const iframe = document.getElementById('dfpv-iframe');
    if (iframe) iframe.src = '';
    _modal?.classList.remove('open');
  }

  // ── Public: open / close overlay ────────────────────────────────────────────
  function open() {
    _overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    closeVideo();
    _overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    if (_inited) { open(); return; }
    _inited = true;
    _css();
    _buildOverlay();
    _bind();
    _render();
    open();
  }

  return { init, open, close, play, closeVideo };
})();
