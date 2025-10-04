"""
Base Strategy Template for CoinDCX Trading Platform

This is a template for creating trading strategies that run in Docker containers.
Strategies should inherit from BaseStrategy and implement the required methods.
"""

import os
import json
import time
import logging
import requests
import websocket
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from datetime import datetime
import threading

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

@dataclass
class MarketData:
    """Market data structure"""
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    bid: Optional[float] = None
    ask: Optional[float] = None

@dataclass
class Position:
    """Position structure"""
    symbol: str
    side: str  # 'LONG' or 'SHORT'
    size: float
    entry_price: float
    current_price: float
    unrealized_pnl: float
    timestamp: datetime

@dataclass
class Order:
    """Order structure"""
    symbol: str
    side: str  # 'BUY' or 'SELL'
    type: str  # 'MARKET', 'LIMIT', 'STOP'
    quantity: float
    price: Optional[float] = None
    stop_price: Optional[float] = None

class StrategyConfig:
    """Strategy configuration loader"""

    def __init__(self, config_file: str = 'config.json'):
        with open(config_file, 'r') as f:
            self.config = json.load(f)

    def get(self, key: str, default: Any = None) -> Any:
        return self.config.get(key, default)

    @property
    def name(self) -> str:
        return self.config.get('name', 'Unknown Strategy')

    @property
    def pair(self) -> str:
        return self.config.get('pair', 'BTCINR')

    @property
    def leverage(self) -> int:
        return self.config.get('leverage', 1)

    @property
    def risk_per_trade(self) -> float:
        return self.config.get('risk_per_trade', 0.01)

    @property
    def max_positions(self) -> int:
        return self.config.get('max_positions', 1)

    @property
    def max_daily_loss(self) -> float:
        return self.config.get('max_daily_loss', 0.05)

class CoinDCXClient:
    """CoinDCX API Client"""

    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = "https://api.coindcx.com"
        self.session = requests.Session()

    def get_balance(self) -> Dict[str, float]:
        """Get account balance"""
        # Implementation would go here
        return {}

    def place_order(self, order: Order) -> Dict[str, Any]:
        """Place an order"""
        # Implementation would go here
        return {}

    def cancel_order(self, order_id: str) -> bool:
        """Cancel an order"""
        # Implementation would go here
        return True

    def get_positions(self) -> List[Position]:
        """Get current positions"""
        # Implementation would go here
        return []

    def get_market_data(self, symbol: str) -> MarketData:
        """Get current market data"""
        # Implementation would go here
        return MarketData(
            symbol=symbol,
            timestamp=datetime.now(),
            open=50000.0,
            high=51000.0,
            low=49000.0,
            close=50500.0,
            volume=1000.0
        )

