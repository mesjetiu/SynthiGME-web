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
