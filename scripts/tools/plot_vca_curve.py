#!/usr/bin/env python3
"""
Genera una gráfica de la función de saturación del VCA CEM 3330.
Ejecutar con: python3 scripts/tools/plot_vca_curve.py
"""

import matplotlib
matplotlib.use('Agg')  # Backend sin GUI
import matplotlib.pyplot as plt
import numpy as np

# Parámetros del VCA (mismos que en voltageConstants.js)
VCA_DB_PER_VOLT = 10
VCA_CUTOFF_VOLTAGE = -12
LINEAR_THRESHOLD = 0
HARD_LIMIT = 3.0
SOFTNESS = 2.0

def vca_voltage_to_gain(voltage):
    """Replica exacta de vcaVoltageToGain de voltageConstants.js"""
    soft_zone_width = HARD_LIMIT - LINEAR_THRESHOLD
    
    # Zona de corte
    if voltage <= VCA_CUTOFF_VOLTAGE:
        return 0
    
    # Zona normal (logarítmica 10 dB/V)
    if voltage <= LINEAR_THRESHOLD:
        dB = voltage * VCA_DB_PER_VOLT
        return 10 ** (dB / 20)
    
    # Zona de saturación (CV positivo)
    # Fórmula: compressed = range × ratio / (1 + ratio × softness)
    excess_voltage = voltage - LINEAR_THRESHOLD
    ratio = excess_voltage / soft_zone_width
    compressed_excess = soft_zone_width * ratio / (1 + ratio * SOFTNESS)
    saturated_voltage = LINEAR_THRESHOLD + compressed_excess
    
    dB = saturated_voltage * VCA_DB_PER_VOLT
    return 10 ** (dB / 20)

def ideal_voltage_to_gain(voltage):
    """Ganancia ideal sin saturación (para comparar)"""
    if voltage <= VCA_CUTOFF_VOLTAGE:
        return 0
    dB = voltage * VCA_DB_PER_VOLT
    return 10 ** (dB / 20)

# Generar datos
voltages = np.linspace(-14, 6, 500)
gains_real = [vca_voltage_to_gain(v) for v in voltages]
gains_ideal = [ideal_voltage_to_gain(v) for v in voltages]

# Crear figura
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

# ─────────────────────────────────────────────────────────────────────────────
# GRÁFICA 1: Ganancia lineal
# ─────────────────────────────────────────────────────────────────────────────
ax1.plot(voltages, gains_ideal, 'b--', label='Ideal (sin saturación)', alpha=0.7, linewidth=1.5)
ax1.plot(voltages, gains_real, 'r-', label='Real (con saturación)', linewidth=2)

# Marcar zonas
ax1.axvline(x=VCA_CUTOFF_VOLTAGE, color='gray', linestyle=':', alpha=0.5)
ax1.axvline(x=LINEAR_THRESHOLD, color='green', linestyle=':', alpha=0.5)
ax1.axvline(x=HARD_LIMIT, color='orange', linestyle=':', alpha=0.5)
ax1.axhline(y=1.0, color='gray', linestyle='-', alpha=0.3)

# Sombrear zonas
ax1.axvspan(-14, VCA_CUTOFF_VOLTAGE, alpha=0.1, color='red')
ax1.axvspan(VCA_CUTOFF_VOLTAGE, LINEAR_THRESHOLD, alpha=0.1, color='blue')
ax1.axvspan(LINEAR_THRESHOLD, 6, alpha=0.1, color='orange')

ax1.set_xlabel('Voltaje de control (V)', fontsize=12)
ax1.set_ylabel('Ganancia lineal', fontsize=12)
ax1.set_title('VCA CEM 3330 - Ganancia vs Voltaje (escala lineal)', fontsize=14)
ax1.set_xlim(-14, 6)
ax1.set_ylim(0, 15)
ax1.legend(loc='upper left', fontsize=9)
ax1.grid(True, alpha=0.3)

# Anotación
ax1.annotate('Ganancia unidad (0 dB)', xy=(0, 1), xytext=(1, 3),
            arrowprops=dict(arrowstyle='->', color='black', alpha=0.7),
            fontsize=9, ha='center')

# ─────────────────────────────────────────────────────────────────────────────
# GRÁFICA 2: Ganancia en dB
# ─────────────────────────────────────────────────────────────────────────────
gains_real_db = [20 * np.log10(g) if g > 1e-10 else -200 for g in gains_real]
gains_ideal_db = [20 * np.log10(g) if g > 1e-10 else -200 for g in gains_ideal]

ax2.plot(voltages, gains_ideal_db, 'b--', label='Ideal (10 dB/V lineal)', alpha=0.7, linewidth=1.5)
ax2.plot(voltages, gains_real_db, 'r-', label='Real (con saturación)', linewidth=2)

ax2.axvline(x=VCA_CUTOFF_VOLTAGE, color='gray', linestyle=':', alpha=0.5)
ax2.axvline(x=LINEAR_THRESHOLD, color='green', linestyle=':', alpha=0.5)
ax2.axvline(x=HARD_LIMIT, color='orange', linestyle=':', alpha=0.5)
ax2.axhline(y=0, color='gray', linestyle='-', alpha=0.3)

ax2.axvspan(-14, VCA_CUTOFF_VOLTAGE, alpha=0.1, color='red')
ax2.axvspan(VCA_CUTOFF_VOLTAGE, LINEAR_THRESHOLD, alpha=0.1, color='blue')
ax2.axvspan(LINEAR_THRESHOLD, 6, alpha=0.1, color='orange')

ax2.set_xlabel('Voltaje de control (V)', fontsize=12)
ax2.set_ylabel('Ganancia (dB)', fontsize=12)
ax2.set_title('VCA CEM 3330 - Ganancia vs Voltaje (escala dB)', fontsize=14)
ax2.set_xlim(-14, 6)
ax2.set_ylim(-130, 40)
ax2.legend(loc='upper left', fontsize=9)
ax2.grid(True, alpha=0.3)

# Etiquetas de posición del dial
for dial, volt in [(10, 0), (7.5, -3), (5, -6), (2.5, -9), (0, -12)]:
    ax2.annotate(f'Dial {dial}', xy=(volt, -120), xytext=(volt, -115),
                fontsize=8, ha='center', color='purple', alpha=0.8)

plt.tight_layout()
output_file = 'vca_saturation_curve.png'
plt.savefig(output_file, dpi=150, bbox_inches='tight')
print(f'✅ Gráfica guardada en: {output_file}')
print()
print('Zonas de la curva:')
print('  🔴 Rojo (< -12V): Zona de corte total')
print('  🔵 Azul (-12V a 0V): Zona normal (10 dB/V logarítmico)')
print('  🟠 Naranja (> 0V): Zona de saturación (CV positivo)')
