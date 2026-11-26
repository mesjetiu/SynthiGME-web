#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# Panel 7 vectorial: genera panel7_source.svg calcando la foto (panel_7.jpg)
# ═══════════════════════════════════════════════════════════════════════════
#
# Todas las medidas están en px del panel (760×760, el mismo encuadre que la
# foto y que los mandos de la web) y salen de medir la foto; el cómo, en
# module_research/panel7/fondo_vectorial.md.
#
#   python3 design/panels/Panel7/generar_panel7.py     (necesita fontTools)
#   npm run optimize:svg -- design/panels/Panel7/panel7_source.svg src/assets/panels/panel7_bg.svg
#
# El SVG que sale es el fuente: se puede abrir y retocar en Inkscape (capas,
# un canal dibujado y siete clones). Si se retoca a mano, este script deja de
# ser la referencia y no hay que volver a ejecutarlo encima.
#
# Tipos de letra (vistos en la foto):
#   - Microgramma D Extended (Bold y Medium): casi todo, como en el panel 3.
#     Va como <text>: la web carga esas fuentes (src/assets/fonts/).
#   - Rótulos grabados del secuenciador (RECORD WHEN DOWN, MASTER RESET…):
#     una palo seco redonda, estrecha y gruesa. Lo más parecido que hay en
#     design/fonts/ es Univers 55 estrechada (×0,87) y engordada con un trazo.
#     La web no tiene esa fuente, así que van como trazos (<path>), con el
#     texto en la etiqueta de Inkscape.

import math
import os
from xml.sax.saxutils import escape

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTES = os.path.join(AQUI, '..', '..', 'fonts')
SALIDA = os.path.join(AQUI, 'panel7_source.svg')

TINTA = '#000000'        # marcos, barras, flechas (como el panel 3)
TEXTO = '#28170b'        # rótulos (el mismo marrón casi negro del panel 3)
FAMILIA = 'Microgramma D Extended'   # optimize-svg la renombra a la de la web


def f(v):
    """Número corto para el SVG."""
    s = f'{v:.3f}'.rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


# ─── Fuentes ──────────────────────────────────────────────────────────────

class Fuente:
    def __init__(self, fichero):
        self.t = TTFont(os.path.join(FUENTES, fichero))
        self.gs = self.t.getGlyphSet()
        self.cmap = self.t.getBestCmap()
        self.upm = self.t['head'].unitsPerEm
        self.cap = self.caja('H')[3] / self.upm
        self.xalt = self.caja('x')[3] / self.upm

    def glifo(self, c):
        return self.gs[self.cmap[ord(c)]]

    def caja(self, c):
        bp = BoundsPen(self.gs)
        self.glifo(c).draw(bp)
        return bp.bounds or (0, 0, self.glifo(c).width, 0)

    def tinta(self, s, tam, ls=0.0):
        """(izquierda, derecha) de la tinta de s, con origen en 0, en px."""
        x = 0.0
        izq = der = None
        for i, c in enumerate(s):
            g = self.glifo(c)
            b = self.caja(c)
            if c != ' ':
                a = x + b[0] * tam / self.upm
                z = x + b[2] * tam / self.upm
                izq = a if izq is None else min(izq, a)
                der = z if der is None else max(der, z)
            x += g.width * tam / self.upm + ls
        return izq, der


MG_BOLD = Fuente('microgramma/Microgramma D Extended Bold.otf')
MG_MEDIUM = Fuente('microgramma/Microgramma D Extended Medium.otf')
UNIVERS = Fuente('Univers 55 Roman/Univers 55 Roman.otf')


