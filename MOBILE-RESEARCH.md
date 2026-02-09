# ⚠️ ARCHIVO DE INVESTIGACIÓN - Compilación para Android e iOS

> **Este documento es de investigación.** Analiza las opciones para empaquetar SynthiGME
> como app nativa en Android e iOS, manteniendo el código web como base.
>
> Para la arquitectura actual, ver:
> - **[ARCHITECTURE.md](ARCHITECTURE.md)** — Arquitectura general del proyecto
> - **[DEVELOPMENT.md](DEVELOPMENT.md)** — Guía de build y desarrollo
> - **[MULTICHANNEL.md](MULTICHANNEL.md)** — Audio multicanal (solo desktop)
> - **[OSC-BROWSER-RESEARCH.md](OSC-BROWSER-RESEARCH.md)** — OSC en navegador/móvil

---

## 1. Contexto y Prioridades

SynthiGME es una app **vanilla JavaScript** (ES Modules, Web Audio API + AudioWorklet) que ya funciona en:

| Plataforma | Método | Características extra |
|---|---|---|
| **Navegadores** (Chrome, Firefox, Safari...) | PWA desde GitHub Pages | — |
| **Linux, Windows, macOS** (escritorio) | Electron (AppImage, exe) | OSC, menú nativo, multicanal (Linux) |

El objetivo es llevar la app a **Android** e **iOS** con estas prioridades:

1. **Código base web intacto** — HTML/CSS/JS es la fuente de verdad, sin reescrituras
2. **Características nativas deseables** — OSC (si es viable), orientación forzada, wake lock nativo
3. **Multichannel NO es prioridad** — en móvil solo salida estéreo
4. **Frameworks mantenibles** — con respaldo corporativo o comunidad activa, sin riesgo de obsolescencia
5. **Mantenimiento sencillo** — similar a Electron: carpeta de código nativo pequeña, build con un comando

---

## 2. Stack técnico actual relevante

| Tecnología web | Soporte Android WebView | Soporte iOS WKWebView |
|---|:-:|:-:|
| **AudioWorklet** (7 procesadores) | ✅ Desde Chrome 66 (2018) | ✅ Desde iOS 14.5 (2021) |
| **Web Audio API** completa | ✅ | ✅ |
| **ES Modules** | ✅ | ✅ |
| **SharedArrayBuffer** | ✅ Chrome 88+ con COOP/COEP | ✅ Safari 15.2+ con COOP/COEP |
| **Service Worker** | ✅ | ✅ (pero conflicto potencial con wrapper) |
| **Screen Wake Lock API** | ✅ | ❌ (necesita plugin nativo) |
| **localStorage** | ✅ Persistente | ✅ Persistente |
| **SVG** (paneles del sintetizador) | ✅ | ✅ |
| **Touch events** (pinch/pan/zoom) | ✅ | ✅ |

> **AudioWorklet** es la dependencia crítica. Tiene soporte global >95% según CanIUse (Baseline: Widely available). Los 7 procesadores de SynthiGME (osciladores PolyBLEP, ruido, VCA, filtros, scope, recording, multichannel capture) funcionarán sin cambios.

> **SharedArrayBuffer** solo se usa para el bridge PipeWire (multicanal Linux). En móvil no aplica — el core de síntesis no lo necesita.

---

## 3. Opciones evaluadas

### 3.1 Capacitor (Ionic/OutSystems) — ⭐ RECOMENDADA

**Versión actual**: v8 (2025). Mantenido activamente por OutSystems (empresa enterprise que adquirió Ionic).

#### Qué es

Capacitor envuelve tu aplicación web en un **WebView nativo** (Android WebView / iOS WKWebView) y genera proyectos nativos reales de Android Studio y Xcode. Exactamente el mismo concepto que Electron para desktop, pero para móvil.

#### Cómo encaja con SynthiGME

```
┌─────────────────────────────────────────────────────┐
│  SynthiGME Build Pipeline                           │
│                                                      │
│  src/ ──► npm run build:web ──► docs/                │
│                                    │                 │
│                    ┌───────────────┤                 │
│                    ▼               ▼                 │
│               GitHub Pages    cap sync               │
│               (PWA)           ▼                      │
│                          android/ ──► APK            │
│                          ios/    ──► IPA             │
│                                                      │
│  src/ ──► npm run build:electron ──► dist-electron/  │
│                                      (AppImage, exe) │
└─────────────────────────────────────────────────────┘
```

