import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    pkg = get_package_share_directory('welder_robot')
    urdf_path = os.path.join(pkg, 'urdf', 'welder.xacro')

    return LaunchDescription([
        Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            name='welder_state_publisher',
            output='screen',
            arguments=[urdf_path],
        ),
        Node(
            package='gazebo_ros',
            executable='spawn_entity.py',
            name='spawn_welder',
            output='screen',
            arguments=['-topic', 'robot_description', '-entity', 'welder_W2',
                       '-x', '5.0', '-y', '5.0', '-z', '0.5'],
        ),
    ])
