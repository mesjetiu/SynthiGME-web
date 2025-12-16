import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const panelsDir = path.join(repoRoot, 'src', 'assets', 'panels');

const jobs = [
  { in: 'panel5_bg.svg', out: 'panel5_bg@2x.png', zoom: 2 },
  { in: 'panel5_bg.svg', out: 'panel5_bg@3x.png', zoom: 3 },
  { in: 'panel6_bg.svg', out: 'panel6_bg@2x.png', zoom: 2 },
  { in: 'panel6_bg.svg', out: 'panel6_bg@3x.png', zoom: 3 }
];

function renderSvgToPng(svgPath, pngPath, zoom) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'zoom',
      value: zoom
    }
  });
  const pngData = resvg.render().asPng();
  fs.writeFileSync(pngPath, pngData);
}

for (const job of jobs) {
  const svgPath = path.join(panelsDir, job.in);
  const pngPath = path.join(panelsDir, job.out);
  if (!fs.existsSync(svgPath)) {
    throw new Error(`No existe: ${svgPath}`);
  }
  renderSvgToPng(svgPath, pngPath, job.zoom);
  const stat = fs.statSync(pngPath);
  process.stdout.write(`${job.out} (${Math.round(stat.size / 1024)} KiB)\n`);
}
