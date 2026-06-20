import { useEffect, useRef, useState } from "react";
import { getCompiler } from "./wasmCompiler.js";
import { exportarResultadoPdf } from "./pdfExport.js";

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

// Nodo recursivo del AST sintactico (uno por regla P1-P9, u hoja terminal)
function NodoArbol({ nodo }) {
  const esTerminal = !nodo.regla;
  return (
    <li>
      <span className={esTerminal ? "ast-terminal" : "ast-noterminal"}>
        {esTerminal
          ? `${nodo.simbolo} ("${nodo.lexema}")`
          : `${nodo.regla} · ${nodo.simbolo}`}
      </span>
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
  );
}

// AFND + AFD + tabla de transicion de una categoria lexica completa
function CategoriaAutomata({ cat }) {
  return (
    <div className="categoria-automata">
      <h4>{cat.categoria}</h4>
      <p className="meta">{cat.descripcion}</p>
      <div className="automatas-grid">
        <div>
          <p className="label">AFND</p>
          <AutomataTabla automata={cat.afnd} />
        </div>
        <div>
          <p className="label">AFD</p>
          <AutomataTabla automata={cat.afd} />
        </div>
      </div>
      <p className="label">Tabla de transición (AFD)</p>
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
  );
}

// Resultado completo (lexico + sintactico + semantico) de una sentencia
function SentenciaResultado({ r }) {
  return (
    <div className="sentencia-card">
      <header className="sentencia-card__head">
        <span className="sentencia-card__numero">
          #{r.numero} · línea {r.lineaArchivo}
        </span>
        <code className="sentencia-card__entrada">{r.entrada}</code>
      </header>

      <div
        className={`veredicto veredicto--${
          r.resultadoFinal.valido ? "ok" : "error"
        }`}
      >
        {r.resultadoFinal.valido ? "✓ " : "✗ "}
        {r.resultadoFinal.mensaje}
      </div>

      {/* FASE 1: LÉXICO */}
      <Fase titulo="Fase 1 · Léxico" ok={r.lexico.ok}>
        <p className="meta">
          {r.lexico.tokens.length} token(s) · {r.lexico.errores} error(es)
        </p>
        <table className="tabla">
          <thead>
            <tr>
              <th>Col</th>
              <th>Tipo</th>
              <th>Lexema</th>
              <th>Categoría</th>
              <th>Camino AFD</th>
            </tr>
          </thead>
          <tbody>
            {r.lexico.tokens.map((t, i) => (
              <tr key={i} className={t.tipo === "ERROR" ? "fila-error" : ""}>
                <td>{t.col}</td>
                <td>{t.tipo}</td>
                <td>{t.lexema}</td>
                <td>{t.categoria || "—"}</td>
                <td>
                  {t.camino && t.camino.length ? t.camino.join(" → ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Fase>

      {/* FASE 2: SINTÁCTICO */}
      <Fase
        titulo="Fase 2 · Sintáctico"
        ok={r.sintactico.ok}
        evaluado={r.sintactico.evaluado}
      >
        {r.sintactico.evaluado ? (
          <>
            <p className="meta">
              {r.sintactico.errores} error(es) de estructura
            </p>
            {r.sintactico.ast && (
              <ul className="ast-tree">
                <NodoArbol nodo={r.sintactico.ast} />
              </ul>
            )}
          </>
        ) : (
          <p className="meta">Omitido por errores léxicos previos</p>
        )}
      </Fase>

      {/* FASE 3: SEMÁNTICO */}
      <Fase
        titulo="Fase 3 · Semántico"
        ok={r.semantico.ok}
        evaluado={r.semantico.evaluado}
      >
        {r.semantico.evaluado ? (
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
        ) : (
          <p className="meta">Omitido por errores en fases previas</p>
        )}
      </Fase>
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

          <section className="panel">
            <h2>Autómatas léxicos por categoría</h2>
            {resultado.automatasLexicos.map((cat, i) => (
              <CategoriaAutomata key={i} cat={cat} />
            ))}
          </section>

          {resultado.resultados.map((r, i) => (
            <SentenciaResultado key={i} r={r} />
          ))}

          {/* JSON CRUDO */}
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
