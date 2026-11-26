#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# Panel 7: las piezas que se mueven (asa del fader y teclas del secuenciador)
# ═══════════════════════════════════════════════════════════════════════════
#
#   python3 design/panels/Panel7/generar_mandos.py
#
# Escribe, directamente en src/assets/panels/ (son pequeños y ya salen
# limpios, no pasan por optimize-svg):
#   - panel7_asa.svg           asa del fader de nivel de los 8 canales
#   - panel7_tecla.svg         tecla gris del secuenciador, en reposo
#   - panel7_tecla_pulsada.svg la misma, hundida
#   - panel7_dial_faldon.svg   dial Clock Rate: faldón cromado con su índice (fijo)
#   - panel7_dial_escala.svg   dial Clock Rate: escala negra 0–9 (gira)
#   - panel7_dial_capuchon.svg dial Clock Rate: capuchón de aluminio (fijo)
#
# Calcadas de la foto (panel_7.jpg) con una plantilla mediana de los
# ejemplares sanos: los canales 2–8 para el asa (el 1 está roto) y las 8
# teclas. Medidas y criterio en module_research/panel7/mandos.md.
#
# Todas las medidas en px del panel (760 = ancho de la foto). Las dos piezas
# se dibujan de frente y simétricas: en la foto cada una sale con la
# perspectiva de la cámara (las de la izquierda enseñan su cara derecha y al
# revés), y aquí tienen que ser idénticas en los ocho sitios. La luz viene de
# arriba a la izquierda, como en la foto.
#
# La web las pinta como imagen de fondo (CSS): el asa es el «thumb» del
# <input type=range> y la tecla, el fondo del <button>. El navegador las
# rasteriza una vez (y otra al cambiar de zoom) y luego solo las compone:
# mover el fader no repinta nada. Por eso el desenfoque de la sombra del asa
# no cuesta: es un filtro dentro de una imagen, no un filter de CSS.

import math
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
DESTINO = os.path.join(AQUI, '..', '..', '..', 'src', 'assets', 'panels')


