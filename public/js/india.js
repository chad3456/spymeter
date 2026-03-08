/* ── INDIA DASHBOARD ──────────────────────────────────────────
   Claude AI agent briefs + live airspace + news + airports     */

const INDIA = (() => {
  let _tab    = 'flights';   // flights | intel | news | defence
  let _data   = {};          // cached /api/india-intel response
  let _timer  = null;

  const INDIAN_AIRPORTS = [
    { iata:'DEL', name:'Indira Gandhi Intl',  city:'Delhi',     lat:28.56, lon:77.10 },
    { iata:'BOM', name:'Chhatrapati Shivaji', city:'Mumbai',    lat:19.09, lon:72.87 },
    { iata:'BLR', name:'Kempegowda Intl',     city:'Bangalore', lat:13.20, lon:77.71 },
    { iata:'MAA', name:'Chennai Intl',         city:'Chennai',   lat:12.99, lon:80.17 },
    { iata:'HYD', name:'Rajiv Gandhi Intl',   city:'Hyderabad', lat:17.24, lon:78.43 },
    { iata:'CCU', name:'Netaji Subhas Intl',  city:'Kolkata',   lat:22.65, lon:88.45 },
    { iata:'AMD', name:'Sardar Vallabhbhai',  city:'Ahmedabad', lat:23.07, lon:72.63 },
    { iata:'COK', name:'Kochi Intl',          city:'Kochi',     lat: 9.99, lon:76.39 },
    { iata:'GAU', name:'Lokpriya Gopinath',   city:'Guwahati',  lat:26.11, lon:91.59 },
    { iata:'IXC', name:'Chandigarh Intl',     city:'Chandigarh',lat:30.67, lon:76.79 },
  ];

  const INDIAN_AIRLINES = {
    AI: 'Air India',      '6E': 'IndiGo',      SG: 'SpiceJet',
    UK: 'Vistara',        QP: 'Akasa Air',     IX: 'Air India Express',
    G8: 'Go First',       I5: 'AirAsia India', S2: 'Jet Airways',
    '9W': 'Jet (Legacy)', IT: 'IndiGo (IT)',
  };

  const THREAT_COLORS = {
    LOW: '#00ff88', MEDIUM: '#ffaa00', HIGH: '#ff6600', CRITICAL: '#ff2200', unknown: '#4a5568',
  };

  // ── render helpers ────────────────────────────────────────
  function _threatBadge(brief) {
    const m = (brief || '').match(/threat level[:\s]+([A-Z]+)/i);
    const level = m ? m[1].toUpperCase() : 'unknown';
    const col   = THREAT_COLORS[level] || THREAT_COLORS.unknown;
    return `<span class="ind-threat-badge" style="background:${col}22;border:1px solid ${col};color:${col}">${level}</span>`;
  }

  function _renderFlights(d) {
    if (d.status === 'loading') return `<div class="ind-loading">⟳ Fetching India airspace data…</div>`;
    const total  = d.acCount || 0;
    const indian = d.indianAc || 0;
    const foreign= d.foreignAc || 0;
    return `
      <div class="ind-stat-row">
        <div class="ind-stat">
          <div class="ind-stat-val ind-blue">${total.toLocaleString()}</div>
          <div class="ind-stat-lbl">ACTIVE FLIGHTS</div>
        </div>
        <div class="ind-stat">
          <div class="ind-stat-val ind-green">${indian}</div>
          <div class="ind-stat-lbl">INDIAN AIRLINES</div>
        </div>
        <div class="ind-stat">
          <div class="ind-stat-val ind-amber">${foreign}</div>
          <div class="ind-stat-lbl">FOREIGN AIRCRAFT</div>
        </div>
      </div>

      <div class="ind-section-hdr">MAJOR AIRPORTS</div>
      <div class="ind-airport-grid">
        ${INDIAN_AIRPORTS.map(ap => `
          <div class="ind-airport-card">
            <span class="ind-iata">${ap.iata}</span>
            <span class="ind-ap-city">${ap.city}</span>
          </div>`).join('')}
      </div>

      <div class="ind-section-hdr">AIRLINE BREAKDOWN</div>
      <div class="ind-airline-list">
        ${Object.entries(INDIAN_AIRLINES).map(([code, name]) => `
          <div class="ind-airline-row">
            <span class="ind-airline-code">${code}</span>
            <span class="ind-airline-name">${name}</span>
          </div>`).join('')}
      </div>

      <div class="ind-ts">Updated: ${d.ts ? new Date(d.ts).toLocaleTimeString() : '–'}</div>`;
  }

  function _renderIntel(d) {
    if (d.status === 'loading') return `<div class="ind-loading">⟳ Claude AI agent initialising… (runs every 10 min)</div>`;
    const brief = (d.brief || '').replace(/\n/g, '<br>');
    return `
      <div class="ind-intel-header">
        <span class="ind-intel-badge">AI OSINT BRIEF</span>
        ${_threatBadge(d.brief)}
        <span class="ind-ts" style="margin-left:auto">${d.ts ? new Date(d.ts).toLocaleTimeString() : ''}</span>
      </div>
      <div class="ind-intel-body">${brief}</div>
      <div class="ind-intel-meta">Source: ${d.source || 'Claude AI + GDELT + airplanes.live'} · Refreshes every 10 min</div>`;
  }

  function _renderNews(d) {
    if (d.status === 'loading') return `<div class="ind-loading">⟳ Loading India news…</div>`;
    const items = d.headlines || [];
    if (!items.length) return `<div class="ind-loading">No headlines available</div>`;
    return `
      <div class="ind-section-hdr">INDIA NEWS (last 24h · GDELT)</div>
      ${items.map(h => `
        <a class="ind-news-item" href="${h.url || '#'}" target="_blank" rel="noopener">
          <div class="ind-news-source">${h.source || 'news'}</div>
          <div class="ind-news-title">${h.title || ''}</div>
        </a>`).join('')}`;
  }

  function _renderDefence(d) {
    if (d.status === 'loading') return `<div class="ind-loading">⟳ Loading India defence feed…</div>`;
    const items = d.defItems || [];
    if (!items.length) return `<div class="ind-loading">No defence items — check RSS sources</div>`;
    return `
      <div class="ind-section-hdr">INDIA DEFENCE / OSINT</div>
      ${items.map(t => `
        <div class="ind-def-item">
          <span class="ind-def-bullet">▶</span>
          <span class="ind-def-text">${t}</span>
        </div>`).join('')}`;
  }

  // ── main render ───────────────────────────────────────────
  function _render() {
    const wrap = document.getElementById('india-body');
    if (!wrap) return;
    const d = _data;
    switch (_tab) {
      case 'flights': wrap.innerHTML = _renderFlights(d);  break;
      case 'intel':   wrap.innerHTML = _renderIntel(d);    break;
      case 'news':    wrap.innerHTML = _renderNews(d);      break;
      case 'defence': wrap.innerHTML = _renderDefence(d);   break;
    }
  }

  async function _fetch() {
    try {
      const r   = await fetch('/api/india-intel');
      const json = await r.json();
      _data = json;

      // Update header badge
      const badge = document.getElementById('india-threat-badge');
      const m     = (json.brief || '').match(/threat level[:\s]+([A-Z]+)/i);
      const level = m ? m[1].toUpperCase() : '';
      if (badge && level) {
        badge.textContent = level;
        badge.style.color = THREAT_COLORS[level] || '#fff';
      }

      // Update top stats
      const el = id => document.getElementById(id);
      if (el('india-ac-count'))  el('india-ac-count').textContent  = json.acCount  ?? '–';
      if (el('india-in-count'))  el('india-in-count').textContent  = json.indianAc ?? '–';
      if (el('india-for-count')) el('india-for-count').textContent = json.foreignAc ?? '–';

      _render();
    } catch (e) {
      console.warn('[India] fetch error:', e.message);
    }
  }

  function setTab(t) {
    _tab = t;
    document.querySelectorAll('.ind-tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === t));
    _render();
  }

  function init() {
    _fetch();
    _timer = setInterval(_fetch, 10 * 60 * 1000); // re-fetch every 10 min (synced with agent)
  }

  return { init, setTab, refresh: _fetch };
})();
