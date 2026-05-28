/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026 *
 * @brief: Snapshot writer for final simulation state export.
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

#ifndef CORE_PLATFORM_SNAPSHOT_HPP
#define CORE_PLATFORM_SNAPSHOT_HPP

#include <string>

#include "core_platform/types.hpp"

namespace core_platform {

void write_snapshot(const LineState& state, const std::string& output_path);

}  // namespace core_platform

#endif  // CORE_PLATFORM_SNAPSHOT_HPP
