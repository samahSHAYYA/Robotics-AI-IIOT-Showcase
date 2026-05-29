#ifndef CORE_PLATFORM_UTILS_HPP
#define CORE_PLATFORM_UTILS_HPP

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>

namespace core_platform {

[[nodiscard]]
inline std::string now_iso() {
  using clock = std::chrono::system_clock;
  const auto now = clock::now();
  const std::time_t t = clock::to_time_t(now);
  std::tm tm {};
#ifdef _WIN32
  gmtime_s(&tm, &t);
#else
  gmtime_r(&t, &tm);
#endif
  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%SZ");
  return oss.str();
}

inline double clamp(double v, double lo, double hi) {
  return std::max(lo, std::min(v, hi));
}

inline void ensure_parent(const std::string& path) {
  std::filesystem::path p(path);
  if (!p.parent_path().empty()) {
    std::filesystem::create_directories(p.parent_path());
  }
}

inline void write_event(std::ofstream& stream, const std::string& type,
                        const std::string& payload) {
  stream << "{\"ts\":\"" << now_iso() << "\",\"type\":\"" << type
         << "\",\"payload\":" << payload << "}\n";
}

inline int env_int(const char* key, int fallback) {
  if (const char* v = std::getenv(key)) {
    return std::atoi(v);
  }
  return fallback;
}

}  // namespace core_platform

#endif  // CORE_PLATFORM_UTILS_HPP
