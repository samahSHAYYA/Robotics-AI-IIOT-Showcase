/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Current sensor class declaration.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_SENSORS_CURRENT_SENSOR_HPP
#define CORE_PLATFORM_SENSORS_CURRENT_SENSOR_HPP

#include <string>
#include <string_view>

#include "core_platform/sensors/sensor.hpp"

namespace core_platform {

class CurrentSensor : public Sensor<double, MeasureId::ElectricCurrent> {
 public:
  using Sensor::Sensor;
  
  CurrentSensor(std::string name,
                double value,
                std::string_view unitSymbol);
  CurrentSensor(std::string name,
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

#endif  // CORE_PLATFORM_SENSORS_CURRENT_SENSOR_HPP
