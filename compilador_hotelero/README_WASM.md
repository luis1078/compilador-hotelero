# Compilador Hotelero — Build WebAssembly (Emscripten + Embind)

Adapta el compilador C++ (léxico, sintáctico y semántico) para usarse desde
JavaScript/React mediante WebAssembly, **sin reescribir la lógica**:
`lexer.cpp`, `parser.cpp` y `semantic.cpp` se mantienen intactos.

## Archivos clave

| Archivo            | Rol                                                                 |
|--------------------|---------------------------------------------------------------------|
| `compiler_api.cpp` | Puente Embind. Expone `analizarSentencia(string) -> string (JSON)`. |
| `build_wasm.ps1`   | Script de compilación para Windows / PowerShell.                    |
| `build_wasm.sh`    | Script de compilación para Linux / macOS / Git Bash / WSL.          |
| `dist/compiler.js` | Salida generada: módulo glue de Emscripten.                         |
| `dist/compiler.wasm` | Salida generada: binario WebAssembly.                             |

> Nota: `main.cpp` (modo consola/interactivo) **no** se incluye en el build WASM.
> Los datos `data/clientes.txt` y `data/reservas.txt` se **incrustan** en el binario
> con `--embed-file`, así que no hay que servirlos por separado.

## Requisitos

Instalar el SDK de Emscripten (provee `emcc`):
<https://emscripten.org/docs/getting_started/downloads.html>

Activar en cada sesión de terminal:

```powershell
# Windows
.\emsdk_env.bat
```
```bash
# Linux / macOS
source ./emsdk_env.sh
```

## Compilar

```powershell
# Windows
.\build_wasm.ps1
```
```bash
# Linux / macOS / Git Bash
./build_wasm.sh
```

Ambos ejecutan el mismo comando `emcc` y producen `dist/compiler.js` + `dist/compiler.wasm`.

### Comando `emcc` equivalente (referencia)

```bash
emcc src/lexer.cpp src/parser.cpp src/semantic.cpp compiler_api.cpp \
  -I src -std=c++17 -O2 --bind \
  --embed-file data/clientes.txt@data/clientes.txt \
  --embed-file data/reservas.txt@data/reservas.txt \
  -s MODULARIZE=1 -s EXPORT_NAME=createCompilerModule \
  -s ENVIRONMENT=web -s ALLOW_MEMORY_GROWTH=1 \
  -o dist/compiler.js
```

## Uso desde JavaScript

El build es modularizado (`MODULARIZE=1`), por lo que `compiler.js` exporta una
fábrica asíncrona `createCompilerModule`:

```js
import createCompilerModule from "./dist/compiler.js";

const Module = await createCompilerModule();
const json = Module.analizarSentencia(
  "RESERVAR HABITACION DOBLE PARA CLIENTE CLI001 DESDE 15/06/2026 HASTA 20/06/2026"
);
const resultado = JSON.parse(json);
console.log(resultado.resultadoFinal.valido);
```

## Forma del JSON devuelto

```jsonc
{
  "entrada": "RESERVAR ...",
  "lexico":     { "ok": true,  "errores": 0, "tokens": [ { "col": 1, "tipo": "RESERVAR", "lexema": "RESERVAR" } ] },
  "sintactico": { "ok": true,  "errores": 0, "evaluado": true },
  "semantico":  { "ok": false, "errores": 1, "evaluado": true,
                  "reglas": [ { "codigo": "RS03", "ok": false, "mensaje": "..." } ] },
  "resultadoFinal": { "valido": false, "mensaje": "INVALIDO (errores semanticos)" }
}
```

Las fases hacen cortocircuito: si el léxico falla, `sintactico`/`semantico`
llevan `"evaluado": false`; igual si falla el sintáctico se omite el semántico.
