/**
 * Genera un informe de requisitos mínimos para las compilaciones Electron
 * 
 * Ejecutar: node scripts/release/generate-requirements.mjs
 * 
 * El informe se genera junto a cada compilación en dist-electron/
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Leer versión del proyecto
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));

// Obtener versión de Electron
const electronVersion = pkg.devDependencies?.electron?.replace('^', '') || 'unknown';

// Requisitos base de Electron 40.x (basado en Chromium 134)
const ELECTRON_REQUIREMENTS = {
  // Basado en https://github.com/electron/electron/blob/main/README.md
  platforms: {
    linux: {
      name: 'Linux',
      minVersion: 'Ubuntu 18.04+ / Fedora 32+ / Debian 10+',
      arch: ['x64', 'arm64'],
      notes: 'Requiere GTK 3, libnotify, libnss3, libxss1, libxtst6'
    },
    win: {
      name: 'Windows',
      minVersion: 'Windows 10+',
      arch: ['x64', 'ia32', 'arm64'],
      notes: 'Windows 7/8/8.1 no soportados desde Electron 23'
    },
    mac: {
      name: 'macOS',
      minVersion: 'macOS 12 (Monterey)+',
      arch: ['x64', 'arm64'],
      notes: 'Binarios Universal disponibles para Intel y Apple Silicon'
    }
  },
  
  // Requisitos de hardware (mínimos recomendados para Web Audio)
  hardware: {
    ram: {
      minimum: '512 MB',
      recommended: '2 GB',
      notes: 'Más RAM permite más patches complejos y polifonía'
    },
    disk: {
      appSize: '~120 MB',
      notes: 'Espacio adicional para patches del usuario'
    },
    cpu: {
      minimum: 'Dual-core x86_64',
      recommended: 'Quad-core x86_64',
      notes: 'AudioWorklet se beneficia de múltiples núcleos'
    },
    audio: {
      required: 'Dispositivo de audio compatible',
      notes: 'ALSA/PulseAudio/PipeWire (Linux), WASAPI (Windows), CoreAudio (macOS)'
    }
  },
  
  // Requisitos específicos de SynthiGME
  app: {
    webgl: 'Recomendado para visualización del osciloscopio',
    latency: 'Recomendado: Interfaz de audio con <10ms de latencia',
    sampleRate: 'Soporta 44100Hz, 48000Hz y otras frecuencias estándar'
  }
};

/**
 * Obtiene el tamaño de los artifacts generados
 */
function getArtifactSizes(distDir) {
  const sizes = {};
  
  if (!existsSync(distDir)) {
    return sizes;
  }
  
  const files = readdirSync(distDir);
  
  for (const file of files) {
    const filePath = join(distDir, file);
    const stat = statSync(filePath);
    
    if (stat.isFile() && !file.endsWith('.yaml') && !file.endsWith('.yml')) {
      const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
      sizes[file] = `${sizeMB} MB`;
    }
  }
  
  return sizes;
}

/**
 * Genera el informe en formato Markdown
 */
