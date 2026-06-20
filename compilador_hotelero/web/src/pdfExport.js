// ============================================================
//  pdfExport.js — Genera el PDF de un resultado de analizarTexto()
//
//  Estructura del PDF:
//    1. Resumen (totales + tabla compacta por sentencia)
//    2. Automatas lexicos por categoria (fijos, una sola vez)
//    3. Una pagina por sentencia, con resumen legible de cada fase
//       (el AST y los tokens con su camino sobre el AFD se muestran
//       como JSON indentado, monoespaciado)
//    4. Apendice con el JSON completo, para depuracion o evidencia
// ============================================================

import { automataToPng } from "./automataSvg.js";

const COLOR_OK = [34, 197, 94];
const COLOR_ERROR = [239, 68, 68];
const COLOR_MUTED = [100, 116, 139];
const COLOR_TEXT = [15, 23, 42];

const MARGEN = 40;

function motivoCorto(r) {
  if (r.resultadoFinal.valido) return "valida";
  if (!r.lexico.ok) return "errores lexicos";
  if (r.sintactico.evaluado && !r.sintactico.ok) return "errores sintacticos";
  if (r.semantico.evaluado && !r.semantico.ok) return "errores semanticos";
  return "invalida";
}

function truncar(texto, max) {
  if (texto.length <= max) return texto;
  return texto.slice(0, max - 1) + "…";
}

// Envuelve el doc de jsPDF con cursor vertical y paginacion automatica
class Lienzo {
  constructor(doc) {
    this.doc = doc;
    this.anchoPagina = doc.internal.pageSize.getWidth();
    this.altoPagina = doc.internal.pageSize.getHeight();
    this.anchoContenido = this.anchoPagina - MARGEN * 2;
    this.y = MARGEN;
  }

  // Agrega pagina si no hay espacio para 'necesario' puntos verticales.
  // Retorna true si se agrego una pagina nueva.
  espacio(necesario) {
    if (this.y + necesario > this.altoPagina - MARGEN) {
      this.doc.addPage();
      this.y = MARGEN;
      return true;
    }
    return false;
  }

  saltarPagina() {
    this.doc.addPage();
    this.y = MARGEN;
  }

  titulo(texto, tam = 16) {
    this.espacio(tam + 10);
    this.doc.setFont("helvetica", "bold").setFontSize(tam).setTextColor(...COLOR_TEXT);
    this.doc.text(texto, MARGEN, this.y);
    this.y += tam + 8;
  }

  subtitulo(texto, tam = 12, color = COLOR_TEXT) {
    this.espacio(tam + 6);
    this.doc.setFont("helvetica", "bold").setFontSize(tam).setTextColor(...color);
    this.doc.text(texto, MARGEN, this.y);
    this.y += tam + 6;
  }

  parrafo(texto, { tam = 10, font = "helvetica", style = "normal", color = COLOR_TEXT } = {}) {
    const lineHeight = tam + 3;
    this.doc.setFont(font, style).setFontSize(tam).setTextColor(...color);
    const lineas = this.doc.splitTextToSize(String(texto), this.anchoContenido);
    for (const linea of lineas) {
      this.espacio(lineHeight);
      this.doc.text(linea, MARGEN, this.y);
      this.y += lineHeight;
    }
  }

  bloqueMono(texto, { tam = 8, color = COLOR_TEXT } = {}) {
    const lineHeight = tam + 2;
    this.doc.setFont("courier", "normal").setFontSize(tam).setTextColor(...color);
    const lineas = this.doc.splitTextToSize(String(texto), this.anchoContenido);
    for (const linea of lineas) {
      this.espacio(lineHeight);
      this.doc.text(linea, MARGEN, this.y);
      this.y += lineHeight;
    }
  }

  bloqueJson(obj, tam = 7.5) {
    this.bloqueMono(JSON.stringify(obj, null, 2), { tam });
  }

  espaciador(alto = 8) {
    this.y += alto;
  }

  // Agrega una imagen PNG (data URL) escalada para no exceder el ancho de
  // contenido, con paginación automática. Usada para los diagramas de autómatas.
  imagen(dataUrl, anchoPx, altoPx) {
    let w = anchoPx;
    let h = altoPx;
    if (w > this.anchoContenido) {
      const k = this.anchoContenido / w;
      w = this.anchoContenido;
      h = h * k;
    }
    this.espacio(h + 6);
    this.doc.addImage(dataUrl, "PNG", MARGEN, this.y, w, h);
    this.y += h + 6;
  }
}

