/* ── SPYMETER — Main Orchestrator ─────────────────────────
   Globe.gl 3D globe, CRT mode, missile arcs, all wiring.   */
const APP = (() => {
  let map   = null;
  let ws    = null;
  let globe = null;
  let globeTimer   = null;
  let arcsEnabled  = false;
  let crtActive    = false;
  let crtAnimFrame = null;

  /* ── Map init ─────────────────────────────────────────── */
  function initMap() {
    map = L.map('map', {
      center: [20, 0], zoom: 3,
      zoomControl: false, attributionControl: true,
      preferCanvas: true, worldCopyJump: true,
    });

    // Tile layers managed by OVERLAYS.init() below — dark style by default

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    return map;
  }

  /* ── WebSocket ────────────────────────────────────────── */
  function initWebSocket() {
    const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    function connect() {
      ws = new WebSocket(url);
      ws.onopen  = () => { EFFECTS.setWsStatus('connected'); SIDEBAR.addFeedItem('satellite', 'WebSocket live — ADS-B push every 15s'); };
      ws.onmessage = ({ data }) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'aircraft') { AIRCRAFT.handleWSUpdate(msg.data); if (globe) updateGlobePoints(); }
        } catch (_) {}
      };
      ws.onclose = () => { EFFECTS.setWsStatus('reconnecting'); setTimeout(connect, 4000); };
      ws.onerror = () => ws.close();
    }
    connect();
  }

  /* ── Layer controls (debounced 120ms to prevent lag) ─── */
  let layerDebounceTimers = {};
  function initLayerControls() {
    document.querySelectorAll('.lbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.dataset.layer;
        const on    = btn.classList.toggle('active');

        // Debounce: avoid rapid re-renders
        clearTimeout(layerDebounceTimers[layer]);
        layerDebounceTimers[layer] = setTimeout(() => {
          switch (layer) {
            case 'aircraft':   AIRCRAFT.setEnabled(on); break;
            case 'satellites': SATELLITES.setEnabled(on); break;
            case 'military':   MILITARY.setEnabled('military', on); break;
            case 'nuclear':
              MILITARY.setEnabled('nuclear', on);
              SIDEBAR.addFeedItem('military', on ? '☢ Nuclear sites ON — India, Pakistan, Iran now visible' : 'Nuclear overlay OFF');
              break;
            case 'gpsjam':     MILITARY.setEnabled('gpsjam', on); break;
            case 'fires':      FIRES.setEnabled(on); break;
            case 'swarm':      SWARM.setEnabled(on); break;
            case 'weapons':
              WEAPONS.setEnabled(on);
              const wCard = document.getElementById('weapons-filter-card');
              if (wCard) wCard.style.display = on ? 'block' : 'none';
              if (on) initWeaponsFilterUI();
              SIDEBAR.addFeedItem('military', on ? '⚔ Weapons layer ON — Air Def/ATGM/ICBM/Artillery' : 'Weapons layer OFF');
              break;
            case 'conflict':
              btn.classList.toggle('active', true);
              CONFLICT.toggle();
              break;
            case 'oil':
              OIL.setEnabled(on);
              SIDEBAR.addFeedItem('military', on ? '🛢 Oil layer ON — chokepoints, Houthi zones, facilities visible' : 'Oil layer OFF');
              break;
            case 'arcs':
              arcsEnabled = on;
              if (globe) { on ? applyGlobeArcs() : clearGlobeArcs(); }
              SIDEBAR.addFeedItem('military', on ? '🚀 Strike arcs ON — switch to GLOBE view' : 'Strike arcs OFF');
              break;
            case 'internet':
              HEATMAP.setEnabled(on, 'internet');
              SIDEBAR.addFeedItem('satellite', on ? '🌐 Internet speed layer ON — Ookla 2024 data' : 'Internet speed layer OFF');
              break;
            case 'tourism':
              HEATMAP.setEnabled(on, 'tourism');
              SIDEBAR.addFeedItem('satellite', on ? '✈ Travel advisory layer ON — US State Dept levels 1-4' : 'Travel advisory layer OFF');
              break;
            case 'embassy':
              HEATMAP.setEnabled(on, 'embassy');
              SIDEBAR.addFeedItem('satellite', on ? '🇮🇳 Indian embassy layer ON — MEA offices in conflict zones' : 'Embassy layer OFF');
              break;
            case 'usbases':
              USBASES.setEnabled(on);
              SIDEBAR.addFeedItem('military', on ? `🦅 US Overseas Bases ON — ${USBASES.getBases().length} bases across USAFE/CENTCOM/PACAF/AFRICOM` : 'US Bases layer OFF');
              break;
            case 'cables':
              CABLES.setEnabled(on);
              SIDEBAR.addFeedItem('satellite', on ? '🌊 Submarine Cables ON — TeleGeography global network' : 'Submarine Cables layer OFF');
              break;
            case 'outage':
              OUTAGE.setEnabled(on);
              SIDEBAR.addFeedItem('satellite', on ? '⚡ Internet Outage layer ON — worldwide disruption monitor' : 'Internet Outage layer OFF');
              break;
            case 'leaders':
              LEADERS.setEnabled(on);
              SIDEBAR.addFeedItem('satellite', on ? `👤 World Leaders ON — ${LEADERS.getData().length} heads of state mapped` : 'Leaders layer OFF');
              break;
            case 'marine':
              MARINE_LAYER.setEnabled(on);
              SIDEBAR.addFeedItem('satellite', on ? '⚓ Marine Traffic ON — AIS vessels: tankers, cargo, naval' : 'Marine layer OFF');
              break;
            case 'hapi':
              HAPI_LAYER.setEnabled(on);
              SIDEBAR.addFeedItem('satellite', on ? '🆘 Humanitarian Crisis layer ON — HAPI/ACLED events' : 'Humanitarian crisis layer OFF');
              break;
            case 'cyber':
              CYBER_LAYER.setEnabled(on);
              SIDEBAR.addFeedItem('satellite', on ? '🛡 Cyber Threats ON — APT groups, botnet C2, CISA KEV' : 'Cyber threat layer OFF');
              break;
            case 'datacenter':
              DC_LAYER.setEnabled(on);
              SIDEBAR.addFeedItem('satellite', on ? '🖥 Data Centers ON — Cloudscene/DCByte 2024 density' : 'Data center layer OFF');
              break;
          }
        }, 120);
      });
    });
  }

  /* ── Weapons filter UI init ───────────────────────────── */
  function initWeaponsFilterUI() {
    const bar = document.getElementById('weapons-filter-bar');
    if (!bar || bar.children.length > 0) return;
    WEAPONS.FILTER_TYPES.forEach(ft => {
      const btn = document.createElement('button');
      btn.className = 'wfbtn' + (ft.id === 'all' ? ' active' : '');
      btn.dataset.wf = ft.id;
      btn.textContent = ft.emoji + ' ' + ft.label;
      btn.onclick = () => {
        WEAPONS.setFilter(ft.id);
        const total = ft.id === 'all' ? WEAPONS.getSystems().length : WEAPONS.getSystems().filter(s => s.type === ft.id).length;
        const stat = document.getElementById('weapons-stat');
        if (stat) stat.textContent = `Showing ${total} systems`;
      };
      bar.appendChild(btn);
    });
    const stat = document.getElementById('weapons-stat');
    if (stat) stat.textContent = `Showing ${WEAPONS.getSystems().length} systems`;
  }

  /* ── View switcher ────────────────────────────────────── */
  function initViewModes() {
    document.querySelectorAll('.vsw').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.vsw').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.view;
        document.getElementById('map').style.display          = 'none';
        document.getElementById('globe-container').style.display = 'none';
        document.getElementById('net-svg').style.display      = 'none';
        if (view === 'map')     { document.getElementById('map').style.display = 'block'; map.invalidateSize(); }
        else if (view === 'globe')   { document.getElementById('globe-container').style.display = 'block'; initGlobe(); }
        else if (view === 'network') { document.getElementById('net-svg').style.display = 'block'; drawNetwork(); }
      });
    });
  }

  /* ── 3D Globe – Globe.gl ──────────────────────────────── */
  let globeRetryTimer  = null;
  let globeAnimTimer   = null;   // dead-reckoning interval
  let godEyeActive     = false;
  let godEyeRegion     = 0;     // cycles through hotspots

  // Conflict hotspots for God Eye sweep
  const GOD_EYE_HOTSPOTS = [
    { label:'IRAN/ISRAEL',  lat: 32.5,  lng: 36.0,  alt: 0.9 },
    { label:'UKRAINE',      lat: 49.2,  lng: 32.0,  alt: 0.8 },
    { label:'RED SEA',      lat: 15.5,  lng: 43.0,  alt: 0.9 },
    { label:'TAIWAN STRAIT',lat: 24.5,  lng: 122.0, alt: 0.9 },
    { label:'KOREAN PENINSULA', lat: 38.0, lng: 127.5, alt: 0.9 },
    { label:'SOUTH CHINA SEA',  lat: 12.0, lng: 114.0, alt: 1.1 },
  ];

  function initGlobe() {
    const container = document.getElementById('globe-container');
    if (!container) return;

    const GlobeFn = window.Globe;
    if (!GlobeFn) { container.innerHTML = '<div style="color:#00d4ff;font:monospace;padding:60px;text-align:center">Globe.gl loading…</div>'; return; }

    if (!globe) {
      globe = GlobeFn()
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
        .showAtmosphere(true)
        .atmosphereColor('rgba(30,100,200,0.7)')
        .atmosphereAltitude(0.18)
        (container);

      globe.controls().autoRotate      = true;
      globe.controls().autoRotateSpeed = 0.35;
      globe.controls().enableDamping   = true;

      container.addEventListener('mousedown', () => {
        globe.controls().autoRotate = false;
        if (godEyeActive) { godEyeActive = false; _updateGodEyeBtn(false); }
      });

      // Inject globe controls UI
      _injectGlobeControls(container);
    }

    globe.width(container.offsetWidth).height(container.offsetHeight);

    // Force a fresh aircraft fetch when globe opens, then start animation
    AIRCRAFT.refresh().then(() => { updateGlobePoints(); startGlobeAnimation(); })
                      .catch(() => { updateGlobePoints(); startGlobeAnimation(); });

    if (arcsEnabled) applyGlobeArcs();

    clearInterval(globeTimer);
    globeTimer = setInterval(() => {
      if (document.getElementById('globe-container').style.display !== 'none') updateGlobePoints();
    }, 15_000);
  }

  function _injectGlobeControls(container) {
    if (document.getElementById('globe-ctrl-bar')) return;
    const bar = document.createElement('div');
    bar.id = 'globe-ctrl-bar';
    bar.innerHTML = `
      <button id="globe-god-eye" class="globe-ctrl-btn" title="God Eye — Lock on conflict hotspot">👁 GOD EYE</button>
      <button id="globe-rotate"  class="globe-ctrl-btn active" title="Toggle auto-rotate">⟳ ROTATE</button>
      <button id="globe-reset"   class="globe-ctrl-btn" title="Reset to global view">⊙ RESET</button>
      <span   id="globe-ac-count" class="globe-ac-badge">— AC</span>
    `;
    container.appendChild(bar);

    document.getElementById('globe-god-eye')?.addEventListener('click', toggleGodEye);
    document.getElementById('globe-rotate')?.addEventListener('click', () => {
      if (!globe) return;
      const c = globe.controls();
      c.autoRotate = !c.autoRotate;
      document.getElementById('globe-rotate')?.classList.toggle('active', c.autoRotate);
    });
    document.getElementById('globe-reset')?.addEventListener('click', () => {
      if (!globe) return;
      globe.controls().autoRotate = false;
      globe.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 1500);
      setTimeout(() => { if (globe) globe.controls().autoRotate = true; }, 2000);
    });
  }

  function _updateGodEyeBtn(on) {
    const btn = document.getElementById('globe-god-eye');
    if (!btn) return;
    btn.classList.toggle('active', on);
    btn.textContent = on ? '👁 GOD EYE ●' : '👁 GOD EYE';
  }

  function toggleGodEye() {
    if (!globe) return;
    godEyeActive = !godEyeActive;
    _updateGodEyeBtn(godEyeActive);

    if (godEyeActive) {
      globe.controls().autoRotate = false;
      _sweepGodEye();
    }
  }

  function _sweepGodEye() {
    if (!godEyeActive || !globe) return;
    const h = GOD_EYE_HOTSPOTS[godEyeRegion % GOD_EYE_HOTSPOTS.length];
    godEyeRegion++;

    // Show label
    const badge = document.getElementById('globe-ac-count');
    if (badge) badge.textContent = `👁 ${h.label}`;

    globe.pointOfView({ lat: h.lat, lng: h.lng, altitude: h.alt }, 2000);
    setTimeout(() => { if (godEyeActive) _sweepGodEye(); }, 6000);
  }

  // ── Dead-reckoning animation (smooth aircraft movement) ──
  function startGlobeAnimation() {
    if (globeAnimTimer) return;
    globeAnimTimer = setInterval(() => {
      if (!globe || document.getElementById('globe-container').style.display === 'none') return;
      const states = AIRCRAFT.getData();
      if (!states?.length) return;
      const fetchTs = AIRCRAFT.getTs() || Date.now();
      const dt      = Math.min((Date.now() - fetchTs) / 1000, 30); // cap at 30s

      const pts = states.filter(s => s[6] && s[5]).map(s => {
        let lat = s[6], lng = s[5];
        const vel = s[9] || 0;   // m/s
        const hdg = s[10] || 0;  // degrees
        // Project forward: dead reckoning (only for airborne aircraft)
        if (vel > 5 && !s[8]) {
          const h = hdg * Math.PI / 180;
          lat += (vel * Math.cos(h) / 111111) * dt;
          lng += (vel * Math.sin(h) / (111111 * Math.cos(lat * Math.PI / 180))) * dt;
        }
        const cs  = (s[1]||'').trim();
        const mil = AIRCRAFT.isMilitary(cs);
        const t   = AIRCRAFT.detectType(cs, s[8]);
        return {
          lat, lng,
          alt:   s[8] ? 0 : Math.min((s[7]||0)/600_000, 0.12),
          color: t==='drone' ? '#ff2200' : mil ? '#ff9900' : UTILS.countryColor(s[2]||''),
          label: `${cs||s[0]} [${s[2]||'?'}] ${s[7] ? Math.round(s[7]*3.281).toLocaleString() : '?'}ft`,
          size:  t==='drone' ? 1.0 : mil ? 0.85 : 0.55,
          mil,
        };
      });

      if (pts.length > 0) {
        globe.pointsData(pts)
          .pointLat(d => d.lat).pointLng(d => d.lng)
          .pointAltitude(d => d.alt)
          .pointColor(d => d.color)
          .pointRadius(d => d.size)
          .pointLabel(d => d.label)
          .pointsMerge(false).pointResolution(6);

        const acBadge = document.getElementById('globe-ac-count');
        if (acBadge && !godEyeActive) acBadge.textContent = `${pts.length} AC`;
      }
    }, 2000);   // update interpolated positions every 2s
  }

  function updateGlobePoints() {
    if (!globe) return;
    const states = AIRCRAFT.getData();

    // If no data yet, retry in 4s (first fetch may still be in flight)
    if (!states || states.length === 0) {
      clearTimeout(globeRetryTimer);
      globeRetryTimer = setTimeout(() => {
        if (globe && document.getElementById('globe-container').style.display !== 'none')
          updateGlobePoints();
      }, 4000);
      return;
    }

    // Hexbin density layer — orange towers showing traffic concentration
    const pts = states.filter(s => s[6] && s[5]).map(s => ({
      lat: s[6], lng: s[5],
      mil: AIRCRAFT.isMilitary((s[1]||'').trim()),
    }));
    globe.hexBinPointsData(pts)
      .hexBinPointLat(d => d.lat)
      .hexBinPointLng(d => d.lng)
      .hexBinPointWeight(d => d.mil ? 3 : 1)
      .hexBinResolution(3)
      .hexAltitude(d => Math.min(d.sumWeight / 600, 0.08))
      .hexBinMerge(false)
      .hexTopColor(d => `rgba(255,${d.sumWeight > 10 ? 80 : 170},0,0.9)`)
      .hexSideColor(d => `rgba(255,${d.sumWeight > 10 ? 60 : 140},0,0.25)`)
      .hexLabel(d => `${d.points.length} aircraft`);

    // Military base rings
    const rings = MILITARY.getBases().map(b => ({
      lat: b.lat, lng: b.lng,
      maxR: 1.2, propagationSpeed: 2.0,
      repeatPeriod: 1000 + Math.random()*600,
      color: () => `rgba(255,153,0,${Math.random()*0.7+0.15})`,
    }));
    globe.ringsData(rings).ringLat(d=>d.lat).ringLng(d=>d.lng)
      .ringMaxRadius(d=>d.maxR).ringColor(d=>d.color)
      .ringPropagationSpeed(d=>d.propagationSpeed)
      .ringRepeatPeriod(d=>d.repeatPeriod);
  }

  /* ── Globe conflict arcs (missile/drone strike trails) ── */
  function applyGlobeArcs() {
    if (!globe) return;
    const arcs = CONFLICT.getArcs().filter(a => a.active);
    globe.arcsData(arcs)
      .arcStartLat(d => d.startLat)
      .arcStartLng(d => d.startLng)
      .arcEndLat(d => d.endLat)
      .arcEndLng(d => d.endLng)
      .arcColor(d => [d.color, `${d.color}00`])
      .arcAltitude(d => d.alt)
      .arcStroke(d => d.stroke)
      .arcDashLength(0.3)
      .arcDashGap(0.12)
      .arcDashAnimateTime(d => d.speed)
      .arcLabel(d => d.label);
  }

  function clearGlobeArcs() {
    if (!globe) return;
    globe.arcsData([]);
  }

  /* ── CRT scanline + barrel distortion + phosphor noise ── */
  function initCRT() {
    const canvas = document.getElementById('crt-canvas');
    const ctx    = canvas.getContext('2d');

    function resizeCRT() {
      const wrap  = document.getElementById('map-wrap');
      canvas.width  = wrap.offsetWidth;
      canvas.height = wrap.offsetHeight;
    }
    resizeCRT();
    window.addEventListener('resize', resizeCRT);

    function drawNoise() {
      if (!crtActive) { ctx.clearRect(0, 0, canvas.width, canvas.height); crtAnimFrame = null; return; }
      crtAnimFrame = requestAnimationFrame(drawNoise);

      const W = canvas.width, H = canvas.height;
      const imgData = ctx.createImageData(W, H);
      const d = imgData.data;

      // Sparse noise dots
      for (let i = 0; i < W * H * 4; i += 4) {
        const n = Math.random();
        if (n > 0.998) {
          const g = Math.floor(Math.random() * 200 + 55);
          d[i]   = 0;
          d[i+1] = g;
          d[i+2] = Math.floor(g * 0.3);
          d[i+3] = Math.floor(Math.random() * 140 + 80);
        } else {
          d[i+3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Rolling scan bar
      const t    = Date.now() * 0.0008;
      const barY = (t % 1) * H;
      const grad = ctx.createLinearGradient(0, barY - 40, 0, barY + 6);
      grad.addColorStop(0, 'rgba(0,255,65,0)');
      grad.addColorStop(0.6, 'rgba(0,255,65,0.06)');
      grad.addColorStop(1, 'rgba(0,255,65,0.18)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, barY - 40, W, 46);
    }

    return drawNoise;
  }

  let crtDraw = null;

  function toggleCRT() {
    crtActive = !crtActive;
    document.body.classList.toggle('crt-active', crtActive);
    const btn = document.getElementById('crt-btn');
    btn.classList.toggle('active', crtActive);

    if (crtActive) {
      if (!crtDraw) crtDraw = initCRT();
      crtDraw();
      SIDEBAR.addFeedItem('satellite', 'CRT mode ON — phosphor scanline effect active');
    } else {
      if (crtAnimFrame) { cancelAnimationFrame(crtAnimFrame); crtAnimFrame = null; }
      const canvas = document.getElementById('crt-canvas');
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      SIDEBAR.addFeedItem('satellite', 'CRT mode OFF');
    }
  }

  /* ── D3 Network ──────────────────────────────────────── */
  function drawNetwork() {
    const svg = d3.select('#net-svg');
    svg.selectAll('*').remove();
    const W = parseInt(svg.style('width'))||800, H = parseInt(svg.style('height'))||600;
    const bases = MILITARY.getBases();
    const byCountry = {};
    bases.forEach(b => { if (!byCountry[b.country]) byCountry[b.country]=0; byCountry[b.country]++; });
    const nodes = Object.entries(byCountry).map(([id, count]) => ({ id, count, color: UTILS.countryColor(id), flag: UTILS.countryFlag(id) }));
    const ALLIANCES = [['USA','United Kingdom'],['USA','France'],['USA','Germany'],['USA','Japan'],['USA','South Korea'],['USA','Australia'],['USA','Israel'],['USA','Turkey'],['Russia','China'],['Russia','Iran'],['China','North Korea'],['Russia','North Korea'],['United Kingdom','France'],['USA','Canada'],['USA','NATO'],['NATO','France'],['NATO','United Kingdom'],['NATO','Germany'],['NATO','Turkey']];
    const links = ALLIANCES.filter(([s,t])=>byCountry[s]&&byCountry[t]).map(([source,target])=>({source,target}));
    const sim = d3.forceSimulation(nodes).force('link',d3.forceLink(links).id(d=>d.id).distance(130)).force('charge',d3.forceManyBody().strength(-320)).force('center',d3.forceCenter(W/2,H/2)).force('collision',d3.forceCollide(32));
    const g = svg.append('g');
    svg.call(d3.zoom().on('zoom',({transform})=>g.attr('transform',transform)));
    const link = g.append('g').selectAll('line').data(links).join('line').style('stroke','rgba(0,212,255,0.25)').style('stroke-width',1);
    const node = g.append('g').selectAll('g').data(nodes).join('g').call(d3.drag().on('start',(e,d)=>{if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;}).on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y;}).on('end',(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}));
    node.append('circle').attr('r',d=>8+Math.sqrt(d.count)*3).attr('fill',d=>d.color+'22').attr('stroke',d=>d.color).attr('stroke-width',1.5).style('filter',d=>`drop-shadow(0 0 6px ${d.color})`);
    node.append('text').attr('dy',d=>-(12+Math.sqrt(d.count)*3)).attr('text-anchor','middle').style('font-size','9px').style('fill','#c8dff0').text(d=>`${d.flag} ${d.id}`);
    node.append('text').attr('dy',4).attr('text-anchor','middle').style('font-size','10px').style('fill','#c8dff0').text(d=>d.count);
    sim.on('tick',()=>{link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);node.attr('transform',d=>`translate(${d.x},${d.y})`);});
  }

  /* ── Fly-to ───────────────────────────────────────────── */
  function flyTo(lat, lng, zoom = 7) {
    if (!map) return;
    const view = document.querySelector('.vsw.active')?.dataset?.view;
    if (view === 'globe' && globe) {
      globe.pointOfView({ lat, lng, altitude: 2.5 }, 1500);
    } else {
      map.flyTo([lat, lng], zoom, { duration: 1.5 });
    }
  }

  function resetView() { map?.flyTo([20,0],3,{duration:1.5}); if (globe) globe.pointOfView({lat:20,lng:0,altitude:2.5},1500); }

  /* ── Mobile panel helper ──────────────────────────────── */
  function showMobilePanel(panel) {
    if (panel === 'left') {
      document.getElementById('left-panel')?.classList.toggle('mob-open');
    } else {
      // Switch right panel tab
      const tabMap = { news:'news', reddit:'reddit', sources:'sources', intel:'intel' };
      const rptab = tabMap[panel];
      if (rptab) {
        document.querySelectorAll('.rptab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.rp-tab-body').forEach(b => b.style.display = 'none');
        const btn  = document.querySelector(`.rptab[data-rptab="${rptab}"]`);
        const body = document.getElementById(`rptab-${rptab}`);
        if (btn)  btn.classList.add('active');
        if (body) body.style.display = 'block';
        document.getElementById('right-panel')?.classList.add('mob-open');
      }
    }
  }

  /* ── Boot ─────────────────────────────────────────────── */
  function boot() {
    map = initMap();
    EFFECTS.initClock();
    EFFECTS.initCoordHud(map);
    SIDEBAR.init();
    MILITARY.init(map);
    FIRES.init(map);
    AIRCRAFT.init(map);
    SATELLITES.init(map);
    WEAPONS.init(map);
    SWARM.init(map);
    OIL.init(map);
    MARKETS.init();
    HEATMAP.init(map);
    USBASES.init(map);
    CABLES.init(map);
    OUTAGE.init(map);
    OVERLAYS.init(map);
    LEADERS.init(map);
    SIMULATION.init();
    MARINE_LAYER.init(map);
    HAPI_LAYER.init(map);
    CYBER_LAYER.init(map);
    DC_LAYER.init(map);
    // Register overlays with the MAP CTRL panel toggles
    OVERLAYS.registerOverlay('leaders', LEADERS);
    OVERLAYS.registerOverlay('cables',  CABLES);
    OVERLAYS.registerOverlay('outage',  OUTAGE);
    OVERLAYS.registerOverlay('oil',     OIL);
    initLayerControls();
    initViewModes();

    document.getElementById('nv-btn')?.addEventListener('click', EFFECTS.toggleNightVision);
    document.getElementById('crt-btn')?.addEventListener('click', toggleCRT);
    document.getElementById('reset-btn')?.addEventListener('click', resetView);

    // Close mobile panels when tapping map
    document.getElementById('map')?.addEventListener('click', () => {
      document.getElementById('left-panel')?.classList.remove('mob-open');
      document.getElementById('right-panel')?.classList.remove('mob-open');
    });

    initWebSocket();

    SIDEBAR.addFeedItem('satellite', '🌍 SPYMETER online — OpenSky ADS-B + CelesTrak TLE active');
    SIDEBAR.addFeedItem('aircraft',  '✈ Fetching live ADS-B from OpenSky Network…');
    SIDEBAR.addFeedItem('military',  `⬡ ${MILITARY.getBases().length} military bases loaded | India nuclear sites visible`);
    SIDEBAR.addFeedItem('satellite', '⚔ New layers: ⚓ MARINE · 🆘 CRISES · 🛡 CYBER · 🖥 DC available in layer bar');
  }

  document.addEventListener('DOMContentLoaded', boot);
  return { flyTo, resetView, showMobilePanel };
})();

