#pragma once
#include "token.h"
#include <string>
#include <vector>
#include <map>

// ============================================================
//  SEMANTIC.H — Analizador semántico del compilador hotelero
//
//  Reglas implementadas:
//  RS01 — Fecha de salida posterior a fecha de entrada
//  RS02 — Fechas no en el pasado
//  RS03 — Habitación disponible en el rango de fechas
//  RS04 — ID de cliente existe en el sistema
//  RS05 — ID de reserva existe y está activa (para cancelaciones)
// ============================================================

// Representa una fecha descompuesta para comparación
struct Fecha {
    int dia, mes, anio;

    bool operator<(const Fecha& o) const {
        if (anio != o.anio) return anio < o.anio;
        if (mes  != o.mes)  return mes  < o.mes;
        return dia < o.dia;
    }
    bool operator==(const Fecha& o) const {
        return dia == o.dia && mes == o.mes && anio == o.anio;
    }
    bool operator<=(const Fecha& o) const { return *this < o || *this == o; }
    bool operator>(const Fecha& o)  const { return o < *this; }
};

// Representa una reserva activa en el sistema
struct Reserva {
    std::string id;
    std::string tipoHab;
    Fecha       entrada;
    Fecha       salida;
    std::string idCliente;
    std::string estado;   // "ACTIVA" | "CANCELADA"
};

// Resultado de una validación semántica individual
struct ResultadoRegla {
    std::string codigo;   // "RS01", "RS02", ...
    bool        ok;
    std::string mensaje;
};

class Semantic {
public:
    // Constructor: carga los archivos de datos
    Semantic(const std::string& archivoClientes,
             const std::string& archivoReservas);

    // ── Punto de entrada principal ───────────────────────────
    // Recibe los tokens válidos (léxico+sintáctico OK) y valida semánticamente
    // Retorna true si todas las reglas se cumplen
    bool validate(const std::vector<Token>& tokens);

    bool hasErrors() const { return errorCount > 0; }
    int  getErrorCount() const { return errorCount; }
    const std::vector<ResultadoRegla>& getResultados() const { return resultados; }

private:
    // Datos del sistema
    std::map<std::string, std::string> clientes;  // id → nombre
    std::vector<Reserva>               reservas;

    int errorCount;
    std::vector<ResultadoRegla> resultados;

    // ── Carga de datos ───────────────────────────────────────
    void cargarClientes(const std::string& archivo);
    void cargarReservas(const std::string& archivo);

    // ── Utilidades de fecha ──────────────────────────────────
    Fecha parseFecha(const std::string& s) const;   // "DD/MM/AAAA" → Fecha
    Fecha fechaHoy() const;                          // Fecha del sistema

    // ── Las 5 reglas semánticas ──────────────────────────────
    ResultadoRegla rs01_coherenciaFechas(const Fecha& entrada, const Fecha& salida);
    ResultadoRegla rs02_fechasNoPasadas(const Fecha& entrada, const Fecha& salida);
    ResultadoRegla rs03_disponibilidad(const std::string& tipo, const Fecha& entrada, const Fecha& salida);
    ResultadoRegla rs04_clienteExiste(const std::string& idCliente);
    ResultadoRegla rs05_reservaActiva(const std::string& idReserva);

    // ── Validadores por tipo de sentencia ────────────────────
    bool validarReserva(const std::vector<Token>& tokens);
    bool validarCancelacion(const std::vector<Token>& tokens);
    bool validarConsulta(const std::vector<Token>& tokens);

    // ── Helper para registrar resultado ─────────────────────
    void registrar(const ResultadoRegla& r);
};
