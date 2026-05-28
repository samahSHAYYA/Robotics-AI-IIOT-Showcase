/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Torque sensor implementation with SI canonical storage.
 * @note: SI unit is Newton-meter (N*m).
 * @see: src/core-platform/ReadMe.md
 */

#include "core_platform/sensors/torque_sensor.hpp"

#include <stdexcept>
#include <utility>

#include "core_platform/units/unit.hpp"

namespace core_platform {

TorqueSensor::TorqueSensor(std::string name, double value,
                           std::string_view unitSymbol) :
    Sensor(std::move(name), 0.0) {
  updateValue(value, unitSymbol);
}

TorqueSensor::TorqueSensor(std::string name, std::string id,
                           double value,
                           std::string_view unitSymbol) :
    Sensor(std::move(name), std::move(id), 0.0) {
  updateValue(value, unitSymbol);
}

double TorqueSensor::convertTo(const double& value,
                               std::string_view sourceUnit,
                               std::string_view targetUnit) const {
  return Unit::convert(value, sourceUnit, targetUnit);
}

double TorqueSensor::valueSI() const {
  return getValue(SI_UNIT());
}

void TorqueSensor::updateValue(double value, std::string_view unitSymbol) {
  setValue(value, unitSymbol);
}

double TorqueSensor::value(std::string_view unitSymbol) const {
  return getValue(unitSymbol);
}

}  // namespace core_platform
