# SynthiGME-web – Flujo de compilación

Este documento describe únicamente el flujo actual para preparar un build estático del proyecto.

## Requisitos previos
- Node.js 18 o superior
- npm (incluido junto a Node.js)

Puedes verificar tus versiones con:

```bash
node -v
npm -v
```

## Instalación de dependencias
Desde la raíz del repositorio ejecuta una sola vez:

```bash
npm install
```

Esto instala `esbuild`, que es la herramienta utilizada para empaquetar y minificar los assets.

## Estructura de carpetas
- `src/`: código fuente editable. Incluye `index.html`, `assets/css/main.css` y `assets/js/` con todos los módulos.
- `scripts/`: tareas auxiliares. Actualmente contiene `build.mjs`, que orquesta la compilación.
- `dist/`: salida generada automáticamente por el comando de build. No debes editar nada aquí; su contenido se regenera cada vez.

## Ejecutar el build
Lanza el proceso de empaquetado con:

```bash
npm run build
```

Este comando ejecuta `node scripts/build.mjs`, que realiza los siguientes pasos:
1. Limpia la carpeta `dist/` completa.
2. Bundlea y minifica el JavaScript partiendo de `src/assets/js/app.js` (incluyendo sus módulos) usando esbuild.
3. Minifica `src/assets/css/main.css` y lo coloca en `dist/assets/css/`.
4. Copia `src/index.html` a `dist/index.html` y ajusta las rutas relativas a los assets generados.

El resultado está listo para publicarse directamente desde la carpeta `dist/`.

## Notas de trabajo
- Realiza siempre los cambios en `src/` y vuelve a ejecutar `npm run build` cuando necesites un paquete actualizado.
- Evita modificar manualmente el contenido de `dist/` para prevenir inconsistencias entre builds.
