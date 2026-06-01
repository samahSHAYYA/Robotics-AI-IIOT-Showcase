import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    pkg = get_package_share_directory('inspector_robot')
    urdf_path = os.path.join(pkg, 'urdf', 'inspector.xacro')

    return LaunchDescription([
        Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            name='inspector_state_publisher',
            output='screen',
            arguments=[urdf_path],
        ),
        Node(
            package='gazebo_ros',
            executable='spawn_entity.py',
            name='spawn_inspector',
            output='screen',
            arguments=['-topic', 'robot_description', '-entity', 'inspector_Q1',
                       '-x', '7.5', '-y', '2.5', '-z', '0.5'],
        ),
    ])
