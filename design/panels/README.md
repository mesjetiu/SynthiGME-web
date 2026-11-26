# Archivos fuente SVG

Archivos de diseño editables en Inkscape. Estos son los **archivos fuente** que se procesan para generar los SVG optimizados en `src/assets/panels/`.

## Estructura

```
Panel1/   → panel1_source.svg (archivo Inkscape editable)
Panel2/   → panel2_source.svg
...
Panel6/   → panel6_source.svg
```

## Flujo de trabajo

1. **Editar** en Inkscape: `design/panels/PanelN/panelN_source.svg`
2. **Optimizar** con el script:
   ```bash
   npm run optimize:svg -- design/panels/Panel3/panel3_source.svg src/assets/panels/panel3_bg.svg
   ```
3. **Verificar** el resultado en la app

## Convenciones

- Usar guiones bajos en nombres de archivo: `panel3_source.svg`
- Sin espacios en nombres de carpetas
- Archivos fuente con sufijo `_source` para distinguirlos de los optimizados

## Paneles generados por script

- `Panel7/panel7_source.svg` lo genera `Panel7/generar_panel7.py` (medidas
  sobre la foto, en px del panel 760×760; necesita `fontTools`). El SVG sigue
  siendo el fuente: se puede retocar en Inkscape, y entonces el script deja de
  ser la referencia. Cómo se midió y por qué cada cosa:
  `module_research/panel7/fondo_vectorial.md`.
- `Panel2/panel2_source.svg` lo genera `Panel2/generar_panel2.py`, igual:
  `module_research/panel2/fondo_vectorial.md`.
- Las piezas que comparten los generadores (fuentes con fontTools, rótulos en
  Microgramma como `<text>` y en otras fuentes a trazos, líneas, ▼, flechas,
  tornillos, barras con el título calado, capas) están en `piezas_svg.py`.