def texto(s, base, alto, peso='bold', cx=None, x0=None, x1=None, ancho=None,
          relleno=TEXTO, minus=False, etiqueta=None, grueso=0.0):
    """Rótulo en Microgramma como <text>.

    alto: altura de mayúscula (o de la x si minus=True) medida en la foto.
    Se coloca por la tinta: cx (centro), x0 (borde izquierdo) o x1
    (derecho); si se da ancho (o x0 y x1), el espaciado entre letras se
    ajusta para que la tinta mida eso.
    """
    fu = MG_BOLD if peso == 'bold' else MG_MEDIUM
    tam = alto / (fu.xalt if minus else fu.cap)
    if x0 is not None and x1 is not None:
        ancho = x1 - x0
    ls = 0.0
    if ancho is not None and len(s) > 1:
        a, b = fu.tinta(s, tam)
        ls = (ancho - (b - a)) / (len(s) - 1)
    a, b = fu.tinta(s, tam, ls)
    w = b - a
    if cx is not None:
        izq = cx - w / 2
    elif x0 is not None:
        izq = x0
    else:
        izq = x1 - w
    x = izq - a
    estilo = (f"font-family:'{FAMILIA}';font-weight:{'bold' if peso == 'bold' else 500};"
              f"font-size:{f(tam)}px;letter-spacing:{f(ls)}px;font-kerning:none;"
              f"fill:{relleno}")
    if grueso:
        # La serigrafía de la foto es más gruesa que la Microgramma: se engorda
        # con un trazo del mismo color (la tinta crece grueso/2 por cada lado).
        estilo += f";stroke:{relleno};stroke-width:{f(grueso)};stroke-linejoin:round"
    lab = f' inkscape:label="{escape(etiqueta)}"' if etiqueta else ''
    return f'<text x="{f(x)}" y="{f(base)}" style="{estilo}"{lab}>{escape(s)}</text>'


ESTRECHO = 0.87      # Univers 55 → anchura de los rótulos grabados
GRUESO = 0.42        # trazo que la engorda (px)


def grabado(s, cx, base, alto=4.25, estrecho=ESTRECHO, grueso=GRUESO):
    """Rótulo grabado del secuenciador: Univers a trazos, centrado en cx."""
    fu = UNIVERS
    tam = alto / fu.cap
    a, b = fu.tinta(s, tam)
    izq = cx - (b - a) * estrecho / 2 - a * estrecho
    pen = SVGPathPen(fu.gs)
    x = 0.0
    for c in s:
        g = fu.glifo(c)
        if c != ' ':
            k = tam / fu.upm
            tp = TransformPen(pen, (k * estrecho, 0, 0, -k, izq + x * estrecho, base))
            g.draw(tp)
        x += g.width * tam / fu.upm
    d = pen.getCommands()
    return (f'<path inkscape:label="{escape(s)}" d="{d}" '
            f'style="fill:{TEXTO};stroke:{TEXTO};stroke-width:{f(grueso)};stroke-linejoin:round"/>')


# ─── Piezas de dibujo ─────────────────────────────────────────────────────

def rect(x0, y0, x1, y1, relleno=TINTA, extra=''):
    return (f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" '
            f'style="fill:{relleno}"{extra}/>')


def linea(x0, y0, x1, y1, grosor, color=TINTA, extremo='butt'):
    return (f'<path d="M {f(x0)},{f(y0)} L {f(x1)},{f(y1)}" '
            f'style="fill:none;stroke:{color};stroke-width:{f(grosor)};stroke-linecap:{extremo}"/>')


def triangulo(cx, arriba, punta, ancho):
    """▼ que señala el cero de un mando."""
    return (f'<path d="M {f(cx - ancho / 2)},{f(arriba)} L {f(cx + ancho / 2)},{f(arriba)} '
            f'L {f(cx)},{f(punta)} Z" style="fill:{TINTA}"/>')


def punta(x, y, ang, largo=3.6, ancho=3.0):
    """Punta de flecha rellena con el vértice en (x, y), apuntando a ang (rad)."""
    ux, uy = math.cos(ang), math.sin(ang)
    bx, by = x - ux * largo, y - uy * largo
    px, py = -uy * ancho / 2, ux * ancho / 2
    return (f'<path d="M {f(x)},{f(y)} L {f(bx + px)},{f(by + py)} '
            f'L {f(bx + ux * largo * 0.25)},{f(by + uy * largo * 0.25)} '
            f'L {f(bx - px)},{f(by - py)} Z" style="fill:{TINTA}"/>')


def flecha_recta(x0, y0, x1, y1, doble=False, grosor=0.75):
    ang = math.atan2(y1 - y0, x1 - x0)
    largo = 3.6
    ux, uy = math.cos(ang), math.sin(ang)
    a = (x0 + ux * largo * 0.6, y0 + uy * largo * 0.6) if doble else (x0, y0)
    b = (x1 - ux * largo * 0.6, y1 - uy * largo * 0.6)
    s = linea(a[0], a[1], b[0], b[1], grosor)
    s += punta(x1, y1, ang)
    if doble:
        s += punta(x0, y0, ang + math.pi)
    return s


