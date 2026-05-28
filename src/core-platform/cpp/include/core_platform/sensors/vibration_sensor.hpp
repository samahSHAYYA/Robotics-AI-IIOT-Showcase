/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Vibration sensor class declaration.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_SENSORS_VIBRATION_SENSOR_HPP
#define CORE_PLATFORM_SENSORS_VIBRATION_SENSOR_HPP

#include <string>
#include <string_view>

#include "core_platform/sensors/sensor.hpp"

namespace core_platform {

class VibrationSensor : public Sensor<double, MeasureId::Velocity> {
 public:
  using Sensor::Sensor;

  VibrationSensor(std::string name, double value, std::string_view unitSymbol);

  VibrationSensor(std::string name,
                  std::string id,
                  double value,
                  std::string_view unitSymbol);

  [[nodiscard]]
  double convertTo(const double& value,
                   std::string_view sourceUnit,
                   std::string_view targetUnit) const override;

  [[nodiscard]]
  double valueSI() const;

  void updateValue(double value, std::string_view unitSymbol);

  [[nodiscard]]
  double value(std::string_view unitSymbol = "") const;
};

}  // namespace core_platform

#endif  // CORE_PLATFORM_SENSORS_VIBRATION_SENSOR_HPP
