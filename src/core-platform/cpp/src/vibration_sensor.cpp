/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Vibration sensor implementation with SI canonical storage.
 * @note: SI unit is m/s.
 * @see: src/core-platform/ReadMe.md
 */

#include "core_platform/sensors/vibration_sensor.hpp"

#include <stdexcept>
#include <utility>

#include "core_platform/units/unit.hpp"

namespace core_platform {

VibrationSensor::VibrationSensor(std::string name, double value,
                                 std::string_view unitSymbol) :
    Sensor(std::move(name), 0.0) {
  updateValue(value, unitSymbol);
}

VibrationSensor::VibrationSensor(std::string name, std::string id,
                                 double value,
                                 std::string_view unitSymbol) :
    Sensor(std::move(name), std::move(id), 0.0) {
  updateValue(value, unitSymbol);
}

double VibrationSensor::convertTo(const double& value,
                                  std::string_view sourceUnit,
                                  std::string_view targetUnit) const {
  return Unit::convert(value, sourceUnit, targetUnit);
}

double VibrationSensor::valueSI() const {
  return getValue(SI_UNIT());
}

void VibrationSensor::updateValue(double value, std::string_view unitSymbol) {
  setValue(value, unitSymbol);
}

double VibrationSensor::value(std::string_view unitSymbol) const {
  return getValue(unitSymbol);
}

}  // namespace core_platform