def flecha_curva(x0, y0, x1, y1, comba, grosor=0.6):
    """Flecha curva junto a un mando (low/high, left/right), punta en (x1, y1).

    comba: desplazamiento del punto de control hacia fuera del mando (px,
    con signo según el lado)."""
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    n = math.hypot(dx, dy)
    cxp, cyp = mx + (-dy / n) * comba, my + (dx / n) * comba
    largo = 3.8
    ang = math.atan2(y1 - cyp, x1 - cxp)
    ex, ey = x1 - math.cos(ang) * largo * 0.6, y1 - math.sin(ang) * largo * 0.6
    s = (f'<path d="M {f(x0)},{f(y0)} Q {f(cxp)},{f(cyp)} {f(ex)},{f(ey)}" '
         f'style="fill:none;stroke:{TINTA};stroke-width:{f(grosor)};stroke-linecap:round"/>')
    s += punta(x1, y1, ang, largo=largo, ancho=2.6)
    return s


def tornillo(cx, cy, r):
    """Tornillo o piloto del panel: círculo oscuro con brillo."""
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" '
            f'style="fill:url(#p7-tornillo);stroke:#2b2724;stroke-width:0.5"/>')


def capa(ident, nombre, contenido):
    return (f'<g inkscape:groupmode="layer" id="{ident}" inkscape:label="{nombre}">\n'
            + '\n'.join(contenido) + '\n</g>')


# ─── Medidas (px del panel; ver module_research/panel7/) ──────────────────

# Marco general
MX0, MX1 = 37.45, 720.9        # verticales exteriores
MY0, MY1 = 88.9, 752.8         # horizontal superior e inferior
MY_CANALES = 331.0             # horizontal sobre los canales
MX_SEQ0, MX_SEQ1 = 252.6, 506.5

# Canales: el 1 se dibuja y los otros siete son clones a 85,5 px
CX = 80.75                     # eje del canal 1 (el de los mandos de la web)
PASO = 85.5


def canal_1():
    c = []
    cx = CX
    # Grupos FILTER (mando a y 386) y PAN (y 469): iguales salvo rótulos;
    # en la foto el de PAN está 82 px más abajo.
    for dy, nombre, izq, der, anchos in ((0, 'FILTER', 'low', 'high', (31.1, 12.25, 13.35)),
                                          (82, 'PAN', 'left', 'right', (18.6, 12.15, 17.5))):
        base_rot = 348.3 if nombre == 'FILTER' else 429.6
        c.append(texto(nombre, base_rot, 4.35, 'bold', cx=cx, ancho=anchos[0]))
        c.append(triangulo(cx, 350.4 + dy, 356.2 + dy, 6.0))
        c.append(flecha_curva(cx - 34.4, 397.9 + dy, cx - 28.2, 410.7 + dy, comba=-1.6))
        c.append(flecha_curva(cx + 34.4, 397.9 + dy, cx + 28.2, 410.7 + dy, comba=1.6))
        base_min = 418.1 + dy
        c.append(texto(izq, base_min, 3.1, 'bold', x0=cx - 28.6, ancho=anchos[1], minus=True))
        c.append(texto(der, base_min, 3.1, 'bold', x0=cx + 16.4, ancho=anchos[2], minus=True))
    c.append(texto('OFF', 548.9, 3.5, 'bold', cx=cx, ancho=14.6))
    c.append(tornillo(cx, 566.7, 4.2))
    c.append(texto('LEVEL', 578.9, 3.4, 'medium', cx=cx, ancho=23.6))
    # Escala del fader: 10 arriba (583,7) … 0 abajo (697,2)
    y10, y0 = 583.7, 697.2
    paso = (y0 - y10) / 10
    for n in range(11):
        y = y0 - n * paso
        if n == 10:
            c.append(linea(cx - 14.45, y, cx + 14.45, y, 0.75))
        else:
            c.append(linea(cx - 14.3, y, cx - 5.65, y, 0.7))
            c.append(linea(cx + 5.65, y, cx + 14.3, y, 0.7))
        c.append(texto(str(n), y + 1.5, 3.0, 'bold', x1=cx - 16.65))
        c.append(texto(str(n), y + 1.5, 3.0, 'bold', x0=cx + 16.65))
    # Ranura del fader
    c.append(f'<rect x="{f(cx - 2.25)}" y="585.9" width="4.5" height="136.6" rx="2.25" '
             f'style="fill:{TINTA}"/>')
    c.append(tornillo(cx, 740.6, 3.9))
    return c