/* ── Marine Traffic Layer ───────────────────────────────────
   AIS vessel tracking — tankers, container ships, naval     */
const MARINE_LAYER = (() => {
  let map = null, enabled = false, markers = [], refreshTimer = null;
  const VESSEL_ICONS = {
    tanker:    { color:'#ff9900', emoji:'🛢', size: 9 },
    container: { color:'#00d4ff', emoji:'📦', size: 8 },
    naval:     { color:'#ff3344', emoji:'⚓', size:10 },
    carrier:   { color:'#ff0000', emoji:'✈', size:12 },
    cable:     { color:'#9b59ff', emoji:'🔌', size: 8 },
    cargo:     { color:'#00ff88', emoji:'🚢', size: 8 },
  };
  function _fetchAndRender() {
    if (!enabled || !map) return;
    fetch('/api/marine').then(r => r.json()).then(d => {
      markers.forEach(m => map.removeLayer(m)); markers = [];
      (d.vessels || []).forEach(v => {
        const ic = VESSEL_ICONS[v.type] || VESSEL_ICONS.cargo;
        const icon = L.divIcon({
          html: `<div style="font-size:${ic.size}px;color:${ic.color};text-shadow:0 0 6px ${ic.color};transform:rotate(${v.hdg||0}deg)">${ic.emoji}</div>`,
          className:'', iconSize:[20,20], iconAnchor:[10,10]
        });
        const col = v.severity==='critical'?'#ff2222': v.severity==='high'?'#ff8800':'#888';
        const popup = `<div style="font-family:monospace;font-size:9px;background:#07090e;border:1px solid #1e3a5f;padding:6px 10px;border-radius:3px">
          <b style="color:${ic.color}">${ic.emoji} ${v.name}</b><br>
          Type: <span style="color:${ic.color}">${v.type.toUpperCase()}</span><br>
          Route: ${v.route||'—'}<br>
          Cargo: <span style="color:#ffaa00">${v.cargo||'—'}</span><br>
          Speed: ${v.speed||0} kts · HDG: ${v.hdg||0}° ${v.flag||''}<br>
          <span style="color:${col}">Severity: ${(v.severity||'normal').toUpperCase()}</span>
        </div>`;
        const mk = L.marker([v.lat, v.lng], { icon })
          .bindPopup(popup, { className:'leaflet-popup-dark' }).addTo(map);
        mk.on('click', () => {
          if (typeof fetchGeoIntelPhotos === 'function') fetchGeoIntelPhotos(v.lat, v.lng, v.name + ' ' + v.type);
        });
        markers.push(mk);
      });
    }).catch(() => {});
  }
  return {
    init(m) { map = m; },
    setEnabled(on) {
      enabled = on;
      if (on) { _fetchAndRender(); refreshTimer = setInterval(_fetchAndRender, 60_000); }
      else { clearInterval(refreshTimer); markers.forEach(m => map?.removeLayer(m)); markers = []; }
    }
  };
})();

