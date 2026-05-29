#include <algorithm>
#include <random>

#include "core_platform/nodes/sensor_node.hpp"
#include "core_platform/types.hpp"

namespace core_platform::nodes {

SensorNode::SensorNode(unsigned int seed) : rng(seed) {}

void SensorNode::tick(const LineState& state, Sensors& sensors) {
  std::uniform_real_distribution<double> n_temp(-2.0, 2.5);
  std::uniform_real_distribution<double> n_vib(-1.3, 1.5);
  std::uniform_real_distribution<double> n_current(-1.0, 1.4);
  std::uniform_real_distribution<double> n_prox(-0.12, 0.12);
  std::uniform_real_distribution<double> n_torque(-5.0, 6.5);
  std::uniform_real_distribution<double> n_pressure(-1.0, 1.2);
  std::uniform_real_distribution<double> n_humidity(-4.0, 4.0);
  std::uniform_real_distribution<double> spike_dist(4.0, 10.0);
  std::uniform_real_distribution<double> p(0.0, 1.0);

  double base_t = 55.0, base_v = 2.3, base_c = 6.0, base_px = 0.25;
  double base_tq = 25.0, base_pr = 3.5, base_h = 48.0;

  if (state.safety_mode == "stopped") {
    base_t = 42.0; base_v = 1.0; base_c = 2.5; base_px = 0.1;
    base_tq = 15.0; base_pr = 2.0; base_h = 45.0;
  } else if (state.line_mode == "running") {
    base_t = 71.0; base_v = 5.0; base_c = 12.0; base_px = 0.72;
    base_tq = 58.0; base_pr = 6.8; base_h = 55.0;
  }

  double spike = 0.0;
  if (state.line_mode == "running" && p(rng) < 0.07) {
    spike = spike_dist(rng);
  }

  sensors.setOperationalValues(
      base_t + n_temp(rng) + spike * 0.9,
      base_v + n_vib(rng) + spike * 0.2,
      base_c + n_current(rng) + spike * 0.35,
      std::max(0.0, std::min(base_px + n_prox(rng), 1.0)),
      base_tq + n_torque(rng) + spike * 0.5,
      base_pr + n_pressure(rng) + spike * 0.1,
      base_h + n_humidity(rng)
  );
}

}  // namespace core_platform::nodes
