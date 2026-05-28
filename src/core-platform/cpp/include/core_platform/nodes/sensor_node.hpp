/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Sensor node that simulates correlated industrial telemetry based
 *         on runtime line mode and safety mode.
 * @note: Industrial simulation module intended for Linux/Unix runtime workflows.
 * @dependencies: STL and project-local core_platform modules.
 * @thread_safety: Not thread-safe by default; synchronize shared state externally.
 * @performance: Optimized for deterministic tick-based simulation runtime.
 * @safety: Escalates to degraded/stopped behavior based on alert severity logic.
 * @warning: Simulation logic only; not certified for direct hardware control.
 * @todo: Replace mock profiles with calibrated plant/device models.
 * @see: src/core-platform/ReadMe.md
 */

#ifndef CORE_PLATFORM_NODES_SENSOR_NODE_HPP
#define CORE_PLATFORM_NODES_SENSOR_NODE_HPP

#include <random>

#include "core_platform/types.hpp"

namespace core_platform::nodes {

class SensorNode {
 public:
  explicit SensorNode(unsigned int seed);

  Sensors tick(const LineState& state);

 private:
  std::mt19937 rng;
};

}  // namespace core_platform::nodes

#endif  // CORE_PLATFORM_NODES_SENSOR_NODE_HPP
