// ============================================================
//  Collapsible.jsx — Sección/ítem desplegable reutilizable
//
//  Los hijos se montan SOLO cuando está abierto, de modo que los
//  diagramas (AutomataGraph) y tablas pesadas no se renderizan hasta
//  que el usuario expande la sección.
//
//  Props:
//    - titulo:      string | nodo  (texto de la cabecera)
//    - extra:       nodo opcional   (badges/contador a la derecha)
//    - defaultOpen: boolean         (abierto por defecto, default false)
//    - nivel:       "seccion" | "item"  (estilo de la cabecera)
// ============================================================

import { useState } from "react";

export default function Collapsible({
  titulo,
  extra = null,
  defaultOpen = false,
  nivel = "seccion",
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`colapsable colapsable--${nivel} ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="colapsable__cab"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="colapsable__chevron" aria-hidden="true">
          ▸
        </span>
        <span className="colapsable__titulo">{titulo}</span>
        {extra && <span className="colapsable__extra">{extra}</span>}
      </button>
      {open && <div className="colapsable__cuerpo">{children}</div>}
    </div>
  );
}
