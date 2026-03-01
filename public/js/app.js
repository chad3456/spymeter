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

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© OSM © CARTO', subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 19, pane: 'shadowPane',
    }).addTo(map);

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

  /* ── Layer controls ───────────────────────────────────── */
  function initLayerControls() {
    document.querySelectorAll('.lbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.dataset.layer;
        const on    = btn.classList.toggle('active');
        switch (layer) {
          case 'aircraft':   AIRCRAFT.setEnabled(on); break;
          case 'satellites': SATELLITES.setEnabled(on); break;
          case 'military':   MILITARY.setEnabled('military', on); break;
          case 'nuclear':    MILITARY.setEnabled('nuclear', on); SIDEBAR.addFeedItem('military', on ? '☢ Nuclear overlay ON' : 'Nuclear overlay OFF'); break;
          case 'gpsjam':     MILITARY.setEnabled('gpsjam', on); break;
          case 'fires':      FIRES.setEnabled(on); break;
          case 'swarm':      SWARM.setEnabled(on); break;
          case 'airspace':   MILITARY.setEnabled('gpsjam', on); break;
          case 'conflict':
            btn.classList.toggle('active', true);
            CONFLICT.toggle();
            break;
          case 'arcs':
            arcsEnabled = on;
            if (globe) { on ? applyGlobeArcs() : clearGlobeArcs(); }
            SIDEBAR.addFeedItem('military', on ? '🚀 Strike arc trails ON — switch to GLOBE view' : 'Strike arcs OFF');
            break;
        }
      });
    });
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

      container.addEventListener('mousedown', () => { globe.controls().autoRotate = false; });
    }

    globe.width(container.offsetWidth).height(container.offsetHeight);
    updateGlobePoints();

    if (arcsEnabled) applyGlobeArcs();

    clearInterval(globeTimer);
    globeTimer = setInterval(() => {
      if (document.getElementById('globe-container').style.display !== 'none') updateGlobePoints();
    }, 15_000);
  }

  function updateGlobePoints() {
    if (!globe) return;
    const states = AIRCRAFT.getData();
    const pts = states.filter(s => s[6] && s[5]).map(s => {
      const cs  = (s[1]||'').trim();
      const mil = AIRCRAFT.isMilitary(cs);
      const t   = AIRCRAFT.detectType(cs, s[8]);
      return {
        lat:   s[6], lng: s[5],
        alt:   Math.min((s[7]||0)/900_000, 0.1),
        color: t==='drone' ? '#ff2200' : mil ? '#ff9900' : UTILS.countryColor(s[2]||''),
        label: `${cs||s[0]} [${s[2]||'?'}] ${s[7] ? Math.round(s[7]*3.281).toLocaleString() : '?'}ft`,
        size:  mil ? 0.4 : 0.22,
      };
    });

    globe.pointsData(pts)
      .pointLat(d => d.lat).pointLng(d => d.lng)
      .pointAltitude(d => d.alt)
      .pointColor(d => d.color)
      .pointRadius(d => d.size)
      .pointLabel(d => d.label);

    // Military base rings
    const rings = MILITARY.getBases().map(b => ({
      lat: b.lat, lng: b.lng,
      maxR: 0.8, propagationSpeed: 1.5,
      repeatPeriod: 1200 + Math.random()*800,
      color: () => `rgba(255,153,0,${Math.random()*0.6+0.1})`,
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
    SWARM.init(map);
    initLayerControls();
    initViewModes();

    document.getElementById('nv-btn')?.addEventListener('click', EFFECTS.toggleNightVision);
    document.getElementById('crt-btn')?.addEventListener('click', toggleCRT);
    document.getElementById('reset-btn')?.addEventListener('click', resetView);

    initWebSocket();

    SIDEBAR.addFeedItem('satellite', '🌍 SPYMETER initialized — OpenSky ADS-B + CelesTrak TLE active');
    SIDEBAR.addFeedItem('aircraft',  'Fetching live ADS-B from OpenSky Network (15s cadence)…');
    SIDEBAR.addFeedItem('military',  `${MILITARY.getBases().length} military bases loaded | SIPRI nuclear db ready`);
    SIDEBAR.addFeedItem('satellite', 'GDELT news feed active — 3-minute refresh cycle');
  }

  document.addEventListener('DOMContentLoaded', boot);
  return { flyTo, resetView };
})();