La salida de `build:web` (`docs/` o carpeta dedicada) es directamente la entrada de `cap sync`. No se necesita build separado para móvil.

#### Integración propuesta

```
/                           
├── src/                    # Código fuente (sin cambios)
├── electron/               # Wrapper Electron (sin cambios)
├── android/                # NUEVO: Proyecto Android Studio (generado por Capacitor)
│   ├── app/
│   │   ├── src/main/java/com/synthigme/app/   # Plugins nativos
│   │   └── src/main/res/                      # Iconos, splash
│   └── capacitor.settings.gradle
├── ios/                    # NUEVO: Proyecto Xcode (generado por Capacitor)
│   └── App/
│       ├── App/            # Plugins nativos Swift
│       └── Pods/           # Dependencias CocoaPods
├── capacitor.config.ts     # NUEVO: Configuración Capacitor
└── docs/                   # Build web (fuente para cap sync)
```

#### Configuración mínima

```typescript
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.synthigme.app',
  appName: 'SynthiGME',
  webDir: 'docs',               // Usa la misma salida que build:web
  server: {
    androidScheme: 'https',     // Necesario para COOP/COEP headers
  },
  plugins: {
    ScreenOrientation: {
      // Forzar landscape (reemplaza portraitBlocker.js nativo)
    },
    KeepAwake: {
      // Wake lock nativo (reemplaza Screen Wake Lock API en iOS)
    }
  }
};

export default config;
```

#### Scripts npm adicionales

```json
{
  "build:android": "npm run build:web && npx cap sync android",
  "build:ios": "npm run build:web && npx cap sync ios",
  "open:android": "npx cap open android",
  "open:ios": "npx cap open ios"
}
```

#### Ventajas

| Ventaja | Detalle |
|---|---|
| ✅ **Mínimo esfuerzo** | `cap init` + `cap add` + `cap sync`. 5 minutos para primer APK |
| ✅ **Mismo patrón que Electron** | WebView wrapper + plugins nativos opcionales |
| ✅ **AudioWorklet funciona** | Ambos WebViews lo soportan |
| ✅ **Plugins oficiales** | 30+ plugins mantenidos (screen-orientation, keep-awake, splash, status-bar...) |
| ✅ **Plugins custom** | Escribir Java/Kotlin (Android) y Swift (iOS) con acceso completo al SDK |
| ✅ **App Store publicable** | Genera proyectos nativos reales, no PWAs empaquetadas |
| ✅ **Respaldo corporativo** | OutSystems (empresa enterprise), releases regulares |
| ✅ **Detección de plataforma** | `window.Capacitor` para branching, como `window.electronAPI` |
| ✅ **Build web sin cambios** | `docs/` es directamente la fuente para `cap sync` |

#### Desventajas

| Desventaja | Mitigación |
|---|---|
| ❌ WebView ≠ browser completo | En la práctica, para Web Audio API no hay diferencia apreciable |
| ❌ iOS requiere Mac + Xcode | Inevitable para cualquier opción iOS |
| ❌ Performance ligeramente menor que nativo | AudioWorklet corre en hilo separado — irrelevante para DSP |
| ❌ iOS audio session management | Requiere plugin nativo (ver sección 5) |

---

### 3.2 Tauri v2 Mobile

**Versión actual**: v2 estable. Mantenido por comunidad + sponsors.

#### Qué es

Framework basado en Rust que usa el WebView del sistema. Similar a Capacitor pero con backend en Rust en vez de Java/Swift.

#### Ventajas sobre Capacitor
- App más ligera (<600KB runtime vs ~2-5MB)
- Excelente para OSC nativo (crate `rosc` en Rust)
- Modelo de seguridad superior

#### Desventajas frente a Capacitor
- **Requiere aprender Rust** para cualquier plugin nativo
- Ecosistema de plugins más pequeño
- Setup más complejo (Rust + NDK + Xcode)
- Soporte móvil más reciente y menos battle-tested
- Equipo actual no usa Rust → curva de aprendizaje