def barra_titulo(ident, x0, y0, x1, y1, rotulo, base, alto, ancho, cx):
    """Barra negra con el rótulo calado (máscara, como en el panel 3)."""
    t = texto(rotulo, base, alto, 'bold', cx=cx, ancho=ancho, relleno='#000000')
    return (f'<mask id="{ident}" maskUnits="userSpaceOnUse">'
            f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" style="fill:#ffffff"/>'
            f'{t}</mask>'
            f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" '
            f'mask="url(#{ident})" style="fill:{TINTA}" inkscape:label="{escape(rotulo)}"/>')


def joystick_izquierdo():
    """Rótulos del joystick izquierdo; el derecho es un clone a +582 px
    (la distancia entre sus mandos en la web: 89 → 671)."""
    j = []
    kx = 89.0                  # eje de los mandos Range en la web
    for base, arriba, punta_y in ((161.3, 163.8, 169.7), (244.4, 246.6, 252.5)):
        j.append(texto('RANGE', base, 4.1, 'bold', x0=65.0, x1=98.6))
        j.append(triangulo(kx, arriba, punta_y, 6.0))
    j.append(flecha_recta(111.2, 147.8, 111.2, 168.7, doble=True))
    j.append(flecha_recta(101.8, 242.5, 122.1, 242.5, doble=True))
    return j


COL_SEQ = [269.3 + 31.43 * i for i in range(8)]   # columnas del secuenciador


def secuenciador():
    s = []
    s.append(barra_titulo('p7-mask-seq', 279.9, 103.8, 480.1, 111.4,
                          'SEQUENCER OPERATIONAL CONTROL', 110.4, 4.6, 188.0, 380.0))
    # Regletas de rótulos (tiras atornilladas sobre el panel)
    for y0, y1 in ((118.0, 137.5), (176.0, 196.0), (241.0, 261.0)):
        s.append(f'<rect x="254.6" y="{f(y0)}" width="250.4" height="{f(y1 - y0)}" '
                 f'style="fill:none;stroke:#6f6a66;stroke-width:0.7"/>')
    # Regleta de arriba: esquinas, RECORD WHEN DOWN ↓, RUN CLOCK
    s.append(f'<path d="M 268.4,132.0 V 128.6 H 271.6" style="fill:none;stroke:{TEXTO};stroke-width:0.75"/>')
    s.append(f'<path d="M 455.0,128.6 H 458.2 V 132.0" style="fill:none;stroke:{TEXTO};stroke-width:0.75"/>')
    s.append(grabado('RECORD WHEN DOWN', 363.6, 132.0))
    s.append(flecha_recta(399.4, 125.4, 399.4, 135.1))
    s.append(grabado('RUN', 490.6, 128.3))
    s.append(grabado('CLOCK', 490.6, 135.1))
    # Regleta central: lo que hace cada interruptor
    dos = {0: ('A/B+', 'KEY 1'), 2: ('C+', 'KEY 2'), 4: ('E+', 'KEY 3'), 6: (None, 'KEY 4'),
           7: ('STOP', 'CLOCK')}
    for i, x in enumerate(COL_SEQ):
        if i in dos:
            a, b = dos[i]
            if a:
                s.append(grabado(a, x, 185.1))
            s.append(grabado(b, x, 193.0))
    for i, letra in ((1, 'B'), (3, 'D'), (5, 'F')):
        s.append(grabado(letra, COL_SEQ[i], 190.1, alto=6.2, grueso=0.15))
    # Regleta de abajo: lo que hace cada tecla
    teclas = [('MASTER', 'RESET'), ('RUN', 'FORWARD'), ('RUN', 'REVERSE'), (None, 'STOP'),
              ('RESET', 'SEQUENCE'), ('STEP', 'FORWARD'), ('STEP', 'REVERSE'), ('TEST', 'O/P')]
    # Medidas a mano (la regleta está algo torcida: a la derecha queda 1,5 px
    # más alta que a la izquierda).
    col_teclas = [269.1, 300.75, 331.6, 362.8, 395.1, 425.1, 456.6, 488.2]
    for x, (a, b) in zip(col_teclas, teclas):
        dy = -1.5 * (x - 269.1) / 219.1
        if a:
            s.append(grabado(a, x, 252.1 + dy))
        s.append(grabado(b, x, 258.6 + dy))
    # Tornillos / pilotos de las regletas
    for y in (126.6, 184.3, 250.3):
        s.append(tornillo(285.0, y, 4.5))
        s.append(tornillo(475.0, y, 4.5))
    s.append(texto('CLOCK', 285.3, 3.1, 'medium', cx=319.6, ancho=25.7))
    s.append(texto('RATE', 297.9, 3.1, 'medium', cx=319.7, ancho=18.8))
    return s