function generateMarkdownReport() {
  const distDir = join(projectRoot, 'dist-electron');
  const artifactSizes = getArtifactSizes(distDir);
  
  const now = new Date().toISOString().split('T')[0];
  
  let report = `# SynthiGME - Requisitos del Sistema

**Versión:** ${pkg.version}  
**Electron:** ${electronVersion}  
**Generado:** ${now}

---

## Sistemas Operativos Soportados

### Linux
- **Versión mínima:** ${ELECTRON_REQUIREMENTS.platforms.linux.minVersion}
- **Arquitecturas:** ${ELECTRON_REQUIREMENTS.platforms.linux.arch.join(', ')}
- **Notas:** ${ELECTRON_REQUIREMENTS.platforms.linux.notes}

### Windows
- **Versión mínima:** ${ELECTRON_REQUIREMENTS.platforms.win.minVersion}
- **Arquitecturas:** ${ELECTRON_REQUIREMENTS.platforms.win.arch.join(', ')}
- **Notas:** ${ELECTRON_REQUIREMENTS.platforms.win.notes}

### macOS
- **Versión mínima:** ${ELECTRON_REQUIREMENTS.platforms.mac.minVersion}
- **Arquitecturas:** ${ELECTRON_REQUIREMENTS.platforms.mac.arch.join(', ')}
- **Notas:** ${ELECTRON_REQUIREMENTS.platforms.mac.notes}

---

## Requisitos de Hardware

### Memoria RAM
- **Mínimo:** ${ELECTRON_REQUIREMENTS.hardware.ram.minimum}
- **Recomendado:** ${ELECTRON_REQUIREMENTS.hardware.ram.recommended}
- ${ELECTRON_REQUIREMENTS.hardware.ram.notes}

### Procesador
- **Mínimo:** ${ELECTRON_REQUIREMENTS.hardware.cpu.minimum}
- **Recomendado:** ${ELECTRON_REQUIREMENTS.hardware.cpu.recommended}
- ${ELECTRON_REQUIREMENTS.hardware.cpu.notes}

### Espacio en Disco
- **Tamaño de aplicación:** ${ELECTRON_REQUIREMENTS.hardware.disk.appSize}
- ${ELECTRON_REQUIREMENTS.hardware.disk.notes}

### Audio
- **Requerido:** ${ELECTRON_REQUIREMENTS.hardware.audio.required}
- ${ELECTRON_REQUIREMENTS.hardware.audio.notes}

---

## Requisitos Específicos de SynthiGME

- **WebGL:** ${ELECTRON_REQUIREMENTS.app.webgl}
- **Latencia:** ${ELECTRON_REQUIREMENTS.app.latency}
- **Sample Rate:** ${ELECTRON_REQUIREMENTS.app.sampleRate}

---

## Tamaño de los Binarios

`;

  if (Object.keys(artifactSizes).length > 0) {
    report += '| Archivo | Tamaño |\n|---------|--------|\n';
    for (const [file, size] of Object.entries(artifactSizes)) {
      report += `| ${file} | ${size} |\n`;
    }
  } else {
    report += '*No se encontraron binarios compilados. Ejecuta `npm run electron:build:all` primero.*\n';
  }

  report += `
---

## Notas Adicionales

### Linux
Para ejecutar el AppImage en distribuciones basadas en GTK3:
\`\`\`bash
# Dar permisos de ejecución
chmod +x SynthiGME-${pkg.version}-x64.AppImage

# Ejecutar
./SynthiGME-${pkg.version}-x64.AppImage
\`\`\`

### Windows
El instalador NSIS permite elegir la ubicación de instalación.
La versión portable no requiere instalación.

### Rendimiento de Audio
Para mejor rendimiento de audio en tiempo real:
- Cierra otras aplicaciones que usen audio
- En Linux, considera usar una configuración de kernel de baja latencia
- Usa interfaces de audio USB/PCIe en lugar del audio integrado

---

*Este documento se genera automáticamente con \`node scripts/release/generate-requirements.mjs\`*
`;

  return report;
}

/**
 * Genera el informe en formato JSON (para consumo programático)
 */
function generateJSONReport() {
  const distDir = join(projectRoot, 'dist-electron');
  const artifactSizes = getArtifactSizes(distDir);
  
  return {
    app: {
      name: 'SynthiGME',
      version: pkg.version,
      electronVersion,
      generatedAt: new Date().toISOString()
    },
    requirements: ELECTRON_REQUIREMENTS,
    artifacts: artifactSizes
  };
}

// Main
const distDir = join(projectRoot, 'dist-electron');

// Generar informe Markdown
const mdReport = generateMarkdownReport();
const mdPath = join(distDir, 'REQUIREMENTS.md');

// Crear directorio si no existe
if (!existsSync(distDir)) {
  console.log('⚠️  Directorio dist-electron/ no existe. Creando...');
  execSync(`mkdir -p "${distDir}"`);
}

writeFileSync(mdPath, mdReport, 'utf-8');
console.log(`✅ Informe generado: ${mdPath}`);

// Generar JSON también
const jsonReport = generateJSONReport();
const jsonPath = join(distDir, 'requirements.json');
writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
console.log(`✅ JSON generado: ${jsonPath}`);

// Mostrar resumen
console.log('\n📋 Resumen de requisitos:');
console.log(`   • SO: Linux (Ubuntu 18.04+), Windows 10+, macOS 12+`);
console.log(`   • RAM: 512 MB mín / 2 GB recomendado`);
console.log(`   • Disco: ~120 MB`);
console.log(`   • Audio: Requerido (ALSA/PulseAudio/PipeWire/WASAPI/CoreAudio)`);
