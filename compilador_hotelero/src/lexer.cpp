#include "lexer.h"
#include <iostream>
#include <cctype>
#include <unordered_map>

// ============================================================
//  LEXER.CPP — Implementación del analizador léxico
// ============================================================

// ── Constructor ──────────────────────────────────────────────
Lexer::Lexer(const std::string& input)
    : src(input), pos(0), errorCount(0) {}

// ── Helpers de navegación ────────────────────────────────────

char Lexer::current() const {
    if (isEnd()) return '\0';
    return src[pos];
}

char Lexer::peek(int offset) const {
    size_t p = pos + offset;
    if (p >= src.size()) return '\0';
    return src[p];
}

char Lexer::advance() {
    char c = current();
    if (!isEnd()) pos++;
    return c;
}

bool Lexer::isEnd() const {
    return pos >= src.size();
}

void Lexer::skipWhitespace() {
    while (!isEnd() && (current() == ' ' || current() == '\t'))
        advance();
}

// ── Reporte de error ─────────────────────────────────────────

Token Lexer::makeError(const std::string& msg, int col) {
    errorCount++;
    std::cerr << "  [ERROR LEXICO col " << col << "] " << msg << "\n";
    return Token(TokenType::ERROR, msg, col);
}

// ── Clasificador de palabras clave ───────────────────────────
// AFD-01: palabras clave del dominio hotelero
// AFD-02: tipos de habitación
// AFD-04: identificadores de cliente y reserva

TokenType Lexer::classifyWord(const std::string& w) const {
    // Tabla de palabras clave (lookup O(1))
    static const std::unordered_map<std::string, TokenType> keywords = {
        {"RESERVAR",       TokenType::RESERVAR},
        {"CANCELAR",       TokenType::CANCELAR},
        {"CONSULTAR",      TokenType::CONSULTAR},
        {"DISPONIBILIDAD", TokenType::DISPONIBILIDAD},
        {"HABITACION",     TokenType::HABITACION},
        {"CLIENTE",        TokenType::CLIENTE},
        {"RESERVA",        TokenType::RESERVA},
        {"PARA",           TokenType::PARA},
        {"DESDE",          TokenType::DESDE},
        {"HASTA",          TokenType::HASTA},
        {"NOCHES",         TokenType::NOCHES},
        {"TIPO",           TokenType::TIPO},
        {"FECHA",          TokenType::FECHA_KW},
        // Tipos de habitación (AFD-02)
        {"SIMPLE",         TokenType::SIMPLE},
        {"DOBLE",          TokenType::DOBLE},
        {"SUITE",          TokenType::SUITE},
        {"PRESIDENCIAL",   TokenType::PRESIDENCIAL},
    };

    auto it = keywords.find(w);
    if (it != keywords.end()) return it->second;

    // AFD-04 revisado: ID_RESERVA tiene formato RES[0-9]{4}
    // Detectar formato RES seguido de exactamente 4 dígitos
    if (w.size() == 7 &&
        w[0] == 'R' && w[1] == 'E' && w[2] == 'S' &&
        std::isdigit(w[3]) && std::isdigit(w[4]) &&
        std::isdigit(w[5]) && std::isdigit(w[6])) {
        return TokenType::ID_RESERVA;
    }

    // AFD-04: ID_CLIENTE = [A-Z][A-Z0-9]{3,9} → longitud total 4–10
    // Primera letra mayúscula, resto mayúsculas o dígitos
    if (w.size() >= 4 && w.size() <= 10) {
        bool valid = std::isupper(w[0]);
        for (size_t i = 1; i < w.size() && valid; i++)
            valid = std::isupper(w[i]) || std::isdigit(w[i]);
        if (valid) return TokenType::ID_CLIENTE;
    }

    return TokenType::ERROR;
}

// ── AFD-01 / AFD-02 / AFD-04: Palabras y identificadores ────

Token Lexer::readKeywordOrId(int startCol) {
    std::string lexeme;

    // Consumir mientras sea letra mayúscula o dígito
    while (!isEnd() && (std::isupper(current()) || std::isdigit(current())))
        lexeme += advance();

    TokenType type = classifyWord(lexeme);

    if (type == TokenType::ERROR) {
        return makeError("Token no reconocido: '" + lexeme + "'", startCol);
    }
    return Token(type, lexeme, startCol);
}

