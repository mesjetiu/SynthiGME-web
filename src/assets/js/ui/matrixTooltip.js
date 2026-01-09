/**
 * Matrix Pin Tooltip System
 * 
 * Provides informative tooltips for matrix pins showing source → destination labels.
 * Supports both desktop (hover) and mobile (tap to show, double-tap to toggle) interactions.
 * 
 * @module ui/matrixTooltip
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * This module provides:
 * 
 * 1. Label Generation (getLabelForSource, getLabelForDest):
 *    Converts source/dest objects from blueprints into human-readable strings.
 *    Uses i18n keys from translations.yaml for eventual translation support.
 * 
 * 2. Tooltip Component (MatrixTooltip class):
 *    A singleton floating tooltip positioned near the hovered/tapped pin.
 *    Auto-positions to stay within viewport bounds.
 * 
 * 3. Event Integration:
 *    - Desktop: mouseenter/mouseleave on pins
 *    - Mobile: single tap shows tooltip, double tap toggles pin
 *    - Auto-hide: 2.5s timeout OR tap outside
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 *   import { MatrixTooltip, getLabelForSource, getLabelForDest } from './matrixTooltip.js';
 *   
 *   const tooltip = new MatrixTooltip();
 *   tooltip.attachToMatrix(matrixTable, { sourceMap, destMap, rowBase, colBase });
 * 
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { t } from '../i18n/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// LABEL GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Converts a source object from a blueprint into a human-readable label.
 * 
 * @param {Object} source - Source descriptor from blueprint (e.g., { kind: 'panel3Osc', oscIndex: 0, channelId: 'sineSaw' })
 * @returns {string} Human-readable label (e.g., "Osc 1 (sin+saw)")
 * 
 * Supported source kinds:
 * - inputAmp:   { kind: 'inputAmp', channel: 0-7 }     → "Input 1"
 * - outputBus:  { kind: 'outputBus', bus: 1-8 }        → "Out Bus 1"
 * - noiseGen:   { kind: 'noiseGen', index: 0-1 }       → "Noise 1"
 * - panel3Osc:  { kind: 'panel3Osc', oscIndex: 0-11, channelId: 'sineSaw'|'triPulse' } → "Osc 1 (sin+saw)"
 */
export function getLabelForSource(source) {
  if (!source || !source.kind) return null;
  
  switch (source.kind) {
    case 'inputAmp':
      // channel is 0-indexed, display as 1-indexed
      return t('matrix.source.inputAmp', { channel: (source.channel ?? 0) + 1 });
    
    case 'outputBus':
      // bus is already 1-indexed in the blueprint
      return t('matrix.source.outputBus', { bus: source.bus ?? 1 });
    
    case 'noiseGen':
      // index is 0-indexed, display as 1-indexed
      return t('matrix.source.noiseGen', { index: (source.index ?? 0) + 1 });
    
    case 'panel3Osc': {
      // oscIndex is 0-indexed, display as 1-indexed
      const oscNum = (source.oscIndex ?? 0) + 1;
      const channelId = source.channelId || 'sineSaw';
      const key = channelId === 'triPulse' 
        ? 'matrix.source.panel3Osc.triPulse' 
        : 'matrix.source.panel3Osc.sineSaw';
      return t(key, { osc: oscNum });
    }
    
    default:
      return null;
  }
}

/**
 * Converts a destination object from a blueprint into a human-readable label.
 * 
 * @param {Object} dest - Destination descriptor from blueprint (e.g., { kind: 'outputBus', bus: 1 })
 * @returns {string} Human-readable label (e.g., "Out 1")
 * 
 * Supported destination kinds:
 * - outputBus:   { kind: 'outputBus', bus: 1-8 }        → "Out 1"
 * - oscilloscope: { kind: 'oscilloscope', channel: 'X'|'Y' } → "Scope Y"
 * - oscFreqCV:   { kind: 'oscFreqCV', oscIndex: 0-11 }  → "Osc 1 Freq CV"
 */
