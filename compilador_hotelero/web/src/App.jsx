import { useEffect, useState } from "react";
import { getCompiler } from "./wasmCompiler.js";

const EJEMPLOS = [
  "RESERVAR HABITACION DOBLE PARA CLIENTE CLI001 DESDE 15/06/2026 HASTA 20/06/2026",
  "RESERVAR HABITACION SUITE PARA CLIENTE ABC123 DESDE 10/07/2026 HASTA 14/07/2026",
  "CANCELAR RESERVA RES0042",
  "CONSULTAR DISPONIBILIDAD SUITE DESDE 01/09/2026 HASTA 05/09/2026",
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

export default function App() {
  const [input, setInput] = useState(EJEMPLOS[0]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [cargandoWasm, setCargandoWasm] = useState(true);
  const [analizando, setAnalizando] = useState(false);
  const [mostrarJson, setMostrarJson] = useState(false);

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

  async function analizar() {
    setError("");
    setResultado(null);
    setAnalizando(true);
    try {
      const Module = await getCompiler();
      const json = Module.analizarSentencia(input);
      setResultado(JSON.parse(json));
    } catch (e) {
      setError(`Error al analizar: ${e.message}`);
    } finally {
      setAnalizando(false);
    }
  }

  const disabled = cargandoWasm || analizando;

  return (
    <div className="app">
      <header className="app__header">
        <h1>🏨 Compilador Hotelero</h1>
        <p className="subtitulo">
          Análisis léxico, sintáctico y semántico — lógica en{" "}
          <strong>C++ compilado a WebAssembly</strong>.
        </p>
      </header>

      <div className="panel">
        <label htmlFor="entrada" className="label">
          Sentencia a analizar
        </label>
        <textarea
          id="entrada"
          className="textarea"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe una sentencia de reserva hotelera…"
          spellCheck={false}
        />

        <div className="ejemplos">
          <span className="ejemplos__titulo">Ejemplos:</span>
          {EJEMPLOS.map((ej, i) => (
            <button
              key={i}
              type="button"
              className="chip"
              onClick={() => setInput(ej)}
              title={ej}
            >
              {ej.split(" ").slice(0, 2).join(" ")}…
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn"
          onClick={analizar}
          disabled={disabled || !input.trim()}
        >
          {cargandoWasm
            ? "Cargando WASM…"
            : analizando
            ? "Analizando…"
            : "Analizar"}
        </button>
      </div>

      {error && <div className="alerta alerta--error">{error}</div>}

      {resultado && (
        <div className="resultado">
          <div
            className={`veredicto veredicto--${
              resultado.resultadoFinal.valido ? "ok" : "error"
            }`}
          >
            {resultado.resultadoFinal.valido ? "✓ " : "✗ "}
            {resultado.resultadoFinal.mensaje}
          </div>

          {/* FASE 1: LÉXICO */}
          <Fase titulo="Fase 1 · Léxico" ok={resultado.lexico.ok}>
            <p className="meta">
              {resultado.lexico.tokens.length} token(s) ·{" "}
              {resultado.lexico.errores} error(es)
            </p>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Col</th>
                  <th>Tipo</th>
                  <th>Lexema</th>
                </tr>
              </thead>
              <tbody>
                {resultado.lexico.tokens.map((t, i) => (
                  <tr key={i} className={t.tipo === "ERROR" ? "fila-error" : ""}>
                    <td>{t.col}</td>
                    <td>{t.tipo}</td>
                    <td>{t.lexema}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Fase>

          {/* FASE 2: SINTÁCTICO */}
          <Fase
            titulo="Fase 2 · Sintáctico"
            ok={resultado.sintactico.ok}
            evaluado={resultado.sintactico.evaluado}
          >
            <p className="meta">
              {resultado.sintactico.evaluado
                ? `${resultado.sintactico.errores} error(es) de estructura`
                : "Omitido por errores léxicos previos"}
            </p>
          </Fase>

          {/* FASE 3: SEMÁNTICO */}
          <Fase
            titulo="Fase 3 · Semántico"
            ok={resultado.semantico.ok}
            evaluado={resultado.semantico.evaluado}
          >
            {resultado.semantico.evaluado ? (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Regla</th>
                    <th>Estado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.semantico.reglas.map((r, i) => (
                    <tr key={i} className={r.ok ? "" : "fila-error"}>
                      <td>{r.codigo}</td>
                      <td>{r.ok ? "OK" : "ERROR"}</td>
                      <td>{r.mensaje}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="meta">Omitido por errores en fases previas</p>
            )}
          </Fase>

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
              <pre className="json">
                {JSON.stringify(resultado, null, 2)}
              </pre>
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
