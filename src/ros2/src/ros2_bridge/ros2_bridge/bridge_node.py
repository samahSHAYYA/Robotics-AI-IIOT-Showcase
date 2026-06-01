import json
import math
import signal
import sys

import redis
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Pose
from std_msgs.msg import String


class Ros2BridgeNode(Node):
    """
    Bridges Gazebo robot state into the ops-api telemetry pipeline via Redis.

    Subscribes to /robot_pose/<robot_id> topics from Gazebo and publishes
    structured telemetry snapshots to Redis channel 'telemetry:snapshot'
    at a configurable interval.
    """

    def __init__(self):
        super().__init__('ros2_bridge')
        self.declare_parameter('redis_host', 'localhost')
        self.declare_parameter('redis_port', 6379)
        self.declare_parameter('publish_interval', 2.0)

        redis_host = self.get_parameter('redis_host').value
        redis_port = self.get_parameter('redis_port').value
        interval = self.get_parameter('publish_interval').value

        self.redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            decode_responses=True,
        )

        self.robot_poses: dict[str, dict] = {}
        self.robot_topics: list[str] = [
            'humanoid_C3/pose',
            'welder_W2/pose',
            'inspector_Q1/pose',
        ]

        for topic in self.robot_topics:
            self.create_subscription(Pose, topic, self.make_callback(topic), 10)

        self.timer = self.create_timer(interval, self.publish_snapshot)
        self.get_logger().info(
            f'ROS 2 Bridge started — Redis {redis_host}:{redis_port}, '
            f'publish every {interval}s'
        )

    def make_callback(self, topic: str):
        robot_id = topic.split('/')[0]
        topic_to_robot = {
            'humanoid_C3': 'C3',
            'welder_W2': 'W2',
            'inspector_Q1': 'Q1',
        }
        rid = topic_to_robot.get(robot_id, robot_id)

        def callback(msg: Pose):
            self.robot_poses[rid] = {
                'x': msg.position.x,
                'y': msg.position.y,
                'theta': 2 * math.atan2(msg.orientation.z, msg.orientation.w),
                'last_seen': self.get_clock().now().nanoseconds,
            }

        return callback

    def publish_snapshot(self):
        snapshot = {
            'type': 'snapshot',
            'data': {
                'robots': [
                    {
                        'robot_id': rid,
                        'pose': {
                            'x': pose['x'],
                            'y': pose['y'],
                            'theta': pose['theta'],
                        },
                        'status': 'moving',
                        'battery': 85.0,
                        'temperature': 42.0,
                        'current_task': 'Simulated Task',
                    }
                    for rid, pose in self.robot_poses.items()
                ],
                'alerts': [],
            },
        }
        try:
            self.redis_client.publish(
                'telemetry:snapshot',
                json.dumps(snapshot),
            )
        except redis.RedisError as e:
            self.get_logger().error(f'Redis publish error: {e}')


def main():
    rclpy.init()
    node = Ros2BridgeNode()

    def shutdown(sig, frame):
        node.destroy_node()
        rclpy.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    rclpy.spin(node)


if __name__ == '__main__':
    main()