def f(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s == '-0' else s


def pts(*p):
    return ' '.join(f'{f(x)},{f(y)}' for x, y in p)


# ─── Asa del fader ────────────────────────────────────────────────────────
#
# Un tronco de pirámide negro: cara de delante (la que se toca) trapecial,
# más estrecha arriba, y cuatro faldas que bajan a la chapa. Arriba, una
# plaquita blanca (la tienen los canales 2, 4, 5 y 7; en el 3, el 6 y el 8 se
# ha perdido). El borde de arriba del asa es el índice: en la foto, con los
# faders a cero, cae justo en la raya del 0.

ASA_ALTO = 26.1          # 697,2 (raya del 0) → 723,3 (pie del asa)
ASA_ARRIBA = 14.0        # ancho del canto de arriba
ASA_ABAJO = 24.6         # ancho del pie
CARA_ARRIBA = 10.8       # cara de delante: ancho arriba…
CARA_ABAJO = 19.4        # …y abajo
CARA_Y0, CARA_Y1 = 1.6, 25.3
SOMBRA = (3.0, 1.6, 0.55, 1.1)   # dx, dy, opacidad, desenfoque
ASA_ANCHO_IMG = 36.0     # el asa centrada, con sitio para la sombra a la derecha
ASA_ALTO_IMG = ASA_ALTO + 4.0


def asa():
    cx = ASA_ANCHO_IMG / 2

    def trapecio(y0, y1, a0, a1, dx=0.0, dy=0.0):
        return pts((cx - a0 / 2 + dx, y0 + dy), (cx + a0 / 2 + dx, y0 + dy),
                   (cx + a1 / 2 + dx, y1 + dy), (cx - a1 / 2 + dx, y1 + dy))

    sil = (0, ASA_ALTO, ASA_ARRIBA, ASA_ABAJO)
    cara = (CARA_Y0, CARA_Y1, CARA_ARRIBA, CARA_ABAJO)
    # Esquinas de la silueta y de la cara, para las faldas
    s_tl = (cx - ASA_ARRIBA / 2, 0); s_tr = (cx + ASA_ARRIBA / 2, 0)
    s_bl = (cx - ASA_ABAJO / 2, ASA_ALTO); s_br = (cx + ASA_ABAJO / 2, ASA_ALTO)
    c_tl = (cx - CARA_ARRIBA / 2, CARA_Y0); c_tr = (cx + CARA_ARRIBA / 2, CARA_Y0)
    c_bl = (cx - CARA_ABAJO / 2, CARA_Y1); c_br = (cx + CARA_ABAJO / 2, CARA_Y1)
    # Plaquita blanca: arriba de la cara, siguiendo sus lados
    py0, py1 = 2.2, 7.1
    k = (CARA_ABAJO - CARA_ARRIBA) / (CARA_Y1 - CARA_Y0)   # cuánto se abre la cara por px
    pa0 = CARA_ARRIBA + k * (py0 - CARA_Y0) - 1.6
    pa1 = CARA_ARRIBA + k * (py1 - CARA_Y0) - 1.6

    dx, dy, op, blur = SOMBRA
    sombras = (f'<polygon points="{trapecio(*sil, dx, dy)}" fill="#000" fill-opacity="{op}" '
               f'filter="url(#s)"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{f(ASA_ANCHO_IMG)}" height="{f(ASA_ALTO_IMG)}" viewBox="0 0 {f(ASA_ANCHO_IMG)} {f(ASA_ALTO_IMG)}">
<!-- Asa del fader de los canales de salida (panel 7). Generado por design/panels/Panel7/generar_mandos.py -->
<defs>
<filter id="s" x="-.3" y="-.3" width="1.6" height="1.6"><feGaussianBlur stdDeviation="{blur}"/></filter>
<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a272d"/><stop offset=".45" stop-color="#141216"/><stop offset="1" stop-color="#0e0d10"/></linearGradient>
<linearGradient id="i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c686e"/><stop offset="1" stop-color="#8a868a"/></linearGradient>
<linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2a2f"/><stop offset="1" stop-color="#1c1a1e"/></linearGradient>
<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f4f0"/><stop offset="1" stop-color="#d4d0ca"/></linearGradient>
</defs>
{sombras}
<polygon points="{trapecio(*sil)}" fill="#0b0a0d"/>
<polygon points="{pts(s_tl, c_tl, c_bl, s_bl)}" fill="url(#i)"/>
<polygon points="{pts(s_tr, s_br, c_br, c_tr)}" fill="url(#d)"/>
<polygon points="{pts(s_tl, s_tr, c_tr, c_tl)}" fill="#5e5a60"/>
<polygon points="{trapecio(*cara)}" fill="url(#c)"/>
<polygon points="{trapecio(py0, py1, pa0, pa1)}" fill="url(#p)" stroke="url(#p)" stroke-width=".9" stroke-linejoin="round"/>
<polygon points="{pts(c_bl, c_br, s_br, s_bl)}" fill="#060507"/>
</svg>
'''


# ─── Tecla del secuenciador ───────────────────────────────────────────────
#
# Una tecla gris de máquina de escribir vista de frente (Carlos, 26-nov: «de
# frente se verían como chocolate»): tan alta como ancha, con el plato
# cóncavo en el centro y cuatro faldas iguales alrededor. En la foto sale con
# la perspectiva de la cámara, que está más abajo: el plato se va hacia
# arriba y la falda de delante parece grande. Lo que no se desplaza es el
# pie, que apoya en la chapa: 27,5 px de ancho y abajo en y 237,3. Entre las
# teclas, y bajo ellas, el hueco oscuro del teclado, que es del panel
# (generar_panel7.py). Luz de arriba a la izquierda: falda de arriba y de la
# izquierda a la luz, la de la derecha y la de abajo a la sombra.

TECLA = 27.5             # lado del pie (y de la imagen)
PLATO = 18.0             # lado de la cara de arriba, centrada (en la foto, el plato
                         # mide 18 × 18,5; aquí lleva un canto plano de 0,8)
TECLA_R = 2.6            # esquinas del pie
PLATO_R = 4.5            # esquinas del plato


def tecla(pulsada=False):
    L = TECLA
    a = (L - PLATO) / 2              # ancho de cada falda
    p0, p1 = a, L - a
    osc = 0.88 if pulsada else 1.0   # hundida, más a la sombra
    enc = 0.35 if pulsada else 0.0   # y el plato algo más pequeño (baja)

    def gris(v):
        v = round(v * osc)
        return f'#{v:02x}{v:02x}{min(255, v + 2):02x}'

    q0, q1 = p0 + enc, p1 - enc      # cara de arriba (cuadrada, canto plano)
    d0, d1 = q0 + 0.8, q1 - 0.8      # y dentro, el plato cóncavo
    # Las cuatro faldas: trapecios entre el canto del pie y el del plato
    arriba = pts((0, 0), (L, 0), (q1, q0), (q0, q0))
    abajo = pts((0, L), (q0, q1), (q1, q1), (L, L))
    izq = pts((0, 0), (q0, q0), (q0, q1), (0, L))
    der = pts((L, 0), (L, L), (q1, q1), (q1, q0))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{f(L)}" height="{f(L)}" viewBox="0 0 {f(L)} {f(L)}">
<!-- Tecla del secuenciador (panel 7), de frente{', hundida' if pulsada else ''}. Generado por design/panels/Panel7/generar_mandos.py -->
<defs>
<clipPath id="k"><rect width="{f(L)}" height="{f(L)}" rx="{f(TECLA_R)}"/></clipPath>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{gris(0xa8)}"/><stop offset="1" stop-color="{gris(0x98)}"/></linearGradient>
<linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{gris(0x96)}"/><stop offset="1" stop-color="{gris(0x8c)}"/></linearGradient>
<linearGradient id="r" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="{gris(0x50)}"/><stop offset="1" stop-color="{gris(0x6a)}"/></linearGradient>
<linearGradient id="b" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="{gris(0x58)}"/><stop offset="1" stop-color="{gris(0x70)}"/></linearGradient>
<linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{gris(0x80)}"/><stop offset=".55" stop-color="{gris(0x8c)}"/><stop offset="1" stop-color="{gris(0x94)}"/></linearGradient>
<linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".28"/></linearGradient>
</defs>
<g clip-path="url(#k)">
<rect width="{f(L)}" height="{f(L)}" fill="{gris(0x7c)}"/>
<polygon points="{arriba}" fill="url(#t)"/>
<polygon points="{izq}" fill="url(#l)"/>
<polygon points="{der}" fill="url(#r)"/>
<polygon points="{abajo}" fill="url(#b)"/>
</g>
<rect x="{f(q0)}" y="{f(q0)}" width="{f(q1 - q0)}" height="{f(q1 - q0)}" rx="1.2" fill="{gris(0x94)}"/>
<rect x="{f(d0)}" y="{f(d0)}" width="{f(d1 - d0)}" height="{f(d1 - d0)}" rx="{f(PLATO_R)}" fill="url(#p)"/>
<rect x="{f(d0 + .4)}" y="{f(d0 + .4)}" width="{f(d1 - d0 - .8)}" height="{f(d1 - d0 - .8)}" rx="{f(PLATO_R - .4)}" fill="none" stroke="url(#c)" stroke-width=".8"/>
<rect x=".25" y=".25" width="{f(L - .5)}" height="{f(L - .5)}" rx="{f(TECLA_R - .2)}" fill="none" stroke="#29272c" stroke-width=".5"/>
</svg>
'''


# ─── Dial Clock Rate (dial de cámara lenta) ───────────────────────────────
#
# En la foto no es el vernier Spectrol del resto de la web (esfera negra con
# ventana de vueltas) sino un dial de cámara lenta (el manual de estudio lo
# llama «slow-motion potentiometer CLOCK RATE»): un faldón cromado cónico,
# una escala negra con las cifras 0–9 y cien rayitas, y en el centro el
# capuchón de aluminio por el que se gira. Arriba, sobre el faldón, un
# índice blanco: lo que marca la escala es la cifra que queda debajo.
#
# En la foto las cifras crecen en sentido antihorario (3 a las diez y media,
# 7 abajo, 9 a las tres) y tienen la cabeza hacia el centro (el 7 de abajo
# se lee derecho). Así, girando el mando a derechas la escala gira a
# derechas y bajo el índice van pasando cifras mayores. Una vuelta de la
# escala es todo el recorrido (0 = 10, como en la foto: diez cifras).
#
# Medidas de frente, en px del panel (dial de 55 px, mandos.md): faldón hasta
# r 27,5; escala hasta r 20 (en la foto, borde izquierdo de las rayas a 20 del
# eje); capuchón de r 10,3. Las piezas que no giran (faldón e índice,
# capuchón) van en imágenes aparte: solo la escala rota.

DIAL = 55.0
DIAL_C = DIAL / 2
DIAL_R_ESCALA = 20.0
DIAL_R_CAPUCHON = 10.3


def _svg(contenido, nota):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(DIAL)}" height="{f(DIAL)}" '
            f'viewBox="0 0 {f(DIAL)} {f(DIAL)}">\n'
            f'<!-- {nota}. Generado por design/panels/Panel7/generar_mandos.py -->\n'
            f'{contenido}</svg>\n')


