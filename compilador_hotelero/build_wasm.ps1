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

if ($LASTEXITCODE -ne 0) {
    Write-Host "Fallo la compilacion (codigo $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "OK -> $OutDir/compiler.js  +  $OutDir/compiler.wasm" -ForegroundColor Green

# Copia los artefactos al frontend, que es desde donde Vite los sirve
# (web/public/wasm/). Asi no hace falta copiarlos a mano tras cada build.
$WebWasmDir = "web/public/wasm"
try {
    if (-not (Test-Path $WebWasmDir)) {
        New-Item -ItemType Directory -Path $WebWasmDir -Force | Out-Null
    }
    Copy-Item "$OutDir/compiler.js"   "$WebWasmDir/compiler.js"   -Force
    Copy-Item "$OutDir/compiler.wasm" "$WebWasmDir/compiler.wasm" -Force
    Write-Host "OK -> copiado a $WebWasmDir/compiler.js + compiler.wasm" -ForegroundColor Green
} catch {
    Write-Host "Fallo al copiar a $WebWasmDir : $_" -ForegroundColor Red
    exit 1
}
