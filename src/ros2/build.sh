#!/usr/bin/env bash
# Build the ROS 2 workspace.
# Prerequisites: ROS 2 Humble or later sourced (source /opt/ros/humble/setup.bash)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Installing python dependencies ==="
pip install --quiet lxml redis

echo "=== Building ROS 2 workspace ==="
colcon build --symlink-install

echo "=== Sourcing setup ==="
source install/setup.bash

echo "=== Done ==="
echo "Run: ros2 launch factory_gazebo factory_simulation.launch.py"