#### Veredicto

Opción sólida técnicamente, pero **la barrera de Rust es significativa** para un proyecto que ya tiene todo en JavaScript/Node.js. Considerar si el equipo quiere invertir en Rust a largo plazo.

---

### 3.3 Apache Cordova

**Versión actual**: CLI 13.0.0 (Nov 2025), cordova-android 14.0.0, cordova-ios 8.0.0.

#### Qué es

El predecesor de Capacitor. Mismo concepto (WebView wrapper), pero arquitectura más vieja.

#### Estado de mantenimiento

- Mantenido por **voluntarios** bajo Apache Foundation
- Releases más lentos, comunicación menos activa
- Piden ayuda de la comunidad explícitamente en los blogs
- Muchos plugins legacy sin mantenedor

#### Veredicto

**No usar para proyecto nuevo.** Capacitor fue creado por el mismo equipo (Ionic) como evolución de Cordova. No hay ninguna ventaja en elegir Cordova hoy.

---

### 3.4 PWA sin wrapper

#### Android
- ✅ Instalable desde Chrome ("Añadir a pantalla de inicio")
- ✅ Publicable en Play Store vía TWA (Trusted Web Activity)
- ⚠️ Sin acceso a APIs nativas (no OSC, no lock de orientación nativo)

#### iOS
- ✅ Instalable desde Safari
- ❌ **No publicable en App Store** (Apple no acepta PWAs empaquetadas)
- ❌ Background audio se suspende al cambiar de app
- ❌ Screen Wake Lock API no funciona en WKWebView

#### Veredicto

La PWA **ya funciona hoy** en móviles sin hacer nada. Pero para publicar en App Store iOS y tener control sobre audio session, orientación, wake lock, etc., se necesita un wrapper nativo.

---

### 3.5 TWA (Trusted Web Activity) — Solo Android

Empaqueta la URL de la PWA en una app Android usando Chrome Custom Tabs. Esencialmente es la PWA pero como APK publicable en Play Store.

#### Veredicto

Útil solo para Android, solo si no se necesitan plugins nativos. Capacitor es estrictamente superior (genera proyecto nativo real, permite plugins, funciona en ambas plataformas).

---

## 4. Comparativa general

| Criterio | Capacitor | Tauri v2 | Cordova | PWA | TWA |
|---|:-:|:-:|:-:|:-:|:-:|
| Android | ✅ | ✅ | ✅ | ✅ | ✅ |
| iOS | ✅ | ✅ | ✅ | ⚠️ limitado | ❌ |
| App Store | ✅ ambos | ✅ ambos | ✅ ambos | ❌ Apple | Solo Play |
| AudioWorklet | ✅ | ✅ | ✅ | ✅ | ✅ |
| Plugins nativos | ✅ Java/Swift | ✅ Rust | ✅ Java/ObjC | ❌ | ❌ |
| OSC nativo | ✅ plugin | ✅ Rust | ✅ plugin | ❌ | ❌ |
| Mantenimiento | Empresa | Comunidad | Voluntarios | Estándares | Google |
| Riesgo obsolescencia | Bajo | Medio-bajo | Medio-alto | Muy bajo | Bajo |
| Esfuerzo integración | Bajo | Medio-alto | Bajo | Nulo | Bajo |
| Lenguaje nativo | Java/Swift | **Rust** | Java/ObjC | — | — |
| Tamaño runtime | ~2-5 MB | <600 KB | ~3-5 MB | 0 | 0 |
| Ecosistema plugins | Grande | Pequeño | Grande (legacy) | — | — |

---

## 5. Gotchas específicos de SynthiGME en móvil

### 5.1 Audio en iOS — AVAudioSession

iOS tiene un sistema de "audio sessions" que controla cómo se comporta el audio de la app. Sin configuración nativa:

| Problema | Comportamiento por defecto | Solución |
|---|---|---|
| **Silent switch** | Audio se silencia | Configurar categoría `.playback` |
| **Background audio** | Se suspende al salir de la app | Activar background audio en capabilities |
| **Interrupciones** (llamadas, alarmas) | Audio no se reanuda | Observer de interrupciones + `resume()` automático |
| **Spatial audio del sistema** | Puede interferir con síntesis | Desactivar procesamiento espacial |

