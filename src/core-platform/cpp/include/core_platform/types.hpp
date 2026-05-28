/**
 * @author: Samah SHAYYA
 * @date: 19-Mar-2026 *
 * @brief: Umbrella core type header that gathers sensor classes and aggregate
 *         runtime structs for the core-platform simulation.
 * @note: Concrete classes are declared in dedicated ClassName.hpp files.
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

#ifndef CORE_PLATFORM_TYPES_HPP
#define CORE_PLATFORM_TYPES_HPP

#include <string>
#include <vector>

#include "core_platform/sensors/current_sensor.hpp"
#include "core_platform/sensors/distance_sensor.hpp"
#include "core_platform/sensors/humidity_sensor.hpp"
#include "core_platform/sensors/pressure_sensor.hpp"
#include "core_platform/sensors/temperature_sensor.hpp"
#include "core_platform/sensors/torque_sensor.hpp"
#include "core_platform/sensors/vibration_sensor.hpp"

namespace core_platform {

struct Alert {
  std::string source;
  std::string severity;
  std::string message;
};

struct Sensors {
  TemperatureSensor temperature {
      "temperature",
      328.15
  };  // 55 degC

  VibrationSensor vibration {
      "vibration",
      0.0023
  };  // 2.3 mm/s

  CurrentSensor current {
      "current",
      6.0
  };

  DistanceSensor proximity {
      "proximity",
      0.25
  };

  TorqueSensor torque {
      "torque",
      25.0
  };

  PressureSensor pressure {
      "pressure",
      350000.0
  };  // 3.5 bar

  HumiditySensor humidity {
      "humidity",
      0.48
  };  // 48%RH

  void setOperationalValues(double temperatureDegC,
                            double vibrationMmPerSec,
                            double currentA,
                            double proximityM,
                            double torqueNm,
                            double pressureBar,
                            double humidityPercent);

  [[nodiscard]]
  double temperatureDegC() const;

  [[nodiscard]]
  double vibrationMmPerSec() const;

  [[nodiscard]]
  double currentA() const;

  [[nodiscard]]
  double proximityM() const;

  [[nodiscard]]
  double torqueNm() const;

  [[nodiscard]]
  double pressureBar() const;

  [[nodiscard]]
  double humidityPercent() const;
};

struct CameraInspection {
  std::string camera;
  int frame_id {0};
  double anomaly_score {0.0};
  std::string defect {"none"};
};

struct WorkObject {
  std::string object_id;
  std::string model;
  std::string phase;
  std::string quality;
};

struct ConveyorState {
  std::string mode {"idle"};
  double speed_mps {0.0};
  std::string current_object_id;
};

struct Metrics {
  int units_total {0};
  int units_ok {0};
  int units_defective {0};
  double health_score {100.0};
};

struct Humanoid {
  std::string mode {"patrol"};
  std::string task {"patrol_zone"};
  double battery {100.0};
  std::string zone {"A"};
};

struct LineState {
  std::string line_mode {"idle"};
  std::string safety_mode {"running"};
  std::string batch_id;

  std::string infeed {"idle"};
  std::string weld {"idle"};
  std::string qc {"idle"};

  Sensors sensors;
  CameraInspection cam_infeed;
  CameraInspection cam_qc;
  ConveyorState conveyor;
  Humanoid humanoid;
  Metrics metrics;

  std::vector<Alert> alerts;
  std::vector<WorkObject> recent_objects;

  bool cycle_completed {false};
  bool last_cycle_defective {false};
};

}  // namespace core_platform

#endif  // CORE_PLATFORM_TYPES_HPP