/* ── HAPI Humanitarian Crisis Layer ────────────────────────
   ACLED/UNOCHA events via HAPI HumanData API               */
const HAPI_LAYER = (() => {
  let map = null, enabled = false, markers = [];
  function _fetchAndRender() {
    if (!enabled || !map) return;
    fetch('/api/hapi-events').then(r => r.json()).then(d => {
      markers.forEach(m => map.removeLayer(m)); markers = [];
      (d.events || []).forEach(ev => {
        const sev = ev.severity || 'medium';
        const col = sev==='critical'?'#ff0000': sev==='high'?'#ff8800': '#ffaa00';
        const r   = sev==='critical'?14: sev==='high'?10:7;
        const circle = L.circleMarker([ev.lat, ev.lng], {
          radius:r, color:col, fillColor:col, fillOpacity:0.2, weight:1.5, opacity:0.8
        });
        const deaths = ev.fatalities ? `<br>Deaths: <b style="color:#ff4444">${ev.fatalities.toLocaleString()}</b>` : '';
        circle.bindPopup(`<div style="font-family:monospace;font-size:9px;background:#07090e;border:1px solid ${col};padding:6px 10px;border-radius:3px">
          <b style="color:${col}">🆘 ${ev.country||''}</b><br>${ev.desc||''}${deaths}
          <br><span style="color:#3d5a78;font-size:8px">${ev.source||''} · ${ev.date||''}</span>
        </div>`, { className:'leaflet-popup-dark' });
        circle.addTo(map); markers.push(circle);
      });
    }).catch(() => {});
  }
  return {
    init(m) { map = m; },
    setEnabled(on) {
      enabled = on;
      if (on) _fetchAndRender();
      else { markers.forEach(m => map?.removeLayer(m)); markers = []; }
    }
  };
})();

