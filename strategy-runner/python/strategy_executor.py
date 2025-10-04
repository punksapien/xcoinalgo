"""
Strategy Executor Service - Multi-threaded Python service for executing trading strategies
Replaces Docker-based approach with efficient in-process execution
"""

import asyncio
import logging
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import signal
import resource
import io

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Strategy Executor Service", version="2.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global scheduler and executor
scheduler = AsyncIOScheduler()
executor = ThreadPoolExecutor(max_workers=5)  # Max 5 concurrent strategy executions
strategy_jobs: Dict[str, Dict[str, Any]] = {}  # strategy_id -> job info


# Pydantic Models
class StrategyConfig(BaseModel):
    name: str
    code: str
    author: str
    description: Optional[str] = None
    leverage: int = 10
    risk_per_trade: float = 0.005
    pair: str
    margin_currency: str = "USDT"
    resolution: str = "5"
    lookback_period: int = 200
    sl_atr_multiplier: float = 2.0
    tp_atr_multiplier: float = 3.0
    max_positions: int = 1
    max_daily_loss: float = 0.05
    custom_params: Optional[Dict[str, Any]] = None


class StrategyDeployRequest(BaseModel):
    strategy_id: str
    user_id: str
    deployment_id: str
    strategy_code: str
    config: StrategyConfig
    execution_interval: int = Field(default=300, description="Execution interval in seconds")
    api_key: str
    api_secret: str
    auto_start: bool = True


class StrategyResponse(BaseModel):
    success: bool
    message: str
    strategy_id: Optional[str] = None
    status: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class ExecutionStats(BaseModel):
    total_executions: int = 0
    successful_executions: int = 0
    failed_executions: int = 0
    avg_execution_time: float = 0.0
    last_execution_at: Optional[datetime] = None
    last_error: Optional[str] = None


# Resource limits for strategy execution
class ResourceLimits:
    MAX_MEMORY_MB = 100  # 100MB per strategy
    MAX_CPU_TIME_SECONDS = 30  # 30 seconds max execution time

    @staticmethod
    @contextmanager
    def apply_limits():
        """Apply resource limits to strategy execution"""
        # Set memory limit (in bytes)
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        resource.setrlimit(resource.RLIMIT_AS, (ResourceLimits.MAX_MEMORY_MB * 1024 * 1024, hard))

        # Set CPU time limit
        resource.setrlimit(resource.RLIMIT_CPU, (ResourceLimits.MAX_CPU_TIME_SECONDS, ResourceLimits.MAX_CPU_TIME_SECONDS + 5))

        try:
            yield
        finally:
            # Reset limits
            resource.setrlimit(resource.RLIMIT_AS, (soft, hard))
            resource.setrlimit(resource.RLIMIT_CPU, (resource.RLIM_INFINITY, resource.RLIM_INFINITY))


