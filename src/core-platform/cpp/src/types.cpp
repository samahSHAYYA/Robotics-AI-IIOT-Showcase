/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Aggregate sensor collection helpers for operational updates and
 *         canonical value accessors.
 * @note: Concrete sensor implementations live in per-class .cpp files.
 * @dependencies: STL and project-local core_platform modules.
 * @thread_safety: Not thread-safe by default; synchronize shared state externally.
 * @performance: Optimized for deterministic tick-based simulation runtime.
 * @safety: Escalates to degraded/stopped behavior based on alert severity logic.
 * @warning: Simulation logic only; not certified for direct hardware control.
 * @todo: Replace mock profiles with calibrated plant/device models.
 * @see: src/core-platform/ReadMe.md
 */

#include "core_platform/types.hpp"

namespace core_platform {

void Sensors::setOperationalValues(
    double temperatureDegC,
    double vibrationMmPerSec,
    double currentA,
    double proximityM,
    double torqueNm,
    double pressureBar,
    double humidityPercent
) {
  temperature.updateValue(temperatureDegC, "degC");
  vibration.updateValue(vibrationMmPerSec, "mm/s");
  current.updateValue(currentA, "A");
  proximity.updateValue(proximityM, "m");
  torque.updateValue(torqueNm, "N*m");
  pressure.updateValue(pressureBar, "bar");
  humidity.updateValue(humidityPercent, "%RH");
}

double Sensors::temperatureDegC() const {
  return temperature.value("degC");
}

double Sensors::vibrationMmPerSec() const {
  return vibration.value("mm/s");
}

double Sensors::currentA() const {
  return current.value("A");
}

double Sensors::proximityM() const {
  return proximity.value("m");
}

double Sensors::torqueNm() const {
  return torque.value("N*m");
}

double Sensors::pressureBar() const {
  return pressure.value("bar");
}

double Sensors::humidityPercent() const {
  return humidity.value("%RH");
}

}  // namespace core_platform
