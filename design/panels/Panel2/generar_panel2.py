#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# Panel 2 vectorial: genera panel2_source.svg calcando la foto (panel_2.jpg)
# ═══════════════════════════════════════════════════════════════════════════
#
# Todas las medidas están en px del panel (760×760, el mismo encuadre que la
# foto y que los mandos de la web) y salen de medir la foto; el cómo, en
# module_research/panel2/fondo_vectorial.md.
#
#   python3 design/panels/Panel2/generar_panel2.py     (necesita fontTools)
#   npm run optimize:svg -- design/panels/Panel2/panel2_source.svg src/assets/panels/panel2_bg.svg
#   (las piezas comunes, en design/panels/piezas_svg.py)
#
# El SVG que sale es el fuente: se puede abrir y retocar en Inkscape (capas;
# en cada fila de 8 mandos, un ▼ dibujado y siete clones al paso de los
# mandos de la web). Si se retoca a mano, este script deja de ser la
# referencia y no hay que volver a ejecutarlo encima.
#
# Qué va en el fondo: lo serigrafiado y lo que no tiene mando en la web.
#   - Synthi (frecuencímetro, banco de octavas, entradas, envíos y retornos):
#     marcos, barras de título, rótulos, ▼, líneas guía; el conector BNC y
#     los tornillos. Los mandos los pinta la web.
#   - Osciloscopio Gould OS300: la caja, la chapa con sus zonas de color y
#     todo lo serigrafiado (escalas de VOLTS/CM y TIME/CM incluidas), la
#     retícula de la pantalla y, como herrajes sin mando en la web, sus
#     mandos, botones, conectores y conmutadores. Los trazos del haz los
#     pinta la web encima (canvas transparente).
#
# Tipos de letra (vistos en la foto):
#   - Microgramma D Extended Bold: rótulos del Synthi; Medium: los del
#     frecuencímetro (que escribe el 1 como una I: «IOHZ», «·IS»). Van como
#     <text>: la web carga esas fuentes.
#   - Gould: una palo seco de tipo Helvetica; lo más cercano en design/fonts/
#     es Univers 55, y va a trazos. El logotipo GOULD, en Eurostile Bold, a
#     trazos.

import math
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..'))
from piezas_svg import (TINTA, TEXTO, f, escape, texto, trazos, rect, linea,  # noqa: E402
                        polilinea, arco, triangulo, punta, flecha_recta, capa,
                        documento, barra_titulo, degradado_tornillo, fuente, UNIVERS,
                        MG_MEDIUM)
from piezas_svg import tornillo as _tornillo  # noqa: E402

SALIDA = os.path.join(AQUI, 'panel2_source.svg')
EUROSTILE_BOLD = fuente('eurostile/Eurostile-Bold.ttf')
EUROSTILE = fuente('eurostile/Eurostile.ttf')


def tornillo(cx, cy, r):
    return _tornillo(cx, cy, r, 'p2-tornillo')


# ─── Medidas (px del panel; ver module_research/panel2/) ──────────────────

# Columnas de los mandos de las tres filas de 8 (las de la web: 52,75 +
# 93,5·k; en la foto los ▼ caen a ±0,5 px de ahí).
COL0, PASO = 52.75, 93.5
COLS = [COL0 + PASO * k for k in range(8)]

# Los rótulos de las filas de mandos (CHANNEL n, frecuencias, números,
# SEND/RETURN LEVEL) son más finos que la Microgramma Bold y algo más
# gruesos que la Medium: Medium engordada con un trazo.
G_SYNTHI = 0.22

# Marco de la chapa del Synthi (abajo). La foto está girada ~0,13°: las
# líneas van por su media.
MX0, MX1 = 7.6, 752.1
MY0, MY1 = 320.4, 747.3
MY_OCTAVAS, MY_ENTRADAS, MY_ENVIOS = 465.2, 558.4, 652.2
MX_ENVIOS = 379.0              # separador envíos | retornos


# ─── Chapa de arriba y bordes ─────────────────────────────────────────────

def chapa_superior():
    c = []
    # Franja oscura entre la chapa del osciloscopio y la del Synthi, y el
    # borde de abajo del panel (lo que se ve del mueble).
    c.append(rect(0, 295.6, 760, 306.6, relleno='#2b292c'))
    c.append(rect(0, 756.2, 760, 760, relleno='#2b292c'))
    for x, y in ((85.0, 104.0), (83.6, 198.5), (678.6, 103.0), (678.2, 197.5)):
        c.append(tornillo(x, y, 4.6))
    # Dos agujeros tapados bajo el osciloscopio
    for x, y in ((375.0, 273.0), (456.2, 272.5)):
        c.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="13.1" style="fill:#3b2c26"/>')
        c.append(arco(x, y, 13.1, 95, 215, 1.0, color='#f2efea'))
    return c