def dial_faldon():
    c, R, r = DIAL_C, DIAL_C - 0.6, DIAL_R_ESCALA
    # Cromo: bandas de luz y sombra alrededor (el faldón refleja la sala).
    # SVG no tiene degradado cónico: se reparte en 72 cuñas de 5°.
    def brillo(a):  # a en grados, 0 arriba, a derechas
        t = math.radians(a)
        v = (0.52 + 0.20 * math.cos(t + 0.8) + 0.16 * math.cos(3 * t - 0.4)
             + 0.10 * math.cos(5 * t + 1.9))
        return max(0.12, min(0.97, v))
    cunas = []
    n = 72
    for i in range(n):
        a0, a1 = 360 * i / n, 360 * (i + 1.04) / n
        g = round(255 * brillo(360 * (i + 0.5) / n))
        pa = [(c + R * math.sin(math.radians(a)), c - R * math.cos(math.radians(a))) for a in (a0, a1)]
        cunas.append(f'<path d="M{f(c)},{f(c)}L{f(pa[0][0])},{f(pa[0][1])}'
                     f'A{f(R)},{f(R)} 0 0 1 {f(pa[1][0])},{f(pa[1][1])}Z" '
                     f'fill="#{g:02x}{g:02x}{min(255, g + 4):02x}"/>')
    # Índice: rayita blanca arriba, en el canto interior del faldón
    ix = f'<rect x="{f(c - 0.55)}" y="{f(c - r - 3.2)}" width="1.1" height="3.0" rx=".3" fill="#f4f2ea" stroke="#3a3a3a" stroke-width=".25"/>'
    contenido = (
        '<defs>'
        '<radialGradient id="s" cx=".5" cy=".5" r=".5"><stop offset=".82" stop-color="#000" stop-opacity=".45"/>'
        '<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="h" cx=".5" cy=".5" r=".5"><stop offset=".73" stop-color="#fff" stop-opacity="0"/>'
        '<stop offset=".93" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>'
        '</defs>\n'
        f'<circle cx="{f(c + 1.0)}" cy="{f(c + 1.2)}" r="{f(DIAL_C - 0.2)}" fill="url(#s)"/>\n'
        + ''.join(cunas) + '\n'
        f'<circle cx="{f(c)}" cy="{f(c)}" r="{f(R)}" fill="url(#h)"/>\n'
        f'<circle cx="{f(c)}" cy="{f(c)}" r="{f(R - 0.2)}" fill="none" stroke="#2b2b2b" stroke-width=".4"/>\n'
        f'<circle cx="{f(c)}" cy="{f(c)}" r="{f(r + 0.6)}" fill="#151515"/>\n'
        + ix + '\n')
    return _svg(contenido, 'Dial Clock Rate (panel 7): faldón cromado e índice, fijos')


