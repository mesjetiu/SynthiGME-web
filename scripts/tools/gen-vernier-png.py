#!/usr/bin/env python3
"""
Genera vernier-rotor.png y vernier-ring.png desde vernier-dial.svg.

El SVG tiene 3 grupos top-level (tras <style> y <defs>):
  1. g#vd-rotor   — disco negro, ticks, números, cápsula hexagonal
  2. g (sin id)   — anillo metálico (con mask), ventana del contador, indicador
  3. g (sin id)   — pestaña/freno de agarre

Rotor PNG: solo grupo 1 (se eliminan grupos 2 y 3)
Ring  PNG: solo grupos 2 y 3 (se elimina grupo 1), luego se aplica
           manualmente la máscara de transparencia central (r=96 SVG units)
           ya que cairosvg no renderiza correctamente <mask>.
"""
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageDraw

from fontconfig_local import local_fontconfig

SVG = 'vernier-dial.svg'
NS  = 'http://www.w3.org/2000/svg'

# Resolución: 2x del viewBox (280 -> 560)
OUT_SIZE = 560

# Centro del SVG en unidades SVG y en píxeles de salida
# viewBox="10 10 280 280" -> center at (150,150) -> pixel (280,280)
SVG_CX, SVG_CY = 150, 150
SVG_VB_X, SVG_VB_Y, SVG_VB_W, SVG_VB_H = 10, 10, 280, 280
SCALE = OUT_SIZE / SVG_VB_W
PX_CX = (SVG_CX - SVG_VB_X) * SCALE  # 280
PX_CY = (SVG_CY - SVG_VB_Y) * SCALE  # 280
MASK_R = 96 * SCALE                    # 192 px

ROOT = Path(__file__).resolve().parents[2]
src  = ROOT / 'src' / 'assets' / 'knobs'

# Preferir SVG original en design/ (más legible), fallback a src/
_design = ROOT / 'design' / 'knobs' / 'knob multivuelta' / 'spectrol-vernier-dial.svg'
svg_path = _design if _design.exists() else src / SVG
print(f'Fuente SVG: {svg_path}')

ET.register_namespace('', NS)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')


def top_groups(root):
    """Devuelve los <g> top-level (sin contar style/defs)."""
    gs = []
    for child in root:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if tag == 'g':
            gs.append(child)
    return gs


def make_svg(keep_indices, out_name):
    """Genera un SVG parcial manteniendo solo los grupos indicados."""
    tree = ET.parse(svg_path)
    root = tree.getroot()
    gs = top_groups(root)
    for i, g in enumerate(gs):
        if i not in keep_indices:
            root.remove(g)
    tmp = src / f'_tmp_{out_name}.svg'
    tree.write(tmp, xml_declaration=True, encoding='utf-8')
    return tmp


def render(svg_file, png_file):
    """Renderiza SVG a PNG con cairosvg."""
    with local_fontconfig():
        import cairosvg
        cairosvg.svg2png(
            url=str(svg_file),
            write_to=str(png_file),
            output_width=OUT_SIZE,
            output_height=OUT_SIZE,
        )


def apply_ring_mask(png_path):
    """Aplica la máscara de transparencia al centro del ring
    (simula SVG <mask id='vd-ringMask'>).
    
    Compone la máscara circular con el canal alfa original para
    mantener la transparencia de las esquinas (fuera del anillo r=140).
    """
    img = Image.open(png_path).convert('RGBA')
    
    # Máscara circular: negro (transparente) dentro de r=96, blanco fuera
    circle_mask = Image.new('L', img.size, 255)
    draw = ImageDraw.Draw(circle_mask)
    bbox = (
        PX_CX - MASK_R,
        PX_CY - MASK_R,
        PX_CX + MASK_R,
        PX_CY + MASK_R,
    )
    draw.ellipse(bbox, fill=0)
    
    # Combinar con el alfa original: new_alpha = min(original, mask)
    # Así las esquinas transparentes siguen transparentes y el centro
    # del anillo también se hace transparente
    original_alpha = img.split()[3]
    from PIL import ImageChops
    combined_alpha = ImageChops.multiply(original_alpha, circle_mask)
    img.putalpha(combined_alpha)
    img.save(png_path)


def remove_counter_text(svg_file):
    """Elimina el texto del contador (se renderiza como DOM)."""
    tree = ET.parse(svg_file)
    root = tree.getroot()
    # Buscar <text id="vd-counter"> en cualquier profundidad
    for elem in root.iter(f'{{{NS}}}text'):
        if elem.get('id', '').endswith('vd-counter'):
            parent = None
            for p in root.iter():
                if elem in list(p):
                    parent = p
                    break
            if parent is not None:
                parent.remove(elem)
    tree.write(svg_file, xml_declaration=True, encoding='utf-8')


# ─── Main ────────────────────────────────────────────────────────────────

print('Parsing', svg_path.name)
print(f'  ViewBox: {SVG_VB_X} {SVG_VB_Y} {SVG_VB_W} {SVG_VB_H}')
print(f'  Output: {OUT_SIZE}x{OUT_SIZE}')
print(f'  Center px: ({PX_CX}, {PX_CY}), mask radius: {MASK_R}px')

# 1. Rotor: solo grupo 0 (vd-rotor)
print('\n--- Rotor ---')
rotor_svg = make_svg([0], 'rotor')
print(f'  SVG temporal: {rotor_svg.name}')
rotor_png = src / 'vernier-rotor.png'
render(rotor_svg, rotor_png)
print(f'  Renderizado: {rotor_png.name}')
rotor_svg.unlink()

# 2. Ring: grupos 1 y 2 (anillo + pestaña)
print('\n--- Ring ---')
ring_svg = make_svg([1, 2], 'ring')
remove_counter_text(ring_svg)
print(f'  SVG temporal: {ring_svg.name}')
ring_png = src / 'vernier-ring.png'
render(ring_svg, ring_png)
print(f'  Renderizado pre-mask: {ring_png.name}')
apply_ring_mask(ring_png)
print(f'  Máscara aplicada (r={MASK_R:.0f}px)')
ring_svg.unlink()

# 3. Verificación
print('\n--- Verificación ---')
for name in ['vernier-rotor.png', 'vernier-ring.png']:
    img = Image.open(src / name)
    alpha = img.getchannel('A')
    transp = sum(alpha.histogram()[:10])
    total = img.size[0] * img.size[1]
    print(f'  {name}: {img.size} mode={img.mode} transparent={transp}/{total} ({100*transp/total:.1f}%)')

    # Sample center pixel
    cx_px, cy_px = img.size[0]//2, img.size[1]//2
    center = img.getpixel((cx_px, cy_px))
    print(f'    center({cx_px},{cy_px}) = RGBA{center}')

print('\nDone!')
