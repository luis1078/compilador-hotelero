# Compilador de Reservas Hoteleras — C++ / WebAssembly

**Curso:** Compiladores — Universidad San Ignacio de Loyola (2026-1)
**Carrera:** Ingeniería de Software

Compilador completo para un lenguaje de dominio específico de reservas hoteleras.
Implementa las tres fases de análisis (léxico, sintáctico y semántico) en C++17 y
las expone en el navegador vía WebAssembly, sin reimplementar nada en JavaScript.

---

## El lenguaje

Tres tipos de sentencia, en mayúsculas y sin ambigüedad:

```
RESERVAR HABITACION DOBLE PARA CLIENTE CLI001 DESDE 15/06/2026 HASTA 20/06/2026
CANCELAR RESERVA RES0042
CONSULTAR DISPONIBILIDAD SUITE DESDE 01/07/2026 HASTA 05/07/2026
```

---

## Arquitectura

```
        entrada: string
              │
              ▼
    ┌───────────────────┐
    │  Lexer (AFD)      │  → vector<Token>
    └───────────────────┘
              │  corta si hay error léxico
              ▼
    ┌───────────────────┐
    │  Parser LL(1)     │  → NodoAST
    └───────────────────┘
              │  corta si hay error sintáctico
              ▼
    ┌───────────────────┐
    │  Semantic (RS01-  │  → vector<ResultadoRegla>
    │  RS05)            │
    └───────────────────┘
              │
              ▼
      veredicto + JSON
```

Las fases hacen cortocircuito: si el léxico falla, el sintáctico y el semántico
no se evalúan y quedan marcados con `"evaluado": false`.

---

## Fase 1 — Análisis léxico

AFD implementado a mano, sin generadores. 24 tipos de token agrupados en cuatro
categorías léxicas:

| Categoría | Patrón | Ejemplo |
| --- | --- | --- |
| Palabras clave / identificadores | `[A-Z][A-Z0-9]*` + lookup | `RESERVAR`, `CLI001`, `RES0042` |
| Fechas | `DD/MM/AAAA` | `15/06/2026` |
| Enteros positivos | `[1-9][0-9]*` | `3` |
| Cadenas | `"..."` | `"Juan Perez"` |

Los identificadores se resuelven con la misma estrategia que un lexer real: el
AFD acepta la forma general y después `classifyWord()` decide si el lexema es
palabra reservada o identificador de usuario. Cada error léxico se reporta con
su columna y no detiene el escaneo.

**Tokens del lenguaje:** 13 palabras clave (`RESERVAR`, `CANCELAR`, `CONSULTAR`,
`DISPONIBILIDAD`, `HABITACION`, `CLIENTE`, `RESERVA`, `PARA`, `DESDE`, `HASTA`,
`NOCHES`, `TIPO`, `FECHA`), 4 tipos de habitación, 5 literales y 2 especiales.

---

## Fase 2 — Análisis sintáctico

Parser descendente recursivo LL(1), una función por producción:

| Regla | Producción |
| --- | --- |
| P1 | `S → sentencia` |
| P2 | `sentencia → sent_reserva \| sent_cancelacion \| sent_consulta` |
| P3 | `sent_reserva → RESERVAR HABITACION tipo_hab PARA CLIENTE id_cliente DESDE fecha HASTA fecha` |
| P4 | `sent_cancelacion → CANCELAR RESERVA id_reserva` |
| P5 | `sent_consulta → CONSULTAR DISPONIBILIDAD tipo_hab DESDE fecha HASTA fecha` |
| P6 | `tipo_hab → SIMPLE \| DOBLE \| SUITE \| PRESIDENCIAL` |
| P7 | `id_cliente → ID_CLIENTE` |
| P8 | `id_reserva → ID_RESERVA` |
| P9 | `fecha → FECHA` |

El AST se construye en paralelo al parseo mediante un scope RAII (`NodoScope`):
abre un nivel de la pila al entrar a cada `parseXxx()` y lo cierra en el
destructor. Así el árbol queda balanceado aunque la función retorne por
cualquiera de sus caminos de error, sin ensuciar el flujo de control con
`goto` ni try/catch.

