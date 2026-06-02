#include "semantic.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <ctime>
#include <algorithm>

// ============================================================
//  SEMANTIC.CPP — Implementación del analizador semántico
// ============================================================

// ── Constructor ──────────────────────────────────────────────
Semantic::Semantic(const std::string& archivoClientes,
                   const std::string& archivoReservas)
    : errorCount(0)
{
    cargarClientes(archivoClientes);
    cargarReservas(archivoReservas);
}

// ── Carga de clientes desde archivo ─────────────────────────
// Formato: ID_CLIENTE|NOMBRE
void Semantic::cargarClientes(const std::string& archivo) {
    std::ifstream f(archivo);
    if (!f.is_open()) {
        std::cerr << "  [AVISO] No se pudo abrir clientes: " << archivo
                  << " (se usara base vacia)\n";
        return;
    }
    std::string linea;
    while (std::getline(f, linea)) {
        if (linea.empty() || linea[0] == '#') continue;
        auto pos = linea.find('|');
        if (pos == std::string::npos) continue;
        std::string id     = linea.substr(0, pos);
        std::string nombre = linea.substr(pos + 1);
        clientes[id] = nombre;
    }
}

// ── Carga de reservas desde archivo ─────────────────────────
// Formato: ID_RESERVA|TIPO_HAB|FECHA_ENTRADA|FECHA_SALIDA|ID_CLIENTE|ESTADO
void Semantic::cargarReservas(const std::string& archivo) {
    std::ifstream f(archivo);
    if (!f.is_open()) {
        std::cerr << "  [AVISO] No se pudo abrir reservas: " << archivo
                  << " (se usara base vacia)\n";
        return;
    }
    std::string linea;
    while (std::getline(f, linea)) {
        if (linea.empty() || linea[0] == '#') continue;
        std::istringstream ss(linea);
        std::string campo;
        std::vector<std::string> campos;
        while (std::getline(ss, campo, '|'))
            campos.push_back(campo);
        if (campos.size() < 6) continue;
        Reserva r;
        r.id        = campos[0];
        r.tipoHab   = campos[1];
        r.entrada   = parseFecha(campos[2]);
        r.salida    = parseFecha(campos[3]);
        r.idCliente = campos[4];
        r.estado    = campos[5];
        reservas.push_back(r);
    }
}

// ── Parseo de fecha "DD/MM/AAAA" → struct Fecha ─────────────
Fecha Semantic::parseFecha(const std::string& s) const {
    Fecha f{0, 0, 0};
    if (s.size() != 10) return f;
    f.dia  = std::stoi(s.substr(0, 2));
    f.mes  = std::stoi(s.substr(3, 2));
    f.anio = std::stoi(s.substr(6, 4));
    return f;
}

// ── Fecha actual del sistema ─────────────────────────────────
Fecha Semantic::fechaHoy() const {
    std::time_t t = std::time(nullptr);
    std::tm tm{};
    localtime_s(&tm, &t);
    return Fecha{ tm.tm_mday, tm.tm_mon + 1, tm.tm_year + 1900 };
}

// ── Registrar resultado de una regla ────────────────────────
void Semantic::registrar(const ResultadoRegla& r) {
    resultados.push_back(r);
    if (!r.ok) {
        errorCount++;
        std::cerr << "  [" << r.codigo << " ERROR] " << r.mensaje << "\n";
    }
}

// ============================================================
//  LAS 5 REGLAS SEMÁNTICAS
// ============================================================

// RS01 — La fecha de salida debe ser posterior a la de entrada
ResultadoRegla Semantic::rs01_coherenciaFechas(const Fecha& entrada, const Fecha& salida) {
    ResultadoRegla r;
    r.codigo = "RS01";
    if (salida > entrada) {
        r.ok      = true;
        r.mensaje = "Fechas coherentes: entrada < salida";
    } else {
        r.ok      = false;
        r.mensaje = "La fecha de salida debe ser posterior a la fecha de entrada. "
                    "Entrada: " +
                    std::to_string(entrada.dia) + "/" +
                    std::to_string(entrada.mes) + "/" +
                    std::to_string(entrada.anio) + "  Salida: " +
                    std::to_string(salida.dia) + "/" +
                    std::to_string(salida.mes) + "/" +
                    std::to_string(salida.anio);
    }
    return r;
}

