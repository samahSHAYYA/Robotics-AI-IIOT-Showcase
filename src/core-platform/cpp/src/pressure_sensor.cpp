/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 *
 * @brief: Pressure sensor implementation with SI canonical storage.
 * @note: SI unit is Pascal (Pa).
 * @see: src/core-platform/ReadMe.md
 */

#include "core_platform/sensors/pressure_sensor.hpp"

#include <stdexcept>
#include <utility>

#include "core_platform/units/unit.hpp"

namespace core_platform {

PressureSensor::PressureSensor(std::string name, double value,
                               std::string_view unitSymbol) :
    Sensor(std::move(name), 0.0) {
  updateValue(value, unitSymbol);
}

PressureSensor::PressureSensor(std::string name, std::string id,
                               double value,
                               std::string_view unitSymbol) :
    Sensor(std::move(name), std::move(id), 0.0) {
  updateValue(value, unitSymbol);
}

double PressureSensor::convertTo(const double& value,
                                 std::string_view sourceUnit,
                                 std::string_view targetUnit) const {
  return Unit::convert(value, sourceUnit, targetUnit);
}

double PressureSensor::valueSI() const {
  return getValue(SI_UNIT());
}

void PressureSensor::updateValue(double value, std::string_view unitSymbol) {
  setValue(value, unitSymbol);
}

double PressureSensor::value(std::string_view unitSymbol) const {
  return getValue(unitSymbol);
}

}  // namespace core_platform
