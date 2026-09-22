# SynthiGME-web — instrucciones de trabajo

Emulación web del **Synthi 100** del Gabinete de Música Electroacústica (GME) de
Cuenca: experimentación sonora, pedagogía y preservación digital de un
instrumento histórico. Se publica en
<https://mesjetiu.github.io/SynthiGME-web/> y como app de escritorio (Electron).

> **Vanilla JS con ES Modules nativos. No hay framework** —ni React, ni Vue, ni
> Angular— y no se introduce ninguno.

## Antes de tocar nada

La documentación está escrita y es buena. Leerla, no deducirla:

| Fichero | Para qué |
|---|---|
| `DEVELOPMENT.md` | Compilar, probar, los flujos de build. **Empezar aquí.** |
| `ARCHITECTURE.md` | Cómo está montado por dentro |
| `MODULE-CREATION-GUIDE.md` | Añadir un módulo del sintetizador |
| `TODO.md`, `REFACTORING.md` | Lo que está a medias y por qué |
| `AUDITORIA-2026-09.md` | Estado verificado del proyecto y **criterio de prioridades**: lo que manda es la web en el navegador |
| `QUE-FALTA.md` | Qué le falta al **instrumento** (módulos ausentes, huecos de matriz, fidelidad contra los manuales) |
| `OSC.md`, `MULTICHANNEL.md` | OSC y el audio multicanal (12 salidas + 8 entradas) |
| `MOBILE-RESEARCH.md` | Rendimiento y limitaciones en móviles |
| `module_research/` | Manuales y material previo del Synthi real, por módulo |
| `CHANGELOG.md` | Qué cambió en cada versión |

Cuando se investiga antes de implementar un módulo, el material va a
`module_research/<módulo>/`: notas, manuales e imágenes de referencia, nunca
código ni builds.

## Los manuales del Synthi 100: repo hermano

Los manuales, esquemas y hojas de datos (el manual técnico D100 de 1982, el
Handbook, los esquemas de 1977, los datasheets de los CEM…) **no están aquí**:
tienen derechos de autor y este repo es público. Viven en el repo privado
**`SynthiGME-investigacion`**, clonado **al lado de este**
(`../SynthiGME-investigacion`). Cuando se pregunte por un chip, un circuito o
lo que dice un manual, **ir allí primero**, no deducirlo ni buscarlo fuera:

- `README.md`: qué libro es cada uno y **cuál manda** (el D100 de 1982; el
  folleto de 1971 es otra máquina y ya indujo errores).
- `herramientas/buscar.sh <término>`: en qué libro y página del PDF está.
- `transcripciones/`: lo ya **afinado a vista** contra el escaneo, citable. El
  resto (`texto/`) es OCR y tiene erratas.

Si una respuesta depende de un dato exacto que aún no está afinado, **se afina
la página a vista y se deja marcada** en aquel repo, con su commit y su push,
siguiendo la sección «Afinar a vista» de su README. Hacer `git pull` allí antes:
se trabaja desde más de una máquina. Aquí, en `module_research/`, solo va lo
derivado (notas, recortes), nunca los manuales.

## Carpetas de salida: no se editan a mano

Las genera el build desde `src/`:

| Carpeta | Qué es | La genera |
|---|---|---|
| `docs/` | PWA que sirve GitHub Pages | `npm run build:web` |
| `dist-app/` | App empaquetada para Electron | `npm run build:electron:*` |
| `dist-electron/` | Instaladores (AppImage, exe) | `npm run build:electron:*` |

⚠️ **`docs/` sí se commitea**, al revés que el resto de salidas de build: es lo
que se publica. No "limpiarla" por parecer generada.

Y los dos flujos compilan **directamente desde `src/`**: `docs/` nunca es un paso
intermedio para Electron.

## Tests

Hay batería y se mantiene verde. Cada avance que se dé por bueno queda cubierto
por un test que lo fije, para que probar más casos sirva para mejorar y nunca
para retroceder.

    npm test           # node --test sobre tests/ (core, i18n, midi, osc, módulos…)
    npm run test:all
    npm run test:audio # Playwright; necesita navegador de verdad

Los `build:*:test` y los `release:*` pasan los tests antes de construir
(`run-tests.mjs --require-pass`): si fallan, no hay release. No saltarse eso.

## Git

- Commit al terminar un trabajo, **en español** y explicando el porqué; un commit
  por idea.
- Historia lineal: `pull --ff-only` o rebase, **nunca commits de merge**.
- **Dejar el repo cerrado**: `git status` limpio y la rama ni por delante ni por
  detrás de `origin`. Este repo se trabaja desde más de una máquina; lo que se
  queda sin commitear o sin subir es un conflicto esperando.
- `postversion` recuerda `git push origin main && git push origin --tags`. Las
  releases las decide Carlos, no se lanzan por iniciativa propia.

## Esto es un repo público

De los pocos que lo son. Nada de datos personales, rutas de casa ni nombres de
terceros en el código, los commits o los docs.

Lo que sea propio de **una máquina** (rutas locales, límites de memoria, que no
haya tarjeta de sonido) va en `CLAUDE.local.md`, que está ignorado y no se
publica. Claude Code carga los dos ficheros.
