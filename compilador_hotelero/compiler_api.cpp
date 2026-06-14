// ============================================================
//  COMPILER_API.CPP — Puente Emscripten/Embind del compilador
//
//  Expone una unica funcion a JavaScript:
//      analizarSentencia(string) -> string (JSON)
//
//  Reutiliza tal cual lexer.cpp, parser.cpp y semantic.cpp.
//  El resultado se entrega como JSON para que la futura
//  interfaz React lo consuma directamente.
// ============================================================

#include <string>
#include <vector>
#include <sstream>
#include <cstdio>

#include "lexer.h"
#include "parser.h"
#include "semantic.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#endif

// Rutas dentro del sistema de archivos virtual (MEMFS) de Emscripten.
// Se incrustan en el binario con --embed-file durante la compilacion.
static const std::string ARCHIVO_CLIENTES = "data/clientes.txt";
static const std::string ARCHIVO_RESERVAS = "data/reservas.txt";

// ── Escapa una cadena para insertarla en JSON ───────────────
static std::string jsonEscape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b";  break;
            case '\f': out += "\\f";  break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += c;
                }
        }
    }
    return out;
}

// Helper: agrega un par "clave":"valor" string al stream
static void kvStr(std::ostringstream& o, const std::string& k, const std::string& v) {
    o << '"' << k << "\":\"" << jsonEscape(v) << '"';
}

// ============================================================
//  Funcion principal expuesta a JavaScript
// ============================================================
std::string analizarSentencia(const std::string& sentencia) {
    std::ostringstream out;
    out << '{';
    out << "\"entrada\":\"" << jsonEscape(sentencia) << "\",";

    // ── FASE 1: Lexico ───────────────────────────────────────
    Lexer lexer(sentencia);
    std::vector<Token> tokens = lexer.tokenize();
    bool lexOk = !lexer.hasErrors();

    out << "\"lexico\":{";
    out << "\"ok\":" << (lexOk ? "true" : "false") << ',';
    out << "\"errores\":" << lexer.getErrorCount() << ',';
    out << "\"tokens\":[";
    bool first = true;
    for (const auto& tok : tokens) {
        if (tok.type == TokenType::FIN) break;
        if (!first) out << ',';
        first = false;
        out << '{';
        out << "\"col\":" << tok.column << ',';
        kvStr(out, "tipo", tokenTypeName(tok.type)); out << ',';
        kvStr(out, "lexema", tok.lexeme);
        out << '}';
    }
    out << "]}";  // cierra tokens y lexico

    if (!lexOk) {
        out << ',';
        out << "\"sintactico\":{\"ok\":false,\"errores\":0,\"evaluado\":false},";
        out << "\"semantico\":{\"ok\":false,\"errores\":0,\"evaluado\":false,\"reglas\":[]},";
        out << "\"resultadoFinal\":{\"valido\":false,"
               "\"mensaje\":\"INVALIDO (errores lexicos)\"}";
        out << '}';
        return out.str();
    }

    // ── FASE 2: Sintactico ───────────────────────────────────
    Parser parser(tokens);
    parser.parse();
    bool sintOk = !parser.hasErrors();

    out << ',';
    out << "\"sintactico\":{";
    out << "\"ok\":" << (sintOk ? "true" : "false") << ',';
    out << "\"errores\":" << parser.getErrorCount() << ',';
    out << "\"evaluado\":true}";

    if (!sintOk) {
        out << ',';
        out << "\"semantico\":{\"ok\":false,\"errores\":0,\"evaluado\":false,\"reglas\":[]},";
        out << "\"resultadoFinal\":{\"valido\":false,"
               "\"mensaje\":\"INVALIDO (errores sintacticos)\"}";
        out << '}';
        return out.str();
    }

    // ── FASE 3: Semantico ────────────────────────────────────
    Semantic sem(ARCHIVO_CLIENTES, ARCHIVO_RESERVAS);
    bool semOk = sem.validate(tokens);

    out << ',';
    out << "\"semantico\":{";
    out << "\"ok\":" << (semOk ? "true" : "false") << ',';
    out << "\"errores\":" << sem.getErrorCount() << ',';
    out << "\"evaluado\":true,";
    out << "\"reglas\":[";
    first = true;
    for (const auto& r : sem.getResultados()) {
        if (!first) out << ',';
        first = false;
        out << '{';
        kvStr(out, "codigo", r.codigo); out << ',';
        out << "\"ok\":" << (r.ok ? "true" : "false") << ',';
        kvStr(out, "mensaje", r.mensaje);
        out << '}';
    }
    out << "]}";  // cierra reglas y semantico

    // ── Resultado final ──────────────────────────────────────
    out << ',';
    out << "\"resultadoFinal\":{";
    out << "\"valido\":" << (semOk ? "true" : "false") << ',';
    kvStr(out, "mensaje", semOk
              ? "SENTENCIA COMPLETAMENTE VALIDA"
              : "INVALIDO (errores semanticos)");
    out << '}';

    out << '}';
    return out.str();
}

// ============================================================
//  Enlace Embind: expone la funcion al mundo JavaScript
// ============================================================
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(compilador_hotelero) {
    emscripten::function("analizarSentencia", &analizarSentencia);
}
#endif
