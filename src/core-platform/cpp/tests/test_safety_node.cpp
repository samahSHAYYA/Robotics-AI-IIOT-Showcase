#include <iostream>
#include <string>
#include <vector>

#include "core_platform/nodes/safety_node.hpp"
#include "core_platform/types.hpp"

using namespace core_platform;
using namespace core_platform::nodes;

static int passed = 0;
static int failed = 0;

#define TEST(name, expr) do { \
  if (!(expr)) { \
    std::cerr << "FAIL: " << name << "\n"; \
    ++failed; \
  } else { \
    std::cout << "PASS: " << name << "\n"; \
    ++passed; \
  } \
} while(false)

int main() {
  SafetyNode node;

  // No alerts -> running
  {
    std::vector<Alert> alerts;
    TEST("no alerts -> running", node.derive_mode(alerts) == "running");
  }

  // Warning -> degraded
  {
    std::vector<Alert> alerts = {{"temp", "warning", "temp elevated"}};
    TEST("warning -> degraded", node.derive_mode(alerts) == "degraded");
  }

  // Critical -> stopped
  {
    std::vector<Alert> alerts = {{"vib", "critical", "vib critical"}};
    TEST("critical -> stopped", node.derive_mode(alerts) == "stopped");
  }

  // Multiple alerts, highest severity wins
  {
    std::vector<Alert> alerts = {
      {"press", "warning", "press elevated"},
      {"temp", "critical", "temp critical"},
      {"cur", "warning", "cur elevated"}
    };
    TEST("critical trumps warning", node.derive_mode(alerts) == "stopped");
  }

  // Mixed warnings and criticals
  {
    std::vector<Alert> alerts = {
      {"press", "critical", "press critical"},
      {"temp", "critical", "temp critical"}
    };
    TEST("multiple criticals -> stopped", node.derive_mode(alerts) == "stopped");
  }

  std::cout << "\n=== test_safety_node: " << passed << " passed, "
            << failed << " failed ===\n";
  return failed > 0 ? 1 : 0;
}