// ── Seccion 1: resumen + tabla compacta por sentencia ────────
function dibujarResumen(c, resultado) {
  c.titulo("Compilador Hotelero — Resultado del análisis", 17);
  c.parrafo(`Generado: ${new Date().toLocaleString()}`, { tam: 9, color: COLOR_MUTED });
  c.espaciador(4);
  c.parrafo(`Sentencias analizadas: ${resultado.totalSentencias}`, { tam: 11 });
  c.parrafo(
    `Válidas: ${resultado.resumen.totalValidas}    Inválidas: ${resultado.resumen.totalInvalidas}`,
    { tam: 11 }
  );
  c.espaciador(10);
  c.subtitulo("Resumen por sentencia", 12);

  const colNum = MARGEN;
  const colEntrada = MARGEN + 35;
  const colResultado = MARGEN + 35 + 330;
  const filaAltura = 14;

  function encabezadoTabla() {
    c.doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...COLOR_TEXT);
    c.doc.text("#", colNum, c.y);
    c.doc.text("Entrada", colEntrada, c.y);
    c.doc.text("Resultado", colResultado, c.y);
    c.y += filaAltura;
    c.doc.setDrawColor(...COLOR_MUTED);
    c.doc.line(MARGEN, c.y - 9, MARGEN + c.anchoContenido, c.y - 9);
  }

  c.espacio(filaAltura * 3);
  encabezadoTabla();

  resultado.resultados.forEach((r) => {
    if (c.y + filaAltura > c.altoPagina - MARGEN) {
      c.saltarPagina();
      encabezadoTabla();
    }
    const motivo = motivoCorto(r);
    c.doc.setFont("courier", "normal").setFontSize(9).setTextColor(...COLOR_TEXT);
    c.doc.text(String(r.numero), colNum, c.y);
    c.doc.text(truncar(r.entrada, 58), colEntrada, c.y);
    c.doc.setTextColor(...(r.resultadoFinal.valido ? COLOR_OK : COLOR_ERROR));
    c.doc.text(motivo, colResultado, c.y);
    c.y += filaAltura;
  });
}

// ── Seccion 2: automatas lexicos (fijos, una sola vez) ───────
function listarTransiciones(c, automata) {
  automata.transiciones.forEach((t) => {
    c.bloqueMono(`  ${t.desde} --${t.simbolo}--> ${t.hasta}`, { tam: 8 });
  });
}

// Renderiza el diagrama (PNG) de un autómata y lo agrega al PDF.
// Best-effort: si Viz.js/canvas falla, se omite el diagrama pero el PDF
// se sigue generando con las tablas/transiciones de texto.
async function agregarDiagrama(c, automata, nombre) {
  const png = await automataToPng(automata, nombre);
  if (png) c.imagen(png.dataUrl, png.width, png.height);
}

// ── Cómo exportar un AST GRÁFICO al PDF (no implementado a propósito:
//    meter todos los AST haría el PDF enorme). Para incluir el árbol de una
//    sentencia (o un subárbol por regla) bastaría reutilizar la misma tubería
//    DOT → SVG → PNG que los autómatas:
//
//    import { generateAstDot, TEMA_AST_CLARO } from "./astDot.js";
//    import { svgStringToPng, /* + un getViz compartido */ } from "./automataSvg.js";
//
//    const dot = generateAstDot(r.sintactico.ast, { tema: TEMA_AST_CLARO });
//    const svg = (await getViz()).renderString(dot, { format: "svg" });
//    const png = await svgStringToPng(svg);
//    if (png) c.imagen(png.dataUrl, png.width, png.height);
//
//    (Se usa TEMA_AST_CLARO para fondo blanco; el resto es idéntico a
//    agregarDiagrama() de los autómatas. No requiere tocar el parser.)

// ── Cómo exportar el RECORRIDO de un token al PDF (no implementado a
//    propósito: meter todos los recorridos de todos los tokens haría el PDF
//    enorme). Para incluir solo el/los recorrido(s) seleccionado(s) bastaría:
//
//    import { parseAfdPath, buildHighlightedTransitions } from "./automataDot.js";
//
//    const estados = parseAfdPath(token.camino);
//    const cat     = resultado.automatasLexicos.find(c => c.categoria === token.categoria);
//    const aceptado = (cat.afd.finales || []).includes(estados.at(-1));
//    const png = await automataToPng(cat.afd, "AFD_recorrido", 2, {
//      highlightedPathStates: estados,
//      highlightedPathTransitions: buildHighlightedTransitions(estados),
//      accepted: aceptado,
//    });
//    if (png) c.imagen(png.dataUrl, png.width, png.height);
//
//    (automataToPng/automataToSvgString ya reenvían estas opciones a
//    automataToDot, así que el PDF reutilizaría exactamente el mismo
//    resaltado que la interfaz, sin tocar el lexer ni la lógica.)