/* ── Cyber Threat Layer ─────────────────────────────────────
   APT groups, botnet C2 IPs, CISA KEV — heatmap + markers  */
const CYBER_LAYER = (() => {
  let map = null, enabled = false, markers = [];
  function _fetchAndRender() {
    if (!enabled || !map) return;
    fetch('/api/cyber-threats').then(r => r.json()).then(d => {
      markers.forEach(m => map.removeLayer(m)); markers = [];
      const threats = d.threats || [];
      const maxC = Math.max(...threats.map(t => t.count||1), 1);
      threats.forEach(t => {
        const ratio  = (t.count||1) / maxC;
        const radius = 6 + Math.round(ratio * 22);
        const col    = ratio > 0.7 ? '#ff0000' : ratio > 0.4 ? '#ff8800' : '#ffdd00';
        const circle = L.circleMarker([t.lat, t.lng], {
          radius, color:col, fillColor:col, fillOpacity:0.15+ratio*0.2, weight:1.5, opacity:0.7
        });
        circle.bindPopup(`<div style="font-family:monospace;font-size:9px;background:#07090e;border:1px solid ${col};padding:6px 10px;border-radius:3px">
          <b style="color:${col}">🛡 ${t.country}</b><br>
          Active threats: <b>${t.count}</b><br>
          Types: ${t.types||'—'}<br>
          <span style="color:#3d5a78;font-size:8px">Source: ${t.source||'OSINT'}</span>
        </div>`, { className:'leaflet-popup-dark' });
        circle.addTo(map); markers.push(circle);
      });
      if (d.kev_count) SIDEBAR.addFeedItem('satellite', `🛡 CISA KEV: ${d.kev_count} known exploited vulnerabilities tracked`);
    }).catch(() => {});
  }
  return {
    init(m) { map = m; },
    setEnabled(on) {
      enabled = on;
      if (on) _fetchAndRender();
      else { markers.forEach(m => map?.removeLayer(m)); markers = []; }
    }
  };
})();

