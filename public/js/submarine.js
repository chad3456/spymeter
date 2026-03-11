/* ── SPYMETER — Submarine OSINT Tracker ─────────────────────
   Data: NavalNews RSS + Naval-Technology RSS + OSINT positions
   Note: Real submarine positions are CLASSIFIED.
   This uses OSINT patrol zones, known deployments, and
   public reporting to estimate approximate areas.           */
const SUBMARINE = (() => {
  let map       = null;
  let enabled   = false;
  let markers   = [];
  let zones     = [];
  let data      = null;
  let refreshTimer = null;

  const COUNTRY_COLORS = {
    'USA':        '#4488ff',
    'Russia':     '#ff4444',
    'China':      '#ffcc00',
    'UK':         '#00ccff',
    'France':     '#aaddff',
    'India':      '#ff9900',
    'North Korea':'#ff0066',
    'Israel':     '#7777ff',
    'Pakistan':   '#00aa44',
  };

  const STATUS_ICONS = {
    'deterrent patrol': '☢',
    'combat patrol':    '🎯',
    'intelligence patrol': '👁',
    'special mission':  '⚡',
    'special ops':      '🔱',
    'Arctic patrol':    '❄',
    'patrol':           '⚓',
    'near port':        '🏭',
  };

  // ── Known patrol zone circles ──────────────────────────
  const PATROL_ZONES = [
    { lat:63.0, lng:-35.0, r:400, name:'US SSBN Atlantic Box',  color:'#4488ff', opacity:0.08, note:'US Ohio-class SSBN primary deterrent zone' },
    { lat:48.0, lng:-140.0,r:500, name:'US SSBN Pacific Box',   color:'#4488ff', opacity:0.08, note:'US SSBN Pacific patrol area — 14th Submarine Squadron' },
    { lat:72.0, lng:30.0,  r:350, name:'Russian SSBN Bastion',  color:'#ff4444', opacity:0.10, note:'Russian Borei/Delta SSBN protective bastion zone' },
    { lat:18.0, lng:115.0, r:450, name:'PLAN SSBN Patrol',      color:'#ffcc00', opacity:0.08, note:'Chinese Type 094 SSBN South China Sea routes' },
    { lat:60.0, lng:-10.0, r:300, name:'UK CASD Zone',          color:'#00ccff', opacity:0.08, note:'UK Vanguard SSBN continuous at-sea deterrent area' },
    { lat:47.0, lng:-12.0, r:280, name:'French SSBN Area',      color:'#aaddff', opacity:0.06, note:'French Triomphant-class SNLE Atlantic zone' },
    { lat:50.0, lng:5.0,   r:200, name:'NATO GIUK Gap',         color:'#ffffff', opacity:0.05, note:'GIUK Gap — NATO anti-submarine warfare chokepoint' },
    { lat:37.0, lng:30.0,  r:200, name:'Med SSN Patrol',        color:'#4488ff', opacity:0.07, note:'US/UK SSN Mediterranean presence' },
    { lat:22.0, lng:118.0, r:300, name:'PLAN SSN Zone',         color:'#ffcc00', opacity:0.07, note:'Chinese Type 093/095 SSN patrol routes' },
    { lat:15.0, lng:82.0,  r:250, name:'Indian SSBN Area',      color:'#ff9900', opacity:0.06, note:'INS Arihant Bay of Bengal patrol zone' },
  ];

  // ── Fetch and render ─────────────────────────────────
  async function _fetch() {
    try {
      // Try enhanced endpoint first (more news sources + Telegram OSINT)
      const r = await fetch('/api/submarine-enhanced');
      if (!r.ok) return;
      data = await r.json();
      if (enabled) _render();

      // Update OSINT news panel
      const newsEl = document.getElementById('sub-news-list');
      if (newsEl && data.news?.length) {
        newsEl.innerHTML = data.news.map(n =>
          `<a class="news-item" href="${n.url}" target="_blank" rel="noopener">
            <div class="news-title">${n.title}</div>
            <div class="news-meta"><span class="news-src">${n.source||''}</span>
              <span class="news-ts">${_timeAgo(n.date)}</span></div>
          </a>`).join('') || '<div class="news-loading">No recent submarine news</div>';
      } else if (newsEl) {
        newsEl.innerHTML = '<div class="news-loading">⟳ Fetching naval intelligence…</div>';
      }
    } catch(_) {}
  }

  function _timeAgo(dateStr) {
    if (!dateStr) return '';
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      if (diff < 3600000) return `${Math.round(diff/60000)}m ago`;
      if (diff < 86400000) return `${Math.round(diff/3600000)}h ago`;
      return `${Math.round(diff/86400000)}d ago`;
    } catch(_) { return ''; }
  }

  function _render() {
    if (!map || !data) return;

    // Clear existing
    markers.forEach(m => map.removeLayer(m));
    zones.forEach(z => map.removeLayer(z));
    markers = []; zones = [];

    // Draw patrol zone circles
    PATROL_ZONES.forEach(z => {
      const circle = L.circle([z.lat, z.lng], {
        radius: z.r * 1000, // km to meters
        color: z.color, fillColor: z.color,
        fillOpacity: z.opacity, weight: 0.5, opacity: 0.3,
        dashArray: '4 4',
      });
      circle.bindTooltip(`<div style="font-family:monospace;font-size:8px;color:${z.color}">${z.name}<br><span style="color:#888">${z.note}</span></div>`, { permanent: false, className:'leaflet-tooltip-dark' });
      circle.addTo(map);
      zones.push(circle);
    });

    // Draw submarine markers
    (data.submarines || []).forEach(sub => {
      const col = COUNTRY_COLORS[sub.country] || '#00d4ff';
      const statusIcon = STATUS_ICONS[sub.status] || '⚓';
      const isSSBN = /ssbn|borei|vanguard|ohio|triomphant|arihant|sinpo/i.test(sub.clazz || '');

      const icon = L.divIcon({
        html: `<div class="sub-icon" style="color:${col};border-color:${col}">
          ${isSSBN ? '☢' : '⚓'}
          <div class="sub-icon-trail" style="background:${col}"></div>
        </div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const popup = `<div class="sub-popup" style="border-color:${col}44">
        <div class="sub-popup-hdr" style="color:${col}">${sub.flag||''} ${sub.name}</div>
        <div class="sub-popup-row"><span class="sub-lbl">Class:</span> ${sub.clazz}</div>
        <div class="sub-popup-row"><span class="sub-lbl">Status:</span>
          <span style="color:${col}">${statusIcon} ${sub.status}</span></div>
        <div class="sub-popup-row"><span class="sub-lbl">Depth:</span> ~${sub.depth}m (estimated)</div>
        <div class="sub-popup-row"><span class="sub-lbl">Armament:</span>
          <span style="color:#ff9900">${sub.warheads||'—'}</span></div>
        <div class="sub-popup-row" style="color:#888;font-size:8px;margin-top:4px">${sub.notes||''}</div>
        <div class="sub-popup-row" style="color:#3d5a78;font-size:7px">Source: ${sub.source||'OSINT'} · Positions ESTIMATED</div>
      </div>`;

      const mk = L.marker([sub.lat, sub.lng], { icon })
        .bindPopup(popup, { className:'leaflet-popup-dark', maxWidth:280 })
        .addTo(map);
      markers.push(mk);
    });
  }

  // ── Left panel stats list ────────────────────────────
  function renderStatsList() {
    const el = document.getElementById('sub-stats-list');
    if (!el || !data?.submarines) return;
    const subs = data.submarines;
    const byCountry = {};
    subs.forEach(s => { if (!byCountry[s.country]) byCountry[s.country] = []; byCountry[s.country].push(s); });
    el.innerHTML = Object.entries(byCountry).map(([c, arr]) => {
      const col = COUNTRY_COLORS[c] || '#00d4ff';
      const ssbn = arr.filter(s => /ssbn|deterrent/i.test(s.clazz+s.status)).length;
      const ssn  = arr.length - ssbn;
      return `<div class="india-zone-row" style="cursor:default">
        <div class="iz-flag" style="font-size:14px">${arr[0].flag||'⚓'}</div>
        <div class="iz-info">
          <div class="iz-country">${c}</div>
          <div class="iz-advisory" style="color:${col}">☢ ${ssbn} SSBN · ⚓ ${ssn} SSN</div>
        </div>
        <div class="iz-nums">
          <div class="iz-total" style="color:${col}">${arr.length}</div>
          <div class="iz-label">boats</div>
        </div>
      </div>`;
    }).join('');
  }

  return {
    init(m) {
      map = m;
      _fetch();
    },
    setEnabled(on) {
      enabled = on;
      if (on) {
        _render();
        renderStatsList();
        refreshTimer = setInterval(_fetch, 300_000);
      } else {
        clearInterval(refreshTimer);
        markers.forEach(m => map?.removeLayer(m));
        zones.forEach(z => map?.removeLayer(z));
        markers = []; zones = [];
      }
    },
    refresh() { _fetch(); },
    getData() { return data; },
  };
})();
