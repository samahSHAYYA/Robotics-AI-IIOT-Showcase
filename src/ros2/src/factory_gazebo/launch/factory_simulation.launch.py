import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, ExecuteProcess
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import Command

def generate_launch_description():
    gazebo_pkg = get_package_share_directory('factory_gazebo')
    world_path = os.path.join(gazebo_pkg, 'worlds', 'factory_floor.world')

    # Gazebo server
    gzserver = ExecuteProcess(
        cmd=['gazebo', '--verbose', world_path, '-s', 'libgazebo_ros_factory.so'],
        output='screen',
    )

    # Gazebo client (GUI)
    gzclient = ExecuteProcess(
        cmd=['gzclient'],
        output='screen',
    )

    # Spawn humanoid
    spawn_humanoid = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            os.path.join(get_package_share_directory('humanoid_robot'),
                         'launch', 'spawn_humanoid.launch.py')
        ])
    )

    # Spawn welder
    spawn_welder = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            os.path.join(get_package_share_directory('welder_robot'),
                         'launch', 'spawn_welder.launch.py')
        ])
    )

    # Spawn inspector
    spawn_inspector = IncludeLaunchDescription(
        PythonLaunchDescriptionSource([
            os.path.join(get_package_share_directory('inspector_robot'),
                         'launch', 'spawn_inspector.launch.py')
        ])
    )

    return LaunchDescription([
        gzserver,
        gzclient,
        spawn_humanoid,
        spawn_welder,
        spawn_inspector,
    ])
