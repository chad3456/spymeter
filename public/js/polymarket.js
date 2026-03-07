/* ── SPYMETER — Polymarket Prediction Intelligence ──────────
   Source: Polymarket Gamma API (free, no key)
   Shows geopolitical prediction markets as war-odds panel   */
const POLYMARKET = (() => {
  let markets = [];
  let refreshTimer = null;
  const CACHE_TTL = 300_000; // 5 min
  let lastFetch = 0;

  const CAT_COLORS = {
    war:       '#ff3344',
    nuclear:   '#ff9900',
    ceasefire: '#00ff88',
    conflict:  '#ffaa00',
    coup:      '#9b59ff',
    military:  '#00d4ff',
    default:   '#888',
  };

  // ── Probability bar rendering ──────────────────────────
  function probColor(p) {
    if (p >= 0.75) return '#ff2222';
    if (p >= 0.55) return '#ff8800';
    if (p >= 0.45) return '#ffdd00';
    if (p >= 0.25) return '#00d4ff';
    return '#00ff88';
  }

  function renderCard(m) {
    const pct     = Math.round((m.probability || 0.5) * 100);
    const col     = probColor(m.probability || 0.5);
    const catCol  = CAT_COLORS[m.category] || CAT_COLORS.default;
    const vol     = m.volume >= 1_000_000
      ? `$${(m.volume/1_000_000).toFixed(1)}M`
      : m.volume >= 1_000 ? `$${(m.volume/1_000).toFixed(0)}K` : `$${Math.round(m.volume||0)}`;
    const expiry  = m.endDate ? m.endDate.slice(0,10) : '—';
    const safeQ   = (m.question||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    return `<div class="pm-card" onclick="window.open('${m.url||'https://polymarket.com'}','_blank')">
      <div class="pm-cat-tag" style="background:${catCol}22;color:${catCol};border-color:${catCol}44">${(m.category||'conflict').toUpperCase()}</div>
      <div class="pm-question">${safeQ}</div>
      <div class="pm-bar-row">
        <div class="pm-bar-bg">
          <div class="pm-bar-fill" style="width:${pct}%;background:${col};box-shadow:0 0 8px ${col}55"></div>
        </div>
        <span class="pm-pct" style="color:${col}">${pct}%</span>
      </div>
      <div class="pm-meta">
        <span class="pm-vol">📊 ${vol} vol</span>
        <span class="pm-exp">⏱ exp: ${expiry}</span>
      </div>
    </div>`;
  }

  // ── Globe arcs for active high-probability markets ────
  function updateGlobeArcs() {
    if (typeof APP === 'undefined') return;
    // Show as points on the globe for each market with a location
    const pts = markets.filter(m => m.lat && m.lng).map(m => ({
      lat: m.lat, lng: m.lng,
      color: probColor(m.probability || 0.5),
      size: 0.3 + (m.probability||0.5) * 0.8,
      label: `${Math.round((m.probability||0.5)*100)}% — ${(m.question||'').slice(0,50)}`,
    }));
    if (window._polyGlobePts !== undefined) {
      // Update globe if in globe view
      if (typeof globe !== 'undefined' && globe) {
        // Add as rings layer
      }
    }
  }

  // ── Fetch and render ─────────────────────────────────
  async function fetchAndRender() {
    const container = document.getElementById('pm-list');
    const badge     = document.getElementById('pm-live-badge');
    const stats     = document.getElementById('pm-stats-bar');
    if (!container) return;

    container.innerHTML = '<div class="news-loading">⟳ Fetching prediction markets…</div>';

    try {
      const r = await fetch('/api/polymarket');
      const d = r.ok ? await r.json() : { markets: [] };
      markets = d.markets || [];
      lastFetch = Date.now();

      if (!markets.length) {
        container.innerHTML = '<div class="news-loading">No active markets found</div>';
        return;
      }

      // Sort by volume descending
      markets.sort((a, b) => (b.volume||0) - (a.volume||0));

      // Update stats bar
      if (stats) {
        const totalVol = markets.reduce((s, m) => s + (m.volume||0), 0);
        const highRisk = markets.filter(m => (m.probability||0) >= 0.6).length;
        const vStr = totalVol >= 1_000_000 ? `$${(totalVol/1_000_000).toFixed(1)}M` : `$${(totalVol/1_000).toFixed(0)}K`;
        stats.innerHTML = `<span class="pm-stat">📊 ${markets.length} MARKETS</span>
          <span class="pm-stat pm-stat-vol">💰 ${vStr} TOTAL VOL</span>
          <span class="pm-stat" style="color:#ff4444">⚠ ${highRisk} HIGH RISK (≥60%)</span>`;
      }

      // Update live badge
      if (badge) {
        badge.textContent = d.source === 'Polymarket API' ? '● LIVE' : '● CACHED';
        badge.style.color = d.source === 'Polymarket API' ? '#00ff88' : '#ffaa00';
      }

      container.innerHTML = markets.map(renderCard).join('');
      updateGlobeArcs();
    } catch (e) {
      container.innerHTML = '<div class="news-loading">Polymarket feed unavailable</div>';
    }
  }

  // ── Render summary widget in news panel ──────────────
  function renderSummaryWidget() {
    const el = document.getElementById('pm-summary-widget');
    if (!el || !markets.length) return;
    const top3 = markets.sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,3);
    el.innerHTML = `<div class="pm-widget-hdr">🎲 WAR ODDS — POLYMARKET</div>` +
      top3.map(m => {
        const pct = Math.round((m.probability||0.5)*100);
        const col = probColor(m.probability||0.5);
        return `<div class="pm-widget-row" onclick="window.open('${m.url}','_blank')">
          <div class="pm-widget-q">${(m.question||'').slice(0,55)}…</div>
          <div class="pm-widget-bar">
            <div class="pm-widget-fill" style="width:${pct}%;background:${col}"></div>
            <span style="color:${col};font-size:10px;font-weight:bold;margin-left:4px">${pct}%</span>
          </div>
        </div>`;
      }).join('');
  }

  // ── Ticker bar renderer ───────────────────────────────
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr.slice(0,10);
    const secs = (Date.now() - d) / 1000;
    if (secs < 3600)  return Math.round(secs/60)  + 'm ago';
    if (secs < 86400) return Math.round(secs/3600) + 'h ago';
    return Math.round(secs/86400) + 'd ago';
  }

  function renderTickerBar(mktList) {
    const inner = document.getElementById('pm-ticker-inner');
    if (!inner) return;
    if (!mktList || !mktList.length) {
      inner.innerHTML = '<span class="pm-tc-loading">No war markets found — retrying…</span>';
      return;
    }
    // Sort by probability descending (highest war-risk first)
    const sorted = [...mktList].sort((a,b) => (b.probability||0) - (a.probability||0));
    inner.innerHTML = sorted.map(m => {
      const pct    = Math.round((m.probability||0.5) * 100);
      const col    = probColor(m.probability||0.5);
      const q      = (m.question||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const qShort = q.length > 55 ? q.slice(0,52) + '…' : q;
      const t      = timeAgo(m.createdAt || m.endDate);
      const url    = m.url || 'https://polymarket.com';
      return `<a class="pm-tc-card" href="${url}" target="_blank" rel="noopener noreferrer" title="${q}">
        <span class="pm-tc-q">${qShort}</span>
        <span class="pm-tc-pct" style="color:${col}">${pct}%</span>
        ${t ? `<span class="pm-tc-time">🕐 ${t}</span>` : ''}
      </a><div class="pm-tc-divider"></div>`;
    }).join('');
  }

  async function refreshTicker() {
    const inner = document.getElementById('pm-ticker-inner');
    if (inner) inner.innerHTML = '<span class="pm-tc-loading">⟳ Refreshing…</span>';
    try {
      const r = await fetch('/api/polymarket');
      const d = r.ok ? await r.json() : { markets: [] };
      markets = d.markets || [];
      renderTickerBar(markets);
    } catch (_) {
      if (inner) inner.innerHTML = '<span class="pm-tc-loading">Feed unavailable</span>';
    }
  }

  function init() {
    fetchAndRender();
    // Init ticker bar independently (auto-runs on page load, no tab click needed)
    setTimeout(refreshTicker, 800);
    document.getElementById('pm-ticker-refresh-btn')?.addEventListener('click', refreshTicker);
    refreshTimer = setInterval(() => {
      if (document.getElementById('rptab-polymarket')?.style.display !== 'none') fetchAndRender();
      renderSummaryWidget();
      refreshTicker();
    }, 300_000);
  }

  return { init, fetchAndRender, refreshTicker, getMarkets: () => markets };
})();
