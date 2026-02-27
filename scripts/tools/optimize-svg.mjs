import fs from "node:fs/promises";
import path from "node:path";

/**
 * Mapeo de nombres de fuente: Inkscape (sistema) → Web (@font-face WOFF2).
 * Los SVG de design/ usan nombres PostScript que Inkscape reconoce.
 * Al optimizar para producción, se renombran al @font-face del CSS.
 */
const FONT_NAME_MAP = {
  'Microgramma D Extended': 'Microgramma Extended',
};

/**
 * Acorta colores hexadecimales de 6 dígitos a 3 cuando es posible.
 * #000000 → #000, #ffffff → #fff, #aabbcc → #abc
 */
function shortenColor(color) {
  const match = color.match(/^#([0-9a-fA-F]{6})$/);
  if (match) {
    const hex = match[1].toLowerCase();
    if (hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]) {
      return `#${hex[0]}${hex[2]}${hex[4]}`;
    }
  }
  return color;
}

/**
 * Redondea números con muchos decimales a máximo 2 decimales.
 * Elimina ceros finales y punto decimal innecesario.
 * 24.440888 → 24.44, 0.26499999 → 0.26, 195.00 → 195
 */
function roundNumber(numStr) {
  const num = parseFloat(numStr);
  if (isNaN(num)) return numStr;
  const rounded = Math.round(num * 100) / 100;
  return String(rounded).replace(/\.0+$/, '').replace(/(\.[1-9])0+$/, '$1');
}

/**
 * Optimiza el atributo 'd' de paths SVG.
 * Reduce precisión de coordenadas y compacta sintaxis.
 */
function optimizePathData(d) {
  return d
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/-?\d+\.\d+/g, match => roundNumber(match))
    .replace(/\s+(-)/g, '$1')
    .replace(/([MLHVCSQTAZ])\s+/gi, '$1')
    .trim();
}

/**
 * Propiedades CSS que no afectan al renderizado o son redundantes.
 */
const REMOVE_PROPERTIES = new Set([
  '-inkscape-font-specification',
  'font-feature-settings',
  'font-variant-caps',
  'font-variant-east-asian',
  'font-variant-ligatures',
  'font-variant-numeric',
  'font-variant-position',
  'inline-size',
  'white-space',
  'writing-mode',
  'text-orientation',
  'dominant-baseline',
  'baseline-shift',
]);

/**
 * Propiedades con sus valores por defecto (se eliminan si coinciden).
 */
const DEFAULT_VALUES = {
  'fill-opacity': '1',
  'stroke-opacity': '1',
  'opacity': '1',
  'stroke-miterlimit': '4',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'fill-rule': 'nonzero',
  'clip-rule': 'nonzero',
};

