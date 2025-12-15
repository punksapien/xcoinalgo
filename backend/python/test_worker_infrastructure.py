import time
import threading
import json
from task_queue import queue
from worker import Worker

def run_worker():
    print("Starting worker in background thread...")
    worker = Worker()
    # Run for 10 seconds then stop
    threading.Timer(10.0, lambda: setattr(worker, 'running', False)).start()
    worker.start()

def test_infrastructure():
    # Start worker in separate thread
    worker_thread = threading.Thread(target=run_worker)
    worker_thread.start()

    time.sleep(2) # Wait for worker to start

    print("Pushing test task...")
    # Create a dummy strategy payload
    # We need a minimal valid strategy code
    strategy_code = """
class CoinDCXClient:
    def create_order(self, *args, **kwargs):
        return {'id': 'test_order'}
    def list_positions(self, *args, **kwargs):
        return []

class Trader:
    def generate_signals(self, df, params):
        df['Trailingsl'] = 0.0
        return df

class LiveTrader(Trader):
    def __init__(self, settings):
        self.client = CoinDCXClient()
        self.in_position = False

    def get_latest_data(self):
        import pandas as pd
        return pd.DataFrame({'close': [100, 101, 102], 'time': [1, 2, 3]})

    def check_for_new_signal(self, df):
        print("Checking for signal...")
"""

    payload = {
        'strategy_code': strategy_code,
        'settings': {'pair': 'B-BTC_USDT', 'resolution': '5', 'strategy_id': 'test_strat'},
        'subscribers': [{'user_id': 'user1', 'api_key': 'k', 'api_secret': 's', 'id': 'sub1'}]
    }

    task_id = queue.push_task('EXECUTE_STRATEGY', payload)
    print(f"Task pushed: {task_id}")

    # Wait for processing
    time.sleep(5)
    print("Test complete.")

if __name__ == "__main__":
    test_infrastructure()
