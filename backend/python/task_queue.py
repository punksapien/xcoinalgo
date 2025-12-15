import redis
import json
import logging
import os
import time
from typing import Dict, Any, Optional, Callable

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('TaskQueue')

class TaskQueue:
    """
    Redis-based Task Queue for Strategy Execution.
    Compatible with BullMQ (Node.js) format if needed, or simple list for now.
    """

    def __init__(self, redis_url: str = None, queue_name: str = 'strategy_queue'):
        self.redis_url = redis_url or os.environ.get('REDIS_URL', 'redis://localhost:6379')
        self.queue_name = queue_name
        self.redis_client = None
        self.connect()

    def connect(self):
        """Establish connection to Redis"""
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            self.redis_client.ping()
            logger.info(f"✅ Connected to Redis at {self.redis_url}")
        except Exception as e:
            logger.error(f"❌ Failed to connect to Redis: {e}")
            raise

    def push_task(self, task_type: str, payload: Dict[str, Any]):
        """Push a task to the queue"""
        task = {
            'id': f"{task_type}_{int(time.time()*1000)}",
            'type': task_type,
            'payload': payload,
            'timestamp': time.time()
        }
        try:
            # Using LPUSH to add to the head of the list (queue)
            # Workers will RPOP (process oldest first)
            self.redis_client.lpush(self.queue_name, json.dumps(task))
            logger.info(f"Task pushed: {task['id']} ({task_type})")
            return task['id']
        except Exception as e:
            logger.error(f"Failed to push task: {e}")
            raise

    def pop_task(self, timeout: int = 0) -> Optional[Dict[str, Any]]:
        """
        Block and wait for a task from the queue.
        timeout: 0 means block indefinitely.
        """
        try:
            # BRPOP returns a tuple (queue_name, data)
            result = self.redis_client.brpop(self.queue_name, timeout=timeout)

            if result:
                _, data = result
                return json.loads(data)
            return None
        except Exception as e:
            logger.error(f"Error popping task: {e}")
            # Reconnect on error
            time.sleep(1)
            try:
                self.connect()
            except:
                pass
            return None

    def acknowledge_task(self, task_id: str, status: str, result: Any = None):
        """
        Optional: Store task result/status in Redis
        """
        key = f"task:{task_id}"
        data = {
            'status': status,
            'result': result,
            'updated_at': time.time()
        }
        self.redis_client.setex(key, 3600, json.dumps(data))  # Expire after 1 hour

# Singleton instance
queue = TaskQueue()
