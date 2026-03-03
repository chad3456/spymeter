/* ── Utility helpers ──────────────────────────────────── */
const UTILS = (() => {
  const COUNTRY_COLORS = {
    'United States': '#3399ff',
    'Russia':        '#ff3333',
    'China':         '#ffaa00',
    'Germany':       '#ffdd00',
    'United Kingdom':'#cc44ff',
    'France':        '#4488ff',
    'Japan':         '#ff6688',
    'India':         '#ff8844',
    'Brazil':        '#44ff88',
    'Canada':        '#ff4444',
    'Australia':     '#44ffdd',
    'Turkey':        '#ff5500',
    'South Korea':   '#88aaff',
    'Iran':          '#aa4400',
    'Israel':        '#8888ff',
    'Pakistan':      '#44aa00',
    'North Korea':   '#aa0033',
    'Ukraine':       '#ffcc00',
  };

  const FLAG_EMOJIS = {
    'United States':'🇺🇸','Russia':'🇷🇺','China':'🇨🇳','Germany':'🇩🇪',
    'United Kingdom':'🇬🇧','France':'🇫🇷','Japan':'🇯🇵','India':'🇮🇳',
    'Brazil':'🇧🇷','Canada':'🇨🇦','Australia':'🇦🇺','Turkey':'🇹🇷',
    'South Korea':'🇰🇷','Iran':'🇮🇷','Israel':'🇮🇱','Pakistan':'🇵🇰',
    'North Korea':'🇰🇵','Ukraine':'🇺🇦','Spain':'🇪🇸','Italy':'🇮🇹',
    'Netherlands':'🇳🇱','Belgium':'🇧🇪','Poland':'🇵🇱','Sweden':'🇸🇪',
    'Norway':'🇳🇴','Switzerland':'🇨🇭','UAE':'🇦🇪','Saudi Arabia':'🇸🇦',
    'Qatar':'🇶🇦',
  };

  function countryColor(name) {
    return COUNTRY_COLORS[name] || '#888888';
  }
  function countryFlag(name) {
    return FLAG_EMOJIS[name] || '🏳️';
  }

  function fmtUTC(d = new Date()) {
    return d.toUTCString().slice(17, 25) + ' UTC';
  }

  function fmtTime(d = new Date()) {
    return d.toISOString().slice(11, 19);
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function parseTLE(raw) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const sats = [];
    for (let i = 0; i < lines.length - 2; i += 3) {
      const name = lines[i];
      const l1 = lines[i+1];
      const l2 = lines[i+2];
      if (l1.startsWith('1 ') && l2.startsWith('2 ')) {
        sats.push({ name, line1: l1, line2: l2 });
      }
    }
    return sats;
  }

  // Throttle helper
  function throttle(fn, ms) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(...args); }
    };
  }

  // Debounce helper
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ── Relative time (e.g. "5m ago", "2h ago") ──────────────
  function timeAgo(dateStr) {
    if (!dateStr) return '';
    // GDELT dates come as "YYYYMMDDTHHmmssZ" or ISO
    let d;
    if (typeof dateStr === 'number') {
      d = new Date(dateStr);
    } else if (/^\d{8}T/.test(dateStr)) {
      // Parse GDELT format 20260303T142300Z
      const s = dateStr.replace('T','').replace('Z','');
      d = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}Z`);
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d)) return '';
    const secs = Math.floor((Date.now() - d) / 1000);
    if (secs < 0)    return 'just now';
    if (secs < 60)   return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    const days = Math.floor(secs / 86400);
    return days === 1 ? '1d ago' : `${days}d ago`;
  }

  // ── Groq TTS narration ────────────────────────────────────
  let _audioCtx = null;
  let _currentAudio = null;
  async function narrate(text) {
    try {
      if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
      const r = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 500) }),
      });
      if (!r.ok) throw new Error(`TTS HTTP ${r.status}`);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      _currentAudio = audio;
      audio.play().catch(() => {});
      audio.onended = () => URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('[NARRATE]', e.message);
    }
  }
  function stopNarration() {
    if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
  }

  return { countryColor, countryFlag, fmtUTC, fmtTime, haversine, parseTLE, throttle, debounce, timeAgo, narrate, stopNarration };
})();
