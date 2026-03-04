#!/usr/bin/env node
/**
 * Generates the SVG for the Synthi 100 dual keyboard (top-down view).
 * Two 5-octave keyboards (C2–C7), 61 keys each.
 *
 * Structural details matching the real instrument:
 *   - Two thick walnut side rails running full height
 *   - A black padded leather strip across the top (arm rest)
 *   - Wood cheek blocks flanking each keyboard
 *   - A visible step/ledge between upper and lower keyboards
 *   - Black metal structure visible beneath
 *   - SYNTHI label on the front
 *
 * Standard full-size piano key dimensions (mm):
 *   White key pitch:  23.5 mm (center-to-center)
 *   White key length: 150 mm  (visible top-down depth)
 *   Black key width:  13 mm
 *   Black key length: 95 mm
 *
 * Usage:  node scripts/tools/gen-keyboard-svg.mjs > design/keyboard_bg.svg
 */

// ─── Key geometry (mm) ──────────────────────────────────────────────
const CELL_W   = 23.5;   // white key pitch (includes gap)
const KEY_W    = 22.5;   // drawn white key width (1 mm gap)
const BLACK_W  = 13;     // black key width
const WHITE_L  = 150;    // white key visible length
const BLACK_L  = 95;     // black key visible length
const KEY_RX   = 1.5;    // white key corner radius
const BLACK_RX = 1;      // black key corner radius

// ─── Housing structure (mm) ─────────────────────────────────────────
const RAIL_W        = 40;    // side rail width (thick walnut uprights)
const LEATHER_H     = 50;    // black padded strip at top
const CHEEK_W       = 18;    // wood cheek blocks beside each keyboard
const KEY_BED_GAP   = 3;     // inset of key bed from cheek
const STEP_H        = 14;    // height of step/ledge between keyboards
const STEP_SHADOW   = 6;     // shadow depth for the step
const FRONT_PANEL_H = 45;    // front wood panel below lower keyboard
const LABEL_PLATE_H = 28;    // metal label plate inset in front panel

// ─── Derived sizes ─────────────────────────────────────────────────
const NUM_OCTAVES  = 5;
const NUM_WHITE    = NUM_OCTAVES * 7 + 1;          // 36 (C2-C7)
const KB_KEYS_W    = NUM_WHITE * CELL_W;            // 846
const START_OCTAVE = 2;                             // C2

// Inner area (between the two side rails)
const INNER_X = RAIL_W;
const INNER_W = CHEEK_W * 2 + KEY_BED_GAP * 2 + KB_KEYS_W;

// Keyboard positions (X)
const KB_X = RAIL_W + CHEEK_W + KEY_BED_GAP;

// Keyboard positions (Y)
const KB_Y_UPPER = LEATHER_H + KEY_BED_GAP;
const KB_Y_LOWER = KB_Y_UPPER + WHITE_L + KEY_BED_GAP + STEP_H + KEY_BED_GAP;

// Total canvas
const TOTAL_W = RAIL_W * 2 + INNER_W;
const TOTAL_H = LEATHER_H + (KEY_BED_GAP + WHITE_L + KEY_BED_GAP) * 2
              + STEP_H + FRONT_PANEL_H;

// ─── Colours ────────────────────────────────────────────────────────
const WOOD_DARK       = '#5A3720';
const WOOD_MID        = '#6B4226';
const WOOD_LIGHT      = '#7D5233';
const WOOD_STROKE     = '#3E2313';
const WOOD_GRAIN_CLR  = '#4A2E1A';
const LEATHER_FILL    = '#1A1A1A';
const LEATHER_STITCH  = '#2D2D2D';
const KEY_BED_FILL    = '#111111';
const WHITE_KEY_FILL  = '#F2EDE4';
const WHITE_KEY_STROKE= '#B5ADA3';
const BLACK_KEY_FILL  = '#1C1C1C';
const BLACK_KEY_STROKE= '#0A0A0A';
const STEP_TOP_CLR    = '#5A3720';
const STEP_FACE_CLR   = '#3E2313';
const METAL_FRAME     = '#2A2A2A';
const LABEL_BG        = '#1E3A5F';
const LABEL_TEXT      = '#C0D8F0';

// ─── Note data ──────────────────────────────────────────────────────
const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_NOTES = [
  { name: 'Cs', offset: 1 },
  { name: 'Ds', offset: 2 },
  { name: 'Fs', offset: 4 },
  { name: 'Gs', offset: 5 },
  { name: 'As', offset: 6 },
];

