/**
 * outage.js — Internet Outage / Disruption World Map Layer
 * OSINT Dashboard — real-time internet disruption data via server proxy
 *
 * Fetches /api/outage and renders country-level disruption markers as
 * L.circleMarker on the Leaflet map. Severity drives color and radius.
 * Auto-refreshes every 5 minutes while enabled.
 *
 * Usage:
 *   OUTAGE.init(map);
 *   OUTAGE.setEnabled(true);
 */

'use strict';

const OUTAGE = (() => {
  // ─── Constants ───────────────────────────────────────────────────────────

  const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Severity levels 0–4.
   * radius = severity * 8 + 8
   */
  const SEVERITY = [
    { level: 0, label: 'NORMAL',       color: '#00ff88', radius:  8 },
    { level: 1, label: 'DEGRADED',     color: '#ffdd00', radius: 16 },
    { level: 2, label: 'DISRUPTED',    color: '#ff9900', radius: 24 },
    { level: 3, label: 'MAJOR OUTAGE', color: '#ff4400', radius: 32 },
    { level: 4, label: 'BLACKOUT',     color: '#ff0000', radius: 40 },
  ];

  // ─── State ───────────────────────────────────────────────────────────────
  let _map         = null;
  let _markers     = [];
  let _legend      = null;
  let _enabled     = false;
  let _refreshTimer = null;

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Fetch current outage data from the server proxy.
   * @returns {Promise<Array>} Array of outage objects.
   */
  function _fetchOutage() {
    return fetch('/api/outage', {
      method:      'GET',
      headers:     { 'Accept': 'application/json' },
      credentials: 'same-origin',
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`/api/outage returned HTTP ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        // Accept either a bare array or { outages: [...] }
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.outages)) return data.outages;
        throw new Error('Unexpected payload from /api/outage — expected Array or { outages: [...] }');
      });
  }

  /**
   * Resolve severity metadata for a numeric level (clamps to 0–4).
   * @param {number} level
   * @returns {{ level, label, color, radius }}
   */
  function _getSeverity(level) {
    const idx = Math.max(0, Math.min(4, Math.round(Number(level) || 0)));
    return SEVERITY[idx];
  }

  /**
   * Build popup HTML for a given outage entry.
   * @param {Object} entry
   * @returns {string}
   */
  function _buildPopup(entry) {
    const sev = _getSeverity(entry.severity);
    const ts  = entry.timestamp
      ? `<div class="outage-popup-ts">${_formatTimestamp(entry.timestamp)}</div>`
      : '';

    return `
      <div class="outage-popup">
        <div class="outage-popup-country">${_escapeHtml(entry.country || 'Unknown')}</div>
        <div class="outage-popup-severity" style="color:${sev.color}">
          &#9679; ${sev.label}
        </div>
        ${entry.note ? `<div class="outage-popup-note">${_escapeHtml(entry.note)}</div>` : ''}
        ${ts}
        ${entry.source ? `<div class="outage-popup-source">Source: ${_escapeHtml(entry.source)}</div>` : ''}
      </div>
    `;
  }

  /**
   * Render circle markers for each outage entry.
   * @param {Array} entries
   */
  function _renderMarkers(entries) {
    _clearMarkers();

    entries.forEach((entry) => {
      // Each entry must have lat + lon (or lat + lng) for placement
      const lat = parseFloat(entry.lat ?? entry.latitude);
      const lon = parseFloat(entry.lon ?? entry.lng ?? entry.longitude);

      if (isNaN(lat) || isNaN(lon)) {
        console.warn('[OUTAGE] Skipping entry with invalid coordinates:', entry);
        return;
      }

      const sev = _getSeverity(entry.severity);

      const marker = L.circleMarker([lat, lon], {
        radius:      sev.radius,
        color:       sev.color,
        fillColor:   sev.color,
        fillOpacity: 0.25,
        weight:      sev.level === 4 ? 2.5 : 1.5,
        opacity:     0.9,
        // Attach severity for potential future filtering
        _severity:   sev.level,
      });

      // Pulsing CSS class for BLACKOUT (severity 4)
      if (sev.level === 4) {
        marker.on('add', () => {
          const el = marker.getElement();
          if (el) el.classList.add('outage-pulse');
        });
      }

      marker.bindPopup(_buildPopup(entry), {
        maxWidth:  260,
        className: 'outage-popup-container',
      });

      marker.addTo(_map);
      _markers.push(marker);
    });
  }

  /**
   * Remove all rendered markers from the map.
   */
  function _clearMarkers() {
    _markers.forEach((m) => {
      if (_map.hasLayer(m)) _map.removeLayer(m);
    });
    _markers = [];
  }

  /**
   * Create/update the floating legend inside #map-wrap.
   */
  function _showLegend() {
    _removeLegend();

    const wrap = document.getElementById('map-wrap') || document.body;

    _legend = document.createElement('div');
    _legend.id = 'outage-legend';
    _legend.setAttribute('role', 'region');
    _legend.setAttribute('aria-label', 'Internet outage severity legend');

    const rows = SEVERITY.map((s) => `
      <div class="outage-legend-row">
        <span class="outage-legend-dot" style="background:${s.color};width:${Math.max(8, s.radius / 2)}px;height:${Math.max(8, s.radius / 2)}px;"></span>
        <span class="outage-legend-label">${s.label}</span>
      </div>
    `).join('');

    _legend.innerHTML = `
      <div class="legend-header">
        <span class="legend-icon">&#128246;</span>
        <strong>Internet Outages</strong>
      </div>
      <div class="outage-legend-rows">${rows}</div>
      <div class="legend-note" style="margin-top:6px">
        Auto-refresh: every 5 min<br>
        Click marker for details
      </div>
    `;

    Object.assign(_legend.style, {
      position:      'absolute',
      bottom:        '30px',
      left:          '10px',
      zIndex:        '1000',
      background:    'rgba(10, 14, 26, 0.88)',
      border:        '1px solid rgba(255, 100, 0, 0.4)',
      borderRadius:  '6px',
      padding:       '10px 14px',
      color:         '#c8d6e5',
      fontSize:      '12px',
      lineHeight:    '1.7',
      maxWidth:      '180px',
      backdropFilter:'blur(4px)',
      boxShadow:     '0 2px 12px rgba(0,0,0,0.5)',
      pointerEvents: 'auto',
    });

    // Inject dot styles once
    if (!document.getElementById('outage-legend-styles')) {
      const style = document.createElement('style');
      style.id = 'outage-legend-styles';
      style.textContent = `
        .outage-legend-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 2px 0;
        }
        .outage-legend-dot {
          display: inline-block;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .outage-legend-label {
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        /* Pulsing animation for blackout markers */
        @keyframes outage-pulse-anim {
          0%   { stroke-opacity: 0.9; stroke-width: 2.5px; }
          50%  { stroke-opacity: 0.3; stroke-width: 6px;   }
          100% { stroke-opacity: 0.9; stroke-width: 2.5px; }
        }
        .outage-pulse {
          animation: outage-pulse-anim 1.5s ease-in-out infinite;
        }
        .outage-popup {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          color: #1a1a2e;
        }
        .outage-popup-country {
          font-weight: bold;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .outage-popup-severity {
          font-weight: bold;
          font-size: 13px;
          margin-bottom: 4px;
        }
        .outage-popup-note {
          margin: 4px 0;
          color: #333;
        }
        .outage-popup-ts,
        .outage-popup-source {
          font-size: 10px;
          color: #666;
          margin-top: 2px;
        }
      `;
      document.head.appendChild(style);
    }

    wrap.appendChild(_legend);
  }

  /**
   * Remove the legend from the DOM.
   */
  function _removeLegend() {
    if (_legend && _legend.parentNode) {
      _legend.parentNode.removeChild(_legend);
    }
    _legend = null;
  }

  /**
   * Load data and render, used for initial load and auto-refresh cycles.
   */
  function _loadAndRender() {
    if (!_enabled || !_map) return;

    _fetchOutage()
      .then((entries) => {
        if (!_enabled) return; // toggled off while fetching
        _renderMarkers(entries);
      })
      .catch((err) => {
        console.error('[OUTAGE] Fetch error:', err.message);
        _showError(err.message || 'Failed to load outage data.');
      });
  }

  /**
   * Start the 5-minute auto-refresh timer.
   */
  function _startRefresh() {
    _stopRefresh();
    _refreshTimer = setInterval(_loadAndRender, REFRESH_INTERVAL_MS);
  }

  /**
   * Stop the auto-refresh timer.
   */
  function _stopRefresh() {
    if (_refreshTimer !== null) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
  }

  /**
   * Show a dismissible error banner on the map.
   * @param {string} message
   */
  function _showError(message) {
    const wrap = document.getElementById('map-wrap') || document.body;
    const existing = document.getElementById('outage-error');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const errEl = document.createElement('div');
    errEl.id = 'outage-error';
    errEl.textContent = `Outage layer: ${message}`;
    Object.assign(errEl.style, {
      position:     'absolute',
      top:          '60px',
      left:         '50%',
      transform:    'translateX(-50%)',
      zIndex:       '1100',
      background:   'rgba(200, 30, 30, 0.85)',
      color:        '#fff',
      padding:      '6px 14px',
      borderRadius: '4px',
      fontSize:     '13px',
    });
    wrap.appendChild(errEl);

    setTimeout(() => {
      if (errEl.parentNode) errEl.parentNode.removeChild(errEl);
    }, 7000);
  }

  /**
   * Format an ISO or Unix timestamp for display.
   * @param {string|number} ts
   * @returns {string}
   */
  function _formatTimestamp(ts) {
    try {
      const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
      return d.toUTCString();
    } catch (_) {
      return String(ts);
    }
  }

  /**
   * Escape HTML special characters to prevent XSS in popup content.
   * @param {string} str
   * @returns {string}
   */
  function _escapeHtml(str) {
    const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
    return String(str).replace(/[&<>"']/g, (c) => map[c]);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Store the Leaflet map reference. Must be called before setEnabled.
   * @param {L.Map} map — Leaflet map instance
   */
  function init(map) {
    if (!map || typeof map.addLayer !== 'function') {
      throw new TypeError('[OUTAGE] init() requires a valid Leaflet map instance.');
    }
    _map = map;
  }

  /**
   * Enable or disable the outage layer.
   * Enabling fetches fresh data and starts the 5-minute auto-refresh cycle.
   * Disabling clears all markers, legend, and the refresh timer.
   * @param {boolean} on
   */
  function setEnabled(on) {
    if (!_map) {
      console.warn('[OUTAGE] setEnabled() called before init(). Ignoring.');
      return;
    }

    _enabled = Boolean(on);

    if (!_enabled) {
      _stopRefresh();
      _clearMarkers();
      _removeLegend();
      return;
    }

    _showLegend();
    _loadAndRender();
    _startRefresh();
  }

  // ─── Public export ───────────────────────────────────────────────────────
  return { init, setEnabled };
})();