# ─── Osciloscopio Gould OS300 ─────────────────────────────────────────────

CAJA = '#6a5948'          # caja (carcasa) caqui oscuro
CAJA_CLARA = '#9c8a69'    # el canto de abajo, con luz
BISEL = '#74644f'         # marco en relieve alrededor de la pantalla
CAPUCHA = '#232321'       # hueco oscuro de la pantalla
CHAPA = '#6f4b1a'         # chapa mostaza, tono oscuro (la foto × 1,15, como la crema)
CHAPA_CLARA = '#8a6126'   # zonas claras de la chapa
TINTA_G = '#26180a'       # serigrafía del Gould
RETICULA = '#22506e'


def g_texto(s, base, alto, cx=None, x0=None, x1=None, ancho=None, grueso=0.12, estrecho=1.0):
    return trazos(s, base, alto, UNIVERS, cx=cx, x0=x0, x1=x1, ancho=ancho,
                  grueso=grueso, relleno=TINTA_G, estrecho=estrecho)


def g_mando(cx, cy, r, tapa=None):
    """Mando del Gould (no tiene widget en la web): faldón estriado caqui y
    tapa algo más clara."""
    tapa = tapa if tapa is not None else r * 0.72
    return (f'<g inkscape:label="mando Gould">'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" style="fill:#3d3225"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.9)}" style="fill:none;stroke:#6b5d48;'
            f'stroke-width:{f(r * 0.2)};stroke-dasharray:{f(r * 0.16)},{f(r * 0.16)}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(tapa)}" style="fill:url(#p2-mando-gould)"/>'
            f'</g>')


