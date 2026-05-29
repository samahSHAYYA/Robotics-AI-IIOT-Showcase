#include <cassert>
#include <iostream>

#include "core_platform/nodes/sensor_node.hpp"
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
  // SensorNode produces valid sensors on idle line
  {
    SensorNode node(42);
    LineState state;
    state.line_mode = "idle";
    state.safety_mode = "running";
    Sensors s;
    s.setOperationalValues(0,0,0,0,0,0,0);
    node.tick(state, s);

    TEST("sensor tick returns valid temperature",
         s.temperatureDegC() > 30.0 && s.temperatureDegC() < 80.0);
    TEST("sensor tick returns valid vibration",
         s.vibrationMmPerSec() >= 0.0 && s.vibrationMmPerSec() < 10.0);
    TEST("sensor tick returns valid current",
         s.currentA() >= 0.0 && s.currentA() < 20.0);
    TEST("sensor tick returns valid torque",
         s.torqueNm() >= 0.0 && s.torqueNm() < 80.0);
    TEST("sensor tick returns valid pressure",
         s.pressureBar() >= 1.0 && s.pressureBar() < 10.0);
    TEST("sensor tick returns valid humidity",
         s.humidityPercent() >= 30.0 && s.humidityPercent() < 70.0);
    TEST("sensor tick returns valid proximity",
         s.proximityM() >= 0.0 && s.proximityM() <= 1.0);
  }

  // SensorNode produces higher values on running line
  {
    SensorNode node(42);
    LineState state;
    state.line_mode = "running";
    state.safety_mode = "running";
    Sensors s;
    s.setOperationalValues(0,0,0,0,0,0,0);
    node.tick(state, s);

    TEST("running sensor tick returns valid temperature",
         s.temperatureDegC() > 40.0 && s.temperatureDegC() < 100.0);
    TEST("running sensor tick returns valid current",
         s.currentA() > 2.0 && s.currentA() < 30.0);
  }

  // SensorNode produces lower values on stopped line
  {
    SensorNode node(42);
    LineState state;
    state.line_mode = "stopped";
    state.safety_mode = "stopped";
    Sensors s;
    s.setOperationalValues(0,0,0,0,0,0,0);
    node.tick(state, s);

    TEST("stopped sensor tick: lower current",
         s.currentA() < 8.0);
  }

  // Reproducibility with same seed
  {
    SensorNode a(99);
    SensorNode b(99);
    LineState state;
    state.line_mode = "idle";
    state.safety_mode = "running";
    Sensors sa;
    Sensors sb;
    sa.setOperationalValues(0,0,0,0,0,0,0);
    sb.setOperationalValues(0,0,0,0,0,0,0);
    a.tick(state, sa);
    b.tick(state, sb);

    TEST("deterministic: same temperature",
         sa.temperatureDegC() == sb.temperatureDegC());
    TEST("deterministic: same vibration",
         sa.vibrationMmPerSec() == sb.vibrationMmPerSec());
  }

  std::cout << "\n=== test_sensor_node: " << passed << " passed, "
            << failed << " failed ===\n";
  return failed > 0 ? 1 : 0;
}
