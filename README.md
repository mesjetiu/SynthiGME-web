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

## Licencia
SynthiGME-web se distribuye bajo la licencia [MIT](LICENSE). Puedes reutilizar, modificar y redistribuir el código manteniendo la atribución correspondiente.

## Versionado y releases
1. Mantén el número de versión únicamente en `package.json` siguiendo [Semantic Versioning](https://semver.org/lang/es/). Registra tus cambios recientes en `CHANGELOG.md` dentro de la sección `Unreleased`.
2. Cuando quieras publicar una versión, asegúrate de que el repositorio está limpio en la rama `main`, mueve las notas de `Unreleased` a una nueva entrada (p. ej. `## [0.1.1] - AAAA-MM-DD`) y guarda el archivo.
3. Ejecuta `npm run release:patch`, `npm run release:minor` o `npm run release:major` según el alcance de los cambios:
	- El helper `scripts/release/pre.mjs` comprueba que solo `CHANGELOG.md` esté modificado, guarda temporalmente su contenido y limpia el working tree.
	- El hook `preversion` lanza `npm run build`, regenerando la carpeta `docs/` con la salida lista para GitHub Pages.
	- `npm version` actualiza `package.json`, crea el commit automático (`release: Synthi GME vX.Y.Z`) y añade el tag `vX.Y.Z`.
	- El helper `scripts/release/post.mjs` restaura `CHANGELOG.md`, lo añade al commit mediante `git commit --amend --no-edit` y fuerza el tag para apuntar al nuevo commit.
4. Revisa el diff (incluidos los artefactos de `docs/`). Si todo es correcto, publica la versión con `git push origin main` seguido de `git push origin --tags`.

Tras estos pasos, la carpeta `docs/` contiene la última versión estable y está lista para ser servida por GitHub Pages sin tareas adicionales.

### Notas de trabajo
- Realiza siempre los cambios en `src/` y vuelve a ejecutar `npm run build` cuando necesites un paquete actualizado (por ejemplo antes de subir a GitHub Pages u otro servidor).
- Evita modificar manualmente el contenido de `docs/` para prevenir inconsistencias entre builds. Tras construir, haz commit/push de `docs/` para que Pages publique la última versión.
