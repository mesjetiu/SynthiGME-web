/**
 * Matrix Pin Tooltip System
 * 
 * Provides informative tooltips for matrix pins showing source → destination labels.
 * Supports both desktop (hover) and mobile (tap to show, tap again to toggle) interactions.
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
 *    - Mobile: first tap shows tooltip + pulse, second tap (while visible) toggles pin
 *    - Auto-hide: 5s timeout OR tap outside
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
import { getPinSublabel } from './pinColorMenu.js';

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
    
    case 'oscSync':
      // Hard sync input - resets oscillator phase on positive edge
      // oscIndex is 0-indexed, display as 1-indexed
      return t('matrix.dest.oscSync', { osc: (dest.oscIndex ?? 0) + 1 });
    
    case 'outputLevelCV':
      // busIndex is 0-indexed, display as 1-indexed
      return t('matrix.dest.outputLevelCV', { bus: (dest.busIndex ?? 0) + 1 });
    
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
 * - First tap: show tooltip + pulse effect (prevents pin toggle)
 * - Second tap on same pin while tooltip visible: toggle pin (hides tooltip)
 * - Tap on different pin: show new tooltip (prevents pin toggle)
 * - Tap outside or timeout: hide tooltip
 * 
 * Desktop behavior:
 * - Hover: show tooltip
 * - Mouse leave: hide tooltip
 */
export class MatrixTooltip {
  /**
   * @param {Object} options
   * @param {number} [options.autoHideDelay=5000] - Auto-hide delay in ms (mobile only)
   * @param {number} [options.tapMaxDuration=300] - Max duration in ms for a touch to be considered a tap
   * @param {number} [options.tapMaxDistance=10] - Max movement in px for a touch to be considered a tap
   */
  constructor({ autoHideDelay = 5000, tapMaxDuration = 300, tapMaxDistance = 10 } = {}) {
    this.autoHideDelay = autoHideDelay;
    this.tapMaxDuration = tapMaxDuration;
    this.tapMaxDistance = tapMaxDistance;
    
    // State
    this._element = null;
    this._hideTimeout = null;
    this._isVisible = false;
    this._currentPinBtn = null; // Track current pin for pulse effect
    
    // Touch tracking state for distinguishing taps from gestures (pinch/pan)
    this._touchStartTime = 0;
    this._touchStartPos = null;
    this._touchStartTarget = null;
    this._wasSingleFinger = false;
    
    // Click blocking state (prevents synthetic click after showing tooltip)
    this._blockNextClick = false;
    this._clickBlockTimeout = null;
    
    // Bound handlers (for cleanup)
    this._onMouseEnter = this._handleMouseEnter.bind(this);
    this._onMouseLeave = this._handleMouseLeave.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
    this._onDocumentTap = this._handleDocumentTap.bind(this);
    this._onMatrixClick = this._handleMatrixClick.bind(this);
    this._onMatrixDblClick = this._handleMatrixDblClick.bind(this);
    
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
    
    // Mobile: use touchstart + touchend to detect real taps (not pinch/pan)
    // touchstart records initial state, touchend validates it was a real tap
    table.addEventListener('touchstart', this._onTouchStart, { passive: true });
    table.addEventListener('touchend', this._onTouchEnd, { passive: false });
    
    // Intercept clicks to block synthetic clicks after showing tooltip
    // Must be in capture phase to run before largeMatrix's click handler
    table.addEventListener('click', this._onMatrixClick, { capture: true });
    
    // Intercept dblclick to treat it as a single click (prevents interference with rapid taps)
    table.addEventListener('dblclick', this._onMatrixDblClick, { capture: true });
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
    table.removeEventListener('touchend', this._onTouchEnd);
    table.removeEventListener('click', this._onMatrixClick, { capture: true });
    table.removeEventListener('dblclick', this._onMatrixDblClick, { capture: true });
  }
  
