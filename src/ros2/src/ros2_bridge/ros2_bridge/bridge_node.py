import json
import math
import signal
import sys

from datetime import datetime, timezone

import redis
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Pose
from std_msgs.msg import String


class Ros2BridgeNode(Node):
    """
    Bridges Gazebo robot state into the ops-api telemetry pipeline via Redis
    Streams.

    Subscribes to /<robot_id>/pose topics from Gazebo and writes structured
    telemetry snapshots to the Redis stream 'events:core-platform' at a
    configurable interval. The ops-api consumer reads from this stream and
    updates the in-memory telemetry store.

    Parameters
    ----------
    redis_host : str, optional
        Redis hostname (default: 'localhost').
    redis_port : int, optional
        Redis port (default: 6379).
    publish_interval : float, optional
        Interval in seconds between snapshot publications (default: 2.0).
    factory_id : int, optional
        Factory identifier for multi-tenant routing (default: 1).
    """

    STREAM_NAME: str = 'events:core-platform'
    GROUP_NAME: str = 'ros2-bridge'
    STREAM_MAXLEN: int = 100000

    def __init__(self):
        super().__init__('ros2_bridge')
        self.declare_parameter('redis_host', 'localhost')
        self.declare_parameter('redis_port', 6379)
        self.declare_parameter('publish_interval', 2.0)
        self.declare_parameter('factory_id', 1)

        redis_host = self.get_parameter('redis_host').value
        redis_port = self.get_parameter('redis_port').value
        interval = self.get_parameter('publish_interval').value
        self.factory_id = int(self.get_parameter('factory_id').value)

        self.redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            decode_responses=True,
        )

        # Ensure consumer group exists for the ops-api to read from
        self._ensure_consumer_group()

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
            f'publish every {interval}s, factory_id={self.factory_id}'
        )

    def _ensure_consumer_group(self):
        """
        Create the consumer group for 'events:core-platform' if it does not
        already exist. This allows the ops-api consumer to pick up messages
        from the same stream.
        """
        try:
            self.redis_client.xgroup_create(
                self.STREAM_NAME,
                self.GROUP_NAME,
                id='0',
                mkstream=True,
            )
            self.get_logger().info(
                f'Consumer group "{self.GROUP_NAME}" ready on {self.STREAM_NAME}'
            )
        except redis.ResponseError as e:
            if 'BUSYGROUP' in str(e):
                self.get_logger().debug(
                    f'Consumer group "{self.GROUP_NAME}" already exists'
                )
            else:
                self.get_logger().error(
                    f'Failed to create consumer group: {e}'
                )
                raise

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
        """
        Build a telemetry snapshot from the latest Gazebo poses and write it
        to the Redis stream 'events:core-platform'.
        """
        snapshot = {
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
        }

        stream_fields = {
            'event_type': 'telemetry.snapshot',
            'source': 'ros2',
            'factory_id': str(self.factory_id),
            'payload': json.dumps(snapshot),
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }

        try:
            self.redis_client.xadd(
                self.STREAM_NAME,
                stream_fields,
                maxlen=self.STREAM_MAXLEN,
            )
            self.get_logger().debug(
                f'Published ROS2 snapshot with {len(snapshot["robots"])} robots'
            )
        except redis.RedisError as e:
            self.get_logger().error(f'Redis xadd error: {e}')

    def destroy_node(self):
        self.get_logger().info('Shutting down ROS2 Bridge')
        super().destroy_node()


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
