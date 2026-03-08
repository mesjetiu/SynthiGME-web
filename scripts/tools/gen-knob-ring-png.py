#!/usr/bin/env python3
"""
Genera knob-ring.png y knob-ring-bipolar.png desde los SVGs fuente.

  knob.svg          → knob-ring.png          (512×512, 2.56×)
  knob-0-center.svg → knob-ring-bipolar.png  (512×512, 2.56×)

Estos PNGs se usan como imagen raster del anillo del knob estándar,
sustituyendo la carga SVG inline de svgInlineLoader.js.

Fuente SVG preferida: design/knobs/{knob.svg, knob-0-center.svg}
Salida:               src/assets/knobs/knob-ring{,-bipolar}.png

viewBox="0 0 200 200" en ambos SVGs
Output: 512×512 px (ratio 2.56× para nitidez en retina)

Requisitos:  pip install cairosvg pillow
"""
from pathlib import Path

# ─── Rutas ───────────────────────────────────────────────────────────────
ROOT    = Path(__file__).resolve().parents[2]
DESIGN  = ROOT / 'design' / 'knobs'
SRC     = ROOT / 'src' / 'assets' / 'knobs'

OUT_SIZE = 512  # px (cuadrado)

# Mapeo: (design SVG preferido, src SVG fallback) → PNG de salida
ASSETS = [
    (DESIGN / 'knob.svg',          SRC / 'knob.svg',          SRC / 'knob-ring.png'),
    (DESIGN / 'knob-0-center.svg', SRC / 'knob-0-center.svg', SRC / 'knob-ring-bipolar.png'),
]


def render(svg_file, png_file):
    """Renderiza SVG a PNG con cairosvg."""
    import cairosvg
    cairosvg.svg2png(
        url=str(svg_file),
        write_to=str(png_file),
        output_width=OUT_SIZE,
        output_height=OUT_SIZE,
    )


# ─── Main ────────────────────────────────────────────────────────────────
print(f'Salida: {OUT_SIZE}×{OUT_SIZE} px\n')

for design_svg, src_svg, out_png in ASSETS:
    svg = design_svg if design_svg.exists() else src_svg
    if not svg.exists():
        print(f'  WARN: no se encontró {svg} — saltando')
        continue
    print(f'  {svg.name} → {out_png.name}')
    render(svg, out_png)

# Verificación
from PIL import Image
print()
for _, _, out_png in ASSETS:
    if out_png.exists():
        img = Image.open(out_png)
        cx, cy = img.size[0]//2, img.size[1]//2
        center = img.getpixel((cx, cy))
        corner = img.getpixel((0, 0))
        print(f'  {out_png.name}: {img.size} mode={img.mode} center={center} corner={corner}')

print('\nDone!')
