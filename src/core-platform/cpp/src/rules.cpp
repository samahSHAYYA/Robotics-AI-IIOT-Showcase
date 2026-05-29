#include <algorithm>
#include <string>
#include <vector>

#include "core_platform/rules.hpp"
#include "core_platform/types.hpp"

namespace core_platform {

std::vector<Alert> evaluate_alerts(const Sensors& s) {
  std::vector<Alert> alerts;

  const auto check = [&alerts](double value, double warn, double crit, const std::string& source) {
    if (value >= crit) {
      alerts.push_back(Alert{source, "critical", source + " critical"});
    } else if (value >= warn) {
      alerts.push_back(Alert{source, "warning", source + " elevated"});
    }
  };

  check(s.temperatureDegC(), 75.0, 85.0, "temperature");
  check(s.vibrationMmPerSec(), 6.5, 9.0, "vibration");
  check(s.currentA(), 14.0, 18.0, "current");
  check(s.torqueNm(), 70.0, 85.0, "torque");
  check(s.pressureBar(), 8.0, 10.0, "pressure");
  check(s.humidityPercent(), 72.0, 82.0, "humidity");

  return alerts;
}

std::string derive_safety_mode(const std::vector<Alert>& alerts) {
  for (const auto& a : alerts) {
    if (a.severity == "critical") {
      return "stopped";
    }
  }

  for (const auto& a : alerts) {
    if (a.severity == "warning") {
      return "degraded";
    }
  }

  return "running";
}

double compute_health_score(const Sensors& s) {
  double score = 100.0;

  score -= std::max(0.0, s.temperatureDegC() - 65.0) * 0.6;
  score -= std::max(0.0, s.vibrationMmPerSec() - 3.0) * 4.0;
  score -= std::max(0.0, s.currentA() - 10.0) * 2.0;

  return std::max(0.0, std::min(score, 100.0));
}

}  // namespace core_platform
