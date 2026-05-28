/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Temperature sensor implementation with SI canonical storage.
 * @note: SI unit is Kelvin (K).
 * @see: src/core-platform/ReadMe.md
 */

#include "core_platform/sensors/temperature_sensor.hpp"

#include <stdexcept>
#include <utility>

#include "core_platform/units/unit.hpp"

namespace core_platform {

TemperatureSensor::TemperatureSensor(std::string name, double value,
                                     std::string_view unitSymbol) :
    Sensor(std::move(name), 0.0) {
  updateValue(value, unitSymbol);
}

TemperatureSensor::TemperatureSensor(std::string name, std::string id,
                                     double value,
                                     std::string_view unitSymbol) :
    Sensor(std::move(name), std::move(id), 0.0) {
  updateValue(value, unitSymbol);
}

double TemperatureSensor::convertTo(const double& value,
                                    std::string_view sourceUnit,
                                    std::string_view targetUnit) const {
  return Unit::convert(value, sourceUnit, targetUnit);
}

double TemperatureSensor::valueSI() const {
  return getValue(SI_UNIT());
}

void TemperatureSensor::updateValue(double value, std::string_view unitSymbol) {
  setValue(value, unitSymbol);
}

double TemperatureSensor::value(std::string_view unitSymbol) const {
  return getValue(unitSymbol);
}

}  // namespace core_platform
