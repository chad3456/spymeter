/**
 * leaders.js — World Leaders Map Layer
 * Circular photo markers with military intelligence styling.
 * Uses L.divIcon for custom HTML markers on a Leaflet map.
 */

'use strict';

const LEADERS = (() => {

  // ─── Leader Data ──────────────────────────────────────────────────────────────
  const LEADER_DATA = [
    {
      name: 'Vladimir Putin',
      lat: 55.75,
      lng: 37.62,
      role: 'President',
      country: 'Russia',
      capital: 'Moscow',
      flag: '\uD83C\uDDF7\uD83C\uDDFA',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Vladimir_Putin_17-11-2021_%28cropped%29.jpg/120px-Vladimir_Putin_17-11-2021_%28cropped%29.jpg',
      color: '#aa2222',
      status: 'CONFIRMED ACTIVE',
      initials: 'VP'
    },
    {
      name: 'Volodymyr Zelensky',
      lat: 50.45,
      lng: 30.52,
      role: 'President',
      country: 'Ukraine',
      capital: 'Kyiv',
      flag: '\uD83C\uDDFA\uD83C\uDDE6',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Volodymyr_Zelensky_2024.jpg/120px-Volodymyr_Zelensky_2024.jpg',
      color: '#2255aa',
      status: 'WAR FOOTING',
      initials: 'VZ'
    },
    {
      name: 'Benjamin Netanyahu',
      lat: 31.78,
      lng: 35.22,
      role: 'Prime Minister',
      country: 'Israel',
      capital: 'Jerusalem',
      flag: '\uD83C\uDDEE\uD83C\uDDF1',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Benjamin_Netanyahu_in_May_2023.jpg/120px-Benjamin_Netanyahu_in_May_2023.jpg',
      color: '#4488ff',
      status: 'WAR CABINET',
      initials: 'BN'
    },
    {
      name: 'Ali Khamenei',
      lat: 35.69,
      lng: 51.39,
      role: 'Supreme Leader',
      country: 'Iran',
      capital: 'Tehran',
      flag: '\uD83C\uDDEE\uD83C\uDDF7',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Ali_Khamenei_2016.jpg/120px-Ali_Khamenei_2016.jpg',
      color: '#aa4422',
      status: 'UNDER PRESSURE',
      initials: 'AK'
    },
    {
      name: 'Narendra Modi',
      lat: 28.61,
      lng: 77.21,
      role: 'Prime Minister',
      country: 'India',
      capital: 'New Delhi',
      flag: '\uD83C\uDDEE\uD83C\uDDF3',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/NarendraModi_2014.jpg/120px-NarendraModi_2014.jpg',
      color: '#ff8800',
      status: 'MONITORING',
      initials: 'NM'
    },
    {
      name: 'Xi Jinping',
      lat: 39.91,
      lng: 116.39,
      role: 'President',
      country: 'China',
      capital: 'Beijing',
      flag: '\uD83C\uDDE8\uD83C\uDDF3',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Xi_Jinping_2019.jpg/120px-Xi_Jinping_2019.jpg',
      color: '#ff4444',
      status: 'STRATEGIC WATCH',
      initials: 'XJ'
    },
    {
      name: 'Donald Trump',
      lat: 38.90,
      lng: -77.04,
      role: 'President',
      country: 'USA',
      capital: 'Washington D.C.',
      flag: '\uD83C\uDDFA\uD83C\uDDF8',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Donald_Trump_official_portrait.jpg/120px-Donald_Trump_official_portrait.jpg',
      color: '#3366cc',
      status: 'COMMANDER-IN-CHIEF',
      initials: 'DT'
    },
    {
      name: 'Emmanuel Macron',
      lat: 48.87,
      lng: 2.33,
      role: 'President',
      country: 'France',
      capital: 'Paris',
      flag: '\uD83C\uDDEB\uD83C\uDDF7',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Emmanuel_Macron_in_2019.jpg/120px-Emmanuel_Macron_in_2019.jpg',
      color: '#0055A4',
      status: 'ACTIVE',
      initials: 'EM'
    },
    {
      name: 'Keir Starmer',
      lat: 51.50,
      lng: -0.13,
      role: 'Prime Minister',
      country: 'UK',
      capital: 'London',
      flag: '\uD83C\uDDEC\uD83C\uDDE7',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Keir_Starmer_official_portrait.jpg/120px-Keir_Starmer_official_portrait.jpg',
      color: '#CC0000',
      status: 'ACTIVE',
      initials: 'KS'
    },
    {
      name: 'Kim Jong-un',
      lat: 39.02,
      lng: 125.75,
      role: 'Supreme Leader',
      country: 'North Korea',
      capital: 'Pyongyang',
      flag: '\uD83C\uDDF0\uD83C\uDDF5',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Kim_Jong-un_2019_%28cropped%29.jpg/120px-Kim_Jong-un_2019_%28cropped%29.jpg',
      color: '#880000',
      status: 'NUCLEAR THREAT',
      initials: 'KJ'
    },
    {
      name: 'Recep Erdogan',
      lat: 39.93,
      lng: 32.86,
      role: 'President',
      country: 'Turkey',
      capital: 'Ankara',
      flag: '\uD83C\uDDF9\uD83C\uDDF7',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Recep_Tayyip_Erdogan_2017.jpg/120px-Recep_Tayyip_Erdogan_2017.jpg',
      color: '#cc2200',
      status: 'MEDIATOR',
      initials: 'RE'
    },
    {
      name: 'Mohammed bin Salman',
      lat: 24.69,
      lng: 46.72,
      role: 'Crown Prince/PM',
      country: 'Saudi Arabia',
      capital: 'Riyadh',
      flag: '\uD83C\uDDF8\uD83C\uDDE6',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Mohammed_bin_Salman_2017.jpg/120px-Mohammed_bin_Salman_2017.jpg',
      color: '#006400',
      status: 'OIL STRATEGY',
      initials: 'MS'
    },
    {
      name: 'Olaf Scholz',
      lat: 52.52,
      lng: 13.40,
      role: 'Chancellor',
      country: 'Germany',
      capital: 'Berlin',
      flag: '\uD83C\uDDE9\uD83C\uDDEA',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Olaf_Scholz_2021_%28cropped%29.jpg/120px-Olaf_Scholz_2021_%28cropped%29.jpg',
      color: '#4488ff',
      status: 'ACTIVE',
      initials: 'OS'
    },
    {
      name: 'António Guterres',
      lat: 40.72,
      lng: -74.00,
      role: 'UN Secretary General',
      country: 'UN',
      capital: 'New York City',
      flag: '\uD83C\uDDFA\uD83C\uDDF3',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Ant%C3%B3nio_Guterres_2022.jpg/120px-Ant%C3%B3nio_Guterres_2022.jpg',
      color: '#0099ff',
      status: 'DIPLOMATIC',
      initials: 'AG'
    },
    // ── Additional leaders ────────────────────────────────
    {
      name: 'Giorgia Meloni',
      lat: 41.90,
      lng: 12.50,
      role: 'Prime Minister',
      country: 'Italy',
      capital: 'Rome',
      flag: '\uD83C\uDDEE\uD83C\uDDF9',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Giorgia_Meloni_2022_%28cropped%29.jpg/120px-Giorgia_Meloni_2022_%28cropped%29.jpg',
      color: '#009246',
      status: 'CONFIRMED ACTIVE',
      initials: 'GM'
    },
    {
      name: 'Shehbaz Sharif',
      lat: 33.72,
      lng: 73.06,
      role: 'Prime Minister',
      country: 'Pakistan',
      capital: 'Islamabad',
      flag: '\uD83C\uDDF5\uD83C\uDDF0',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Prime_Minister_Shehbaz_Sharif.jpg/120px-Prime_Minister_Shehbaz_Sharif.jpg',
      color: '#01411C',
      status: 'STRATEGIC WATCH',
      initials: 'SS'
    },
    {
      name: 'Fumio Kishida',
      lat: 35.69,
      lng: 139.69,
      role: 'Prime Minister',
      country: 'Japan',
      capital: 'Tokyo',
      flag: '\uD83C\uDDEF\uD83C\uDDF5',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Kishida_Fumio_%282021%29.jpg/120px-Kishida_Fumio_%282021%29.jpg',
      color: '#bc002d',
      status: 'MONITORING',
      initials: 'FK'
    },
    {
      name: 'Yoon Suk-yeol',
      lat: 37.57,
      lng: 126.98,
      role: 'President',
      country: 'South Korea',
      capital: 'Seoul',
      flag: '\uD83C\uDDF0\uD83C\uDDF7',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Yoon_Suk-yeol_official_portrait.jpg/120px-Yoon_Suk-yeol_official_portrait.jpg',
      color: '#003478',
      status: 'MONITORING',
      initials: 'YS'
    },
    {
      name: 'Luiz Inácio Lula',
      lat: -15.78,
      lng: -47.93,
      role: 'President',
      country: 'Brazil',
      capital: 'Brasilia',
      flag: '\uD83C\uDDE7\uD83C\uDDF7',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Luiz_In%C3%A1cio_Lula_da_Silva_-_foto_oficial_2023.jpg/120px-Luiz_In%C3%A1cio_Lula_da_Silva_-_foto_oficial_2023.jpg',
      color: '#009c3b',
      status: 'CONFIRMED ACTIVE',
      initials: 'LL'
    },
    {
      name: 'Abdel-Fattah el-Sisi',
      lat: 30.06,
      lng: 31.25,
      role: 'President',
      country: 'Egypt',
      capital: 'Cairo',
      flag: '\uD83C\uDDEA\uD83C\uDDEC',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Abdel_Fattah_el-Sisi_in_2021.jpg/120px-Abdel_Fattah_el-Sisi_in_2021.jpg',
      color: '#cc0000',
      status: 'STRATEGIC WATCH',
      initials: 'AE'
    },
    {
      name: 'Anthony Albanese',
      lat: -35.28,
      lng: 149.13,
      role: 'Prime Minister',
      country: 'Australia',
      capital: 'Canberra',
      flag: '\uD83C\uDDE6\uD83C\uDDFA',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Anthony_Albanese_crop.jpg/120px-Anthony_Albanese_crop.jpg',
      color: '#00247D',
      status: 'MONITORING',
      initials: 'AA'
    },
    {
      name: 'Justin Trudeau',
      lat: 45.42,
      lng: -75.70,
      role: 'Prime Minister',
      country: 'Canada',
      capital: 'Ottawa',
      flag: '\uD83C\uDDE8\uD83C\uDDE6',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Justin_Trudeau_2019.jpg/120px-Justin_Trudeau_2019.jpg',
      color: '#D71920',
      status: 'MONITORING',
      initials: 'JT'
    },
    {
      name: 'Pedro Sánchez',
      lat: 40.42,
      lng: -3.71,
      role: 'Prime Minister',
      country: 'Spain',
      capital: 'Madrid',
      flag: '\uD83C\uDDEA\uD83C\uDDF8',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Pedro_S%C3%A1nchez_2023_%28cropped%29.jpg/120px-Pedro_S%C3%A1nchez_2023_%28cropped%29.jpg',
      color: '#E4312b',
      status: 'CONFIRMED ACTIVE',
      initials: 'PS'
    },
    {
      name: 'Bashar al-Assad',
      lat: 33.51,
      lng: 36.29,
      role: 'President (ousted Dec 2024)',
      country: 'Syria (HTS)',
      capital: 'Damascus',
      flag: '\uD83C\uDDF8\uD83C\uDDFE',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Bashar_al-Assad.jpg/120px-Bashar_al-Assad.jpg',
      color: '#888888',
      status: 'UNDER PRESSURE',
      initials: 'BA'
    },
    {
      name: 'Isaac Herzog',
      lat: 31.77,
      lng: 35.21,
      role: 'President of Israel',
      country: 'Israel',
      capital: 'Jerusalem',
      flag: '\uD83C\uDDEE\uD83C\uDDF1',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Isaac_Herzog_official_portrait_2021.jpg/120px-Isaac_Herzog_official_portrait_2021.jpg',
      color: '#0038b8',
      status: 'WAR CABINET',
      initials: 'IH'
    },
    {
      name: 'Masoud Pezeshkian',
      lat: 35.69,
      lng: 51.39,
      role: 'President of Iran',
      country: 'Iran',
      capital: 'Tehran',
      flag: '\uD83C\uDDEE\uD83C\uDDF7',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Masoud_Pezeshkian_2024.jpg/120px-Masoud_Pezeshkian_2024.jpg',
      color: '#009900',
      status: 'WAR FOOTING',
      initials: 'MP'
    },
    {
      name: 'Cyril Ramaphosa',
      lat: -25.74,
      lng: 28.19,
      role: 'President',
      country: 'South Africa',
      capital: 'Pretoria',
      flag: '\uD83C\uDDFF\uD83C\uDDE6',
      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Cyril_Ramaphosa_2023.jpg/120px-Cyril_Ramaphosa_2023.jpg',
      color: '#006400',
      status: 'CONFIRMED ACTIVE',
      initials: 'CR'
    }
  ];

  // ─── State ────────────────────────────────────────────────────────────────────
  let _map = null;
  let _layerGroup = null;
  let _enabled = false;

  // ─── Status Color Mapping ─────────────────────────────────────────────────────
  const STATUS_COLORS = {
    'CONFIRMED ACTIVE':   '#00ff88',
    'WAR FOOTING':        '#ff4444',
    'WAR CABINET':        '#ff6600',
    'UNDER PRESSURE':     '#ffaa00',
    'MONITORING':         '#aaccff',
    'STRATEGIC WATCH':    '#ff9900',
    'COMMANDER-IN-CHIEF': '#44aaff',
    'ACTIVE':             '#00dd66',
    'NUCLEAR THREAT':     '#ff0000',
    'MEDIATOR':           '#ffcc00',
    'OIL STRATEGY':       '#66dd44',
    'DIPLOMATIC':         '#00ccff'
  };

  function _statusColor(status) {
    return STATUS_COLORS[status] || '#aaaaaa';
  }

  // ─── CSS Injection ────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('leaders-styles')) return;

    const style = document.createElement('style');
    style.id = 'leaders-styles';
    style.textContent = `
/* ─── Leaflet divIcon reset ───────────────────────────────────────── */
.ldr-div-icon {
  background: none !important;
  border: none !important;
  overflow: visible !important;
}

/* ─── Marker Wrapper ──────────────────────────────────────────────── */
.ldr-marker-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.7));
  transition: transform 0.15s ease;
}

.ldr-marker-wrap:hover {
  transform: scale(1.15);
  z-index: 999 !important;
}

/* ─── Photo Ring ──────────────────────────────────────────────────── */
.ldr-photo-ring {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  padding: 2px;
  background: conic-gradient(var(--ldr-color) 0%, rgba(0,0,0,0.5) 100%);
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.8),
    0 0 8px var(--ldr-color),
    0 0 18px rgba(0,0,0,0.5);
}

.ldr-photo-ring::before {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1px solid var(--ldr-color);
  opacity: 0.5;
  animation: ldr-ring-pulse 2.5s ease-in-out infinite;
}

@keyframes ldr-ring-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50%       { opacity: 0.12; transform: scale(1.14); }
}

/* ─── Photo / Initials inner ──────────────────────────────────────── */
.ldr-photo-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(4, 6, 8, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ldr-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  border-radius: 50%;
  display: block;
}

.ldr-initials {
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  font-weight: bold;
  color: var(--ldr-color);
  letter-spacing: 0.5px;
  text-shadow: 0 0 6px var(--ldr-color);
  display: none;
}

/* Show initials, hide image when image fails to load */
.ldr-photo-inner.ldr-img-error .ldr-photo-img {
  display: none;
}
.ldr-photo-inner.ldr-img-error .ldr-initials {
  display: block;
}

/* ─── Crosshair pip ───────────────────────────────────────────────── */
.ldr-pip {
  width: 2px;
  height: 6px;
  background: linear-gradient(to bottom, var(--ldr-color), transparent);
  margin-top: 0;
}

/* ─── Name Tag ────────────────────────────────────────────────────── */
.ldr-name-tag {
  background: rgba(4, 6, 8, 0.88);
  border: 1px solid var(--ldr-color);
  border-radius: 2px;
  padding: 2px 5px 1px 5px;
  margin-top: 1px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 8px;
  font-weight: bold;
  letter-spacing: 1px;
  color: var(--ldr-color);
  white-space: nowrap;
  box-shadow: 0 0 4px rgba(0,0,0,0.6);
  text-shadow: 0 0 4px var(--ldr-color);
}

/* ─── Popup Wrapper ───────────────────────────────────────────────── */
.ldr-popup .leaflet-popup-content-wrapper {
  background: rgba(4, 6, 8, 0.97) !important;
  border: 1px solid rgba(0, 220, 255, 0.4) !important;
  border-radius: 3px !important;
  box-shadow:
    0 0 0 1px rgba(0,220,255,0.1),
    0 6px 30px rgba(0,0,0,0.8),
    0 0 20px rgba(0,220,255,0.08) !important;
  padding: 0 !important;
  color: #a0c8a0;
  font-family: 'Courier New', Courier, monospace;
  min-width: 220px;
}

.ldr-popup .leaflet-popup-content {
  margin: 0 !important;
  width: auto !important;
}

.ldr-popup .leaflet-popup-tip-container {
  display: none;
}

.ldr-popup .leaflet-popup-close-button {
  color: rgba(0,220,255,0.6) !important;
  font-size: 14px !important;
  top: 6px !important;
  right: 8px !important;
}

.ldr-popup .leaflet-popup-close-button:hover {
  color: #00ff88 !important;
}

/* ─── Popup Header ────────────────────────────────────────────────── */
.ldr-popup-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 8px 12px;
  border-bottom: 1px solid rgba(0, 220, 255, 0.15);
  background: rgba(0, 220, 255, 0.03);
}

.ldr-popup-photo-ring {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  padding: 2px;
  box-shadow: 0 0 8px var(--ldr-color);
}

.ldr-popup-photo-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(10,14,18,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ldr-popup-photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  border-radius: 50%;
  display: block;
}

.ldr-popup-photo-inner.ldr-img-error .ldr-popup-photo-img {
  display: none;
}

.ldr-popup-photo-inner.ldr-img-error .ldr-popup-initials {
  display: flex;
}

.ldr-popup-initials {
  display: none;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 14px;
  font-weight: bold;
  font-family: 'Courier New', Courier, monospace;
  color: var(--ldr-color);
  text-shadow: 0 0 6px var(--ldr-color);
}

.ldr-popup-meta {
  flex: 1;
  min-width: 0;
}

.ldr-popup-flag {
  font-size: 18px;
  line-height: 1;
}

.ldr-popup-name {
  font-size: 11px;
  font-weight: bold;
  color: #e0f4e8;
  letter-spacing: 0.5px;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ldr-popup-role {
  font-size: 9px;
  color: rgba(0, 220, 255, 0.7);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-top: 1px;
}

/* ─── Popup Body ──────────────────────────────────────────────────── */
.ldr-popup-body {
  padding: 8px 12px 10px 12px;
}

.ldr-popup-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 9px;
  letter-spacing: 0.5px;
}

.ldr-popup-row:last-child {
  border-bottom: none;
}

.ldr-popup-row-label {
  color: rgba(160, 200, 160, 0.5);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  flex-shrink: 0;
}

.ldr-popup-row-val {
  color: #c8e8d0;
  text-align: right;
}

.ldr-status-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 8px;
  font-weight: bold;
  letter-spacing: 1.5px;
  border: 1px solid var(--ldr-status-color, #00ff88);
  color: var(--ldr-status-color, #00ff88);
  text-shadow: 0 0 4px var(--ldr-status-color, #00ff88);
  background: rgba(0,0,0,0.3);
}

/* ─── Popup Footer ────────────────────────────────────────────────── */
.ldr-popup-footer {
  padding: 5px 12px 6px 12px;
  border-top: 1px solid rgba(0,220,255,0.1);
  background: rgba(0,220,255,0.02);
  font-size: 8px;
  color: rgba(160,200,160,0.35);
  letter-spacing: 0.8px;
}
`;
    document.head.appendChild(style);
  }

  // ─── Build Marker Icon HTML ───────────────────────────────────────────────────
  function _buildIconHTML(leader) {
    const colorVar = '--ldr-color: ' + leader.color;
    // Show last name only on the name tag to keep markers compact
    const shortName = leader.name.split(' ').pop().toUpperCase();

    return (
      '<div class="ldr-marker-wrap" style="' + colorVar + '">' +
        '<div class="ldr-photo-ring">' +
          '<div class="ldr-photo-inner">' +
            '<img' +
              ' class="ldr-photo-img"' +
              ' src="' + leader.img + '"' +
              ' alt="' + leader.name + '"' +
              ' loading="lazy"' +
              ' crossorigin="anonymous"' +
              ' onerror="this.closest(\'.ldr-photo-inner\').classList.add(\'ldr-img-error\')"' +
            '>' +
            '<span class="ldr-initials">' + leader.initials + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="ldr-pip"></div>' +
        '<div class="ldr-name-tag">' + shortName + '</div>' +
      '</div>'
    );
  }

  // ─── Build Popup HTML ─────────────────────────────────────────────────────────
  function _buildPopupHTML(leader) {
    const statusColor = _statusColor(leader.status);
    const colorVar    = '--ldr-color: ' + leader.color;
    const statusVar   = '--ldr-status-color: ' + statusColor;
    const ringBg      = 'conic-gradient(' + leader.color + ' 0%, rgba(0,0,0,0.4) 100%)';

    return (
      '<div class="ldr-popup-inner" style="' + colorVar + '; ' + statusVar + '">' +
        '<div class="ldr-popup-header">' +
          '<div class="ldr-popup-photo-ring" style="background: ' + ringBg + '">' +
            '<div class="ldr-popup-photo-inner">' +
              '<img' +
                ' class="ldr-popup-photo-img"' +
                ' src="' + leader.img + '"' +
                ' alt="' + leader.name + '"' +
                ' loading="lazy"' +
                ' crossorigin="anonymous"' +
                ' onerror="this.closest(\'.ldr-popup-photo-inner\').classList.add(\'ldr-img-error\')"' +
              '>' +
              '<span class="ldr-popup-initials">' + leader.initials + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="ldr-popup-meta">' +
            '<div class="ldr-popup-flag">' + leader.flag + '</div>' +
            '<div class="ldr-popup-name">' + leader.name + '</div>' +
            '<div class="ldr-popup-role">' + leader.role + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ldr-popup-body">' +
          '<div class="ldr-popup-row">' +
            '<span class="ldr-popup-row-label">Status</span>' +
            '<span class="ldr-popup-row-val">' +
              '<span class="ldr-status-badge">' + leader.status + '</span>' +
            '</span>' +
          '</div>' +
          '<div class="ldr-popup-row">' +
            '<span class="ldr-popup-row-label">Nation</span>' +
            '<span class="ldr-popup-row-val">' + leader.country + '</span>' +
          '</div>' +
          '<div class="ldr-popup-row">' +
            '<span class="ldr-popup-row-label">Last Known</span>' +
            '<span class="ldr-popup-row-val">' + leader.capital + '</span>' +
          '</div>' +
          '<div class="ldr-popup-row">' +
            '<span class="ldr-popup-row-label">Source</span>' +
            '<span class="ldr-popup-row-val">Public record / Reuters</span>' +
          '</div>' +
        '</div>' +
        '<div class="ldr-popup-footer">' +
          '[OSINT] UNCLASSIFIED // PUBLIC SOURCES ONLY' +
        '</div>' +
      '</div>'
    );
  }

  // ─── Build Layer Group ────────────────────────────────────────────────────────
  function _buildLayerGroup() {
    var markers = LEADER_DATA.map(function(leader) {
      var icon = L.divIcon({
        className: 'ldr-div-icon',
        html: _buildIconHTML(leader),
        iconSize:   [44, 62],
        iconAnchor: [22, 62],
        popupAnchor: [0, -64]
      });

      var marker = L.marker([leader.lat, leader.lng], {
        icon: icon,
        title: leader.name,
        riseOnHover: true,
        zIndexOffset: 500
      });

      marker.bindPopup(_buildPopupHTML(leader), {
        className: 'ldr-popup',
        maxWidth: 260,
        minWidth: 220,
        autoPanPadding: [20, 20]
      });

      return marker;
    });

    return L.layerGroup(markers);
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * init(map) — Build the layer group. Does NOT add it to the map.
   * @param {L.Map} map - Leaflet map instance
   */
  function init(map) {
    _map = map;
    _injectStyles();
    _layerGroup = _buildLayerGroup();
    console.log('[LEADERS] Initialized. ' + LEADER_DATA.length + ' leaders loaded.');
  }

  /**
   * setEnabled(on) — Add or remove the layer from the map.
   * @param {boolean} on
   */
  function setEnabled(on) {
    if (!_map || !_layerGroup) {
      console.warn('[LEADERS] Not initialized. Call init(map) first.');
      return;
    }
    if (on && !_map.hasLayer(_layerGroup)) {
      _layerGroup.addTo(_map);
      _enabled = true;
      console.log('[LEADERS] Layer enabled.');
    } else if (!on && _map.hasLayer(_layerGroup)) {
      _map.removeLayer(_layerGroup);
      _enabled = false;
      console.log('[LEADERS] Layer disabled.');
    }
  }

  /**
   * isEnabled() — Returns whether the layer is currently on the map.
   * @returns {boolean}
   */
  function isEnabled() {
    return _enabled;
  }

  /**
   * getLayerGroup() — Returns the Leaflet LayerGroup.
   * @returns {L.LayerGroup|null}
   */
  function getLayerGroup() {
    return _layerGroup;
  }

  /**
   * getData() — Returns a copy of the raw leader data array.
   * @returns {object[]}
   */
  function getData() {
    return LEADER_DATA.map(function(d) { return Object.assign({}, d); });
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────
  return {
    init: init,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    getLayerGroup: getLayerGroup,
    getData: getData
  };

})();