// ─── Key generators ─────────────────────────────────────────────────

function whiteKeys(prefix, x0, y0) {
  const lines = [];
  for (let oct = 0; oct < NUM_OCTAVES; oct++) {
    const octNum = oct + START_OCTAVE;
    for (let n = 0; n < 7; n++) {
      const idx = oct * 7 + n;
      const x   = +(x0 + idx * CELL_W).toFixed(1);
      const id  = `${prefix}-${WHITE_NOTES[n]}${octNum}`;
      lines.push(
        `      <rect id="${id}" class="white-key" x="${x}" y="${y0}" ` +
        `width="${KEY_W}" height="${WHITE_L}" rx="${KEY_RX}" ` +
        `fill="${WHITE_KEY_FILL}" stroke="${WHITE_KEY_STROKE}" stroke-width="0.5"/>`
      );
    }
  }
  const lastIdx = NUM_OCTAVES * 7;
  const lastX   = +(x0 + lastIdx * CELL_W).toFixed(1);
  const lastId  = `${prefix}-C${START_OCTAVE + NUM_OCTAVES}`;
  lines.push(
    `      <rect id="${lastId}" class="white-key" x="${lastX}" y="${y0}" ` +
    `width="${KEY_W}" height="${WHITE_L}" rx="${KEY_RX}" ` +
    `fill="${WHITE_KEY_FILL}" stroke="${WHITE_KEY_STROKE}" stroke-width="0.5"/>`
  );
  return lines.join('\n');
}

function blackKeys(prefix, x0, y0) {
  const lines = [];
  for (let oct = 0; oct < NUM_OCTAVES; oct++) {
    const octNum = oct + START_OCTAVE;
    for (const { name, offset } of BLACK_NOTES) {
      const absIdx = oct * 7 + offset;
      const x  = +(x0 + absIdx * CELL_W - BLACK_W / 2).toFixed(1);
      const id = `${prefix}-${name}${octNum}`;
      lines.push(
        `      <rect id="${id}" class="black-key" x="${x}" y="${y0}" ` +
        `width="${BLACK_W}" height="${BLACK_L}" rx="${BLACK_RX}" ` +
        `fill="${BLACK_KEY_FILL}" stroke="${BLACK_KEY_STROKE}" stroke-width="0.3"/>`
      );
    }
  }
  return lines.join('\n');
}

function keyboard(id, prefix, y) {
  const bedX = KB_X - 1;
  const bedY = y - 1;
  const bedW = KB_KEYS_W + 2;
  const bedH = WHITE_L + 2;
  return `    <g id="${id}">
      <!-- Key bed (recessed black area) -->
      <rect x="${bedX}" y="${bedY}" width="${bedW}" height="${bedH}"
            fill="${KEY_BED_FILL}" rx="1"/>
      <!-- White keys -->
${whiteKeys(prefix, KB_X, y)}
      <!-- Black keys -->
${blackKeys(prefix, KB_X, y)}
    </g>`;
}

// ─── Wood grain lines ───────────────────────────────────────────────
// Deterministic (seeded by position) for reproducible output
function woodGrainLines(x, y, w, h) {
  const lines = [];
  let dy = 7;
  let seed = Math.abs(x * 13 + y * 7) % 100;
  while (dy < h) {
    const y1 = +(y + dy).toFixed(1);
    const wobble = +((seed % 3) * 0.5 - 0.5).toFixed(1);
    lines.push(
      `      <line x1="${x}" y1="${y1}" x2="${+(x + w).toFixed(1)}" y2="${+(y1 + wobble).toFixed(1)}" ` +
      `stroke="${WOOD_GRAIN_CLR}" stroke-width="0.4" opacity="0.12"/>`
    );
    seed = (seed * 31 + 17) % 100;
    dy += 6 + (seed % 5);
  }
  return lines.join('\n');
}

// ─── Cheek blocks + step ────────────────────────────────────────────

