/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: UTC and fixed-offset timezone timestamp formatting utilities.
 * @note: Accepts timezone values: UTC, Z, +HH, +HH:MM, -HH, -HH:MM.
 * @see: src/core-platform/ReadMe.md
 */

#include "core_platform/time_utils.hpp"

#include <ctime>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <string>

namespace core_platform {

namespace {

int parse_component(const std::string& value, const char* label, int maxInclusive) {
  int parsed = 0;
  for (char c : value) {
    if (c < '0' || c > '9') {
      throw std::invalid_argument(std::string("Invalid ") + label + " in timezone");
    }
    parsed = parsed * 10 + (c - '0');
  }
  if (parsed > maxInclusive) {
    throw std::invalid_argument(std::string("Out-of-range ") + label + " in timezone");
  }
  return parsed;
}

int parse_offset_minutes(std::string_view timezone) {
  if (timezone == "UTC" || timezone == "Z") {
    return 0;
  }

  if (timezone.size() < 3) {
    throw std::invalid_argument("Unsupported timezone format");
  }

  const char signChar = timezone.front();
  if (signChar != '+' && signChar != '-') {
    throw std::invalid_argument("Timezone must start with UTC/Z or +/- offset");
  }

  const std::string tail(timezone.substr(1));
  std::string hoursText;
  std::string minutesText;

  const std::size_t colonPos = tail.find(':');
  if (colonPos == std::string::npos) {
    if (tail.size() != 2) {
      throw std::invalid_argument("Offset without colon must be +HH or -HH");
    }
    hoursText = tail;
    minutesText = "00";
  } else {
    hoursText = tail.substr(0, colonPos);
    minutesText = tail.substr(colonPos + 1);
    if (hoursText.size() != 2 || minutesText.size() != 2) {
      throw std::invalid_argument("Offset with colon must be +HH:MM or -HH:MM");
    }
  }

  const int hours = parse_component(hoursText, "hour", 23);
  const int minutes = parse_component(minutesText, "minute", 59);
  const int sign = (signChar == '-') ? -1 : 1;
  return sign * (hours * 60 + minutes);
}

std::string format_tm(const std::tm& tm, std::string_view suffix) {
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%S") << suffix;
  return oss.str();
}

std::string format_offset_suffix(int offsetMinutes) {
  if (offsetMinutes == 0) {
    return "Z";
  }
  const char sign = offsetMinutes < 0 ? '-' : '+';
  const int absoluteMinutes = offsetMinutes < 0 ? -offsetMinutes : offsetMinutes;
  const int hours = absoluteMinutes / 60;
  const int minutes = absoluteMinutes % 60;

  std::ostringstream oss;
  oss << sign
      << std::setw(2) << std::setfill('0') << hours
      << ':'
      << std::setw(2) << std::setfill('0') << minutes;
  return oss.str();
}

}  // namespace

std::chrono::system_clock::time_point now_utc() {
  return std::chrono::system_clock::now();
}

std::string timestamp_utc(const std::chrono::system_clock::time_point& utcTime) {
  const std::time_t timeValue = std::chrono::system_clock::to_time_t(utcTime);
  std::tm tm {};
#ifdef _WIN32
  gmtime_s(&tm, &timeValue);
#else
  gmtime_r(&timeValue, &tm);
#endif
  return format_tm(tm, "Z");
}

std::string zoned_timestamp(
    const std::chrono::system_clock::time_point& utcTime,
    std::string_view timezone
) {
  const int offsetMinutes = parse_offset_minutes(timezone);
  const auto zonedTime = utcTime + std::chrono::minutes(offsetMinutes);

  const std::time_t timeValue = std::chrono::system_clock::to_time_t(zonedTime);
  std::tm tm {};
#ifdef _WIN32
  gmtime_s(&tm, &timeValue);
#else
  gmtime_r(&timeValue, &tm);
#endif
  return format_tm(tm, format_offset_suffix(offsetMinutes));
}

std::string zoned_timestamp(std::string_view timezone) {
  return zoned_timestamp(now_utc(), timezone);
}

}  // namespace core_platform
