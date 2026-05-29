#include <algorithm>
#include <string>

#include "core_platform/nodes/humanoid_node.hpp"
#include "core_platform/types.hpp"

namespace core_platform::nodes {

void HumanoidNode::tick(LineState& state) const {
  if (state.safety_mode == "stopped") {
    state.humanoid.mode = "safe_hold";
    state.humanoid.task = "hold_position";
    return;
  }

  const bool defective = (state.cam_qc.defect != "none");
  if (defective && state.line_mode == "idle") {
    state.humanoid.mode = "inspect";
    state.humanoid.task = "inspect_alert";
  } else if (state.line_mode == "running") {
    state.humanoid.mode = "patrol";
    state.humanoid.task = "patrol_zone";
  }

  state.humanoid.battery -= (state.line_mode == "running" ? 0.15 : 0.05);

  if (state.humanoid.battery < 20.0 && state.safety_mode != "stopped") {
    state.humanoid.mode = "dock";
    state.humanoid.task = "go_to_dock";
  }

  state.humanoid.battery = std::max(0.0, state.humanoid.battery);
}

}  // namespace core_platform::nodes