function cheeksAndStep() {
  const leftX  = RAIL_W;
  const rightX = RAIL_W + INNER_W - CHEEK_W;
  const upperY = LEATHER_H;
  const cheekH = KEY_BED_GAP + WHITE_L + KEY_BED_GAP;
  const stepY  = upperY + cheekH;
  const lowerY = stepY + STEP_H;

  return `
  <!-- Cheek blocks and step -->
  <g id="cheeks-and-step">

    <!-- Left cheek - upper keyboard -->
    <rect x="${leftX}" y="${upperY}" width="${CHEEK_W}" height="${cheekH}"
          fill="${WOOD_MID}" stroke="${WOOD_STROKE}" stroke-width="0.5"/>
${woodGrainLines(leftX, upperY, CHEEK_W, cheekH)}

    <!-- Right cheek - upper keyboard -->
    <rect x="${rightX}" y="${upperY}" width="${CHEEK_W}" height="${cheekH}"
          fill="${WOOD_MID}" stroke="${WOOD_STROKE}" stroke-width="0.5"/>
${woodGrainLines(rightX, upperY, CHEEK_W, cheekH)}

    <!-- Step/ledge between keyboards (full width between rails) -->
    <rect id="step-top" x="${INNER_X}" y="${stepY}" width="${INNER_W}" height="${STEP_H}"
          fill="${STEP_TOP_CLR}" stroke="${WOOD_STROKE}" stroke-width="0.5"/>
    <rect id="step-shadow" x="${INNER_X}" y="${+(stepY + STEP_H - STEP_SHADOW).toFixed(1)}"
          width="${INNER_W}" height="${STEP_SHADOW}"
          fill="${STEP_FACE_CLR}" opacity="0.5"/>
${woodGrainLines(INNER_X, stepY, INNER_W, STEP_H)}

    <!-- Left cheek - lower keyboard -->
    <rect x="${leftX}" y="${lowerY}" width="${CHEEK_W}" height="${cheekH}"
          fill="${WOOD_MID}" stroke="${WOOD_STROKE}" stroke-width="0.5"/>
${woodGrainLines(leftX, lowerY, CHEEK_W, cheekH)}

    <!-- Right cheek - lower keyboard -->
    <rect x="${rightX}" y="${lowerY}" width="${CHEEK_W}" height="${cheekH}"
          fill="${WOOD_MID}" stroke="${WOOD_STROKE}" stroke-width="0.5"/>
${woodGrainLines(rightX, lowerY, CHEEK_W, cheekH)}

  </g>`;
}