**Solución**: Plugin nativo Capacitor (~100 líneas Swift) que configure `AVAudioSession`:

```swift
// Conceptual — plugin Capacitor para iOS audio session
let session = AVAudioSession.sharedInstance()
try session.setCategory(.playback, mode: .default, options: [])
try session.setActive(true)
```

### 5.2 Service Worker — Conflicto potencial

Capacitor sirve la app desde un servidor local interno. El Service Worker de la PWA podría cachear respuestas incorrectamente.

**Solución**: Desactivar registro de SW cuando se detecta Capacitor:

```javascript
// En sw.js o en el código de registro
if (!window.Capacitor) {
  navigator.serviceWorker.register('./sw.js');
}
```

### 5.3 Screen Wake Lock

La Screen Wake Lock API funciona en Android WebView pero **no en iOS WKWebView**.

**Solución**: Plugin `@capacitor-community/keep-awake` — funciona en ambas plataformas.

### 5.4 Orientación de pantalla

SynthiGME tiene `portraitBlocker.js` que bloquea el modo retrato con JavaScript. Funciona, pero es más limpio usar:

**Solución**: Plugin `@capacitor/screen-orientation` — bloqueo nativo en ambas plataformas.

### 5.5 Carga de AudioWorklets

Los worklets se cargan con `audioContext.audioWorklet.addModule('./assets/js/worklets/...')`. En Capacitor, los archivos se sirven desde el servidor local con rutas relativas al `webDir`.

**Potencial problema**: paths relativos podrían romperse si la base URL cambia.

**Solución**: Verificar que la base URL en Capacitor coincide con la estructura de `docs/`. Capacitor sirve desde la raíz del `webDir`, así que las rutas relativas deberían funcionar tal cual.

### 5.6 SVGs de paneles

Los 7 paneles SVG se cargan como imágenes. No deberían tener problemas en WebView.

### 5.7 Touch gestures

La app ya tiene soporte completo de touch (pinch zoom, pan, knob dragging) en `viewportNavigation.js` y `quickbar.js`. Funcionará en móvil directamente.

### 5.8 Rendimiento DSP en móvil

Los dispositivos móviles tienen CPUs menos potentes que escritorio. Los 7 AudioWorklet processors corren en un hilo de audio dedicado.

**Posibles optimizaciones** si hay problemas:
- Reducir número de osciladores activos simultáneos
- Usar buffer size más grande (mayor latencia, menos CPU)
- Desactivar worklets de scope/recording cuando no se usen
- El bypass de filtros (`filterBypassEnabled`) ya existe y ayuda

---

## 6. Plugins Capacitor recomendados

### Oficiales (mantenidos por Ionic/OutSystems)

| Plugin | Propósito en SynthiGME |
|---|---|
| `@capacitor/screen-orientation` | Forzar landscape (sustituye portraitBlocker.js) |
| `@capacitor/splash-screen` | Splash screen nativo al arrancar |
| `@capacitor/status-bar` | Ocultar/configurar barra de estado |
| `@capacitor/app` | Eventos de lifecycle (background/foreground) |

### Comunidad (mantenidos activamente)

| Plugin | Propósito en SynthiGME |
|---|---|
| `@capacitor-community/keep-awake` | Wake lock nativo (iOS + Android) |

### Custom (a desarrollar)

| Plugin | Propósito | Complejidad |
|---|---|---|
| **OSC UDP** | Comunicación OSC nativa sin bridge | ~300 líneas (Java + Swift) |
| **iOS Audio Session** | Configurar AVAudioSession | ~100 líneas Swift |

---

## 7. Flujo de builds completo (propuesto)

| Flujo | Pipeline | Salida | Comando |
|---|---|---|---|
| **Web (PWA)** | `src/` → `docs/` | GitHub Pages | `build:web` |
| **Electron Linux** | `src/` → `dist-app/` → `dist-electron/` | AppImage | `build:electron:linux` |
| **Electron Windows** | `src/` → `dist-app/` → `dist-electron/` | exe/msi | `build:electron:win` |
| **Android** | `src/` → `docs/` → `android/` | APK | `build:web` + `cap sync` |
| **iOS** | `src/` → `docs/` → `ios/` | IPA | `build:web` + `cap sync` |