  /**
   * Shows the tooltip near a pin button.
   * 
   * @param {HTMLButtonElement} pinBtn - The pin button element
   * @param {{text: string, pinInfo: string|null}|string} content - Tooltip content (object with text and pinInfo, or legacy string)
   */
  show(pinBtn, content) {
    if (!pinBtn || !content) return;
    
    // Remove pulse from previous pin if different
    if (this._currentPinBtn && this._currentPinBtn !== pinBtn) {
      this._currentPinBtn.classList.remove('is-tooltip-target');
    }
    
    // Add pulse effect to current pin
    this._currentPinBtn = pinBtn;
    pinBtn.classList.add('is-tooltip-target');
    
    const tooltip = this.element;
    
    // Handle both new object format and legacy string format
    if (typeof content === 'string') {
      tooltip.textContent = content;
    } else {
      const { text, pinInfo } = content;
      if (pinInfo) {
        tooltip.innerHTML = `<div class="matrix-tooltip__route">${this._escapeHtml(text)}</div><div class="matrix-tooltip__pin-info">${this._escapeHtml(pinInfo)}</div>`;
      } else {
        tooltip.textContent = text;
      }
    }
    
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
    
    // Remove pulse effect from pin
    if (this._currentPinBtn) {
      this._currentPinBtn.classList.remove('is-tooltip-target');
      this._currentPinBtn = null;
    }
    
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
   * @param {HTMLButtonElement} [pinBtn] - Optional pin button to check if active and get color
   * @returns {{text: string, pinInfo: string|null}|null} Tooltip data or null if no info available
   */
  _getTooltipText(row, col, maps, pinBtn = null) {
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
    
    const text = t('matrix.tooltip.format', { source: sourceLabel, dest: destLabel });
    
    // If pin is active, get pin info (resistance + gain)
    let pinInfo = null;
    if (pinBtn && pinBtn.classList.contains('active')) {
      const pinColor = this._getPinColorFromButton(pinBtn);
      if (pinColor) {
        pinInfo = getPinSublabel(pinColor);
      }
    }
    
    return { text, pinInfo };
  }
  
  /**
   * Extracts the pin color from a pin button's class list.
   * @param {HTMLButtonElement} pinBtn - The pin button element
   * @returns {string|null} Pin color (uppercase) or null
   */
  _getPinColorFromButton(pinBtn) {
    const pinColorClasses = ['pin-white', 'pin-grey', 'pin-green', 'pin-red', 'pin-blue', 'pin-yellow', 'pin-cyan', 'pin-purple'];
    for (const cls of pinColorClasses) {
      if (pinBtn.classList.contains(cls)) {
        return cls.replace('pin-', '').toUpperCase();
      }
    }
    // Default to WHITE if active but no specific class
    return 'WHITE';
  }
  
  /**
   * Escapes HTML special characters to prevent XSS.
   * @param {string} text - Raw text to escape
   * @returns {string} Escaped HTML
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    
    const content = this._getTooltipText(row, col, maps, btn);
    if (content) {
      this.show(btn, content);
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
   * Mobile: touchstart - record initial touch state.
   * We only record here; actual tooltip logic happens in touchend to filter out gestures.
   * This prevents tooltips from appearing during pinch-zoom or pan gestures.
   */
  _handleTouchStart(ev) {
    // If multi-touch (pinch/pan), invalidate any pending tap
    if (ev.touches.length > 1) {
      this._wasSingleFinger = false;
      this._touchStartTarget = null;
      return;
    }
    
    const btn = ev.target?.closest?.('button.pin-btn');
    if (!btn || btn.classList.contains('is-hidden-pin') || btn.disabled) {
      this._touchStartTarget = null;
      return;
    }
    
    // Record touch start state for validation in touchend
    this._wasSingleFinger = true;
    this._touchStartTime = Date.now();
    this._touchStartPos = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    this._touchStartTarget = btn;
  }
  
  /**
   * Mobile: touchend - validate tap and show tooltip or allow toggle.
   * Only triggers if: single finger, short duration, minimal movement.
   * This filters out pinch-zoom and pan gestures.
   * 
   * Behavior:
   * - First tap on pin: show tooltip + pulse effect (prevents toggle)
   * - Second tap on SAME pin while tooltip visible: allow toggle (hides tooltip)
   * - Tap on DIFFERENT pin: show new tooltip (prevents toggle)
   */
  _handleTouchEnd(ev) {
    const btn = this._touchStartTarget;
    
    // Must have started on a valid pin with single finger
    if (!btn || !this._wasSingleFinger) {
      this._resetTouchState();
      return;
    }
    
    // Check duration - reject long presses (those might be drags)
    const duration = Date.now() - this._touchStartTime;
    if (duration > this.tapMaxDuration) {
      this._resetTouchState();
      return;
    }
    
    // Check movement - reject if finger moved too much (pan gesture)
    if (ev.changedTouches.length > 0) {
      const endPos = { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
      const distance = Math.hypot(endPos.x - this._touchStartPos.x, endPos.y - this._touchStartPos.y);
      if (distance > this.tapMaxDistance) {
        this._resetTouchState();
        return;
      }
    }
    
    // Valid tap detected - check if tooltip is already visible on this pin
    const isTooltipVisibleOnThisPin = this._isVisible && this._currentPinBtn === btn;
    
    if (isTooltipVisibleOnThisPin) {
      // Second tap on same pin while tooltip visible: allow toggle but keep tooltip open
      // Restart the auto-hide timer to give user more time
      this._clearHideTimeout();
      this._hideTimeout = setTimeout(() => this.hide(), this.autoHideDelay);
      
      // IMPORTANT: Clear any pending click block to ensure this click goes through
      this._blockNextClick = false;
      if (this._clickBlockTimeout) {
        clearTimeout(this._clickBlockTimeout);
        this._clickBlockTimeout = null;
      }
      
      this._resetTouchState();
      // Don't preventDefault - let the click proceed to toggle the pin
      // Tooltip stays visible with pulse effect
      return;
    }
    
    // First tap or different pin: show tooltip and prevent toggle
    ev.preventDefault();
    
    // Block the synthetic click event that will follow this touchend
    this._blockNextClick = true;
    if (this._clickBlockTimeout) clearTimeout(this._clickBlockTimeout);
    this._clickBlockTimeout = setTimeout(() => {
      this._blockNextClick = false;
    }, 500); // 500ms should be more than enough for synthetic click
    
    const table = btn.closest('table');
    const maps = this._getMapsForTable(table);
    if (!maps) {
      this._resetTouchState();
      return;
    }
    
    const row = parseInt(btn.dataset.row, 10);
    const col = parseInt(btn.dataset.col, 10);
    
    const content = this._getTooltipText(row, col, maps, btn);
    if (content) {
      this.show(btn, content);
    }
    
    this._resetTouchState();
  }
  
  /**
   * Resets touch tracking state after a touch sequence completes.
   */
  _resetTouchState() {
    this._touchStartTime = 0;
    this._touchStartPos = null;
    this._touchStartTarget = null;
    this._wasSingleFinger = false;
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
  
  /**
   * Intercepts click events on matrix to block synthetic clicks after showing tooltip.
   * Must run in capture phase before largeMatrix's click handler.
   */
  _handleMatrixClick(ev) {
    if (this._blockNextClick) {
      const btn = ev.target?.closest?.('button.pin-btn');
      if (btn) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        this._blockNextClick = false;
        if (this._clickBlockTimeout) {
          clearTimeout(this._clickBlockTimeout);
          this._clickBlockTimeout = null;
        }
      }
    }
  }
  
  /**
   * Intercepts dblclick events to treat them as single clicks.
   * Prevents interference when user taps rapidly.
   */
  _handleMatrixDblClick(ev) {
    const btn = ev.target?.closest?.('button.pin-btn');
    if (btn) {
      // Prevent default dblclick behavior
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      
      // Trigger a single click instead
      btn.click();
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
