# ============================================================
#  build_wasm.ps1 — Compila el compilador hotelero a WebAssembly
#
#  Requiere el SDK de Emscripten activo en el PATH (emcc).
#    Instalacion: https://emscripten.org/docs/getting_started/downloads.html
#    Luego, en cada sesion:  emsdk_env.bat  (o emsdk activate latest)
#
#  Genera:  dist/compiler.js  +  dist/compiler.wasm
#  Uso:     .\build_wasm.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# Carpeta de salida
$OutDir = "dist"
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

Write-Host "Compilando compilador hotelero a WebAssembly..." -ForegroundColor Cyan

emcc `
  src/lexer.cpp `
  src/parser.cpp `
  src/semantic.cpp `
  compiler_api.cpp `
  -I src `
  -std=c++17 `
  -O2 `
  --bind `
  --embed-file data/clientes.txt@data/clientes.txt `
  --embed-file data/reservas.txt@data/reservas.txt `
  -s MODULARIZE=1 `
  -s "EXPORT_NAME=createCompilerModule" `
  -s ENVIRONMENT=web `
  -s ALLOW_MEMORY_GROWTH=1 `
  -o "$OutDir/compiler.js"

if ($LASTEXITCODE -eq 0) {
    Write-Host "OK -> $OutDir/compiler.js  +  $OutDir/compiler.wasm" -ForegroundColor Green
} else {
    Write-Host "Fallo la compilacion (codigo $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}