export function getLabelForDest(dest) {
  if (!dest || !dest.kind) return null;
  
  switch (dest.kind) {
    case 'outputBus':
      // bus is already 1-indexed
      return t('matrix.dest.outputBus', { bus: dest.bus ?? 1 });
    
    case 'oscilloscope': {
      const channel = dest.channel || 'Y';
      const key = `matrix.dest.oscilloscope.${channel}`;
      return t(key);
    }
    
    case 'oscFreqCV':
      // oscIndex is 0-indexed, display as 1-indexed
      return t('matrix.dest.oscFreqCV', { osc: (dest.oscIndex ?? 0) + 1 });
    
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOLTIP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Floating tooltip component for matrix pins.
 * 
 * Creates a single reusable tooltip element that positions itself near the
 * hovered/tapped pin. Handles viewport boundary detection to avoid clipping.
 * 
 * Mobile behavior:
 * - Single tap: show tooltip (does NOT toggle pin)
 * - Double tap: toggle pin (normal behavior)
 * - Tap outside or timeout: hide tooltip
 * 
 * Desktop behavior:
 * - Hover: show tooltip
 * - Mouse leave: hide tooltip
 */
export class MatrixTooltip {
  /**
   * @param {Object} options
   * @param {number} [options.autoHideDelay=2500] - Auto-hide delay in ms (mobile only)
   * @param {number} [options.doubleTapThreshold=300] - Max ms between taps for double-tap
   */
  constructor({ autoHideDelay = 2500, doubleTapThreshold = 300 } = {}) {
    this.autoHideDelay = autoHideDelay;
    this.doubleTapThreshold = doubleTapThreshold;
    
    // State
    this._element = null;
    this._hideTimeout = null;
    this._lastTapTime = 0;
    this._lastTapTarget = null;
    this._isVisible = false;
    
    // Bound handlers (for cleanup)
    this._onMouseEnter = this._handleMouseEnter.bind(this);
    this._onMouseLeave = this._handleMouseLeave.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onDocumentTap = this._handleDocumentTap.bind(this);
    
    // Attached matrices tracking
    this._attachedMatrices = new Map(); // table -> { sourceMap, destMap, rowBase, colBase }
  }
  
  /**
   * Gets or creates the tooltip DOM element.
   * Lazily created on first use.
   * @returns {HTMLElement}
   */
  get element() {
    if (!this._element) {
      this._element = document.createElement('div');
      this._element.className = 'matrix-tooltip';
      this._element.setAttribute('role', 'tooltip');
      this._element.setAttribute('aria-hidden', 'true');
      document.body.appendChild(this._element);
    }
    return this._element;
  }
  
  /**
   * Attaches tooltip functionality to a matrix table.
   * 
   * @param {HTMLTableElement} table - The matrix table element
   * @param {Object} options
   * @param {Map<number, Object>} options.sourceMap - Row index → source object
   * @param {Map<number, Object>} options.destMap - Col index → dest object
   * @param {number} [options.rowBase=67] - Row base for Synthi numbering
   * @param {number} [options.colBase=1] - Column base for Synthi numbering
   */
  attachToMatrix(table, { sourceMap, destMap, rowBase = 67, colBase = 1 }) {
    if (!table) return;
    
    // Store maps for this matrix
    this._attachedMatrices.set(table, { sourceMap, destMap, rowBase, colBase });
    
    // Desktop: hover events (only for devices with fine pointer)
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      table.addEventListener('mouseover', this._onMouseEnter);
      table.addEventListener('mouseout', this._onMouseLeave);
    }
    
    // Mobile: touch events (use touchstart to intercept before click)
    table.addEventListener('touchstart', this._onTouchStart, { passive: true });
  }
  
  /**
   * Detaches tooltip from a matrix table.
   * @param {HTMLTableElement} table
   */
  detachFromMatrix(table) {
    if (!table) return;
    
    this._attachedMatrices.delete(table);
    table.removeEventListener('mouseover', this._onMouseEnter);
    table.removeEventListener('mouseout', this._onMouseLeave);
    table.removeEventListener('touchstart', this._onTouchStart);
  }
  
  /**
   * Shows the tooltip near a pin button.
   * 
   * @param {HTMLButtonElement} pinBtn - The pin button element
   * @param {string} text - Tooltip text to display
   */
  show(pinBtn, text) {
    if (!pinBtn || !text) return;
    
    const tooltip = this.element;
    tooltip.textContent = text;
    tooltip.setAttribute('aria-hidden', 'false');
    
    // Position calculation
    const pinRect = pinBtn.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Calculate initial position (above the pin, centered)
    let left = pinRect.left + (pinRect.width / 2) - (tooltipRect.width / 2);
    let top = pinRect.top - tooltipRect.height - 8; // 8px gap above
    
    // Viewport boundary checks
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    const margin = 8; // Minimum distance from viewport edges
    
    // Horizontal bounds
    if (left < margin) {
      left = margin;
    } else if (left + tooltipRect.width > viewport.width - margin) {
      left = viewport.width - tooltipRect.width - margin;
    }
    
    // Vertical bounds: if not enough space above, show below
    if (top < margin) {
      top = pinRect.bottom + 8; // 8px gap below
    }
    
    // If still not enough space below, show to the side
    if (top + tooltipRect.height > viewport.height - margin) {
      top = Math.max(margin, viewport.height - tooltipRect.height - margin);
      // Shift horizontally to avoid the pin
      left = pinRect.right + 8;
      if (left + tooltipRect.width > viewport.width - margin) {
        left = pinRect.left - tooltipRect.width - 8;
      }
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.classList.add('is-visible');
    this._isVisible = true;
    
    // Set up auto-hide timeout (for mobile)
    this._clearHideTimeout();
    this._hideTimeout = setTimeout(() => this.hide(), this.autoHideDelay);
    
    // Listen for taps outside to hide
    document.addEventListener('touchstart', this._onDocumentTap, { passive: true, once: true });
  }
  
  /**
   * Hides the tooltip.
   */
  hide() {
    if (!this._element) return;
    
    this._element.classList.remove('is-visible');
    this._element.setAttribute('aria-hidden', 'true');
    this._isVisible = false;
    this._clearHideTimeout();
  }
  
  /**
   * Destroys the tooltip, removing the element from DOM.
   */
  destroy() {
    this.hide();
    this._attachedMatrices.forEach((_, table) => this.detachFromMatrix(table));
    this._attachedMatrices.clear();
    
    if (this._element && this._element.parentNode) {
      this._element.parentNode.removeChild(this._element);
    }
    this._element = null;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE METHODS
  // ─────────────────────────────────────────────────────────────────────────────
  
  _clearHideTimeout() {
    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }
  }
  
  /**
   * Generates tooltip text for a pin given its row/col and the matrix's maps.
   * @param {number} row - 0-based row index
   * @param {number} col - 0-based column index
   * @param {Object} maps - { sourceMap, destMap, rowBase, colBase }
   * @returns {string|null} Tooltip text or null if no info available
   */
  _getTooltipText(row, col, maps) {
    const { sourceMap, destMap, rowBase, colBase } = maps;
    
    const source = sourceMap?.get(row);
    const dest = destMap?.get(col);
    
    // Only show tooltip if at least one of source/dest is defined
    if (!source && !dest) return null;
    
    const sourceLabel = source 
      ? getLabelForSource(source) 
      : t('matrix.tooltip.unknownSource', { row: row + rowBase });
    
    const destLabel = dest 
      ? getLabelForDest(dest) 
      : t('matrix.tooltip.unknownDest', { col: col + colBase });
    
    return t('matrix.tooltip.format', { source: sourceLabel, dest: destLabel });
  }
  
  /**
   * Finds the matrix maps for a given table element.
   * @param {HTMLElement} table
   * @returns {Object|null}
   */
  _getMapsForTable(table) {
    return this._attachedMatrices.get(table) || null;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Desktop: mouseenter on pin - show tooltip
   */
  _handleMouseEnter(ev) {
    const btn = ev.target?.closest?.('button.pin-btn');
    if (!btn || btn.classList.contains('is-hidden-pin')) return;
    
    const table = btn.closest('table');
    const maps = this._getMapsForTable(table);
    if (!maps) return;
    
    const row = parseInt(btn.dataset.row, 10);
    const col = parseInt(btn.dataset.col, 10);
    
    const text = this._getTooltipText(row, col, maps);
    if (text) {
      this.show(btn, text);
    }
  }
  
  /**
   * Desktop: mouseleave - hide tooltip
   */
  _handleMouseLeave(ev) {
    const btn = ev.target?.closest?.('button.pin-btn');
    if (btn) {
      this.hide();
    }
  }
  
  /**
   * Mobile: touchstart - detect single/double tap
   * 
   * Single tap: show tooltip (prevent default click toggle)
   * Double tap: allow normal click to toggle pin
   */
  _handleTouchStart(ev) {
    const btn = ev.target?.closest?.('button.pin-btn');
    if (!btn || btn.classList.contains('is-hidden-pin') || btn.disabled) return;
    
    const now = Date.now();
    const isDoubleTap = (
      this._lastTapTarget === btn && 
      (now - this._lastTapTime) < this.doubleTapThreshold
    );
    
    this._lastTapTime = now;
    this._lastTapTarget = btn;
    
    if (isDoubleTap) {
      // Double tap: hide tooltip and let the click event proceed normally
      this.hide();
      this._lastTapTime = 0; // Reset to prevent triple-tap issues
      this._lastTapTarget = null;
      return;
    }
    
    // Single tap: show tooltip
    // We need to prevent the click from toggling the pin
    // Use a one-time click capture listener
    const preventClick = (clickEv) => {
      clickEv.stopPropagation();
      clickEv.preventDefault();
    };
    
    btn.addEventListener('click', preventClick, { once: true, capture: true });
    
    // Show tooltip
    const table = btn.closest('table');
    const maps = this._getMapsForTable(table);
    if (!maps) return;
    
    const row = parseInt(btn.dataset.row, 10);
    const col = parseInt(btn.dataset.col, 10);
    
    const text = this._getTooltipText(row, col, maps);
    if (text) {
      this.show(btn, text);
    }
  }
  
  /**
   * Document tap: hide tooltip if tapping outside
   */
  _handleDocumentTap(ev) {
    if (!this._isVisible) return;
    
    const tooltip = this._element;
    const target = ev.target;
    
    // If tap is on the tooltip itself, don't hide
    if (tooltip && tooltip.contains(target)) {
      // Re-add listener for next tap
      document.addEventListener('touchstart', this._onDocumentTap, { passive: true, once: true });
      return;
    }
    
    // If tap is on a pin button, the pin's handler will manage visibility
    const isOnPin = target?.closest?.('button.pin-btn');
    if (!isOnPin) {
      this.hide();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shared singleton instance of MatrixTooltip.
 * Use this for most cases to avoid multiple tooltip elements.
 */
let _sharedInstance = null;

/**
 * Gets the shared MatrixTooltip instance, creating it if necessary.
 * @returns {MatrixTooltip}
 */
export function getSharedTooltip() {
  if (!_sharedInstance) {
    _sharedInstance = new MatrixTooltip();
  }
  return _sharedInstance;
}
