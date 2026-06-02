#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include "lexer.h"
#include "parser.h"
#include "semantic.h"

#ifdef _WIN32
#include <windows.h>
#endif

// ============================================================
//  MAIN.CPP — Compilador de Reservas Hoteleras
//  Fase 1: Léxico  |  Fase 2: Sintáctico  |  Fase 3: Semántico
// ============================================================

// Rutas a los archivos de datos (ajustar según tu sistema)
const std::string ARCHIVO_CLIENTES = "data/clientes.txt";
const std::string ARCHIVO_RESERVAS = "data/reservas.txt";

void printSep() {
    std::cout << "\n  ------------------------------------------------------\n";
}

void printTokenTable(const std::vector<Token>& tokens) {
    std::cout << "\n  +----------+------------------+--------------------+\n";
    std::cout << "  | COL      | TIPO             | LEXEMA             |\n";
    std::cout << "  +----------+------------------+--------------------+\n";
    for (const auto& tok : tokens) {
        if (tok.type == TokenType::FIN) break;
        std::string name = tokenTypeName(tok.type);
        std::string lexeme = tok.lexeme;
        if (lexeme.size() > 18) lexeme = lexeme.substr(0, 15) + "...";
        if (name.size() > 16) name = name.substr(0, 13) + "...";
        printf("  | %-8d | %-16s | %-18s |\n",
            tok.column, name.c_str(), lexeme.c_str());
    }
    std::cout << "  +----------+------------------+--------------------+\n";
}

void printReglas(const std::vector<ResultadoRegla>& reglas) {
    std::cout << "\n  Verificacion de reglas semanticas:\n\n";
    std::cout << "  +-------+--------+-----------------------------------------+\n";
    std::cout << "  | REGLA | ESTADO | DETALLE                                 |\n";
    std::cout << "  +-------+--------+-----------------------------------------+\n";
    for (const auto& r : reglas) {
        std::string estado = r.ok ? "  OK  " : "ERROR ";
        std::string detalle = r.mensaje;
        if (detalle.size() > 39) detalle = detalle.substr(0, 36) + "...";
        printf("  | %-5s | %-6s | %-39s |\n",
            r.codigo.c_str(), estado.c_str(), detalle.c_str());
    }
    std::cout << "  +-------+--------+-----------------------------------------+\n";
}

void processSentence(const std::string& sentence, int caseNum,
    const std::string& archClientes,
    const std::string& archReservas) {
    std::cout << "\n  ======================================================\n";
    std::cout << "  CASO #" << caseNum << "\n";
    std::cout << "  Entrada: " << sentence << "\n";
    std::cout << "  ======================================================\n";

    // ── FASE 1: Léxico ───────────────────────────────────────
    std::cout << "\n  [FASE 1] Analisis Lexico...\n";
    Lexer lexer(sentence);
    auto tokens = lexer.tokenize();

    if (lexer.hasErrors()) {
        std::cout << "  Resultado: ERRORES LEXICOS (" << lexer.getErrorCount() << ")\n";
        printTokenTable(tokens);
        std::cout << "\n  RESULTADO FINAL: INVALIDO (errores lexicos)\n";
        return;
    }
    std::cout << "  Resultado: OK — " << tokens.size() - 1 << " tokens\n";
    printTokenTable(tokens);

    // ── FASE 2: Sintáctico ───────────────────────────────────
    printSep();
    std::cout << "\n  [FASE 2] Analisis Sintactico...\n";
    Parser parser(tokens);
    parser.parse();

    if (parser.hasErrors()) {
        std::cout << "  Resultado: ERRORES SINTACTICOS (" << parser.getErrorCount() << ")\n";
        std::cout << "\n  RESULTADO FINAL: INVALIDO (errores sintacticos)\n";
        return;
    }
    std::cout << "  Resultado: OK — Estructura valida\n";

    // ── FASE 3: Semántico ────────────────────────────────────
    printSep();
    std::cout << "\n  [FASE 3] Analisis Semantico...\n";
    Semantic sem(archClientes, archReservas);
    bool semOk = sem.validate(tokens);

    printReglas(sem.getResultados());

    if (sem.hasErrors()) {
        std::cout << "\n  Resultado: ERRORES SEMANTICOS (" << sem.getErrorCount() << ")\n";
    }
    else {
        std::cout << "\n  Resultado: OK — Todas las reglas cumplidas\n";
    }

    // ── Resultado final ──────────────────────────────────────
    printSep();
    if (semOk) {
        std::cout << "\n  RESULTADO FINAL: SENTENCIA COMPLETAMENTE VALIDA\n";
        std::cout << "  >> Lexica OK | Sintactica OK | Semantica OK\n";
    }
    else {
        std::cout << "\n  RESULTADO FINAL: INVALIDO (errores semanticos)\n";
    }
}

int main(int argc, char* argv[]) {
#ifdef _WIN32
    SetConsoleOutputCP(CP_UTF8);
#endif

    std::cout << "\n";
    std::cout << "  +==================================================+\n";
    std::cout << "  |   COMPILADOR DE RESERVAS HOTELERAS               |\n";
    std::cout << "  |   Fase 1: Lexico                                 |\n";
    std::cout << "  |   Fase 2: Sintactico                             |\n";
    std::cout << "  |   Fase 3: Semantico                              |\n";
    std::cout << "  |   Curso: Compiladores 2026                       |\n";
    std::cout << "  +==================================================+\n";

    // Modo archivo
    if (argc == 2) {
        std::ifstream file(argv[1]);
        if (!file.is_open()) {
            std::cerr << "\n  Error: No se pudo abrir '" << argv[1] << "'\n";
            return 1;
        }
        std::string line;
        int caseNum = 1;
        while (std::getline(file, line)) {
            if (line.empty() || line[0] == '#') continue;
            processSentence(line, caseNum++, ARCHIVO_CLIENTES, ARCHIVO_RESERVAS);
        }
        return 0;
    }

    // Modo interactivo
    std::cout << "\n  Escribe una sentencia (o 'salir' para terminar):\n";
    std::cout << "  Ejemplos:\n";
    std::cout << "    RESERVAR HABITACION DOBLE PARA CLIENTE CLI001 DESDE 15/06/2026 HASTA 20/06/2026\n";
    std::cout << "    CANCELAR RESERVA RES0042\n";
    std::cout << "    CONSULTAR DISPONIBILIDAD SUITE DESDE 01/07/2026 HASTA 05/07/2026\n\n";

    std::string input;
    int caseNum = 1;
    while (true) {
        std::cout << "\n  >> ";
        std::getline(std::cin, input);
        if (input == "salir" || input == "SALIR" || std::cin.eof()) break;
        if (input.empty()) continue;
        processSentence(input, caseNum++, ARCHIVO_CLIENTES, ARCHIVO_RESERVAS);
    }

    std::cout << "\n  Compilador finalizado.\n\n";
    return 0;
}
