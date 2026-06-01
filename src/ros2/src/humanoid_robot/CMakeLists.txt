cmake_minimum_required(VERSION 3.8)
project(humanoid_robot)

find_package(ament_cmake REQUIRED)

install(DIRECTORY urdf launch
  DESTINATION share/${PROJECT_NAME})

ament_package()