// RS02 — Ninguna fecha puede ser en el pasado
ResultadoRegla Semantic::rs02_fechasNoPasadas(const Fecha& entrada, const Fecha& salida) {
    ResultadoRegla r;
    r.codigo   = "RS02";
    Fecha hoy  = fechaHoy();
    if (entrada < hoy) {
        r.ok      = false;
        r.mensaje = "La fecha de entrada (" +
                    std::to_string(entrada.dia) + "/" +
                    std::to_string(entrada.mes) + "/" +
                    std::to_string(entrada.anio) +
                    ") es anterior a la fecha actual.";
    } else if (salida < hoy) {
        r.ok      = false;
        r.mensaje = "La fecha de salida (" +
                    std::to_string(salida.dia) + "/" +
                    std::to_string(salida.mes) + "/" +
                    std::to_string(salida.anio) +
                    ") es anterior a la fecha actual.";
    } else {
        r.ok      = true;
        r.mensaje = "Fechas no retroactivas: ambas son futuras o presentes.";
    }
    return r;
}

// RS03 — Habitación del tipo solicitado disponible en el rango
// Hay conflicto si: entrada_nueva < salida_existente AND salida_nueva > entrada_existente
ResultadoRegla Semantic::rs03_disponibilidad(const std::string& tipo,
                                              const Fecha& entrada,
                                              const Fecha& salida) {
    ResultadoRegla r;
    r.codigo = "RS03";

    for (const auto& res : reservas) {
        if (res.estado != "ACTIVA") continue;
        if (res.tipoHab != tipo)    continue;

        // Detectar solapamiento de fechas
        bool solapa = (entrada < res.salida) && (salida > res.entrada);
        if (solapa) {
            r.ok      = false;
            r.mensaje = "No hay habitacion " + tipo +
                        " disponible en el rango solicitado. "
                        "Conflicto con reserva " + res.id +
                        " (" + std::to_string(res.entrada.dia) + "/" +
                        std::to_string(res.entrada.mes) + "/" +
                        std::to_string(res.entrada.anio) + " - " +
                        std::to_string(res.salida.dia) + "/" +
                        std::to_string(res.salida.mes) + "/" +
                        std::to_string(res.salida.anio) + ").";
            return r;
        }
    }

    r.ok      = true;
    r.mensaje = "Habitacion " + tipo + " disponible en el rango solicitado.";
    return r;
}

// RS04 — El ID de cliente debe existir en el sistema
ResultadoRegla Semantic::rs04_clienteExiste(const std::string& idCliente) {
    ResultadoRegla r;
    r.codigo = "RS04";
    auto it  = clientes.find(idCliente);
    if (it != clientes.end()) {
        r.ok      = true;
        r.mensaje = "Cliente encontrado: " + it->second + " (" + idCliente + ")";
    } else {
        r.ok      = false;
        r.mensaje = "El identificador de cliente '" + idCliente +
                    "' no existe en el sistema.";
    }
    return r;
}

// RS05 — El ID de reserva debe existir y estar activa
ResultadoRegla Semantic::rs05_reservaActiva(const std::string& idReserva) {
    ResultadoRegla r;
    r.codigo = "RS05";
    for (const auto& res : reservas) {
        if (res.id == idReserva) {
            if (res.estado == "ACTIVA") {
                r.ok      = true;
                r.mensaje = "Reserva " + idReserva + " encontrada y activa.";
            } else {
                r.ok      = false;
                r.mensaje = "La reserva '" + idReserva +
                            "' existe pero ya fue cancelada.";
            }
            return r;
        }
    }
    r.ok      = false;
    r.mensaje = "El identificador de reserva '" + idReserva +
                "' no existe en el sistema.";
    return r;
}

