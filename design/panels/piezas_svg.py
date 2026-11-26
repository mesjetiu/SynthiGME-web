# ═══════════════════════════════════════════════════════════════════════════
# Piezas comunes de los generadores de fondos vectoriales (paneles 7, 2…)
# ═══════════════════════════════════════════════════════════════════════════
#
# Lo que se repite al calcar un panel de su foto: fuentes (fontTools),
# rótulos en Microgramma como <text>, rótulos en otras fuentes a trazos,
# líneas, ▼, flechas, tornillos, capas de Inkscape y barras negras con el
# título calado. Todas las medidas en px del panel (760×760).
#
# Lo usan Panel7/generar_panel7.py y Panel2/generar_panel2.py:
#
#   sys.path.insert(0, os.path.join(AQUI, '..'))
#   from piezas_svg import *
#
# Necesita fontTools (no está en el Python del sistema; en las máquinas de
# Carlos, ~/.local/share/venv-music21/bin/python).

import math
import os
from xml.sax.saxutils import escape

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FUENTES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fonts')

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


_cache = {}


def fuente(fichero):
    """Fuente de design/fonts/, cargada una sola vez."""
    if fichero not in _cache:
        _cache[fichero] = Fuente(fichero)
    return _cache[fichero]


MG_BOLD = fuente('microgramma/Microgramma D Extended Bold.otf')
MG_MEDIUM = fuente('microgramma/Microgramma D Extended Medium.otf')
UNIVERS = fuente('Univers 55 Roman/Univers 55 Roman.otf')


def _colocar(fu, s, tam, ls, cx, x0, x1, escala=1.0):
    """x del origen para que la tinta quede centrada en cx, o empiece en x0,
    o acabe en x1 (con la anchura multiplicada por escala)."""
    a, b = fu.tinta(s, tam, ls)
    w = (b - a) * escala
    if cx is not None:
        izq = cx - w / 2
    elif x0 is not None:
        izq = x0
    else:
        izq = x1 - w
    return izq - a * escala


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
    x = _colocar(fu, s, tam, ls, cx, x0, x1)
    estilo = (f"font-family:'{FAMILIA}';font-weight:{'bold' if peso == 'bold' else 500};"
              f"font-size:{f(tam)}px;letter-spacing:{f(ls)}px;font-kerning:none;"
              f"fill:{relleno}")
    if grueso:
        # La serigrafía de la foto es más gruesa que la Microgramma: se engorda
        # con un trazo del mismo color (la tinta crece grueso/2 por cada lado).
        estilo += f";stroke:{relleno};stroke-width:{f(grueso)};stroke-linejoin:round"
    lab = f' inkscape:label="{escape(etiqueta)}"' if etiqueta else ''
    return f'<text x="{f(x)}" y="{f(base)}" style="{estilo}"{lab}>{escape(s)}</text>'


def trazos(s, base, alto, fu, cx=None, x0=None, x1=None, ancho=None,
           estrecho=1.0, grueso=0.0, relleno=TEXTO, ref='cap', kerning=True):
    """Rótulo en una fuente que la web no carga: a trazos (<path>).

    alto: altura de mayúscula (ref='cap') o de la x (ref='x').
    estrecho: escala horizontal de las letras; ancho (o x0 y x1): ajusta el
    espaciado para que la tinta mida eso. grueso: trazo que engorda la letra.
    """
    tam = alto / (fu.cap if ref == 'cap' else fu.xalt)
    if x0 is not None and x1 is not None:
        ancho = x1 - x0
    ls = 0.0
    if ancho is not None and len(s) > 1:
        a, b = fu.tinta(s, tam)
        ls = (ancho / estrecho - (b - a)) / (len(s) - 1)
    org = _colocar(fu, s, tam, ls, cx, x0, x1, escala=estrecho)
    pen = SVGPathPen(fu.gs)
    x = 0.0
    k = tam / fu.upm
    for c in s:
        g = fu.glifo(c)
        if c != ' ':
            tp = TransformPen(pen, (k * estrecho, 0, 0, -k, org + x * estrecho, base))
            g.draw(tp)
        x += g.width * k + ls
    d = pen.getCommands()
    estilo = f'fill:{relleno}'
    if grueso:
        estilo += f';stroke:{relleno};stroke-width:{f(grueso)};stroke-linejoin:round'
    return f'<path inkscape:label="{escape(s)}" d="{d}" style="{estilo}"/>'


ESTRECHO = 0.87      # Univers 55 → anchura de los rótulos grabados del panel 7
GRUESO = 0.42        # trazo que la engorda (px)


def grabado(s, cx, base, alto=4.25, estrecho=ESTRECHO, grueso=GRUESO):
    """Rótulo grabado (panel 7, secuenciador): Univers a trazos, centrado en cx."""
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


def polilinea(puntos, grosor, color=TINTA, extremo='butt', union='miter'):
    d = 'M ' + ' L '.join(f'{f(x)},{f(y)}' for x, y in puntos)
    return (f'<path d="{d}" style="fill:none;stroke:{color};stroke-width:{f(grosor)};'
            f'stroke-linecap:{extremo};stroke-linejoin:{union}"/>')


