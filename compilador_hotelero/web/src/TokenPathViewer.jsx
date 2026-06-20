// ============================================================
//  TokenPathViewer.jsx — Recorrido gráfico de un token sobre su AFD
//
//  Muestra los datos del token y, debajo, el MISMO AFD general de su
//  categoría (no crea un autómata nuevo) con el camino del lexema
//  resaltado: estados visitados, transiciones usadas y resultado.
//
//  Se renderiza bajo demanda (al expandir la fila), nunca en masa.
// ============================================================

import AutomataGraph from "./AutomataGraph.jsx";
import { parseAfdPath, buildHighlightedTransitions } from "./automataDot.js";

export default function TokenPathViewer({ token, automatas }) {
  // Busca el AFD general de la categoría del token (sin crear uno nuevo).
  const cat = automatas?.find((c) => c.categoria === token.categoria);

  if (!cat) {
    return (
      <div className="token-path token-path--vacio">
        No hay un autómata asociado a la categoría «{token.categoria || "—"}».
      </div>
    );
  }

  const estados = parseAfdPath(token.camino);
  const transiciones = buildHighlightedTransitions(estados);
  const ultimo = estados[estados.length - 1];
  const finales = cat.afd.finales ?? [];
  const aceptado = !!ultimo && finales.includes(ultimo);

  return (
    <div className="token-path">
      <dl className="token-path__info">
        <div className="token-path__item">
          <dt>Token</dt>
          <dd>{token.tipo}</dd>
        </div>
        <div className="token-path__item">
          <dt>Categoría</dt>
          <dd>{token.categoria}</dd>
        </div>
        <div className="token-path__item">
          <dt>Lexema</dt>
          <dd>
            <code>{token.lexema}</code>
          </dd>
        </div>
        {/* Camino AFD ocupa su propia fila: suele ser el texto más largo */}
        <div className="token-path__item token-path__item--full">
          <dt>Camino AFD</dt>
          <dd className="token-path__camino">{estados.join(" → ") || "—"}</dd>
        </div>
        {/* Resultado en su propia línea, como badge para no montarse con el camino */}
        <div className="token-path__item token-path__item--full">
          <dt>Resultado</dt>
          <dd>
            <span className={`badge badge--${aceptado ? "ok" : "error"}`}>
              {aceptado ? "ACEPTADO" : "RECHAZADO / ERROR"}
            </span>
          </dd>
        </div>
      </dl>

      <p className="label">AFD de «{cat.categoria}» con el recorrido resaltado</p>
      <AutomataGraph
        automata={cat.afd}
        nombre="AFD_recorrido"
        highlightedPathStates={estados}
        highlightedPathTransitions={transiciones}
        accepted={aceptado}
      />
    </div>
  );
}
