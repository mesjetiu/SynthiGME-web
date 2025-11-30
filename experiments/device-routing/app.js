const requestAccessBtn = document.getElementById('requestAccessBtn');
const refreshBtn = document.getElementById('refreshBtn');
const inputSelect = document.getElementById('inputSelect');
const outputSelect = document.getElementById('outputSelect');
const monitorInputBtn = document.getElementById('monitorInputBtn');
const testToneBtn = document.getElementById('testToneBtn');
const statusEl = document.getElementById('status');
const inputMonitorEl = document.getElementById('inputMonitor');
const testToneEl = document.getElementById('testTone');

let permissionStream = null;
let monitorStream = null;
let audioCtx = null;

const supportsSetSink = typeof testToneEl.setSinkId === 'function';

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'status error' : 'status ok';
}

async function requestAccess() {
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    refreshBtn.disabled = false;
    inputSelect.disabled = false;
    outputSelect.disabled = false;
    monitorInputBtn.disabled = false;
    testToneBtn.disabled = false;
    await refreshDevices();
    setStatus('Permiso concedido. Puedes elegir dispositivos.');
  } catch (err) {
    setStatus(`No se pudo obtener permiso: ${err.message}`, true);
  }
}

async function refreshDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    populateSelect(inputSelect, devices.filter(d => d.kind === 'audioinput'));
    populateSelect(outputSelect, devices.filter(d => d.kind === 'audiooutput'));
  } catch (err) {
    setStatus(`No se pudieron enumerar dispositivos: ${err.message}`, true);
  }
}

function populateSelect(selectEl, entries) {
  selectEl.innerHTML = '';
  if (!entries.length) {
    const opt = document.createElement('option');
    opt.textContent = 'Sin dispositivos';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }
  entries.forEach(entry => {
    const opt = document.createElement('option');
    opt.value = entry.deviceId;
    opt.textContent = entry.label || `${entry.kind} (${entry.deviceId})`;
    selectEl.appendChild(opt);
  });
  selectEl.disabled = false;
}

async function monitorInput() {
  if (!inputSelect.value) {
    setStatus('Selecciona primero una entrada.', true);
    return;
  }
  try {
    if (monitorStream) {
      monitorStream.getTracks().forEach(track => track.stop());
    }
    monitorStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: inputSelect.value } }
    });
    inputMonitorEl.srcObject = monitorStream;
    await inputMonitorEl.play();
    setStatus('Monitorizando la entrada seleccionada.');
  } catch (err) {
    setStatus(`No se pudo monitorizar la entrada: ${err.message}`, true);
  }
}

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

async function playTestTone() {
  if (!outputSelect.value) {
    setStatus('Selecciona primero una salida.', true);
    return;
  }
  ensureAudioContext();
  const oscillator = audioCtx.createOscillator();
  oscillator.frequency.value = 440;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.15;
  oscillator.connect(gain);
  const destination = audioCtx.createMediaStreamDestination();
  gain.connect(destination);
  testToneEl.srcObject = destination.stream;
  try {
    if (supportsSetSink) {
      await testToneEl.setSinkId(outputSelect.value);
    }
  } catch (err) {
    setStatus(`No se pudo fijar la salida: ${err.message}`, true);
    return;
  }
  oscillator.start();
  await testToneEl.play();
  setStatus('Sonando tono de prueba (desaparece en 2 s).');
  setTimeout(() => {
    oscillator.stop();
    oscillator.disconnect();
    gain.disconnect();
  }, 2000);
}

requestAccessBtn.addEventListener('click', requestAccess);
refreshBtn.addEventListener('click', refreshDevices);
monitorInputBtn.addEventListener('click', monitorInput);
testToneBtn.addEventListener('click', playTestTone);

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (!refreshBtn.disabled) {
      refreshDevices();
    }
  });
}

setStatus('Pulsa "Solicitar permiso" para comenzar.');

if (!supportsSetSink) {
  const warning = document.createElement('p');
  warning.className = 'warning';
  warning.textContent = 'Aviso: este navegador no soporta seleccionar la salida (setSinkId).';
  document.querySelector('main').prepend(warning);
}
