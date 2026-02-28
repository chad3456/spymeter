/* ── Main application orchestrator ───────────────────────
   Boots all modules, wires controls, manages WebSocket.
   Globe powered by Globe.gl (WebGL).                      */
const APP = (() => {
  let map    = null;
  let ws     = null;
  let globe  = null;          // Globe.gl instance
  let globeRefreshTimer = null;

  /* ── Map initialization ─────────────────────────────── */
  function initMap() {
    map = L.map('map', {
      center:           [20, 0],
      zoom:             3,
      zoomControl:      false,
      attributionControl: true,
      preferCanvas:     true,
      worldCopyJump:    true,
    });

    // Dark base tile layer with labels visible
    const darkTiles = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
        subdomains:  'abcd',
        maxZoom:     19,
        opacity:     1,
      }
    ).addTo(map);

    // Labels on top (so they appear above all other overlays)
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom:    19,
        pane:       'shadowPane', // render above markers
        opacity:    1,
      }
    ).addTo(map);

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
        SIDEBAR.addFeedItem('satellite', 'WebSocket connected – live ADS-B feed active');
      };

      ws.onmessage = ({ data }) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'aircraft') {
            AIRCRAFT.handleWSUpdate(msg.data);
            if (globe) updateGlobePoints();
          }
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
            SIDEBAR.addFeedItem('aircraft', on ? 'Aircraft layer ON' : 'Aircraft layer OFF');
            break;
          case 'satellites':
            SATELLITES.setEnabled(on);
            SIDEBAR.addFeedItem('satellite', on ? 'Satellite layer ON' : 'Satellite layer OFF');
            break;
          case 'military':
            MILITARY.setEnabled('military', on);
            SIDEBAR.addFeedItem('military', on ? 'Military bases overlay ON' : 'Military bases overlay OFF');
            break;
          case 'nuclear':
            MILITARY.setEnabled('nuclear', on);
            SIDEBAR.addFeedItem('military', on ? '☢ Nuclear sites overlay ON' : 'Nuclear sites overlay OFF');
            break;
          case 'gpsjam':
            MILITARY.setEnabled('gpsjam', on);
            SIDEBAR.addFeedItem('military', on ? '⊗ GPS jamming zones ON' : 'GPS jamming zones OFF');
            break;
          case 'fires':
            FIRES.setEnabled(on);
            break;
          case 'swarm':
            SWARM.setEnabled(on);
            SIDEBAR.addFeedItem('satellite', on ? 'Swarm visualization ON' : 'Swarm visualization OFF');
            break;
          case 'airspace':
            SIDEBAR.addFeedItem('aircraft', on ? '▦ Airspace overlay ON (showing GPS jam zones)' : 'Airspace overlay OFF');
            MILITARY.setEnabled('gpsjam', on);
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
        const globeEl  = document.getElementById('globe-container');
        const netEl    = document.getElementById('net-svg');

        mapEl.style.display   = 'none';
        globeEl.style.display = 'none';
        netEl.style.display   = 'none';

        if (view === 'map') {
          mapEl.style.display = 'block';
          map.invalidateSize();
        } else if (view === 'globe') {
          globeEl.style.display = 'block';
          initGlobe();
        } else if (view === 'network') {
          netEl.style.display = 'block';
          drawNetwork();
        }
      });
    });
  }

  /* ── 3D Globe – Globe.gl ────────────────────────────── */
  function initGlobe() {
    const container = document.getElementById('globe-container');
    if (!container) return;

    if (!globe) {
      // Globe.gl is exposed as the `Globe` global from the CDN build
      const GlobeFn = window.Globe || (typeof Globe !== 'undefined' ? Globe : null);
      if (!GlobeFn) {
        container.innerHTML = '<div style="color:#00d4ff;font-family:monospace;padding:40px;text-align:center">Globe.gl loading…</div>';
        return;
      }

      globe = GlobeFn()
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
        .showAtmosphere(true)
        .atmosphereColor('rgba(30,100,200,0.7)')
        .atmosphereAltitude(0.18)
        (container);

      // Auto-rotate
      globe.controls().autoRotate      = true;
      globe.controls().autoRotateSpeed = 0.4;
      globe.controls().enableDamping   = true;

      // Ring click to stop auto-rotate
      container.addEventListener('mousedown', () => {
        globe.controls().autoRotate = false;
      });
    }

    // Fit to container
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    globe.width(w).height(h);

    updateGlobePoints();

    // Refresh globe data every 15 s while visible
    clearInterval(globeRefreshTimer);
    globeRefreshTimer = setInterval(() => {
      if (document.getElementById('globe-container').style.display !== 'none') {
        updateGlobePoints();
      }
    }, 15_000);
  }

  function updateGlobePoints() {
    if (!globe) return;

    // Aircraft points
    const states = AIRCRAFT.getData();
    const acPoints = states
      .filter(s => s[6] && s[5])
      .map(s => {
        const cs    = (s[1] || '').trim();
        const type  = AIRCRAFT.detectType(cs, s[8]);
        const isMil = AIRCRAFT.isMilitary(cs);
        return {
          lat:   s[6],
          lng:   s[5],
          alt:   Math.min((s[7] || 0) / 1_000_000, 0.08), // altitude as globe height
          color: isMil ? '#ff9900'
               : type === 'drone' ? '#ff2200'
               : UTILS.countryColor(s[2] || ''),
          label: `${cs || s[0]} [${s[2] || '?'}] ${s[7] ? Math.round(s[7] * 3.281).toLocaleString() : '?'} ft`,
          size:  isMil ? 0.35 : 0.22,
        };
      });

    // Satellite points
    const satPoints = [];
    document.querySelectorAll('#sat-list .list-item').forEach(() => {}); // just re-get from module

    globe
      .pointsData(acPoints)
      .pointLat(d => d.lat)
      .pointLng(d => d.lng)
      .pointAltitude(d => d.alt)
      .pointColor(d => d.color)
      .pointRadius(d => d.size)
      .pointLabel(d => d.label)
      .pointsMerge(false);

    // Military bases as labels
    const bases = MILITARY.getBases().map(b => ({
      lat:   b.lat, lng: b.lng,
      color: '#ff9900',
      text:  b.name,
    }));

    globe
      .labelsData(bases)
      .labelLat(d => d.lat)
      .labelLng(d => d.lng)
      .labelText(d => d.text)
      .labelSize(0.35)
      .labelColor(() => 'rgba(255,153,0,0.7)')
      .labelResolution(2)
      .labelAltitude(0.005);
  }

  /* ── Network graph (D3 force-directed) ───────────────── */
  function drawNetwork() {
    const svg = d3.select('#net-svg');
    svg.selectAll('*').remove();
    const W = parseInt(svg.style('width')) || 800;
    const H = parseInt(svg.style('height')) || 600;

    const bases     = MILITARY.getBases();
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
      .filter(([s, t]) => byCountry[s] && byCountry[t])
      .map(([source, target]) => ({ source, target }));

    const sim = d3.forceSimulation(nodes)
      .force('link',      d3.forceLink(links).id(d => d.id).distance(130))
      .force('charge',    d3.forceManyBody().strength(-320))
      .force('center',    d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(32));

    const g = svg.append('g');
    svg.call(d3.zoom().on('zoom', ({ transform }) => g.attr('transform', transform)));

    const link = g.append('g').selectAll('line').data(links).join('line')
      .style('stroke', 'rgba(0,212,255,0.25)').style('stroke-width', 1);

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.append('circle')
      .attr('r', d => 8 + Math.sqrt(d.count) * 3)
      .attr('fill',   d => d.color + '22')
      .attr('stroke', d => d.color)
      .attr('stroke-width', 1.5)
      .style('filter', d => `drop-shadow(0 0 6px ${d.color})`);

    node.append('text')
      .attr('dy', d => -(12 + Math.sqrt(d.count) * 3))
      .attr('text-anchor', 'middle')
      .style('font-size', '9px').style('fill', '#c8dff0')
      .text(d => `${d.flag} ${d.id}`);

    node.append('text')
      .attr('dy', 4).attr('text-anchor', 'middle')
      .style('font-size', '10px').style('fill', '#c8dff0')
      .text(d => d.count);

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    svg.append('text').attr('x', 10).attr('y', 22)
      .style('fill', 'rgba(0,212,255,0.4)').style('font-family', 'monospace').style('font-size', '10px')
      .text('MILITARY ALLIANCE NETWORK — drag to interact');
  }

  /* ── Fly-to helper ───────────────────────────────────── */
  function flyTo(lat, lng, zoom = 7) {
    if (!map) return;
    map.flyTo([lat, lng], zoom, { duration: 1.5, easeLinearity: 0.4 });
  }

  /* ── Reset view ──────────────────────────────────────── */
  function resetView() {
    map?.flyTo([20, 0], 3, { duration: 1.5 });
  }

  /* ── Boot ────────────────────────────────────────────── */
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
    document.getElementById('reset-btn')?.addEventListener('click', resetView);
    document.getElementById('theme-btn')?.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
    });

    initWebSocket();

    // Boot messages
    SIDEBAR.addFeedItem('satellite', '🌍 SPYMETER initialized — all systems nominal');
    SIDEBAR.addFeedItem('aircraft',  'Fetching live ADS-B from OpenSky Network…');
    SIDEBAR.addFeedItem('satellite', 'Loading CelesTrak TLE orbital data…');
    SIDEBAR.addFeedItem('military',  `Military base database loaded (${MILITARY.getBases().length} sites)`);

    console.log('%c SPYMETER ', 'background:#00d4ff;color:#000;font-size:14px;font-weight:bold;');
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { flyTo, resetView };
})();