class BaseStrategy(ABC):
    """Base strategy class that all strategies should inherit from"""

    def __init__(self):
        self.config = StrategyConfig()
        self.client = CoinDCXClient(
            api_key=os.getenv('API_KEY', ''),
            api_secret=os.getenv('API_SECRET', '')
        )
        self.logger = logging.getLogger(self.config.name)
        self.is_running = False
        self.positions: List[Position] = []
        self.orders: List[Dict[str, Any]] = []

        # Risk management
        self.daily_pnl = 0.0
        self.total_trades = 0
        self.winning_trades = 0

        # WebSocket connection for real-time data
        self.ws = None
        self.ws_thread = None

    def start(self):
        """Start the strategy"""
        self.logger.info(f"Starting strategy: {self.config.name}")
        self.is_running = True

        try:
            # Initialize strategy
            self.initialize()

            # Start WebSocket connection for real-time data
            self.start_websocket()

            # Main strategy loop
            while self.is_running:
                try:
                    # Get latest market data
                    market_data = self.client.get_market_data(self.config.pair)

                    # Update positions
                    self.update_positions()

                    # Risk management checks
                    if not self.risk_check():
                        self.logger.warning("Risk check failed, stopping strategy")
                        break

                    # Execute strategy logic
                    self.on_market_data(market_data)

                    # Sleep before next iteration
                    time.sleep(1)

                except Exception as e:
                    self.logger.error(f"Error in strategy loop: {e}")
                    time.sleep(5)

        except KeyboardInterrupt:
            self.logger.info("Strategy interrupted by user")
        except Exception as e:
            self.logger.error(f"Strategy error: {e}")
        finally:
            self.stop()

    def stop(self):
        """Stop the strategy"""
        self.logger.info("Stopping strategy...")
        self.is_running = False

        # Close all positions
        self.close_all_positions()

        # Cancel all pending orders
        self.cancel_all_orders()

        # Close WebSocket connection
        if self.ws:
            self.ws.close()

        # Cleanup
        self.cleanup()

        self.logger.info("Strategy stopped")

    def start_websocket(self):
        """Start WebSocket connection for real-time data"""
        def on_message(ws, message):
            try:
                data = json.loads(message)
                self.on_websocket_message(data)
            except Exception as e:
                self.logger.error(f"WebSocket message error: {e}")

        def on_error(ws, error):
            self.logger.error(f"WebSocket error: {error}")

        def on_close(ws, close_status_code, close_msg):
            self.logger.info("WebSocket connection closed")

        def on_open(ws):
            self.logger.info("WebSocket connection opened")
            # Subscribe to channels
            self.subscribe_to_channels(ws)

        # Start WebSocket in a separate thread
        websocket.enableTrace(True)
        self.ws = websocket.WebSocketApp(
            "wss://stream.coindcx.com",
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
            on_open=on_open
        )

        self.ws_thread = threading.Thread(target=self.ws.run_forever)
        self.ws_thread.daemon = True
        self.ws_thread.start()

    def subscribe_to_channels(self, ws):
        """Subscribe to WebSocket channels"""
        # Subscribe to ticker updates for the trading pair
        subscribe_msg = {
            "channel": f"{self.config.pair}@ticker"
        }
        ws.send(json.dumps(subscribe_msg))

    def update_positions(self):
        """Update current positions"""
        self.positions = self.client.get_positions()

    def risk_check(self) -> bool:
        """Perform risk management checks"""
        # Check daily loss limit
        if abs(self.daily_pnl) > self.config.max_daily_loss:
            self.logger.warning(f"Daily loss limit exceeded: {self.daily_pnl}")
            return False

        # Check maximum positions
        if len(self.positions) >= self.config.max_positions:
            self.logger.warning(f"Maximum positions reached: {len(self.positions)}")
            return False

        return True

    def place_order(self, order: Order) -> bool:
        """Place an order with risk management"""
        try:
            result = self.client.place_order(order)
            if result:
                self.orders.append(result)
                self.logger.info(f"Order placed: {order}")
                return True
        except Exception as e:
            self.logger.error(f"Failed to place order: {e}")

        return False

    def close_all_positions(self):
        """Close all open positions"""
        for position in self.positions:
            try:
                # Create closing order
                side = 'SELL' if position.side == 'LONG' else 'BUY'
                order = Order(
                    symbol=position.symbol,
                    side=side,
                    type='MARKET',
                    quantity=position.size
                )
                self.place_order(order)
                self.logger.info(f"Closing position: {position}")
            except Exception as e:
                self.logger.error(f"Failed to close position: {e}")

    def cancel_all_orders(self):
        """Cancel all pending orders"""
        for order in self.orders:
            try:
                self.client.cancel_order(order.get('order_id', ''))
                self.logger.info(f"Cancelled order: {order}")
            except Exception as e:
                self.logger.error(f"Failed to cancel order: {e}")

    # Abstract methods that strategies must implement

    @abstractmethod
    def initialize(self):
        """Initialize strategy - called once at startup"""
        pass

    @abstractmethod
    def on_market_data(self, market_data: MarketData):
        """Called when new market data is received"""
        pass

    @abstractmethod
    def on_websocket_message(self, message: Dict[str, Any]):
        """Called when WebSocket message is received"""
        pass

    @abstractmethod
    def cleanup(self):
        """Cleanup strategy - called once at shutdown"""
        pass

# Example strategy implementation
class SimpleMovingAverageStrategy(BaseStrategy):
    """Simple moving average crossover strategy"""

    def initialize(self):
        """Initialize the strategy"""
        self.short_ma_period = 10
        self.long_ma_period = 20
        self.price_history = []
        self.position_size = 0

        self.logger.info("Simple MA Strategy initialized")

    def on_market_data(self, market_data: MarketData):
        """Process market data and generate signals"""
        # Add current price to history
        self.price_history.append(market_data.close)

        # Keep only necessary history
        if len(self.price_history) > self.long_ma_period:
            self.price_history = self.price_history[-self.long_ma_period:]

        # Need enough data points
        if len(self.price_history) < self.long_ma_period:
            return

        # Calculate moving averages
        short_ma = sum(self.price_history[-self.short_ma_period:]) / self.short_ma_period
        long_ma = sum(self.price_history) / self.long_ma_period

        # Generate signals
        if short_ma > long_ma and len(self.positions) == 0:
            # Buy signal
            quantity = self.calculate_position_size(market_data.close)
            order = Order(
                symbol=self.config.pair,
                side='BUY',
                type='MARKET',
                quantity=quantity
            )
            self.place_order(order)
            self.logger.info(f"BUY signal: short_ma={short_ma:.2f}, long_ma={long_ma:.2f}")

        elif short_ma < long_ma and len(self.positions) > 0:
            # Sell signal
            self.close_all_positions()
            self.logger.info(f"SELL signal: short_ma={short_ma:.2f}, long_ma={long_ma:.2f}")

    def on_websocket_message(self, message: Dict[str, Any]):
        """Handle WebSocket messages"""
        # Process real-time ticker updates
        if 'ticker' in message:
            ticker = message['ticker']
            self.logger.debug(f"Ticker update: {ticker}")

    def calculate_position_size(self, price: float) -> float:
        """Calculate position size based on risk management"""
        # Get account balance
        balance = self.client.get_balance()
        available_balance = balance.get('INR', 0)

        # Calculate position size based on risk per trade
        risk_amount = available_balance * self.config.risk_per_trade
        position_size = risk_amount / price

        return round(position_size, 6)

    def cleanup(self):
        """Cleanup strategy resources"""
        self.logger.info("Cleaning up Simple MA Strategy")

# Main execution
if __name__ == "__main__":
    # Get deployment ID from environment
    deployment_id = os.getenv('DEPLOYMENT_ID', 'unknown')

    # Initialize and run the strategy
    strategy = SimpleMovingAverageStrategy()

    try:
        strategy.start()
    except Exception as e:
        strategy.logger.error(f"Strategy failed: {e}")
        strategy.stop()