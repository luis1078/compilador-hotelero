#pragma once
#include <string>

// ============================================================
//  TOKEN.H — Definición de tokens del lenguaje de reservas
//  Compilador Hotelero — Curso: Compiladores 2026
// ============================================================

enum class TokenType {
    // ── Palabras clave (comandos) ────────────────────────────
    RESERVAR,           // "RESERVAR"
    CANCELAR,           // "CANCELAR"
    CONSULTAR,          // "CONSULTAR"
    DISPONIBILIDAD,     // "DISPONIBILIDAD"
    HABITACION,         // "HABITACION"
    CLIENTE,            // "CLIENTE"
    RESERVA,            // "RESERVA"
    PARA,               // "PARA"
    DESDE,              // "DESDE"
    HASTA,              // "HASTA"
    NOCHES,             // "NOCHES"
    TIPO,               // "TIPO"
    FECHA_KW,           // "FECHA" (palabra clave)

    // ── Tipos de habitación ──────────────────────────────────
    SIMPLE,             // "SIMPLE"
    DOBLE,              // "DOBLE"
    SUITE,              // "SUITE"
    PRESIDENCIAL,       // "PRESIDENCIAL"

    // ── Literales ────────────────────────────────────────────
    FECHA,              // DD/MM/AAAA  ej: 15/06/2026
    ID_CLIENTE,         // [A-Z][A-Z0-9]{3,9}  ej: CLI001
    ID_RESERVA,         // RES[0-9]{4}          ej: RES0042
    CADENA,             // "nombre entre comillas"
    ENTERO,             // [1-9][0-9]*

    // ── Especiales ───────────────────────────────────────────
    FIN,                // Fin de entrada ($)
    ERROR               // Token inválido
};

// Convierte un TokenType a su nombre legible
inline std::string tokenTypeName(TokenType t) {
    switch (t) {
        case TokenType::RESERVAR:       return "RESERVAR";
        case TokenType::CANCELAR:       return "CANCELAR";
        case TokenType::CONSULTAR:      return "CONSULTAR";
        case TokenType::DISPONIBILIDAD: return "DISPONIBILIDAD";
        case TokenType::HABITACION:     return "HABITACION";
        case TokenType::CLIENTE:        return "CLIENTE";
        case TokenType::RESERVA:        return "RESERVA";
        case TokenType::PARA:           return "PARA";
        case TokenType::DESDE:          return "DESDE";
        case TokenType::HASTA:          return "HASTA";
        case TokenType::NOCHES:         return "NOCHES";
        case TokenType::TIPO:           return "TIPO";
        case TokenType::FECHA_KW:       return "FECHA_KW";
        case TokenType::SIMPLE:         return "SIMPLE";
        case TokenType::DOBLE:          return "DOBLE";
        case TokenType::SUITE:          return "SUITE";
        case TokenType::PRESIDENCIAL:   return "PRESIDENCIAL";
        case TokenType::FECHA:          return "FECHA";
        case TokenType::ID_CLIENTE:     return "ID_CLIENTE";
        case TokenType::ID_RESERVA:     return "ID_RESERVA";
        case TokenType::CADENA:         return "CADENA";
        case TokenType::ENTERO:         return "ENTERO";
        case TokenType::FIN:            return "FIN";
        case TokenType::ERROR:          return "ERROR";
        default:                        return "DESCONOCIDO";
    }
}

// Estructura que representa un token reconocido
struct Token {
    TokenType   type;       // Tipo del token
    std::string lexeme;     // Texto original reconocido
    int         column;     // Columna donde inicia (base 1)

    Token(TokenType t, std::string lex, int col)
        : type(t), lexeme(std::move(lex)), column(col) {}
};
