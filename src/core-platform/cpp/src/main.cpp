/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026
 * @brief: Core-platform simulation entrypoint assembling industrial nodes
 *         (assembly line, conveyor objects, sensors, cameras, safety,
 *         maintenance, humanoid).
 * @note: Runtime-oriented C++ implementation for Linux/Unix-targeted workflows.
 * @dependencies: STL and project-local core_platform modules.
 * @thread_safety: Not thread-safe by default; synchronize shared state
 *                 externally.
 * @performance: Optimized for deterministic tick-based simulation runtime.
 * @safety: Escalates to degraded/stopped behavior based on alert severity
 *          logic.
 * @warning: Simulation logic only; not certified for direct hardware control.
 * @todo: Replace mock profiles with calibrated plant/device models.
 * @see: src/core-platform/ReadMe.md
 */

#include <algorithm>
#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <random>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include <cstdlib>

#include "core_platform/types.hpp"
#include "core_platform/units/unit.hpp"

namespace core_platform {

namespace {

std::string now_iso() {

  using clock = std::chrono::system_clock;
  const auto now = clock::now();
  const std::time_t t = clock::to_time_t(now);
  std::tm tm {};

  #ifdef _WIN32
    gmtime_s(&tm, &t);
  #else
    gmtime_r(&t, &tm);
  #endif

  std::ostringstream oss;
  oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%SZ");

  return oss.str();
}

double clamp(double v, double lo, double hi) {
  return std::max(lo, std::min(v, hi));
}

void ensure_parent(const std::string& path) {

  std::filesystem::path p(path);

  if (!p.parent_path().empty()) {
    std::filesystem::create_directories(p.parent_path());
  }
}

void write_event(std::ofstream& stream, const std::string& type,
                 const std::string& payload) {

  stream << "{\"ts\":\"" << now_iso() << "\",\"type\":\"" << type
         << "\",\"payload\":" << payload << "}\n";
}

void sample_sensors(LineState& state, std::mt19937& rng) {

  std::uniform_real_distribution<double> n_temp(-2.0, 2.5);
  std::uniform_real_distribution<double> n_vib(-1.3, 1.5);
  std::uniform_real_distribution<double> n_current(-1.0, 1.4);
  std::uniform_real_distribution<double> n_prox(-0.12, 0.12);
  std::uniform_real_distribution<double> n_torque(-5.0, 6.5);
  std::uniform_real_distribution<double> n_pressure(-1.0, 1.2);
  std::uniform_real_distribution<double> n_humidity(-4.0, 4.0);
  std::uniform_real_distribution<double> spike_dist(4.0, 10.0);
  std::uniform_real_distribution<double> p(0.0, 1.0);

  double baseTemperatureDegC = 55.0;
  double baseVibrationMmPerSec = 2.3;
  double baseCurrentA = 6.0;
  double baseProximityM = 0.25;
  double baseTorqueNm = 25.0;
  double basePressureBar = 3.5;
  double baseHumidityPercent = 48.0;

  if (state.safety_mode == "stopped") {
    baseTemperatureDegC = 42.0;
    baseVibrationMmPerSec = 1.0;
    baseCurrentA = 2.5;
    baseProximityM = 0.1;
    baseTorqueNm = 15.0;
    basePressureBar = 2.0;
    baseHumidityPercent = 45.0;
  } else if (state.line_mode == "running") {
    baseTemperatureDegC = 71.0;
    baseVibrationMmPerSec = 5.0;
    baseCurrentA = 12.0;
    baseProximityM = 0.72;
    baseTorqueNm = 58.0;
    basePressureBar = 6.8;
    baseHumidityPercent = 55.0;
  }

  double spike = 0.0;

  if (state.line_mode == "running" && p(rng) < 0.07) {
    spike = spike_dist(rng);
  }

  state.sensors.setOperationalValues(
      baseTemperatureDegC + n_temp(rng) + spike * 0.9,
      baseVibrationMmPerSec + n_vib(rng) + spike * 0.2,
      baseCurrentA + n_current(rng) + spike * 0.35,
      clamp(baseProximityM + n_prox(rng), 0.0, 1.0),
      baseTorqueNm + n_torque(rng) + spike * 0.5,
      basePressureBar + n_pressure(rng) + spike * 0.1,
      baseHumidityPercent + n_humidity(rng)
  );
}

CameraInspection sample_camera(const LineState& state, int frame_id,
                               std::mt19937& rng) {

  std::uniform_real_distribution<double> n(-0.07, 0.07);
  std::uniform_int_distribution<int> defect_idx(1, 4);

  const double anomaly_raw = (state.sensors.temperatureDegC() - 50.0) / 60.0 +
                              (state.sensors.vibrationMmPerSec() / 20.0);

  double anomaly = clamp(anomaly_raw + n(rng), 0.01, 0.99);

  std::string defect = "none";
  if (anomaly > 0.74) {
    static const std::vector<std::string> defects {
      "surface_scratch",
      "misalignment",
      "porosity",
      "burn_mark"
    };

    defect = defects[defect_idx(rng) - 1];
  } else if (anomaly > 0.52) {
    defect = "surface_scratch";
  }

  CameraInspection cam;
  cam.camera = (frame_id % 2 == 0) ? "cam_qc" : "cam_infeed";
  cam.frame_id = frame_id;
  cam.anomaly_score = anomaly;
  cam.defect = defect;

  return cam;
}

std::vector<Alert> evaluate_alerts(const Sensors& s) {

  std::vector<Alert> alerts;

  const auto check = [&alerts](double value,
                               double warn,
                               double crit,
                               const std::string& source) {

    if (value >= crit) {
      alerts.push_back(Alert {source, "critical", source + " critical"});
    } else if (value >= warn) {
      alerts.push_back(Alert {source, "warning", source + " elevated"});
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

double compute_health_score(const Sensors& s) {

  double score = 100.0;

  score -= std::max(0.0, s.temperatureDegC() - 65.0) * 0.6;
  score -= std::max(0.0, s.vibrationMmPerSec() - 3.0) * 4.0;
  score -= std::max(0.0, s.currentA() - 10.0) * 2.0;

  return clamp(score, 0.0, 100.0);
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

void write_snapshot(const LineState& s, const std::string& path) {

  ensure_parent(path);
  std::ofstream out(path, std::ios::trunc);

  out << "{\n";
  out << "  \"line_mode\": \"" << s.line_mode << "\",\n";
  out << "  \"safety_mode\": \"" << s.safety_mode << "\",\n";
  out << "  \"batch_id\": \"" << s.batch_id << "\",\n";
  out << "  \"stations\": {"
      << "\"infeed\": \"" << s.infeed << "\", "
      << "\"weld\": \"" << s.weld << "\", "
      << "\"qc\": \"" << s.qc << "\"},\n";
  out << "  \"metrics\": {\"units_total\": " << s.metrics.units_total
      << ", \"units_ok\": " << s.metrics.units_ok
      << ", \"units_defective\": " << s.metrics.units_defective
      << ", \"health_score\": "
      << std::fixed << std::setprecision(2) << s.metrics.health_score
      << "},\n";
  out << "  \"humanoid\": {\"mode\": \"" << s.humanoid.mode
      << "\", \"task\": \"" << s.humanoid.task
      << "\", \"battery\": " << s.humanoid.battery << "}\n";
  out << "}\n";
}

int env_int(const char* key, int fallback) {

  if (const char* v = std::getenv(key)) {
    return std::atoi(v);
  }

  return fallback;
}

}  // namespace

}  // namespace core_platform

int main() {

  using namespace core_platform;

  Unit::init();

  const int run_seconds = env_int("SIM_RUN_SECONDS", 45);
  const int tick_ms = env_int("SIM_TICK_MS", 1000);

  LineState state;
  std::mt19937 rng(42);
  int frame_id = 0;
  int phase = 0;
  int batch_counter = 0;

  const std::string log_path = "logs/events.jsonl";
  const std::string snapshot_path = "data/final_state.json";

  ensure_parent(log_path);
  std::ofstream event_stream(log_path, std::ios::app);

  const auto start = std::chrono::steady_clock::now();
  while (true) {
    const auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
      std::chrono::steady_clock::now() - start).count();
    if (elapsed >= run_seconds) {
      break;
    }

    // Sensor + health + alerts
    sample_sensors(state, rng);
    state.alerts = evaluate_alerts(state.sensors);
    state.metrics.health_score = compute_health_score(state.sensors);
    state.safety_mode = derive_safety_mode(state.alerts);

    std::ostringstream sensor_payload;
    sensor_payload << "{\"temperature_degC\":"
                   << state.sensors.temperatureDegC()
                   << ",\"vibration_mmps\":"
                   << state.sensors.vibrationMmPerSec()
                   << ",\"current_A\":" << state.sensors.currentA()
                   << ",\"torque_Nm\":" << state.sensors.torqueNm() << "}";

    write_event(event_stream, "sensor.telemetry", sensor_payload.str());

    // Camera
    ++frame_id;
    auto cam = sample_camera(state, frame_id, rng);

    if (cam.camera == "cam_qc") {
      state.cam_qc = cam;
    } else {
      state.cam_infeed = cam;
    }

    std::ostringstream cam_payload;
    cam_payload << "{\"camera\":\"" << cam.camera
                << "\",\"frame_id\":" << cam.frame_id
                << ",\"anomaly_score\":" << std::fixed << std::setprecision(3)
                << cam.anomaly_score
                << ",\"defect\":\"" << cam.defect << "\"}";

    write_event(event_stream, "camera.inspection", cam_payload.str());

    // Orchestrator phases
    if (state.safety_mode == "stopped") {
      state.line_mode = "stopped";
      state.infeed = "stopped";
      state.weld = "stopped";
      state.qc = "stopped";
      state.humanoid.mode = "safe_hold";
      state.humanoid.task = "hold_position";
    } else {
      if (phase == 0) {
        state.line_mode = "running";
        state.batch_id = "BATCH-" + std::to_string(++batch_counter);
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
          state.humanoid.mode = "inspect";
          state.humanoid.task = "inspect_alert";
        } else {
          state.metrics.units_ok += 1;
          state.humanoid.mode = "patrol";
          state.humanoid.task = "patrol_zone";
        }
        state.line_mode = "idle";
        state.infeed = "idle";
        state.weld = "idle";
        state.qc = "idle";
      }
      phase = (phase + 1) % 4;
    }

    // Humanoid battery drain
    state.humanoid.battery -= (state.line_mode == "running" ? 0.15 : 0.05);

    if (state.humanoid.battery < 20.0 && state.safety_mode != "stopped") {
      state.humanoid.mode = "dock";
      state.humanoid.task = "go_to_dock";
    }

    state.humanoid.battery = std::max(0.0, state.humanoid.battery);

    std::ostringstream safety_payload;
    safety_payload << "{\"mode\":\"" << state.safety_mode << "\"}";
    write_event(event_stream, "safety.mode", safety_payload.str());

    std::this_thread::sleep_for(std::chrono::milliseconds(tick_ms));
  }

  event_stream.flush();
  event_stream.close();

  write_snapshot(state, snapshot_path);
  std::cout << "core_platform_sim complete. Snapshot: "
            << snapshot_path << "\n";
  
  return 0;
}
