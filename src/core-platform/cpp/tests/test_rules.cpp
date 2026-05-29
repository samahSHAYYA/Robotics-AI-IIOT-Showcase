#include <cassert>
#include <iostream>
#include <string>

#include "core_platform/rules.hpp"
#include "core_platform/types.hpp"

using namespace core_platform;

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
  // evaluate_alerts — no alerts at baseline
  {
    Sensors s;
    s.setOperationalValues(55.0, 2.3, 6.0, 0.25, 25.0, 3.5, 48.0);
    auto alerts = evaluate_alerts(s);
    TEST("baseline produces no alerts", alerts.empty());
  }

  // evaluate_alerts — critical temperature
  {
    Sensors s;
    s.setOperationalValues(90.0, 2.3, 6.0, 0.25, 25.0, 3.5, 48.0);
    auto alerts = evaluate_alerts(s);
    bool found = false;
    for (const auto& a : alerts) {
      if (a.source == "temperature" && a.severity == "critical") found = true;
    }
    TEST("high temperature triggers critical alert", found);
  }

  // evaluate_alerts — warning level
  {
    Sensors s;
    s.setOperationalValues(80.0, 2.3, 6.0, 0.25, 25.0, 3.5, 48.0);
    auto alerts = evaluate_alerts(s);
    bool found = false;
    for (const auto& a : alerts) {
      if (a.source == "temperature" && a.severity == "warning") found = true;
    }
    TEST("elevated temperature triggers warning alert", found);
  }

  // evaluate_alerts — multiple sensors
  {
    Sensors s;
    s.setOperationalValues(90.0, 10.0, 20.0, 0.25, 90.0, 11.0, 85.0);
    auto alerts = evaluate_alerts(s);
    TEST("all critical produces 6 alerts", alerts.size() == 6);
  }

  // derive_safety_mode — running with no alerts
  {
    std::vector<Alert> alerts;
    TEST("no alerts -> running", derive_safety_mode(alerts) == "running");
  }

  // derive_safety_mode — degraded with warning
  {
    std::vector<Alert> alerts = {{"temp", "warning", "warn"}};
    TEST("warning -> degraded", derive_safety_mode(alerts) == "degraded");
  }

  // derive_safety_mode — stopped with critical
  {
    std::vector<Alert> alerts = {{"temp", "critical", "crit"}};
    TEST("critical -> stopped", derive_safety_mode(alerts) == "stopped");
  }

  // derive_safety_mode — critical takes precedence over warning
  {
    std::vector<Alert> alerts = {{"vib", "warning", "warn"}, {"temp", "critical", "crit"}};
    TEST("critical over warning", derive_safety_mode(alerts) == "stopped");
  }

  // compute_health_score — perfect conditions
  {
    Sensors s;
    s.setOperationalValues(55.0, 2.3, 6.0, 0.25, 25.0, 3.5, 48.0);
    double score = compute_health_score(s);
    TEST("baseline health score", score > 90.0 && score <= 100.0);
  }

  // compute_health_score — degraded
  {
    Sensors s;
    s.setOperationalValues(90.0, 10.0, 20.0, 0.25, 25.0, 3.5, 48.0);
    double score = compute_health_score(s);
    TEST("degraded health score", score >= 0.0 && score < 90.0);
  }

  // compute_health_score — clamped to zero
  {
    Sensors s;
    s.setOperationalValues(200.0, 50.0, 100.0, 0.25, 25.0, 3.5, 48.0);
    double score = compute_health_score(s);
    TEST("extreme sensors score clamps to 0", score == 0.0);
  }

  std::cout << "\n=== test_rules: " << passed << " passed, "
            << failed << " failed ===\n";
  return failed > 0 ? 1 : 0;
}
