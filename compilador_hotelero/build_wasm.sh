#!/usr/bin/env bash
# ============================================================
#  build_wasm.sh — Compila el compilador hotelero a WebAssembly
#
#  Requiere el SDK de Emscripten activo en el PATH (emcc).
#    Instalacion: https://emscripten.org/docs/getting_started/downloads.html
#    Luego, en cada sesion:  source ./emsdk_env.sh
#
#  Genera:  dist/compiler.js  +  dist/compiler.wasm
#  Uso:     ./build_wasm.sh
# ============================================================
set -e

OUT_DIR="dist"
mkdir -p "$OUT_DIR"

echo "Compilando compilador hotelero a WebAssembly..."

emcc \
  src/lexer.cpp \
  src/parser.cpp \
  src/semantic.cpp \
  compiler_api.cpp \
  -I src \
  -std=c++17 \
  -O2 \
  --bind \
  --embed-file data/clientes.txt@data/clientes.txt \
  --embed-file data/reservas.txt@data/reservas.txt \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createCompilerModule \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -o "$OUT_DIR/compiler.js"

echo "OK -> $OUT_DIR/compiler.js  +  $OUT_DIR/compiler.wasm"

# Copia los artefactos al frontend, que es desde donde Vite los sirve
# (web/public/wasm/). Asi no hace falta copiarlos a mano tras cada build.
WEB_WASM_DIR="web/public/wasm"
mkdir -p "$WEB_WASM_DIR"
if cp "$OUT_DIR/compiler.js" "$OUT_DIR/compiler.wasm" "$WEB_WASM_DIR/"; then
    echo "OK -> copiado a $WEB_WASM_DIR/compiler.js + compiler.wasm"
else
    echo "Fallo al copiar a $WEB_WASM_DIR" >&2
    exit 1
fi
