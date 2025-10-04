"""
Strategy Manager - Core class for managing strategy execution and lifecycle.

This class handles:
- Strategy deployment and validation
- Process isolation and execution
- Resource monitoring and management
- Signal collection and distribution
- Communication with main platform
"""

import asyncio
import json
import uuid
import subprocess
import tempfile
import os
import shutil
import signal
import psutil
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from pathlib import Path
import redis.asyncio as redis

from models import (
    StrategyDeploymentRequest,
    StrategyStatus,
    StrategyInfo,
    StrategyMetrics,
    StrategySignal,
    MarketData,
    ValidationResult
)

logger = logging.getLogger(__name__)


class StrategyProcess:
    """Manages a single strategy process."""

    def __init__(self, strategy_id: str, config: dict):
        self.strategy_id = strategy_id
        self.config = config
        self.process: Optional[subprocess.Popen] = None
        self.working_dir: Optional[Path] = None
        self.status = StrategyStatus.PENDING
        self.deployed_at = datetime.utcnow()
        self.started_at: Optional[datetime] = None
        self.stopped_at: Optional[datetime] = None
        self.last_error: Optional[str] = None
        self.error_count = 0
        self.metrics = StrategyMetrics()

    async def start(self, strategy_code: str) -> bool:
        """Start the strategy process."""
        try:
            # Create isolated working directory
            self.working_dir = Path(tempfile.mkdtemp(prefix=f"strategy_{self.strategy_id}_"))

            # Write strategy code to file
            strategy_file = self.working_dir / "strategy.py"
            with open(strategy_file, 'w') as f:
                f.write(strategy_code)

            # Write configuration
            config_file = self.working_dir / "config.json"
            with open(config_file, 'w') as f:
                json.dump(self.config, f, indent=2)

            # Create startup script
            startup_script = self._create_startup_script()
            script_file = self.working_dir / "run_strategy.py"
            with open(script_file, 'w') as f:
                f.write(startup_script)

            # Start the process
            self.process = subprocess.Popen(
                ["python", "run_strategy.py"],
                cwd=str(self.working_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )

            self.status = StrategyStatus.ACTIVE
            self.started_at = datetime.utcnow()
            self.metrics.started_at = self.started_at

            logger.info(f"Strategy {self.strategy_id} started with PID {self.process.pid}")
            return True

        except Exception as e:
            self.status = StrategyStatus.FAILED
            self.last_error = str(e)
            self.error_count += 1
            logger.error(f"Failed to start strategy {self.strategy_id}: {e}")
            return False

    async def stop(self) -> bool:
        """Stop the strategy process."""
        try:
            if self.process and self.process.poll() is None:
                # Graceful shutdown
                self.process.terminate()

                # Wait for graceful shutdown
                try:
                    await asyncio.wait_for(
                        asyncio.to_thread(self.process.wait),
                        timeout=5.0
                    )
                except asyncio.TimeoutError:
                    # Force kill if not responding
                    self.process.kill()
                    await asyncio.to_thread(self.process.wait)

            self.status = StrategyStatus.STOPPED
            self.stopped_at = datetime.utcnow()

            # Cleanup working directory
            if self.working_dir and self.working_dir.exists():
                shutil.rmtree(self.working_dir)

            logger.info(f"Strategy {self.strategy_id} stopped")
            return True

        except Exception as e:
            self.last_error = str(e)
            self.error_count += 1
            logger.error(f"Failed to stop strategy {self.strategy_id}: {e}")
            return False

    def get_resource_usage(self) -> Dict[str, float]:
        """Get current resource usage."""
        if not self.process or self.process.poll() is not None:
            return {"memory_mb": 0.0, "cpu_percent": 0.0}

        try:
            proc = psutil.Process(self.process.pid)
            memory_mb = proc.memory_info().rss / (1024 * 1024)
            cpu_percent = proc.cpu_percent()

            return {
                "memory_mb": memory_mb,
                "cpu_percent": cpu_percent
            }
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return {"memory_mb": 0.0, "cpu_percent": 0.0}

    def _create_startup_script(self) -> str:
        """Create the startup script for the strategy."""
        return f"""
import sys
import json
import asyncio
import logging
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add SDK to path (assuming it's available)
sys.path.append('/path/to/coindcx_sdk')

try:
    from coindcx_sdk import BaseStrategy, StrategyConfig
    from strategy import MyStrategy  # Import user's strategy class

    # Load configuration
    with open('config.json', 'r') as f:
        config_data = json.load(f)

    config = StrategyConfig(**config_data)

    # Create and run strategy
    strategy = MyStrategy(config)

    # Initialize strategy
    strategy.initialize()
    logger.info("Strategy {self.strategy_id} initialized successfully")

    # Start the main loop (this would be replaced with actual execution logic)
    async def main_loop():
        while True:
            try:
                # This is where the strategy would receive market data
                # and generate signals in the real implementation
                await asyncio.sleep(1)

            except KeyboardInterrupt:
                logger.info("Strategy {self.strategy_id} shutting down gracefully")
                break
            except Exception as e:
                logger.error(f"Strategy error: {{e}}")
                await asyncio.sleep(5)  # Brief pause before retry

    # Run the strategy
    asyncio.run(main_loop())

except Exception as e:
    logger.error(f"Failed to start strategy: {{e}}")
    sys.exit(1)
"""

    def to_info(self) -> StrategyInfo:
        """Convert to StrategyInfo model."""
        resource_usage = self.get_resource_usage()

        return StrategyInfo(
            strategy_id=self.strategy_id,
            user_id=self.config.get("user_id", ""),
            config=self.config,
            status=self.status,
            deployed_at=self.deployed_at,
            started_at=self.started_at,
            stopped_at=self.stopped_at,
            metrics=self.metrics,
            process_id=self.process.pid if self.process else None,
            memory_usage=resource_usage["memory_mb"],
            cpu_usage=resource_usage["cpu_percent"],
            last_error=self.last_error,
            error_count=self.error_count
        )


class StrategyManager:
    """Main strategy management class."""

    def __init__(self):
        self.strategies: Dict[str, StrategyProcess] = {}
        self.redis_client: Optional[redis.Redis] = None
        self.signal_buffer: Dict[str, List[StrategySignal]] = {}
        self.max_signal_buffer_size = 1000

    async def initialize(self):
        """Initialize the strategy manager."""
        # Connect to Redis
        self.redis_client = redis.Redis(
            host="localhost",
            port=6379,
            decode_responses=True
        )

        # Start background tasks
        asyncio.create_task(self._monitor_strategies())
        asyncio.create_task(self._collect_signals())

        logger.info("Strategy manager initialized")

    async def shutdown(self):
        """Shutdown the strategy manager."""
        # Stop all strategies
        stop_tasks = [
            self.stop_strategy(strategy_id)
            for strategy_id in list(self.strategies.keys())
        ]

        if stop_tasks:
            await asyncio.gather(*stop_tasks, return_exceptions=True)

        # Close Redis connection
        if self.redis_client:
            await self.redis_client.close()

        logger.info("Strategy manager shut down")

    async def validate_strategy(self, strategy_code: str, config: dict) -> ValidationResult:
        """Validate strategy code and configuration."""
        errors = []
        warnings = []

        # Basic code validation
        if not strategy_code or len(strategy_code) < 100:
            errors.append("Strategy code is too short")

        if "class" not in strategy_code:
            errors.append("Strategy code must contain a class definition")

        if "BaseStrategy" not in strategy_code:
            errors.append("Strategy must inherit from BaseStrategy")

        # Configuration validation
        required_fields = ["name", "code", "author", "pair"]
        for field in required_fields:
            if field not in config:
                errors.append(f"Missing required configuration field: {field}")

        # Resource estimation (simplified)
        estimated_memory = 50.0  # MB
        estimated_cpu = 5.0  # %

        if len(strategy_code) > 10000:
            warnings.append("Large strategy code may consume more resources")

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            estimated_memory=estimated_memory,
            estimated_cpu=estimated_cpu
        )

    async def deploy_strategy(
        self,
        strategy_id: str,
        request: StrategyDeploymentRequest
    ) -> bool:
        """Deploy a new strategy."""
        try:
            logger.info(f"Deploying strategy {strategy_id}")

            # Create strategy process
            config_dict = request.config.model_dump()
            config_dict["user_id"] = request.user_id

            strategy_process = StrategyProcess(strategy_id, config_dict)
            self.strategies[strategy_id] = strategy_process

            # Start the strategy if auto_start is enabled
            if request.auto_start:
                success = await strategy_process.start(request.strategy_code)
                if not success:
                    del self.strategies[strategy_id]
                    return False

            # Store deployment info in Redis
            await self._store_strategy_info(strategy_id, strategy_process)

            logger.info(f"Strategy {strategy_id} deployed successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to deploy strategy {strategy_id}: {e}")
            if strategy_id in self.strategies:
                del self.strategies[strategy_id]
            return False

    async def stop_strategy(self, strategy_id: str) -> bool:
        """Stop a running strategy."""
        if strategy_id not in self.strategies:
            return False

        strategy_process = self.strategies[strategy_id]
        success = await strategy_process.stop()

        if success:
            # Update Redis
            await self._store_strategy_info(strategy_id, strategy_process)

        return success

    async def get_strategy_status(self, strategy_id: str) -> Optional[StrategyInfo]:
        """Get the current status of a strategy."""
        if strategy_id not in self.strategies:
            return None

        return self.strategies[strategy_id].to_info()

    async def list_strategies(self) -> List[StrategyInfo]:
        """List all strategy instances."""
        return [strategy.to_info() for strategy in self.strategies.values()]

    async def get_active_count(self) -> int:
        """Get the number of active strategies."""
        return sum(
            1 for strategy in self.strategies.values()
            if strategy.status == StrategyStatus.ACTIVE
        )

    async def distribute_market_data(self, market_data: MarketData):
        """Distribute market data to all relevant strategies."""
        # Store in Redis for strategies to access
        await self.redis_client.setex(
            f"market_data:{market_data.symbol}",
            300,  # 5 minutes TTL
            market_data.model_dump_json()
        )

        # Notify strategies (in a real implementation, this would use IPC)
        for strategy_id, strategy in self.strategies.items():
            if strategy.status == StrategyStatus.ACTIVE:
                # Send market data to strategy process
                await self._send_market_data_to_strategy(strategy_id, market_data)

    async def get_strategy_signals(self, strategy_id: str, limit: int = 10) -> List[dict]:
        """Get recent signals from a strategy."""
        if strategy_id not in self.signal_buffer:
            return []

        signals = self.signal_buffer[strategy_id][-limit:]
        return [signal.model_dump() for signal in signals]

    async def get_debug_info(self) -> Dict[str, Any]:
        """Get debug information about all strategies."""
        return {
            "total_strategies": len(self.strategies),
            "active_strategies": await self.get_active_count(),
            "strategies": {
                strategy_id: {
                    "status": strategy.status.value,
                    "pid": strategy.process.pid if strategy.process else None,
                    "started_at": strategy.started_at.isoformat() if strategy.started_at else None,
                    "resource_usage": strategy.get_resource_usage()
                }
                for strategy_id, strategy in self.strategies.items()
            }
        }

    # Private helper methods
    async def _monitor_strategies(self):
        """Background task to monitor strategy health."""
        while True:
            try:
                for strategy_id, strategy in list(self.strategies.items()):
                    # Check if process is still running
                    if strategy.process and strategy.process.poll() is not None:
                        # Process died
                        if strategy.status == StrategyStatus.ACTIVE:
                            strategy.status = StrategyStatus.FAILED
                            strategy.last_error = "Process terminated unexpectedly"
                            strategy.error_count += 1

                        # Update Redis
                        await self._store_strategy_info(strategy_id, strategy)

                await asyncio.sleep(30)  # Check every 30 seconds

            except Exception as e:
                logger.error(f"Error in strategy monitoring: {e}")
                await asyncio.sleep(60)

    async def _collect_signals(self):
        """Background task to collect signals from strategies."""
        while True:
            try:
                # In a real implementation, this would collect signals
                # from strategy processes via IPC or shared memory
                await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"Error in signal collection: {e}")
                await asyncio.sleep(5)

    async def _store_strategy_info(self, strategy_id: str, strategy_process: StrategyProcess):
        """Store strategy information in Redis."""
        if not self.redis_client:
            return

        try:
            info = strategy_process.to_info()
            await self.redis_client.setex(
                f"strategy_info:{strategy_id}",
                3600,  # 1 hour TTL
                info.model_dump_json()
            )
        except Exception as e:
            logger.error(f"Failed to store strategy info: {e}")

    async def _send_market_data_to_strategy(self, strategy_id: str, market_data: MarketData):
        """Send market data to a specific strategy."""
        # In a real implementation, this would use IPC to send data to the strategy process
        # For now, we'll just log it
        logger.debug(f"Sending market data to strategy {strategy_id}: {market_data.symbol}")