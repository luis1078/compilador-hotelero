#pragma once
#include <string>
#include <vector>

// ============================================================
//  AST.H — Nodo del arbol de sintaxis abstracta
//  Cada nodo representa la aplicacion de una regla de produccion
//  (P1-P9) o, si es una hoja, un token terminal consumido.
// ============================================================

struct NodoAST {
    std::string regla;   // "P1".."P9"; vacio si el nodo es un terminal
    std::string simbolo; // no terminal (ej "sent_reserva") o tipo de token terminal
    std::string lexema;  // texto del token si es terminal; vacio si no
    int col = -1;         // columna del token si es terminal; -1 si no
    std::vector<NodoAST> hijos;
};