/* ── Data Center Density Layer ──────────────────────────────
   Cloudscene/DCByte 2024 — bubble map by country count      */
const DC_LAYER = (() => {
  let map = null, enabled = false, markers = [];
  function _fetchAndRender() {
    if (!enabled || !map) return;
    fetch('/api/datacenter-stats').then(r => r.json()).then(d => {
      markers.forEach(m => map.removeLayer(m)); markers = [];
      const dcs  = d.datacenters || [];
      const maxD = Math.max(...dcs.map(dc => dc.count||0), 1);
      dcs.forEach(dc => {
        if (!dc.lat || !dc.lng) return;
        const radius = 5 + Math.round((dc.count / maxD) * 28);
        const col    = '#00d4ff';
        const circle = L.circleMarker([dc.lat, dc.lng], {
          radius, color:col, fillColor:col, fillOpacity:0.15, weight:1.5, opacity:0.7
        });
        circle.bindPopup(`<div style="font-family:monospace;font-size:9px;background:#07090e;border:1px solid ${col};padding:6px 10px;border-radius:3px">
          <b style="color:${col}">🖥 ${dc.country}</b><br>
          Data Centers: <b style="color:#00d4ff">${dc.count.toLocaleString()}</b><br>
          <span style="font-size:8px">${dc.note||''}</span><br>
          <span style="color:#3d5a78;font-size:8px">${d.source||'Cloudscene 2024'}</span>
        </div>`, { className:'leaflet-popup-dark' });
        circle.addTo(map); markers.push(circle);
      });
      // Update left panel card list
      const list = document.getElementById('dc-stats-list');
      if (list) {
        list.innerHTML = dcs.sort((a,b) => (b.count||0)-(a.count||0)).slice(0,12).map(dc =>
          `<div class="india-zone-row" onclick="APP.flyTo(${dc.lat||0},${dc.lng||0},4)">
            <div class="iz-flag">🖥</div>
            <div class="iz-info"><div class="iz-country">${dc.country}</div>
              <div class="iz-advisory" style="color:#00d4ff">${dc.region||''}</div></div>
            <div class="iz-nums"><div class="iz-total" style="color:#00d4ff">${dc.count}</div>
              <div class="iz-label">DCs</div></div>
          </div>`).join('');
      }
    }).catch(() => {});
  }
  return {
    init(m) { map = m; },
    setEnabled(on) {
      enabled = on;
      if (on) _fetchAndRender();
      else { markers.forEach(m => map?.removeLayer(m)); markers = []; }
    }
  };
})();
