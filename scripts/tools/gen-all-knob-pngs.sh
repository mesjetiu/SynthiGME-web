#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Genera todos los PNGs de knobs desde los SVGs fuente (design/ o src/).
#
# Uso:
#   ./scripts/tools/gen-all-knob-pngs.sh
#
# Requisitos:
#   pip install cairosvg pillow
#
# Los scripts individuales pueden ejecutarse por separado si solo se
# ha editado un SVG concreto.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════════════"
echo "  Generación de PNGs de knobs desde SVGs fuente"
echo "═══════════════════════════════════════════════════"
echo ""

echo "──── 1/4  Knob ring (knob.svg, knob-0-center.svg) ────"
python3 gen-knob-ring-png.py
echo ""

echo "──── 2/4  Vernier dial (spectrol-vernier-dial.svg) ────"
python3 gen-vernier-png.py
echo ""

echo "──── 3/4  Toggle switch (toggle-switch.svg) ────"
python3 gen-toggle-png.py
echo ""

echo "──── 4/4  Rotary switch (rotary-switch.svg) ────"
python3 gen-rotary-png.py
echo ""

echo "═══════════════════════════════════════════════════"
echo "  Todos los PNGs generados correctamente."
echo "  Ejecutar 'npm run build:web' para copiar a docs/."
echo "═══════════════════════════════════════════════════"
