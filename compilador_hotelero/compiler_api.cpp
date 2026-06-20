// ============================================================
//  COMPILER_API.CPP — Puente Emscripten/Embind del compilador
//
//  Expone una unica funcion a JavaScript:
//      analizarTexto(string) -> string (JSON)
//
//  Acepta el contenido completo de un archivo .txt (o una sola
//  sentencia escrita a mano, tratada como archivo de 1 linea).
//  Cada linea se analiza por separado; lineas vacias o que
//  empiezan con '#' se ignoran (igual que el modo archivo de
//  main.cpp).
//
//  Reutiliza tal cual lexer.cpp, parser.cpp y semantic.cpp: no
//  se modifica el escaneo, el parseo ni la validacion semantica.
//  Aqui solo se agrega:
//    - La serializacion a JSON de tokens, AST y reglas.
//    - Los automatas lexicos estaticos (AFND/AFD/tabla de
//      transicion), uno por categoria, mas el simulador que
//      calcula el camino que siguio cada token concreto.
// ============================================================

#include <string>
#include <vector>
#include <sstream>
#include <cstdio>
#include <cctype>

#include "lexer.h"
#include "parser.h"
#include "semantic.h"
#include "ast.h"

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
//  AUTOMATAS LEXICOS ESTATICOS (AFND / AFD / tabla de transicion)
//
//  Son datos, no logica de escaneo: reflejan el diseno teorico
//  de cada reconocedor de lexer.cpp (readKeywordOrId, readDate,
//  readInteger, readString). La clasificacion fina que hace el
//  codigo real despues de aceptar el patron (classifyWord, chequeo
//  de cero inicial, chequeo de cadena vacia) se documenta como
//  "validacion posterior" y no forma parte del automata.
// ============================================================

struct Transicion {
    std::string desde, simbolo, hasta;
};

struct Automata {
    std::vector<std::string> estados;
    std::vector<std::string> alfabeto;
    std::string               inicial;
    std::vector<std::string> finales;
    std::vector<Transicion>  transiciones;
};

struct CategoriaLexica {
    std::string nombre;
    std::string descripcion;
    Automata    afnd;
    Automata    afd;
};

static std::string destinoDesde(const Automata& a, const std::string& estado, const std::string& simbolo) {
    for (const auto& t : a.transiciones)
        if (t.desde == estado && t.simbolo == simbolo) return t.hasta;
    return "";
}

