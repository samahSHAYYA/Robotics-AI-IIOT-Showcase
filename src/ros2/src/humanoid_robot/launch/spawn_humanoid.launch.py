import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    pkg = get_package_share_directory('humanoid_robot')
    urdf_path = os.path.join(pkg, 'urdf', 'humanoid.xacro')

    return LaunchDescription([
        Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            name='humanoid_state_publisher',
            output='screen',
            arguments=[urdf_path],
        ),
        Node(
            package='gazebo_ros',
            executable='spawn_entity.py',
            name='spawn_humanoid',
            output='screen',
            arguments=['-topic', 'robot_description', '-entity', 'humanoid_C3',
                       '-x', '2.5', '-y', '5.0', '-z', '0.5'],
        ),
    ])
