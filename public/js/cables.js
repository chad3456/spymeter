/**
 * cables.js — Submarine Cable Layer
 * OSINT Dashboard — TeleGeography submarine cable data via server proxy
 *
 * Fetches /api/cables (proxied TeleGeography GeoJSON), renders each cable
 * as a Leaflet polyline with hover tooltip and a count/source legend.
 *
 * Usage:
 *   CABLES.init(map);
 *   CABLES.setEnabled(true);
 */

'use strict';

const CABLES = (() => {
  // ─── State ───────────────────────────────────────────────────────────────
  let _map        = null;
  let _polylines  = [];
  let _legend     = null;
  let _enabled    = false;
  let _fetching   = false;
  let _cableData  = null; // cached response

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Fetch cable GeoJSON from the server proxy endpoint.
   * Caches the result so subsequent enable/disable cycles do not re-fetch.
   * @returns {Promise<Array>} Resolves with the cables array.
   */
  function _fetchCables() {
    if (_cableData) {
      return Promise.resolve(_cableData);
    }

    return fetch('/api/cables', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`/api/cables returned HTTP ${res.status} ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!data || !Array.isArray(data.cables)) {
          throw new Error('Unexpected payload from /api/cables — expected { cables: [...] }');
        }
        _cableData = data.cables;
        return _cableData;
      });
  }

  /**
   * Convert TeleGeography [lng, lat] coordinate pairs to Leaflet [lat, lng].
   * @param {Array<[number, number]>} coords — [[lng,lat], ...]
   * @returns {Array<[number, number]>} [[lat,lng], ...]
   */
  function _swapCoords(coords) {
    if (!Array.isArray(coords)) return [];
    return coords.map(([lng, lat]) => [lat, lng]);
  }

  /**
   * Draw all cables onto the map and store polyline references.
   * @param {Array} cables — array of cable objects from TeleGeography
   */
  function _renderCables(cables) {
    _clearPolylines();

    cables.forEach((cable) => {
      const { cable_name, color, coordinates } = cable;

      if (!Array.isArray(coordinates) || coordinates.length < 2) return;

      const latlngs = _swapCoords(coordinates);

      const polyline = L.polyline(latlngs, {
        color:   color || '#00aaff',
        weight:  1.5,
        opacity: 0.7,
        // Smooth rendering hint for SVG renderer
        smoothFactor: 1.5,
      });

      // Hover tooltip — show cable name
      polyline.bindTooltip(cable_name || 'Unknown Cable', {
        sticky:    true,
        direction: 'top',
        className: 'cables-tooltip',
        offset:    L.point(0, -6),
      });

      polyline.on('mouseover', function () {
        this.setStyle({ weight: 3, opacity: 1 });
      });

      polyline.on('mouseout', function () {
        this.setStyle({ weight: 1.5, opacity: 0.7 });
      });

      polyline.addTo(_map);
      _polylines.push(polyline);
    });
  }

  /**
   * Remove all rendered polylines from the map and clear internal list.
   */
  function _clearPolylines() {
    _polylines.forEach((pl) => {
      if (_map.hasLayer(pl)) {
        _map.removeLayer(pl);
      }
    });
    _polylines = [];
  }

  /**
   * Create or update the legend panel inside #map-wrap.
   * @param {number} count — number of cables rendered
   */
  function _showLegend(count) {
    _removeLegend();

    const wrap = document.getElementById('map-wrap') || document.body;

    _legend = document.createElement('div');
    _legend.id = 'cables-legend';
    _legend.setAttribute('role', 'region');
    _legend.setAttribute('aria-label', 'Submarine cables legend');
    _legend.innerHTML = `
      <div class="legend-header">
        <span class="legend-icon">&#127758;</span>
        <strong>Submarine Cables</strong>
      </div>
      <div class="legend-body">
        <div class="legend-stat">
          <span class="legend-stat-value">${count.toLocaleString()}</span>
          <span class="legend-stat-label">cables rendered</span>
        </div>
        <div class="legend-source">
          Source: <a href="https://www.submarinecablemap.com/" target="_blank" rel="noopener noreferrer">TeleGeography</a>
        </div>
        <div class="legend-note">Hover a cable for name</div>
      </div>
    `;

    // Inline critical styles so the legend works without an external stylesheet
    Object.assign(_legend.style, {
      position:      'absolute',
      bottom:        '30px',
      right:         '10px',
      zIndex:        '1000',
      background:    'rgba(10, 14, 26, 0.88)',
      border:        '1px solid rgba(0, 170, 255, 0.4)',
      borderRadius:  '6px',
      padding:       '10px 14px',
      color:         '#c8d6e5',
      fontSize:      '12px',
      lineHeight:    '1.6',
      maxWidth:      '200px',
      backdropFilter:'blur(4px)',
      boxShadow:     '0 2px 12px rgba(0,0,0,0.5)',
      pointerEvents: 'auto',
    });

    wrap.appendChild(_legend);
  }

  /**
   * Remove the legend panel from the DOM if present.
   */
  function _removeLegend() {
    if (_legend && _legend.parentNode) {
      _legend.parentNode.removeChild(_legend);
    }
    _legend = null;
  }

  /**
   * Display an inline error message on the map.
   * @param {string} message
   */
  function _showError(message) {
    console.error('[CABLES]', message);

    const wrap = document.getElementById('map-wrap') || document.body;
    const errEl = document.createElement('div');
    errEl.id = 'cables-error';
    errEl.textContent = `Cables: ${message}`;
    Object.assign(errEl.style, {
      position:   'absolute',
      top:        '60px',
      left:       '50%',
      transform:  'translateX(-50%)',
      zIndex:     '1100',
      background: 'rgba(200, 30, 30, 0.85)',
      color:      '#fff',
      padding:    '6px 14px',
      borderRadius:'4px',
      fontSize:   '13px',
    });
    wrap.appendChild(errEl);

    // Auto-dismiss after 6 s
    setTimeout(() => {
      if (errEl.parentNode) errEl.parentNode.removeChild(errEl);
    }, 6000);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Store the Leaflet map reference. Must be called before setEnabled.
   * @param {L.Map} map — Leaflet map instance
   */
  function init(map) {
    if (!map || typeof map.addLayer !== 'function') {
      throw new TypeError('[CABLES] init() requires a valid Leaflet map instance.');
    }
    _map = map;
  }

  /**
   * Enable or disable the submarine cables layer.
   * When enabling: fetches data (cached after first load) and renders polylines + legend.
   * When disabling: removes all polylines and legend from the map.
   * @param {boolean} on
   */
  function setEnabled(on) {
    if (!_map) {
      console.warn('[CABLES] setEnabled() called before init(). Ignoring.');
      return;
    }

    _enabled = Boolean(on);

    if (!_enabled) {
      _clearPolylines();
      _removeLegend();
      return;
    }

    // Already fetching — prevent duplicate requests
    if (_fetching) return;

    // If we have cached data, render immediately
    if (_cableData) {
      _renderCables(_cableData);
      _showLegend(_cableData.length);
      return;
    }

    _fetching = true;

    _fetchCables()
      .then((cables) => {
        _fetching = false;
        // Only render if still enabled (user may have toggled off while fetching)
        if (_enabled) {
          _renderCables(cables);
          _showLegend(cables.length);
        }
      })
      .catch((err) => {
        _fetching = false;
        _showError(err.message || 'Failed to load cable data.');
      });
  }

  // ─── Public export ───────────────────────────────────────────────────────
  return { init, setEnabled };
})();
