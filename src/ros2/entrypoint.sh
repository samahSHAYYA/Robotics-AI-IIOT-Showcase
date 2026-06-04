#!/bin/bash
set -e

# Source ROS 2 and workspace setup
source /opt/ros/jazzy/setup.bash
source /ros2_ws/install/setup.bash

# Configuration from environment variables
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
PUBLISH_INTERVAL="${PUBLISH_INTERVAL:-2.0}"
FACTORY_ID="${FACTORY_ID:-1}"
HEADLESS="${GAZEBO_HEADLESS:-true}"

echo "=== ROS 2 Simulation Entrypoint ==="
echo "  Redis:        ${REDIS_HOST}:${REDIS_PORT}"
echo "  Factory ID:   ${FACTORY_ID}"
echo "  Interval:     ${PUBLISH_INTERVAL}s"
echo "  Headless:     ${HEADLESS}"
echo ""

# Start Gazebo simulation in the background
if [ "$HEADLESS" = "true" ]; then
    echo "Starting Gazebo server (headless) ..."
    gzserver /ros2_ws/src/factory_gazebo/worlds/factory_floor.world &
    GAZEBO_PID=$!
else
    echo "Starting Gazebo with GUI ..."
    ros2 launch factory_gazebo factory_simulation.launch.py &
    GAZEBO_PID=$!
fi

# Wait for Gazebo to initialize
echo "Waiting for Gazebo to initialize (8s) ..."
sleep 8

# Start the ROS 2 bridge
echo "Starting ROS 2 bridge ..."
ros2 run ros2_bridge ros2_bridge \
    --ros-args \
    -p redis_host:="$REDIS_HOST" \
    -p redis_port:="$REDIS_PORT" \
    -p publish_interval:="$PUBLISH_INTERVAL" \
    -p factory_id:="$FACTORY_ID"

BRIDGE_EXIT=$?

# If bridge exits, clean up
echo "Bridge exited with code ${BRIDGE_EXIT}. Shutting down Gazebo ..."
kill $GAZEBO_PID 2>/dev/null || true

exit $BRIDGE_EXIT
