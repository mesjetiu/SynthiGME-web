import fs from "node:fs/promises";
import path from "node:path";

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

async function main() {
  const input = process.argv[2];
  const output = process.argv[3] || "panel.dedupe.svg";
  if (!input) {
    console.error("Uso: node optimize-panel-svg.mjs input.svg [output.svg]");
    process.exit(1);
  }

  const prefix = getPanelPrefix(output);
  console.log("Prefijo de clases:", prefix);

  let svg = await fs.readFile(input, "utf8");

  const beforeSize = Buffer.byteLength(svg, "utf8");
  const styleCountBefore = (svg.match(/\sstyle="/g) || []).length;

  // Quita metadata/comments/namedview (no afecta render)
  svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/g, "");
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");
  svg = svg.replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/g, "");

  // Elimina elementos de Inkscape/Sodipodi innecesarios
  svg = svg.replace(/<inkscape:[^>]*\/>/g, "");
  svg = svg.replace(/<inkscape:[^>]*>[\s\S]*?<\/inkscape:[^>]*>/g, "");
  
  // Elimina atributos de namespaces Inkscape/Sodipodi
  svg = svg.replace(/\s(?:inkscape|sodipodi):[a-z-]+="[^"]*"/gi, "");
  
  // Elimina atributos id vacíos o autogenerados de Inkscape (path1234, rect5678, etc.)
  svg = svg.replace(/\sid="(?:path|rect|circle|ellipse|line|polyline|polygon|g|use|defs|clipPath|mask)\d+"/g, "");
  
  // Elimina atributos xml:space
  svg = svg.replace(/\sxml:space="[^"]*"/g, "");

  // Elimina imágenes embebidas (pueden causar renderizado pesado/duplicado)
  const imageCountBefore = (svg.match(/<image[\s\S]*?(?:\/>|<\/image>)/g) || []).length;
  svg = svg.replace(/<image[\s\S]*?(?:\/>|<\/image>)/g, "");
  if (imageCountBefore) console.log("imágenes eliminadas:", imageCountBefore);

  // Elimina stroke-width de elementos text y tspan (causan texto "gordo")
  svg = svg.replace(/(<(?:text|tspan)[^>]*)\sstroke-width="[^"]*"/g, "$1");

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
    // Elimina xmlns redundantes de Inkscape/Sodipodi
    attrs = attrs.replace(/\sxmlns:(?:inkscape|sodipodi|dc|cc|rdf)="[^"]*"/g, "");
    // Elimina version si es 1.1 (implícito)
    attrs = attrs.replace(/\sversion="1\.1"/g, "");
    return `<svg${attrs}>`;
  });

  // Elimina grupos vacíos <g></g> o <g/>
  svg = svg.replace(/<g[^>]*><\/g>/g, "");
  svg = svg.replace(/<g[^>]*\/>/g, "");
  
  // Elimina defs vacíos
  svg = svg.replace(/<defs[^>]*><\/defs>/g, "");
  svg = svg.replace(/<defs[^>]*\/>/g, "");

  // Minifica whitespace entre tags
  svg = svg.replace(/>\s+</g, "><").trim();

  const afterSize = Buffer.byteLength(svg, "utf8");
  const styleCountAfter = (svg.match(/\sstyle="/g) || []).length;

  await fs.writeFile(output, svg, "utf8");

  console.log("OK ->", output);
  console.log("style= antes:", styleCountBefore, "después:", styleCountAfter);
  console.log("reemplazos:", replaced, "clases únicas:", styleMap.size);
  console.log("tamaño antes:", beforeSize, "después:", afterSize, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
