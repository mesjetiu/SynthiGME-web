// Módulo de detección y aplicación de versión de build

// Esta constante será sustituida por esbuild en el bundle de docs/.
// eslint-disable-next-line no-undef
const BUILD_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : '__BUILD_VERSION__';

/**
 * Aplica la versión a todos los elementos con clase panel-build-version.
 * @param {string} version - Versión a mostrar
 */
function applyBuildVersionToPanels(version) {
  const els = document.querySelectorAll('.panel-build-version');
  els.forEach(el => {
    el.textContent = `Versión ${version}`;
  });
}

/**
 * Detecta la versión del build y la aplica a los paneles.
 * En producción usa la versión inyectada por esbuild.
 * En desarrollo intenta leer package.json.
 */
export async function detectBuildVersion() {
  // Caso build (/docs): BUILD_VERSION ya viene inyectado por esbuild.
  if (BUILD_VERSION && BUILD_VERSION !== '__BUILD_VERSION__') {
    window.__synthBuildVersion = BUILD_VERSION;
    applyBuildVersionToPanels(BUILD_VERSION);
    return;
  }

  // Caso /src: usamos la version de package.json como referencia.
  try {
    const resp = await fetch('../package.json', { cache: 'no-store' });
    if (resp && resp.ok) {
      const pkg = await resp.json();
      if (pkg && pkg.version) {
        const label = `${pkg.version}-src`;
        window.__synthBuildVersion = label;
        applyBuildVersionToPanels(label);
      }
    }
  } catch {
    // Silenciar errores
  }
}
