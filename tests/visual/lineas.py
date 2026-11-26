#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# Líneas serigrafiadas de una foto de panel, en px del panel (760)
# ═══════════════════════════════════════════════════════════════════════════
#
# Para cuadrar un panel sobre su foto (hoja de ruta, 1.3): busca las líneas
# oscuras largas (los marcos de los módulos) y da su posición en px del
# panel, que es lo que va en las cajas { x, y, w, h } del blueprint.
#
#   python3 tests/visual/lineas.py FOTO v|h DESDE HASTA A0 A1 RACHA_MIN
#
#   v: líneas verticales con x entre DESDE y HASTA, buscadas en la franja
#      y A0–A1; h: horizontales con y entre DESDE y HASTA, en la franja
#      x A0–A1. Solo cuenta una línea si tiene una racha continua de
#      píxeles oscuros de al menos RACHA_MIN px del panel.
#
# Ejemplo (marcos verticales de la mitad inferior del panel 4):
#   python3 tests/visual/lineas.py src/assets/panels/panel_4.jpg v 0 760 370 745 60
#
# Ojo: las etiquetas en negativo (texto blanco sobre negro) también salen
# como «líneas»; acotar la franja a donde solo haya marcos. Necesita Pillow
# y numpy.

import sys
import numpy as np
from PIL import Image

foto, eje = sys.argv[1], sys.argv[2]
desde, hasta, a0, a1, racha_min = map(float, sys.argv[3:8])
im = np.asarray(Image.open(foto).convert('L')).astype(int)
S = im.shape[0] / 760
oscuro = im < 90


def racha(a):
    mejor = cur = 0
    for v in a:
        cur = cur + 1 if v else 0
        mejor = max(mejor, cur)
    return mejor


hallados = []
for i in range(int(desde * S), int(hasta * S)):
    seg = oscuro[int(a0 * S):int(a1 * S), i] if eje == 'v' else oscuro[i, int(a0 * S):int(a1 * S)]
    r = racha(seg)
    if r >= racha_min * S:
        hallados.append((i / S, r / S))

grupos = []
for p, r in hallados:
    if grupos and p - grupos[-1][-1][0] < 1.0:
        grupos[-1].append((p, r))
    else:
        grupos.append([(p, r)])
for g in grupos:
    ps = [p for p, _ in g]
    print(f"{eje} {ps[0]:.2f}..{ps[-1]:.2f}  centro {(ps[0] + ps[-1]) / 2:.2f}  racha {max(r for _, r in g):.1f}")
