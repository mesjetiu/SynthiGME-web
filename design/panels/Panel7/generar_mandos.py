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

import os

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


def main():
    for nombre, svg in (('panel7_asa.svg', asa()),
                        ):
        ruta = os.path.normpath(os.path.join(DESTINO, nombre))
        with open(ruta, 'w', encoding='utf-8') as fh:
            fh.write(svg)
        print('escrito', os.path.relpath(ruta), len(svg), 'bytes')


if __name__ == '__main__':
    main()