def logo():
    l = []
    l.append(rect(349.1, 6.6, 355.3, 66.8))       # lateral izquierdo
    l.append(rect(714.8, 6.6, 721.6, 66.8))       # lateral derecho
    l.append(rect(349.1, 6.6, 721.6, 8.9))        # arriba
    l.append(rect(349.1, 64.2, 721.6, 66.8))      # abajo
    l.append(rect(355.3, 53.6, 714.8, 55.5))      # separador
    # Las palabras van sueltas: en la foto los espacios entre palabras no
    # guardan proporción con el espaciado entre letras.
    for palabra, x0, x1 in (('SYNTHI', 375.0, 579.0), ('100', 603.0, 700.3)):
        l.append(texto(palabra, 43.5 - 0.45, 26.0 - 0.9, 'bold', x0=x0 + 0.45, x1=x1 - 0.45,
                       relleno=TINTA, grueso=0.9))
    for palabra, x0, x1 in (('ELECTRONIC', 413.0, 472.0), ('MUSIC', 483.0, 513.0),
                            ('STUDIOS', 525.0, 566.0), ('(LONDON)', 576.0, 623.0),
                            ('LTD', 635.0, 652.0)):
        l.append(texto(palabra, 62.4, 4.4, 'medium', x0=x0, x1=x1, relleno=TINTA))
    return l


def marcos():
    m = []
    g = 2.1
    m.append(f'<rect x="{f(MX0)}" y="{f(MY0)}" width="{f(MX1 - MX0)}" height="{f(MY1 - MY0)}" '
             f'style="fill:none;stroke:{TINTA};stroke-width:{f(g)}"/>')
    m.append(linea(MX0, MY_CANALES, MX1, MY_CANALES, 3.0))
    m.append(linea(MX_SEQ0, MY0, MX_SEQ0, MY_CANALES, g))
    m.append(linea(MX_SEQ1, MY0, MX_SEQ1, MY_CANALES, g))
    for k in range(1, 8):
        x = CX - PASO / 2 + PASO * k
        m.append(linea(x, MY_CANALES, x, MY1, 2.0))
    return m


def main():
    defs = ['<radialGradient id="p7-tornillo" cx="0.38" cy="0.35" r="0.75">'
            '<stop offset="0" style="stop-color:#8d8884"/>'
            '<stop offset="1" style="stop-color:#3b3633"/></radialGradient>']

    canal = (f'<g id="p7-canal" inkscape:label="Canal 1 (los otros son clones)">\n'
             + '\n'.join(canal_1()) + '\n</g>')
    clones = [f'<use href="#p7-canal" transform="translate({f(PASO * k)},0)" '
              f'inkscape:label="Canal {k + 1}"/>' for k in range(1, 8)]
    titulos = [barra_titulo(f'p7-mask-ch{k + 1}', CX + PASO * k - 41.3, 334.3,
                            CX + PASO * k + 41.3, 341.5, f'OUTPUT CH.{k + 1}',
                            340.2, 3.9, 71.6, CX + PASO * k) for k in range(8)]

    joy = (f'<g id="p7-joystick" inkscape:label="Joystick izquierdo">\n'
           + '\n'.join(joystick_izquierdo()) + '\n</g>')
    joy_der = ('<use href="#p7-joystick" transform="translate(582,0)" '
               'inkscape:label="Joystick derecho (clone)"/>')

    svg = f'''<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Panel 7 del Synthi 100 de Cuenca: joysticks, secuenciador y 8 canales de salida.
     Calcado de design/panels/Panel7/panel_7.jpg; generado por generar_panel7.py. -->
<svg width="760" height="760" viewBox="0 0 760 760" version="1.1" id="p7-svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
<sodipodi:namedview id="namedview1" pagecolor="#e8e4e0" bordercolor="#666666" inkscape:document-units="px"/>
<defs id="p7-defs">
{chr(10).join(defs)}
</defs>
{capa('p7-capa-marcos', 'Marcos', marcos())}
{capa('p7-capa-logo', 'Logo', logo())}
{capa('p7-capa-joysticks', 'Joysticks', [joy, joy_der])}
{capa('p7-capa-secuenciador', 'Secuenciador', secuenciador())}
{capa('p7-capa-canales', 'Canales de salida', [canal] + clones + titulos)}
</svg>
'''
    with open(SALIDA, 'w', encoding='utf-8') as fh:
        fh.write(svg)
    print('escrito', os.path.relpath(SALIDA), len(svg), 'bytes')


if __name__ == '__main__':
    main()
