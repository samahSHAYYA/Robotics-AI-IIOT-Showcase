#include <string>
#include <vector>

#include "core_platform/nodes/safety_node.hpp"
#include "core_platform/rules.hpp"
#include "core_platform/types.hpp"

namespace core_platform::nodes {

std::string SafetyNode::derive_mode(const std::vector<Alert>& alerts) const {
  return core_platform::derive_safety_mode(alerts);
}

}  // namespace core_platform::nodes
