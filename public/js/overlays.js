/**
 * overlays.js — OSINT Dashboard Overlay Control Panel
 * Military HUD-style map control panel injected into #map-wrap
 * Manages tile layer switching and overlay visibility/opacity
 */

'use strict';

const OVERLAYS = (() => {

  // ─── State ───────────────────────────────────────────────────────────────────
  let _map = null;
  let _currentStyle = 'DARK';
  let _collapsed = false;
  let _overlayOpacity = 0.85;

  // Active tile layer references
  let _baseLayers = [];
  let _labelLayer = null;

  // Registered overlay modules { id, label, layerGroup, enabled }
  const _overlayModules = {};

  // ─── Tile Layer Definitions ───────────────────────────────────────────────────
  const TILE_CONFIGS = {
    DARK: {
      base: [
        {
          url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
          options: {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
          }
        }
      ],
      label: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
        options: {
          subdomains: 'abcd',
          maxZoom: 20,
          pane: 'overlayPane'
        }
      }
    },
    LIGHT: {
      base: [
        {
          url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          options: {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
          }
        }
      ],
      label: null
    },
    SATELLITE: {
      base: [
        {
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          options: {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 19
          }
        }
      ],
      label: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        options: {
          maxZoom: 19,
          pane: 'overlayPane'
        }
      }
    },
    TERRAIN: {
      base: [
        {
          url: 'https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}.jpg',
          options: {
            attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://stamen.com">Stamen Design</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18
          }
        }
      ],
      label: null
    },
    LEGO: {
      base: [
        {
          // CartoDB Voyager — bright, cartoon-flat colors — best base for Lego effect
          url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
          options: {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 18
          }
        }
      ],
      label: {
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
        options: {
          subdomains: 'abcd',
          maxZoom: 18,
          pane: 'overlayPane'
        }
      }
    }
  };

  // ─── Panel HTML ───────────────────────────────────────────────────────────────
  function _buildPanelHTML() {
    return `
<div id="overlay-panel" class="ovp-panel ovp-expanded">

  <div class="ovp-header">
    <span class="ovp-title">
      <span class="ovp-blink">&#9632;</span> MAP CTRL
    </span>
    <button id="ovp-toggle" class="ovp-toggle-btn" title="Collapse panel">&#9650;</button>
  </div>

  <div id="ovp-body" class="ovp-body">

    <!-- ── MAP STYLE ─────────────────────────────── -->
    <div class="ovp-section">
      <div class="ovp-section-label">MAP STYLE</div>
      <div class="ovp-style-grid">
        <button class="ovp-style-btn ovp-style-active" data-style="DARK">DARK</button>
        <button class="ovp-style-btn" data-style="LIGHT">LIGHT</button>
        <button class="ovp-style-btn" data-style="SATELLITE">SAT</button>
        <button class="ovp-style-btn" data-style="TERRAIN">TERRAIN</button>
        <button class="ovp-style-btn" data-style="LEGO" style="color:#ffcc00;border-color:#ffcc0044">🟨 LEGO</button>
      </div>
    </div>

    <div class="ovp-divider"></div>

    <!-- ── OVERLAYS ───────────────────────────────── -->
    <div class="ovp-section">
      <div class="ovp-section-label">OVERLAYS</div>
      <div class="ovp-overlay-list" id="ovp-overlay-list">
        <div class="ovp-overlay-row" data-overlay="leaders">
          <span class="ovp-overlay-dot" style="background:#00ff88"></span>
          <span class="ovp-overlay-name">Leaders</span>
          <label class="ovp-switch">
            <input type="checkbox" data-overlay-toggle="leaders">
            <span class="ovp-slider"></span>
          </label>
        </div>
        <div class="ovp-overlay-row" data-overlay="cables">
          <span class="ovp-overlay-dot" style="background:#00ccff"></span>
          <span class="ovp-overlay-name">Cables</span>
          <label class="ovp-switch">
            <input type="checkbox" data-overlay-toggle="cables">
            <span class="ovp-slider"></span>
          </label>
        </div>
        <div class="ovp-overlay-row" data-overlay="outage">
          <span class="ovp-overlay-dot" style="background:#ff6600"></span>
          <span class="ovp-overlay-name">Outage</span>
          <label class="ovp-switch">
            <input type="checkbox" data-overlay-toggle="outage">
            <span class="ovp-slider"></span>
          </label>
        </div>
        <div class="ovp-overlay-row" data-overlay="stocks">
          <span class="ovp-overlay-dot" style="background:#ffcc00"></span>
          <span class="ovp-overlay-name">Stocks</span>
          <label class="ovp-switch">
            <input type="checkbox" data-overlay-toggle="stocks">
            <span class="ovp-slider"></span>
          </label>
        </div>
        <div class="ovp-overlay-row" data-overlay="oil">
          <span class="ovp-overlay-dot" style="background:#cc4400"></span>
          <span class="ovp-overlay-name">Oil</span>
          <label class="ovp-switch">
            <input type="checkbox" data-overlay-toggle="oil">
            <span class="ovp-slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="ovp-divider"></div>

    <!-- ── MAP OPTIONS ────────────────────────────── -->
    <div class="ovp-section">
      <div class="ovp-section-label">MAP OPTIONS</div>
      <div class="ovp-option-row">
        <span class="ovp-option-label">OVERLAY OPACITY</span>
        <div class="ovp-slider-wrap">
          <input
            type="range"
            id="ovp-opacity-slider"
            class="ovp-range"
            min="0"
            max="100"
            value="85"
            step="1"
          >
          <span class="ovp-range-val" id="ovp-opacity-val">85%</span>
        </div>
      </div>
    </div>

  </div><!-- /ovp-body -->
</div><!-- /overlay-panel -->
`;
  }

  // ─── CSS Injection ────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('ovp-styles')) return;

    const style = document.createElement('style');
    style.id = 'ovp-styles';
    style.textContent = `
/* ─── Panel Container ─────────────────────────────────────────────── */
#overlay-panel {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 1000;
  width: 188px;
  background: rgba(4, 6, 8, 0.95);
  border: 1px solid rgba(0, 255, 136, 0.35);
  border-radius: 3px;
  box-shadow:
    0 0 0 1px rgba(0, 255, 136, 0.08),
    0 4px 24px rgba(0, 0, 0, 0.7),
    inset 0 0 30px rgba(0, 255, 136, 0.02);
  font-family: 'Courier New', Courier, monospace;
  font-size: 10px;
  color: #a0c8a0;
  user-select: none;
  transition: width 0.2s ease;
}

/* ─── Header ──────────────────────────────────────────────────────── */
.ovp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 5px 8px;
  border-bottom: 1px solid rgba(0, 255, 136, 0.18);
  background: rgba(0, 255, 136, 0.04);
}

.ovp-title {
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 2px;
  color: #00ff88;
  text-shadow: 0 0 8px rgba(0, 255, 136, 0.6);
}

.ovp-blink {
  font-size: 7px;
  color: #00ff88;
  animation: ovp-blink-anim 1.4s step-end infinite;
}

@keyframes ovp-blink-anim {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}

.ovp-toggle-btn {
  background: none;
  border: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 2px;
  color: #00ff88;
  cursor: pointer;
  font-size: 8px;
  padding: 1px 5px 2px 5px;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}

.ovp-toggle-btn:hover {
  background: rgba(0, 255, 136, 0.15);
  color: #ffffff;
}

/* ─── Body / Collapse ─────────────────────────────────────────────── */
#ovp-body {
  overflow: hidden;
  max-height: 600px;
  transition: max-height 0.25s ease, opacity 0.2s ease;
  opacity: 1;
}

.ovp-panel.ovp-collapsed #ovp-body {
  max-height: 0;
  opacity: 0;
}

.ovp-panel.ovp-collapsed .ovp-toggle-btn {
  transform: rotate(180deg);
}

/* ─── Sections ────────────────────────────────────────────────────── */
.ovp-section {
  padding: 7px 8px 6px 8px;
}

.ovp-section-label {
  font-size: 9px;
  font-weight: bold;
  letter-spacing: 2.5px;
  color: rgba(0, 255, 136, 0.55);
  margin-bottom: 6px;
  text-transform: uppercase;
}

.ovp-divider {
  height: 1px;
  background: rgba(0, 255, 136, 0.12);
  margin: 0 8px;
}

/* ─── Map Style Buttons ───────────────────────────────────────────── */
.ovp-style-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.ovp-style-btn {
  background: rgba(0, 255, 136, 0.05);
  border: 1px solid rgba(0, 255, 136, 0.25);
  border-radius: 2px;
  color: #80b890;
  cursor: pointer;
  font-family: 'Courier New', Courier, monospace;
  font-size: 9px;
  font-weight: bold;
  letter-spacing: 1px;
  padding: 5px 2px;
  text-align: center;
  transition: all 0.15s ease;
}

.ovp-style-btn:hover {
  background: rgba(0, 255, 136, 0.14);
  border-color: rgba(0, 255, 136, 0.55);
  color: #ccffdd;
}

.ovp-style-btn.ovp-style-active {
  background: rgba(0, 255, 136, 0.18);
  border-color: #00ff88;
  color: #00ff88;
  box-shadow: 0 0 6px rgba(0, 255, 136, 0.3), inset 0 0 6px rgba(0, 255, 136, 0.08);
  text-shadow: 0 0 6px rgba(0, 255, 136, 0.7);
}

/* ─── Overlay Rows ────────────────────────────────────────────────── */
.ovp-overlay-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ovp-overlay-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 2px;
  transition: background 0.12s;
}

.ovp-overlay-row:hover {
  background: rgba(0, 255, 136, 0.05);
}

.ovp-overlay-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 4px currentColor;
}

.ovp-overlay-name {
  flex: 1;
  font-size: 10px;
  letter-spacing: 1px;
  color: #8ab898;
  text-transform: uppercase;
}

/* ─── Toggle Switch ───────────────────────────────────────────────── */
.ovp-switch {
  position: relative;
  display: inline-block;
  width: 30px;
  height: 15px;
  flex-shrink: 0;
  cursor: pointer;
}

.ovp-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.ovp-slider {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(0, 255, 136, 0.25);
  border-radius: 15px;
  transition: background 0.2s, border-color 0.2s;
}

.ovp-slider::before {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  left: 2px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 255, 136, 0.4);
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.ovp-switch input:checked + .ovp-slider {
  background: rgba(0, 255, 136, 0.15);
  border-color: #00ff88;
}

.ovp-switch input:checked + .ovp-slider::before {
  transform: translateX(15px) translateY(-50%);
  background: #00ff88;
  box-shadow: 0 0 5px rgba(0, 255, 136, 0.8);
}

/* ─── Options / Opacity Slider ───────────────────────────────────── */
.ovp-option-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ovp-option-label {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: rgba(0, 255, 136, 0.5);
  text-transform: uppercase;
}

.ovp-slider-wrap {
  display: flex;
  align-items: center;
  gap: 7px;
}

.ovp-range {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  background: rgba(0, 255, 136, 0.2);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.ovp-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #00ff88;
  box-shadow: 0 0 5px rgba(0, 255, 136, 0.7);
  cursor: pointer;
  border: none;
}

.ovp-range::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #00ff88;
  box-shadow: 0 0 5px rgba(0, 255, 136, 0.7);
  cursor: pointer;
  border: none;
}

.ovp-range::-webkit-slider-runnable-track {
  background: linear-gradient(to right, rgba(0,255,136,0.5) 0%, rgba(0,255,136,0.5) var(--range-pct, 85%), rgba(0,255,136,0.15) var(--range-pct, 85%));
  border-radius: 3px;
  height: 3px;
}

.ovp-range-val {
  font-size: 9px;
  color: #00ff88;
  min-width: 28px;
  text-align: right;
  letter-spacing: 0.5px;
}

/* ─── Corner Accents ──────────────────────────────────────────────── */
#overlay-panel::before,
#overlay-panel::after {
  content: '';
  position: absolute;
  width: 7px;
  height: 7px;
  border-color: rgba(0, 255, 136, 0.5);
  border-style: solid;
}

#overlay-panel::before {
  top: -1px;
  left: -1px;
  border-width: 1px 0 0 1px;
}

#overlay-panel::after {
  bottom: -1px;
  right: -1px;
  border-width: 0 1px 1px 0;
}
`;
    document.head.appendChild(style);
  }

  // ─── Tile Layer Management ────────────────────────────────────────────────────
  function _clearBaseLayers() {
    _baseLayers.forEach(layer => {
      if (_map.hasLayer(layer)) _map.removeLayer(layer);
    });
    _baseLayers = [];

    if (_labelLayer && _map.hasLayer(_labelLayer)) {
      _map.removeLayer(_labelLayer);
      _labelLayer = null;
    }
  }

  function _applyStyle(styleName) {
    const config = TILE_CONFIGS[styleName];
    if (!config) return;

    _clearBaseLayers();

    // Add base tile layers
    config.base.forEach(def => {
      const layer = L.tileLayer(def.url, def.options);
      layer.addTo(_map);
      _baseLayers.push(layer);
    });

    // Add label layer on top if defined
    if (config.label) {
      _labelLayer = L.tileLayer(config.label.url, config.label.options);
      _labelLayer.addTo(_map);
    }

    _currentStyle = styleName;
    // Toggle Lego mode CSS class on body for stud/pixel effect
    document.body.classList.toggle('lego-mode', styleName === 'LEGO');
  }

  // ─── Overlay Opacity ──────────────────────────────────────────────────────────
  function _applyOpacity(value) {
    _overlayOpacity = value / 100;
    Object.values(_overlayModules).forEach(mod => {
      if (mod.layerGroup && typeof mod.layerGroup.setStyle === 'function') {
        mod.layerGroup.setStyle({ opacity: _overlayOpacity, fillOpacity: _overlayOpacity });
      }
      // For layer groups with individual layers
      if (mod.layerGroup && typeof mod.layerGroup.eachLayer === 'function') {
        mod.layerGroup.eachLayer(layer => {
          if (typeof layer.setOpacity === 'function') layer.setOpacity(_overlayOpacity);
          if (typeof layer.setStyle === 'function') {
            try { layer.setStyle({ opacity: _overlayOpacity, fillOpacity: _overlayOpacity * 0.4 }); } catch (e) { /* ignore */ }
          }
        });
      }
    });
  }

  // ─── Event Binding ────────────────────────────────────────────────────────────
  function _bindEvents() {
    // Collapse toggle
    const toggleBtn = document.getElementById('ovp-toggle');
    const panel = document.getElementById('overlay-panel');
    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', () => {
        _collapsed = !_collapsed;
        panel.classList.toggle('ovp-collapsed', _collapsed);
        toggleBtn.title = _collapsed ? 'Expand panel' : 'Collapse panel';
      });
    }

    // Map style buttons
    document.querySelectorAll('.ovp-style-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const style = btn.dataset.style;
        setMapStyle(style);
      });
    });

    // Overlay toggles
    document.querySelectorAll('[data-overlay-toggle]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const overlayId = checkbox.dataset.overlayToggle;
        const enabled = checkbox.checked;
        _fireOverlayToggle(overlayId, enabled);
      });
    });

    // Opacity slider
    const opacitySlider = document.getElementById('ovp-opacity-slider');
    const opacityVal = document.getElementById('ovp-opacity-val');
    if (opacitySlider) {
      // Set CSS custom property for track fill on init
      opacitySlider.style.setProperty('--range-pct', '85%');

      opacitySlider.addEventListener('input', () => {
        const val = parseInt(opacitySlider.value, 10);
        opacitySlider.style.setProperty('--range-pct', `${val}%`);
        if (opacityVal) opacityVal.textContent = `${val}%`;
        _applyOpacity(val);
      });
    }
  }

  // ─── Overlay Toggle Dispatch ──────────────────────────────────────────────────
  function _fireOverlayToggle(overlayId, enabled) {
    const mod = _overlayModules[overlayId];
    if (!mod) return;

    if (typeof mod.setEnabled === 'function') {
      mod.setEnabled(enabled);
    } else if (mod.layerGroup) {
      if (enabled) {
        _map.addLayer(mod.layerGroup);
      } else {
        _map.removeLayer(mod.layerGroup);
      }
    }
  }

  // ─── Style Button State ───────────────────────────────────────────────────────
  function _updateStyleButtons(activeStyle) {
    document.querySelectorAll('.ovp-style-btn').forEach(btn => {
      btn.classList.toggle('ovp-style-active', btn.dataset.style === activeStyle);
    });
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * init(map) — Inject panel into #map-wrap and initialize tile layers.
   * @param {L.Map} map - Leaflet map instance
   */
  function init(map) {
    _map = map;

    // Inject styles
    _injectStyles();

    // Inject panel HTML into #map-wrap
    const mapWrap = document.getElementById('map-wrap');
    if (!mapWrap) {
      console.warn('[OVERLAYS] #map-wrap not found. Appending to body instead.');
      document.body.insertAdjacentHTML('beforeend', _buildPanelHTML());
    } else {
      mapWrap.insertAdjacentHTML('beforeend', _buildPanelHTML());
    }

    // Apply default style
    _applyStyle(_currentStyle);

    // Bind all UI events
    _bindEvents();

    console.log('[OVERLAYS] Initialized. Style:', _currentStyle);
  }

  /**
   * setMapStyle(style) — Switch the base tile layer.
   * @param {'DARK'|'LIGHT'|'SATELLITE'|'TERRAIN'} style
   */
  function setMapStyle(style) {
    const key = style.toUpperCase();
    if (!TILE_CONFIGS[key]) {
      console.warn('[OVERLAYS] Unknown style:', style);
      return;
    }
    _applyStyle(key);
    _updateStyleButtons(key);
  }

  /**
   * getStyle() — Returns the current active style name.
   * @returns {string}
   */
  function getStyle() {
    return _currentStyle;
  }

  /**
   * registerOverlay(id, module) — Register an external overlay module.
   * Module must expose: { layerGroup, setEnabled(bool) }
   * @param {string} id - matches data-overlay-toggle attribute
   * @param {object} module
   */
  function registerOverlay(id, module) {
    _overlayModules[id] = module;
  }

  /**
   * getOpacity() — Returns current overlay opacity (0–1).
   * @returns {number}
   */
  function getOpacity() {
    return _overlayOpacity;
  }

  /**
   * setOverlayChecked(id, checked) — Programmatically set a toggle state.
   * @param {string} id
   * @param {boolean} checked
   */
  function setOverlayChecked(id, checked) {
    const checkbox = document.querySelector(`[data-overlay-toggle="${id}"]`);
    if (checkbox) {
      checkbox.checked = checked;
      _fireOverlayToggle(id, checked);
    }
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────
  return {
    init,
    setMapStyle,
    getStyle,
    getOpacity,
    registerOverlay,
    setOverlayChecked
  };

})();
