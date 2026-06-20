#include "parser.h"
#include <iostream>

// ============================================================
//  PARSER.CPP — Analizador sintáctico descendente recursivo LL(1)
//
//  Gramática implementada:
//  P1:  S             → sentencia
//  P2:  sentencia     → sent_reserva | sent_cancelacion | sent_consulta
//  P3:  sent_reserva  → RESERVAR HABITACION tipo_hab PARA CLIENTE id_cliente DESDE fecha HASTA fecha
//  P4:  sent_cancel   → CANCELAR RESERVA id_reserva
//  P5:  sent_consulta → CONSULTAR DISPONIBILIDAD tipo_hab DESDE fecha HASTA fecha
//  P6:  tipo_hab      → SIMPLE | DOBLE | SUITE | PRESIDENCIAL
//  P7:  id_cliente    → ID_CLIENTE
//  P8:  id_reserva    → ID_RESERVA
//  P9:  fecha         → FECHA
// ============================================================

// ── Constructor ──────────────────────────────────────────────
Parser::Parser(const std::vector<Token>& toks)
    : tokens(toks), pos(0), errorCount(0) {}

// ── Helpers de navegación ────────────────────────────────────

const Token& Parser::current() const {
    return tokens[pos];
}

const Token& Parser::peek(int offset) const {
    size_t p = pos + offset;
    if (p >= tokens.size()) return tokens.back(); // retorna FIN
    return tokens[p];
}

void Parser::advance() {
    if (!isEnd()) pos++;
}

bool Parser::isEnd() const {
    return tokens[pos].type == TokenType::FIN;
}

// Verifica que el token actual sea del tipo esperado y lo consume
bool Parser::expect(TokenType expected) {
    if (current().type == expected) {
        agregarTerminal(current());
        advance();
        return true;
    }
    syntaxError(tokenTypeName(expected), current());
    return false;
}

// ── Construcción del AST ──────────────────────────────────────

// Agrega el token actual como hoja del nodo que se está construyendo
void Parser::agregarTerminal(const Token& tok) {
    if (pilaHijos.empty()) return;
    NodoAST hoja;
    hoja.regla   = "";
    hoja.simbolo = tokenTypeName(tok.type);
    hoja.lexema  = tok.lexeme;
    hoja.col     = tok.column;
    pilaHijos.back().push_back(std::move(hoja));
}

// Cierra el nivel actual de la pila y lo adjunta como hijo del nivel
// padre (o lo guarda como raíz si era el último nivel abierto)
void Parser::cerrarNodo(const std::string& regla, const std::string& simbolo) {
    std::vector<NodoAST> hijos = std::move(pilaHijos.back());
    pilaHijos.pop_back();

    NodoAST nodo;
    nodo.regla   = regla;
    nodo.simbolo = simbolo;
    nodo.hijos   = std::move(hijos);

    if (pilaHijos.empty()) {
        astRaiz = std::move(nodo);
    } else {
        pilaHijos.back().push_back(std::move(nodo));
    }
}

// Reporte de error sintáctico con contexto claro
void Parser::syntaxError(const std::string& expected, const Token& found) {
    errorCount++;
    std::cerr << "  [ERROR SINTACTICO col " << found.column << "] "
              << "Se esperaba '" << expected << "' "
              << "pero se encontro '"
              << (found.type == TokenType::FIN ? "$FIN" : found.lexeme)
              << "' (" << tokenTypeName(found.type) << ")\n";
}

// ── P1: S → sentencia ────────────────────────────────────────
bool Parser::parseS() {
    NodoScope scope(*this, "P1", "S");
    bool ok = parseSentencia();

    // Después de la sentencia debe venir FIN ($)
    if (!isEnd()) {
        errorCount++;
        std::cerr << "  [ERROR SINTACTICO col " << current().column << "] "
                  << "Tokens inesperados al final de la sentencia: '"
                  << current().lexeme << "'\n";
        ok = false;
    }
    return ok;
}

// ── P2: sentencia → sent_reserva | sent_cancelacion | sent_consulta
// Usamos lookahead = 1: FIRST(sent_reserva)={RESERVAR},
//                       FIRST(sent_cancel)={CANCELAR},
//                       FIRST(sent_consulta)={CONSULTAR}
bool Parser::parseSentencia() {
    NodoScope scope(*this, "P2", "sentencia");
    switch (current().type) {
        case TokenType::RESERVAR:
            return parseSentReserva();
        case TokenType::CANCELAR:
            return parseSentCancelacion();
        case TokenType::CONSULTAR:
            return parseSentConsulta();
        default:
            errorCount++;
            std::cerr << "  [ERROR SINTACTICO col " << current().column << "] "
                      << "La sentencia debe comenzar con RESERVAR, CANCELAR o CONSULTAR. "
                      << "Se encontro: '"
                      << (current().type == TokenType::FIN ? "$FIN" : current().lexeme)
                      << "'\n";
            return false;
    }
}