// ─── Assemble SVG ───────────────────────────────────────────────────

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Synthi 100 - Dual Keyboard (top-down view)
  Two 5-octave keyboards (C2-C7), 61 keys each.
  Generated by: scripts/tools/gen-keyboard-svg.mjs

  Structure (top to bottom):
    - Black leather padded strip (arm rest)
    - Upper keyboard with walnut cheek blocks on each side
    - Walnut step/ledge (visible drop-off)
    - Lower keyboard with walnut cheek blocks on each side
    - Walnut front panel with SYNTHI label
  Thick walnut side rails run the full height on both sides.

  Key naming convention:
    White keys:  {keyboard}-{Note}{Octave}     e.g. upper-C4, lower-A5
    Black keys:  {keyboard}-{Note}s{Octave}    e.g. upper-Cs4  (C#4)

  Dimensions in mm. viewBox units = mm.
  Total: ${TOTAL_W} x ${TOTAL_H} mm
-->
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${TOTAL_W} ${TOTAL_H}"
     width="${TOTAL_W}mm" height="${TOTAL_H}mm">

  <title>Synthi 100 - Dual Keyboard</title>
  <desc>Two 5-octave keyboards (C2-C7) for the EMS Synthi 100, top-down view with detailed housing.</desc>

  <defs>
    <style>
      .white-key { cursor: pointer; }
      .white-key:hover { fill: #E8E3DA; }
      .black-key { cursor: pointer; }
      .black-key:hover { fill: #2A2A2A; }
    </style>
    <!-- Subtle leather texture -->
    <pattern id="leather-texture" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="${LEATHER_FILL}"/>
      <circle cx="3" cy="3" r="0.6" fill="${LEATHER_STITCH}" opacity="0.3"/>
    </pattern>
    <!-- Wood grain pattern for side rails (vertical grain) -->
    <pattern id="wood-pattern" width="4" height="40" patternUnits="userSpaceOnUse"
             patternTransform="rotate(90)">
      <rect width="4" height="40" fill="${WOOD_DARK}"/>
      <line x1="0" y1="8" x2="4" y2="8.5" stroke="${WOOD_GRAIN_CLR}" stroke-width="0.6" opacity="0.15"/>
      <line x1="0" y1="22" x2="4" y2="21.5" stroke="${WOOD_GRAIN_CLR}" stroke-width="0.4" opacity="0.1"/>
      <line x1="0" y1="34" x2="4" y2="34.8" stroke="${WOOD_GRAIN_CLR}" stroke-width="0.5" opacity="0.12"/>
    </pattern>
  </defs>

  <!-- Background / metal frame (visible in gaps) -->
  <rect id="metal-frame" x="0" y="0" width="${TOTAL_W}" height="${TOTAL_H}"
        fill="${METAL_FRAME}" rx="3"/>

  <!-- Left side rail (thick walnut upright) -->
  <g id="rail-left">
    <rect x="0" y="0" width="${RAIL_W}" height="${TOTAL_H}"
          fill="url(#wood-pattern)" stroke="${WOOD_STROKE}" stroke-width="1"/>
    <!-- Inner bevel highlight -->
    <rect x="${RAIL_W - 3}" y="0" width="3" height="${TOTAL_H}"
          fill="${WOOD_LIGHT}" opacity="0.25"/>
  </g>

  <!-- Right side rail -->
  <g id="rail-right">
    <rect x="${TOTAL_W - RAIL_W}" y="0" width="${RAIL_W}" height="${TOTAL_H}"
          fill="url(#wood-pattern)" stroke="${WOOD_STROKE}" stroke-width="1"/>
    <!-- Inner bevel highlight -->
    <rect x="${TOTAL_W - RAIL_W}" y="0" width="3" height="${TOTAL_H}"
          fill="${WOOD_LIGHT}" opacity="0.25"/>
  </g>

  <!-- Black leather strip (top arm rest) -->
  <g id="leather-strip">
    <rect x="${RAIL_W}" y="0" width="${INNER_W}" height="${LEATHER_H}"
          fill="url(#leather-texture)"/>
    <!-- Padded edge at bottom -->
    <rect x="${RAIL_W}" y="${LEATHER_H - 2}" width="${INNER_W}" height="2"
          fill="#000" opacity="0.4"/>
    <!-- Stitching line -->
    <line x1="${RAIL_W + 10}" y1="${LEATHER_H / 2}"
          x2="${RAIL_W + INNER_W - 10}" y2="${LEATHER_H / 2}"
          stroke="${LEATHER_STITCH}" stroke-width="0.4"
          stroke-dasharray="3,3" opacity="0.25"/>
  </g>
${cheeksAndStep()}
  <!-- Upper keyboard -->
${keyboard('keyboard-upper', 'upper', KB_Y_UPPER)}

  <!-- Lower keyboard -->
${keyboard('keyboard-lower', 'lower', KB_Y_LOWER)}

  <!-- Front panel (walnut, below lower keyboard) -->
  <g id="front-panel">
    <rect x="${RAIL_W}" y="${TOTAL_H - FRONT_PANEL_H}" width="${INNER_W}" height="${FRONT_PANEL_H}"
          fill="${WOOD_MID}" stroke="${WOOD_STROKE}" stroke-width="0.5"/>
${woodGrainLines(RAIL_W, TOTAL_H - FRONT_PANEL_H, INNER_W, FRONT_PANEL_H)}
    <!-- SYNTHI label plate -->
    <rect id="label-plate"
          x="${+(TOTAL_W / 2 - 55).toFixed(1)}" y="${+(TOTAL_H - FRONT_PANEL_H / 2 - LABEL_PLATE_H / 2).toFixed(1)}"
          width="110" height="${LABEL_PLATE_H}"
          rx="2" fill="${LABEL_BG}" stroke="#0F2840" stroke-width="0.5"/>
    <text id="label-synthi"
          x="${+(TOTAL_W / 2).toFixed(1)}" y="${+(TOTAL_H - FRONT_PANEL_H / 2 + 2).toFixed(1)}"
          text-anchor="middle"
          font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-size="11" font-weight="bold" letter-spacing="4"
          fill="${LABEL_TEXT}">SYNTHI</text>
    <text id="label-ems"
          x="${+(TOTAL_W / 2).toFixed(1)}" y="${+(TOTAL_H - FRONT_PANEL_H / 2 + 10).toFixed(1)}"
          text-anchor="middle"
          font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-size="4" letter-spacing="1.5"
          fill="${LABEL_TEXT}" opacity="0.7">EMS (LONDON) LTD</text>
  </g>

</svg>
`;

process.stdout.write(svg);
