FROM osrf/ros:jazzy-desktop-full

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip \
    python3-colcon-common-extensions \
    ros-jazzy-gazebo-ros-pkgs \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
RUN pip3 install --no-cache-dir redis

WORKDIR /ros2_ws

# Copy workspace source
COPY src/ ./src/

# Build workspace
RUN . /opt/ros/jazzy/setup.sh && \
    colcon build --symlink-install

# Source setup in entrypoint (will be sourced in entrypoint.sh)
RUN echo "source /ros2_ws/install/setup.bash" >> ~/.bashrc

COPY entrypoint.sh /
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
