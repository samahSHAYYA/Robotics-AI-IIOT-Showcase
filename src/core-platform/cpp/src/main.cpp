#include <chrono>
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <thread>

#include "core_platform/nodes/assembly_line_node.hpp"
#include "core_platform/nodes/camera_node.hpp"
#include "core_platform/nodes/humanoid_node.hpp"
#include "core_platform/nodes/maintenance_node.hpp"
#include "core_platform/nodes/safety_node.hpp"
#include "core_platform/nodes/sensor_node.hpp"
#include "core_platform/rules.hpp"
#include "core_platform/snapshot.hpp"
#include "core_platform/types.hpp"
#include "core_platform/units/unit.hpp"
#include "core_platform/utils.hpp"

int main() {
  using namespace core_platform;

  Unit::init();

  const int run_seconds = env_int("SIM_RUN_SECONDS", 45);
  const int tick_ms = env_int("SIM_TICK_MS", 1000);

  LineState state;
  nodes::SensorNode sensor_node(42);
  nodes::CameraNode camera_node(42);
  nodes::AssemblyLineNode line_node;
  nodes::HumanoidNode humanoid_node;
  nodes::SafetyNode safety_node;
  nodes::MaintenanceNode maintenance_node;

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

    sensor_node.tick(state, state.sensors);
    state.alerts = maintenance_node.evaluate_alerts(state.sensors);
    state.metrics.health_score = maintenance_node.compute_health_score(state.sensors);
    state.safety_mode = safety_node.derive_mode(state.alerts);

    {
      std::ostringstream p;
      p << "{\"temperature_degC\":" << state.sensors.temperatureDegC()
        << ",\"vibration_mmps\":" << state.sensors.vibrationMmPerSec()
        << ",\"current_A\":" << state.sensors.currentA()
        << ",\"torque_Nm\":" << state.sensors.torqueNm() << "}";
      write_event(event_stream, "sensor.telemetry", p.str());
    }

    // Camera
    auto cam = camera_node.tick(state);
    if (cam.camera == "cam_qc") {
      state.cam_qc = cam;
    } else {
      state.cam_infeed = cam;
    }

    {
      std::ostringstream p;
      p << "{\"camera\":\"" << cam.camera
        << "\",\"frame_id\":" << cam.frame_id
        << ",\"anomaly_score\":" << std::fixed << std::setprecision(3)
        << cam.anomaly_score
        << ",\"defect\":\"" << cam.defect << "\"}";
      write_event(event_stream, "camera.inspection", p.str());
    }

    // Assembly line + humanoid
    line_node.tick(state);
    humanoid_node.tick(state);

    {
      std::ostringstream p;
      p << "{\"mode\":\"" << state.safety_mode << "\"}";
      write_event(event_stream, "safety.mode", p.str());
    }

    std::this_thread::sleep_for(std::chrono::milliseconds(tick_ms));
  }

  event_stream.flush();
  event_stream.close();

  write_snapshot(state, snapshot_path);
  std::cout << "core_platform_sim complete. Snapshot: " << snapshot_path << "\n";
  return 0;
}