static std::vector<CategoriaLexica> construirAutomatasLexicos() {
    std::vector<CategoriaLexica> cats;

    // ── Categoria 1: palabras clave / identificadores (AFD-01/02/04) ──
    {
        CategoriaLexica c;
        c.nombre = "palabras_clave_identificadores";
        c.descripcion =
            "Reconoce la forma lexica de palabras clave, tipos de habitacion, ID_CLIENTE e "
            "ID_RESERVA: una mayuscula inicial seguida de mayusculas o digitos. La clasificacion "
            "final (palabra clave concreta, ID_CLIENTE, ID_RESERVA o error) se hace por tabla de "
            "lookup despues de aceptar el AFD, igual que Lexer::classifyWord.";
        c.afnd = {
            {"q0", "q1", "qF"}, {"MAYUSCULA", "DIGITO"}, "q0", {"qF"},
            {
                {"q0", "MAYUSCULA", "q1"},
                {"q1", "MAYUSCULA", "q1"},
                {"q1", "DIGITO",    "q1"},
                {"q1", "epsilon",   "qF"},
            }
        };
        c.afd = {
            {"q0", "q1"}, {"MAYUSCULA", "DIGITO"}, "q0", {"q1"},
            {
                {"q0", "MAYUSCULA", "q1"},
                {"q1", "MAYUSCULA", "q1"},
                {"q1", "DIGITO",    "q1"},
            }
        };
        cats.push_back(std::move(c));
    }

    // ── Categoria 2: fechas DD/MM/AAAA (AFD-03) ──
    {
        CategoriaLexica c;
        c.nombre = "fechas";
        c.descripcion =
            "Reconoce el patron fijo DD/MM/AAAA. Al tener longitud constante el AFND ya es "
            "deterministico (sin epsilon-transiciones ni ambiguedad), igual que Lexer::readDate.";
        Automata a;
        a.estados   = {"q0","q1","q2","q3","q4","q5","q6","q7","q8","q9","q10"};
        a.alfabeto  = {"DIGITO", "SLASH"};
        a.inicial   = "q0";
        a.finales   = {"q10"};
        a.transiciones = {
            {"q0","DIGITO","q1"}, {"q1","DIGITO","q2"}, {"q2","SLASH","q3"},
            {"q3","DIGITO","q4"}, {"q4","DIGITO","q5"}, {"q5","SLASH","q6"},
            {"q6","DIGITO","q7"}, {"q7","DIGITO","q8"}, {"q8","DIGITO","q9"},
            {"q9","DIGITO","q10"},
        };
        c.afnd = a;
        c.afd  = a;
        cats.push_back(std::move(c));
    }

    // ── Categoria 3: enteros positivos [1-9][0-9]* (AFD-05) ──
    {
        CategoriaLexica c;
        c.nombre = "enteros";
        c.descripcion =
            "Acepta '0' solo, o un digito 1-9 seguido de cualquier cantidad de digitos. qE es un "
            "estado de error: representa un cero inicial seguido de mas digitos, rechazado por "
            "Lexer::readInteger.";
        Automata a;
        a.estados  = {"q0","q1","q2","qE"};
        a.alfabeto = {"DIGITO_1_9", "CERO", "DIGITO"};
        a.inicial  = "q0";
        a.finales  = {"q1","q2"};
        a.transiciones = {
            {"q0","DIGITO_1_9","q1"},
            {"q1","DIGITO","q1"},
            {"q0","CERO","q2"},
            {"q2","DIGITO","qE"},
            {"qE","DIGITO","qE"},
        };
        c.afnd = a;
        c.afd  = a;
        cats.push_back(std::move(c));
    }

    // ── Categoria 4: cadenas entre comillas ──
    {
        CategoriaLexica c;
        c.nombre = "cadenas";
        c.descripcion =
            "Cualquier secuencia entre comillas dobles. La cadena vacia se acepta por el AFD "
            "pero se rechaza despues por validacion posterior, igual que Lexer::readString.";
        Automata a;
        a.estados  = {"q0","q1","q2"};
        a.alfabeto = {"COMILLA", "OTRO"};
        a.inicial  = "q0";
        a.finales  = {"q2"};
        a.transiciones = {
            {"q0","COMILLA","q1"},
            {"q1","OTRO","q1"},
            {"q1","COMILLA","q2"},
        };
        c.afnd = a;
        c.afd  = a;
        cats.push_back(std::move(c));
    }

    return cats;
}

// ── Serializa un Automata (AFND o AFD) a JSON ────────────────
static std::string automataToJson(const Automata& a) {
    std::ostringstream o;
    o << '{' << "\"estados\":[";
    for (size_t i = 0; i < a.estados.size(); i++) {
        if (i) o << ',';
        o << '"' << a.estados[i] << '"';
    }
    o << "],\"alfabeto\":[";
    for (size_t i = 0; i < a.alfabeto.size(); i++) {
        if (i) o << ',';
        o << '"' << a.alfabeto[i] << '"';
    }
    o << "],";
    kvStr(o, "inicial", a.inicial);
    o << ",\"finales\":[";
    for (size_t i = 0; i < a.finales.size(); i++) {
        if (i) o << ',';
        o << '"' << a.finales[i] << '"';
    }
    o << "],\"transiciones\":[";
    for (size_t i = 0; i < a.transiciones.size(); i++) {
        if (i) o << ',';
        const auto& t = a.transiciones[i];
        o << '{';
        kvStr(o, "desde", t.desde); o << ',';
        kvStr(o, "simbolo", t.simbolo); o << ',';
        kvStr(o, "hasta", t.hasta);
        o << '}';
    }
    o << "]}";
    return o.str();
}

// ── Serializa la tabla de transicion del AFD (filas: estado x simbolo) ──
static std::string tablaTransicionToJson(const Automata& afd) {
    std::ostringstream o;
    o << '[';
    for (size_t i = 0; i < afd.estados.size(); i++) {
        if (i) o << ',';
        const std::string& estado = afd.estados[i];
        o << '{';
        kvStr(o, "estado", estado);
        for (const auto& simbolo : afd.alfabeto) {
            o << ',';
            std::string destino = destinoDesde(afd, estado, simbolo);
            kvStr(o, simbolo, destino.empty() ? "-" : destino);
        }
        o << '}';
    }
    o << ']';
    return o.str();
}

