/**
 * Mock de localStorage para tests en Node.js
 * 
 * Node.js v22+ incluye un localStorage global experimental que no funciona
 * sin --localstorage-file. Este mock reemplaza incondicionalmente
 * globalThis.localStorage con una implementación funcional en memoria.
 * 
 * Uso: import '../mocks/localStorage.mock.js'; (antes de importar módulos)
 */

const _data = {};

globalThis.localStorage = {
  getItem(key) { return _data[key] ?? null; },
  setItem(key, value) { _data[key] = String(value); },
  removeItem(key) { delete _data[key]; },
  clear() { Object.keys(_data).forEach(k => delete _data[k]); },
  get length() { return Object.keys(_data).length; },
  key(index) { return Object.keys(_data)[index] ?? null; }
};
