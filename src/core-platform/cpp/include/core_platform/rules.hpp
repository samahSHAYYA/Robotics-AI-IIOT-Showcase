/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Rule interfaces for alert derivation, safety mode derivation, and
 *         maintenance health score computation.
 * @note: Include guards are used for portable Linux/Unix toolchains.
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

#ifndef CORE_PLATFORM_RULES_HPP
#define CORE_PLATFORM_RULES_HPP

#include <string>
#include <vector>

#include "core_platform/types.hpp"

namespace core_platform {

std::vector<Alert> evaluate_alerts(const Sensors& sensors);

std::string derive_safety_mode(const std::vector<Alert>& alerts);

double compute_health_score(const Sensors& sensors);

}  // namespace core_platform

#endif  // CORE_PLATFORM_RULES_HPP
