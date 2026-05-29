cmake_minimum_required(VERSION 3.20)
project(core_platform_sim LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ---- Code generation ----
set(COMPILATION_RESOURCES "${CMAKE_CURRENT_SOURCE_DIR}/compilation-resources")
set(CODEGEN_SCRIPT "${CMAKE_CURRENT_SOURCE_DIR}/scripts/codegen-measures.py")
set(GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")

add_custom_command(
    OUTPUT "${GENERATED_DIR}/measures.ipp"
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${GENERATED_DIR}"
    COMMAND python "${CODEGEN_SCRIPT}"
        "${COMPILATION_RESOURCES}/measures.json"
        "${GENERATED_DIR}/measures.ipp"
    DEPENDS "${COMPILATION_RESOURCES}/measures.json"
            "${CODEGEN_SCRIPT}"
    COMMENT "Generating measures.ipp from measures.json"
)

# Object library for test re-use
add_library(core_platform_objs OBJECT
  src/rules.cpp
  src/snapshot.cpp
  src/time_utils.cpp
  src/unit.cpp
  src/unit_registry.cpp
  src/types.cpp
  src/temperature_sensor.cpp
  src/vibration_sensor.cpp
  src/current_sensor.cpp
  src/distance_sensor.cpp
  src/torque_sensor.cpp
  src/pressure_sensor.cpp
  src/humidity_sensor.cpp
  src/nodes/sensor_node.cpp
  src/nodes/camera_node.cpp
  src/nodes/assembly_line_node.cpp
  src/nodes/humanoid_node.cpp
  src/nodes/safety_node.cpp
  src/nodes/maintenance_node.cpp
)

target_include_directories(core_platform_objs PUBLIC
    include
    "${GENERATED_DIR}"
)

target_sources(core_platform_objs PRIVATE "${GENERATED_DIR}/measures.ipp")

add_executable(core_platform_sim src/main.cpp)
target_link_libraries(core_platform_sim PRIVATE core_platform_objs)

# ---- Tests ----
option(BUILD_TESTS "Build C++ unit tests" ON)

if(BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