class SafeExecutor:
    """Safe execution environment for user strategy code"""

    @staticmethod
    def create_safe_globals(api_key: str, api_secret: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Create a restricted globals dict for strategy execution"""
        import pandas as pd
        import numpy as np
        from datetime import datetime, timezone

        # Import the client from the parent directory's Python file
        sys.path.insert(0, '/Users/macintosh/Developer/coindcx_client')
        from cdcx_50_v1 import CoinDCXClient, fetch_coindcx_data

        safe_globals = {
            '__builtins__': {
                'print': print,
                'len': len,
                'range': range,
                'int': int,
                'float': float,
                'str': str,
                'bool': bool,
                'list': list,
                'dict': dict,
                'tuple': tuple,
                'set': set,
                'abs': abs,
                'min': min,
                'max': max,
                'sum': sum,
                'round': round,
                'enumerate': enumerate,
                'zip': zip,
                'True': True,
                'False': False,
                'None': None,
            },
            'pd': pd,
            'np': np,
            'datetime': datetime,
            'timezone': timezone,
            'CoinDCXClient': CoinDCXClient,
            'fetch_coindcx_data': fetch_coindcx_data,
            'API_KEY': api_key,
            'API_SECRET': api_secret,
            'CONFIG': config,
        }

        return safe_globals

    @staticmethod
    def execute_strategy(strategy_code: str, api_key: str, api_secret: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Execute strategy code in a safe, restricted environment"""
        start_time = datetime.now()

        try:
            # Create safe execution environment
            safe_globals = SafeExecutor.create_safe_globals(api_key, api_secret, config)
            local_vars = {}

            # Capture stdout
            old_stdout = sys.stdout
            sys.stdout = io.StringIO()

            # Execute strategy code
            exec(strategy_code, safe_globals, local_vars)

            # Get output
            output = sys.stdout.getvalue()
            sys.stdout = old_stdout

            execution_time = (datetime.now() - start_time).total_seconds()

            return {
                'success': True,
                'execution_time': execution_time,
                'output': output,
                'signals': local_vars.get('signals', []),
                'metadata': local_vars.get('metadata', {})
            }

        except Exception as e:
            sys.stdout = old_stdout
            execution_time = (datetime.now() - start_time).total_seconds()

            logger.error(f"Strategy execution failed: {e}\n{traceback.format_exc()}")
            return {
                'success': False,
                'execution_time': execution_time,
                'error': str(e),
                'traceback': traceback.format_exc()
            }


async def execute_strategy_job(strategy_id: str, deployment_id: str, user_id: str,
                               strategy_code: str, api_key: str, api_secret: str,
                               config: Dict[str, Any]):
    """Execute a strategy job - called by scheduler"""

    if strategy_id not in strategy_jobs:
        logger.warning(f"Strategy {strategy_id} not found in jobs registry")
        return

    job_info = strategy_jobs[strategy_id]
    stats: ExecutionStats = job_info['stats']

    logger.info(f"Executing strategy {strategy_id} for user {user_id}")

    # Execute in thread pool to avoid blocking
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        executor,
        SafeExecutor.execute_strategy,
        strategy_code,
        api_key,
        api_secret,
        config
    )

    # Update stats
    stats.total_executions += 1
    stats.last_execution_at = datetime.now()

    if result['success']:
        stats.successful_executions += 1
        logger.info(f"Strategy {strategy_id} executed successfully in {result['execution_time']:.2f}s")
    else:
        stats.failed_executions += 1
        stats.last_error = result.get('error', 'Unknown error')
        logger.error(f"Strategy {strategy_id} execution failed: {result.get('error')}")

    # Update average execution time
    if stats.total_executions > 0:
        stats.avg_execution_time = (
            (stats.avg_execution_time * (stats.total_executions - 1) + result['execution_time'])
            / stats.total_executions
        )

    # Store result for retrieval
    job_info['last_result'] = result


