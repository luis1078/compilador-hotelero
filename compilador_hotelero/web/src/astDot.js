// ============================================================
//  astDot.js — Convierte el AST del parser a DOT (Graphviz)
//
//  El parser (C++/WASM) ya entrega el AST en JSON, un nodo así:
//    { regla, simbolo, lexema, col, hijos: [...] }
//      - No terminal: `regla` no vacío  → label "P1 - S"
//      - Terminal:    `regla` vacío     → label 'FECHA\n"25/06/2026"'
//
//  Utilidades puras y reutilizables (no tocan lexer/parser/semántico):
//    - generateAstDot(ast, options)  → string DOT (árbol vertical TB)
//    - extractRuleSubtrees(ast)      → subárboles por regla aplicada
//    - resumenSintactico(ast)        → producción principal + reglas
// ============================================================

const FUENTE = "Helvetica,Arial,sans-serif";

// Tema oscuro (interfaz). Coherente con AFND/AFD.
export const TEMA_AST_OSCURO = {
  fondo: "transparent",
  relleno: "#0f172a", // fondo de los nodos
  noterminal: "#38bdf8", // borde celeste (reglas / no terminales)
  terminal: "#22c55e", // borde verde (terminales)
  textoNoterminal: "#e0f2fe",
  textoTerminal: "#dcfce7",
  arista: "#94a3b8",
  // ── Error sintáctico ──
  error: "#ef4444", // borde/arista rojos del punto de falla
  textoError: "#fee2e2",
  rellenoError: "#450a0a",
};

// Tema claro (reservado para exportar el AST al PDF sobre fondo blanco).
export const TEMA_AST_CLARO = {
  fondo: "white",
  relleno: "#f8fafc",
  noterminal: "#0284c7",
  terminal: "#15803d",
  textoNoterminal: "#0c4a6e",
  textoTerminal: "#14532d",
  arista: "#475569",
  error: "#b91c1c",
  textoError: "#7f1d1d",
  rellenoError: "#fee2e2",
};