def g_bnc(cx, cy, r):
    """Conector BNC: tuerca cromada, aro y centro blanco con la patilla."""
    return (f'<g inkscape:label="BNC">'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" style="fill:url(#p2-cromo);stroke:#3a342c;stroke-width:0.5"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.62)}" style="fill:#5d5850"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.45)}" style="fill:#e9e6df"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.14)}" style="fill:#4a4640"/>'
            f'</g>')


def g_hembrilla(cx, cy):
    """Hembrilla de 4 mm (Trace Rotate, Bal): aro oscuro con agujero negro."""
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="5.6" style="fill:#3d342a;stroke:#1c150e;stroke-width:0.5"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="2.9" style="fill:#050302"/>')


def g_boton(cx, cy, lado=9.0):
    """Pulsador cuadrado gris."""
    a = lado / 2
    return (f'<rect x="{f(cx - a)}" y="{f(cy - a)}" width="{f(lado)}" height="{f(lado)}" rx="0.8" '
            f'style="fill:url(#p2-boton);stroke:#2a241c;stroke-width:0.5"/>')


def g_deslizante(x0, y0, x1, y1):
    """Conmutador deslizante AC/Gnd/DC."""
    return (f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" '
            f'style="fill:#1a1611"/>'
            f'<rect x="{f(x0 + 1.6)}" y="{f(y0 + 1.6)}" width="{f((x1 - x0) * 0.42)}" height="{f(y1 - y0 - 3.2)}" '
            f'style="fill:#d9d5cc"/>'
            f'<rect x="{f(x1 - (x1 - x0) * 0.36)}" y="{f(y0 + 1.2)}" width="{f((x1 - x0) * 0.3)}" '
            f'height="{f(y1 - y0 - 2.4)}" style="fill:#6b6152"/>')


def g_doble_flecha_v(cx, y0, y1):
    """↕ junto a los mandos de posición."""
    return (linea(cx, y0 + 2.6, cx, y1 - 2.6, 0.6, TINTA_G)
            + punta(cx, y0, -math.pi / 2, largo=3.0, ancho=2.6, relleno=TINTA_G)
            + punta(cx, y1, math.pi / 2, largo=3.0, ancho=2.6, relleno=TINTA_G))


def escala_volts(cx, cy):
    """Escala de VOLTS/CM: 12 posiciones cada 30° y dos arcos."""
    e = []
    cifras = ['10', '5', '2', '1', '·5', '·2', '·1', '50', '20', '10', '5', '2']
    for i, c in enumerate(cifras):
        a = math.radians(-165 + 30 * i)
        x, y = cx + 24.3 * math.sin(a), cy - 24.3 * math.cos(a)
        e.append(g_texto(c, y + 1.75, 3.5, cx=x))
    e.append(arco(cx, cy, 30.8, 200, 330, 0.7, color=TINTA_G))
    e.append(arco(cx, cy, 30.8, 30, 160, 0.7, color=TINTA_G))
    e.append(g_texto('V', cy - 23.2 + 1.75, 3.5, cx=cx - 29.3))
    e.append(g_texto('mV', cy + 26.0 + 1.75, 3.5, cx=cx + 29.7))
    return e


def escala_tiempo():
    """Escala de TIME/CM, cifra a cifra donde están en la foto."""
    e = []
    cifras = [('ms', 533.3, 157.3), ('2', 551.0, 158.4), ('1', 556.7, 154.1), ('·5', 562.4, 154.1),
              ('·2', 568.4, 154.1), ('·1', 574.8, 155.2), ('50', 581.8, 158.0), ('20', 587.6, 163.3),
              ('10', 589.1, 169.0), ('5', 547.1, 162.9), ('10', 542.9, 169.0), ('20', 540.1, 175.5),
              ('50', 540.1, 182.4), ('·1', 544.0, 188.4), ('·2', 546.1, 194.1), ('sec', 531.8, 194.6),
              ('µs', 602.4, 168.6),
              # A la derecha las tapa el mando en la foto: la serie sigue (10 5 2 1 ·5 µs),
              # en simétrico de las de la izquierda.
              ('5', 591.9, 175.5), ('2', 591.9, 182.4), ('1', 588.0, 188.4), ('·5', 585.9, 194.1)]
    for c, x, y in cifras:
        e.append(g_texto(c, y + 1.75, 3.5, cx=x))
    e.append(arco(566.5, 179.5, 33.0, 205, 300, 0.7, color=TINTA_G))
    e.append(arco(566.5, 179.5, 33.0, 60, 155, 0.7, color=TINTA_G))
    return e


def osciloscopio():
    o = []
    # Caja
    o.append(f'<rect x="119.5" y="33.0" width="529.0" height="224.8" rx="7" '
             f'style="fill:url(#p2-caja);stroke:#2c241b;stroke-width:0.8"/>')
    # Pantalla: marco en relieve, hueco oscuro, cristal con la retícula
    o.append(f'<rect x="140.5" y="37.8" width="214.0" height="183.4" rx="10" style="fill:{BISEL}"/>')
    o.append(f'<rect x="149.8" y="49.6" width="195.2" height="159.0" rx="8" style="fill:{CAPUCHA}"/>')
    o.append('<rect x="160.0" y="61.0" width="178.0" height="142.0" rx="2.5" style="fill:url(#p2-pantalla)"/>')
    o.append(reticula())
    # Tira de abajo: Power On, Intensity, Focus
    o.append(f'<rect x="144.5" y="222.6" width="206.5" height="25.8" '
             f'style="fill:{CHAPA};stroke:#3b2a14;stroke-width:0.7"/>')
    o.append(g_texto('Power', 235.3, 3.6, x0=165.6))
    o.append(g_texto('On', 241.6, 3.6, x0=165.6))
    o.append(g_texto('Intensity', 238.6, 3.6, x0=207.2))
    o.append(g_texto('Focus', 238.6, 3.6, x0=270.8))
    o.append(g_mando(194.5, 236.6, 8.6, tapa=5.2))
    o.append(g_mando(302.0, 236.6, 8.6, tapa=5.2))
    # Chapa de mandos y sus zonas claras
    o.append(rect(354.6, 43.2, 633.4, 250.6, relleno=CHAPA))
    for x0, y0, x1, y1 in ((357.6, 55.4, 427.4, 91.4),       # Trace Rotate, CH1, Bal
                           (505.4, 55.4, 631.6, 123.0),       # disparo (TRIGGER)
                           (505.4, 124.8, 631.6, 248.6)):     # TIME/CM
        o.append(f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" rx="3" '
                 f'style="fill:{CHAPA_CLARA}"/>')
    # Inv/Bal/CH2 con el bloque MODE debajo, que asoma por la izquierda: una
    # sola zona clara
    o.append(f'<path d="M 432.4,55.4 H 500.4 Q 503.4,55.4 503.4,58.4 V 88.4 Q 503.4,91.4 500.4,91.4 '
             f'H 467.6 V 120.0 Q 467.6,123.0 464.6,123.0 H 413.0 Q 410.0,123.0 410.0,120.0 V 91.8 '
             f'Q 410.0,88.8 413.0,88.8 H 429.4 V 58.4 Q 429.4,55.4 432.4,55.4 Z" style="fill:{CHAPA_CLARA}"/>')
    o.append(linea(354.6, 123.9, 633.4, 123.9, 0.9, '#3b2a14'))

    # Arriba: marca y modelo
    o.append(f'<path inkscape:label="logotipo Gould" d="M 365.6,49.4 H 369.2 V 46.0 L 373.8,50.1 '
             f'L 369.2,54.2 V 50.8 H 365.6 Z" style="fill:{TINTA_G}"/>')
    o.append(trazos('GOULD', 53.9, 5.0, EUROSTILE_BOLD, x0=379.3, x1=405.5, relleno=TINTA_G))
    for s, x0, x1 in (('20', 529.6, 537.5), ('MHz', 539.5, 553.2), ('Oscilloscope', 557.9, 599.8),
                      ('OS', 604.5, 613.8), ('300', 615.6, 628.4)):
        o.append(g_texto(s, 54.2, 4.95, x0=x0, x1=x1, grueso=0.3))

    # Canal 1, Inv, canal 2
    o.append(g_texto('Trace', 62.4, 3.4, x0=361.7))
    o.append(g_texto('Rotate', 68.3, 3.4, x0=361.7))
    o.append(g_doble_flecha_v(384.4, 58.3, 68.6))
    o.append(g_hembrilla(377.7, 77.7))
    o.append(g_mando(397.0, 63.8, 9.0))
    o.append(g_texto('CH1', 90.1, 5.3, cx=397.3, grueso=0.2))
    o.append(g_texto('Bal', 68.6, 3.3, cx=419.4))
    o.append(g_hembrilla(419.6, 77.7))
    o.append(g_texto('Inv', 60.3, 3.5, cx=438.3))
    o.append(rect(430.8, 61.4, 444.4, 75.4, relleno='#3a2f22'))
    o.append(g_boton(437.6, 68.4, 10.0))
    o.append(g_texto('Bal', 68.6, 3.3, cx=457.8))
    o.append(g_hembrilla(457.6, 77.7))
    o.append(g_doble_flecha_v(470.5, 58.5, 68.6))
    o.append(g_mando(483.4, 64.8, 9.0))
    o.append(g_texto('CH2', 90.4, 5.3, cx=483.4, grueso=0.2))

    # Disparo
    o.append(g_texto('Bright', 62.6, 3.7, x0=507.9))
    o.append(g_texto('Line', 69.3, 3.7, x0=510.5))
    o.append(g_texto('Ext', 69.3, 3.7, cx=540.2))
    o.append(g_texto('TV', 69.3, 3.7, cx=573.9))
    o.append(g_texto('Mag', 68.6, 3.7, cx=617.7))
    o.append(linea(528.0, 71.0, 554.0, 71.0, 0.6, TINTA_G))
    o.append(linea(561.0, 71.0, 589.0, 71.0, 0.6, TINTA_G))
    o.append(linea(608.4, 65.4, 608.4, 75.2, 0.8, TINTA_G))
    o.append(linea(608.4, 94.8, 608.4, 101.4, 0.8, TINTA_G))
    botones = [517.2, 534.0, 551.0, 567.6, 584.4, 601.4, 618.4]
    o.append(rect(509.4, 81.2, 626.8, 93.4, relleno='#3a2b19'))
    for x, s in zip(botones, ('Off', 'CH1', 'CH2', 'AC', 'DC', '–', 'x10')):
        o.append(g_texto(s, 79.2, 3.7, cx=x))
        o.append(g_boton(x, 87.3, 9.4))
    o.append(g_texto('On', 102.2, 3.7, cx=512.6))
    o.append(g_texto('TRIGGER', 102.4, 3.9, cx=556.0))
    o.append(g_texto('+', 102.2, 3.7, cx=601.4))
    o.append(g_texto('x1', 102.2, 3.7, cx=618.4))
    o.append(polilinea([(626.6, 74.6), (628.2, 74.6), (628.2, 78.6), (626.6, 78.6)], 0.7, TINTA_G))
    o.append(polilinea([(626.4, 98.6), (626.4, 103.6), (630.6, 103.6), (630.6, 98.6)], 0.7, TINTA_G))

    # Power On, MODE, Var Sens…
    o.append(g_texto('Power', 98.0, 3.3, x0=366.9))
    o.append(g_texto('On', 98.0, 3.3, x0=383.8))
    o.append(f'<rect x="372.0" y="102.3" width="10.3" height="10.2" '
             f'style="fill:#6e1a20;stroke:#2a1a10;stroke-width:0.6"/>')
    for cx in (395.3, 480.5):
        o.append(g_texto('Var', 106.2, 3.9, cx=cx))
        o.append(g_texto('Sens', 112.4, 3.9, cx=cx))
    o.append(g_texto('MODE', 99.1, 4.1, cx=437.5, grueso=0.2))
    o.append(g_texto('CH1', 108.5, 3.9, x0=420.9))
    o.append(g_texto('Dual', 106.0, 3.9, x0=432.3))
    o.append(g_texto('CH2', 108.5, 3.9, x0=445.2))
    o.append(g_texto('X–Y', 113.5, 3.9, x0=415.4))
    o.append(g_texto('Add', 113.5, 3.9, x0=451.4))
    o.append(g_texto('Trig Level', 112.2, 3.9, x0=511.4, x1=539.4))
    o.append(g_texto('–', 116.6, 3.6, cx=512.6))
    o.append(punta(518.6, 114.6, 0, largo=2.6, ancho=2.2, relleno=TINTA_G))
    o.append(g_texto('+', 116.8, 3.6, cx=539.6))
    o.append(g_texto('Var Sweep', 112.2, 3.9, x0=551.3, x1=580.7))
    o.append(f'<path d="M 599.6,111.1 L 605.4,108.5 V 113.7 Z M 614.4,111.1 L 608.6,108.5 V 113.7 Z" '
             f'style="fill:{TINTA_G}"/>')
    for x in (409.0, 493.0, 576.0):
        o.append(g_texto('Cal', 128.4, 3.2, cx=x))
    for x, y in ((397.0, 121.6), (484.5, 121.6), (530.0, 121.6), (569.8, 121.6), (610.7, 121.6)):
        o.append(g_mando(x, y, 9.0))
    o.append(g_mando(441.4, 118.2, 12.6))

    # Abajo: VOLTS/CM ×2, TIME/CM, entradas
    for cx in (398.6, 477.4):
        o.append(g_texto('VOLTS / CM', 145.0, 4.1, cx=cx, ancho=33.2))
    o.append(g_texto('TIME / CM', 145.0, 4.1, x0=552.3, x1=581.4))
    o += escala_volts(398.3, 178.4)
    o += escala_volts(477.1, 178.4)
    o += escala_tiempo()
    o.append(g_mando(398.3, 178.4, 17.0, tapa=13.0))
    o.append(g_mando(477.1, 178.4, 17.0, tapa=13.0))
    o.append(g_mando(568.0, 179.0, 18.5, tapa=14.0))
    o.append(g_texto('CH1 (X)', 215.3, 4.4, x0=365.4, x1=391.1, grueso=0.15))
    o.append(g_texto('CH2 (Y)', 215.3, 4.4, x0=445.4, x1=470.6, grueso=0.15))
    o.append(g_texto('Ext Trig', 215.7, 4.1, x0=535.7, x1=558.6))
    for x0, x1 in ((401.6, 434.5), (481.1, 513.4)):
        o.append(g_texto('AC Gnd DC', 220.4, 3.9, x0=x0, x1=x1))
        o.append(g_deslizante(x0 + 3.4, 224.0, x1 - 2.4, 235.5))
    o.append(g_texto('Cal 1V', 221.2, 3.3, x0=587.3, x1=601.1))
    for dx in (0.0, 79.5):
        # Univers no tiene Ω: la omega, de Eurostile
        o.append(g_texto('1M', 245.6, 3.2, x0=365.4 + dx))
        o.append(trazos('Ω', 245.6, 3.2, EUROSTILE, x0=371.0 + dx, relleno=TINTA_G, grueso=0.12))
        o.append(g_texto('28pF', 245.6, 3.2, x0=385.8 + dx))
        o.append(g_texto('400V Max', 245.6, 3.2, x0=406.8 + dx, x1=430.0 + dx))
    for x in (379.5, 458.8):
        o.append(g_bnc(x, 229.4, 10.6))
    o.append(g_bnc(550.2, 229.4, 11.6))
    o.append(f'<circle cx="595.7" cy="229.5" r="4.5" style="fill:#e8e4dc;stroke:#6b6152;stroke-width:0.5"/>'
             f'<circle cx="595.7" cy="229.5" r="1.6" style="fill:#2a241c"/>')
    return o


def reticula():
    """Retícula del Gould: 10 × 8 divisiones de 17,1 px, centrada en
    (251,0; 131,8), con subdivisiones en los ejes y en las líneas de ±2 y
    dos líneas de puntos (0 % y 100 %) a ±2,5."""
    cx, cy, d = 251.0, 131.8, 17.1
    x0, x1 = cx - 5 * d, cx + 5 * d
    y0, y1 = cy - 4 * d, cy + 4 * d
    r = []
    est = f'fill:none;stroke:{RETICULA};stroke-width:0.4'
    trazos_ = []
    for i in range(11):
        x = x0 + i * d
        trazos_.append(f'M {f(x)},{f(y0)} V {f(y1)}')
    for j in range(9):
        y = y0 + j * d
        trazos_.append(f'M {f(x0)},{f(y)} H {f(x1)}')
    # Subdivisiones (cada 0,2 div)
    for i in range(51):
        x = x0 + i * d / 5
        for yy, l in ((cy, 1.3), (cy - 2 * d, 1.0), (cy + 2 * d, 1.0)):
            trazos_.append(f'M {f(x)},{f(yy - l)} V {f(yy + l)}')
    for j in range(41):
        y = y0 + j * d / 5
        trazos_.append(f'M {f(cx - 1.3)},{f(y)} H {f(cx + 1.3)}')
    r.append(f'<path inkscape:label="retícula" d="{" ".join(trazos_)}" style="{est}"/>')
    for yy in (cy - 2.5 * d, cy + 2.5 * d):
        r.append(f'<path d="M {f(x0)},{f(yy)} H {f(x1)}" style="fill:none;stroke:{RETICULA};'
                 f'stroke-width:0.5;stroke-dasharray:0.5,{f(d / 5 - 0.5)}"/>')
    return f'<g inkscape:label="Retícula">{"".join(r)}</g>'


# ─── Synthi: marcos y barras ──────────────────────────────────────────────

def marcos():
    m = []
    g = 2.0
    m.append(f'<rect x="{f(MX0)}" y="{f(MY0)}" width="{f(MX1 - MX0)}" height="{f(MY1 - MY0)}" '
             f'style="fill:none;stroke:{TINTA};stroke-width:{f(g)}"/>')
    for y in (MY_OCTAVAS, MY_ENTRADAS, MY_ENVIOS):
        m.append(linea(MX0, y, MX1, y, g))
    m.append(linea(MX_ENVIOS, MY_ENVIOS, MX_ENVIOS, MY1, g))
    m.append(barra_titulo('p2-mask-octavas', 12.4, 470.7, 136.2, 478.0, 'OCTAVE FILTER BANK', 477.0, 5.0,
                          palabras=[('OCTAVE', 16.7, 58.4), ('FILTER', 63.3, 97.4), ('BANK', 102.4, 131.8)]))
    m.append(barra_titulo('p2-mask-entradas', 12.1, 562.2, 147.9, 569.8, 'INPUT AMPLIFIER LEVEL', 568.6, 5.0,
                          palabras=[('INPUT', 16.2, 47.1), ('AMPLIFIER', 51.2, 106.8), ('LEVEL', 111.2, 143.5)]))
    m.append(barra_titulo('p2-mask-envios', 11.3, 655.7, 195.6, 663.5, 'EXTERNAL TREATMENT DEVICES', 662.1,
                          5.0, palabras=[('EXTERNAL', 15.7, 72.2), ('TREATMENT', 76.3, 141.0),
                                         ('DEVICES', 146.2, 191.4)]))
    return m


def fila_triangulos(ident, arriba, punta_y, ancho=6.0):
    """▼ de la columna 1 y siete clones al paso de los mandos."""
    t = [f'<g id="{ident}">{triangulo(COLS[0], arriba, punta_y, ancho)}</g>']
    t += [f'<use href="#{ident}" transform="translate({f(PASO * k)},0)"/>' for k in range(1, 8)]
    return t


# ─── Frecuencímetro ───────────────────────────────────────────────────────

def frecuencimetro():
    c = []
    md = 'medium'
    for s, x0, x1 in (('FREQUENCY', 182.3, 230.4), ('COUNTER', 237.1, 274.1), ('TIMER', 280.5, 304.1)):
        c.append(texto(s, 332.1, 3.6, md, x0=x0, x1=x1))
    for cx in (233.75, 277.3):
        c.append(rect(cx - 0.75, 330.05, cx + 0.75, 330.65, relleno=TEXTO))
    # Ventana roja (la cifra la pintará la web cuando exista el módulo)
    c.append('<rect x="85.0" y="338.8" width="316.8" height="48.6" style="fill:url(#p2-ventana)"/>')
    c.append(rect(85.0, 338.8, 89.0, 387.4, relleno='#1c0a0c'))
    c.append(rect(85.0, 338.8, 401.8, 340.6, relleno='#1c0a0c'))
    for k in range(1, 8):
        x = 89.0 + k * (401.8 - 89.0) / 8
        c.append(linea(x, 340.6, x, 387.4, 0.5, '#3c0c14'))
    c.append(tornillo(18.0, 362.0, 3.4))
    c.append(tornillo(428.5, 359.5, 3.8))
    # Entrada RATIO / INPUT (el BNC no tiene mando en la web)
    c.append(texto('RATIO', 455.6, 3.7, md, x0=54.0, x1=75.8))
    c.append(texto('INPUT', 455.6, 3.7, md, x0=99.1, x1=121.3))
    c.append(f'<g inkscape:label="BNC">'
             f'<circle cx="81.4" cy="438.0" r="9.4" style="fill:url(#p2-cromo);stroke:#5a554e;stroke-width:0.5"/>'
             f'<circle cx="81.4" cy="438.0" r="5.6" style="fill:#7d776d"/>'
             f'<circle cx="81.4" cy="438.0" r="3.9" style="fill:#f1eee8"/>'
             f'<circle cx="81.4" cy="438.0" r="1.2" style="fill:#5a554e"/></g>')
    # FUNCTION
    c.append(texto('FUNCTION', 399.0, 3.7, md, x0=178.5, x1=217.5))
    # Palabra a palabra: el hueco entre palabras de la serigrafía es mayor que
    # el espacio de la Microgramma con las letras apretadas como en la foto.
    for palabras, base, guia in (
            ([('FREQUENCY', 120.3, 160.2), ('RATIO', 162.3, 180.3)], 407.1,
             [(182.8, 405.2), (190.4, 405.2), (192.5, 412.0)]),
            ([('PERIOD', 144.1, 167.4)], 414.4, [(169.7, 412.8), (177.0, 412.8), (182.6, 417.6)]),
            ([('FREQUENCY', 120.8, 160.6)], 428.3, [(162.0, 426.4), (170.0, 426.4), (176.0, 428.4)]),
            ([('TIME', 214.6, 229.8), ('INTERVAL', 231.5, 263.0)], 407.1,
             [(213.0, 405.2), (206.0, 405.2), (203.2, 412.0)]),
            ([('UNIT', 227.6, 242.2), ('COUNTER', 243.9, 274.5)], 414.4,
             [(225.4, 412.8), (218.0, 412.8), (213.6, 418.0)]),
            ([('OSC', 235.0, 248.2), ('FREQUENCY', 250.5, 289.8)], 427.6,
             [(233.0, 426.0), (225.0, 426.0), (220.0, 427.8)])):
        for s, x0, x1 in palabras:
            c.append(texto(s, base, 3.5, md, x0=x0, x1=x1))
        c.append(polilinea(guia, 0.6, TEXTO))
    # RANGE (el 1 serigrafiado como I)
    c.append(texto('RANGE', 398.8, 3.7, md, x0=362.8, x1=389.6))
    # Cuatro renglones escalonados: 10 Hz / ·1 s, 1 Hz / ·01 s a la izquierda
    # y 100 Hz / 1 s, 1 kHz / 10 s a la derecha.
    for s, base, x0, x1 in (('IOHZ', 404.4, 344.2, 359.2), ('·IS', 408.9, 348.0, 354.4),
                            ('IHZ', 414.4, 336.4, 346.7), ('·OIS', 418.9, 335.0, 346.7),
                            ('IOOHZ', 404.4, 393.3, 413.6), ('IS', 408.9, 400.3, 406.4),
                            ('IKHZ', 414.4, 405.0, 420.6), ('IOS', 418.9, 407.8, 418.3)):
        c.append(texto(s, base, 3.4, md, x0=x0, x1=x1))
    for guia in ([(360.8, 402.8), (367.0, 402.8), (371.1, 414.7)],
                 [(348.3, 412.8), (355.3, 412.8), (361.4, 417.5)],
                 [(391.4, 402.8), (385.0, 402.8), (381.7, 414.7)],
                 [(403.6, 412.8), (397.5, 412.8), (391.1, 418.9)]):
        c.append(polilinea(guia, 0.6, TEXTO))
    return c


# ─── Banco de octavas, entradas, envíos y retornos ────────────────────────

def octavas():
    o = []
    for s, x0, x1 in (('BAND', 295.2, 318.7), ('PASS', 323.7, 345.5), ('CENTRE', 350.5, 383.7),
                      ('FREQUENCY', 388.7, 439.6)):
        o.append(texto(s, 476.4, 3.6, 'medium', x0=x0, x1=x1, grueso=G_SYNTHI))
    o.append(texto('(Hz)', 476.4, 3.6, 'medium', x0=447.2, x1=464.4, grueso=G_SYNTHI))
    for s, cx, ancho in (('63', 52.4, 9.9), ('125', 144.8, 14.0), ('250', 239.3, 16.0),
                         ('500', 332.7, 16.3), ('1000', 425.7, 20.7), ('2000', 520.3, 22.1),
                         ('4000', 614.4, 22.1), ('8000', 707.0, 22.1)):
        o.append(texto(s, 484.35, 3.7, 'medium', cx=cx, ancho=ancho, grueso=G_SYNTHI))
    o += fila_triangulos('p2-tri-octavas', 487.6, 493.7)
    return o


def entradas():
    e = []
    for k, cx in enumerate(COLS):
        n = str(k + 1)
        wn = ancho_medium(n)
        total = 40.5 + 4.45 + wn
        x0 = cx - total / 2
        e.append(texto('CHANNEL', 576.0, 3.6, 'medium', x0=x0, x1=x0 + 40.5, grueso=G_SYNTHI))
        e.append(texto(n, 576.0, 3.6, 'medium', x0=x0 + 40.5 + 4.45, grueso=G_SYNTHI))
    e += fila_triangulos('p2-tri-entradas', 578.1, 584.2)
    return e


def ancho_medium(s, alto=3.6):
    tam = alto / MG_MEDIUM.cap
    a, b = MG_MEDIUM.tinta(s, tam)
    return b - a


def envios():
    e = []
    for k, cx in enumerate(COLS):
        e.append(texto(str(k % 4 + 1), 670.0, 3.6, 'medium', cx=cx, grueso=G_SYNTHI))
    e.append(texto('SEND', 670.3, 3.6, 'medium', x0=166.6, x1=189.3, grueso=G_SYNTHI))
    e.append(texto('LEVEL', 670.3, 3.6, 'medium', x0=196.0, x1=220.8, grueso=G_SYNTHI))
    e.append(texto('RETURN', 670.3, 3.6, 'medium', x0=533.1, x1=566.9, grueso=G_SYNTHI))
    e.append(texto('LEVEL', 670.3, 3.6, 'medium', x0=573.6, x1=598.9, grueso=G_SYNTHI))
    e += fila_triangulos('p2-tri-envios', 673.0, 679.1)
    return e


def main():
    defs = [degradado_tornillo('p2-tornillo'),
            '<radialGradient id="p2-mando-gould" cx="0.4" cy="0.35" r="0.7">'
            '<stop offset="0" style="stop-color:#94856c"/>'
            '<stop offset="1" style="stop-color:#5e513e"/></radialGradient>',
            '<radialGradient id="p2-cromo" cx="0.38" cy="0.35" r="0.75">'
            '<stop offset="0" style="stop-color:#f3f1ec"/>'
            '<stop offset="0.6" style="stop-color:#a9a49b"/>'
            '<stop offset="1" style="stop-color:#5f5a52"/></radialGradient>',
            '<linearGradient id="p2-boton" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" style="stop-color:#b7b0a3"/>'
            '<stop offset="1" style="stop-color:#7e776b"/></linearGradient>',
            '<linearGradient id="p2-caja" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" style="stop-color:#4a3d31"/>'
            f'<stop offset="0.5" style="stop-color:{CAJA}"/>'
            f'<stop offset="0.97" style="stop-color:{CAJA}"/>'
            f'<stop offset="1" style="stop-color:{CAJA_CLARA}"/></linearGradient>',
            '<linearGradient id="p2-pantalla" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0" style="stop-color:#5a8bad"/>'
            '<stop offset="1" style="stop-color:#32668b"/></linearGradient>',
            '<linearGradient id="p2-ventana" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" style="stop-color:#5a0b17"/>'
            '<stop offset="1" style="stop-color:#6d1220"/></linearGradient>']

    svg = documento(
        'p2', 'Panel 2 del Synthi 100 de Cuenca: osciloscopio, frecuencímetro, banco de octavas,\n'
        '     entradas, envíos y retornos. Calcado de design/panels/Panel2/panel_2.jpg;\n'
        '     generado por generar_panel2.py.', defs,
        [capa('p2-capa-chapa', 'Chapa de arriba y bordes', chapa_superior()),
         capa('p2-capa-osciloscopio', 'Osciloscopio Gould OS300', osciloscopio()),
         capa('p2-capa-marcos', 'Marcos y barras', marcos()),
         capa('p2-capa-frecuencimetro', 'Frecuencímetro', frecuencimetro()),
         capa('p2-capa-octavas', 'Banco de octavas', octavas()),
         capa('p2-capa-entradas', 'Entradas', entradas()),
         capa('p2-capa-envios', 'Envíos y retornos', envios())])
    with open(SALIDA, 'w', encoding='utf-8') as fh:
        fh.write(svg)
    print('escrito', os.path.relpath(SALIDA), len(svg), 'bytes')


if __name__ == '__main__':
    main()