@app.on_event("startup")
async def startup_event():
    """Start the scheduler on app startup"""
    scheduler.start()
    logger.info("Strategy Executor Service started - Scheduler running")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown scheduler gracefully"""
    scheduler.shutdown()
    executor.shutdown(wait=True)
    logger.info("Strategy Executor Service shutdown complete")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "strategy-executor",
        "version": "2.0.0",
        "active_strategies": len(strategy_jobs),
        "scheduler_running": scheduler.running
    }


@app.post("/strategies/deploy", response_model=StrategyResponse)
async def deploy_strategy(request: StrategyDeployRequest):
    """Deploy a new strategy with scheduled execution"""
    try:
        strategy_id = request.strategy_id

        # Check if strategy already exists
        if strategy_id in strategy_jobs:
            return StrategyResponse(
                success=False,
                message=f"Strategy {strategy_id} is already deployed"
            )

        # Create job info
        strategy_jobs[strategy_id] = {
            'deployment_id': request.deployment_id,
            'user_id': request.user_id,
            'config': request.config.dict(),
            'stats': ExecutionStats(),
            'last_result': None,
            'created_at': datetime.now()
        }

        # Schedule the strategy execution
        if request.auto_start:
            job = scheduler.add_job(
                execute_strategy_job,
                trigger=IntervalTrigger(seconds=request.execution_interval),
                args=[
                    strategy_id,
                    request.deployment_id,
                    request.user_id,
                    request.strategy_code,
                    request.api_key,
                    request.api_secret,
                    request.config.dict()
                ],
                id=strategy_id,
                name=f"strategy-{strategy_id}",
                replace_existing=True
            )

            strategy_jobs[strategy_id]['job_id'] = job.id
            strategy_jobs[strategy_id]['status'] = 'running'

            logger.info(f"Strategy {strategy_id} deployed and scheduled with {request.execution_interval}s interval")

            return StrategyResponse(
                success=True,
                message="Strategy deployed and started successfully",
                strategy_id=strategy_id,
                status="running"
            )
        else:
            strategy_jobs[strategy_id]['status'] = 'deployed'
            return StrategyResponse(
                success=True,
                message="Strategy deployed (not started)",
                strategy_id=strategy_id,
                status="deployed"
            )

    except Exception as e:
        logger.error(f"Failed to deploy strategy: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/strategies/{strategy_id}/start")
async def start_strategy(strategy_id: str):
    """Start a deployed strategy"""
    if strategy_id not in strategy_jobs:
        raise HTTPException(status_code=404, detail=f"Strategy {strategy_id} not found")

    job_info = strategy_jobs[strategy_id]

    if job_info.get('status') == 'running':
        return StrategyResponse(
            success=False,
            message="Strategy is already running"
        )

    # Start the job (implementation needed based on saved config)
    job_info['status'] = 'running'

    return StrategyResponse(
        success=True,
        message="Strategy started successfully",
        strategy_id=strategy_id,
        status="running"
    )


@app.post("/strategies/{strategy_id}/stop")
async def stop_strategy(strategy_id: str):
    """Stop a running strategy"""
    if strategy_id not in strategy_jobs:
        raise HTTPException(status_code=404, detail=f"Strategy {strategy_id} not found")

    try:
        # Remove scheduled job
        scheduler.remove_job(strategy_id)

        # Update status
        strategy_jobs[strategy_id]['status'] = 'stopped'

        logger.info(f"Strategy {strategy_id} stopped successfully")

        return StrategyResponse(
            success=True,
            message="Strategy stopped successfully",
            strategy_id=strategy_id,
            status="stopped"
        )

    except Exception as e:
        logger.error(f"Failed to stop strategy {strategy_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/strategies/{strategy_id}")
async def delete_strategy(strategy_id: str):
    """Delete a strategy"""
    if strategy_id not in strategy_jobs:
        raise HTTPException(status_code=404, detail=f"Strategy {strategy_id} not found")

    try:
        # Stop if running
        if strategy_jobs[strategy_id].get('status') == 'running':
            scheduler.remove_job(strategy_id)

        # Delete from registry
        del strategy_jobs[strategy_id]

        logger.info(f"Strategy {strategy_id} deleted successfully")

        return StrategyResponse(
            success=True,
            message="Strategy deleted successfully",
            strategy_id=strategy_id
        )

    except Exception as e:
        logger.error(f"Failed to delete strategy {strategy_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/strategies/{strategy_id}/status")
async def get_strategy_status(strategy_id: str):
    """Get strategy status and stats"""
    if strategy_id not in strategy_jobs:
        raise HTTPException(status_code=404, detail=f"Strategy {strategy_id} not found")

    job_info = strategy_jobs[strategy_id]
    stats = job_info['stats']

    return {
        "success": True,
        "strategy_id": strategy_id,
        "status": job_info.get('status', 'unknown'),
        "deployment_id": job_info.get('deployment_id'),
        "user_id": job_info.get('user_id'),
        "stats": {
            "total_executions": stats.total_executions,
            "successful_executions": stats.successful_executions,
            "failed_executions": stats.failed_executions,
            "avg_execution_time": stats.avg_execution_time,
            "last_execution_at": stats.last_execution_at.isoformat() if stats.last_execution_at else None,
            "last_error": stats.last_error
        },
        "last_result": job_info.get('last_result'),
        "created_at": job_info.get('created_at').isoformat() if job_info.get('created_at') else None
    }


@app.get("/strategies")
async def list_strategies():
    """List all deployed strategies"""
    strategies = []

    for strategy_id, job_info in strategy_jobs.items():
        stats = job_info['stats']
        strategies.append({
            "strategy_id": strategy_id,
            "deployment_id": job_info.get('deployment_id'),
            "user_id": job_info.get('user_id'),
            "status": job_info.get('status', 'unknown'),
            "total_executions": stats.total_executions,
            "last_execution_at": stats.last_execution_at.isoformat() if stats.last_execution_at else None
        })

    return {
        "success": True,
        "strategies": strategies,
        "total": len(strategies)
    }


@app.post("/strategies/{strategy_id}/execute")
async def execute_strategy_now(strategy_id: str):
    """Execute a strategy immediately (manual trigger)"""
    if strategy_id not in strategy_jobs:
        raise HTTPException(status_code=404, detail=f"Strategy {strategy_id} not found")

    job_info = strategy_jobs[strategy_id]

    # Trigger execution in background
    asyncio.create_task(
        execute_strategy_job(
            strategy_id=strategy_id,
            deployment_id=job_info['deployment_id'],
            user_id=job_info['user_id'],
            strategy_code=job_info.get('strategy_code', ''),
            api_key=job_info.get('api_key', ''),
            api_secret=job_info.get('api_secret', ''),
            config=job_info['config']
        )
    )

    return StrategyResponse(
        success=True,
        message="Strategy execution triggered",
        strategy_id=strategy_id
    )


if __name__ == "__main__":
    uvicorn.run(
        "strategy_executor:app",
        host="0.0.0.0",
        port=8003,
        reload=True,
        log_level="info"
    )