// Escapa texto para usarlo dentro de comillas dobles en una etiqueta DOT.
function esc(texto) {
  return String(texto ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

// ¿Es un nodo no terminal (regla de producción)?
function esNoTerminal(nodo) {
  return !!(nodo && nodo.regla);
}

// Etiqueta de un nodo: "P1 - S" (no terminal) o 'FECHA\n"25/06/2026"' (terminal).
// Construye con `\\n` (salto de línea Graphviz) escapando solo las partes dinámicas.
function etiquetaNodo(nodo) {
  if (esNoTerminal(nodo)) {
    return `${esc(nodo.regla)} - ${esc(nodo.simbolo)}`;
  }
  // terminal: símbolo arriba y, si hay, el lexema entre comillas debajo
  if (nodo.lexema) {
    return `${esc(nodo.simbolo)}\\n\\"${esc(nodo.lexema)}\\"`;
  }
  return esc(nodo.simbolo);
}

// ¿El AST está vacío (parser no produjo nada útil)?
export function astVacio(ast) {
  return (
    !ast ||
    (!ast.regla && !ast.simbolo && (!ast.hijos || ast.hijos.length === 0))
  );
}

/**
 * Convierte un AST (o subárbol) a DOT de Graphviz, como árbol vertical.
 *
 * @param {object} ast - nodo raíz { regla, simbolo, lexema, hijos }
 * @param {object} [opciones]
 * @param {string} [opciones.nombre="AST"]
 * @param {object} [opciones.tema=TEMA_AST_OSCURO]
 * @returns {string|null} DOT, o null si el AST está vacío
 */
export function generateAstDot(ast, opciones = {}) {
  const { nombre = "AST", tema = TEMA_AST_OSCURO } = opciones;
  if (astVacio(ast)) return null;

  const lineas = [];
  lineas.push(`digraph ${nombre} {`);
  lineas.push("  rankdir=TB;");
  lineas.push(
    `  graph [bgcolor="${tema.fondo}", pad="0.3", nodesep="0.4", ranksep="0.6"];`
  );
  lineas.push(
    `  node [shape=box, style="rounded,filled", fillcolor="${tema.relleno}", fontname="${FUENTE}", fontsize=12];`
  );
  lineas.push(`  edge [color="${tema.arista}"];`);
  lineas.push("");

  const nodos = [];
  const aristas = [];
  let contador = 0;

  function recorrer(nodo) {
    const id = `n${contador++}`;
    const noTerminal = esNoTerminal(nodo);
    let color = noTerminal ? tema.noterminal : tema.terminal;
    const fontcolor = noTerminal ? tema.textoNoterminal : tema.textoTerminal;
    let fillcolor = tema.relleno;
    let penwidth = "";

    // Resaltado de ERROR sobre nodos EXISTENTES (sin nodos artificiales):
    // se cambia solo el borde/relleno; el label y el texto se mantienen.
    if (nodo.__errorNodo || nodo.__errorToken) {
      color = tema.error;
      fillcolor = tema.rellenoError;
      penwidth = ", penwidth=2";
    }

    nodos.push(
      `  ${id} [label="${etiquetaNodo(nodo)}", color="${color}", ` +
        `fontcolor="${fontcolor}", fillcolor="${fillcolor}"${penwidth}];`
    );

    for (const hijo of nodo.hijos ?? []) {
      const hijoId = recorrer(hijo);
      aristas.push(`  ${id} -> ${hijoId};`);
    }
    return id;
  }
  recorrer(ast);

  lineas.push(...nodos, "", ...aristas, "}");
  return lineas.join("\n");
}

/**
 * Recorre el AST y devuelve un subárbol por cada regla (nodo no terminal),
 * en orden de aplicación. Las reglas repetidas se numeran (#1, #2, ...).
 *
 * @param {object} ast
 * @returns {{ rule: string, tree: object }[]}
 */
export function extractRuleSubtrees(ast) {
  const encontrados = [];
  (function walk(n) {
    if (!n) return;
    if (esNoTerminal(n)) encontrados.push({ rule: `${n.regla} - ${n.simbolo}`, tree: n });
    (n.hijos ?? []).forEach(walk);
  })(ast);

  // Numerar las reglas que aparecen más de una vez (p.ej. "P9 - fecha #1/#2")
  const total = {};
  encontrados.forEach((e) => (total[e.rule] = (total[e.rule] || 0) + 1));
  const visto = {};
  return encontrados.map((e) => {
    if (total[e.rule] > 1) {
      visto[e.rule] = (visto[e.rule] || 0) + 1;
      return { ...e, rule: `${e.rule} #${visto[e.rule]}` };
    }
    return e;
  });
}

/**
 * Resumen de la Fase 2: producción principal y reglas aplicadas (en orden).
 *
 * @param {object} ast
 * @returns {{ produccionPrincipal: string|null, reglasAplicadas: string[] }}
 */
export function resumenSintactico(ast) {
  const reglasAplicadas = [];
  (function walk(n) {
    if (!n) return;
    if (esNoTerminal(n)) reglasAplicadas.push(n.regla);
    (n.hijos ?? []).forEach(walk);
  })(ast);

  // Producción principal: primer hijo no terminal de "sentencia" (sent_reserva,
  // sent_cancelacion, sent_consulta). Si no se encuentra, usa el símbolo raíz.
  let produccionPrincipal = ast?.simbolo ?? null;
  (function buscar(n) {
    if (!n) return false;
    if (n.simbolo === "sentencia") {
      const hijoNT = (n.hijos ?? []).find(esNoTerminal);
      if (hijoNT) produccionPrincipal = hijoNT.simbolo;
      return true;
    }
    return (n.hijos ?? []).some(buscar);
  })(ast);

  return { produccionPrincipal, reglasAplicadas };
}

// ============================================================
//  Error sintáctico: heurística, explicación y RESALTADO sobre
//  nodos EXISTENTES (sin inventar nodos "ERROR" en el árbol).
// ============================================================

const TIPOS_HAB = ["SIMPLE", "DOBLE", "SUITE", "PRESIDENCIAL"];

// Secuencia de tokens esperada por cada tipo de sentencia (la gramática
// LL(1) del parser). Cada paso: tipos válidos + la regla que lo contiene.
const SECUENCIAS = {
  RESERVAR: {
    regla: "P3",
    simbolo: "sent_reserva",
    pasos: [
      { tipos: ["RESERVAR"], regla: "P3", simbolo: "sent_reserva" },
      { tipos: ["HABITACION"], regla: "P3", simbolo: "sent_reserva" },
      { tipos: TIPOS_HAB, regla: "P6", simbolo: "tipo_hab" },
      { tipos: ["PARA"], regla: "P3", simbolo: "sent_reserva" },
      { tipos: ["CLIENTE"], regla: "P3", simbolo: "sent_reserva" },
      { tipos: ["ID_CLIENTE"], regla: "P7", simbolo: "id_cliente" },
      { tipos: ["DESDE"], regla: "P3", simbolo: "sent_reserva" },
      { tipos: ["FECHA"], regla: "P9", simbolo: "fecha" },
      { tipos: ["HASTA"], regla: "P3", simbolo: "sent_reserva" },
      { tipos: ["FECHA"], regla: "P9", simbolo: "fecha" },
    ],
  },
  CANCELAR: {
    regla: "P4",
    simbolo: "sent_cancelacion",
    pasos: [
      { tipos: ["CANCELAR"], regla: "P4", simbolo: "sent_cancelacion" },
      { tipos: ["RESERVA"], regla: "P4", simbolo: "sent_cancelacion" },
      { tipos: ["ID_RESERVA"], regla: "P8", simbolo: "id_reserva" },
    ],
  },
  CONSULTAR: {
    regla: "P5",
    simbolo: "sent_consulta",
    pasos: [
      { tipos: ["CONSULTAR"], regla: "P5", simbolo: "sent_consulta" },
      { tipos: ["DISPONIBILIDAD"], regla: "P5", simbolo: "sent_consulta" },
      { tipos: TIPOS_HAB, regla: "P6", simbolo: "tipo_hab" },
      { tipos: ["DESDE"], regla: "P5", simbolo: "sent_consulta" },
      { tipos: ["FECHA"], regla: "P9", simbolo: "fecha" },
      { tipos: ["HASTA"], regla: "P5", simbolo: "sent_consulta" },
      { tipos: ["FECHA"], regla: "P9", simbolo: "fecha" },
    ],
  },
};

// Explicación legible según el token esperado (req. 8/9/10/11).
const EXPLICACIONES = {
  RESERVAR: "La sentencia debe comenzar con RESERVAR, CANCELAR o CONSULTAR.",
  HABITACION: "Falta la palabra clave HABITACION después de RESERVAR.",
  PARA: "Falta la palabra clave PARA antes de CLIENTE.",
  CLIENTE:
    "Falta la palabra clave CLIENTE después de PARA, antes del identificador del cliente.",
  DESDE: "Falta la palabra clave DESDE antes de la fecha de entrada.",
  HASTA: "Falta la palabra clave HASTA antes de la fecha de salida.",
  RESERVA: "Falta la palabra clave RESERVA después de CANCELAR.",
  DISPONIBILIDAD: "Falta la palabra clave DISPONIBILIDAD después de CONSULTAR.",
  ID_CLIENTE: "Se esperaba el identificador del cliente (ej. CLI001).",
  ID_RESERVA: "Se esperaba el identificador de la reserva (ej. RES0042).",
  FECHA: "Se esperaba una fecha con formato DD/MM/AAAA.",
};

/**
 * Explicación heurística a partir del token esperado.
 * @param {string} esperado
 */
export function explicacionPorEsperado(esperado) {
  if (!esperado) return "Token inesperado en la estructura de la sentencia.";
  if (EXPLICACIONES[esperado]) return EXPLICACIONES[esperado];
  if (esperado.includes("SIMPLE") || esperado.toLowerCase().includes("tipo"))
    return "Se esperaba un tipo de habitación: SIMPLE, DOBLE, SUITE o PRESIDENCIAL.";
  if (esperado.includes("RESERVAR"))
    return "La sentencia debe comenzar con RESERVAR, CANCELAR o CONSULTAR.";
  return "Token inesperado en la estructura de la sentencia.";
}

/**
 * Reproduce en JS el reconocimiento LL(1) sobre la secuencia de tokens léxicos
 * para localizar el primer punto de fallo SIN tocar el parser. Útil cuando el
 * WASM aún no expone el error estructurado.
 *
 * @param {{col,tipo,lexema}[]} tokens  - tokens léxicos (sin FIN)
 * @returns {object|null} error { regla, simbolo, esperado, encontradoTipo,
 *                                encontradoLexema, columna, explicacion }
 */
export function heuristicaErrorSintactico(tokens) {
  if (!tokens || tokens.length === 0) return null;
  const seq = SECUENCIAS[tokens[0].tipo];
  if (!seq) {
    // No empieza por RESERVAR/CANCELAR/CONSULTAR
    return {
      regla: "P2",
      simbolo: "sentencia",
      esperado: "RESERVAR | CANCELAR | CONSULTAR",
      encontradoTipo: tokens[0].tipo,
      encontradoLexema: tokens[0].lexema,
      columna: tokens[0].col,
      explicacion: explicacionPorEsperado("RESERVAR"),
    };
  }

  for (let i = 0; i < seq.pasos.length; i++) {
    const paso = seq.pasos[i];
    const tok = tokens[i];
    if (!tok || !paso.tipos.includes(tok.tipo)) {
      const esperado = paso.tipos.length > 1 ? paso.tipos.join(" | ") : paso.tipos[0];
      return {
        regla: paso.regla,
        simbolo: paso.simbolo,
        esperado,
        encontradoTipo: tok ? tok.tipo : "FIN",
        encontradoLexema: tok ? tok.lexema : "",
        columna: tok ? tok.col : -1,
        explicacion: explicacionPorEsperado(paso.tipos[0]),
      };
    }
  }

  // Tokens de más al final
  if (tokens.length > seq.pasos.length) {
    const tok = tokens[seq.pasos.length];
    return {
      regla: seq.regla,
      simbolo: seq.simbolo,
      esperado: "FIN",
      encontradoTipo: tok.tipo,
      encontradoLexema: tok.lexema,
      columna: tok.col,
      explicacion: "Tokens inesperados al final de la sentencia.",
    };
  }
  return null;
}

/**
 * Construye un objeto de error unificado para la Fase 2: prioriza el error
 * estructurado del parser (si lo trae el WASM) y, si no, usa la heurística.
 * Siempre añade una `explicacion` legible.
 *
 * @param {object} sintactico  - r.sintactico
 * @param {Array}  tokens      - r.lexico.tokens
 * @returns {object|null}
 */
export function construirErrorSintactico(sintactico, tokens) {
  if (!sintactico || !sintactico.evaluado || sintactico.ok) return null;

  const delParser =
    sintactico.error && sintactico.error.esperado ? { ...sintactico.error } : null;
  const error = delParser || heuristicaErrorSintactico(tokens);

  if (!error) {
    return {
      regla: "",
      simbolo: "",
      esperado: "",
      encontradoTipo: "",
      encontradoLexema: "",
      columna: -1,
      explicacion: `Error de estructura (${sintactico.errores} error(es)).`,
    };
  }
  if (!error.explicacion) error.explicacion = explicacionPorEsperado(error.esperado);
  return error;
}

/**
 * Devuelve una COPIA del AST marcando (sin agregar nodos):
 *  - la regla donde ocurrió el error  → __errorNodo
 *  - el token conflictivo (si se ubica) → __errorToken
 *
 * No inventa ramas: solo añade flags de estilo sobre nodos reales.
 *
 * @param {object} ast
 * @param {object} error
 * @returns {object} copia del AST con marcas (o el mismo ast si no hay error)
 */
export function markAstError(ast, error) {
  if (!error || astVacio(ast)) return ast;
  const arbol = structuredClone(ast);

  // 1) Marca la regla afectada (por regla+símbolo). Si no se ubica, marca la
  //    producción principal (hijo no terminal de "sentencia"); si tampoco, raíz.
  let marcado = false;
  if (error.regla && error.simbolo) {
    (function buscar(n) {
      if (marcado || !n) return;
      if (n.regla === error.regla && n.simbolo === error.simbolo) {
        n.__errorNodo = true;
        marcado = true;
        return;
      }
      (n.hijos ?? []).forEach(buscar);
    })(arbol);
  }
  if (!marcado) {
    let principal = null;
    (function buscar(n) {
      if (principal || !n) return;
      if (n.simbolo === "sentencia") {
        principal = (n.hijos ?? []).find(esNoTerminal) || n;
        return;
      }
      (n.hijos ?? []).forEach(buscar);
    })(arbol);
    (principal || arbol).__errorNodo = true;
  }

  // 2) Marca el token conflictivo (terminal con misma columna y tipo).
  if (error.columna >= 0) {
    (function buscar(n) {
      if (!n) return;
      if (
        !esNoTerminal(n) &&
        n.col === error.columna &&
        n.simbolo === error.encontradoTipo
      ) {
        n.__errorToken = true;
      }
      (n.hijos ?? []).forEach(buscar);
    })(arbol);
  }

  return arbol;
}
