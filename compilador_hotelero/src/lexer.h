#pragma once
#include "token.h"
#include <string>
#include <vector>

// ============================================================
//  LEXER.H — Analizador léxico del compilador hotelero
//  Implementa un AFD manual para tokenizar sentencias
// ============================================================

class Lexer {
public:
    // Constructor: recibe la sentencia completa a analizar
    explicit Lexer(const std::string& input);

    // Tokeniza toda la entrada y retorna la lista de tokens
    // Si hay errores léxicos, los reporta en stderr pero continúa
    std::vector<Token> tokenize();

    // Retorna true si hubo al menos un error léxico
    bool hasErrors() const { return errorCount > 0; }
    int  getErrorCount() const { return errorCount; }

private:
    std::string src;        // Sentencia de entrada
    size_t      pos;        // Posición actual en la cadena
    int         errorCount; // Contador de errores léxicos

    // ── Helpers de navegación ────────────────────────────────
    char  current() const;          // Carácter en pos
    char  peek(int offset = 1) const; // Mirar adelante sin consumir
    char  advance();                // Consume y retorna current
    bool  isEnd() const;            // ¿Llegamos al final?
    void  skipWhitespace();         // Salta espacios y tabs

    // ── Reconocedores por categoría (cada uno es un AFD) ────
    Token readKeywordOrId(int startCol);  // AFD-01 + AFD-04
    Token readDate(int startCol);         // AFD-03: DD/MM/AAAA
    Token readInteger(int startCol);      // AFD-05: entero positivo
    Token readString(int startCol);       // Cadena entre comillas

    // ── Clasificador de palabras ─────────────────────────────
    TokenType classifyWord(const std::string& word) const;

    // ── Reporte de error ─────────────────────────────────────
    Token makeError(const std::string& msg, int col);
};
