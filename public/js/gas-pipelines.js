/* ════════════════════════════════════════════════════════════════════════════
   SPYMETER — Gas & LNG Pipeline OSINT Layer
   Data: GIE · IEA · OIES · Operator disclosures · OSINT
   Renders global gas/LNG pipeline routes as Leaflet polylines with status
   coding, popup details, and a left-panel summary by status + capacity table.
════════════════════════════════════════════════════════════════════════════ */

'use strict';

const GAS_PIPELINES = (() => {
  // ─── State ──────────────────────────────────────────────────────────────────
  let map     = null;
  let enabled = false;
  let lines   = [];

  // ─── Status config ───────────────────────────────────────────────────────────
  const STATUS = {
    ACTIVE:    { color: '#00ff88', label: 'Active' },
    DAMAGED:   { color: '#ff4444', label: 'Damaged/Sabotaged' },
    PLANNED:   { color: '#4488ff', label: 'Planned/Under Construction' },
    SUSPENDED: { color: '#ffaa00', label: 'Suspended/Disputed' },
  };

  // ─── Pipeline data ───────────────────────────────────────────────────────────
  const PIPELINES = [
    {
      name: 'Nord Stream 1',
      status: 'DAMAGED',
      from: 'Russia', to: 'Germany',
      capacity: 55,
      notes: 'Sabotaged September 2022 (undersea explosions). 1224km. Vyborg Russia → Lubmin Germany. Was largest single pipeline to Europe.',
      coords: [[61.05,28.85],[59.5,24.0],[57.0,19.5],[55.5,16.0],[54.5,14.5],[54.12,13.68]]
    },
    {
      name: 'Nord Stream 2',
      status: 'DAMAGED',
      from: 'Russia', to: 'Germany',
      capacity: 55,
      notes: 'Sabotaged September 2022. Never commercially operated. Same Baltic Sea route, parallel to NS1.',
      coords: [[60.8,28.9],[59.3,24.2],[56.8,19.6],[55.3,16.2],[54.4,14.6],[54.10,13.70]]
    },
    {
      name: 'TurkStream',
      status: 'ACTIVE',
      from: 'Russia', to: 'Turkey',
      capacity: 31.5,
      notes: 'Operational since Jan 2020. 930km under Black Sea. Anapa Russia → Kıyıköy Turkey. Supplies Turkey + SE Europe.',
      coords: [[44.90,37.31],[43.5,35.0],[42.5,33.5],[41.8,31.5],[41.60,27.94]]
    },
    {
      name: 'Blue Stream',
      status: 'ACTIVE',
      from: 'Russia', to: 'Turkey',
      capacity: 16,
      notes: 'Under Black Sea. 1213km. Dzhubga Russia → Samsun Turkey. Since 2003.',
      coords: [[44.08,39.07],[43.2,37.5],[42.0,35.0],[41.28,36.33]]
    },
    {
      name: 'Yamal-Europe',
      status: 'SUSPENDED',
      from: 'Russia', to: 'Germany',
      capacity: 33,
      notes: 'Suspended since 2022 Russian sanctions. Runs through Belarus and Poland. 4000km.',
      coords: [[57.05,34.84],[55.8,32.0],[53.9,28.5],[52.0,25.0],[52.25,21.0],[53.5,18.5],[54.35,18.65],[53.5,14.5],[52.52,13.40]]
    },
    {
      name: 'Trans-Adriatic Pipeline (TAP)',
      status: 'ACTIVE',
      from: 'Greece', to: 'Italy',
      capacity: 10,
      notes: 'Since 2020. Kipoi Greece → Albania → Fier → Adriatic undersea → Melendugno Italy. Part of Southern Gas Corridor.',
      coords: [[41.37,26.19],[41.2,25.0],[40.9,23.5],[40.73,21.94],[40.8,20.5],[40.9,19.5],[41.0,18.8],[40.47,17.82]]
    },
    {
      name: 'Trans-Anatolian Pipeline (TANAP)',
      status: 'ACTIVE',
      from: 'Azerbaijan', to: 'Turkey',
      capacity: 16,
      notes: 'Since 2018. Shah Deniz Azerbaijan → Erzurum Turkey → connects to TAP. 1850km.',
      coords: [[41.66,46.41],[41.2,44.0],[40.5,41.5],[39.9,38.0],[39.5,35.0],[39.0,32.0],[38.9,29.0],[38.7,27.5],[38.9,26.5],[40.5,25.0],[41.37,26.19]]
    },
    {
      name: 'South Caucasus Pipeline (SCPX)',
      status: 'ACTIVE',
      from: 'Azerbaijan', to: 'Turkey',
      capacity: 24,
      notes: 'BTC/SCP. Baku → Tbilisi → Erzurum. Shah Deniz gas to Turkey/Europe via Georgia.',
      coords: [[40.41,49.87],[41.6,46.4],[41.66,46.41],[41.7,44.5],[41.6,43.0],[40.9,41.5],[39.9,41.2]]
    },
    {
      name: 'Baltic Pipe',
      status: 'ACTIVE',
      from: 'Norway', to: 'Poland',
      capacity: 10,
      notes: 'Since Oct 2022. Norwegian North Sea → Denmark → Baltic Sea → Goleniów Poland. Alternative to Russian gas.',
      coords: [[56.5,6.5],[56.8,8.5],[57.5,10.0],[57.5,12.0],[56.5,14.5],[55.5,15.5],[54.8,17.0],[53.6,14.7]]
    },
    {
      name: 'Balticconnector',
      status: 'DAMAGED',
      from: 'Finland', to: 'Estonia',
      capacity: 2.6,
      notes: 'Sabotaged October 2023 (anchor drag suspected — Chinese vessel). 77km undersea Finland-Estonia. Repaired and restored Feb 2024.',
      coords: [[60.15,25.05],[59.85,24.75],[59.44,24.73]]
    },
    {
      name: 'Interconnector Turkey-Greece-Italy (ITGI)',
      status: 'ACTIVE',
      from: 'Turkey', to: 'Italy',
      capacity: 12,
      notes: 'Older route. Karacabey Turkey → Komotini Greece → Otranto Italy.',
      coords: [[40.2,28.3],[41.1,26.4],[41.1,25.4],[41.1,24.5],[40.9,23.0],[40.6,22.0],[40.7,20.5],[40.4,19.5],[40.1,18.5]]
    },
    {
      name: 'TAPI Pipeline',
      status: 'PLANNED',
      from: 'Turkmenistan', to: 'India',
      capacity: 33,
      notes: 'Turkmenistan-Afghanistan-Pakistan-India. 1800km. Partially built. Crosses active conflict zone in Afghanistan. Major geopolitical project.',
      coords: [[37.94,58.38],[37.5,62.0],[36.7,64.7],[35.0,66.0],[33.0,65.5],[31.5,65.3],[30.2,66.8],[29.4,69.5],[28.0,70.2],[30.19,71.47],[27.5,73.5],[30.6,74.8]]
    },
    {
      name: 'East Med Pipeline',
      status: 'PLANNED',
      from: 'Israel', to: 'Greece',
      capacity: 10,
      notes: 'Proposed 2020. Israel/Cyprus Eastern Mediterranean gas to Greece/Italy. US withdrew support 2022 citing cost/viability. Status: shelved.',
      coords: [[31.5,35.0],[34.5,32.5],[35.1,33.35],[34.7,33.0],[34.0,31.5],[33.2,30.0],[32.0,28.0],[35.5,24.5],[37.0,22.5],[38.0,22.9]]
    },
    {
      name: 'Medgaz',
      status: 'ACTIVE',
      from: 'Algeria', to: 'Spain',
      capacity: 10.5,
      notes: 'Undersea Beni Saf Algeria → Almería Spain. 210km. Since 2011. Main Algeria-Spain route after Maghreb-Europe disrupted.',
      coords: [[35.3,-1.4],[37.0,-1.5],[36.84,-2.46]]
    },
    {
      name: 'Maghreb-Europe Gas Pipeline',
      status: 'SUSPENDED',
      from: 'Algeria', to: 'Spain',
      capacity: 13.5,
      notes: 'Transit through Morocco suspended Oct 2021 due to Algeria-Morocco diplomatic crisis. Goes Hassi RMel Algeria → Tangier Morocco → Gibraltar → Spain.',
      coords: [[32.9,3.3],[32.5,1.0],[34.0,-1.0],[35.7,-5.6],[36.1,-5.5],[36.4,-6.0],[37.4,-6.0],[38.0,-5.5],[37.2,-3.8]]
    },
    {
      name: 'LNG Terminal — Sabine Pass, USA',
      status: 'ACTIVE',
      from: 'USA', to: 'Export',
      capacity: 30,
      notes: 'Largest US LNG export terminal. Sabine Pass LA. Cheniere Energy. Serves Europe/Asia. Key post-2022 Europe energy security.',
      coords: [[29.74,-93.87],[29.74,-93.87]]
    },
    {
      name: 'LNG Terminal — Corpus Christi, USA',
      status: 'ACTIVE',
      from: 'USA', to: 'Export',
      capacity: 15,
      notes: 'Cheniere Corpus Christi LNG. Texas. Major export terminal.',
      coords: [[27.80,-97.27],[27.80,-97.27]]
    },
    {
      name: 'LNG Terminal — Freeport, USA',
      status: 'ACTIVE',
      from: 'USA', to: 'Export',
      capacity: 15,
      notes: 'Freeport LNG Texas. Exports to Europe and Asia.',
      coords: [[28.94,-95.35],[28.94,-95.35]]
    },
    {
      name: 'Druzhba Oil Pipeline',
      status: 'ACTIVE',
      from: 'Russia', to: 'Europe',
      capacity: 100,
      notes: "World's longest oil pipeline. Almetyevsk Russia → Ukraine/Belarus split → Poland/Germany/Hungary/Slovakia/Czech. 4000km. Partially sanctioned.",
      coords: [[54.9,52.4],[53.5,50.5],[51.5,47.0],[50.5,44.5],[49.5,42.0],[48.5,38.5],[49.0,36.0],[50.8,33.5],[51.7,33.0],[52.1,31.5],[51.5,28.0],[52.5,24.5],[52.0,21.0],[51.5,19.5],[52.5,16.5],[51.8,14.5],[52.52,13.40]]
    },
    {
      name: 'Trans-Siberian Gas Pipeline',
      status: 'ACTIVE',
      from: 'Russia', to: 'Russia (China)',
      capacity: 38,
      notes: 'Power of Siberia — Kovykta field Siberia → Blagoveshchensk → China (Heihe). Since Dec 2019. 3000km.',
      coords: [[57.5,107.0],[55.0,113.0],[52.0,118.5],[50.4,127.7],[50.2,127.7]]
    },
    {
      name: 'West-East Gas Pipeline (China)',
      status: 'ACTIVE',
      from: 'China-Xinjiang', to: 'China-Shanghai',
      capacity: 30,
      notes: 'Lunnan Xinjiang → Shanghai. 4000km. Internal China gas distribution backbone.',
      coords: [[40.5,88.0],[38.0,97.0],[36.5,106.0],[34.0,108.5],[33.0,112.0],[31.5,117.5],[31.22,121.46]]
    },
  ];

  // ─── CSS injection ───────────────────────────────────────────────────────────
  function _injectCSS() {
    if (document.getElementById('gas-pipelines-css')) return;
    const s = document.createElement('style');
    s.id = 'gas-pipelines-css';
    s.textContent = `
      .pipe-popup {
        min-width: 270px;
        max-width: 320px;
        font-family: 'Courier New', monospace;
        padding: 4px 2px 2px 2px;
      }
      .pipe-hdr {
        font-size: 10px;
        font-weight: 700;
        margin-bottom: 5px;
        letter-spacing: .3px;
      }
      .pipe-badge {
        font-size: 6.5px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 2px;
        display: inline-block;
        margin-bottom: 6px;
        letter-spacing: .5px;
      }
      .pipe-row {
        font-size: 7.5px;
        color: #c8dff0;
        margin: 2px 0;
        line-height: 1.5;
      }
      .pipe-lbl {
        color: #3d5a78;
        display: inline-block;
        width: 72px;
        font-size: 7px;
        letter-spacing: .3px;
      }
      .pipe-src {
        font-size: 6.5px;
        color: #3d5a78;
        margin-top: 7px;
        border-top: 1px solid #0d1e2e;
        padding-top: 4px;
      }

      /* Panel styles */
      .pipe-panel-section {
        margin-bottom: 10px;
      }
      .pipe-panel-hdr {
        font-size: 7px;
        font-weight: 700;
        letter-spacing: .6px;
        color: #3d5a78;
        text-transform: uppercase;
        padding: 3px 0;
        border-bottom: 1px solid #0d1e2e;
        margin-bottom: 5px;
      }
      .pipe-status-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2.5px 0;
        font-size: 7.5px;
        color: #c8dff0;
        border-bottom: 1px solid #0d1e2e08;
      }
      .pipe-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .pipe-status-label {
        flex: 1;
      }
      .pipe-status-count {
        font-weight: 700;
        font-size: 8px;
      }
      .pipe-cap-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 7px;
        color: #c8dff0;
      }
      .pipe-cap-table th {
        color: #3d5a78;
        font-weight: 700;
        letter-spacing: .3px;
        text-align: left;
        padding: 2px 3px;
        border-bottom: 1px solid #0d1e2e;
      }
      .pipe-cap-table td {
        padding: 2px 3px;
        border-bottom: 1px solid #0d1e2e22;
        vertical-align: top;
      }
      .pipe-cap-table tr:hover td {
        background: rgba(0,255,136,.04);
      }
      .pipe-cap-name {
        max-width: 110px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: #c8dff0;
      }
      .pipe-cap-route {
        color: #5a7a9a;
        font-size: 6.5px;
      }
      .pipe-cap-bcm {
        text-align: right;
        font-weight: 700;
        white-space: nowrap;
      }
      .pipe-cap-bar-wrap {
        width: 50px;
        height: 3px;
        background: #0d1e2e;
        border-radius: 2px;
        overflow: hidden;
        display: inline-block;
        vertical-align: middle;
      }
      .pipe-cap-bar {
        height: 100%;
        border-radius: 2px;
      }
      .pipe-panel-note {
        font-size: 6.5px;
        color: #3d5a78;
        margin-top: 6px;
        padding-top: 4px;
        border-top: 1px solid #0d1e2e;
      }
    `;
    document.head.appendChild(s);
  }

  // ─── Build popup HTML ────────────────────────────────────────────────────────
  function _popupHTML(pipe) {
    const cfg   = STATUS[pipe.status];
    const color = cfg.color;
    return `
      <div class="pipe-popup" style="border-left:3px solid ${color}">
        <div class="pipe-hdr" style="color:${color}">${pipe.name}</div>
        <div class="pipe-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">${cfg.label} · ${pipe.from} → ${pipe.to}</div>
        <div class="pipe-row"><span class="pipe-lbl">CAPACITY</span> ${pipe.capacity} bcm/yr</div>
        <div class="pipe-row"><span class="pipe-lbl">NOTES</span> ${pipe.notes}</div>
        <div class="pipe-src">Source: GIE · IEA · OIES · operator disclosures · OSINT</div>
      </div>`;
  }

  // ─── Detect single-point LNG terminal entries ────────────────────────────────
  function _isSinglePoint(pipe) {
    return (
      pipe.coords.length === 2 &&
      pipe.coords[0][0] === pipe.coords[1][0] &&
      pipe.coords[0][1] === pipe.coords[1][1]
    );
  }

  // ─── Render all pipelines ────────────────────────────────────────────────────
  function _render() {
    if (!map) return;

    // Clear existing
    lines.forEach(l => map.removeLayer(l));
    lines = [];

    PIPELINES.forEach(pipe => {
      const cfg    = STATUS[pipe.status];
      const color  = cfg.color;
      const isLNG  = pipe.name.includes('LNG');
      const popup  = _popupHTML(pipe);

      if (_isSinglePoint(pipe)) {
        // LNG terminal rendered as a circle marker
        const circle = L.circleMarker(pipe.coords[0], {
          radius:      8,
          color:       color,
          fillColor:   color,
          fillOpacity: 0.35,
          weight:      2,
          opacity:     0.9,
        });
        circle.bindPopup(popup, { className: 'leaflet-popup-dark', maxWidth: 340 });
        circle.bindTooltip(pipe.name, {
          sticky:    true,
          direction: 'top',
          className: 'pipe-tt',
          offset:    L.point(0, -8),
        });
        circle.addTo(map);
        lines.push(circle);
        return;
      }

      const dashArray =
        pipe.status === 'PLANNED'  ? '8,8' :
        pipe.status === 'DAMAGED'  ? '4,4' :
        null;

      const polyline = L.polyline(pipe.coords, {
        color:       color,
        weight:      isLNG ? 6 : 3,
        opacity:     0.8,
        dashArray:   dashArray,
      });

      polyline.bindPopup(popup, { className: 'leaflet-popup-dark', maxWidth: 340 });
      polyline.bindTooltip(pipe.name, {
        sticky:    true,
        direction: 'top',
        className: 'pipe-tt',
        offset:    L.point(0, -6),
      });

      polyline.on('mouseover', function () {
        this.setStyle({ weight: isLNG ? 9 : 5, opacity: 1 });
      });
      polyline.on('mouseout', function () {
        this.setStyle({ weight: isLNG ? 6 : 3, opacity: 0.8 });
      });

      polyline.addTo(map);
      lines.push(polyline);
    });
  }

  // ─── Update left panel ───────────────────────────────────────────────────────
  function _updatePanel() {
    const el = document.getElementById('pipe-panel-body');
    if (!el) return;

    // Count by status
    const counts = {};
    Object.keys(STATUS).forEach(k => { counts[k] = 0; });
    PIPELINES.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });

    // Status summary rows
    const statusRows = Object.entries(STATUS).map(([key, cfg]) => `
      <div class="pipe-status-row">
        <span class="pipe-status-dot" style="background:${cfg.color};box-shadow:0 0 5px ${cfg.color}66"></span>
        <span class="pipe-status-label">${cfg.label}</span>
        <span class="pipe-status-count" style="color:${cfg.color}">${counts[key]}</span>
      </div>`).join('');

    // Active pipelines table sorted by capacity descending
    const activePipes = PIPELINES
      .filter(p => p.status === 'ACTIVE')
      .sort((a, b) => b.capacity - a.capacity);

    const maxCap = activePipes.length ? activePipes[0].capacity : 100;

    const tableRows = activePipes.map(p => {
      const color = STATUS[p.status].color;
      const pct   = Math.round((p.capacity / maxCap) * 100);
      return `<tr>
        <td>
          <div class="pipe-cap-name" title="${p.name}">${p.name}</div>
          <div class="pipe-cap-route">${p.from} → ${p.to}</div>
        </td>
        <td class="pipe-cap-bcm" style="color:${color}">
          ${p.capacity}
          <div class="pipe-cap-bar-wrap">
            <div class="pipe-cap-bar" style="width:${pct}%;background:${color}"></div>
          </div>
        </td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="pipe-panel-section">
        <div class="pipe-panel-hdr">By Status</div>
        ${statusRows}
      </div>
      <div class="pipe-panel-section">
        <div class="pipe-panel-hdr">Active — By Capacity (bcm/yr)</div>
        <table class="pipe-cap-table">
          <thead>
            <tr>
              <th>Pipeline</th>
              <th style="text-align:right">Cap.</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="pipe-panel-note">
          Source: GIE · IEA · OIES · operator disclosures · OSINT<br>
          Total pipelines: ${PIPELINES.length} · Active: ${counts.ACTIVE} · Damaged: ${counts.DAMAGED}
        </div>
      </div>
    `;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  return {
    init(m) {
      map = m;
      _injectCSS();
    },

    setEnabled(on) {
      enabled = Boolean(on);
      if (enabled) {
        _render();
        _updatePanel();
      } else {
        lines.forEach(l => map?.removeLayer(l));
        lines = [];
      }
    },

    getData() {
      return PIPELINES;
    },
  };
})();
