// ============================================================
//  AstGraph.jsx — Árbol sintáctico (AST) renderizado con Viz.js
//
//  Recibe el AST (JSON del parser) como prop, genera DOT con
//  generateAstDot() y lo dibuja como SVG (árbol vertical TB).
//  Complementa —no reemplaza— el árbol textual existente.
//
//  - Loader mientras renderiza.
//  - Mensaje claro si Graphviz falla o el AST está vacío.
//  - Tema oscuro y scroll horizontal vía CSS (.ast-diagrama).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { instance } from "@viz-js/viz";
import { generateAstDot } from "./astDot.js";

// La instancia de Viz carga su propio WASM; se crea una vez y se reutiliza.
let vizPromise = null;
function getViz() {
  if (!vizPromise) vizPromise = instance();
  return vizPromise;
}

export default function AstGraph({ ast, nombre = "AST" }) {
  const contenedorRef = useRef(null);
  const [estado, setEstado] = useState("cargando"); // "cargando" | "ok" | "error" | "vacio"
  const [mensajeError, setMensajeError] = useState("");

  useEffect(() => {
    let vivo = true;
    setEstado("cargando");
    setMensajeError("");

    let dot;
    try {
      dot = generateAstDot(ast, { nombre });
    } catch (e) {
      setMensajeError(e?.message || "No se pudo construir el DOT del AST");
      setEstado("error");
      return;
    }

    if (!dot) {
      setEstado("vacio");
      return;
    }

    getViz()
      .then((viz) => {
        if (!vivo) return;
        const svg = viz.renderSVGElement(dot);
        svg.removeAttribute("width"); // que el CSS controle el ancho
        svg.style.maxWidth = "none";
        if (contenedorRef.current) contenedorRef.current.replaceChildren(svg);
        setEstado("ok");
      })
      .catch((e) => {
        if (!vivo) return;
        setMensajeError(e?.message || "Error desconocido al renderizar el AST");
        setEstado("error");
      });

    return () => {
      vivo = false;
    };
  }, [ast, nombre]);

  if (estado === "vacio") {
    return (
      <div className="ast-diagrama ast-diagrama--vacio">
        No se generó AST porque la sentencia no pudo ser parseada completamente.
      </div>
    );
  }

  return (
    <div className="ast-diagrama">
      {estado === "cargando" && (
        <div className="automata-diagrama__estado">Generando árbol…</div>
      )}
      {estado === "error" && (
        <div className="automata-diagrama__estado automata-diagrama__estado--error">
          ⚠ No se pudo generar el árbol: {mensajeError}
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
