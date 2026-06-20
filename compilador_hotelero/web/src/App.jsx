import { Fragment, useEffect, useRef, useState } from "react";
import { getCompiler } from "./wasmCompiler.js";
import { exportarResultadoPdf } from "./pdfExport.js";
import AutomataGraph from "./AutomataGraph.jsx";
import AstGraph from "./AstGraph.jsx";
import TokenPathViewer from "./TokenPathViewer.jsx";
import Collapsible from "./Collapsible.jsx";
import {
  extractRuleSubtrees,
  resumenSintactico,
  astVacio,
  markAstError,
  construirErrorSintactico,
} from "./astDot.js";

const EJEMPLOS = [
  {
    nombre: "Reservas, cancelación y consulta",
    contenido: `# Ejemplo: reserva, cancelacion y consulta de disponibilidad
RESERVAR HABITACION DOBLE PARA CLIENTE CLI001 DESDE 15/06/2026 HASTA 20/06/2026
CANCELAR RESERVA RES0042
CONSULTAR DISPONIBILIDAD SUITE DESDE 01/09/2026 HASTA 05/09/2026`,
  },
  {
    nombre: "Con errores léxicos",
    contenido: `# Ejemplo: fecha mal formada y palabra clave en minuscula
RESERVAR HABITACION DOBLE PARA CLIENTE CLI001 DESDE 2026/06/15 HASTA 20/06/2026
reservar HABITACION SIMPLE PARA CLIENTE ABC123 DESDE 01/07/2026 HASTA 05/07/2026`,
  },
];

// ── Helpers de estado de fase ────────────────────────────────
function faseEstado(fase) {
  if (fase.evaluado === false) return { estado: "no-evaluado", etiqueta: "NO EVALUADO" };
  return fase.ok ? { estado: "ok", etiqueta: "OK" } : { estado: "error", etiqueta: "ERROR" };
}

// Motivo principal del error de una sentencia (o null si es válida)
function motivoPrincipal(r) {
  if (r.resultadoFinal.valido) return null;
  if (!r.lexico.ok) return `${r.lexico.errores} error(es) léxico(s)`;
  if (r.sintactico.evaluado && !r.sintactico.ok)
    return `${r.sintactico.errores} error(es) sintáctico(s)`;
  if (r.semantico.evaluado && !r.semantico.ok) {
    const fallo = r.semantico.reglas.find((x) => !x.ok);
    return fallo ? `${fallo.codigo}: ${fallo.mensaje}` : "errores semánticos";
  }
  return r.resultadoFinal.mensaje;
}

// Categorías de autómata efectivamente usadas por la sentencia (únicas)
function categoriasUsadas(r, automatas) {
  const nombres = [...new Set(r.lexico.tokens.map((t) => t.categoria).filter(Boolean))];
  return nombres.map((n) => automatas.find((c) => c.categoria === n)).filter(Boolean);
}

// ── Badge / chip de estado ───────────────────────────────────
function Badge({ estado, children }) {
  return <span className={`badge badge--${estado}`}>{children}</span>;
}

function ChipFase({ nombre, estado, etiqueta, detalle }) {
  return (
    <span className={`chip-fase chip-fase--${estado}`}>
      <span className="chip-fase__nombre">{nombre}</span>
      <span className="chip-fase__estado">{etiqueta}</span>
      {detalle && <span className="chip-fase__detalle">{detalle}</span>}
    </span>
  );
}

function Fase({ titulo, ok, evaluado = true, children }) {
  const estado = !evaluado ? "no-evaluado" : ok ? "ok" : "error";
  const etiqueta = !evaluado ? "NO EVALUADO" : ok ? "OK" : "ERROR";
  return (
    <section className={`fase fase--${estado}`}>
      <header className="fase__head">
        <h3>{titulo}</h3>
        <span className={`badge badge--${estado}`}>{etiqueta}</span>
      </header>
      {children}
    </section>
  );
}

