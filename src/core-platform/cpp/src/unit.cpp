/**
 * @author: Samah SHAYYA
 * @date: 28-May-2026
 * @brief: Implementation of static Unit API over the registry.
 * @see: src/core-platform/ReadMe.md
 */

#include "core_platform/units/unit.hpp"

#include <stdexcept>

#include "core_platform/units/unit_registry.hpp"
#include "measures.ipp"

namespace core_platform {

void Unit::init() {
  detail::registerAllMeasures(UnitRegistry::instance());
}

void Unit::shutdown() {
  UnitRegistry::instance().clear();
}

double Unit::toSI(double value, std::string_view symbol) {
  return UnitRegistry::instance().toSI(value, symbol);
}

double Unit::fromSI(double value, std::string_view symbol) {
  return UnitRegistry::instance().fromSI(value, symbol);
}

double Unit::convert(double value,
                     std::string_view fromSymbol,
                     std::string_view toSymbol) {
  return UnitRegistry::instance().convert(value, fromSymbol, toSymbol);
}

std::string_view Unit::name(std::string_view symbol) {
  const auto* def = UnitRegistry::instance().find(symbol);
  if (!def) {
    throw std::invalid_argument("Unit not found: " + std::string(symbol));
  }
  return def->name;
}

std::string_view Unit::displaySymbol(std::string_view symbol) {
  const auto* def = UnitRegistry::instance().find(symbol);
  if (!def) {
    throw std::invalid_argument("Unit not found: " + std::string(symbol));
  }
  return def->symbol;
}

std::string_view Unit::measure(std::string_view symbol) {
  const auto* def = UnitRegistry::instance().find(symbol);
  if (!def) {
    throw std::invalid_argument("Unit not found: " + std::string(symbol));
  }
  return def->measure;
}

std::string_view Unit::siUnit(std::string_view measureName) {
  return UnitRegistry::instance().siUnit(measureName);
}

std::string_view Unit::defaultUnit(std::string_view measureName) {
  return UnitRegistry::instance().defaultUnit(measureName);
}

double Unit::toDefault(double value, std::string_view measureName) {
  return UnitRegistry::instance().toDefault(value, measureName);
}

double Unit::fromDefault(double value, std::string_view measureName) {
  return UnitRegistry::instance().fromDefault(value, measureName);
}

std::vector<std::string_view> Unit::allSymbols() {
  return UnitRegistry::instance().allSymbols();
}

std::vector<std::string_view> Unit::symbolsForMeasure(
    std::string_view measureName) {
  return UnitRegistry::instance().symbolsForMeasure(measureName);
}

}  // namespace core_platform