static std::string categoriaToJson(const CategoriaLexica& c) {
    std::ostringstream o;
    o << '{';
    kvStr(o, "categoria", c.nombre); o << ',';
    kvStr(o, "descripcion", c.descripcion); o << ',';
    o << "\"afnd\":" << automataToJson(c.afnd) << ',';
    o << "\"afd\":" << automataToJson(c.afd) << ',';
    o << "\"tablaTransicion\":" << tablaTransicionToJson(c.afd);
    o << '}';
    return o.str();
}

// ── Mapea cada TokenType a su categoria lexica ───────────────
// FIN y ERROR no tienen categoria: el lexema de un token ERROR es el
// mensaje de error (no el texto original), asi que no se simula camino.
static std::string categoriaParaToken(TokenType t) {
    switch (t) {
        case TokenType::FECHA:  return "fechas";
        case TokenType::ENTERO: return "enteros";
        case TokenType::CADENA: return "cadenas";
        case TokenType::FIN:
        case TokenType::ERROR:  return "";
        default:                return "palabras_clave_identificadores";
    }
}

// ── Simula el camino de estados que sigue un lexema concreto ────
// sobre el AFD de su categoria (no toca el escaneo real del lexer).
static std::vector<std::string> simularCamino(const std::string& categoria, const std::string& lexema) {
    std::vector<std::string> camino;

    if (categoria == "palabras_clave_identificadores") {
        if (lexema.empty()) return camino;
        camino.push_back("q0");
        camino.push_back("q1"); // primera mayuscula: q0 -> q1
        for (size_t i = 1; i < lexema.size(); i++) camino.push_back("q1"); // loop en q1
        return camino;
    }

    if (categoria == "fechas") {
        static const char* secuencia[] = {"q1","q2","q3","q4","q5","q6","q7","q8","q9","q10"};
        camino.push_back("q0");
        for (size_t i = 0; i < lexema.size() && i < 10; i++) camino.push_back(secuencia[i]);
        return camino;
    }

    if (categoria == "enteros") {
        if (lexema.empty()) return camino;
        camino.push_back("q0");
        if (lexema[0] == '0') {
            camino.push_back("q2");
            for (size_t i = 1; i < lexema.size(); i++) camino.push_back("qE");
        } else {
            camino.push_back("q1");
            for (size_t i = 1; i < lexema.size(); i++) camino.push_back("q1");
        }
        return camino;
    }

    if (categoria == "cadenas") {
        camino.push_back("q0");
        camino.push_back("q1"); // comilla de apertura
        for (size_t i = 0; i < lexema.size(); i++) camino.push_back("q1");
        camino.push_back("q2"); // comilla de cierre
        return camino;
    }

    return camino;
}

// ── Serializa un nodo del AST (y sus hijos) a JSON ───────────
static std::string nodoAstToJson(const NodoAST& n) {
    std::ostringstream o;
    o << '{';
    kvStr(o, "regla", n.regla); o << ',';
    kvStr(o, "simbolo", n.simbolo); o << ',';
    kvStr(o, "lexema", n.lexema); o << ',';
    o << "\"col\":" << n.col << ',';
    o << "\"hijos\":[";
    for (size_t i = 0; i < n.hijos.size(); i++) {
        if (i) o << ',';
        o << nodoAstToJson(n.hijos[i]);
    }
    o << "]}";
    return o.str();
}

// ============================================================
//  Analisis de una sola sentencia (una linea del archivo)
// ============================================================
struct ResultadoSentencia {
    std::string json;
    bool        valido;
};

