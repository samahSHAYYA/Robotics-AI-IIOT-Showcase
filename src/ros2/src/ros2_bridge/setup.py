from setuptools import setup

package_name = 'ros2_bridge'

setup(
    name=package_name,
    version='1.0.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages', [f'resource/{package_name}']),
        (f'share/{package_name}', ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='Developer',
    maintainer_email='dev@factory.showcase',
    description='Bridges Gazebo robot poses to ops-api telemetry via Redis',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'ros2_bridge = ros2_bridge.bridge_node:main',
        ],
    },
)
