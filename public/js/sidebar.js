/* ── Sidebar: panels, feeds, stats, news ─────────────────── */
const SIDEBAR = (() => {
  const MAX_FEED = 80;

  // ── Country → map center coordinates ─────────────────
  const COUNTRY_COORDS = {
    'United States': [39.5, -98.35],
    'Russia':        [61.5, 105.3],
    'China':         [35.8, 104.2],
    'United Kingdom':[54.0, -2.0],
    'France':        [46.2, 2.2],
    'Germany':       [51.2, 10.4],
    'India':         [20.6, 78.9],
    'Japan':         [36.2, 138.3],
    'Israel':        [31.0, 35.0],
    'Turkey':        [38.9, 35.2],
    'Iran':          [32.4, 53.7],
    'Pakistan':      [30.4, 69.3],
    'North Korea':   [40.3, 127.5],
    'Ukraine':       [48.4, 31.2],
    'South Korea':   [36.5, 127.8],
    'Brazil':        [-14.2, -51.9],
    'Australia':     [-25.3, 133.8],
    'NATO':          [50.4, 3.9],
    'Canada':        [56.1, -106.3],
    'Saudi Arabia':  [23.9, 45.1],
    'UAE':           [23.4, 53.8],
  };

  // ── Activity feed ──────────────────────────────────── */
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

  // Helper: build a Google News search URL so static fallbacks link to real articles
  function newsSearchUrl(title) {
    return `https://news.google.com/search?q=${encodeURIComponent(title)}&hl=en-US&gl=US&ceid=US:en`;
  }

  // ── Curated fallback intel (always shown if API empty) ──
  const STATIC_INTEL = [
    { title:'Russia launches Shahed-136 drone swarm targeting Kyiv energy grid', source:'UA Defense Intelligence', date:'', tone:'-8.2', country:'Ukraine' },
    { title:'Israel IDF conducts precision strikes on Iranian proxy sites in Syria', source:'IDF Spokesperson', date:'', tone:'-6.5', country:'Israel' },
    { title:'China PLA Navy carrier group exits South China Sea via Luzon Strait', source:'USNI News', date:'', tone:'-3.1', country:'China' },
    { title:'North Korea ICBM engine test detected at Sohae launch facility via SAR', source:'38 North', date:'', tone:'-5.0', country:'North Korea' },
    { title:'NATO activates VJTF rapid reaction force for Baltic region rotation', source:'NATO HQ', date:'', tone:'-2.8', country:'NATO' },
    { title:'Pakistan Fatah-II MLRS test confirmed 400km range', source:'ISPR', date:'', tone:'-4.0', country:'Pakistan' },
    { title:'EUROCONTROL NOTAM: GPS spoofing Baltic, Eastern Mediterranean active', source:'EUROCONTROL', date:'', tone:'-3.5', country:'Europe' },
    { title:'Sudan RSF advance humanitarian corridor blocked UN OCHA', source:'UN OCHA', date:'', tone:'-9.1', country:'Sudan' },
    { title:'Iran uranium enrichment Fordow IAEA inspectors', source:'IAEA', date:'', tone:'-7.2', country:'Iran' },
    { title:'Taiwan Strait PLA J-20 median line crossing military exercises', source:'ROC MND', date:'', tone:'-5.5', country:'Taiwan' },
    { title:'Myanmar junta airstrikes resistance strongholds casualties', source:'Irrawaddy', date:'', tone:'-8.8', country:'Myanmar' },
    { title:'Houthi anti-ship missiles Red Sea commercial shipping UKMTO', source:'UKMTO', date:'', tone:'-6.0', country:'Yemen' },
    { title:'US THAAD battery South Korea North Korea escalation', source:'USFK', date:'', tone:'-4.2', country:'South Korea' },
    { title:'Wagner mercenaries Mali Libya border region ACLED', source:'ACLED', date:'', tone:'-5.1', country:'Africa' },
    { title:'India Agni-V ICBM MIRV test successful DRDO', source:'DRDO', date:'', tone:'-3.0', country:'India' },
  ].map(item => ({ ...item, url: newsSearchUrl(item.title) }));

  // Parse GDELT date and check freshness (discard if > 7 days old)
  function isFreshArticle(dateStr) {
    if (!dateStr || dateStr.length < 8) return true; // keep if no date
    try {
      const y  = dateStr.slice(0, 4);
      const mo = dateStr.slice(4, 6);
      const d  = dateStr.slice(6, 8);
      const h  = dateStr.slice(9, 11) || '00';
      const mn = dateStr.slice(11, 13) || '00';
      const dt = new Date(`${y}-${mo}-${d}T${h}:${mn}:00Z`);
      return Date.now() - dt.getTime() < 7 * 24 * 3600 * 1000; // 7 days
    } catch (_) { return true; }
  }

  async function loadNews() {
    const feed = document.getElementById('news-feed');
    if (!feed) return;
    feed.innerHTML = '<div class="news-loading">⟳ Fetching live intel from GDELT…</div>';

    try {
      const resp = await window.fetch('/api/news');
      const data = resp.ok ? await resp.json() : { articles: [] };
      const live  = (data.articles || []).filter(a => a.title && a.title.length > 10 && isFreshArticle(a.date));
      const merged = [...live, ...STATIC_INTEL].slice(0, 28);
      renderNews(merged, live.length);
    } catch (_) {
      renderNews(STATIC_INTEL, 0);
    }
  }

  // ── Reddit war feed ─────────────────────────────────── */
  async function loadRedditFeed() {
    const el = document.getElementById('reddit-feed');
    if (!el) return;
    el.innerHTML = '<div class="news-loading">⟳ Fetching Reddit…</div>';
    try {
      const resp = await window.fetch('/api/reddit');
      const data = resp.ok ? await resp.json() : { posts: [] };
      const posts = data.posts || [];
      if (!posts.length) { el.innerHTML = '<div class="news-loading">No posts available</div>'; return; }
      el.innerHTML = posts.slice(0, 20).map(p => {
        const hrs = Math.round((Date.now() / 1000 - p.time) / 3600);
        const timeStr = hrs < 1 ? 'just now' : hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs/24)}d ago`;
        const score = p.score >= 1000 ? (p.score/1000).toFixed(1) + 'k' : p.score;
        return `
          <a class="news-item reddit-item" href="${p.url}" target="_blank" rel="noopener noreferrer">
            <div class="news-title">${p.title}</div>
            <div class="news-meta">
              <span class="reddit-sub">r/${p.sub}</span>
              <span class="news-date">${timeStr}</span>
              <span class="reddit-score">▲ ${score}</span>
              <span class="reddit-cmts">💬 ${p.comments}</span>
            </div>
          </a>`;
      }).join('');
    } catch (_) {
      el.innerHTML = '<div class="news-loading">Reddit unavailable</div>';
    }
  }

  function toneClass(tone) {
    const t = parseFloat(tone);
    if (t < -3) return 'tone-neg';
    if (t > 3)  return 'tone-pos';
    return 'tone-neu';
  }

  function fmtNewsDate(dateStr) {
    // GDELT format: 20240101T120000Z
    if (!dateStr || dateStr.length < 8) return '';
    try {
      const y = dateStr.slice(0,4);
      const mo = dateStr.slice(4,6);
      const d  = dateStr.slice(6,8);
      const h  = dateStr.slice(9,11) || '00';
      const m  = dateStr.slice(11,13) || '00';
      return `${d}/${mo} ${h}:${m}Z`;
    } catch (_) { return ''; }
  }

  function renderNews(articles, liveCount = 0) {
    const feed = document.getElementById('news-feed');
    if (!feed) return;
    if (!articles.length) {
      feed.innerHTML = '<div class="news-loading">No articles at this time</div>';
      return;
    }
    feed.innerHTML = articles.map(a => {
      const tc   = toneClass(a.tone);
      const date = fmtNewsDate(a.date);
      const src  = a.source ? `<span class="news-src">${a.source}</span>` : '';
      const flag = a.country ? `<span class="news-country">${a.country}</span>` : '';
      return `
        <a class="news-item" href="${a.url}" target="_blank" rel="noopener noreferrer">
          <div class="news-title">${a.title || 'Untitled'}</div>
          <div class="news-meta">
            ${src}${flag}
            <span class="news-date">${date}</span>
            <span class="news-tone ${tc}">${parseFloat(a.tone||0) > 0 ? '+' : ''}${parseFloat(a.tone||0).toFixed(1)}</span>
          </div>
        </a>`;
    }).join('');
  }

  // Auto-refresh news every 3 min, Reddit every 5 min
  setInterval(loadNews, 180_000);
  setInterval(loadRedditFeed, 300_000);

  document.getElementById('refresh-news-btn')?.addEventListener('click', loadNews);
  document.getElementById('refresh-reddit-btn')?.addEventListener('click', loadRedditFeed);

  // ── Aircraft stats ─────────────────────────────────── */
  let acCountryData = {};
  function updateAircraftStats({ total, milCount, droneCount, countryCounts }) {
    acCountryData = countryCounts;

    const barsEl = document.getElementById('ac-country-bars');
    if (barsEl) {
      const sorted = Object.entries(countryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const maxVal = sorted[0]?.[1] || 1;
      barsEl.innerHTML = sorted.map(([name, count]) => {
        const pct   = Math.round(count / maxVal * 100);
        const color = UTILS.countryColor(name);
        const short = name.length > 12 ? name.slice(0, 12) + '…' : name;
        return `
          <div class="country-bar-row">
            <span class="cb-name" title="${name}">${short}</span>
            <div class="cb-bar"><div class="cb-fill" style="width:${pct}%;background:${color}"></div></div>
            <span class="cb-count">${count}</span>
          </div>`;
      }).join('');
    }

    const list   = document.getElementById('ac-list');
    if (!list) return;
    const states = AIRCRAFT.getData();
    const top40  = [...states]
      .filter(s => s[6] && s[5])
      .sort((a, b) => (b[7] || 0) - (a[7] || 0))
      .slice(0, 40);

    list.innerHTML = top40.map(s => {
      const cs    = (s[1] || '').trim() || s[0];
      const alt   = s[7] ? Math.round(s[7] * 3.281 / 100) / 10 + 'k ft' : '—';
      const spd   = s[9] ? Math.round(s[9] * 1.944) + 'kt' : '';
      const c     = s[2] || '?';
      const type  = AIRCRAFT.detectType(cs, s[8]);
      const color = AIRCRAFT.isMilitary(cs) ? '#ff9900' : UTILS.countryColor(c);
      const typeEmoji = { drone:'⊕', helicopter:'🚁', fighter:'⚔', bomber:'✈', cargo:'📦', vip:'⭐' }[type] || '✈';
      return `
        <div class="list-item" onclick="APP.flyTo(${s[6]},${s[5]})">
          <div class="li-dot" style="background:${color}"></div>
          <div class="li-type">${typeEmoji}</div>
          <div class="li-name">${cs}</div>
          <div class="li-info">${alt}${spd ? ' ' + spd : ''}</div>
        </div>`;
    }).join('');
  }

  // ── Satellite list ─────────────────────────────────── */
  function populateSatList(satData) {
    const list = document.getElementById('sat-list');
    if (!list) return;
    const sorted = [...satData].sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = sorted.slice(0, 100).map(s => {
      const cls   = s.name.match(/ISS|CSS|TIANGONG/i) ? 'station'
                  : s.name.match(/GPS|GLONASS|GALILEO/i) ? 'nav'
                  : s.name.match(/STARLINK/i) ? 'link'
                  : 'default';
      const color = { station:'#00d4ff', nav:'#aa44ff', link:'#ff9900', default:'#00ff88' }[cls];
      const alt   = s.pos ? Math.round(s.pos.alt) + ' km' : '—';
      return `
        <div class="list-item" onclick="APP.flyTo(${s.pos?.lat || 0},${s.pos?.lng || 0})">
          <div class="li-dot" style="background:${color}"></div>
          <div class="li-name">◉ ${s.name}</div>
          <div class="li-info">${alt}</div>
        </div>`;
    }).join('');
  }

  function highlightSat(name) {
    document.querySelectorAll('#sat-list .list-item').forEach(el => {
      el.classList.toggle('selected', el.querySelector('.li-name')?.textContent.includes(name));
    });
  }

  // ── Warhead inventory ────────────────────────────────
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

  // ── GPS Jam list ─────────────────────────────────────
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

  // ── Region Intel signals ─────────────────────────────
  const INTEL_ITEMS = [
    { region:'Eastern Med',    title:'GPS spoofing confirmed – EUROCONTROL NOTAM active',   prob:'CONFIRMED', time:'Live',   color:'#ff3333' },
    { region:'Baltic',         title:'RU Su-35 DACT activity near Finnish border',           prob:'HIGH',      time:'3h ago', color:'#ffaa00' },
    { region:'South China Sea',title:'PLAN carrier group exercise, DF-21D on alert',         prob:'HIGH',      time:'8h ago', color:'#ffaa00' },
    { region:'Korea',          title:'NK ICBM mobile launcher movement detected via SAR',    prob:'ELEVATED',  time:'1d ago', color:'#ff6666' },
    { region:'Syria',          title:'Increased Ru Tu-22M3 sorties from Hmeimim',           prob:'CONFIRMED', time:'Live',   color:'#ff3333' },
    { region:'Gaza',           title:'IDF F-35I airstrikes, Iron Dome intercepts',          prob:'CONFIRMED', time:'Live',   color:'#ff3333' },
    { region:'Ukraine',        title:'Kinzhal hypersonic usage against energy grid',         prob:'CONFIRMED', time:'12h ago',color:'#ff6600' },
    { region:'Taiwan Strait',  title:'PLA J-20 median line crossing – 4 aircraft',          prob:'HIGH',      time:'6h ago', color:'#ffaa00' },
  ];

  function populateIntel() {
    const el = document.getElementById('intel-list');
    if (!el) return;
    el.innerHTML = INTEL_ITEMS.map(it => `
      <div class="intel-item">
        <div class="intel-region">${it.region}</div>
        <div class="intel-title">${it.title}</div>
        <div class="intel-meta">
          <span class="intel-prob" style="color:${it.color}">${it.prob}</span>
          <span class="intel-time">${it.time}</span>
        </div>
      </div>`).join('');
  }

  // ── Country filter chips ─────────────────────────────
  const COUNTRIES = [
    'United States','Russia','China','United Kingdom','France',
    'Germany','India','Japan','Israel','Turkey','Iran','Pakistan',
    'North Korea','Ukraine','South Korea','Brazil','Australia',
    'Canada','Saudi Arabia','UAE','NATO',
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
             style="border-color:${color}33"
             onclick="SIDEBAR.toggleCountry('${c}')">
          ${flag} ${c.split(' ').slice(-1)[0]}
        </div>`;
    }).join('');
  }

  function toggleCountry(c) {
    if (activeCountries.has(c)) {
      activeCountries.delete(c);
    } else {
      activeCountries.add(c);
      // Fly to country on map
      if (COUNTRY_COORDS[c]) {
        APP.flyTo(COUNTRY_COORDS[c][0], COUNTRY_COORDS[c][1], 5);
      }
    }

    const chip = document.querySelector(`.country-chip[data-country="${c}"]`);
    chip?.classList.toggle('active', activeCountries.has(c));

    AIRCRAFT.setCountryFilter([...activeCountries]);
    addFeedItem('military', activeCountries.size
      ? `Filter + fly-to: ${[...activeCountries].join(', ')}`
      : 'Country filter cleared');
  }

  // ── Sat tab switching ────────────────────────────────
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
    populateWarheads();
    initSatTabs();
    setTimeout(loadNews, 1500);
    setTimeout(loadRedditFeed, 3000);
  }

  return {
    addFeedItem, updateAircraftStats, populateSatList, highlightSat,
    populateWarheads, populateGPSJam, buildCountryFilter, toggleCountry,
    loadNews, loadRedditFeed, init
  };
})();
