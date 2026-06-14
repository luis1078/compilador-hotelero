// ============================================================
//  wasmCompiler.js — Carga el modulo C++/WebAssembly del compilador
//
//  El binario fue generado con Emscripten + Embind:
//    MODULARIZE=1, EXPORT_NAME=createCompilerModule
//
//  compiler.js es un script clasico que define el global
//  `createCompilerModule` y localiza compiler.wasm relativo a su
//  propia URL (/wasm/compiler.wasm). Por eso lo inyectamos como
//  <script> apuntando a /wasm/compiler.js en lugar de importarlo
//  con el bundler (asi NO lo procesa Vite y el .wasm se resuelve solo).
// ============================================================

const WASM_JS_URL = "/wasm/compiler.js";

let modulePromise = null; // memoiza la instancia: se carga una sola vez

// Inyecta /wasm/compiler.js y resuelve cuando `createCompilerModule` existe.
function loadScript() {
  return new Promise((resolve, reject) => {
    if (window.createCompilerModule) {
      resolve(window.createCompilerModule);
      return;
    }
    const script = document.createElement("script");
    script.src = WASM_JS_URL;
    script.async = true;
    script.onload = () => {
      if (window.createCompilerModule) {
        resolve(window.createCompilerModule);
      } else {
        reject(new Error("compiler.js cargo pero no expuso createCompilerModule"));
      }
    };
    script.onerror = () =>
      reject(new Error(`No se pudo cargar ${WASM_JS_URL}`));
    document.body.appendChild(script);
  });
}

// Devuelve (y memoiza) la instancia del modulo WASM ya inicializada.
export function getCompiler() {
  if (!modulePromise) {
    modulePromise = loadScript().then((factory) => factory());
  }
  return modulePromise;
}