def dial_escala():
    sys.path.insert(0, AQUI)
    from generar_panel7 import UNIVERS  # misma fuente que los grabados del secuenciador
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    c, r = DIAL_C, DIAL_R_ESCALA
    partes = [f'<circle cx="{f(c)}" cy="{f(c)}" r="{f(r)}" fill="#0d0d0e"/>']
    # Cien rayitas; más largas en cada cifra y a media cifra
    rayas = []
    for i in range(100):
        a = math.radians(-3.6 * i)
        r0 = r - (2.6 if i % 10 == 0 else 1.9 if i % 5 == 0 else 1.35)
        r1 = r - 0.35
        x0, y0 = c + r0 * math.sin(a), c - r0 * math.cos(a)
        x1, y1 = c + r1 * math.sin(a), c - r1 * math.cos(a)
        rayas.append(f'M{f(x0)},{f(y0)}L{f(x1)},{f(y1)}')
    partes.append(f'<path d="{"".join(rayas)}" stroke="#d8d6cf" stroke-width=".32" fill="none"/>')
    # Cifras: cabeza hacia el centro, crecen en sentido antihorario
    fu = UNIVERS
    alto = 3.3
    tam = alto / fu.cap
    k = tam / fu.upm
    r_cifra = r - 5.0          # centro de la cifra
    pen = SVGPathPen(fu.gs)
    for n in range(10):
        g = fu.glifo(str(n))
        b = fu.caja(str(n))
        gx = (b[0] + b[2]) / 2 * k      # centro de la tinta
        gy = (b[1] + b[3]) / 2 * k
        a = math.radians(-36 * n)
        cx, cy = c + r_cifra * math.sin(a), c - r_cifra * math.cos(a)
        # Glifo derecho (y hacia abajo) centrado en el origen, girado 180°+a:
        # con a = 0 (arriba) queda cabeza abajo, hacia el centro.
        rot = a + math.pi
        co, si = math.cos(rot), math.sin(rot)
        # punto de fuente (u, v) → local (u·k − gx, −(v·k − gy)) → girar → trasladar
        m = (k * co, k * si, k * si, -k * co,
             cx - gx * co + gy * si, cy - gx * si - gy * co)
        g.draw(TransformPen(pen, m))
    partes.append(f'<path d="{pen.getCommands()}" fill="#ecebe6" stroke="#ecebe6" '
                  f'stroke-width=".22" stroke-linejoin="round"/>')
    return _svg('\n'.join(partes) + '\n', 'Dial Clock Rate (panel 7): escala 0–9, gira con el valor')


