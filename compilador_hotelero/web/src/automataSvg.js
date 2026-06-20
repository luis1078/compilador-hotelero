// ============================================================
//  automataSvg.js — Render de autómatas a SVG/PNG fuera de React
//
//  Reutiliza automataToDot() para:
//    - automataToSvgString(): SVG como string (tema claro, para el PDF).
//    - svgStringToPng():      rasteriza ese SVG a un PNG (data URL),
//                             que jsPDF puede incrustar con addImage().
//
//  jsPDF no acepta SVG vectorial directamente sin plugins pesados, así
//  que el camino limpio es rasterizar el SVG en un <canvas> y exportar
//  PNG. Se hace en el navegador (canvas), por eso vive aparte del
//  componente React.
// ============================================================

import { instance } from "@viz-js/viz";
import { automataToDot, TEMA_CLARO } from "./automataDot.js";

let vizPromise = null;
function getViz() {
  if (!vizPromise) vizPromise = instance();
  return vizPromise;
}

/**
 * Genera el SVG (string) de un autómata con tema claro (para imprimir
 * sobre fondo blanco en el PDF).
 *
 * `opciones` se reenvía a automataToDot, por lo que también acepta el
 * resaltado de recorrido (highlightedPathStates, highlightedPathTransitions,
 * accepted). Así se puede exportar el recorrido de un token concreto.
 */
export async function automataToSvgString(automata, nombre = "automata", opciones = {}) {
  const viz = await getViz();
  const dot = automataToDot(automata, { nombre, tema: TEMA_CLARO, ...opciones });
  return viz.renderString(dot, { format: "svg" });
}

/**
 * Rasteriza un SVG (string) a un PNG data URL usando un <canvas>.
 * Devuelve también el ancho/alto lógicos para escalar en el PDF.
 *
 * @param {string} svgString
 * @param {number} [escala=2] - sobre-muestreo para nitidez
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
export function svgStringToPng(svgString, escala = 2) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      // Graphviz emite width/height en pt; el navegador los expone en px.
      const w = img.naturalWidth || img.width || 300;
      const h = img.naturalHeight || img.height || 150;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w * escala);
      canvas.height = Math.ceil(h * escala);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; // el PDF tiene fondo blanco
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      try {
        resolve({ dataUrl: canvas.toDataURL("image/png"), width: w, height: h });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo rasterizar el SVG del autómata"));
    };
    img.src = url;
  });
}

/**
 * Atajo: autómata -> { dataUrl, width, height } PNG listo para jsPDF.
 * Devuelve null si algo falla (para que el PDF se genere igual sin el diagrama).
 */
export async function automataToPng(automata, nombre = "automata", escala = 2, opciones = {}) {
  try {
    const svg = await automataToSvgString(automata, nombre, opciones);
    return await svgStringToPng(svg, escala);
  } catch {
    return null;
  }
}
