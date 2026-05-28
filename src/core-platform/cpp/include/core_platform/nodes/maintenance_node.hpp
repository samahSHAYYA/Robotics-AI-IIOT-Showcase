/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026 *
 * @brief: Maintenance intelligence node evaluating thresholds and health
 *         score from runtime sensor telemetry.
 * @note: Industrial simulation module intended for Linux/Unix runtime workflows.
 * @dependencies: STL and project-local core_platform modules.
 * @thread_safety: Not thread-safe by default; synchronize shared state externally.
 * @performance: Optimized for deterministic tick-based simulation runtime.
 * @safety: Escalates to degraded/stopped behavior based on alert severity logic.
 * @warning: Simulation logic only; not certified for direct hardware control.
 * @todo: Replace mock profiles with calibrated plant/device models.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_NODES_MAINTENANCE_NODE_HPP
#define CORE_PLATFORM_NODES_MAINTENANCE_NODE_HPP

#include <vector>

#include "core_platform/types.hpp"

namespace core_platform::nodes {

class MaintenanceNode {
 public:
  std::vector<Alert> evaluate_alerts(const Sensors& sensors) const;
  double compute_health_score(const Sensors& sensors) const;
};

}  // namespace core_platform::nodes

#endif  // CORE_PLATFORM_NODES_MAINTENANCE_NODE_HPP