// ============================================================
//  VALIDADORES POR TIPO DE SENTENCIA
// ============================================================

// Extrae el lexema del primer token del tipo dado en la lista
static std::string getLexema(const std::vector<Token>& tokens, TokenType tipo) {
    for (const auto& t : tokens)
        if (t.type == tipo) return t.lexeme;
    return "";
}

// Extrae todos los tokens del tipo FECHA en orden
static std::vector<std::string> getFechas(const std::vector<Token>& tokens) {
    std::vector<std::string> fechas;
    for (const auto& t : tokens)
        if (t.type == TokenType::FECHA) fechas.push_back(t.lexeme);
    return fechas;
}

// Extrae el tipo de habitación
static std::string getTipoHab(const std::vector<Token>& tokens) {
    for (const auto& t : tokens) {
        if (t.type == TokenType::SIMPLE)       return "SIMPLE";
        if (t.type == TokenType::DOBLE)        return "DOBLE";
        if (t.type == TokenType::SUITE)        return "SUITE";
        if (t.type == TokenType::PRESIDENCIAL) return "PRESIDENCIAL";
    }
    return "";
}

// ── Validar sentencia RESERVAR ───────────────────────────────
bool Semantic::validarReserva(const std::vector<Token>& tokens) {
    std::string tipo      = getTipoHab(tokens);
    std::string idCliente = getLexema(tokens, TokenType::ID_CLIENTE);
    auto        fechas    = getFechas(tokens);

    if (fechas.size() < 2) {
        std::cerr << "  [ERROR SEMANTICO] No se encontraron las dos fechas.\n";
        errorCount++;
        return false;
    }

    Fecha entrada = parseFecha(fechas[0]);
    Fecha salida  = parseFecha(fechas[1]);

    registrar(rs01_coherenciaFechas(entrada, salida));
    registrar(rs02_fechasNoPasadas(entrada, salida));
    registrar(rs03_disponibilidad(tipo, entrada, salida));
    registrar(rs04_clienteExiste(idCliente));

    return errorCount == 0;
}

// ── Validar sentencia CANCELAR ───────────────────────────────
bool Semantic::validarCancelacion(const std::vector<Token>& tokens) {
    std::string idReserva = getLexema(tokens, TokenType::ID_RESERVA);
    registrar(rs05_reservaActiva(idReserva));
    return errorCount == 0;
}

// ── Validar sentencia CONSULTAR ──────────────────────────────
bool Semantic::validarConsulta(const std::vector<Token>& tokens) {
    std::string tipo   = getTipoHab(tokens);
    auto        fechas = getFechas(tokens);

    if (fechas.size() < 2) {
        std::cerr << "  [ERROR SEMANTICO] No se encontraron las dos fechas.\n";
        errorCount++;
        return false;
    }

    Fecha entrada = parseFecha(fechas[0]);
    Fecha salida  = parseFecha(fechas[1]);

    registrar(rs01_coherenciaFechas(entrada, salida));
    registrar(rs02_fechasNoPasadas(entrada, salida));
    registrar(rs03_disponibilidad(tipo, entrada, salida));

    return errorCount == 0;
}

// ── Punto de entrada: detecta tipo y delega ──────────────────
bool Semantic::validate(const std::vector<Token>& tokens) {
    errorCount = 0;
    resultados.clear();

    if (tokens.empty()) return false;

    switch (tokens[0].type) {
        case TokenType::RESERVAR:  return validarReserva(tokens);
        case TokenType::CANCELAR:  return validarCancelacion(tokens);
        case TokenType::CONSULTAR: return validarConsulta(tokens);
        default:
            std::cerr << "  [ERROR SEMANTICO] Tipo de sentencia no reconocido.\n";
            errorCount++;
            return false;
    }
}
