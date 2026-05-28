#
# @author: Samah SHAYYA
# @date: 19-Mar-2026#
# @description: Build definition for core-platform C++ simulation runtime.
# @notes: C++20 baseline; keep target minimal and explicit.
# @dependencies: CMake 3.20+, standard C++ toolchain.
# @thread_safety: N/A (build configuration file).
# @performance: Release tuning can be added via toolchain/profile flags.
# @safety: Build graph should remain deterministic and reproducible.
# @warning: Add new source files explicitly to keep compile scope controlled.
# @todo: Split node modules into dedicated translation units as implementation
#        grows.
# @reference: src/core-platform/ReadMe.md
#

cmake_minimum_required(VERSION 3.20)
project(core_platform_sim LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Keep executable target explicit for reviewability.
add_executable(core_platform_sim
  src/main.cpp
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
)

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

target_sources(core_platform_sim PRIVATE "${GENERATED_DIR}/measures.ipp")

# Public headers are not exposed yet; include path remains private.
target_include_directories(core_platform_sim PRIVATE
    include
    "${GENERATED_DIR}"
)
