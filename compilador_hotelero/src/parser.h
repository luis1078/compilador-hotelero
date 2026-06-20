#pragma once
#include "token.h"
#include "ast.h"
#include <vector>
#include <string>

// ============================================================
//  PARSER.H — Analizador sintáctico descendente recursivo LL(1)
//  Compilador Hotelero — Curso: Compiladores 2026
// ============================================================

class Parser {
public:
    // Constructor: recibe la lista de tokens del lexer
    explicit Parser(const std::vector<Token>& tokens);

    // Inicia el análisis sintáctico desde el símbolo inicial S
    // Retorna true si la sentencia es sintácticamente correcta
    bool parse();

    bool hasErrors() const { return errorCount > 0; }
    int  getErrorCount() const { return errorCount; }

    // Árbol de sintaxis abstracta construido durante parse().
    // Disponible una vez que parse() retorna (válida o no).
    const NodoAST& getAST() const { return astRaiz; }

private:
    std::vector<Token> tokens;  // Lista de tokens
    size_t             pos;     // Posición actual
    int                errorCount;

    // ── Construcción del AST (no altera el control de flujo bool) ──
    // Cada parseXxx() abre un nivel al entrar y lo cierra al salir,
    // sin importar el camino de retorno (ver struct NodoScope).
    std::vector<std::vector<NodoAST>> pilaHijos;
    NodoAST astRaiz;

    void agregarTerminal(const Token& tok);                 // hoja del AST
    void cerrarNodo(const std::string& regla, const std::string& simbolo);

    // RAII: abre un nivel al construirse, lo cierra al destruirse,
    // garantizando que cada parseXxx() balancee la pila aunque
    // retorne desde varios puntos distintos.
    struct NodoScope {
        Parser&     p;
        std::string regla, simbolo;
        NodoScope(Parser& p_, std::string r, std::string s)
            : p(p_), regla(std::move(r)), simbolo(std::move(s)) {
            p.pilaHijos.emplace_back();
        }
        ~NodoScope() { p.cerrarNodo(regla, simbolo); }
    };

    // ── Helpers de navegación ────────────────────────────────
    const Token& current() const;       // Token en pos
    const Token& peek(int offset) const;
    void         advance();             // Consume token actual
    bool         isEnd() const;

    // Consume el token actual si coincide con 'expected'
    // Si no coincide, reporta error y retorna false
    bool expect(TokenType expected);

    // Reporte de error sintáctico
    void syntaxError(const std::string& expected, const Token& found);

    // ── Reglas de producción (una función por producción) ────
    // P1: S → sentencia
    bool parseS();

    // P2: sentencia → sent_reserva | sent_cancelacion | sent_consulta
    bool parseSentencia();

    // P3: sent_reserva → RESERVAR HABITACION tipo_hab PARA CLIENTE id_cliente DESDE fecha HASTA fecha
    bool parseSentReserva();

    // P4: sent_cancelacion → CANCELAR RESERVA id_reserva
    bool parseSentCancelacion();

    // P5: sent_consulta → CONSULTAR DISPONIBILIDAD tipo_hab DESDE fecha HASTA fecha
    bool parseSentConsulta();

    // P6: tipo_hab → SIMPLE | DOBLE | SUITE | PRESIDENCIAL
    bool parseTipoHab();

    // P7: id_cliente → ID_CLIENTE
    bool parseIdCliente();

    // P8: id_reserva → ID_RESERVA
    bool parseIdReserva();

    // P9: fecha → FECHA
    bool parseFecha();
};
