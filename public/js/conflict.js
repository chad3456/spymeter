/* ── SPYMETER — Global Unrest Tracker ──────────────────────
   Data:    GDELT API (real news, ~15-30min latency)
   Twitter: embedded public search (live tweets)
   Video:   YouTube 24/7 live news streams
   Strike map: Globe.gl arcs (confirmed OSINT routes)
   ────────────────────────────────────────────────────────── */
const CONFLICT = (() => {
  let visible   = false;
  let activeTab = 'iran';

  // ── Iran-Israel Strike Arcs ──────────────────────────────
  const STRIKE_ARCS = [
    { startLat:32.4, startLng:53.7, endLat:31.8, endLng:35.2, color:'#ff2200', alt:0.55, speed:2000, stroke:1.8, label:'🚀 Iran→Israel Ballistic Missile', type:'missile', active:true },
    { startLat:32.4, startLng:51.7, endLat:31.8, endLng:35.2, color:'#ff8800', alt:0.20, speed:3500, stroke:1.2, label:'✈ Iran→Israel Shahed-136 Drone', type:'drone', active:true },
    { startLat:33.5, startLng:35.5, endLat:32.8, endLng:35.0, color:'#ffaa00', alt:0.08, speed:1200, stroke:1.0, label:'🚀 Hezbollah→N.Israel Rocket', type:'missile', active:true },
    { startLat:15.3, startLng:44.2, endLat:31.8, endLng:35.2, color:'#ff9900', alt:0.22, speed:4000, stroke:0.9, label:'✈ Houthi→Israel Drone (1800km)', type:'drone', active:true },
    { startLat:15.3, startLng:44.2, endLat:13.5, endLng:43.5, color:'#ffcc00', alt:0.12, speed:2000, stroke:1.0, label:'🚀 Houthi→Red Sea Anti-Ship', type:'missile', active:true },
    { startLat:55.7, startLng:37.6, endLat:50.4, endLng:30.5, color:'#ff3300', alt:0.45, speed:1800, stroke:1.5, label:'🚀 Russia→Kyiv Kinzhal/Iskander', type:'missile', active:true },
    { startLat:51.5, startLng:46.2, endLat:49.9, endLng:36.2, color:'#ff5500', alt:0.30, speed:1500, stroke:1.2, label:'🚀 Russia→Kharkiv Shahed', type:'drone', active:true },
    { startLat:39.8, startLng:125.7, endLat:41.0, endLng:135.0, color:'#aa0033', alt:0.65, speed:2200, stroke:1.3, label:'🚀 N.Korea ICBM Test — Sea of Japan', type:'missile', active:true },
  ];

  // ── Iran-Israel Confirmed Timeline ───────────────────────
  const IRAN_TIMELINE = [
    { date:'Apr 13 2024', event:'Iran fires 170 drones + 120 ballistic missiles at Israel — 99% intercepted by Iron Dome/Arrow/David\'s Sling', type:'strike', severity:'critical' },
    { date:'Apr 19 2024', event:'Israel retaliatory drone strike on Isfahan air defense radar site', type:'strike', severity:'high' },
    { date:'Jul 31 2024', event:'Israel assassinates Hamas chief Ismail Haniyeh in Tehran', type:'event', severity:'high' },
    { date:'Sep 17 2024', event:'Hezbollah pager/radio explosions — 12 killed, 2,800+ injured (attributed to Mossad)', type:'event', severity:'critical' },
    { date:'Sep 27 2024', event:'Israel kills Hezbollah leader Hassan Nasrallah in Beirut airstrike', type:'strike', severity:'critical' },
    { date:'Oct 1 2024', event:'Iran fires 180 ballistic missiles at Israel — 2nd direct attack', type:'strike', severity:'critical' },
    { date:'Oct 26 2024', event:'Israel retaliates with F-35I strikes on Iranian air defense + missile production sites', type:'strike', severity:'high' },
    { date:'Nov 2024', event:'IDF expands Gaza ground operation; Hezbollah ceasefire brokered but fragile', type:'ongoing', severity:'high' },
    { date:'Ongoing', event:'Iran proxy network: Hezbollah (Lebanon), Hamas (Gaza), Houthi (Yemen), PMF (Iraq)', type:'ongoing', severity:'elevated' },
  ];

  // ── Ukraine/Russia Confirmed Timeline ───────────────────
  const UKRAINE_TIMELINE = [
    { date:'Feb 24 2022', event:'Russia invades Ukraine — full-scale invasion begins across northern, eastern and southern fronts', type:'strike', severity:'critical' },
    { date:'Apr 2022', event:'Russia withdraws from Kyiv region; Bucha massacre evidence emerges', type:'event', severity:'critical' },
    { date:'Sep 2022', event:'Ukraine launches Kharkiv counteroffensive — retakes 6,000+ km² in weeks', type:'event', severity:'high' },
    { date:'Nov 2022', event:'Ukraine retakes Kherson city — major symbolic victory', type:'event', severity:'high' },
    { date:'Jun 2023', event:'Wagner mutiny: Prigozhin marches on Moscow before deal; dies in plane crash Aug 2023', type:'event', severity:'critical' },
    { date:'Aug 2024', event:'Ukraine launches cross-border offensive into Kursk region (Russia proper)', type:'strike', severity:'critical' },
    { date:'Nov 2024', event:'North Korean troops deployed to Russia to fight alongside Russian forces in Kursk', type:'event', severity:'critical' },
    { date:'2025', event:'Front lines largely static along Zaporizhzhia-Donetsk axis; ongoing missile/drone exchanges', type:'ongoing', severity:'high' },
    { date:'Ongoing', event:'Russia continues mass Shahed drone + Iskander/Kinzhal missile salvos on Ukrainian cities', type:'ongoing', severity:'elevated' },
  ];

  // ── Global Unrest Static Fallback Events ─────────────────
  const GLOBAL_EVENTS = [
    { region:'SUDAN', flag:'🇸🇩', event:'RSF vs SAF civil war — 9M+ displaced, worst humanitarian crisis 2024', severity:'critical' },
    { region:'MYANMAR', flag:'🇲🇲', event:'Military junta vs resistance — ARSA/PDF/ethnic militias control 60%+ territory', severity:'critical' },
    { region:'HAITI', flag:'🇭🇹', event:'Gang control of 80%+ Port-au-Prince — government collapsed, UN mission deployed', severity:'critical' },
    { region:'ETHIOPIA', flag:'🇪🇹', event:'Amhara conflict ongoing after Tigray ceasefire — ENDF vs Fano militias', severity:'high' },
    { region:'DEM. CONGO', flag:'🇨🇩', event:'M23/Rwanda-backed advance on Goma — over 7M internally displaced', severity:'critical' },
    { region:'SOMALIA', flag:'🇸🇴', event:'Al-Shabaab insurgency continues — regular AMISOM/US drone strikes', severity:'high' },
    { region:'PAKISTAN', flag:'🇵🇰', event:'PTI protests + TTP insurgency in Khyber Pakhtunkhwa escalating', severity:'high' },
    { region:'VENEZUELA', flag:'🇻🇪', event:'Maduro claims disputed election win — mass protests, opposition arrested', severity:'high' },
    { region:'GEORGIA', flag:'🇬🇪', event:'Pro-EU protests vs Russian-aligned ruling party — thousands in Tbilisi streets', severity:'elevated' },
    { region:'BANGLADESH', flag:'🇧🇩', event:'Sheikh Hasina ousted in student-led revolution — interim government installed', severity:'high' },
    { region:'NIGER/MALI/BURKINA', flag:'🌍', event:'Sahel coup belt — AES alliance formed, French/UN forces expelled', severity:'high' },
    { region:'MEXICO', flag:'🇲🇽', event:'Cartel violence — CJNG/Sinaloa war ongoing; record femicide/journalist killings', severity:'high' },
  ];

  // ── Live News Static Fallback: Iran/Israel ───────────────
  const STATIC_IRAN = [
    { title:'Iran issues new threats following Israeli strikes on air defense sites near Tehran', url:'#', source:'Jerusalem Post', tone:'-8.5', country:'Iran' },
    { title:'IDF F-35I Adir squadron on 24-hour alert at Nevatim Air Base', url:'#', source:'IDF Spokesperson', tone:'-6.0', country:'Israel' },
    { title:'IRGC Aerospace Force missile depots restocked — satellite imaging confirms', url:'#', source:'ISW', tone:'-7.2', country:'Iran' },
    { title:'Iron Dome, Arrow-3 and David\'s Sling interception rates above 90% — IDF assessment', url:'#', source:'IDF Research', tone:'2.1', country:'Israel' },
    { title:'US 5th Fleet carrier strike group maintained in Eastern Mediterranean for deterrence', url:'#', source:'USNI News', tone:'-3.0', country:'USA' },
    { title:'Hezbollah rebuilding rocket arsenal in South Lebanon despite ceasefire', url:'#', source:'Reuters', tone:'-5.4', country:'Lebanon' },
    { title:'Iran Fordow enrichment facility continues 60% U-235 production — IAEA report', url:'#', source:'IAEA', tone:'-7.8', country:'Iran' },
    { title:'Houthi anti-ship drone/missile attacks on Red Sea shipping exceed 150 incidents', url:'#', source:'UKMTO', tone:'-6.5', country:'Yemen' },
  ];

  // ── Live News Static Fallback: Ukraine ───────────────────
  const STATIC_UKRAINE = [
    { title:'Russia launches largest Shahed drone swarm attack on Ukrainian energy grid', url:'#', source:'Kyiv Independent', tone:'-8.0', country:'Russia' },
    { title:'Ukraine Kursk incursion: North Korean troops suffered heavy casualties — US intelligence', url:'#', source:'WSJ', tone:'-6.5', country:'Ukraine' },
    { title:'F-16s operational in Ukraine — first aerial engagement with Russian aircraft confirmed', url:'#', source:'Reuters', tone:'-5.0', country:'Ukraine' },
    { title:'Russia\'s defense spending reaches 40% of federal budget — wartime economy', url:'#', source:'ISW', tone:'-4.5', country:'Russia' },
    { title:'Patriot missile system intercepts Kinzhal hypersonic missile over Kyiv — confirmed', url:'#', source:'Politico', tone:'3.2', country:'Ukraine' },
    { title:'Zelensky urges NATO members to authorize long-range strikes on Russian territory', url:'#', source:'BBC', tone:'-5.5', country:'Ukraine' },
    { title:'Ukraine\'s Zaporizhzhia nuclear plant: cooling systems at risk — IAEA warning', url:'#', source:'IAEA', tone:'-7.0', country:'Ukraine' },
    { title:'Western Europe increases artillery shell production — Rheinmetall 155mm capacity tripled', url:'#', source:'DW', tone:'2.0', country:'Germany' },
  ];

  // ── Live News Static Fallback: Global ────────────────────
  const STATIC_GLOBAL = [
    { title:'Sudan RSF advances on El Fasher — final SAF stronghold in Darfur under siege', url:'#', source:'Al Jazeera', tone:'-8.5', country:'Sudan' },
    { title:'DRC: M23 rebels seize Goma airport — Rwanda-backed advance stalls aid corridors', url:'#', source:'Reuters', tone:'-7.0', country:'DRC' },
    { title:'Myanmar junta loses Mandalay outskirts as Three Brotherhood Alliance advances', url:'#', source:'Irrawaddy', tone:'-6.5', country:'Myanmar' },
    { title:'Haiti PM resigns amid unprecedented gang violence — transitional council collapses', url:'#', source:'AP', tone:'-8.0', country:'Haiti' },
    { title:'Sahel: Burkina Faso, Mali, Niger formally leave ECOWAS — new AES bloc established', url:'#', source:'RFI', tone:'-5.0', country:'Mali' },
    { title:'Pakistan-India tensions surge after cross-LoC shelling in Kashmir', url:'#', source:'Dawn', tone:'-7.5', country:'Pakistan' },
    { title:'Venezuela: Maduro arrests 200+ opposition figures after disputed election results', url:'#', source:'BBC', tone:'-8.0', country:'Venezuela' },
    { title:'North Sea: NATO intercepts Russian intelligence vessels near critical undersea cables', url:'#', source:'FT', tone:'-5.5', country:'Russia' },
    { title:'Taiwan Strait tensions: PLA conducts largest-ever military exercises near Taiwan', url:'#', source:'Reuters', tone:'-7.0', country:'China' },
    { title:'Ethiopia: Tigray ceasefire holding but Amhara conflict escalating — OCHA warning', url:'#', source:'UN', tone:'-6.0', country:'Ethiopia' },
  ];

  // ── Live Video Channels ──────────────────────────────────
  // handle = YouTube @handle used by /api/live-video to scrape the live stream ID.
  // fallbackId = hardcoded ID used if server scraping fails.
  // Server caches live IDs for 10 min, so each channel always shows the current live stream.
  const VIDEO_CHANNELS = [
    { id:'aljaz',   label:'Al Jazeera',  flag:'🌍', handle:'aljazeeraenglish', fallbackId:'jNQXAC9IVRw', color:'#ff9900' },
    { id:'bbc',     label:'BBC News',    flag:'🇬🇧', handle:'BBCNews',          fallbackId:'w_Ma4oQLyh0', color:'#BB1919' },
    { id:'france24',label:'France 24',   flag:'🇫🇷', handle:'FRANCE24',         fallbackId:'l8PMl7tUDIE', color:'#0055A4' },
    { id:'dw',      label:'DW News',     flag:'🇩🇪', handle:'dwnews',           fallbackId:'mGFSSBqXqWU', color:'#CC0000' },
    { id:'wion',    label:'WION',        flag:'🇮🇳', handle:'wionlive',         fallbackId:'GtO7fBzRQPI', color:'#E63946' },
    { id:'trt',     label:'TRT World',   flag:'🇹🇷', handle:'trtworld',         fallbackId:'naxpSC4E9ZY', color:'#E30A17' },
    { id:'ndtv',    label:'NDTV 24x7',   flag:'🇮🇳', handle:'ndtv',             fallbackId:'Gx9SzuTGMEw', color:'#ff8800' },
  ];

  // ── Tab switching ────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.ctab-body').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.ctab').forEach(el => el.classList.remove('active'));
    const body = document.getElementById(`ctab-${tab}`);
    const btn  = document.querySelector(`.ctab[data-ctab="${tab}"]`);
    if (body) body.style.display = 'flex';
    if (btn)  btn.classList.add('active');
    if (tab === 'iran')    loadConflictNews();
    if (tab === 'ukraine') loadUkraineNews();
    if (tab === 'global')  loadUnrestNews();
    if (tab === 'video')      initVideoTab();
    if (tab === 'simulation') SIMULATION.init();
    if (window.twttr?.widgets) window.twttr.widgets.load();
  }

  // ── GDELT loaders ────────────────────────────────────────
  async function loadGDELT(endpoint, elId, staticFallback) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<div class="conflict-loading">⟳ Fetching live intel from GDELT…</div>';
    try {
      const resp = await window.fetch(endpoint);
      const data = resp.ok ? await resp.json() : { articles: [] };
      const live = (data.articles || []).filter(a => a.title?.length > 10);
      renderConflictNews(elId, [...live, ...staticFallback].slice(0, 20), live.length > 0);
    } catch (_) {
      renderConflictNews(elId, staticFallback, false);
    }
  }

  function loadConflictNews() { loadGDELT('/api/conflict-news', 'conflict-news-list', STATIC_IRAN); }
  function loadUkraineNews()  { loadGDELT('/api/ukraine-news',  'ukraine-news-list',  STATIC_UKRAINE); }
  function loadUnrestNews()   { loadGDELT('/api/unrest-news',   'global-news-list',   STATIC_GLOBAL); }

  function renderConflictNews(elId, articles, hasLive) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = articles.map((a, i) => {
      const isLive = hasLive && i < (articles.length - (elId === 'conflict-news-list' ? 8 : (elId === 'ukraine-news-list' ? 8 : 10)));
      const tc = parseFloat(a.tone || 0) < -3 ? 'tone-neg' : parseFloat(a.tone || 0) > 3 ? 'tone-pos' : 'tone-neu';
      return `
        <a class="conflict-article" href="${a.url}" target="_blank" rel="noopener">
          ${isLive ? '<span class="badge-live-sm">LIVE</span>' : ''}
          <div class="conflict-article-title">${a.title}</div>
          <div class="conflict-article-meta">
            <span>${a.source || 'OSINT'}</span>
            ${a.country ? `<span>${a.country}</span>` : ''}
            <span class="news-tone ${tc}">${parseFloat(a.tone || 0).toFixed(1)}</span>
          </div>
        </a>`;
    }).join('');
  }

  // ── Timeline renderer ─────────────────────────────────────
  function renderTimeline(elId, items) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = items.map(e => {
      const sc = { critical:'#ff2244', high:'#ff9900', elevated:'#ffdd00', ongoing:'#00aaff' }[e.severity] || '#888';
      const ic = { strike:'🚀', event:'⚡', ongoing:'🔄' }[e.type] || '•';
      return `
        <div class="timeline-item">
          <div class="timeline-dot" style="background:${sc}; box-shadow:0 0 6px ${sc}"></div>
          <div class="timeline-body">
            <div class="timeline-date">${e.date}</div>
            <div class="timeline-text">${ic} ${e.event}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Global events renderer ───────────────────────────────
  function renderGlobalEvents() {
    const el = document.getElementById('global-events-list');
    if (!el) return;
    const sevColor = { critical:'#ff2244', high:'#ff9900', elevated:'#ffdd00' };
    el.innerHTML = GLOBAL_EVENTS.map(e => `
      <div class="global-event-item">
        <span class="global-flag">${e.flag}</span>
        <div class="global-event-body">
          <div class="global-region" style="color:${sevColor[e.severity]||'#888'}">${e.region}</div>
          <div class="global-event-text">${e.event}</div>
        </div>
        <div class="sev-dot" style="background:${sevColor[e.severity]||'#888'}"></div>
      </div>`).join('');
  }

  // ── Video tab ────────────────────────────────────────────
  let activeVideo = 'aljaz';
  function initVideoTab() {
    const btnWrap = document.getElementById('video-channel-btns');
    const frame   = document.getElementById('live-video-frame');
    if (!btnWrap || !frame) return;
    if (btnWrap.children.length === 0) {
      VIDEO_CHANNELS.forEach(ch => {
        const btn = document.createElement('button');
        btn.className = 'vchan-btn' + (ch.id === activeVideo ? ' active' : '');
        btn.dataset.chan = ch.id;
        btn.innerHTML = `${ch.flag} ${ch.label}`;
        btn.style.setProperty('--vcol', ch.color);
        btn.onclick = () => switchVideo(ch.id);
        btnWrap.appendChild(btn);
      });
    }
    switchVideo(activeVideo);
  }

  async function switchVideo(chanId) {
    activeVideo = chanId;
    const ch    = VIDEO_CHANNELS.find(c => c.id === chanId);
    const frame = document.getElementById('live-video-frame');
    const loadMsg = document.getElementById('video-load-msg');
    if (!ch || !frame) return;
    document.querySelectorAll('.vchan-btn').forEach(b => b.classList.toggle('active', b.dataset.chan === chanId));

    // Show loading feedback
    if (loadMsg) { loadMsg.textContent = `⟳ Loading ${ch.label} live stream…`; loadMsg.style.display = 'block'; }
    frame.style.opacity = '0.3';

    let videoId = ch.fallbackId;
    try {
      // Server scrapes YouTube @handle/live page to get the current live stream ID
      const resp = await fetch(`/api/live-video?channel=${ch.handle}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.videoId) videoId = data.videoId;
      }
    } catch (_) {}

    frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0&iv_load_policy=3&modestbranding=1`;
    frame.style.opacity = '1';
    if (loadMsg) loadMsg.style.display = 'none';
  }

  // ── Show / Hide / Toggle ─────────────────────────────────
  function show() {
    visible = true;
    const panel = document.getElementById('conflict-panel');
    if (!panel) return;
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    switchTab(activeTab);
  }

  function hide() {
    visible = false;
    const panel = document.getElementById('conflict-panel');
    if (panel) panel.style.display = 'none';
    // Pause video
    const frame = document.getElementById('live-video-frame');
    if (frame) frame.src = 'about:blank';
  }

  function toggle() { visible ? hide() : show(); }
  function getArcs() { return STRIKE_ARCS; }

  // Public init (called after DOM ready)
  function initTimelines() {
    renderTimeline('iran-timeline',    IRAN_TIMELINE);
    renderTimeline('ukraine-timeline', UKRAINE_TIMELINE);
    renderGlobalEvents();
  }

  return {
    show, hide, toggle, getArcs, loadConflictNews, loadUkraineNews, loadUnrestNews,
    switchTab, initTimelines,
  };
})();

document.addEventListener('DOMContentLoaded', () => CONFLICT.initTimelines());