// ── P3: sent_reserva → RESERVAR HABITACION tipo_hab PARA CLIENTE id_cliente DESDE fecha HASTA fecha
bool Parser::parseSentReserva() {
    NodoScope scope(*this, "P3", "sent_reserva");
    bool ok = true;

    ok &= expect(TokenType::RESERVAR);      // RESERVAR
    ok &= expect(TokenType::HABITACION);    // HABITACION
    ok &= parseTipoHab();                   // tipo_hab
    ok &= expect(TokenType::PARA);          // PARA
    ok &= expect(TokenType::CLIENTE);       // CLIENTE
    ok &= parseIdCliente();                 // id_cliente
    ok &= expect(TokenType::DESDE);         // DESDE
    ok &= parseFecha();                     // fecha (entrada)
    ok &= expect(TokenType::HASTA);         // HASTA
    ok &= parseFecha();                     // fecha (salida)

    return ok;
}

// ── P4: sent_cancelacion → CANCELAR RESERVA id_reserva
bool Parser::parseSentCancelacion() {
    NodoScope scope(*this, "P4", "sent_cancelacion");
    bool ok = true;

    ok &= expect(TokenType::CANCELAR);      // CANCELAR
    ok &= expect(TokenType::RESERVA);       // RESERVA
    ok &= parseIdReserva();                 // id_reserva

    return ok;
}

// ── P5: sent_consulta → CONSULTAR DISPONIBILIDAD tipo_hab DESDE fecha HASTA fecha
bool Parser::parseSentConsulta() {
    NodoScope scope(*this, "P5", "sent_consulta");
    bool ok = true;

    ok &= expect(TokenType::CONSULTAR);     // CONSULTAR
    ok &= expect(TokenType::DISPONIBILIDAD);// DISPONIBILIDAD
    ok &= parseTipoHab();                   // tipo_hab
    ok &= expect(TokenType::DESDE);         // DESDE
    ok &= parseFecha();                     // fecha (entrada)
    ok &= expect(TokenType::HASTA);         // HASTA
    ok &= parseFecha();                     // fecha (salida)

    return ok;
}

// ── P6: tipo_hab → SIMPLE | DOBLE | SUITE | PRESIDENCIAL
// FIRST = {SIMPLE, DOBLE, SUITE, PRESIDENCIAL}
bool Parser::parseTipoHab() {
    NodoScope scope(*this, "P6", "tipo_hab");
    TokenType t = current().type;
    if (t == TokenType::SIMPLE   ||
        t == TokenType::DOBLE    ||
        t == TokenType::SUITE    ||
        t == TokenType::PRESIDENCIAL) {
        agregarTerminal(current());
        advance();
        return true;
    }
    syntaxError("SIMPLE | DOBLE | SUITE | PRESIDENCIAL", current());
    return false;
}

// ── P7: id_cliente → ID_CLIENTE
bool Parser::parseIdCliente() {
    NodoScope scope(*this, "P7", "id_cliente");
    return expect(TokenType::ID_CLIENTE);
}

// ── P8: id_reserva → ID_RESERVA
bool Parser::parseIdReserva() {
    NodoScope scope(*this, "P8", "id_reserva");
    if (current().type == TokenType::ID_RESERVA) {
        agregarTerminal(current());
        advance();
        return true;
    }
    // Error específico: diferenciar si vino un ID_CLIENTE en lugar de ID_RESERVA
    if (current().type == TokenType::ID_CLIENTE) {
        errorCount++;
        std::cerr << "  [ERROR SINTACTICO col " << current().column << "] "
                  << "ID de reserva invalido: '" << current().lexeme
                  << "'. Debe tener formato RESnnnn (ej: RES0042)\n";
        agregarTerminal(current());
        advance(); // recuperacion: consumir el token erroneo
        return false;
    }
    syntaxError("ID_RESERVA (ej: RES0042)", current());
    return false;
}

// ── P9: fecha → FECHA
bool Parser::parseFecha() {
    NodoScope scope(*this, "P9", "fecha");
    return expect(TokenType::FECHA);
}

// ── Punto de entrada ─────────────────────────────────────────
bool Parser::parse() {
    return parseS();
}