def arco(cx, cy, r, desde, hasta, grosor, color=TINTA):
    """Arco de circunferencia; ángulos en grados desde las 12, en el sentido
    de las agujas del reloj."""
    def p(a):
        t = math.radians(a)
        return cx + r * math.sin(t), cy - r * math.cos(t)
    (xa, ya), (xb, yb) = p(desde), p(hasta)
    grande = 1 if (hasta - desde) % 360 > 180 else 0
    return (f'<path d="M {f(xa)},{f(ya)} A {f(r)},{f(r)} 0 {grande} 1 {f(xb)},{f(yb)}" '
            f'style="fill:none;stroke:{color};stroke-width:{f(grosor)}"/>')


def triangulo(cx, arriba, punta, ancho, relleno=TINTA):
    """▼ que señala el cero de un mando."""
    return (f'<path d="M {f(cx - ancho / 2)},{f(arriba)} L {f(cx + ancho / 2)},{f(arriba)} '
            f'L {f(cx)},{f(punta)} Z" style="fill:{relleno}"/>')


def punta(x, y, ang, largo=3.6, ancho=3.0, relleno=TINTA):
    """Punta de flecha rellena con el vértice en (x, y), apuntando a ang (rad)."""
    ux, uy = math.cos(ang), math.sin(ang)
    bx, by = x - ux * largo, y - uy * largo
    px, py = -uy * ancho / 2, ux * ancho / 2
    return (f'<path d="M {f(x)},{f(y)} L {f(bx + px)},{f(by + py)} '
            f'L {f(bx + ux * largo * 0.25)},{f(by + uy * largo * 0.25)} '
            f'L {f(bx - px)},{f(by - py)} Z" style="fill:{relleno}"/>')


def flecha_recta(x0, y0, x1, y1, doble=False, grosor=0.75, color=TINTA, largo=3.6, ancho=3.0):
    ang = math.atan2(y1 - y0, x1 - x0)
    ux, uy = math.cos(ang), math.sin(ang)
    a = (x0 + ux * largo * 0.6, y0 + uy * largo * 0.6) if doble else (x0, y0)
    b = (x1 - ux * largo * 0.6, y1 - uy * largo * 0.6)
    s = linea(a[0], a[1], b[0], b[1], grosor, color)
    s += punta(x1, y1, ang, largo, ancho, color)
    if doble:
        s += punta(x0, y0, ang + math.pi, largo, ancho, color)
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


def degradado_tornillo(ident):
    """Degradado de los tornillos y pilotos (va en <defs>)."""
    return (f'<radialGradient id="{ident}" cx="0.38" cy="0.35" r="0.75">'
            '<stop offset="0" style="stop-color:#8d8884"/>'
            '<stop offset="1" style="stop-color:#3b3633"/></radialGradient>')


def tornillo(cx, cy, r, degradado):
    """Tornillo o piloto del panel: círculo oscuro con brillo (degradado: id
    del <radialGradient> de degradado_tornillo)."""
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" '
            f'style="fill:url(#{degradado});stroke:#2b2724;stroke-width:0.5"/>')


def capa(ident, nombre, contenido):
    return (f'<g inkscape:groupmode="layer" id="{ident}" inkscape:label="{nombre}">\n'
            + '\n'.join(contenido) + '\n</g>')


def barra_titulo(ident, x0, y0, x1, y1, rotulo, base, alto, ancho=None, cx=None, palabras=None):
    """Barra negra con el rótulo calado (máscara, como en el panel 3).

    El rótulo va entero (rotulo, con su ancho y cx) o palabra a palabra
    (palabras: [(palabra, x0, x1), …]), cuando en la foto los espacios entre
    palabras no guardan proporción con el espaciado entre letras."""
    if palabras:
        t = ''.join(texto(p, base, alto, 'bold', x0=a, x1=b, relleno='#000000')
                    for p, a, b in palabras)
    else:
        t = texto(rotulo, base, alto, 'bold', cx=cx, ancho=ancho, relleno='#000000')
    return (f'<mask id="{ident}" maskUnits="userSpaceOnUse">'
            f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" style="fill:#ffffff"/>'
            f'{t}</mask>'
            f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" '
            f'mask="url(#{ident})" style="fill:{TINTA}" inkscape:label="{escape(rotulo)}"/>')


def documento(ident, comentario, defs, capas, fondo_inkscape='#e8e4e0'):
    """El SVG entero: 760×760 en px del panel, con capas de Inkscape."""
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- {comentario} -->
<svg width="760" height="760" viewBox="0 0 760 760" version="1.1" id="{ident}-svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">
<sodipodi:namedview id="namedview1" pagecolor="{fondo_inkscape}" bordercolor="#666666" inkscape:document-units="px"/>
<defs id="{ident}-defs">
{chr(10).join(defs)}
</defs>
{chr(10).join(capas)}
</svg>
'''