> **Nota**: `android/` e `ios/` son proyectos nativos generados por Capacitor. Se commitean al repo (como recomienda la documentación de Capacitor) para reproducibilidad. Los cambios en la web se sincronizan con `cap sync`.

---

## 8. Pasos para empezar (cuando se decida)

### Requisitos previos

| Plataforma | Requisitos |
|---|---|
| **Android** | Android Studio, JDK 17+, Android SDK (API 22+) |
| **iOS** | macOS, Xcode 15+, CocoaPods |

### Comandos iniciales

```bash
# 1. Instalar Capacitor
npm i @capacitor/core
npm i -D @capacitor/cli

# 2. Inicializar
npx cap init SynthiGME com.synthigme.app --web-dir=docs

# 3. Añadir plataformas
npm i @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios

# 4. Build y sincronizar
npm run build:web
npx cap sync

# 5. Abrir en IDE nativo
npx cap open android   # Android Studio
npx cap open ios       # Xcode

# 6. Instalar plugins útiles
npm i @capacitor/screen-orientation @capacitor/splash-screen
npm i @capacitor-community/keep-awake
npx cap sync
```

### Detección de plataforma en el código web

```javascript
// Patrón existente para Electron:
if (window.electronAPI) { /* funcionalidad Electron */ }

// Patrón análogo para Capacitor:
if (window.Capacitor) { /* funcionalidad móvil nativa */ }

// Detección general:
const platform = window.electronAPI ? 'electron' 
               : window.Capacitor ? 'capacitor'
               : 'web';
```

---

## 9. Estrategia recomendada por fases

| Fase | Acción | Objetivo |
|---|---|---|
| **Fase 0** (actual) | Este documento de investigación | Evaluar opciones |
| **Fase 1** | Setup Capacitor básico + build Android | Verificar que AudioWorklet, touch y UI funcionan |
| **Fase 2** | Plugins de orientación, wake lock, splash | UX nativa mínima |
| **Fase 3** | Pruebas iOS (requiere Mac) | Verificar WKWebView, audio session |
| **Fase 4** | OSC (vía bridge WebSocket primero) | Funcionalidad OSC en móvil sin código nativo |
| **Fase 5** | Plugin nativo OSC (opcional) | OSC autónomo en móvil |
| **Fase 6** | Publicación en stores | Google Play y App Store |

### Prioridad: Android primero

- **Android no requiere Mac** — se puede desarrollar en Linux
- **WebView Android** es Chrome (más compatible)
- **Google Play** es menos restrictivo con apps WebView
- **APK directo** para testeo sin pasar por store

---

## 10. ¿Apple App Store aceptará la app?

Apple es conocida por rechazar apps que son "simplemente un WebView". Sin embargo:

- SynthiGME **no es un sitio web empaquetado** — es un sintetizador interactivo con AudioWorklet DSP
- La app usa **plugins nativos** (audio session, orientación, wake lock)
- Hay precedentes de apps de audio profesionales basadas en web (ej: Soundtrap)
- La clave es que la app **no sea sustituible por un bookmark** — SynthiGME claramente no lo es

**Recomendación**: En la descripción del App Store, enfatizar que es un instrumento musical con motor de síntesis, no una "página web".

---

## Referencias

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Capacitor Plugins](https://capacitorjs.com/docs/plugins)
- [Tauri v2 Mobile](https://tauri.app/guides/mobile/)
- [AudioWorklet - CanIUse](https://caniuse.com/mdn-api_audioworklet)
- [Web Audio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [ARCHITECTURE.md](ARCHITECTURE.md) — Arquitectura del proyecto
- [OSC-BROWSER-RESEARCH.md](OSC-BROWSER-RESEARCH.md) — OSC en navegador y móvil

---

## Historial

| Fecha | Cambios |
|-------|---------|
| 2026-02-09 | Documento inicial — investigación de opciones de compilación móvil |
