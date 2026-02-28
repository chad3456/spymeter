/* ── Sidebar: panels, feeds, stats ─────────────────────── */
const SIDEBAR = (() => {
  const MAX_FEED = 60;

  /* ── Activity feed ──────────────────────────────────── */
  function addFeedItem(type, msg) {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;
    const div = document.createElement('div');
    div.className = 'feed-item';
    div.innerHTML = `
      <div class="feed-time">${UTILS.fmtTime()}</div>
      <div class="feed-body type-${type}">${msg}</div>`;
    feed.insertBefore(div, feed.firstChild);
    if (feed.children.length > MAX_FEED) feed.lastChild.remove();
  }

  document.getElementById('clr-feed')?.addEventListener('click', () => {
    const feed = document.getElementById('activity-feed');
    if (feed) feed.innerHTML = '';
  });

  /* ── Aircraft stats ─────────────────────────────────── */
  let acCountryData = {};
  function updateAircraftStats({ total, milCount, comCount, countryCounts }) {
    acCountryData = countryCounts;

    // Top-5 countries bar chart
    const barsEl = document.getElementById('ac-country-bars');
    if (barsEl) {
      const sorted = Object.entries(countryCounts)
        .sort((a,b) => b[1]-a[1])
        .slice(0, 5);
      const maxVal = sorted[0]?.[1] || 1;
      barsEl.innerHTML = sorted.map(([name, count]) => {
        const pct   = Math.round(count / maxVal * 100);
        const color = UTILS.countryColor(name);
        const short = name.length > 12 ? name.slice(0,12)+'…' : name;
        return `
          <div class="country-bar-row">
            <span class="cb-name" title="${name}">${short}</span>
            <div class="cb-bar"><div class="cb-fill" style="width:${pct}%;background:${color}"></div></div>
            <span class="cb-count">${count}</span>
          </div>`;
      }).join('');
    }

    // Live aircraft list (top 30 by altitude)
    const list = document.getElementById('ac-list');
    if (!list) return;
    const states = AIRCRAFT.getData();
    const top30  = [...states]
      .filter(s => s[6] && s[5])
      .sort((a,b) => (b[7]||0)-(a[7]||0))
      .slice(0, 30);

    list.innerHTML = top30.map(s => {
      const cs    = (s[1]||'').trim() || s[0];
      const alt   = s[7] ? Math.round(s[7] * 3.281 / 100) / 10 + 'k ft' : '—';
      const c     = s[2] || '?';
      const color = UTILS.countryColor(c);
      const mil   = AIRCRAFT.isMilitary(cs);
      return `
        <div class="list-item" onclick="APP.flyTo(${s[6]},${s[5]})">
          <div class="li-dot" style="background:${mil?'#ff9900':color}"></div>
          <div class="li-name">${cs}</div>
          <div class="li-info">${alt}</div>
        </div>`;
    }).join('');
  }

  /* ── Satellite list ─────────────────────────────────── */
  function populateSatList(satData) {
    const list = document.getElementById('sat-list');
    if (!list) return;
    const sorted = [...satData].sort((a,b) => a.name.localeCompare(b.name));
    list.innerHTML = sorted.slice(0, 80).map(s => {
      const cls   = s.name.match(/ISS|CSS|TIANGONG/i) ? 'station' : s.name.match(/GPS|GLONASS|GALILEO/i) ? 'nav' : 'default';
      const color = cls === 'station' ? '#00d4ff' : cls === 'nav' ? '#aa44ff' : '#00ff88';
      const alt   = s.pos ? Math.round(s.pos.alt) + ' km' : '—';
      return `
        <div class="list-item" onclick="APP.flyTo(${s.pos?.lat||0},${s.pos?.lng||0})">
          <div class="li-dot" style="background:${color}"></div>
          <div class="li-name">◉ ${s.name}</div>
          <div class="li-info">${alt}</div>
        </div>`;
    }).join('');
  }

  function highlightSat(name) {
    const items = document.querySelectorAll('#sat-list .list-item');
    items.forEach(el => {
      el.classList.toggle('selected', el.querySelector('.li-name')?.textContent.includes(name));
    });
  }

  /* ── Warhead inventory (public SIPRI/FAS estimates) ── */
  const WARHEADS = [
    { country:'United States', flag:'🇺🇸', total:5428, deployed:1744, color:'#3399ff' },
    { country:'Russia',        flag:'🇷🇺', total:6257, deployed:1588, color:'#ff3333' },
    { country:'China',         flag:'🇨🇳', total:500,  deployed:0,    color:'#ffaa00' },
    { country:'United Kingdom',flag:'🇬🇧', total:225,  deployed:120,  color:'#cc44ff' },
    { country:'France',        flag:'🇫🇷', total:290,  deployed:280,  color:'#4488ff' },
    { country:'India',         flag:'🇮🇳', total:172,  deployed:0,    color:'#ff8844' },
    { country:'Pakistan',      flag:'🇵🇰', total:170,  deployed:0,    color:'#44aa00' },
    { country:'North Korea',   flag:'🇰🇵', total:50,   deployed:0,    color:'#aa0033' },
    { country:'Israel',        flag:'🇮🇱', total:90,   deployed:0,    color:'#8888ff' },
  ];

  function populateWarheads() {
    const el = document.getElementById('warhead-list');
    if (!el) return;
    const maxTotal = 6257;
    el.innerHTML = WARHEADS.map(w => {
      const pct = Math.round(w.total / maxTotal * 100);
      return `
        <div class="wh-row">
          <span class="wh-flag">${w.flag}</span>
          <span class="wh-name">${w.country}</span>
          <span class="wh-count" style="color:${w.color}">${w.total.toLocaleString()}</span>
        </div>
        <div class="wh-bar"><div class="wh-fill" style="width:${pct}%;background:${w.color}"></div></div>`;
    }).join('');
  }

  /* ── GPS Jam list ───────────────────────────────────── */
  function populateGPSJam(zones) {
    const el = document.getElementById('gpsjam-list');
    if (!el) return;
    el.innerHTML = zones.map(z => {
      const col = z.severity === 'HIGH' ? '#ff3333' : '#ffaa00';
      return `
        <div class="gpsjam-item">
          <div class="gpsjam-dot" style="background:${col}"></div>
          <div class="gpsjam-label">${z.name}</div>
          <div class="gpsjam-sev" style="color:${col}">${z.severity}</div>
        </div>`;
    }).join('');
  }

  /* ── Intel signals (static OSINT-style feed) ─────── */
  const INTEL_ITEMS = [
    { title:'NOTAM: GPS unreliable Eastern Med', prob:'CONFIRMED', time:'Live',  color:'#ff3333' },
    { title:'Tu-95 Bear intercepted ADIZ Alaska', prob:'CONFIRMED', time:'4h ago', color:'#ff9900' },
    { title:'PLAN carrier group, South China Sea', prob:'HIGH',    time:'12h ago',color:'#ffaa00' },
    { title:'NK ballistic missile launch prep',   prob:'ELEVATED', time:'2d ago', color:'#ff6666' },
    { title:'Increased RU Su-34 sorties Syria',   prob:'CONFIRMED',time:'Live',   color:'#ff3333' },
    { title:'Israeli F-35I overflights Lebanon',  prob:'HIGH',     time:'6h ago', color:'#ffaa00' },
  ];

  function populateIntel() {
    const el = document.getElementById('intel-list');
    if (!el) return;
    el.innerHTML = INTEL_ITEMS.map(it => `
      <div class="intel-item">
        <div class="intel-title">${it.title}</div>
        <div class="intel-meta">
          <span class="intel-prob" style="color:${it.color}">${it.prob}</span>
          <span>${it.time}</span>
        </div>
      </div>`).join('');
  }

  /* ── Country filter chips ───────────────────────────── */
  const COUNTRIES = [
    'United States','Russia','China','United Kingdom','France',
    'Germany','India','Japan','Israel','Turkey','Iran','Pakistan',
    'North Korea','Ukraine','South Korea','Brazil','Australia','NATO',
  ];

  let activeCountries = new Set();

  function buildCountryFilter() {
    const el = document.getElementById('country-filter');
    if (!el) return;
    el.innerHTML = COUNTRIES.map(c => {
      const color = UTILS.countryColor(c);
      const flag  = UTILS.countryFlag(c);
      return `
        <div class="country-chip" data-country="${c}"
             style="border-color:${color}22"
             onclick="SIDEBAR.toggleCountry('${c}')">
          ${flag} ${c.split(' ').slice(-1)[0]}
        </div>`;
    }).join('');
  }

  function toggleCountry(c) {
    if (activeCountries.has(c)) activeCountries.delete(c);
    else activeCountries.add(c);

    const chip = document.querySelector(`.country-chip[data-country="${c}"]`);
    chip?.classList.toggle('active', activeCountries.has(c));

    AIRCRAFT.setCountryFilter([...activeCountries]);
    addFeedItem('military', activeCountries.size
      ? `Filter: ${[...activeCountries].join(', ')}`
      : 'Country filter cleared');
  }

  /* ── Sat tab switching ──────────────────────────────── */
  function initSatTabs() {
    document.querySelectorAll('.tab[data-sat]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab[data-sat]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        SATELLITES.switchType(btn.dataset.sat);
      });
    });
  }

  function init() {
    buildCountryFilter();
    populateIntel();
    initSatTabs();
  }

  return {
    addFeedItem, updateAircraftStats, populateSatList, highlightSat,
    populateWarheads, populateGPSJam, buildCountryFilter, toggleCountry, init
  };
})();