function normalizeStyle(style) {
  return style
    .split(";")
    .map(s => s.trim())
    .filter(Boolean)
    .map(pair => {
      const i = pair.indexOf(":");
      if (i === -1) return null;
      const key = pair.slice(0, i).trim();
      let value = pair.slice(i + 1).trim();
      
      // Eliminar propiedades innecesarias
      if (REMOVE_PROPERTIES.has(key)) return null;
      
      // Eliminar valores por defecto
      if (DEFAULT_VALUES[key] === value) return null;
      
      // Acortar colores
      if (key === 'fill' || key === 'stroke' || key === 'stop-color' || key === 'color') {
        value = shortenColor(value);
      }
      
      // Redondear valores numéricos (stroke-width, font-size, etc.)
      if (/^-?\d+\.\d+/.test(value)) {
        value = value.replace(/-?\d+\.\d+/g, m => roundNumber(m));
      }
      
      return [key, value];
    })
    .filter(Boolean)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

/**
 * Extrae prefijo único del nombre de archivo de salida.
 * panel2_bg.svg → "p2", panel5_bg.svg → "p5"
 */
function getPanelPrefix(outputPath) {
  const basename = path.basename(outputPath, '.svg');
  const match = basename.match(/panel(\d+)/i);
  if (match) return `p${match[1]}`;
  // Fallback: hash corto
  let hash = 0;
  for (const char of basename) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return `s${Math.abs(hash).toString(36).slice(0, 4)}`;
}

/**
 * Escanea el SVG para encontrar IDs referenciados por url(#id), href="#id"
 * o xlink:href="#id". Estos IDs no se pueden eliminar.
 */
function findReferencedIds(svg) {
  const ids = new Set();
  // url(#id) en atributos style, fill, clip-path, mask, filter, etc.
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) ids.add(m[1]);
  // href="#id" (SVG2) y xlink:href="#id" (SVG1)
  for (const m of svg.matchAll(/(?:xlink:)?href="#([^"]+)"/g)) ids.add(m[1]);
  return ids;
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
  const input = args[0];
  const output = args[1] || input; // por defecto sobreescribe el original
  const keepImages = flags.has('--keep-images');

  if (!input) {
    console.error("Uso: node optimize-svg.mjs input.svg [output.svg] [--keep-images]");
    console.error("  Si no se especifica output, sobreescribe el archivo de entrada.");
    console.error("  --keep-images  No eliminar imágenes embebidas");
    process.exit(1);
  }

  const prefix = getPanelPrefix(output);
  console.log("Prefijo de clases:", prefix);

  let svg = await fs.readFile(input, "utf8");

  const beforeSize = Buffer.byteLength(svg, "utf8");
  const styleCountBefore = (svg.match(/\sstyle="/g) || []).length;

  // Elimina declaración XML (no necesaria para SVG inline o standalone)
  svg = svg.replace(/<\?xml[^?]*\?>\s*/g, "");
  
  // Elimina DOCTYPE si existe
  svg = svg.replace(/<!DOCTYPE[^>]*>\s*/gi, "");

  // Quita metadata/comments (no afecta render)
  svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/g, "");
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");

  // Elimina TODOS los elementos de namespaces Inkscape/Sodipodi (self-closing y con cierre)
  svg = svg.replace(/<(?:inkscape|sodipodi):[^>]*\/>/g, "");
  svg = svg.replace(/<(?:inkscape|sodipodi):[^>]*>[\s\S]*?<\/(?:inkscape|sodipodi):[^>]*>/g, "");
  
  // Elimina atributos de namespaces Inkscape/Sodipodi (incluye r1, r2, arg1, etc.)
  svg = svg.replace(/\s(?:inkscape|sodipodi):[a-z0-9-]+="[^"]*"/gi, "");
  
  // Elimina IDs no referenciados (preserva los usados por url(), href, xlink:href)
  const referencedIds = findReferencedIds(svg);
  let removedIds = 0;
  let keptIds = 0;
  svg = svg.replace(/\sid="([^"]*)"/g, (match, id) => {
    if (referencedIds.has(id)) { keptIds++; return match; }
    removedIds++;
    return '';
  });
  
  // Elimina atributos xml:space
  svg = svg.replace(/\sxml:space="[^"]*"/g, "");
  
  // Optimiza paths: redondea coordenadas y compacta sintaxis
  svg = svg.replace(/\sd="([^"]*)"/g, (m, d) => ` d="${optimizePathData(d)}"`);
  
  // Optimiza atributos numéricos (x, y, width, height, etc.)
  svg = svg.replace(/\s(x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|dx|dy)="([^"]*)"/g,
    (m, attr, val) => ` ${attr}="${roundNumber(val)}"`);

  // Elimina imágenes embebidas (a menos que se use --keep-images)
  let imageCountBefore = 0;
  if (!keepImages) {
    imageCountBefore = (svg.match(/<image[\s\S]*?(?:\/>|<\/image>)/g) || []).length;
    svg = svg.replace(/<image[\s\S]*?(?:\/>|<\/image>)/g, "");
    if (imageCountBefore) console.log("imágenes eliminadas:", imageCountBefore);
  }

  // Elimina stroke-width de elementos text y tspan (causan texto "gordo")
  svg = svg.replace(/(<(?:text|tspan)[^>]*)\sstroke-width="[^"]*"/g, "$1");

  // Remapea nombres de fuente de Inkscape a @font-face web
  let fontRenames = 0;
  for (const [inkName, webName] of Object.entries(FONT_NAME_MAP)) {
    const re = new RegExp(inkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = svg.match(re);
    if (matches) {
      fontRenames += matches.length;
      svg = svg.replace(re, webName);
    }
  }
  if (fontRenames) console.log("fuentes renombradas:", fontRenames, "ocurrencias");

  const styleMap = new Map();
  let classCounter = 0;
  let replaced = 0;

  svg = svg.replace(
    /(<[a-zA-Z0-9:_-]+)([^>]*?)\sstyle="([^"]*)"([^>]*?>)/g,
    (m, start, mid, styleVal, end) => {
      const norm = normalizeStyle(styleVal);
      if (!norm) return `${start}${mid}${end}`;

      let cls = styleMap.get(norm);
      if (!cls) {
        cls = `${prefix}c${++classCounter}`;
        styleMap.set(norm, cls);
      }

      replaced++;

      const classMatch = mid.match(/\sclass="([^"]*)"/);
      if (classMatch) {
        const merged = `${classMatch[1].trim()} ${cls}`.trim();
        mid = mid.replace(/\sclass="[^"]*"/, ` class="${merged}"`);
        return `${start}${mid}${end}`;
      }

      return `${start}${mid} class="${cls}"${end}`;
    }
  );

  // Elimina style=""
  svg = svg.replace(/\sstyle="[^"]*"/g, "");

  if (styleMap.size) {
    const css = Array.from(styleMap.entries())
      .map(([st, cls]) => `.${cls}{${st}}`)
      .join("");
    svg = svg.replace(/<svg\b([^>]*)>/, `<svg$1><style>${css}</style>`);
  }

  // Limpia atributos redundantes en el elemento <svg>
  svg = svg.replace(/<svg\b([^>]*)>/, (match, attrs) => {
    // Elimina xmlns redundantes de Inkscape/Sodipodi y otros
    attrs = attrs.replace(/\sxmlns:(?:inkscape|sodipodi|dc|cc|rdf|xlink|svg)="[^"]*"/g, "");
    // Elimina version si es 1.1 (implícito)
    attrs = attrs.replace(/\sversion="1\.1"/g, "");
    // Elimina atributos width/height con unidades mm (se usa viewBox)
    attrs = attrs.replace(/\s(?:width|height)="\d+mm"/g, "");
    return `<svg${attrs}>`;
  });

  // Elimina grupos vacíos <g></g> o <g/>
  svg = svg.replace(/<g[^>]*><\/g>/g, "");
  svg = svg.replace(/<g[^>]*\/>/g, "");
  
  // Elimina defs vacíos
  svg = svg.replace(/<defs[^>]*><\/defs>/g, "");
  svg = svg.replace(/<defs[^>]*\/>/g, "");

  // Minificación completa de whitespace
  // 1. Colapsar múltiples espacios/saltos a un solo espacio
  svg = svg.replace(/\s+/g, " ");
  // 2. Eliminar espacio antes de cierre de tag
  svg = svg.replace(/\s*\/>/g, "/>");
  svg = svg.replace(/\s*>/g, ">");
  // 3. Eliminar espacio después de apertura de tag
  svg = svg.replace(/<\s+/g, "<");
  // 4. Eliminar espacio entre tags
  svg = svg.replace(/>\s+</g, "><");
  // 5. Limpiar espacios alrededor de = en atributos
  svg = svg.replace(/\s*=\s*/g, "=");
  svg = svg.trim();

  const afterSize = Buffer.byteLength(svg, "utf8");
  const styleCountAfter = (svg.match(/\sstyle="/g) || []).length;

  await fs.writeFile(output, svg, "utf8");

  const reduction = ((1 - afterSize / beforeSize) * 100).toFixed(1);
  console.log("OK ->", output);
  console.log(`IDs: ${removedIds} eliminados, ${keptIds} preservados (referenciados)`);
  console.log("style= antes:", styleCountBefore, "después:", styleCountAfter);
  console.log("reemplazos:", replaced, "clases únicas:", styleMap.size);
  console.log(`tamaño: ${beforeSize} → ${afterSize} bytes (−${reduction}%)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