static ResultadoSentencia analizarUnaSentencia(const std::string& sentencia, int numero, int lineaArchivo) {
    std::ostringstream out;
    out << '{';
    out << "\"numero\":" << numero << ',';
    out << "\"lineaArchivo\":" << lineaArchivo << ',';
    kvStr(out, "entrada", sentencia); out << ',';

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

        std::string categoria = categoriaParaToken(tok.type);
        out << '{';
        out << "\"col\":" << tok.column << ',';
        kvStr(out, "tipo", tokenTypeName(tok.type)); out << ',';
        kvStr(out, "lexema", tok.lexeme); out << ',';
        kvStr(out, "categoria", categoria); out << ',';
        out << "\"camino\":[";
        if (!categoria.empty()) {
            auto camino = simularCamino(categoria, tok.lexeme);
            for (size_t i = 0; i < camino.size(); i++) {
                if (i) out << ',';
                out << '"' << camino[i] << '"';
            }
        }
        out << "]}";
    }
    out << "]}"; // cierra tokens y lexico

    if (!lexOk) {
        out << ',';
        out << "\"sintactico\":{\"ok\":false,\"errores\":0,\"evaluado\":false,\"ast\":null},";
        out << "\"semantico\":{\"ok\":false,\"errores\":0,\"evaluado\":false,\"reglas\":[]},";
        out << "\"resultadoFinal\":{\"valido\":false,"
               "\"mensaje\":\"INVALIDO (errores lexicos)\"}";
        out << '}';
        return {out.str(), false};
    }

    // ── FASE 2: Sintactico ───────────────────────────────────
    Parser parser(tokens);
    parser.parse();
    bool sintOk = !parser.hasErrors();

    out << ',';
    out << "\"sintactico\":{";
    out << "\"ok\":" << (sintOk ? "true" : "false") << ',';
    out << "\"errores\":" << parser.getErrorCount() << ',';
    out << "\"evaluado\":true,";
    out << "\"ast\":" << nodoAstToJson(parser.getAST());
    out << '}';

    if (!sintOk) {
        out << ',';
        out << "\"semantico\":{\"ok\":false,\"errores\":0,\"evaluado\":false,\"reglas\":[]},";
        out << "\"resultadoFinal\":{\"valido\":false,"
               "\"mensaje\":\"INVALIDO (errores sintacticos)\"}";
        out << '}';
        return {out.str(), false};
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
    out << "]}"; // cierra reglas y semantico

    // ── Resultado final ──────────────────────────────────────
    out << ',';
    out << "\"resultadoFinal\":{";
    out << "\"valido\":" << (semOk ? "true" : "false") << ',';
    kvStr(out, "mensaje", semOk
              ? "SENTENCIA COMPLETAMENTE VALIDA"
              : "INVALIDO (errores semanticos)");
    out << '}';

    out << '}';
    return {out.str(), semOk};
}

// ============================================================
//  Funcion principal expuesta a JavaScript
//
//  Recibe el contenido completo de un archivo .txt (puede ser
//  una sola linea). Cada linea no vacia y que no empiece con '#'
//  se analiza como una sentencia independiente.
// ============================================================
std::string analizarTexto(const std::string& contenido) {
    static const std::vector<CategoriaLexica> automatas = construirAutomatasLexicos();

    std::ostringstream out;
    out << '{';
    out << "\"automatasLexicos\":[";
    for (size_t i = 0; i < automatas.size(); i++) {
        if (i) out << ',';
        out << categoriaToJson(automatas[i]);
    }
    out << "],";

    std::vector<std::string> resultadosJson;
    int totalValidas = 0, totalInvalidas = 0;
    int numeroSentencia = 1;
    int numeroLinea = 0;

    std::istringstream entrada(contenido);
    std::string linea;
    while (std::getline(entrada, linea)) {
        numeroLinea++;
        if (!linea.empty() && linea.back() == '\r') linea.pop_back(); // CRLF

        if (linea.empty() || linea[0] == '#') continue; // igual que main.cpp

        ResultadoSentencia r = analizarUnaSentencia(linea, numeroSentencia, numeroLinea);
        resultadosJson.push_back(r.json);
        if (r.valido) totalValidas++; else totalInvalidas++;
        numeroSentencia++;
    }

    out << "\"totalSentencias\":" << resultadosJson.size() << ',';
    out << "\"resultados\":[";
    for (size_t i = 0; i < resultadosJson.size(); i++) {
        if (i) out << ',';
        out << resultadosJson[i];
    }
    out << "],";
    out << "\"resumen\":{";
    out << "\"totalValidas\":" << totalValidas << ',';
    out << "\"totalInvalidas\":" << totalInvalidas;
    out << '}';

    out << '}';
    return out.str();
}

// ============================================================
//  Enlace Embind: expone la funcion al mundo JavaScript
// ============================================================
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(compilador_hotelero) {
    emscripten::function("analizarTexto", &analizarTexto);
}
#endif
