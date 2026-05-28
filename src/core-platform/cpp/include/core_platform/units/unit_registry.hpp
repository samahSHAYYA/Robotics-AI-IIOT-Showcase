/**
 * @author: Samah SHAYYA
 * @date: 28-May-2026
 * @brief: Singleton registry for unit definitions populated by generated code.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_UNITS_UNIT_REGISTRY_HPP
#define CORE_PLATFORM_UNITS_UNIT_REGISTRY_HPP

#include <span>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace core_platform {

class UnitRegistry {
 public:
  struct UnitDef {
    std::string_view name;
    std::string_view symbol;
    std::string_view measure;
    double (*toSI)(double);
    double (*fromSI)(double);
  };

  UnitRegistry(const UnitRegistry&) = delete;
  UnitRegistry& operator=(const UnitRegistry&) = delete;

  static UnitRegistry& instance();

  void clear();
  void registerMeasure(std::string_view measureName,
                       std::string_view siUnitSymbol,
                       std::string_view defaultUnitSymbol,
                       std::span<const UnitDef> units);

  [[nodiscard]]
  const UnitDef* find(std::string_view symbol) const;

  [[nodiscard]]
  double toSI(double value, std::string_view symbol) const;

  [[nodiscard]]
  double fromSI(double value, std::string_view symbol) const;

  [[nodiscard]]
  double convert(double value,
                 std::string_view fromSymbol,
                 std::string_view toSymbol) const;

  [[nodiscard]]
  std::string_view siUnit(std::string_view measureName) const;

  [[nodiscard]]
  std::string_view defaultUnit(std::string_view measureName) const;

  [[nodiscard]]
  double toDefault(double value, std::string_view measureName) const;

  [[nodiscard]]
  double fromDefault(double value, std::string_view measureName) const;

  [[nodiscard]]
  std::vector<std::string_view> allSymbols() const;

  [[nodiscard]]
  std::vector<std::string_view> symbolsForMeasure(
      std::string_view measureName) const;

 private:
  struct MeasureInfo {
    std::string_view siUnit;
    std::string_view defaultUnit;
    std::vector<std::string_view> symbols;
  };

  UnitRegistry() = default;

  std::unordered_map<std::string, UnitDef> registry;
  std::unordered_map<std::string, MeasureInfo> measures;
};

}  // namespace core_platform

#endif  // CORE_PLATFORM_UNITS_UNIT_REGISTRY_HPP
