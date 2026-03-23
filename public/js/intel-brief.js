/* ── INTEL_BRIEF — AI Intelligence Brief Portal ───────────────────────────────
   Groq llama-3.3-70b-versatile + GDELT context snapshot
   Docked bottom panel: collapsed tab → expanded brief + sources
   Triggers: map click (reverse geocode), country card clicks, manual search
   ─────────────────────────────────────────────────────────────────────────── */
const INTEL_BRIEF = (() => {

  // ── Quick-access country presets ─────────────────────────────────────────
  const QUICK = [
    { flag:'🇺🇸', name:'United States' }, { flag:'🇷🇺', name:'Russia'        },
    { flag:'🇨🇳', name:'China'         }, { flag:'🇮🇳', name:'India'         },
    { flag:'🇮🇱', name:'Israel'        }, { flag:'🇮🇷', name:'Iran'          },
    { flag:'🇺🇦', name:'Ukraine'       }, { flag:'🇵🇰', name:'Pakistan'      },
    { flag:'🇰🇵', name:'North Korea'   }, { flag:'🇸🇦', name:'Saudi Arabia'  },
    { flag:'🇩🇪', name:'Germany'       }, { flag:'🇹🇷', name:'Turkey'        },
  ];

  // ── State ─────────────────────────────────────────────────────────────────
  let _open        = false;
  let _lang        = 'en';
  let _country     = '';
  let _loading     = false;
  let _typeTimer   = null;
  let _lastCountry = '';
  let _panel       = null;
  let _history     = []; // last 5 countries

  // ── Build DOM ─────────────────────────────────────────────────────────────
  function _build() {
    if (_panel) return;

    _panel = document.createElement('div');
    _panel.id = 'intel-portal';
    _panel.innerHTML = `
      <!-- Collapsed tab ─────────────────────────────────── -->
      <div id="ip-tab" onclick="INTEL_BRIEF.toggle()">
        <span class="ip-tab-dot"></span>
        <span class="ip-tab-label">🧠 AI INTEL BRIEF</span>
        <span id="ip-tab-country"></span>
        <span class="ip-tab-hint">click country on map or search ↓</span>
        <span id="ip-tab-chevron">▲</span>
      </div>

      <!-- Expanded body ─────────────────────────────────── -->
      <div id="ip-body">

        <!-- Search row -->
        <div class="ip-search-row">
          <div class="ip-search-wrap">
            <input id="ip-input" class="ip-input" type="text" placeholder="Country name…"
              autocomplete="off" spellcheck="false"
              oninput="INTEL_BRIEF._onInput(this.value)"
              onkeydown="if(event.key==='Enter') INTEL_BRIEF.brief(this.value)"/>
            <div id="ip-suggestions" class="ip-suggestions"></div>
          </div>
          <button class="ip-go-btn" onclick="INTEL_BRIEF.brief(document.getElementById('ip-input').value)">BRIEF</button>
          <div class="ip-lang-wrap">
            <button class="ip-lang-btn${_lang==='en'?' active':''}" onclick="INTEL_BRIEF.setLang('en',this)">EN</button>
            <button class="ip-lang-btn${_lang==='fr'?' active':''}" onclick="INTEL_BRIEF.setLang('fr',this)">FR</button>
          </div>
          <button class="ip-close-btn" onclick="INTEL_BRIEF.toggle()" title="Collapse">✕</button>
        </div>

        <!-- Quick presets -->
        <div class="ip-quick-row" id="ip-quick">
          ${QUICK.map(q => `<button class="ip-qbtn" onclick="INTEL_BRIEF.brief('${q.name}')">${q.flag} ${q.name}</button>`).join('')}
        </div>

        <!-- Content area -->
        <div id="ip-content" class="ip-content">
          <div class="ip-placeholder">
            <span class="ip-ph-icon">🛰</span>
            <span>Click any country on the map, use the search above, or select a quick preset to generate an AI intelligence brief.</span>
          </div>
        </div>

      </div>
    `;
    document.body.appendChild(_panel);

    // Map click listener — reverse geocode → auto-brief
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.addEventListener('click', _onMapClick);
    }
  }

  // ── Suggestion autocomplete ───────────────────────────────────────────────
  const COUNTRY_LIST = [
    'Afghanistan','Albania','Algeria','Angola','Argentina','Armenia','Australia',
    'Austria','Azerbaijan','Bangladesh','Belarus','Belgium','Bolivia','Bosnia',
    'Brazil','Bulgaria','Burkina Faso','Cambodia','Cameroon','Canada','Chad',
    'Chile','China','Colombia','Congo DRC','Costa Rica','Croatia','Cuba','Cyprus',
    'Czech Republic','Denmark','Dominican Republic','Ecuador','Egypt','Estonia',
    'Ethiopia','Finland','France','Georgia','Germany','Ghana','Greece','Guatemala',
    'Haiti','Honduras','Hungary','India','Indonesia','Iran','Iraq','Ireland',
    'Israel','Italy','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Kyrgyzstan',
    'Laos','Latvia','Lebanon','Libya','Lithuania','Malaysia','Mali','Mexico',
    'Moldova','Morocco','Mozambique','Myanmar','Nepal','Netherlands','Nicaragua',
    'Niger','Nigeria','North Korea','Norway','Oman','Pakistan','Palestine','Panama',
    'Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia',
    'Saudi Arabia','Senegal','Serbia','Sierra Leone','Somalia','South Korea',
    'South Sudan','Spain','Sri Lanka','Sudan','Sweden','Switzerland','Syria',
    'Taiwan','Tajikistan','Tanzania','Thailand','Turkey','Turkmenistan','Uganda',
    'Ukraine','United Arab Emirates','United Kingdom','United States','Uruguay',
    'Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
  ];

  function _onInput(val) {
    const box = document.getElementById('ip-suggestions');
    if (!box) return;
    const q = val.trim().toLowerCase();
    if (!q || q.length < 2) { box.style.display = 'none'; return; }
    const matches = COUNTRY_LIST.filter(c => c.toLowerCase().startsWith(q)).slice(0, 6);
    if (!matches.length) { box.style.display = 'none'; return; }
    box.innerHTML = matches.map(c =>
      `<div class="ip-sug" onclick="INTEL_BRIEF.brief('${c}')">${c}</div>`
    ).join('');
    box.style.display = 'block';
  }

  // ── Map click → reverse geocode ───────────────────────────────────────────
  let _revGeoThrottle = 0;
  function _onMapClick(e) {
    // Only trigger if intel portal is open or user recently interacted with it
    if (!_open && !window._intelAutoTrigger) return;
    const now = Date.now();
    if (now - _revGeoThrottle < 2000) return;
    _revGeoThrottle = now;

    // Get Leaflet map lat/lng from the click
    const map = window._leafletMap;
    if (!map) return;
    const rect = e.target.getBoundingClientRect();
    const pt   = map.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top]);
    if (!pt) return;

    fetch(`/api/reverse-geo?lat=${pt.lat.toFixed(4)}&lng=${pt.lng.toFixed(4)}`)
      .then(r => r.json())
      .then(d => {
        if (d.country) {
          _open = true;
          _showBody();
          brief(d.country);
        }
      })
      .catch(() => {});
  }

  // ── Show / hide panel body ────────────────────────────────────────────────
  function _showBody() {
    const body = document.getElementById('ip-body');
    const chev = document.getElementById('ip-tab-chevron');
    if (body) body.style.display = 'flex';
    if (chev) chev.textContent = '▼';
  }

  function _hideBody() {
    const body = document.getElementById('ip-body');
    const chev = document.getElementById('ip-tab-chevron');
    if (body) body.style.display = 'none';
    if (chev) chev.textContent = '▲';
  }

  // ── Render brief text with typewriter effect ──────────────────────────────
  function _typewrite(el, text, speed = 8) {
    if (_typeTimer) clearInterval(_typeTimer);
    el.textContent = '';
    let i = 0;
    _typeTimer = setInterval(() => {
      if (i >= text.length) { clearInterval(_typeTimer); _typeTimer = null; return; }
      // Chunk 3 chars per tick for speed
      el.textContent += text.slice(i, i + 3);
      i += 3;
      // Auto-scroll
      const content = document.getElementById('ip-content');
      if (content) content.scrollTop = content.scrollHeight;
    }, speed);
  }

  // ── Fetch and render a brief ──────────────────────────────────────────────
  async function brief(country) {
    country = (country || '').trim();
    if (!country || _loading) return;

    // Close suggestion dropdown
    const sug = document.getElementById('ip-suggestions');
    if (sug) sug.style.display = 'none';

    // Update input
    const inp = document.getElementById('ip-input');
    if (inp) inp.value = country;

    // Open panel if closed
    _open = true;
    _showBody();
    _country = country;
    _lastCountry = country;

    // Update tab label
    const tabCountry = document.getElementById('ip-tab-country');
    if (tabCountry) tabCountry.textContent = `— ${country}`;

    // Highlight quick button if matches
    document.querySelectorAll('.ip-qbtn').forEach(b => {
      b.classList.toggle('active', b.textContent.includes(country));
    });

    // Show loading state
    _loading = true;
    const content = document.getElementById('ip-content');
    if (content) content.innerHTML = `
      <div class="ip-loading">
        <div class="ip-loading-orb"></div>
        <div class="ip-loading-txt">Analyzing <b>${country}</b>…<br>
          <span>Fetching GDELT · Building context · Querying Groq llama-3.3</span>
        </div>
      </div>`;

    try {
      const r = await fetch(`/api/intel-brief?country=${encodeURIComponent(country)}&lang=${_lang}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      _loading = false;
      _renderBrief(d);

      // Add to history
      if (!_history.includes(country)) {
        _history.unshift(country);
        _history = _history.slice(0, 5);
      }
    } catch (e) {
      _loading = false;
      if (content) content.innerHTML = `<div class="ip-error">⚠ Brief unavailable: ${e.message}</div>`;
    }
  }

  // ── Render the full brief card ────────────────────────────────────────────
  function _renderBrief(d) {
    const content = document.getElementById('ip-content');
    if (!content) return;

    const ctx = d.context || {};
    const sig = [
      ctx.conflict_signals  ? `⚔ ${ctx.conflict_signals} conflict`   : '',
      ctx.diplomacy_signals ? `🤝 ${ctx.diplomacy_signals} diplomacy` : '',
      ctx.economic_signals  ? `📈 ${ctx.economic_signals} economic`   : '',
      ctx.protest_signals   ? `✊ ${ctx.protest_signals} protest`      : '',
    ].filter(Boolean).join(' · ');

    const toneColor = ctx.avg_tone < -2 ? '#ff4444' : ctx.avg_tone > 2 ? '#00cc88' : '#ffaa00';
    const toneLabel = ctx.avg_tone < -2 ? 'HOSTILE' : ctx.avg_tone > 2 ? 'POSITIVE' : 'NEUTRAL';

    const srcHTML = (d.articles || []).slice(0, 5).map(a =>
      `<a class="ip-src-link" href="${a.url}" target="_blank" rel="noopener">${a.source ? `[${a.source}] ` : ''}${a.title.slice(0, 90)}${a.title.length > 90 ? '…' : ''}</a>`
    ).join('');

    const cachedBadge = d.cached ? '<span class="ip-cached-badge">CACHED</span>' : '<span class="ip-live-badge">LIVE</span>';

    content.innerHTML = `
      <div class="ip-brief-wrap">
        <!-- Header -->
        <div class="ip-brief-hdr">
          <div class="ip-brief-title">${d.country}</div>
          <div class="ip-brief-meta">
            ${cachedBadge}
            <span class="ip-brief-lang">${d.lang?.toUpperCase() || 'EN'}</span>
            <span class="ip-brief-src">Groq llama-3.3 · GDELT 72h</span>
            <span style="color:${toneColor};font-size:7px;font-weight:700">${toneLabel}</span>
          </div>
        </div>

        <!-- Context signal bar -->
        ${sig ? `<div class="ip-sig-bar">${sig} · <span style="color:#3d5a78">avg tone: <b style="color:${toneColor}">${ctx.avg_tone}</b></span></div>` : ''}

        <!-- Brief text (typewriter) -->
        <div class="ip-brief-text" id="ip-brief-text-body"></div>

        <!-- Source articles -->
        ${srcHTML ? `<div class="ip-sources"><div class="ip-src-hdr">📰 GDELT Sources (${d.articles?.length || 0})</div>${srcHTML}</div>` : ''}

        <!-- Actions -->
        <div class="ip-actions">
          <button class="ip-act-btn" onclick="INTEL_BRIEF.brief('${d.country}')">↻ REFRESH</button>
          <button class="ip-act-btn" onclick="INTEL_BRIEF.setLang(_lang==='en'?'fr':'en')">
            ${d.lang === 'en' ? '🇫🇷 EN→FR' : '🇬🇧 FR→EN'}
          </button>
          <button class="ip-act-btn" onclick="INTEL_BRIEF._copyBrief()">📋 COPY</button>
          <span style="color:#2a4060;font-size:6.5px;margin-left:auto">${new Date(d.ts).toLocaleTimeString()}</span>
        </div>
      </div>
    `;

    // Typewrite the brief
    const briefBody = document.getElementById('ip-brief-text-body');
    if (briefBody && d.brief) _typewrite(briefBody, d.brief, 6);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    init() { _build(); },

    toggle() {
      _open = !_open;
      _open ? _showBody() : _hideBody();
    },

    brief,

    setLang(lang, btn) {
      _lang = lang;
      document.querySelectorAll('.ip-lang-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      // Re-brief current country in new language
      if (_lastCountry) brief(_lastCountry);
    },

    _onInput,

    _copyBrief() {
      const el = document.getElementById('ip-brief-text-body');
      if (!el) return;
      navigator.clipboard?.writeText(el.textContent).catch(() => {});
    },

    // Called externally (e.g. country card clicks in right panel)
    trigger(country) {
      window._intelAutoTrigger = true;
      _open = true;
      _showBody();
      brief(country);
    },
  };
})();

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => INTEL_BRIEF.init());
