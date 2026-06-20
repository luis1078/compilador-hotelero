// ============================================================
//  AutomataGraph.jsx — Diagrama visual (tipo JFLAP) de un autómata
//
//  Recibe el autómata como prop, genera DOT con automataToDot() y
//  lo renderiza a SVG con @viz-js/viz. Complementa (no reemplaza)
//  las tablas de AFND/AFD ya existentes.
//
//  - Loader simple mientras renderiza.
//  - Mensaje claro si el DOT falla.
//  - Tema oscuro y scroll horizontal vía CSS (.automata-diagrama).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { instance } from "@viz-js/viz";
import { automataToDot } from "./automataDot.js";

// La instancia de Viz carga su propio WASM; se crea una sola vez y se reutiliza.
let vizPromise = null;
function getViz() {
  if (!vizPromise) vizPromise = instance();
  return vizPromise;
}

export default function AutomataGraph({
  automata,
  nombre = "automata",
  highlightedPathStates,
  highlightedPathTransitions,
  accepted,
}) {
  const contenedorRef = useRef(null);
  const [estado, setEstado] = useState("cargando"); // "cargando" | "ok" | "error"
  const [mensajeError, setMensajeError] = useState("");

  // Claves serializadas para que el efecto reaccione a cambios de resaltado
  // sin depender de la identidad de los arrays (que cambia en cada render).
  const claveEstados = JSON.stringify(highlightedPathStates ?? null);
  const claveTransiciones = JSON.stringify(highlightedPathTransitions ?? null);

  useEffect(() => {
    let vivo = true;
    setEstado("cargando");
    setMensajeError("");

    let dot;
    try {
      dot = automataToDot(automata, {
        nombre,
        highlightedPathStates,
        highlightedPathTransitions,
        accepted,
      });
    } catch (e) {
      setMensajeError(e?.message || "No se pudo construir el DOT del autómata");
      setEstado("error");
      return;
    }

    getViz()
      .then((viz) => {
        if (!vivo) return;
        const svg = viz.renderSVGElement(dot); // SVGSVGElement
        svg.removeAttribute("width"); // que el CSS controle el ancho
        svg.style.maxWidth = "none";
        const cont = contenedorRef.current;
        if (cont) {
          cont.replaceChildren(svg);
        }
        setEstado("ok");
      })
      .catch((e) => {
        if (!vivo) return;
        setMensajeError(e?.message || "Error desconocido al renderizar el diagrama");
        setEstado("error");
      });

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automata, nombre, claveEstados, claveTransiciones, accepted]);

  return (
    <div className="automata-diagrama">
      {estado === "cargando" && (
        <div className="automata-diagrama__estado">Generando diagrama…</div>
      )}
      {estado === "error" && (
        <div className="automata-diagrama__estado automata-diagrama__estado--error">
          ⚠ No se pudo generar el diagrama: {mensajeError}
        </div>
      )}
      <div
        ref={contenedorRef}
        className="automata-diagrama__svg"
        style={{ display: estado === "ok" ? "block" : "none" }}
      />
    </div>
  );
}
