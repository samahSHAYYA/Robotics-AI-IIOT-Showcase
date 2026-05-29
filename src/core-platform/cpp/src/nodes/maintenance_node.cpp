#include <vector>

#include "core_platform/nodes/maintenance_node.hpp"
#include "core_platform/rules.hpp"
#include "core_platform/types.hpp"

namespace core_platform::nodes {

std::vector<Alert> MaintenanceNode::evaluate_alerts(const Sensors& sensors) const {
  return core_platform::evaluate_alerts(sensors);
}

double MaintenanceNode::compute_health_score(const Sensors& sensors) const {
  return core_platform::compute_health_score(sensors);
}

}  // namespace core_platform::nodes
