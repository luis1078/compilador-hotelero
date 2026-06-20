# Compilador Hotelero — Interfaz Web (React + Vite)

Frontend que ejecuta el compilador hotelero **directamente en el navegador**.
Toda la lógica (léxico, sintáctico y semántico) sigue en **C++ compilado a
WebAssembly** — aquí no se reimplementa nada en JS/TS: solo se carga el módulo
WASM y se llama a `analizarSentencia(input)`.

## Arquitectura

```
textarea (React)
      │  input: string
      ▼
window.createCompilerModule()      ← /wasm/compiler.js  (Emscripten + Embind)
      │
      ▼
Module.analizarSentencia(input)    ← compiler.wasm  (lexer + parser + semantic en C++)
      │  output: JSON (string)
      ▼
render de tokens, reglas y veredicto
```

- `public/wasm/compiler.js` y `public/wasm/compiler.wasm` son los artefactos
  generados por Emscripten. Vite los sirve tal cual en `/wasm/...`.
- `src/wasmCompiler.js` inyecta `/wasm/compiler.js` como `<script>` y memoiza la
  instancia del módulo (se carga una sola vez).
- `src/App.jsx` es la interfaz: textarea, botón **Analizar**, ejemplos y el
  render del resultado.

## Ejecutar localmente

Requiere Node 18+ (probado con Node 22).

```bash
cd web
npm install
npm run dev
```

Abre la URL que muestra Vite (por defecto <http://localhost:5173>).

## Actualizar el WASM tras recompilar el C++

Si cambias `lexer.cpp`, `parser.cpp`, `semantic.cpp` o `compiler_api.cpp`,
recompila el WASM desde la raíz del repo (ver `../README_WASM.md`):

```bash
# Windows
.\build_wasm.ps1
# Linux / macOS / Git Bash
./build_wasm.sh
```

Ambos scripts copian automáticamente `compiler.js` y `compiler.wasm` a
`public/wasm/` al finalizar un build exitoso — ya no hace falta copiarlos a
mano.

## Build de producción

```bash
npm run build      # genera web/dist/
npm run preview    # sirve web/dist/ para verificar localmente
```

Vite copia automáticamente `public/wasm/` a `dist/wasm/`.

## Desplegar en Vercel

El proyecto C++ vive en la raíz del repo y la web en la subcarpeta `web/`, así
que hay que indicarle a Vercel que el proyecto está en `web/`:

### Opción A — Dashboard de Vercel
1. **Add New → Project** e importa este repositorio de GitHub.
2. En **Root Directory** selecciona `web`.
3. Framework Preset: **Vite** (se autodetecta).
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. **Deploy**.

### Opción B — Vercel CLI
```bash
npm i -g vercel
cd web
vercel            # primer deploy (preview); responde "web" como root si lo pide
vercel --prod     # deploy a producción
```

> Vercel sirve los `.wasm` con el MIME correcto (`application/wasm`)
> automáticamente; no se requiere configuración extra.

## Notas

- Los datos `data/clientes.txt` y `data/reservas.txt` están **incrustados dentro
  del `.wasm`** (vía `--embed-file`), por lo que el frontend no necesita
  cargarlos ni servirlos por separado.
- El módulo WASM se precarga al montar la app, de modo que el primer análisis es
  instantáneo.