---

## Fase 3 — Análisis semántico

Cinco reglas validadas contra el estado del sistema, cargado desde archivos
planos (`data/clientes.txt`, `data/reservas.txt`):

| Código | Regla |
| --- | --- |
| RS01 | La fecha de salida es posterior a la de entrada |
| RS02 | Ninguna fecha está en el pasado |
| RS03 | Hay habitación disponible del tipo pedido en ese rango |
| RS04 | El ID de cliente existe en el sistema |
| RS05 | El ID de reserva existe y está activa (para cancelaciones) |

Cada regla devuelve un `ResultadoRegla` con código, estado y mensaje, de modo
que la salida indica exactamente qué falló y por qué, no solo que la sentencia
es inválida.

---

## Interfaz web

El mismo C++ compilado a WebAssembly con Emscripten y Embind, servido por una
SPA en React + Vite. `compiler_api.cpp` expone un único punto de entrada,
`analizarSentencia(string) → string (JSON)`, y `lexer.cpp`, `parser.cpp` y
`semantic.cpp` se compilan sin modificarse.

Los archivos de datos se incrustan en el binario con `--embed-file`, así que no
hay backend ni peticiones de red: todo el análisis corre en el navegador.

La interfaz muestra:

- Tabla de tokens con columna, tipo y lexema
- Diagramas AFND y AFD por categoría léxica, renderizados con Graphviz (`@viz-js/viz`)
- Tabla de transiciones de cada AFD
- Recorrido del autómata para cada token reconocido, estado por estado
- Árbol sintáctico navegable, etiquetado con la regla de producción aplicada
- Resultado de las cinco reglas semánticas
- Exportación del análisis completo a PDF (`jspdf`)

---

## Estructura del proyecto

```
compilador_hotelero/
├── src/
│   ├── token.h              # 24 tipos de token
│   ├── lexer.h/.cpp         # AFD manual
│   ├── parser.h/.cpp        # descendente recursivo LL(1)
│   ├── ast.h                # nodo del árbol sintáctico
│   ├── semantic.h/.cpp      # reglas RS01–RS05
│   └── main.cpp             # ejecutable de consola
├── compiler_api.cpp         # puente Embind → JSON
├── build_wasm.sh / .ps1     # compilación a WASM
├── data/
│   ├── clientes.txt
│   └── reservas.txt
├── tests/
│   ├── casos_prueba.txt     # casos válidos y con error
│   └── pruebas_formales.txt # PF-01 a PF-15, trazadas a OE1–OE5
└── web/                     # SPA React + Vite
    ├── public/wasm/         # compiler.js + compiler.wasm
    └── src/
        ├── App.jsx
        ├── wasmCompiler.js  # carga y memoiza el módulo
        ├── AutomataGraph.jsx / automataDot.js
        ├── AstGraph.jsx / astDot.js
        └── pdfExport.js
```

---

## Compilar y ejecutar

### Consola (C++)

Abrir `compilador_hotelero.sln` en Visual Studio y compilar, o directamente:

```bash
g++ -std=c++17 -I src src/*.cpp -o compilador
./compilador
```

### Web (WebAssembly)

Requiere el SDK de Emscripten y Node 18+.

```bash
# 1. Activar Emscripten
source /ruta/a/emsdk/emsdk_env.sh

# 2. Compilar a WASM (genera dist/ y copia a web/public/wasm/)
cd compilador_hotelero
./build_wasm.sh          # o .\build_wasm.ps1 en Windows

# 3. Levantar la interfaz
cd web
npm install
npm run dev
```

Vite sirve en `http://localhost:5173`.

---

## Pruebas

`tests/pruebas_formales.txt` contiene 15 casos (PF-01 a PF-15) trazados a los
objetivos específicos del proyecto: cobertura de tokens, cobertura de la
gramática, las cinco reglas semánticas, detección de errores léxicos y casos
mixtos de integración que verifican el cortocircuito entre fases.

---

## Tecnologías

C++17 · Emscripten / Embind · WebAssembly · React 18 · Vite 6 · Graphviz (@viz-js/viz) · jsPDF
