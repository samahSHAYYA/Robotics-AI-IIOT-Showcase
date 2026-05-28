/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Lightweight JSONL event logger and filesystem helpers used by
 *         core-platform simulation runtime.
 * @note: Industrial simulation module intended for Linux/Unix runtime
 *        workflows.
 * @dependencies: STL and project-local core_platform modules.
 * @thread_safety: Not thread-safe by default; synchronize shared state
 *                 externally.
 * @performance: Optimized for deterministic tick-based simulation runtime.
 * @safety: Escalates to degraded/stopped behavior based on alert severity
 *          logic.
 * @warning: Simulation logic only; not certified for direct hardware control.
 * @todo: Replace mock profiles with calibrated plant/device models.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_EVENT_LOGGER_HPP
#define CORE_PLATFORM_EVENT_LOGGER_HPP

#include <fstream>
#include <string>

namespace core_platform {

class EventLogger {
 public:
  explicit EventLogger(const std::string& path);

  void write_event(const std::string& type, const std::string& payload_json);

 private:
  std::ofstream stream_;
};

void ensure_parent_dir(const std::string& path);
std::string now_iso_utc();

}  // namespace core_platform

#endif  // CORE_PLATFORM_EVENT_LOGGER_HPP
