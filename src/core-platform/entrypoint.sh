#!/bin/sh
set -e

cd /app

mkdir -p logs data

# Start Redis publisher in background
python3 scripts/publish_to_redis.py &

PUBLISHER_PID=$!

echo "Starting core-platform simulation ..."

./core_platform_sim

echo "Simulation complete. Publisher will continue re-publishing snapshot."

# Keep container alive so publisher keeps running
wait $PUBLISHER_PID