// ── AFD-03: Fecha en formato DD/MM/AAAA ─────────────────────
// Estados: q0→q1(d)→q2(d)→q3(/)→q4(d)→q5(d)→q6(/)→q7(d)→q8(d)→q9(d)→qF(d)

Token Lexer::readDate(int startCol) {
    // En este punto ya consumimos los primeros 2 dígitos desde readKeywordOrId
    // Esta función se llama cuando detectamos patrón DD/
    // Retrocedemos y releemos desde el inicio del número
    // Nota: se llama desde tokenize() cuando current es dígito

    std::string lexeme;

    // Leer 2 dígitos del día
    if (!std::isdigit(current()) || !std::isdigit(peek(1)) || peek(2) != '/') {
        // No es una fecha, es un entero
        return readInteger(startCol);
    }

    lexeme += advance(); // D1
    lexeme += advance(); // D2
    lexeme += advance(); // '/'

    // 2 dígitos del mes
    if (!std::isdigit(current()) || !std::isdigit(peek(1)) || peek(2) != '/') {
        return makeError("Formato de fecha invalido, se esperaba DD/MM/AAAA", startCol);
    }
    lexeme += advance(); // M1
    lexeme += advance(); // M2
    lexeme += advance(); // '/'

    // 4 dígitos del año
    for (int i = 0; i < 4; i++) {
        if (!std::isdigit(current())) {
            return makeError("Formato de fecha invalido, anio incompleto", startCol);
        }
        lexeme += advance();
    }

    // Validar que no siga otro dígito (evitar fechas mal formadas)
    if (!isEnd() && std::isdigit(current())) {
        return makeError("Formato de fecha invalido: demasiados digitos", startCol);
    }

    return Token(TokenType::FECHA, lexeme, startCol);
}

// ── AFD-05: Entero positivo [1-9][0-9]* ──────────────────────

Token Lexer::readInteger(int startCol) {
    std::string lexeme;

    // q0→q1: primer dígito debe ser [1-9]
    if (current() == '0') {
        lexeme += advance();
        // Si el siguiente es dígito → error (cero a la izquierda)
        if (!isEnd() && std::isdigit(current())) {
            while (!isEnd() && std::isdigit(current()))
                lexeme += advance();
            return makeError("Entero con cero inicial no permitido: '" + lexeme + "'", startCol);
        }
        return Token(TokenType::ENTERO, lexeme, startCol); // "0" solo no es válido según AFD
    }

    // q1→qF: ciclo [0-9]*
    while (!isEnd() && std::isdigit(current()))
        lexeme += advance();

    return Token(TokenType::ENTERO, lexeme, startCol);
}

// ── Cadena entre comillas dobles ─────────────────────────────

Token Lexer::readString(int startCol) {
    std::string lexeme;
    advance(); // consumir '"' inicial

    while (!isEnd() && current() != '"') {
        lexeme += advance();
    }

    if (isEnd()) {
        return makeError("Cadena sin cerrar (falta la comilla de cierre)", startCol);
    }
    advance(); // consumir '"' final

    if (lexeme.empty()) {
        return makeError("Cadena vacia no permitida", startCol);
    }

    return Token(TokenType::CADENA, lexeme, startCol);
}

// ── Tokenizador principal ────────────────────────────────────

std::vector<Token> Lexer::tokenize() {
    std::vector<Token> tokens;

    while (true) {
        skipWhitespace();

        if (isEnd()) {
            tokens.emplace_back(TokenType::FIN, "$", (int)pos + 1);
            break;
        }

        int col = (int)pos + 1; // columna base 1
        char c  = current();

        // ── Letra mayúscula → palabra clave o identificador
        if (std::isupper(c)) {
            tokens.push_back(readKeywordOrId(col));
        }
        // ── Dígito → fecha o entero
        else if (std::isdigit(c)) {
            // Detectar si es fecha: patrón DD/MM/AAAA
            // Comprobamos: pos+2 es '/' y pos+5 es '/'
            if (std::isdigit(peek(1)) && peek(2) == '/' &&
                std::isdigit(peek(3)) && std::isdigit(peek(4)) && peek(5) == '/') {
                tokens.push_back(readDate(col));
            } else {
                tokens.push_back(readInteger(col));
            }
        }
        // ── Comilla doble → cadena
        else if (c == '"') {
            tokens.push_back(readString(col));
        }
        // ── Carácter no reconocido
        else {
            std::string bad(1, c);
            advance();
            tokens.push_back(makeError("Caracter no reconocido: '" + bad + "'", col));
        }
    }

    return tokens;
}
