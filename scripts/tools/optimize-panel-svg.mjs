import fs from "node:fs/promises";

function normalizeStyle(style) {
  return style
    .split(";")
    .map(s => s.trim())
    .filter(Boolean)
    .map(pair => {
      const i = pair.indexOf(":");
      if (i === -1) return null;
      return [pair.slice(0, i).trim(), pair.slice(i + 1).trim()];
    })
    .filter(Boolean)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

async function main() {
  const input = process.argv[2];
  const output = process.argv[3] || "panel.dedupe.svg";
  if (!input) {
    console.error("Uso: node dedupe-styles.mjs input.svg [output.svg]");
    process.exit(1);
  }

  let svg = await fs.readFile(input, "utf8");

  const beforeSize = Buffer.byteLength(svg, "utf8");
  const styleCountBefore = (svg.match(/\sstyle="/g) || []).length;

  // Quita metadata/comments/namedview (no afecta render)
  svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/g, "");
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");
  svg = svg.replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/g, "");

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
        cls = `c${++classCounter}`;
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
