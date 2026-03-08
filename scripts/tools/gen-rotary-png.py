#!/usr/bin/env python3
"""
Genera rotary-a.png y rotary-b.png desde rotary-switch.svg.

El SVG tiene un grupo #rotary-switch-knob cuya posición por defecto
tiene el indicador apuntando hacia arriba (0°).
  - Estado A: rotado a -45° (apunta izquierda)
  - Estado B: rotado a +45° (apunta derecha)

Fuente SVG: src/assets/knobs/rotary-switch.svg  (no hay copia en design/)
Salida:     src/assets/knobs/rotary-{a,b}.png

viewBox="0 0 200 200"  →  200×200 SVG units
Output: 1× = 200×200 px  (knob es pequeño, no necesita más resolución)

Requisitos:  pip install cairosvg pillow
"""
import xml.etree.ElementTree as ET
from pathlib import Path
import sys

NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')

# ─── Rutas ───────────────────────────────────────────────────────────────
ROOT    = Path(__file__).resolve().parents[2]
SRC_SVG = ROOT / 'src' / 'assets' / 'knobs' / 'rotary-switch.svg'
OUT_DIR = ROOT / 'src' / 'assets' / 'knobs'

SVG_PATH = SRC_SVG

# viewBox: "0 0 200 200"
VB_W, VB_H = 200, 200
SCALE = 1   # ya es 200×200, suficiente para el tamaño de uso (~38px)
OUT_W = VB_W * SCALE
OUT_H = VB_H * SCALE

# Centro de rotación del knob
CX, CY = 100, 100

# Ángulos de estado
ANGLE_A = -45   # apunta izquierda
ANGLE_B =  45   # apunta derecha


def render(svg_file, png_file):
    """Renderiza SVG a PNG con cairosvg."""
    import cairosvg
    cairosvg.svg2png(
        url=str(svg_file),
        write_to=str(png_file),
        output_width=OUT_W,
        output_height=OUT_H,
    )


def generate_state(angle, suffix):
    """Genera un PNG con el knob rotado al ángulo dado."""
    tree = ET.parse(SVG_PATH)
    root = tree.getroot()

    # Buscar <g id="rotary-switch-knob">
    knob_g = None
    for elem in root.iter(f'{{{NS}}}g'):
        eid = elem.get('id', '')
        if eid == 'rotary-switch-knob' or eid.endswith('rotary-switch-knob'):
            knob_g = elem
            break

    if knob_g is None:
        print(f'  ERROR: No se encontró #rotary-switch-knob en el SVG')
        sys.exit(1)

    # Aplicar rotación al grupo del knob
    existing = knob_g.get('transform', '')
    rotation = f'rotate({angle},{CX},{CY})'
    knob_g.set('transform', f'{rotation} {existing}'.strip())

    tmp = OUT_DIR / f'_tmp_rotary_{suffix}.svg'
    tree.write(tmp, xml_declaration=True, encoding='utf-8')

    out = OUT_DIR / f'rotary-{suffix}.png'
    print(f'  Renderizando estado {suffix.upper()} ({angle}°) → {out.name}')
    render(tmp, out)
    tmp.unlink()
    return out


# ─── Main ────────────────────────────────────────────────────────────────

print(f'SVG fuente: {SVG_PATH}')
print(f'Salida: {OUT_W}×{OUT_H} px ({SCALE}×)\n')

a = generate_state(ANGLE_A, 'a')
b = generate_state(ANGLE_B, 'b')

# Verificación
from PIL import Image
for name, path in [('rotary-a', a), ('rotary-b', b)]:
    img = Image.open(path)
    print(f'  {name}.png: {img.size} mode={img.mode}')

print('\nDone!')
