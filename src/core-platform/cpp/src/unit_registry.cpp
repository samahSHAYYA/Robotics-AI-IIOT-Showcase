/**
 * @author: Samah SHAYYA
 * @date: 28-May-2026
 * @brief: UnitRegistry singleton implementation.
 * @see: src/core-platform/ReadMe.md
 */

#include "core_platform/units/unit_registry.hpp"

#include <stdexcept>

namespace core_platform {

UnitRegistry& UnitRegistry::instance() {
  static UnitRegistry reg;
  return reg;
}

void UnitRegistry::clear() {
  registry.clear();
  measures.clear();
}

void UnitRegistry::registerMeasure(
    std::string_view measureName,
    std::string_view siUnitSymbol,
    std::string_view defaultUnitSymbol,
    std::span<const UnitDef> units) {
  MeasureInfo info;
  info.siUnit = siUnitSymbol;
  info.defaultUnit = defaultUnitSymbol;
  info.symbols.reserve(units.size());

  for (const auto& u: units) {
    const std::string key(u.symbol);
    registry[key] = u;
    info.symbols.push_back(u.symbol);
  }

  measures[std::string(measureName)] = std::move(info);
}

const UnitRegistry::UnitDef* UnitRegistry::find(
    std::string_view symbol) const {
  const auto it = registry.find(std::string(symbol));
  if (it == registry.end()) {
    return nullptr;
  }
  return &it->second;
}

double UnitRegistry::toSI(double value, std::string_view symbol) const {
  const auto* def = find(symbol);
  if (!def) {
    throw std::invalid_argument(
        "Unit not found: " + std::string(symbol));
  }
  return def->toSI(value);
}

double UnitRegistry::fromSI(double value, std::string_view symbol) const {
  const auto* def = find(symbol);
  if (!def) {
    throw std::invalid_argument(
        "Unit not found: " + std::string(symbol));
  }
  return def->fromSI(value);
}

double UnitRegistry::convert(double value,
                             std::string_view fromSymbol,
                             std::string_view toSymbol) const {
  const auto* from = find(fromSymbol);
  if (!from) {
    throw std::invalid_argument(
        "Source unit not found: " + std::string(fromSymbol));
  }
  const auto* to = find(toSymbol);
  if (!to) {
    throw std::invalid_argument(
        "Target unit not found: " + std::string(toSymbol));
  }
  if (from->measure != to->measure) {
    throw std::invalid_argument(
        "Cannot convert between different measures: "
        + std::string(from->measure) + " -> " + std::string(to->measure));
  }
  const double siValue = from->toSI(value);
  return to->fromSI(siValue);
}

std::string_view UnitRegistry::siUnit(std::string_view measureName) const {
  const auto it = measures.find(std::string(measureName));

  if (it == measures.end()) {
    throw std::invalid_argument("Measure not found: " + std::string(measureName));
  }

  return it->second.siUnit;
}

std::string_view UnitRegistry::defaultUnit(
    std::string_view measureName) const {
  const auto it = measures.find(std::string(measureName));
  if (it == measures.end()) {
    throw std::invalid_argument(
        "Measure not found: " + std::string(measureName));
  }
  return it->second.defaultUnit;
}

double UnitRegistry::toDefault(
    double value, std::string_view measureName) const {
  const auto it = measures.find(std::string(measureName));
  if (it == measures.end()) {
    throw std::invalid_argument(
        "Measure not found: " + std::string(measureName));
  }
  std::string_view defSym = it->second.defaultUnit;
  const auto* def = find(defSym);
  if (!def) {
    throw std::invalid_argument(
        "Default unit not found: " + std::string(defSym));
  }
  return def->fromSI(value);
}

double UnitRegistry::fromDefault(
    double value, std::string_view measureName) const {
  const auto it = measures.find(std::string(measureName));
  if (it == measures.end()) {
    throw std::invalid_argument(
        "Measure not found: " + std::string(measureName));
  }
  std::string_view defSym = it->second.defaultUnit;
  const auto* def = find(defSym);
  if (!def) {
    throw std::invalid_argument(
        "Default unit not found: " + std::string(defSym));
  }
  return def->toSI(value);
}

std::vector<std::string_view> UnitRegistry::allSymbols() const {
  std::vector<std::string_view> result;
  result.reserve(registry.size());
  for (const auto& [key, def]: registry) {
    result.push_back(def.symbol);
  }
  return result;
}

std::vector<std::string_view> UnitRegistry::symbolsForMeasure(
    std::string_view measureName) const {
  const auto it = measures.find(std::string(measureName));
  if (it == measures.end()) {
    return {};
  }
  return it->second.symbols;
}

}  // namespace core_platform
