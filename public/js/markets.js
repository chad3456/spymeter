/* ── SPYMETER — Stock Markets + War Economy Tracker ────────
   Yahoo Finance ticker (15-min delay), war-impact stocks,
   GDELT market news filtered for geopolitical events.       */
const MARKETS = (() => {

  let currentFilter = 'all';
  let allQuotes     = [];

  // ── Format helpers ─────────────────────────────────────
  function fmtPrice(p, sym) {
    if (p == null) return '—';
    if (sym === '^VIX' || sym === '^INDIAVIX') return p.toFixed(2);
    return p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p.toFixed(2);
  }

  function relTime(dateStr) {
    if (!dateStr) return '';
    try {
      const y = dateStr.slice(0,4), mo = dateStr.slice(4,6), d = dateStr.slice(6,8);
      const h = dateStr.slice(9,11)||'00', m = dateStr.slice(11,13)||'00';
      const ms = Date.now() - new Date(`${y}-${mo}-${d}T${h}:${m}:00Z`).getTime();
      const min = Math.round(ms / 60000);
      if (min < 1) return 'now';
      if (min < 60) return `${min}m`;
      if (min < 1440) return `${Math.round(min/60)}h`;
      return `${Math.round(min/1440)}d`;
    } catch (_) { return ''; }
  }

  // ── Render ticker strip ────────────────────────────────
  function renderTicker(quotes) {
    const strip = document.getElementById('ticker-items');
    if (!strip) return;
    const filtered = currentFilter === 'all' ? quotes : quotes.filter(q => q.group === currentFilter);
    strip.innerHTML = filtered.map(q => {
      const up  = q.pct != null ? q.pct >= 0 : null;
      const col = up === null ? '#888' : up ? '#00ff88' : '#ff4444';
      const arrow = up === null ? '' : up ? '▲' : '▼';
      const pctStr = q.pct != null ? `${arrow}${Math.abs(q.pct).toFixed(2)}%` : '—';
      return `
        <div class="ticker-item">
          <span class="tk-flag">${q.flag}</span>
          <span class="tk-name">${q.label}</span>
          <span class="tk-price">${fmtPrice(q.price, q.sym)}</span>
          <span class="tk-chg" style="color:${col}">${pctStr}</span>
        </div>
        <span class="tk-sep">|</span>`;
    }).join('');
    allQuotes = quotes;
  }

  // ── Render market panel (MARKETS right-panel tab) ──────
  function renderMarketPanel(quotes) {
    const el = document.getElementById('market-panel-list');
    if (!el) return;

    const groups = [
      { id:'us',    label:'🇺🇸 US Markets' },
      { id:'india', label:'🇮🇳 India Markets' },
      { id:'china', label:'🇨🇳 China Markets' },
      { id:'oil',   label:'🛢 Commodities / Energy' },
    ];

    el.innerHTML = groups.map(g => {
      const gQuotes = quotes.filter(q => q.group === g.id);
      if (!gQuotes.length) return '';
      return `
        <div class="mkt-group-hdr">${g.label}</div>
        ${gQuotes.map(q => {
          const up  = q.pct != null ? q.pct >= 0 : null;
          const col = up === null ? '#888' : up ? '#00ff88' : '#ff4444';
          const arrow = up === null ? '' : up ? '▲' : '▼';
          const pctStr = q.pct != null ? `${arrow}${Math.abs(q.pct).toFixed(2)}%` : '—';
          const chgStr = q.change != null ? `${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}` : '—';
          const stateColor = q.state === 'REGULAR' ? '#00ff88' : '#888';
          return `
            <div class="mkt-row">
              <div class="mkt-left">
                <span class="mkt-flag">${q.flag}</span>
                <div>
                  <div class="mkt-name">${q.label}</div>
                  <div class="mkt-state" style="color:${stateColor}">${q.state || 'CLOSED'}</div>
                </div>
              </div>
              <div class="mkt-right">
                <div class="mkt-price">${fmtPrice(q.price, q.sym)}</div>
                <div class="mkt-chg" style="color:${col}">${pctStr} <span class="mkt-abs">${chgStr}</span></div>
              </div>
            </div>`;
        }).join('')}`;
    }).join('');
  }

  // ── Render war-impact market news ──────────────────────
  async function loadMarketNews() {
    const el = document.getElementById('market-news-feed');
    if (!el) return;
    el.innerHTML = '<div class="news-loading">⟳ Loading war-impact market news…</div>';
    try {
      const r = await window.fetch('/api/market-news');
      const d = r.ok ? await r.json() : { articles: [] };
      const arts = d.articles || [];
      if (!arts.length) { el.innerHTML = '<div class="news-loading">No recent market news</div>'; return; }
      el.innerHTML = arts.map(a => {
        const tc = parseFloat(a.tone||0) < -2 ? 'tone-neg' : parseFloat(a.tone||0) > 2 ? 'tone-pos' : 'tone-neu';
        const dt = UTILS.timeAgo(a.date) || relTime(a.date);
        const safeTitle = (a.title||'').replace(/'/g,'&#39;');
        return `<a class="news-item" href="${a.url}" target="_blank" rel="noopener noreferrer">
          <div class="news-title">${a.title}</div>
          <div class="news-meta">
            <span class="news-src">${a.source}</span>
            <span class="news-ts">${dt}</span>
            <span class="news-tone ${tc}">${parseFloat(a.tone||0) > 0 ? '+' : ''}${parseFloat(a.tone||0).toFixed(1)}</span>
            <button class="narrate-btn-sm" onclick="event.preventDefault();UTILS.narrate('${safeTitle}')">🔊</button>
          </div>
        </a>`;
      }).join('');
    } catch (_) {
      el.innerHTML = '<div class="news-loading">Market news unavailable</div>';
    }
  }

  // ── Fetch and display ──────────────────────────────────
  async function fetchMarkets() {
    try {
      const r = await window.fetch('/api/markets');
      const d = r.ok ? await r.json() : { quotes: [] };
      const quotes = d.quotes || [];
      if (quotes.length) {
        renderTicker(quotes);
        renderMarketPanel(quotes);
        updateTickerTimestamp(d.ts);
        // Show data source note in panel header
        const hdr = document.querySelector('#rptab-markets .panel-card .card-hdr span');
        if (hdr && d.source) {
          const live = (d.source || '').includes('Yahoo');
          const badge = hdr.querySelector('.badge-mkt-src') || document.createElement('span');
          badge.className = 'badge-mkt-src badge-static';
          badge.style.marginLeft = '4px';
          badge.textContent = live ? '● LIVE' : '≈ EST';
          badge.style.color = live ? '#00ff88' : '#ffaa00';
          if (!hdr.querySelector('.badge-mkt-src')) hdr.appendChild(badge);
        }
      }
    } catch (_) {}
  }

  function updateTickerTimestamp(ts) {
    const el = document.getElementById('ticker-ts');
    if (!el || !ts) return;
    const min = Math.round((Date.now() - ts) / 60000);
    el.textContent = min < 1 ? 'just now' : `${min}m ago`;
  }

  // ── Ticker filter ──────────────────────────────────────
  function setFilter(f) {
    currentFilter = f;
    document.querySelectorAll('.tkbtn').forEach(b => b.classList.toggle('active', b.dataset.tkf === f));
    if (allQuotes.length) renderTicker(allQuotes);
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    fetchMarkets();
    loadMarketNews();
    setInterval(fetchMarkets, 300_000);      // every 5 min
    setInterval(loadMarketNews, 300_000);
  }

  return { init, setFilter, fetchMarkets, loadMarketNews };
})();