async function dibujarAutomatas(c, automatas) {
  c.saltarPagina();
  c.titulo("Autómatas léxicos por categoría", 15);
  c.parrafo(
    "Definidos como datos estaticos (no se modifico el escaneo real del lexer). " +
      "Por cada token se simula su camino sobre el AFD de su categoria (ver campo " +
      "'camino' en la tabla de tokens de cada sentencia).",
    { tam: 9, color: COLOR_MUTED }
  );
  c.espaciador(6);

  for (const cat of automatas) {
    c.espacio(50);
    c.subtitulo(cat.categoria, 12);
    c.parrafo(cat.descripcion, { tam: 9, color: COLOR_MUTED });

    c.parrafo(
      `AFND — estados: ${cat.afnd.estados.join(", ")} | alfabeto: ${cat.afnd.alfabeto.join(", ")} | ` +
        `inicial: ${cat.afnd.inicial} | finales: ${cat.afnd.finales.join(", ")}`,
      { tam: 9 }
    );
    await agregarDiagrama(c, cat.afnd, "AFND"); // diagrama gráfico
    listarTransiciones(c, cat.afnd);

    c.espaciador(4);
    c.parrafo(
      `AFD — estados: ${cat.afd.estados.join(", ")} | alfabeto: ${cat.afd.alfabeto.join(", ")} | ` +
        `inicial: ${cat.afd.inicial} | finales: ${cat.afd.finales.join(", ")}`,
      { tam: 9 }
    );
    await agregarDiagrama(c, cat.afd, "AFD"); // diagrama gráfico
    listarTransiciones(c, cat.afd);

    c.espaciador(4);
    c.parrafo("Tabla de transición (AFD):", { tam: 9 });
    cat.tablaTransicion.forEach((fila) => {
      const cols = Object.entries(fila)
        .filter(([k]) => k !== "estado")
        .map(([k, v]) => `${k}=${v}`)
        .join("  ");
      c.bloqueMono(`  ${fila.estado}: ${cols}`, { tam: 8 });
    });

    c.espaciador(10);
  }
}

// ── Seccion 3: una pagina por sentencia ──────────────────────
function dibujarSentencia(c, r) {
  c.saltarPagina();
  const valido = r.resultadoFinal.valido;

  c.subtitulo(
    `Sentencia #${r.numero} (línea ${r.lineaArchivo}) — ${valido ? "VALIDA" : "INVALIDA"}`,
    14,
    valido ? COLOR_OK : COLOR_ERROR
  );
  c.parrafo(r.entrada, { tam: 10, font: "courier" });
  c.parrafo(r.resultadoFinal.mensaje, { tam: 9, color: COLOR_MUTED });
  c.espaciador(6);

  // Fase 1: Lexico
  c.subtitulo("Fase 1 · Léxico", 11, r.lexico.ok ? COLOR_OK : COLOR_ERROR);
  c.parrafo(
    `Estado: ${r.lexico.ok ? "OK" : "ERROR"} · ${r.lexico.tokens.length} token(s) · ${r.lexico.errores} error(es)`,
    { tam: 9 }
  );
  if (r.lexico.tokens.length) {
    c.parrafo("Tokens (con categoría y camino sobre el AFD):", { tam: 9, color: COLOR_MUTED });
    c.bloqueJson(r.lexico.tokens);
  }
  c.espaciador(6);

  // Fase 2: Sintactico
  c.subtitulo(
    "Fase 2 · Sintáctico",
    11,
    !r.sintactico.evaluado ? COLOR_MUTED : r.sintactico.ok ? COLOR_OK : COLOR_ERROR
  );
  c.parrafo(
    r.sintactico.evaluado
      ? `Estado: ${r.sintactico.ok ? "OK" : "ERROR"} · ${r.sintactico.errores} error(es) de estructura`
      : "Omitido por errores léxicos previos",
    { tam: 9 }
  );
  if (r.sintactico.evaluado && r.sintactico.ast) {
    c.parrafo("Árbol de sintaxis abstracta (AST):", { tam: 9, color: COLOR_MUTED });
    c.bloqueJson(r.sintactico.ast);
  }
  c.espaciador(6);

  // Fase 3: Semantico
  c.subtitulo(
    "Fase 3 · Semántico",
    11,
    !r.semantico.evaluado ? COLOR_MUTED : r.semantico.ok ? COLOR_OK : COLOR_ERROR
  );
  if (r.semantico.evaluado) {
    c.parrafo(`Estado: ${r.semantico.ok ? "OK" : "ERROR"}`, { tam: 9 });
    r.semantico.reglas.forEach((reg) => {
      c.parrafo(`${reg.codigo} ${reg.ok ? "OK" : "ERROR"} — ${reg.mensaje}`, {
        tam: 9,
        font: "courier",
        color: reg.ok ? COLOR_OK : COLOR_ERROR,
      });
    });
  } else {
    c.parrafo("Omitido por errores en fases previas", { tam: 9 });
  }
}

// ── Seccion 4: apendice con el JSON completo ─────────────────
function dibujarApendiceJson(c, resultado) {
  c.saltarPagina();
  c.titulo("Apéndice — JSON completo", 14);
  c.parrafo(
    "Resultado íntegro tal como lo entrega analizarTexto(), para depuración o como evidencia completa.",
    { tam: 9, color: COLOR_MUTED }
  );
  c.espaciador(6);
  c.bloqueJson(resultado);
}

// ── Punto de entrada ──────────────────────────────────────────
export async function exportarResultadoPdf(resultado, nombreArchivo) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const c = new Lienzo(doc);

  dibujarResumen(c, resultado);
  await dibujarAutomatas(c, resultado.automatasLexicos);
  resultado.resultados.forEach((r) => dibujarSentencia(c, r));
  dibujarApendiceJson(c, resultado);

  const base = (nombreArchivo || "analisis").replace(/[^a-zA-Z0-9.\-_]/g, "_");
  doc.save(`resultado-${base}.pdf`);
}
