# SynthiGME-web

SynthiGME-web es un port del sintetizador modular Synthi GME ("GME Modular Emulator"), inspirado en el EMS Synthi 100 del Gabinete de Música Electroacústica (GME) de Cuenca. El proyecto nació como Trabajo Final del Máster en Arte Sonoro de la Universitat de Barcelona (curso 2019/2020) bajo la tutoría de José Manuel Berenguer Alarcón y se concibió como herramienta de documentación, divulgación y experimentación sonora. Esta versión web persigue el mismo objetivo pedagógico pero con una distribución sin fricciones: basta un navegador moderno para explorar el sistema, sin instalaciones locales ni dependencias especializadas.

## Acceso en línea
La versión compilada está disponible en GitHub Pages: **https://mesjetiu.github.io/SynthiGME-web/**. Solo necesitas abrir ese enlace en un navegador moderno para experimentar el instrumento; no es necesario clonar ni compilar nada para usarlo.

## Relación con SynthiGME (SuperCollider)
El repositorio original en SuperCollider, [SynthiGME](https://github.com/mesjetiu/SynthiGME), contiene la implementación completa como Quark, documentación histórica detallada y material audiovisual del instrumento. SynthiGME-web reutiliza esa investigación y traslada los paneles a la web para facilitar su difusión; cualquier mejora conceptual debería mantenerse alineada con la referencia original.

## Flujo de compilación
Esta sección solo es necesaria si vas a mantener el proyecto o desplegarlo fuera de GitHub Pages. El flujo técnico genera un bundle estático en `docs/`, que también sirve para alimentar Pages (rama `main` + carpeta `/docs`).

### Requisitos previos
- Node.js 18 o superior
- npm (incluido junto a Node.js)

Verifica tus versiones con:

```bash
node -v
npm -v
```

### Instalación de dependencias
Desde la raíz del repositorio ejecuta una sola vez:

```bash
npm install
```

Esto instala `esbuild`, la herramienta utilizada para empaquetar y minificar los assets.

### Estructura de carpetas
- `src/`: código fuente editable. Incluye `index.html`, `assets/css/main.css` y `assets/js/` con todos los módulos.
- `scripts/`: tareas auxiliares. Actualmente contiene `build.mjs`, que orquesta la compilación.
- `docs/`: salida generada automáticamente por el comando de build. Esta carpeta es la que puede publicar GitHub Pages (rama `main` + carpeta `/docs`). No edites su contenido a mano; se regenera cada vez.

### Ejecutar el build
Lanza el proceso de empaquetado con:

```bash
npm run build
```

Este comando ejecuta `node scripts/build.mjs`, que realiza los siguientes pasos:
1. Limpia la carpeta `docs/` completa.
2. Bundlea y minifica el JavaScript partiendo de `src/assets/js/app.js` (incluyendo sus módulos) usando esbuild.
3. Minifica `src/assets/css/main.css` y lo coloca en `docs/assets/css/`.
4. Copia `src/index.html` a `docs/index.html` para apuntar a los assets generados.

El resultado está listo para publicarse directamente desde la carpeta `docs/`.

### Notas de trabajo
- Realiza siempre los cambios en `src/` y vuelve a ejecutar `npm run build` cuando necesites un paquete actualizado (por ejemplo antes de subir a GitHub Pages u otro servidor).
- Evita modificar manualmente el contenido de `docs/` para prevenir inconsistencias entre builds. Tras construir, haz commit/push de `docs/` para que Pages publique la última versión.
