#include <algorithm>
#include <random>
#include <vector>

#include "core_platform/nodes/camera_node.hpp"
#include "core_platform/types.hpp"

namespace core_platform::nodes {

CameraNode::CameraNode(unsigned int seed) : rng(seed) {}

CameraInspection CameraNode::tick(const LineState& state) {
  ++frameId;

  std::uniform_real_distribution<double> n(-0.07, 0.07);
  std::uniform_int_distribution<int> defect_idx(1, 4);

  const double anomaly_raw =
      (state.sensors.temperatureDegC() - 50.0) / 60.0 +
      (state.sensors.vibrationMmPerSec() / 20.0);

  double anomaly = std::max(0.01, std::min(anomaly_raw + n(rng), 0.99));

  static const std::vector<std::string> defects {
      "surface_scratch", "misalignment", "porosity", "burn_mark"};

  std::string defect = "none";
  if (anomaly > 0.74) {
    defect = defects[defect_idx(rng) - 1];
  } else if (anomaly > 0.52) {
    defect = "surface_scratch";
  }

  CameraInspection cam;
  cam.camera = (frameId % 2 == 0) ? "cam_qc" : "cam_infeed";
  cam.frame_id = frameId;
  cam.anomaly_score = anomaly;
  cam.defect = defect;

  return cam;
}

}  // namespace core_platform::nodes
