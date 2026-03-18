/* ── HORMUZ / Strategic Shipping Dashboard ──────────────────
   Live AIS vessels + choke-point selector + historical
   1d / 7d / 15d activity via GDELT + EIA crude price
   Triangulation confidence badges + Iran threat panel      */

const HORMUZ = (() => {
  let _period = 'live';   // live | 1d | 7d | 15d
  let _region = 'hormuz';
  let _liveData  = null;
  let _histCache = {};

  const SEVERITY_COLOR = { critical:'#ff2200', high:'#ff6600', normal:'#00d4ff', unknown:'#4a6a8a' };
  const VESSEL_EMOJI   = { tanker:'🛢', container:'📦', naval:'⚔', carrier:'⚔', cargo:'🚢', cable:'🔌', lng:'🔵', vessel:'⚓' };

  const CONFIDENCE_META = {
    confirmed:  { label:'CONFIRMED',  color:'#00ff88', title:'Position verified by 3+ AIS sources within 0.05°' },
    probable:   { label:'PROBABLE',   color:'#ffcc00', title:'Position from 2+ sources within 0.15°' },
    conflicted: { label:'CONFLICTED', color:'#ff6600', title:'Sources disagree on position (>0.15° spread)' },
    unverified: { label:'UNVERIFIED', color:'#4a6a8a', title:'Single source — not triangulated' },
  };

  const REGION_META = {
    hormuz:  { label:'Strait of Hormuz',       note:'~21M bbl/day • Iran chokehold • 5th Fleet',   lat:26.5, lon:56.4 },
    redsea:  { label:'Red Sea / Bab-el-Mandeb', note:'~10% world trade • Houthi attacks since 2023', lat:14.0, lon:43.0 },
    malacca: { label:'Strait of Malacca',       note:'~90K ships/year • China–Japan oil route',       lat:2.5,  lon:101.5 },
    suez:    { label:'Suez Canal',              note:'~12% global trade • Egypt revenue $9B/yr',      lat:30.5, lon:32.4 },
    bosporus:{ label:'Bosphorus Strait',        note:'Russia Black Sea access • Turkey control',       lat:41.1, lon:29.1 },
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

  // ── confidence badge ──────────────────────────────────────
  function _confidenceBadge(confidence, source_count, sources_list) {
    const meta = CONFIDENCE_META[confidence] || CONFIDENCE_META.unverified;
    const srcStr = sources_list ? sources_list.join('+') : '—';
    return `<span class="hrm-conf-badge" style="background:${meta.color}20;color:${meta.color};border-color:${meta.color}40" title="${meta.title} • Sources: ${srcStr}">${meta.label} ${source_count ? `×${source_count}` : ''}</span>`;
  }

  // ── Iran threat analysis ───────────────────────────────────
  function _renderIranThreat(vessels) {
    const iranVessels = vessels.filter(v => /iran|IR\b/i.test(v.flag) || v.iran_flagged);
    const irgcVessels = iranVessels.filter(v => /irgc|revolutionary|patrol|fast.attack/i.test(v.type || '') || v.severity === 'critical');
    const navalVessels = vessels.filter(v => /naval|frigate|destroyer|warship|carrier/i.test(v.type || ''));
    const tankers = vessels.filter(v => /tanker|lng|crude/i.test(v.type || ''));

    // Threat level calculation
    let threatScore = 0;
    if (iranVessels.length > 5) threatScore += 30;
    else if (iranVessels.length > 2) threatScore += 15;
    if (irgcVessels.length > 0) threatScore += 40;
    if (navalVessels.length > 3) threatScore += 20;
    if (tankers.length > 10) threatScore += 10;

    const threatLevel = threatScore >= 60 ? { label:'CRITICAL', color:'#ff2200' }
      : threatScore >= 35 ? { label:'ELEVATED', color:'#ff6600' }
      : threatScore >= 15 ? { label:'GUARDED',  color:'#ffcc00' }
      : { label:'LOW', color:'#00ff88' };

    // IRGC patrol zones (static known zones near Hormuz)
    const patrolZones = [
      { name:'Qeshm Island Approach', lat:26.95, lon:56.2, risk:'HIGH' },
      { name:'Abu Musa Island',        lat:25.87, lon:55.03, risk:'CRITICAL' },
      { name:'Greater Tunb Island',    lat:26.25, lon:55.32, risk:'CRITICAL' },
      { name:'Strait Narrows',         lat:26.56, lon:56.42, risk:'HIGH' },
    ];

    return `
      <div class="hrm-iran-panel">
        <div class="hrm-iran-hdr">
          <span class="hrm-iran-flag">🇮🇷</span>
          <span class="hrm-iran-title">IRAN MARITIME THREAT ASSESSMENT</span>
          <span class="hrm-threat-badge" style="background:${threatLevel.color}20;color:${threatLevel.color};border-color:${threatLevel.color}40">${threatLevel.label}</span>
        </div>
        <div class="hrm-iran-stats">
          <div class="hrm-iran-stat"><div class="hrm-iran-stat-val" style="color:#ff9900">${iranVessels.length}</div><div class="hrm-iran-stat-lbl">IRAN-FLAGGED</div></div>
          <div class="hrm-iran-stat"><div class="hrm-iran-stat-val" style="color:#ff2200">${irgcVessels.length}</div><div class="hrm-iran-stat-lbl">IRGC/NAVAL</div></div>
          <div class="hrm-iran-stat"><div class="hrm-iran-stat-val" style="color:#00d4ff">${navalVessels.length}</div><div class="hrm-iran-stat-lbl">ALL NAVAL</div></div>
          <div class="hrm-iran-stat"><div class="hrm-iran-stat-val" style="color:#ffcc00">${tankers.length}</div><div class="hrm-iran-stat-lbl">TANKERS</div></div>
        </div>
        <div class="hrm-section-hdr">⚠ IRGC PATROL ZONES</div>
        ${patrolZones.map(z => `
          <div class="hrm-zone-row">
            <span class="hrm-zone-name">${z.name}</span>
            <span class="hrm-zone-risk" style="color:${z.risk==='CRITICAL'?'#ff2200':'#ff6600'}">${z.risk}</span>
            <button class="hrm-zone-fly" onclick="if(window.APP)APP.flyTo(${z.lat},${z.lon},9)">📍</button>
          </div>`).join('')}
        ${iranVessels.length > 0 ? `
          <div class="hrm-section-hdr">🚢 IRAN-FLAGGED VESSELS DETECTED</div>
          ${iranVessels.map(v => `
            <div class="hrm-iran-vessel">
              <span class="hrm-iran-vname">${v.name || 'UNKNOWN'}</span>
              <span class="hrm-iran-vtype">${v.type || ''}</span>
              ${_confidenceBadge(v.confidence, v.source_count, v.sources_list)}
            </div>`).join('')}` : ''}
      </div>`;
  }

  // ── Mirrorfish: Iran activity heatmap ─────────────────────
  function _renderMirrorfish(vessels, region) {
    if (region !== 'hormuz') return '';

    const now = Date.now();
    const allVessels = vessels || [];

    // Activity zones based on vessel density
    const ZONES = [
      { name:'Strait Entry (East)',  lat:26.3, lon:57.5, radius:50 },
      { name:'Strait Narrows',       lat:26.6, lon:56.5, radius:40 },
      { name:'Qeshm Channel',        lat:26.9, lon:55.8, radius:35 },
      { name:'Gulf of Oman',         lat:24.5, lon:58.5, radius:80 },
    ];

    // Count vessels per zone
    const zoneCounts = ZONES.map(z => {
      const count = allVessels.filter(v => {
        const dLat = (v.lat || 0) - z.lat;
        const dLon = (v.lng || 0) - z.lon;
        const distDeg = Math.sqrt(dLat*dLat + dLon*dLon);
        return distDeg < (z.radius / 111); // rough deg conversion
      }).length;
      return { ...z, count };
    });

    const totalActivity = allVessels.length;
    const confirmed = allVessels.filter(v => v.confidence === 'confirmed').length;
    const conflicted = allVessels.filter(v => v.confidence === 'conflicted').length;

    const activityBar = (count, max) => {
      const pct = max > 0 ? Math.min(100, Math.round(count / max * 100)) : 0;
      const col = pct > 70 ? '#ff2200' : pct > 40 ? '#ff9900' : pct > 15 ? '#ffcc00' : '#00d4ff';
      return `<div class="hrm-mf-bar-track"><div class="hrm-mf-bar-fill" style="width:${pct}%;background:${col}"></div></div>`;
    };

    const maxCount = Math.max(...zoneCounts.map(z => z.count), 1);

    return `
      <div class="hrm-mirrorfish">
        <div class="hrm-mf-hdr">
          <span class="hrm-mf-icon">🐟</span>
          <span class="hrm-mf-title">MIRRORFISH — IRAN STRAIT ACTIVITY</span>
          <span class="hrm-mf-ts">${new Date(now).toLocaleTimeString()}</span>
        </div>
        <div class="hrm-mf-summary">
          <div class="hrm-mf-sum-box"><div class="hrm-mf-sum-val">${totalActivity}</div><div class="hrm-mf-sum-lbl">TOTAL VESSELS</div></div>
          <div class="hrm-mf-sum-box"><div class="hrm-mf-sum-val" style="color:#00ff88">${confirmed}</div><div class="hrm-mf-sum-lbl">CONFIRMED</div></div>
          <div class="hrm-mf-sum-box"><div class="hrm-mf-sum-val" style="color:#ff6600">${conflicted}</div><div class="hrm-mf-sum-lbl">CONFLICTED</div></div>
          <div class="hrm-mf-sum-box"><div class="hrm-mf-sum-val" style="color:#ffcc00">${allVessels.filter(v=>v.confidence==='probable').length}</div><div class="hrm-mf-sum-lbl">PROBABLE</div></div>
        </div>
        <div class="hrm-section-hdr">📡 ZONE DENSITY ANALYSIS</div>
        ${zoneCounts.map(z => `
          <div class="hrm-mf-zone">
            <div class="hrm-mf-zone-top">
              <span class="hrm-mf-zone-name">${z.name}</span>
              <span class="hrm-mf-zone-count">${z.count} vessels</span>
              <button class="hrm-zone-fly" onclick="if(window.APP)APP.flyTo(${z.lat},${z.lon},9)">📍</button>
            </div>
            ${activityBar(z.count, maxCount)}
          </div>`).join('')}
        <div class="hrm-mf-note">Density analysis based on live AIS triangulation. Confidence scores reflect multi-source verification.</div>
      </div>`;
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

    // Triangulation stats
    const confirmed  = vessels.filter(v => v.confidence === 'confirmed').length;
    const probable   = vessels.filter(v => v.confidence === 'probable').length;
    const conflicted = vessels.filter(v => v.confidence === 'conflicted').length;
    const unverified = vessels.filter(v => !v.confidence || v.confidence === 'unverified').length;
    const hasTriangulation = (confirmed + probable + conflicted) > 0;

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

      ${hasTriangulation ? `
      <div class="hrm-tri-panel">
        <div class="hrm-tri-hdr">🔺 TRIANGULATION STATUS</div>
        <div class="hrm-tri-stats">
          <span class="hrm-tri-stat" style="color:#00ff88">✓ ${confirmed} CONFIRMED</span>
          <span class="hrm-tri-stat" style="color:#ffcc00">~ ${probable} PROBABLE</span>
          <span class="hrm-tri-stat" style="color:#ff6600">⚡ ${conflicted} CONFLICTED</span>
          <span class="hrm-tri-stat" style="color:#4a6a8a">? ${unverified} UNVERIFIED</span>
        </div>
        <div class="hrm-tri-note">Multi-source AIS: AISHub × VesselFinder × MyShipTracking</div>
      </div>` : ''}

      ${_region === 'hormuz' ? _renderIranThreat(vessels) : ''}
      ${_region === 'hormuz' ? _renderMirrorfish(vessels, _region) : ''}

      ${vessels.length === 0 ? `
        <div class="hrm-no-vessels">
          <div>No AIS vessels detected in this region.</div>
          <div style="font-size:9px;color:#3a5a6a;margin-top:4px">
            Sources tried: AISHub, VesselFinder, MyShipTracking<br>
            Set <code>AISSTREAM_KEY</code> env var for full AIS stream coverage.
          </div>
        </div>` : ''}

      <div class="hrm-section-hdr">🚢 VESSEL MANIFEST</div>
      ${vessels.map(v => {
        const col   = SEVERITY_COLOR[v.severity] || SEVERITY_COLOR.unknown;
        const emoji = VESSEL_EMOJI[v.type] || '⚓';
        const confMeta = CONFIDENCE_META[v.confidence] || CONFIDENCE_META.unverified;
        return `
          <div class="hrm-vessel-card" style="border-left-color:${col}">
            <div class="hrm-vessel-top">
              <span class="hrm-vessel-emoji">${emoji}</span>
              <span class="hrm-vessel-name">${v.name || 'UNKNOWN'}</span>
              <span class="hrm-vessel-type">${v.type || ''}</span>
              <span class="hrm-vessel-flag">${v.flag || ''}</span>
              ${v.iran_flagged ? `<span class="hrm-iran-tag">🇮🇷 IRAN</span>` : ''}
            </div>
            <div class="hrm-vessel-row">
              <span>📍 ${v.lat?.toFixed(3)}°N ${v.lng?.toFixed(3)}°E</span>
              <span>⚡ ${_fmtSpeed(v.speed)}</span>
              <span>🧭 ${v.hdg || 0}°</span>
            </div>
            ${v.source_count > 1 ? `
            <div class="hrm-vessel-tri">
              ${_confidenceBadge(v.confidence, v.source_count, v.sources_list)}
              ${v.position_delta_deg != null ? `<span class="hrm-delta">±${(v.position_delta_deg * 111).toFixed(1)}km spread</span>` : ''}
            </div>` : `
            <div class="hrm-vessel-tri">${_confidenceBadge('unverified', 1, [v.source])}</div>`}
            ${v.cargo  ? `<div class="hrm-vessel-cargo">📦 ${v.cargo}</div>` : ''}
            ${v.route  ? `<div class="hrm-vessel-route">🛤 ${v.route}</div>`  : ''}
            <div class="hrm-vessel-mmsi">MMSI: ${v.mmsi || '—'} · src: ${v.sources_list ? v.sources_list.join(',') : (v.source || '?')}</div>
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
