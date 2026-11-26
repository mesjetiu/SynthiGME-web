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
#   (las piezas comunes, en design/panels/piezas_svg.py)
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

import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, '..'))
from piezas_svg import (TINTA, TEXTO, f, texto, grabado, rect, linea,  # noqa: E402
                        triangulo, flecha_recta, flecha_curva, capa, documento,
                        barra_titulo, degradado_tornillo)
from piezas_svg import tornillo as _tornillo  # noqa: E402

SALIDA = os.path.join(AQUI, 'panel7_source.svg')


def tornillo(cx, cy, r):
    return _tornillo(cx, cy, r, 'p7-tornillo')


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
        c.append(flecha_curva(cx - 34.4, 397.9 + dy, cx - 28.2, 410.7 + dy, comba=1.6))
        c.append(flecha_curva(cx + 34.4, 397.9 + dy, cx + 28.2, 410.7 + dy, comba=-1.6))
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
    # Hueco del teclado: entre las teclas y bajo ellas se ve oscuro desde
    # y ≈ 215 hasta la regleta de abajo (en la foto, de 215 a 241 en los
    # siete huecos). Las teclas (panel7_tecla.svg) las pinta la web encima.
    s.append('<rect x="255.0" y="214.2" width="250.5" height="27.0" '
             'style="fill:url(#p7-hueco-teclas)"/>')
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
    defs = [degradado_tornillo('p7-tornillo'),
            '<linearGradient id="p7-hueco-teclas" x1="0" y1="0" x2="0" y2="1">'
            '<stop offset="0" style="stop-color:#1d1a1e;stop-opacity:0"/>'
            '<stop offset="0.07" style="stop-color:#1d1a1e"/>'
            '<stop offset="1" style="stop-color:#18151a"/></linearGradient>']

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

    svg = documento(
        'p7', 'Panel 7 del Synthi 100 de Cuenca: joysticks, secuenciador y 8 canales de salida.\n'
        '     Calcado de design/panels/Panel7/panel_7.jpg; generado por generar_panel7.py.', defs,
        [capa('p7-capa-marcos', 'Marcos', marcos()),
         capa('p7-capa-logo', 'Logo', logo()),
         capa('p7-capa-joysticks', 'Joysticks', [joy, joy_der]),
         capa('p7-capa-secuenciador', 'Secuenciador', secuenciador()),
         capa('p7-capa-canales', 'Canales de salida', [canal] + clones + titulos)])
    with open(SALIDA, 'w', encoding='utf-8') as fh:
        fh.write(svg)
    print('escrito', os.path.relpath(SALIDA), len(svg), 'bytes')


if __name__ == '__main__':
    main()
