#include <string>

#include "core_platform/nodes/assembly_line_node.hpp"
#include "core_platform/types.hpp"

namespace core_platform::nodes {

void AssemblyLineNode::tick(LineState& state) {
  if (state.safety_mode == "stopped") {
    state.line_mode = "stopped";
    state.infeed = "stopped";
    state.weld = "stopped";
    state.qc = "stopped";
    return;
  }

  if (phase == 0) {
    state.line_mode = "running";
    state.batch_id = "BATCH-" + std::to_string(++batchCounter);
    state.infeed = "running";
    state.weld = "waiting";
    state.qc = "waiting";
  } else if (phase == 1) {
    state.infeed = "complete";
    state.weld = "running";
  } else if (phase == 2) {
    state.weld = "complete";
    state.qc = "running";
  } else {
    const bool defective = (state.cam_qc.defect != "none");
    state.metrics.units_total += 1;
    if (defective) {
      state.metrics.units_defective += 1;
    } else {
      state.metrics.units_ok += 1;
    }
    state.line_mode = "idle";
    state.infeed = "idle";
    state.weld = "idle";
    state.qc = "idle";
  }

  phase = (phase + 1) % 4;
  ++objectCounter;
}

}  // namespace core_platform::nodes
