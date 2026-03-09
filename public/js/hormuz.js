/* ── HORMUZ / Strategic Shipping Dashboard ──────────────────
   Live AIS vessels + choke-point selector + historical
   1d / 7d / 15d activity via GDELT + EIA crude price      */

const HORMUZ = (() => {
  let _period = 'live';   // live | 1d | 7d | 15d
  let _region = 'hormuz';
  let _liveData  = null;
  let _histCache = {};

  const SEVERITY_COLOR = { critical:'#ff2200', high:'#ff6600', normal:'#00d4ff', unknown:'#4a6a8a' };
  const VESSEL_EMOJI   = { tanker:'🛢', container:'📦', naval:'⚔', carrier:'⚔', cargo:'🚢', cable:'🔌', lng:'🔵', vessel:'⚓' };

  const REGION_META = {
    hormuz:  { label:'Strait of Hormuz',      note:'~21M bbl/day • Iran chokehold • 5th Fleet',   lat:26.5, lon:56.4 },
    redsea:  { label:'Red Sea / Bab-el-Mandeb',note:'~10% world trade • Houthi attacks since 2023', lat:14.0, lon:43.0 },
    malacca: { label:'Strait of Malacca',      note:'~90K ships/year • China–Japan oil route',       lat:2.5,  lon:101.5 },
    suez:    { label:'Suez Canal',             note:'~12% global trade • Egypt revenue $9B/yr',      lat:30.5, lon:32.4 },
    bosporus:{ label:'Bosphorus Strait',       note:'Russia Black Sea access • Turkey control',       lat:41.1, lon:29.1 },
  };

  // ── helpers ──────────────────────────────────────────────
  function _toneColor(tone) {
    const t = parseFloat(tone);
    if (t < -5) return '#ff4444';
    if (t < -2) return '#ff9900';
    if (t > 2)  return '#00ff88';
    return '#8a9aaa';
  }

  function _fmtSpeed(s) { return s ? `${parseFloat(s).toFixed(1)} kts` : '—'; }
  function _fmtDate(d)  {
    if (!d) return '—';
    const s = String(d);
    if (s.length === 14) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
    return s.slice(0, 16).replace('T', ' ');
  }

  // ── render live vessels ───────────────────────────────────
  function _renderLive(data) {
    if (!data) return `<div class="ind-loading">⟳ Loading live vessels…</div>`;

    const regionMeta = REGION_META[_region] || REGION_META.hormuz;
    const BBOX_FILTER = {
      hormuz:  v => v.lat >= 24 && v.lat <= 27 && v.lng >= 55 && v.lng <= 58,
      redsea:  v => v.lat >= 12 && v.lat <= 30 && v.lng >= 32 && v.lng <= 44,
      malacca: v => v.lat >=  1 && v.lat <=  7 && v.lng >= 99 && v.lng <= 105,
      suez:    v => v.lat >= 29 && v.lat <= 32 && v.lng >= 32 && v.lng <= 33,
      bosporus:v => v.lat >= 40 && v.lat <= 42 && v.lng >= 28 && v.lng <= 30,
    };
    const filter = BBOX_FILTER[_region];
    const vessels = filter ? (data.vessels || []).filter(filter) : (data.vessels || []);

    const tankers   = vessels.filter(v => /tanker|lng|crude/i.test(v.type));
    const naval     = vessels.filter(v => /naval|carrier|warship/i.test(v.type));
    const cargo     = vessels.filter(v => /container|cargo/i.test(v.type));

    return `
      <div class="hrm-region-card">
        <div class="hrm-region-name">${regionMeta.label}</div>
        <div class="hrm-region-note">${regionMeta.note}</div>
        <div class="hrm-region-flyto">
          <button class="hrm-flyto-btn" onclick="APP.flyTo(${regionMeta.lat},${regionMeta.lon},7)">🗺 Fly to region</button>
        </div>
      </div>

      <div class="hrm-vessel-stats">
        <div class="hrm-vs-box"><div class="hrm-vs-val">${vessels.length}</div><div class="hrm-vs-lbl">IN REGION</div></div>
        <div class="hrm-vs-box"><div class="hrm-vs-val" style="color:#ff9933">${tankers.length}</div><div class="hrm-vs-lbl">TANKERS</div></div>
        <div class="hrm-vs-box"><div class="hrm-vs-val" style="color:#ff4444">${naval.length}</div><div class="hrm-vs-lbl">NAVAL</div></div>
        <div class="hrm-vs-box"><div class="hrm-vs-val" style="color:#00d4ff">${cargo.length}</div><div class="hrm-vs-lbl">CARGO</div></div>
      </div>

      ${vessels.length === 0 ? `
        <div class="hrm-no-vessels">
          <div>No AIS vessels detected in this region.</div>
          <div style="font-size:9px;color:#3a5a6a;margin-top:4px">
            Sources tried: VesselFinder, MarineTraffic public, myshiptracking<br>
            Set <code>AISSTREAM_KEY</code> env var for full AIS stream coverage.
          </div>
        </div>` : ''}

      ${vessels.map(v => {
        const col   = SEVERITY_COLOR[v.severity] || SEVERITY_COLOR.unknown;
        const emoji = VESSEL_EMOJI[v.type] || '⚓';
        return `
          <div class="hrm-vessel-card" style="border-left-color:${col}">
            <div class="hrm-vessel-top">
              <span class="hrm-vessel-emoji">${emoji}</span>
              <span class="hrm-vessel-name">${v.name || 'UNKNOWN'}</span>
              <span class="hrm-vessel-type">${v.type || ''}</span>
              <span class="hrm-vessel-flag">${v.flag || ''}</span>
            </div>
            <div class="hrm-vessel-row">
              <span>📍 ${v.lat?.toFixed(2)}°N ${v.lng?.toFixed(2)}°E</span>
              <span>⚡ ${_fmtSpeed(v.speed)}</span>
              <span>🧭 ${v.hdg || 0}°</span>
            </div>
            ${v.cargo  ? `<div class="hrm-vessel-cargo">📦 ${v.cargo}</div>` : ''}
            ${v.route  ? `<div class="hrm-vessel-route">🛤 ${v.route}</div>`  : ''}
            <div class="hrm-vessel-mmsi">MMSI: ${v.mmsi || '—'} · src: ${v.source || '?'}</div>
          </div>`;
      }).join('')}

      <div class="hrm-section-hdr">🔗 LIVE AIS SOURCES</div>
      <div class="hrm-api-links">
        <a href="https://www.marinetraffic.com" target="_blank" class="hrm-api-link">MarineTraffic</a>
        <a href="https://www.vessel-finder.com" target="_blank" class="hrm-api-link">VesselFinder</a>
        <a href="https://aisstream.io" target="_blank" class="hrm-api-link">AISstream.io ↗ (free key)</a>
        <a href="https://www.myshiptracking.com" target="_blank" class="hrm-api-link">MyShipTracking</a>
      </div>
      <div class="hrm-ts">Last updated: ${data.ts ? new Date(data.ts).toLocaleTimeString() : '—'} · ${data.count || 0} vessels total fetched</div>`;
  }

  // ── render historical ─────────────────────────────────────
  function _renderHistory(data) {
    if (!data) return `<div class="ind-loading">⟳ Loading history…</div>`;

    const periodLabel = { '1d':'Past 24 Hours', '7d':'Past 7 Days', '15d':'Past 15 Days' }[_period] || _period;

    // Crude price mini chart (text-based sparkline)
    const prices = data.crudePrices || [];
    const priceHtml = prices.length ? `
      <div class="hrm-section-hdr">🛢 WTI CRUDE PRICE (EIA)</div>
      <div class="hrm-price-list">
        ${prices.map(p => {
          const v = parseFloat(p.price);
          const bar = '█'.repeat(Math.max(1, Math.round((v - 60) / 3)));
          const col = v > 100 ? '#ff4444' : v > 80 ? '#ff9900' : '#00d4ff';
          return `<div class="hrm-price-row">
            <span class="hrm-price-date">${p.date}</span>
            <span class="hrm-price-bar" style="color:${col}">${bar}</span>
            <span class="hrm-price-val" style="color:${col}">$${v.toFixed(1)}</span>
          </div>`;
        }).join('')}
      </div>` : '';

    return `
      <div class="hrm-hist-hdr">📊 ${periodLabel} — Hormuz & Red Sea Activity</div>
      ${priceHtml}
      <div class="hrm-section-hdr">📰 GDELT NEWS (${data.newsCount || 0} articles)</div>
      ${(data.news || []).map(n => `
        <a class="hrm-news-item" href="${n.url || '#'}" target="_blank" rel="noopener">
          <div class="hrm-news-meta">
            <span class="hrm-news-src">${n.source || ''}</span>
            <span class="hrm-news-date">${_fmtDate(n.date)}</span>
            <span class="hrm-news-tone" style="color:${_toneColor(n.tone)}">${n.tone > 0 ? '+' : ''}${n.tone}</span>
          </div>
          <div class="hrm-news-title">${n.title || ''}</div>
        </a>`).join('')}
      ${!data.news?.length ? '<div class="ind-loading">No news found for this period</div>' : ''}`;
  }

  // ── main render ───────────────────────────────────────────
  function _render() {
    const body = document.getElementById('hormuz-body');
    if (!body) return;
    if (_period === 'live') {
      body.innerHTML = _renderLive(_liveData);
    } else {
      body.innerHTML = _renderHistory(_histCache[_period] || null);
    }
  }

  async function _fetchLive() {
    try {
      const r = await fetch('/api/marine');
      _liveData = await r.json();
      if (_period === 'live') _render();
    } catch (e) { console.warn('[Hormuz] live fetch error:', e.message); }
  }

  async function _fetchHistory(period) {
    if (_histCache[period]) { _render(); return; }
    try {
      const r    = await fetch(`/api/hormuz-history?period=${period}`);
      const data = await r.json();
      _histCache[period] = data;
      _render();
    } catch (e) { console.warn('[Hormuz] history fetch error:', e.message); }
  }

  function setPeriod(p) {
    _period = p;
    document.querySelectorAll('.hrm-period-btn').forEach(b =>
      b.classList.toggle('active', b.textContent.toLowerCase().includes(p === 'live' ? 'live' : p.replace('d',' '))));
    _render();
    if (p !== 'live') _fetchHistory(p);
  }

  function setRegion(r) {
    _region = r;
    document.querySelectorAll('.hrm-choke-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.hrm-choke-btn[onclick*="${r}"]`)?.classList.add('active');
    if (_period === 'live') _render();
    // Fly map to region
    const meta = REGION_META[r];
    if (meta && window.APP) APP.flyTo(meta.lat, meta.lon, 6);
  }

  function init() {
    _fetchLive();
    setInterval(_fetchLive, 60_000); // refresh live every 60s
  }

  return { init, setPeriod, setRegion, refresh: _fetchLive };
})();