// Nodo recursivo del AST sintactico (uno por regla P1-P9 u hoja terminal).
// El error NO crea nodos: solo se marca contextualmente la regla afectada
// ("← error sintáctico") o el token conflictivo, sobre nodos reales (req. 7).
function NodoArbol({ nodo }) {
  const esTerminal = !nodo.regla;
  const claseTexto = esTerminal
    ? `ast-terminal${nodo.__errorToken ? " ast-terminal-error" : ""}`
    : `ast-noterminal${nodo.__errorNodo ? " ast-noterminal-error" : ""}`;
  return (
    <li>
      <span className={claseTexto}>
        {esTerminal
          ? `${nodo.simbolo} ("${nodo.lexema}")`
          : `${nodo.regla} · ${nodo.simbolo}`}
      </span>
      {nodo.__errorNodo && (
        <span className="ast-marca-error"> ← error sintáctico</span>
      )}
      {nodo.hijos && nodo.hijos.length > 0 && (
        <ul>
          {nodo.hijos.map((hijo, i) => (
            <NodoArbol key={i} nodo={hijo} />
          ))}
        </ul>
      )}
    </li>
  );
}

// Tabla generica de transiciones de un automata (AFND o AFD)
function AutomataTabla({ automata }) {
  return (
    <div className="automata-bloque">
      <p className="meta">
        Estados: {automata.estados.join(", ")} · Alfabeto:{" "}
        {automata.alfabeto.join(", ")} · Inicial: {automata.inicial} ·
        Finales: {automata.finales.join(", ")}
      </p>
      <div className="tabla-scroll">
        <table className="tabla tabla--chica">
          <thead>
            <tr>
              <th>Desde</th>
              <th>Símbolo</th>
              <th>Hasta</th>
            </tr>
          </thead>
          <tbody>
            {automata.transiciones.map((t, i) => (
              <tr key={i}>
                <td>{t.desde}</td>
                <td>{t.simbolo}</td>
                <td>{t.hasta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// AFND + AFD + tabla de transicion de una categoria lexica completa
function CategoriaAutomata({ cat }) {
  return (
    <div className="categoria-automata">
      <p className="meta">{cat.descripcion}</p>
      <div className="automatas-grid">
        <div>
          <p className="label">AFND</p>
          {/* Diagrama gráfico (complemento visual) + tabla existente */}
          <AutomataGraph automata={cat.afnd} nombre="AFND" />
          <AutomataTabla automata={cat.afnd} />
        </div>
        <div>
          <p className="label">AFD</p>
          {/* Diagrama gráfico (complemento visual) + tabla existente */}
          <AutomataGraph automata={cat.afd} nombre="AFD" />
          <AutomataTabla automata={cat.afd} />
        </div>
      </div>
      <p className="label">Tabla de transición (AFD)</p>
      <div className="tabla-scroll">
        <table className="tabla tabla--chica">
          <thead>
            <tr>
              <th>Estado</th>
              {cat.afd.alfabeto.map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cat.tablaTransicion.map((fila, i) => (
              <tr key={i}>
                <td>{fila.estado}</td>
                {cat.afd.alfabeto.map((s) => (
                  <td key={s}>{fila[s]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Resumen textual del error sintáctico (req. 3/8)
function ErrorSintacticoResumen({ error }) {
  return (
    <div className="error-sintactico">
      <p className="error-sintactico__titulo">⚠ Error sintáctico</p>
      <ul className="error-sintactico__lista">
        {error.regla && (
          <li>
            <span className="error-sintactico__k">Regla afectada:</span>{" "}
            {error.regla} - {error.simbolo}
          </li>
        )}
        {error.esperado && (
          <li>
            <span className="error-sintactico__k">Se esperaba:</span>{" "}
            <code>{error.esperado}</code>
          </li>
        )}
        {error.encontradoTipo && (
          <li>
            <span className="error-sintactico__k">Se encontró:</span>{" "}
            <code>
              {error.encontradoTipo === "FIN"
                ? "fin de la sentencia"
                : `${error.encontradoTipo}${
                    error.encontradoLexema ? ` ("${error.encontradoLexema}")` : ""
                  }`}
            </code>
            {error.columna >= 0 ? ` · columna ${error.columna}` : ""}
          </li>
        )}
        {error.explicacion && (
          <li>
            <span className="error-sintactico__k">Explicación:</span>{" "}
            {error.explicacion}
          </li>
        )}
      </ul>
    </div>
  );
}

// ── Fase 2 · Sintáctico (textual + AST gráfico + subárboles) ──
// Recibe `error` ya construido (parser o heurística) desde DetalleFases.
function Fase2Sintactico({ sintactico, error }) {
  // No evaluada por errores léxicos previos: no se intenta generar AST.
  if (!sintactico.evaluado) {
    return (
      <Fase titulo="Fase 2 · Sintáctico" ok={sintactico.ok} evaluado={false}>
        <p className="meta">Omitido por errores léxicos previos</p>
      </Fase>
    );
  }

  const ast = sintactico.ast;

  // Árbol a mostrar: el MISMO del parser, con la regla/token del error
  // marcados en rojo (sin agregar nodos artificiales).
  const astMostrar = error ? markAstError(ast, error) : ast;
  const hayArbol = !astVacio(astMostrar);
  const sinParcial = astVacio(ast); // no se pudo construir árbol parcial
  const resumen = !astVacio(ast) ? resumenSintactico(ast) : null;
  const subarboles = hayArbol ? extractRuleSubtrees(astMostrar) : [];

  return (
    <Fase titulo="Fase 2 · Sintáctico" ok={sintactico.ok}>
      <p className="meta">{sintactico.errores} error(es) de estructura</p>

      {error && <ErrorSintacticoResumen error={error} />}

      {resumen && (
        <div className="resumen-sintactico">
          <p>
            <span className="resumen-sintactico__k">Producción principal:</span>{" "}
            <code>{resumen.produccionPrincipal}</code>
          </p>
          <p>
            <span className="resumen-sintactico__k">Reglas aplicadas:</span>{" "}
            {resumen.reglasAplicadas.join(", ")}
          </p>
        </div>
      )}

      {sinParcial && error && (
        <p className="meta">
          No se pudo generar árbol sintáctico completo por error de estructura.
        </p>
      )}

      {hayArbol ? (
        <>
          {/* Árbol textual existente (se mantiene, visible por defecto)
              con la marca de error si la hubo */}
          <Collapsible titulo="Ver árbol sintáctico textual" nivel="item" defaultOpen>
            <ul className="ast-tree">
              <NodoArbol nodo={astMostrar} />
            </ul>
          </Collapsible>

          {/* Árbol gráfico completo (colapsado por defecto), con error resaltado */}
          <Collapsible titulo="Ver árbol sintáctico gráfico" nivel="item">
            <AstGraph ast={astMostrar} nombre="AST" />
          </Collapsible>

          {/* Subárboles por regla aplicada (cada uno desplegable) */}
          <Collapsible
            titulo="Ver subárboles por regla sintáctica"
            nivel="item"
            extra={
              <span className="colapsable__hint">
                {subarboles.length} regla(s)
              </span>
            }
          >
            {subarboles.map((s, i) => (
              <Collapsible key={i} titulo={s.rule} nivel="item">
                <AstGraph ast={s.tree} nombre={`sub${i}`} />
              </Collapsible>
            ))}
          </Collapsible>
        </>
      ) : (
        <p className="meta">
          No se generó AST porque la sentencia no pudo ser parseada
          completamente.
        </p>
      )}
    </Fase>
  );
}

// ── Detalle técnico de las 3 fases (dentro de "Ver detalles") ──
function DetalleFases({ r, automatas }) {
  // Índice del token cuyo recorrido AFD está expandido (null = ninguno).
  // Solo se renderiza el diagrama del token abierto, nunca todos a la vez.
  const [tokenAbierto, setTokenAbierto] = useState(null);
  const usadas = automatas ? categoriasUsadas(r, automatas) : [];
  // Error sintáctico unificado (parser o heurística por tokens). Se usa para
  // resaltar la fila del token conflictivo y para el detalle de la Fase 2.
  const errSint = construirErrorSintactico(r.sintactico, r.lexico.tokens);

  return (
    <>
      {/* FASE 1: LÉXICO */}
      <Fase titulo="Fase 1 · Léxico" ok={r.lexico.ok}>
        <p className="meta">
          {r.lexico.tokens.length} token(s) · {r.lexico.errores} error(es)
        </p>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Col</th>
                <th>Tipo</th>
                <th>Lexema</th>
                <th>Categoría</th>
                <th>Camino AFD</th>
                <th>Recorrido</th>
              </tr>
            </thead>
            <tbody>
              {r.lexico.tokens.map((t, i) => {
                const tieneCamino =
                  t.categoria && t.camino && t.camino.length > 0;
                const abierto = tokenAbierto === i;
                // La Fase 1 solo refleja resultados léxicos: tokens válidos y
                // errores léxicos reales. Los fallos sintácticos se explican y
                // resaltan únicamente en la Fase 2 (árbol sintáctico/AST).
                return (
                  <Fragment key={i}>
                    <tr
                      className={t.tipo === "ERROR" ? "fila-error" : ""}
                    >
                      <td>{t.col}</td>
                      <td>{t.tipo}</td>
                      <td>{t.lexema}</td>
                      <td>{t.categoria || "—"}</td>
                      <td className="celda-camino">
                        {tieneCamino ? t.camino.join(" → ") : "—"}
                      </td>
                      <td>
                        {tieneCamino ? (
                          <button
                            type="button"
                            className="btn-recorrido"
                            aria-expanded={abierto}
                            onClick={() => setTokenAbierto(abierto ? null : i)}
                          >
                            {abierto ? "▾ Ocultar" : "👁 Ver recorrido"}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="fila-recorrido">
                        <td colSpan={6}>
                          <TokenPathViewer token={t} automatas={automatas} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Fase>

      {/* FASE 2: SINTÁCTICO (textual + AST gráfico + subárboles) */}
      <Fase2Sintactico sintactico={r.sintactico} error={errSint} />

      {/* FASE 3: SEMÁNTICO */}
      <Fase
        titulo="Fase 3 · Semántico"
        ok={r.semantico.ok}
        evaluado={r.semantico.evaluado}
      >
        {r.semantico.evaluado ? (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Regla</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {r.semantico.reglas.map((reg, i) => (
                  <tr key={i} className={reg.ok ? "" : "fila-error"}>
                    <td>{reg.codigo}</td>
                    <td>{reg.ok ? "OK" : "ERROR"}</td>
                    <td>{reg.mensaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="meta">Omitido por errores en fases previas</p>
        )}
      </Fase>

      {/* AUTÓMATAS USADOS EN ESTA SENTENCIA (colapsados por defecto) */}
      {usadas.length > 0 && (
        <Collapsible
          titulo="Autómatas usados en esta sentencia"
          nivel="item"
          extra={
            <span className="colapsable__hint">{usadas.length} categoría(s)</span>
          }
        >
          {usadas.map((cat, i) => (
            <Collapsible key={i} titulo={cat.categoria} nivel="item">
              <CategoriaAutomata cat={cat} />
            </Collapsible>
          ))}
        </Collapsible>
      )}
    </>
  );
}

// ── Card compacto de una sentencia ───────────────────────────
function SentenciaResultado({ r, automatas }) {
  const valido = r.resultadoFinal.valido;
  const motivo = motivoPrincipal(r);

  const lex = faseEstado({ ok: r.lexico.ok, evaluado: true });
  const sin = faseEstado(r.sintactico);
  const sem = faseEstado(r.semantico);

  return (
    <div className={`sentencia-card sentencia-card--${valido ? "ok" : "error"}`}>
      <header className="sentencia-card__head">
        <span className="sentencia-card__numero">
          #{r.numero} · línea {r.lineaArchivo}
        </span>
        <Badge estado={valido ? "ok" : "error"}>
          {valido ? "VÁLIDA" : "INVÁLIDA"}
        </Badge>
      </header>

      <code className="sentencia-card__entrada">{r.entrada}</code>

      <div className="chips-fases">
        <ChipFase
          nombre="Léxico"
          estado={lex.estado}
          etiqueta={lex.etiqueta}
          detalle={`${r.lexico.tokens.length} tok · ${r.lexico.errores} err`}
        />
        <ChipFase nombre="Sintáctico" estado={sin.estado} etiqueta={sin.etiqueta} />
        <ChipFase nombre="Semántico" estado={sem.estado} etiqueta={sem.etiqueta} />
      </div>

      {motivo && <p className="sentencia-card__motivo">⚠ {motivo}</p>}

      <Collapsible titulo="Ver detalles" nivel="item">
        <DetalleFases r={r} automatas={automatas} />
      </Collapsible>
    </div>
  );
}

export default function App() {
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [contenido, setContenido] = useState("");
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [cargandoWasm, setCargandoWasm] = useState(true);
  const [analizando, setAnalizando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [mostrarJson, setMostrarJson] = useState(false);
  const fileInputRef = useRef(null);

  // Pre-carga el modulo WASM al montar para que el primer analisis sea instantaneo.
  useEffect(() => {
    let vivo = true;
    getCompiler()
      .then(() => vivo && setCargandoWasm(false))
      .catch((e) => {
        if (vivo) {
          setError(`Error cargando el compilador WASM: ${e.message}`);
          setCargandoWasm(false);
        }
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function manejarArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResultado(null);
    setNombreArchivo(file.name);
    setContenido(await file.text());
  }

  function cargarEjemplo(ejemplo) {
    setError("");
    setResultado(null);
    setNombreArchivo(`${ejemplo.nombre} (ejemplo)`);
    setContenido(ejemplo.contenido);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function analizar() {
    setError("");
    setResultado(null);
    setAnalizando(true);
    try {
      const Module = await getCompiler();
      const json = Module.analizarTexto(contenido);
      setResultado(JSON.parse(json));
    } catch (e) {
      setError(`Error al analizar: ${e.message}`);
    } finally {
      setAnalizando(false);
    }
  }

  async function exportarPdf() {
    if (!resultado) return;
    setExportando(true);
    try {
      await exportarResultadoPdf(resultado, nombreArchivo);
    } finally {
      setExportando(false);
    }
  }

  const disabled = cargandoWasm || analizando;

  return (
    <div className="app">
      <header className="app__header">
        <h1>🏨 Compilador Hotelero</h1>
        <p className="subtitulo">
          Análisis léxico, sintáctico y semántico de un archivo de reservas —
          lógica en <strong>C++ compilado a WebAssembly</strong>.
        </p>
      </header>

      <div className="panel">
        <label htmlFor="archivo" className="label">
          Archivo .txt con sentencias (una por línea)
        </label>
        <input
          id="archivo"
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="file-input"
          onChange={manejarArchivo}
        />

        {nombreArchivo && (
          <p className="meta">
            Cargado: <strong>{nombreArchivo}</strong> ·{" "}
            {contenido.split("\n").length} línea(s)
          </p>
        )}

        <div className="ejemplos">
          <span className="ejemplos__titulo">Ejemplos:</span>
          {EJEMPLOS.map((ej, i) => (
            <button
              key={i}
              type="button"
              className="chip"
              onClick={() => cargarEjemplo(ej)}
            >
              {ej.nombre}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn"
          onClick={analizar}
          disabled={disabled || !contenido.trim()}
        >
          {cargandoWasm
            ? "Cargando WASM…"
            : analizando
            ? "Analizando…"
            : "Analizar archivo"}
        </button>
      </div>

      {error && <div className="alerta alerta--error">{error}</div>}

      {resultado && (
        <div className="resultado">
          {/* ── Resumen general ── */}
          <div className="resumen-global">
            <span>{resultado.totalSentencias} sentencia(s)</span>
            <span className="resumen-global__ok">
              {resultado.resumen.totalValidas} válida(s)
            </span>
            <span className="resumen-global__error">
              {resultado.resumen.totalInvalidas} inválida(s)
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={exportarPdf}
              disabled={exportando}
            >
              {exportando ? "Generando PDF…" : "Exportar PDF"}
            </button>
          </div>

          {/* ── Diccionario de autómatas léxicos (colapsado) ── */}
          <Collapsible
            titulo="Diccionario de autómatas léxicos"
            extra={
              <span className="colapsable__hint">
                {resultado.automatasLexicos.length} categorías
              </span>
            }
          >
            {resultado.automatasLexicos.map((cat, i) => (
              <Collapsible key={i} titulo={cat.categoria} nivel="item">
                <CategoriaAutomata cat={cat} />
              </Collapsible>
            ))}
          </Collapsible>

          {/* ── Sentencias analizadas (cards compactos) ── */}
          <section className="sentencias">
            <h2 className="sentencias__titulo">Sentencias analizadas</h2>
            {resultado.resultados.map((r, i) => (
              <SentenciaResultado
                key={i}
                r={r}
                automatas={resultado.automatasLexicos}
              />
            ))}
          </section>

          {/* ── JSON crudo ── */}
          <div className="json-toggle">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setMostrarJson((v) => !v)}
            >
              {mostrarJson ? "Ocultar JSON" : "Ver JSON crudo"}
            </button>
            {mostrarJson && (
              <pre className="json">{JSON.stringify(resultado, null, 2)}</pre>
            )}
          </div>
        </div>
      )}

      <footer className="app__footer">
        Compiladores 2026 · Lexer + Parser + Semantic en C++ → Emscripten/Embind →
        WebAssembly
      </footer>
    </div>
  );
}
