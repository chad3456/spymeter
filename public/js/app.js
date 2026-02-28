/* ── Main application orchestrator ───────────────────────
   Boots all modules, wires controls, manages WebSocket.   */
const APP = (() => {
  let map = null;
  let ws  = null;

  /* ── Map initialization ─────────────────────────────── */
  function initMap() {
    map = L.map('map', {
      center:         [20, 0],
      zoom:           3,
      zoomControl:    false,
      attributionControl: true,
      preferCanvas:   true,
      worldCopyJump:  true,
    });

    // Dark base tiles – CartoDB Dark Matter (free, no API key)
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors © <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(map);

    // Zoom control (bottom-right)
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    return map;
  }

  /* ── WebSocket real-time updates ────────────────────── */
  function initWebSocket() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url   = `${proto}//${location.host}`;

    function connect() {
      ws = new WebSocket(url);

      ws.onopen = () => {
        EFFECTS.setWsStatus('connected');
        SIDEBAR.addFeedItem('satellite', 'WebSocket connected – live feed active');
      };

      ws.onmessage = ({ data }) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'aircraft') AIRCRAFT.handleWSUpdate(msg.data);
        } catch (_) {}
      };

      ws.onclose = () => {
        EFFECTS.setWsStatus('reconnecting');
        setTimeout(connect, 4000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
  }

  /* ── Layer toggle buttons ───────────────────────────── */
  function initLayerControls() {
    document.querySelectorAll('.lbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layer = btn.dataset.layer;
        const on    = btn.classList.toggle('active');

        switch (layer) {
          case 'aircraft':
            AIRCRAFT.setEnabled(on);
            break;
          case 'satellites':
            SATELLITES.setEnabled(on);
            break;
          case 'military':
            MILITARY.setEnabled('military', on);
            break;
          case 'nuclear':
            MILITARY.setEnabled('nuclear', on);
            SIDEBAR.addFeedItem('military', on ? 'Nuclear sites overlay ON' : 'Nuclear sites overlay OFF');
            break;
          case 'gpsjam':
            MILITARY.setEnabled('gpsjam', on);
            break;
          case 'swarm':
            SWARM.setEnabled(on);
            SIDEBAR.addFeedItem('satellite', on ? 'Swarm visualization ON' : 'Swarm visualization OFF');
            break;
        }
      });
    });
  }

  /* ── View mode switcher ─────────────────────────────── */
  function initViewModes() {
    document.querySelectorAll('.vsw').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        document.querySelectorAll('.vsw').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const mapEl    = document.getElementById('map');
        const globeEl  = document.getElementById('globe-canvas');
        const netEl    = document.getElementById('net-svg');

        if (view === 'map') {
          mapEl.style.display   = 'block';
          globeEl.style.display = 'none';
          netEl.style.display   = 'none';
        } else if (view === 'globe') {
          mapEl.style.display   = 'none';
          globeEl.style.display = 'block';
          netEl.style.display   = 'none';
          drawGlobe();
        } else if (view === 'network') {
          mapEl.style.display   = 'none';
          globeEl.style.display = 'none';
          netEl.style.display   = 'block';
          drawNetwork();
        }
      });
    });
  }

  /* ── Globe view (canvas projection) ─────────────────── */
  function drawGlobe() {
    const canvas = document.getElementById('globe-canvas');
    const ctx    = canvas.getContext('2d');
    const W      = canvas.offsetWidth;
    const H      = canvas.offsetHeight;
    canvas.width  = W;
    canvas.height = H;

    const R = Math.min(W, H) * 0.38;
    const cx = W/2, cy = H/2;
    let rot = 0;

    function frame() {
      if (document.getElementById('globe-canvas').style.display === 'none') return;
      requestAnimationFrame(frame);
      ctx.fillStyle = '#040608';
      ctx.fillRect(0, 0, W, H);
      rot += 0.003;

      // Globe circle
      const grd = ctx.createRadialGradient(cx-R*0.3, cy-R*0.3, R*0.1, cx, cy, R);
      grd.addColorStop(0, '#0d2040');
      grd.addColorStop(1, '#020810');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI*2);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth   = 1;
      ctx.stroke();

      // Grid lines
      ctx.strokeStyle = 'rgba(0,212,255,0.08)';
      ctx.lineWidth   = 0.5;
      for (let lat = -80; lat <= 80; lat += 20) {
        const y = cy + R * Math.sin(lat * Math.PI/180);
        const r2 = R * Math.cos(lat * Math.PI/180);
        ctx.beginPath();
        ctx.ellipse(cx, y, r2, r2*0.15, 0, 0, Math.PI*2);
        ctx.stroke();
      }
      for (let lng = 0; lng < 360; lng += 30) {
        const a = (lng + rot * 180/Math.PI) * Math.PI/180;
        ctx.beginPath();
        ctx.moveTo(cx + R*Math.cos(a), cy - R);
        ctx.bezierCurveTo(
          cx + R*Math.cos(a)*1.05, cy,
          cx + R*Math.cos(a+Math.PI)*1.05, cy,
          cx + R*Math.cos(a+Math.PI), cy + R
        );
        ctx.stroke();
      }

      // Plot aircraft on globe
      const states = AIRCRAFT.getData();
      states.slice(0, 400).forEach(s => {
        if (!s[6] || !s[5]) return;
        const lat = s[6] * Math.PI/180;
        const lng = s[5] * Math.PI/180 + rot;

        const x3 = Math.cos(lat) * Math.sin(lng);
        const y3 = Math.sin(lat);
        const z3 = Math.cos(lat) * Math.cos(lng);

        if (z3 < 0) return; // behind globe

        const px = cx + x3 * R;
        const py = cy - y3 * R;
        const country = s[2] || '';
        const color   = UTILS.countryColor(country);

        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI*2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI*2);
        ctx.fillStyle = color + '30';
        ctx.fill();
      });

      // Plot satellites
      // (simplified – just dots)
      ctx.fillStyle = '#00ff88';
      ctx.font = '8px monospace';
    }
    frame();
  }

  /* ── Network graph (D3 force-directed) ───────────────── */
  function drawNetwork() {
    const svg  = d3.select('#net-svg');
    svg.selectAll('*').remove();
    const W = parseInt(svg.style('width'));
    const H = parseInt(svg.style('height'));

    // Build nodes from military bases by country
    const bases  = MILITARY.getBases();
    const byCountry = {};
    bases.forEach(b => {
      if (!byCountry[b.country]) byCountry[b.country] = 0;
      byCountry[b.country]++;
    });

    const nodes = Object.entries(byCountry).map(([id, count]) => ({
      id, count,
      color: UTILS.countryColor(id),
      flag:  UTILS.countryFlag(id)
    }));

    // Edges – alliances
    const ALLIANCES = [
      ['USA','United Kingdom'],['USA','France'],['USA','Germany'],
      ['USA','Japan'],['USA','South Korea'],['USA','Australia'],
      ['USA','Israel'],['USA','Turkey'],['USA','Italy'],
      ['Russia','China'],['Russia','Iran'],['China','North Korea'],
      ['Russia','North Korea'],['United Kingdom','France'],
      ['USA','Canada'],['USA','NATO'],['NATO','France'],
      ['NATO','United Kingdom'],['NATO','Germany'],['NATO','Turkey'],
    ];

    const links = ALLIANCES
      .filter(([s,t]) => byCountry[s] && byCountry[t])
      .map(([source, target]) => ({ source, target }));

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(W/2, H/2))
      .force('collision', d3.forceCollide(30));

    const g = svg.append('g');

    // Zoom
    svg.call(d3.zoom().on('zoom', ({transform}) => g.attr('transform', transform)));

    // Links
    const link = g.append('g').selectAll('line')
      .data(links).join('line')
      .attr('class','link')
      .style('stroke', 'rgba(0,212,255,0.25)')
      .style('stroke-width', 1);

    // Nodes
    const node = g.append('g').selectAll('g')
      .data(nodes).join('g')
      .call(d3.drag()
        .on('start', (e,d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
        .on('drag',  (e,d) => { d.fx=e.x; d.fy=e.y; })
        .on('end',   (e,d) => { if (!e.active) sim.alphaTarget(0); d.fx=null; d.fy=null; }));

    node.append('circle')
      .attr('r', d => 8 + Math.sqrt(d.count) * 3)
      .attr('fill', d => d.color + '33')
      .attr('stroke', d => d.color)
      .attr('stroke-width', 1.5)
      .attr('class','node-circle')
      .style('filter', d => `drop-shadow(0 0 6px ${d.color})`);

    node.append('text')
      .attr('class','node-label')
      .attr('dy', d => -(10 + Math.sqrt(d.count)*3))
      .attr('text-anchor', 'middle')
      .style('font-size', '9px')
      .style('fill', '#c8dff0')
      .text(d => `${d.flag} ${d.id}`);

    node.append('text')
      .attr('dy', 4)
      .attr('text-anchor','middle')
      .style('font-size','10px')
      .style('fill','#c8dff0')
      .text(d => d.count);

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    svg.append('text')
      .attr('x', 10).attr('y', 20)
      .style('fill','rgba(0,212,255,0.4)')
      .style('font-family','monospace').style('font-size','10px')
      .text('MILITARY ALLIANCE NETWORK — drag nodes to interact');
  }

  /* ── Fly-to helper (called from sidebar item clicks) ─ */
  function flyTo(lat, lng) {
    if (!map) return;
    map.flyTo([lat, lng], 6, { duration: 1.5 });
  }

  /* ── Reset view ─────────────────────────────────────── */
  function resetView() {
    map?.flyTo([20, 0], 3, { duration: 1.5 });
  }

  /* ── Boot ───────────────────────────────────────────── */
  function boot() {
    map = initMap();

    EFFECTS.initClock();
    EFFECTS.initCoordHud(map);
    SIDEBAR.init();

    // Init feature modules
    MILITARY.init(map);
    AIRCRAFT.init(map);
    SATELLITES.init(map);
    SWARM.init(map);

    // Wire controls
    initLayerControls();
    initViewModes();

    document.getElementById('nv-btn')?.addEventListener('click', EFFECTS.toggleNightVision);
    document.getElementById('reset-btn')?.addEventListener('click', resetView);

    // Theme toggle (light/dark)
    document.getElementById('theme-btn')?.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
    });

    // WebSocket
    initWebSocket();

    // Boot message
    SIDEBAR.addFeedItem('satellite', 'OSINT Globe Tracker initialized — all systems nominal');
    SIDEBAR.addFeedItem('aircraft',  'Fetching live ADS-B data from OpenSky Network…');
    SIDEBAR.addFeedItem('satellite', 'Loading CelesTrak TLE orbital data…');

    console.log('%c OSINT GLOBE TRACKER ', 'background:#00d4ff;color:#000;font-size:14px;font-weight:bold;');
    console.log('%c Live aircraft • Satellites • Military • Nuclear ', 'color:#00ff88;');
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { flyTo, resetView };
})();
