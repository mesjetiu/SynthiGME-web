#!/usr/bin/env python3
"""
Genera toggle-a.png y toggle-b.png desde toggle-switch.svg.

El SVG tiene un grupo #toggle-lever cuya posición por defecto es
hacia arriba (estado HI = toggle-a).  Para el estado LO (toggle-b)
se aplica scale(1,-1) con transform-origin en (100,100).

Fuente SVG preferida: design/knobs/toggle-switch.svg
Salida:               src/assets/knobs/toggle-{a,b}.png

viewBox="48 7 104 186"  →  104×186 SVG units
Output: 2× = 208×372 px

Requisitos:  pip install cairosvg pillow
"""
import xml.etree.ElementTree as ET
from pathlib import Path
import sys

from fontconfig_local import local_fontconfig

NS  = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')

# ─── Rutas ───────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[2]
DESIGN_SVG = ROOT / 'design' / 'knobs' / 'toggle-switch.svg'
SRC_SVG    = ROOT / 'src' / 'assets' / 'knobs' / 'toggle-switch.svg'
OUT_DIR    = ROOT / 'src' / 'assets' / 'knobs'

# Preferir design/ como fuente; fallback a src/
SVG_PATH = DESIGN_SVG if DESIGN_SVG.exists() else SRC_SVG

# viewBox: "48 7 104 186" → ancho 104, alto 186
VB_W, VB_H = 104, 186
SCALE = 2  # resolución 2×
OUT_W = VB_W * SCALE   # 208
OUT_H = VB_H * SCALE   # 372


def render(svg_file, png_file):
    """Renderiza SVG a PNG con cairosvg."""
    with local_fontconfig():
        import cairosvg
        cairosvg.svg2png(
            url=str(svg_file),
            write_to=str(png_file),
            output_width=OUT_W,
            output_height=OUT_H,
        )


def generate_state_a():
    """Estado A: palanca arriba (por defecto en el SVG)."""
    out = OUT_DIR / 'toggle-a.png'
    print(f'  Renderizando estado A (lever up) → {out.name}')
    render(SVG_PATH, out)
    return out


def generate_state_b():
    """Estado B: palanca abajo (scale(1,-1) en el grupo lever)."""
    tree = ET.parse(SVG_PATH)
    root = tree.getroot()

    # Buscar <g id="toggle-lever">
    lever = None
    for elem in root.iter(f'{{{NS}}}g'):
        eid = elem.get('id', '')
        if eid == 'toggle-lever' or eid.endswith('toggle-lever'):
            lever = elem
            break

    if lever is None:
        print('  ERROR: No se encontró #toggle-lever en el SVG')
        sys.exit(1)

    # Aplicar scale(1,-1) con origen en (100,100) — centro del agujero
    # transform-origin no es atributo SVG estándar, así que usamos
    # la técnica de translate → scale → translate inverso
    existing = lever.get('transform', '')
    flip = 'translate(0,200) scale(1,-1)'
    lever.set('transform', f'{flip} {existing}'.strip())

    tmp = OUT_DIR / '_tmp_toggle_b.svg'
    tree.write(tmp, xml_declaration=True, encoding='utf-8')

    out = OUT_DIR / 'toggle-b.png'
    print(f'  Renderizando estado B (lever down) → {out.name}')
    render(tmp, out)
    tmp.unlink()
    return out


# ─── Main ────────────────────────────────────────────────────────────────

print(f'SVG fuente: {SVG_PATH}')
print(f'Salida: {OUT_W}×{OUT_H} px ({SCALE}×)\n')

a = generate_state_a()
b = generate_state_b()

# Verificación
from PIL import Image
for name, path in [('toggle-a', a), ('toggle-b', b)]:
    img = Image.open(path)
    print(f'  {name}.png: {img.size} mode={img.mode}')

print('\nDone!')
