#include <iostream>
#include <vector>

#include "core_platform/nodes/maintenance_node.hpp"
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
  MaintenanceNode node;

  // evaluate_alerts - clean baseline
  {
    Sensors s;
    s.setOperationalValues(55.0, 2.3, 6.0, 0.25, 25.0, 3.5, 48.0);
    auto alerts = node.evaluate_alerts(s);
    TEST("baseline produces no alerts", alerts.empty());
  }

  // evaluate_alerts - critical vibration
  {
    Sensors s;
    s.setOperationalValues(55.0, 12.0, 6.0, 0.25, 25.0, 3.5, 48.0);
    auto alerts = node.evaluate_alerts(s);
    bool found = false;
    for (const auto& a : alerts) {
      if (a.source == "vibration" && a.severity == "critical") found = true;
    }
    TEST("high vibration triggers critical", found);
  }

  // evaluate_alerts - warning on humidity
  {
    Sensors s;
    s.setOperationalValues(55.0, 2.3, 6.0, 0.25, 25.0, 3.5, 78.0);
    auto alerts = node.evaluate_alerts(s);
    bool found = false;
    for (const auto& a : alerts) {
      if (a.source == "humidity" && a.severity == "warning") found = true;
    }
    TEST("high humidity triggers warning", found);
  }

  // compute_health_score - baseline
  {
    Sensors s;
    s.setOperationalValues(55.0, 2.3, 6.0, 0.25, 25.0, 3.5, 48.0);
    double score = node.compute_health_score(s);
    TEST("baseline health near 100", score > 90.0);
  }

  // compute_health_score - degraded
  {
    Sensors s;
    s.setOperationalValues(85.0, 7.0, 15.0, 0.25, 25.0, 3.5, 48.0);
    double score = node.compute_health_score(s);
    TEST("degraded health < 90", score < 90.0);
    TEST("degraded health >= 0", score >= 0.0);
  }

  // compute_health_score - floor
  {
    Sensors s;
    s.setOperationalValues(200.0, 50.0, 100.0, 0.25, 25.0, 3.5, 48.0);
    double score = node.compute_health_score(s);
    TEST("extreme values floor at 0", score == 0.0);
  }

  std::cout << "\n=== test_maintenance_node: " << passed << " passed, "
            << failed << " failed ===\n";
  return failed > 0 ? 1 : 0;
}
