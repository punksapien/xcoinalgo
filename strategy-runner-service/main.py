"""
Strategy Runner Service - FastAPI Application

This service handles the execution and management of trading strategies
in isolated environments, separate from the main trading platform.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import asyncio
import json
import uuid
import logging
import redis.asyncio as redis
from datetime import datetime
import traceback

from strategy_manager import StrategyManager
from models import (
    StrategyDeploymentRequest,
    StrategyStatus,
    StrategySignal,
    MarketData,
    StrategyResponse
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Strategy Runner Service",
    description="Microservice for executing trading strategies in isolated environments",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global components
strategy_manager = StrategyManager()
redis_client = None
websocket_connections: Dict[str, WebSocket] = {}

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup."""
    global redis_client
    try:
        # Initialize Redis connection
        redis_client = redis.Redis(
            host="localhost",
            port=6379,
            decode_responses=True,
            health_check_interval=30
        )

        # Test Redis connection
        await redis_client.ping()
        logger.info("Redis connection established")

        # Initialize strategy manager
        await strategy_manager.initialize()
        logger.info("Strategy manager initialized")

    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown."""
    global redis_client
    if redis_client:
        await redis_client.close()

    await strategy_manager.shutdown()
    logger.info("Services shut down cleanly")


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "active_strategies": await strategy_manager.get_active_count()
    }


# Strategy deployment endpoints
@app.post("/strategies/deploy", response_model=StrategyResponse)
async def deploy_strategy(
    request: StrategyDeploymentRequest,
    background_tasks: BackgroundTasks
):
    """Deploy a new strategy instance."""
    try:
        # Generate unique strategy instance ID
        strategy_id = f"strat_{uuid.uuid4().hex[:8]}"

        # Validate strategy code and configuration
        validation_result = await strategy_manager.validate_strategy(
            request.strategy_code,
            request.config
        )

        if not validation_result.is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Strategy validation failed: {validation_result.errors}"
            )

        # Start strategy deployment in background
        background_tasks.add_task(
            strategy_manager.deploy_strategy,
            strategy_id,
            request
        )

        return StrategyResponse(
            success=True,
            strategy_id=strategy_id,
            message="Strategy deployment initiated",
            status=StrategyStatus.DEPLOYING
        )

    except Exception as e:
        logger.error(f"Strategy deployment failed: {e}")
        return StrategyResponse(
            success=False,
            message=f"Deployment failed: {str(e)}",
            status=StrategyStatus.FAILED
        )


@app.get("/strategies/{strategy_id}/status", response_model=StrategyResponse)
async def get_strategy_status(strategy_id: str):
    """Get the current status of a strategy."""
    try:
        status = await strategy_manager.get_strategy_status(strategy_id)

        if not status:
            raise HTTPException(
                status_code=404,
                detail=f"Strategy {strategy_id} not found"
            )

        return StrategyResponse(
            success=True,
            strategy_id=strategy_id,
            status=status.status,
            message=status.message,
            metrics=status.metrics
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get strategy status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/strategies/{strategy_id}/stop")
async def stop_strategy(strategy_id: str):
    """Stop a running strategy."""
    try:
        success = await strategy_manager.stop_strategy(strategy_id)

        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Strategy {strategy_id} not found or already stopped"
            )

        return {"success": True, "message": f"Strategy {strategy_id} stopped"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to stop strategy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/strategies")
async def list_strategies():
    """List all strategy instances."""
    try:
        strategies = await strategy_manager.list_strategies()
        return {"strategies": strategies}

    except Exception as e:
        logger.error(f"Failed to list strategies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Market data endpoints
@app.post("/market-data/feed")
async def feed_market_data(market_data: MarketData):
    """Receive market data and distribute to strategies."""
    try:
        # Distribute market data to all active strategies
        await strategy_manager.distribute_market_data(market_data)

        # Store in Redis for real-time access
        await redis_client.setex(
            f"market_data:{market_data.symbol}",
            300,  # 5 minutes TTL
            market_data.model_dump_json()
        )

        # Broadcast to WebSocket connections
        await broadcast_market_data(market_data)

        return {"success": True, "message": "Market data distributed"}

    except Exception as e:
        logger.error(f"Failed to process market data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Signal collection endpoints
@app.get("/signals/{strategy_id}")
async def get_strategy_signals(strategy_id: str, limit: int = 10):
    """Get recent signals from a strategy."""
    try:
        signals = await strategy_manager.get_strategy_signals(strategy_id, limit)
        return {"signals": signals}

    except Exception as e:
        logger.error(f"Failed to get strategy signals: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# WebSocket endpoint for real-time communication
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket endpoint for real-time communication."""
    await websocket.accept()
    websocket_connections[client_id] = websocket

    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "subscribe_strategy":
                strategy_id = message.get("strategy_id")
                await subscribe_to_strategy(client_id, strategy_id)

    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
    finally:
        if client_id in websocket_connections:
            del websocket_connections[client_id]


# Helper functions
async def broadcast_market_data(market_data: MarketData):
    """Broadcast market data to all connected WebSocket clients."""
    if not websocket_connections:
        return

    message = {
        "type": "market_data",
        "data": market_data.model_dump()
    }

    disconnected_clients = []
    for client_id, websocket in websocket_connections.items():
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.warning(f"Failed to send data to client {client_id}: {e}")
            disconnected_clients.append(client_id)

    # Remove disconnected clients
    for client_id in disconnected_clients:
        del websocket_connections[client_id]


async def subscribe_to_strategy(client_id: str, strategy_id: str):
    """Subscribe a client to strategy updates."""
    # Implementation for strategy-specific subscriptions
    logger.info(f"Client {client_id} subscribed to strategy {strategy_id}")


# Development endpoints
@app.get("/debug/strategies")
async def debug_strategies():
    """Debug endpoint to inspect strategy states."""
    if app.debug:
        return await strategy_manager.get_debug_info()
    raise HTTPException(status_code=404, detail="Debug endpoints not available")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=True,
        log_level="info"
    )