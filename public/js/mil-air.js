/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — Military Air Traffic OSINT Layer
   Data: OpenSky Network · ADSB.fi · open-source callsign classification
   Covers: USAF AMC, USN, RAF, NATO allies, ISR/recon, tankers, VIP transport
════════════════════════════════════════════════════════════════════════════ */
const MIL_AIR = (() => {
  let map = null;
  let enabled = false;
  let markers = [];
  let _timer = null;
  let _lastData = [];

  // Military callsign prefixes (open-source / public knowledge)
  const MIL_PREFIXES = [
    // US Air Force AMC
    'REACH','RCH','SPAR','HOBO','DOOM','ROCKY','JAKE','BLUE','GHOST',
    'ANGEL','KNIFE','TITAN','HAVOC','RAIDER','VIPER','SLAM','COPE',
    'RAVEN','EAGLE','HAWK','FALCON','COBRA','SNAKE','BUCK',
    // US Navy/Marines
    'NAVY','USMC','TOPGUN','ZEUS','HELO','CORSAIR',
    // Special Air Mission (presidential/VIP)
    'SAM','AF1','AF2','MARINE','EXEC',
    // UK RAF
    'RRR','ASCOT','TARTAN','ROYAL','ENVOY','UKAIR',
    // NATO/Allies
    'NATO','NCSA','GAF','FRAF','ITAF','RNLAF','BELAF','POLAF',
    'CANF','DANAF','NORAIR','SWAF','FINAF','HUNAF',
    // ISR/Recon
    'COBRA77','IRON','SIGINT','RIVET','DRAGON','OPR',
    // Tankers
    'LUSH','SHELL','TEXACO','ARCO','PETROL',
    // Cargo
    'ATLAS','SENTRY','HERKY',
    // Russian (when squawking)
    'RFF','VMF','ALMAZ','URAL',
    // India
    'IAF','INDIA','RESCUE'
  ];

  // Military ICAO hex ranges (publicly documented)
  const MIL_HEX_RANGES = [
    { min: 0xADF7C8, max: 0xAFFFFF, country:'USA', note:'USAF/USN block' },
    { min: 0x43C000, max: 0x43CFFF, country:'GBR', note:'RAF' },
    { min: 0x3B0000, max: 0x3BFFFF, country:'FRA', note:"Armée de l'Air" },
    { min: 0x3C4000, max: 0x3C7FFF, country:'DEU', note:'Luftwaffe' },
    { min: 0x47C000, max: 0x47FFFF, country:'ITA', note:'Aeronautica Militare' }
  ];

  function _isMilitary(callsign, icao24) {
    if (!callsign) return false;
    const cs = callsign.trim().toUpperCase();
    if (MIL_PREFIXES.some(p => cs.startsWith(p))) return true;
    if (icao24) {
      const hex = parseInt(icao24, 16);
      if (MIL_HEX_RANGES.some(r => hex >= r.min && hex <= r.max)) return true;
    }
    return false;
  }

  // Aircraft type detection
  function _detectType(callsign) {
    const cs = (callsign || '').toUpperCase();
    if (/^(SAM|AF1|AF2|MARINE|SPAR|EXEC)/.test(cs))                          return { type:'VIP',        icon:'✈', color:'#ffcc00' };
    if (/^(REACH|RCH|ATLAS|SENTRY|HERKY|ASCOT|RRR)/.test(cs))               return { type:'TRANSPORT',  icon:'✈', color:'#4488ff' };
    if (/^(LUSH|SHELL|TEXACO|ARCO|PETROL)/.test(cs))                         return { type:'TANKER',     icon:'✈', color:'#ff8800' };
    if (/^(COBRA77|IRON|SIGINT|RIVET|DRAGON|NATO|OPR)/.test(cs))            return { type:'ISR/RECON',  icon:'✈', color:'#cc44ff' };
    if (/^(HOBO|DOOM|ROCKY|GHOST|HAVOC|VIPER|RAVEN|EAGLE|HAWK|FALCON|COBRA|SNAKE)/.test(cs)) return { type:'FIGHTER/CAS', icon:'✈', color:'#ff4444' };
    return { type:'MILITARY', icon:'✈', color:'#00cc88' };
  }

  // ── Normalize aircraft data from various API shapes ──────────────────────────
  function _normalizeAircraft(raw) {
    // Already-normalized object with expected keys
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if ('callsign' in raw || 'icao24' in raw) {
        return {
          icao24:         raw.icao24        || raw.hex || '',
          callsign:       raw.callsign      || raw.flight || '',
          origin_country: raw.origin_country|| raw.country || '',
          lon:            raw.longitude     !== undefined ? raw.longitude  : (raw.lon !== undefined ? raw.lon : null),
          lat:            raw.latitude      !== undefined ? raw.latitude   : (raw.lat !== undefined ? raw.lat : null),
          alt:            raw.geo_altitude  !== undefined ? raw.geo_altitude : (raw.altitude !== undefined ? raw.altitude : raw.alt || 0),
          on_ground:      raw.on_ground     || false,
          velocity:       raw.velocity      || raw.speed || 0,
          track:          raw.true_track    !== undefined ? raw.true_track : (raw.track !== undefined ? raw.track : 0)
        };
      }
    }
    // OpenSky states array format: [icao24, callsign, country, _, _, lon, lat, alt, on_ground, velocity, track, ...]
    if (Array.isArray(raw)) {
      return {
        icao24:         raw[0]  || '',
        callsign:       raw[1]  || '',
        origin_country: raw[2]  || '',
        lon:            raw[5],
        lat:            raw[6],
        alt:            raw[7]  || 0,
        on_ground:      raw[8]  || false,
        velocity:       raw[9]  || 0,
        track:          raw[10] || 0
      };
    }
    return null;
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  async function _render() {
    if (!map || !enabled) return;

    let raw;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('/api/aircraft', { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      raw = await res.json();
    } catch (err) {
      console.warn('[MIL_AIR] fetch failed:', err);
      return;
    }

    // Normalize response shape
    let aircraftList = [];
    if (Array.isArray(raw)) {
      aircraftList = raw;
    } else if (raw && Array.isArray(raw.aircraft)) {
      aircraftList = raw.aircraft;
    } else if (raw && Array.isArray(raw.states)) {
      aircraftList = raw.states;
    }

    // Filter and normalize to military only
    const milAircraft = [];
    aircraftList.forEach(item => {
      const ac = _normalizeAircraft(item);
      if (!ac) return;
      if (_isMilitary(ac.callsign, ac.icao24)) {
        milAircraft.push(ac);
      }
    });

    _lastData = milAircraft;

    // Remove existing markers
    markers.forEach(m => { if (map) map.removeLayer(m); });
    markers = [];

    milAircraft.forEach(ac => {
      const { icao24, callsign, origin_country, lon, lat, alt, velocity, track, on_ground } = ac;
      if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return;

      const cfg      = _detectType(callsign);
      const hdg      = isFinite(track) ? Math.round(track) : 0;
      const altFt    = alt ? Math.round(alt / 0.3048 / 100) * 100 : 0;
      const altM     = alt ? Math.round(alt) : 0;
      const kts      = velocity ? Math.round(velocity * 1.944) : 0;
      const cs       = (callsign || '').trim() || icao24 || 'UNKNOWN';

      const divIcon = L.divIcon({
        html: `<div class="milairmark" style="color:${cfg.color};transform:rotate(${hdg}deg)">${cfg.icon}</div>`,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      const popHTML = `<div class="mair-popup" style="border-left:2px solid ${cfg.color}">
        <div class="mair-hdr" style="color:${cfg.color}">${cs} <span style="color:#3d5a78;font-size:7px">${icao24}</span></div>
        <div class="mair-badge" style="background:${cfg.color}22;color:${cfg.color};border:1px solid ${cfg.color}44">${cfg.type} · ${origin_country}</div>
        <div class="mair-row"><span class="mair-lbl">ALT</span> ${altFt.toLocaleString()} ft · ${altM.toLocaleString()} m</div>
        <div class="mair-row"><span class="mair-lbl">SPD</span> ${kts} kts</div>
        <div class="mair-row"><span class="mair-lbl">HDG</span> ${hdg}°</div>
        <div class="mair-row"><span class="mair-lbl">GRND</span> ${on_ground ? 'On Ground' : 'Airborne'}</div>
        <div class="mair-src">Source: OpenSky Network · ADSB.fi · OSINT callsign classification</div>
      </div>`;

      const mk = L.marker([lat, lon], { icon: divIcon, zIndexOffset: 900 })
        .bindPopup(popHTML, { className:'leaflet-popup-dark', maxWidth:300 });

      mk.addTo(map);
      markers.push(mk);
    });

    _updatePanel();
  }

  // ── Panel update ─────────────────────────────────────────────────────────────
  function _updatePanel() {
    const el = document.getElementById('milair-panel-body');
    if (!el) return;

    const TYPE_ORDER = ['VIP','TRANSPORT','TANKER','ISR/RECON','FIGHTER/CAS','MILITARY'];
    const TYPE_COLORS = {
      'VIP':        '#ffcc00',
      'TRANSPORT':  '#4488ff',
      'TANKER':     '#ff8800',
      'ISR/RECON':  '#cc44ff',
      'FIGHTER/CAS':'#ff4444',
      'MILITARY':   '#00cc88'
    };
    const TYPE_ICONS = {
      'VIP':        '✈',
      'TRANSPORT':  '✈',
      'TANKER':     '✈',
      'ISR/RECON':  '✈',
      'FIGHTER/CAS':'✈',
      'MILITARY':   '✈'
    };

    const counts = {};
    TYPE_ORDER.forEach(t => { counts[t] = 0; });
    _lastData.forEach(ac => {
      const t = _detectType(ac.callsign).type;
      counts[t] = (counts[t] || 0) + 1;
    });

    const total = _lastData.length;

    const typeRows = TYPE_ORDER.map(t => {
      const n = counts[t] || 0;
      if (n === 0) return '';
      const color = TYPE_COLORS[t];
      const icon  = TYPE_ICONS[t];
      return `<div class="mair-stat-row">
        <span style="font-size:13px;color:${color}">${icon}</span>
        <div class="mair-stat-info">
          <div class="mair-stat-name" style="color:${color}">${t}</div>
          <div class="mair-stat-count">${n} aircraft</div>
        </div>
      </div>`;
    }).join('');

    const liveList = _lastData.slice(0, 40).map(ac => {
      const cs    = (ac.callsign || '').trim() || ac.icao24 || 'UNKNOWN';
      const cfg   = _detectType(ac.callsign);
      const altFt = ac.alt ? Math.round(ac.alt / 0.3048 / 100) * 100 : 0;
      return `<div class="mair-list-row">
        <span class="mair-list-cs" style="color:${cfg.color}">${cs}</span>
        <span class="mair-list-type" style="color:${cfg.color}99">${cfg.type}</span>
        <span class="mair-list-alt">${altFt.toLocaleString()} ft</span>
      </div>`;
    }).join('');

    const overflow = total > 40
      ? `<div style="font-size:6.5px;color:#3d5a78;padding:2px 0">+${total - 40} more…</div>`
      : '';

    el.innerHTML = `
      <div class="mair-total">MILITARY CONTACTS: <span style="color:#00cc88;font-weight:700">${total}</span></div>
      <div class="mair-section-hdr">BY TYPE</div>
      ${typeRows || '<div style="font-size:7px;color:#3d5a78">No military aircraft detected</div>'}
      <div class="mair-section-hdr" style="margin-top:8px">LIVE CONTACTS</div>
      <div class="mair-list">${liveList || '<div style="font-size:7px;color:#3d5a78">Awaiting data…</div>'}</div>
      ${overflow}
    `;
  }

  // ── CSS injection ────────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('mair-css')) return;
    const s = document.createElement('style');
    s.id = 'mair-css';
    s.textContent = `
      .milairmark{width:18px;height:18px;display:flex;align-items:center;justify-content:center;
        font-size:14px;cursor:pointer;filter:drop-shadow(0 0 4px currentColor);
        transform-origin:center center;transition:transform .15s}
      .mair-popup{min-width:240px;max-width:300px;font-family:'Courier New',monospace;padding:2px}
      .mair-hdr{font-size:9.5px;font-weight:700;margin-bottom:5px}
      .mair-badge{font-size:6.5px;font-weight:700;padding:2px 6px;border-radius:2px;
        display:inline-block;margin-bottom:5px;letter-spacing:.5px}
      .mair-row{font-size:7.5px;color:#c8dff0;margin:2px 0;line-height:1.4}
      .mair-lbl{color:#3d5a78;display:inline-block;width:40px;font-size:7px;letter-spacing:.3px}
      .mair-src{font-size:6.5px;color:#3d5a78;margin-top:6px;border-top:1px solid #0d1e2e;padding-top:4px}
      .mair-total{font-size:7.5px;font-weight:700;color:#c8dff0;margin-bottom:4px}
      .mair-section-hdr{font-size:6.5px;color:#3d5a78;letter-spacing:.8px;font-weight:700;
        margin:4px 0 3px 0;border-bottom:1px solid #0d1e2e;padding-bottom:2px}
      .mair-stat-row{display:flex;align-items:center;gap:6px;padding:2px 0}
      .mair-stat-info{flex:1}
      .mair-stat-name{font-size:7.5px;font-weight:600}
      .mair-stat-count{font-size:7px;color:#3d5a78}
      .mair-list{max-height:160px;overflow-y:auto}
      .mair-list-row{display:flex;align-items:center;gap:4px;padding:1px 0;font-size:7px}
      .mair-list-cs{flex:1;font-weight:600;font-size:7.5px}
      .mair-list-type{flex-shrink:0;font-size:6.5px}
      .mair-list-alt{flex-shrink:0;font-size:6.5px;color:#3d5a78}
    `;
    document.head.appendChild(s);
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  return {
    init(m) {
      map = m;
      _injectCSS();
    },
    setEnabled(on) {
      enabled = on;
      if (on) {
        _render();
        _timer = setInterval(_render, 30000);
      } else {
        if (_timer) { clearInterval(_timer); _timer = null; }
        markers.forEach(m => { if (map) map.removeLayer(m); });
        markers = [];
        _lastData = [];
      }
    },
    getCount() {
      return _lastData.length;
    }
  };
})();
