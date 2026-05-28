/**
 * @author: Samah SHAYYA
 * @date: 28-May-2026
 * @brief: Static-only Unit API over the generated unit registry.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_UNITS_UNIT_HPP
#define CORE_PLATFORM_UNITS_UNIT_HPP

#include <string_view>
#include <vector>

namespace core_platform {

class Unit {
 public:
  Unit() = delete;

  static void init();
  static void shutdown();

  [[nodiscard]]
  static double toSI(double value, std::string_view symbol);

  [[nodiscard]]
  static double fromSI(double value, std::string_view symbol);

  [[nodiscard]]
  static double convert(double value,
                        std::string_view fromSymbol,
                        std::string_view toSymbol);

  [[nodiscard]]
  static std::string_view name(std::string_view symbol);

  [[nodiscard]]
  static std::string_view displaySymbol(std::string_view symbol);

  [[nodiscard]]
  static std::string_view measure(std::string_view symbol);

  [[nodiscard]]
  static std::string_view siUnit(std::string_view measureName);

  [[nodiscard]]
  static std::string_view defaultUnit(std::string_view measureName);

  [[nodiscard]]
  static double toDefault(double value, std::string_view measureName);

  [[nodiscard]]
  static double fromDefault(double value, std::string_view measureName);

  [[nodiscard]]
  static std::vector<std::string_view> allSymbols();

  [[nodiscard]]
  static std::vector<std::string_view> symbolsForMeasure(
      std::string_view measureName);
};

}  // namespace core_platform

#endif  // CORE_PLATFORM_UNITS_UNIT_HPP
