/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Template implementations for Sensor.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_SENSORS_SENSOR_TPP
#define CORE_PLATFORM_SENSORS_SENSOR_TPP

#include "sensor.hpp"

#include <array>
#include <cstdint>
#include <iomanip>
#include <random>
#include <sstream>

namespace core_platform {

template<typename MeasurementType, MeasureId M>
Sensor<MeasurementType, M>::Sensor(std::string name,
                                std::string id,
                                MeasurementType valueSI) :
    name(std::move(name)),
    id(id.empty() ? generateID() : std::move(id)),
    valueSI(std::move(valueSI)),
    timestampUTC(now_utc()) {}

template<typename MeasurementType, MeasureId M>
Sensor<MeasurementType, M>::Sensor(std::string name,
                                MeasurementType valueSI) :
    Sensor(std::move(name), "", std::move(valueSI)) {}

template<typename MeasurementType, MeasureId M>
Sensor<MeasurementType, M>::~Sensor() {
  stopMocking();
}

template<typename MeasurementType, MeasureId M>
const std::string& Sensor<MeasurementType, M>::getName() const {
  return name;
}

template<typename MeasurementType, MeasureId M>
const std::string& Sensor<MeasurementType, M>::getID() const {
  return id;
}

template<typename MeasurementType, MeasureId M>
MeasurementType Sensor<MeasurementType, M>::getValue(
    std::string_view targetUnit) const {

  std::scoped_lock lock(mutex);

  targetUnit = targetUnit.empty() ? SI_UNIT() : targetUnit;
  return convertTo(valueSI, SI_UNIT(), targetUnit);
}

template<typename MeasurementType, MeasureId M>
std::chrono::system_clock::time_point
    Sensor<MeasurementType, M>::getTimestampUTC() const {

  std::scoped_lock lock(mutex);

  return timestampUTC;
}

template<typename MeasurementType, MeasureId M>
std::string Sensor<MeasurementType, M>::getZoneBasedTimestamp(
    std::string_view timezone) const {
  return zoned_timestamp(getTimestampUTC(), timezone);
}

template<typename MeasurementType, MeasureId M>
void Sensor<MeasurementType, M>::startMocking(
    MeasurementGenerator generator,
    std::chrono::milliseconds interval) {

  if (!generator) {
    throw std::invalid_argument("Measurement generator must be callable");
  }
  if (interval.count() <= 0) {
    throw std::invalid_argument("Mocking interval must be positive");
  }

  stopMocking();
  mocking.store(true);

  mockThread = std::thread([this, generator, interval]() {
    while (mocking.load()) {
      setValue(generator());
      std::this_thread::sleep_for(interval);
    }
  });
}

template<typename MeasurementType, MeasureId M>
void Sensor<MeasurementType, M>::stopMocking() {

  mocking.store(false);
  if (mockThread.joinable()) {
    mockThread.join();
  }
}

template<typename MeasurementType, MeasureId M>
bool Sensor<MeasurementType, M>::isMocking() const {
  return mocking.load();
}

template<typename MeasurementType, MeasureId M>
void Sensor<MeasurementType, M>::setValue(
    const MeasurementType& value,
    std::string_view valueUnit) {

  std::scoped_lock lock(mutex);

  valueUnit = valueUnit.empty() ? SI_UNIT() : valueUnit;
  valueSI = convertTo(value, valueUnit, SI_UNIT());
  timestampUTC = now_utc();
}

template<typename MeasurementType, MeasureId M>
std::string Sensor<MeasurementType, M>::generateID() {

  std::array<std::uint8_t, 16> bytes {};
  std::random_device randomDevice;
  std::mt19937 generator(randomDevice());
  std::uniform_int_distribution<int> distribution(0, 255);

  for (std::uint8_t& byte : bytes) {
    byte = static_cast<std::uint8_t>(distribution(generator));
  }

  // RFC 4122 UUIDv4: set version and variant bits.
  bytes[6] = static_cast<std::uint8_t>((bytes[6] & 0x0F) | 0x40);
  bytes[8] = static_cast<std::uint8_t>((bytes[8] & 0x3F) | 0x80);

  std::ostringstream stream;
  stream << std::hex << std::nouppercase << std::setfill('0');

  for (std::size_t i = 0; i < bytes.size(); ++i) {
    stream << std::setw(2) << static_cast<unsigned int>(bytes[i]);
    if (i == 3 || i == 5 || i == 7 || i == 9) {
      stream << '-';
    }
  }
  
  return stream.str();
}

}  // namespace core_platform

#endif  // CORE_PLATFORM_SENSORS_SENSOR_TPP