def dial_capuchon():
    c, r = DIAL_C, DIAL_R_CAPUCHON
    contenido = (
        '<defs>'
        '<radialGradient id="a" cx=".42" cy=".38" r=".62"><stop offset="0" stop-color="#d9d9d6"/>'
        '<stop offset=".55" stop-color="#a9a9a6"/><stop offset="1" stop-color="#6e6e6c"/></radialGradient>'
        '<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/>'
        '<stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        '</defs>\n'
        f'<circle cx="{f(c + 0.5)}" cy="{f(c + 0.7)}" r="{f(r + 0.9)}" fill="#000" opacity=".55"/>\n'
        f'<circle cx="{f(c)}" cy="{f(c)}" r="{f(r)}" fill="url(#a)" stroke="#2c2c2c" stroke-width=".45"/>\n'
        f'<circle cx="{f(c)}" cy="{f(c)}" r="{f(r - 0.5)}" fill="url(#b)"/>\n'
        f'<circle cx="{f(c)}" cy="{f(c)}" r="{f(r * 0.35)}" fill="#fff" opacity=".08"/>\n')
    return _svg(contenido, 'Dial Clock Rate (panel 7): capuchón de aluminio, fijo')


def main():
    for nombre, svg in (('panel7_asa.svg', asa()),
                        ('panel7_tecla.svg', tecla()),
                        ('panel7_tecla_pulsada.svg', tecla(pulsada=True)),
                        ('panel7_dial_faldon.svg', dial_faldon()),
                        ('panel7_dial_escala.svg', dial_escala()),
                        ('panel7_dial_capuchon.svg', dial_capuchon())):
        ruta = os.path.normpath(os.path.join(DESTINO, nombre))
        with open(ruta, 'w', encoding='utf-8') as fh:
            fh.write(svg)
        print('escrito', os.path.relpath(ruta), len(svg), 'bytes')


if __name__ == '__main__':
    main()
