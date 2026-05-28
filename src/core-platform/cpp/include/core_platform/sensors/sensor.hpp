/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Abstract template sensor base class with SI canonical storage.
 * @details: Supports background mock streaming and timestamp tracking.
 * @note: Template implementation is provided in sensor.tpp.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_SENSORS_SENSOR_HPP
#define CORE_PLATFORM_SENSORS_SENSOR_HPP

#include <atomic>
#include <chrono>
#include <functional>
#include <mutex>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <utility>

#include "core_platform/time_utils.hpp"
#include "core_platform/units/unit.hpp"
#include "measures.ipp"

namespace core_platform {

template<typename MeasurementType, MeasureId M = MeasureId::None>
class Sensor {
 public:
  /**
   * @brief: Callable type used by mock streaming to generate measurements.
   * @note: Callable should be safe for repeated calls from a background thread.
   */
  using MeasurementGenerator = std::function<MeasurementType()>;

  static constexpr std::string_view MEASURE_NAME = detail::measureName(M);

  /**
   * @brief: Construct a sensor with explicit id and SI-canonical value.
   */
  Sensor(std::string name, std::string id, MeasurementType valueSI);

  /**
   * @brief: Construct a sensor with auto-generated id and SI-canonical value.
   */
  Sensor(std::string name, MeasurementType valueSI);

  Sensor(const Sensor&) = delete;
  Sensor& operator=(const Sensor&) = delete;
  Sensor(Sensor&&) = delete;
  Sensor& operator=(Sensor&&) = delete;

  virtual ~Sensor();

  [[nodiscard]]
  const std::string& getName() const;

  [[nodiscard]]
  const std::string& getID() const;

  /**
   * @brief: Read current sensor value in target unit.
   * @param targetUnit Target unit symbol; empty value means SI unit.
   * @return Value converted from internally stored SI value.
   */
  [[nodiscard]]
  MeasurementType getValue(std::string_view targetUnit = "") const;

  /**
   * @brief: Update sensor value and refresh UTC timestamp.
   * @param value New value.
   * @param valueUnit Unit symbol of the new value; empty value means SI unit.
   * @note: Value is converted to SI and stored as canonical internal state.
   */
  void setValue(const MeasurementType& value, std::string_view valueUnit = "");

  /**
   * @brief: Return SI unit symbol for this sensor's measure.
   * @note: Determined at compile time from MeasureId via constexpr switch.
   *        Returns empty string if M is None.
   */
  [[nodiscard]]
  std::string_view SI_UNIT() const {
    if constexpr (M == MeasureId::None) return "";
    return detail::siUnitForMeasure(M);
  }

  /**
   * @brief: Convert a value from sourceUnit to targetUnit.
   * @param value Input value to convert.
   * @param sourceUnit Source unit symbol.
   * @param targetUnit Target unit symbol.
   * @return Converted value.
   * @note: Must be pure conversion; should not mutate sensor state.
   */
  [[nodiscard]]
  virtual MeasurementType convertTo(const MeasurementType& value,
                                    std::string_view sourceUnit,
                                    std::string_view targetUnit) const = 0;

  [[nodiscard]]
  std::chrono::system_clock::time_point getTimestampUTC() const;

  [[nodiscard]]
  std::string getZoneBasedTimestamp(std::string_view timezone) const;

  /**
   * @brief: Start background mock generation loop.
   * @param generator Measurement generator callable.
   * @param interval Sleep duration between generated samples.
   * @throws std::invalid_argument if generator is empty or interval is non-positive.
   * @note: Safe to call multiple times; previous loop is stopped before restart.
   */
  void startMocking(MeasurementGenerator generator,
                    std::chrono::milliseconds interval);

  /**
   * @brief: Stop background mock loop and join worker thread if running.
   * @note: Idempotent.
   */
  void stopMocking();

  [[nodiscard]]
  bool isMocking() const;

 private:
  [[nodiscard]]
  static std::string generateID();

  std::string name;
  std::string id;
  MeasurementType valueSI;
  std::chrono::system_clock::time_point timestampUTC;

  mutable std::mutex mutex;
  std::thread mockThread;
  std::atomic<bool> mocking {false};
};

}  // namespace core_platform

#include "core_platform/sensors/sensor.tpp"

#endif  // CORE_PLATFORM_SENSORS_SENSOR_HPP
