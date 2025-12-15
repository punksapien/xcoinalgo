import os
import sys
import threading
import time
import json
import logging
import signal
from task_queue import queue
from strategy_executor_lib import StrategyExecutor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('Worker')

class Worker:
    def __init__(self):
        self.running = True
        self.executor = StrategyExecutor()
        self.worker_id = os.environ.get('WORKER_ID', f'worker-{os.getpid()}')

        # Handle graceful shutdown only if in main thread
        if threading.current_thread() is threading.main_thread():
            signal.signal(signal.SIGINT, self.shutdown)
            signal.signal(signal.SIGTERM, self.shutdown)

    def shutdown(self, signum, frame):
        logger.info("🛑 Shutting down worker...")
        self.running = False

    def start(self):
        logger.info(f"🚀 Worker {self.worker_id} started. Waiting for tasks...")

        while self.running:
            try:
                # Block for 5 seconds waiting for task
                task = queue.pop_task(timeout=5)

                if task:
                    self.process_task(task)
                else:
                    # Heartbeat or idle tasks could go here
                    pass

            except Exception as e:
                logger.error(f"Worker loop error: {e}")
                time.sleep(1)

    def process_task(self, task):
        task_id = task.get('id')
        task_type = task.get('type')
        payload = task.get('payload')

        logger.info(f"Processing task {task_id} ({task_type})")
        start_time = time.time()

        try:
            if task_type == 'EXECUTE_STRATEGY':
                result = self.executor.execute(payload)

                duration = time.time() - start_time
                status = 'SUCCESS' if result.get('success') else 'FAILED'

                logger.info(f"Task {task_id} completed in {duration:.2f}s. Status: {status}")

                # Acknowledge task (optional, if we want to store result in Redis)
                queue.acknowledge_task(task_id, status, result)

            else:
                logger.warning(f"Unknown task type: {task_type}")

        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            queue.acknowledge_task(task_id, 'ERROR', str(e))

if __name__ == "__main__":
    worker = Worker()
    worker.start()
