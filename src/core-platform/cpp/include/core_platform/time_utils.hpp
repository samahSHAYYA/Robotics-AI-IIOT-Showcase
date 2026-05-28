/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: UTC and timezone-aware timestamp helpers for simulation telemetry.
 * @note: Timezone formatting currently supports UTC and fixed offsets.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_TIME_UTILS_HPP
#define CORE_PLATFORM_TIME_UTILS_HPP

#include <chrono>
#include <string>
#include <string_view>

namespace core_platform {

[[nodiscard]]
std::chrono::system_clock::time_point now_utc();

[[nodiscard]]
std::string timestamp_utc(const std::chrono::system_clock::time_point& utcTime);

[[nodiscard]]
std::string zoned_timestamp(const std::chrono::system_clock::time_point& utcTime,
                            std::string_view timezone);

[[nodiscard]]
std::string zoned_timestamp(std::string_view timezone);

}  // namespace core_platform

#endif  // CORE_PLATFORM_TIME_UTILS_HPP
