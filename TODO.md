## Oscilador:

- Deshabilitar los osciladores de otros paneles.

- Hacer coincidir inicio de fase de rampa con vientre positivo de seno (hacerlo coseno?)

- Chequear simetría de pulso de p. 22.


## Osciloscopio:

- Mejorar algunos aspectos probando.

## UI:

- Crear menú contextual de cada mando, de cada módulo... para reiniciar, para poner un valor concreto...

## Sistema Dormancy:

- Detallar condiciones particulares más concretas para cada módulo para entrar y salir del estado "dormant". Hasta ahora solo se mira la matriz de conexiones.

## Pines de Matriz:

Actualmente implementados 8 tipos de pin basados en resistencias del manual técnico:

### Pines Estándar (Cuenca/Datanomics 1982)
| Color | Resistencia | Ganancia | Uso |
|-------|-------------|----------|-----|
| WHITE | 100kΩ ±10% | ×1 | Audio estándar (Panel 5) |
| GREY | 100kΩ ±0.5% | ×1 | Control CV precisión (Panel 6) |
| GREEN | 68kΩ ±10% | ×1.5 | Atenuado |
| RED | 2.7kΩ ±10% | ×37 | Osciloscopio |

### Pines Especiales (Manual técnico - mezcla personalizada)
| Color | Resistencia | Ganancia | Uso |
|-------|-------------|----------|-----|
| BLUE | 10kΩ ±10% | ×10 | Boost de señal |
| YELLOW | 22kΩ ±10% | ×4.5 | Ganancia media |
| CYAN | 250kΩ ±10% | ×0.4 | Señal suave |
| PURPLE | 1MΩ ±10% | ×0.1 | Mezcla sutil |

### Pin Peligroso (NO IMPLEMENTADO)
- ORANGE: 0Ω (cortocircuito) - Ganancia infinita, puede dañar componentes

### Futuros (Experimentales - ver manual Belgrado p.2)
- Pines con diodos: comportamiento no lineal (rectificación)
- Pines con capacitores: filtrado pasa-altos/pasa-bajos en conexiones

## Otros:

- Asegurarse de que los patchs están guardando todo (panel 2, 3, 5, 6 y 7, que son los operativos ahora).

- Patches: poder sobrescribir un patch

- Implementar una forma de ver los valores reales o valores de Synthi.

- Decidir voltages de cada módulo. Las salidas serán siempre voltages. Ver resistencias de los pines.

- Hay 2 entradas de micro tras input amplifiers 

- Actualizar árbol de carpetas en architecture.md

## Traducciones:

- Revisar que las traducciones de todo estén hechas, y que se puedan cambiar en caliente (vistas algunas mal en ajustes).

## Problemas:

- Al reiniciar patch, permanece el dibujo en el osciloscopio.

- Pines: tooltip molesta. Dar la posibilidad de un solo click en ajustes.

- No se conceden permisos de micro en Chrome android (móvil)

- En móvil no importa patches (en desktop sí, probado)
