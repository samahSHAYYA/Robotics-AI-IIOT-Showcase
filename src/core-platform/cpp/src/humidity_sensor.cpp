/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Humidity sensor implementation with SI canonical storage.
 * @note: SI unit is ratio.
 * @see: src/core-platform/ReadMe.md
 */

#include "core_platform/sensors/humidity_sensor.hpp"

#include <stdexcept>
#include <utility>

#include "core_platform/units/unit.hpp"

namespace core_platform {

HumiditySensor::HumiditySensor(std::string name, double value,
                               std::string_view unitSymbol) :
    Sensor(std::move(name), 0.0) {
  updateValue(value, unitSymbol);
}

HumiditySensor::HumiditySensor(std::string name, std::string id,
                               double value,
                               std::string_view unitSymbol) :
    Sensor(std::move(name), std::move(id), 0.0) {
  updateValue(value, unitSymbol);
}

double HumiditySensor::convertTo(const double& value,
                                 std::string_view sourceUnit,
                                 std::string_view targetUnit) const {
  return Unit::convert(value, sourceUnit, targetUnit);
}

double HumiditySensor::valueSI() const {
  return getValue(SI_UNIT());
}

void HumiditySensor::updateValue(double value, std::string_view unitSymbol) {
  setValue(value, unitSymbol);
}

double HumiditySensor::value(std::string_view unitSymbol) const {
  return getValue(unitSymbol);
}

}  // namespace core_platform
