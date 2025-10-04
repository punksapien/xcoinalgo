"""
Test Strategy for Local Validation
A simple moving average crossover strategy for testing the platform
"""

from base_strategy import BaseStrategy
from typing import Dict, Any
import time
import logging

class TestStrategy(BaseStrategy):
    def __init__(self):
        super().__init__()

        # Strategy parameters
        self.short_ma_period = self.config.custom_params.get('short_ma_period', 10)
        self.long_ma_period = self.config.custom_params.get('long_ma_period', 20)
        self.min_trade_interval = 60  # Minimum seconds between trades

        # State tracking
        self.last_trade_time = 0
        self.price_history = []
        self.position_size = 0

        self.logger.info(f"Test Strategy initialized: {self.short_ma_period}/{self.long_ma_period} MA crossover")

    def on_market_data(self, market_data: Dict[str, Any]):
        """Handle incoming market data and generate trading signals"""
        try:
            # Extract price from market data
            current_price = self._extract_price(market_data)
            if not current_price:
                return

            # Update price history
            self.price_history.append(current_price)

            # Keep only required history
            max_history = max(self.short_ma_period, self.long_ma_period) + 1
            if len(self.price_history) > max_history:
                self.price_history = self.price_history[-max_history:]

            # Generate signals if we have enough data
            if len(self.price_history) >= self.long_ma_period:
                self._check_signals(current_price)

        except Exception as e:
            self.logger.error(f"Error processing market data: {e}")

    def _extract_price(self, market_data: Dict[str, Any]) -> float:
        """Extract current price from market data"""
        try:
            # Handle different market data formats
            if 'price' in market_data:
                return float(market_data['price'])
            elif 'close' in market_data:
                return float(market_data['close'])
            elif 'last_price' in market_data:
                return float(market_data['last_price'])
            elif 'ticker' in market_data and 'last_price' in market_data['ticker']:
                return float(market_data['ticker']['last_price'])
            else:
                self.logger.warning(f"Could not extract price from market data: {market_data}")
                return None
        except (ValueError, KeyError) as e:
            self.logger.error(f"Error extracting price: {e}")
            return None

    def _check_signals(self, current_price: float):
        """Check for trading signals based on moving average crossover"""
        try:
            # Calculate moving averages
            short_ma = self._calculate_ma(self.short_ma_period)
            long_ma = self._calculate_ma(self.long_ma_period)

            if not short_ma or not long_ma:
                return

            # Previous MAs for crossover detection
            prev_short_ma = self._calculate_ma(self.short_ma_period, offset=1)
            prev_long_ma = self._calculate_ma(self.long_ma_period, offset=1)

            if not prev_short_ma or not prev_long_ma:
                return

            # Log current state
            self.logger.debug(f"Price: {current_price:.2f}, Short MA: {short_ma:.2f}, Long MA: {long_ma:.2f}")

            # Check for crossover signals
            current_time = time.time()
            if current_time - self.last_trade_time < self.min_trade_interval:
                return  # Too soon for another trade

            # Bullish crossover: short MA crosses above long MA
            if (prev_short_ma <= prev_long_ma and short_ma > long_ma and
                self.position_size <= 0):
                self._generate_buy_signal(current_price, short_ma, long_ma)

            # Bearish crossover: short MA crosses below long MA
            elif (prev_short_ma >= prev_long_ma and short_ma < long_ma and
                  self.position_size >= 0):
                self._generate_sell_signal(current_price, short_ma, long_ma)

        except Exception as e:
            self.logger.error(f"Error checking signals: {e}")

    def _calculate_ma(self, period: int, offset: int = 0) -> float:
        """Calculate moving average for given period"""
        try:
            if len(self.price_history) < period + offset:
                return None

            end_idx = len(self.price_history) - offset
            start_idx = end_idx - period

            prices = self.price_history[start_idx:end_idx]
            return sum(prices) / len(prices)

        except Exception as e:
            self.logger.error(f"Error calculating MA: {e}")
            return None

    def _generate_buy_signal(self, price: float, short_ma: float, long_ma: float):
        """Generate buy signal"""
        try:
            # Calculate position size based on risk management
            account_balance = self.get_balance()
            position_size = self.calculate_position_size(self.config.risk_per_trade)

            signal = {
                'action': 'BUY',
                'price': price,
                'quantity': position_size,
                'short_ma': short_ma,
                'long_ma': long_ma,
                'timestamp': time.time(),
                'reason': f'Bullish crossover: {short_ma:.2f} > {long_ma:.2f}'
            }

            self.logger.info(f"BUY Signal Generated: {signal}")
            self.on_signal(signal)

        except Exception as e:
            self.logger.error(f"Error generating buy signal: {e}")

    def _generate_sell_signal(self, price: float, short_ma: float, long_ma: float):
        """Generate sell signal"""
        try:
            # Use current position size or calculate based on holdings
            position_size = abs(self.position_size) if self.position_size != 0 else self.calculate_position_size(self.config.risk_per_trade)

            signal = {
                'action': 'SELL',
                'price': price,
                'quantity': position_size,
                'short_ma': short_ma,
                'long_ma': long_ma,
                'timestamp': time.time(),
                'reason': f'Bearish crossover: {short_ma:.2f} < {long_ma:.2f}'
            }

            self.logger.info(f"SELL Signal Generated: {signal}")
            self.on_signal(signal)

        except Exception as e:
            self.logger.error(f"Error generating sell signal: {e}")

    def on_signal(self, signal: Dict[str, Any]):
        """Handle trading signals"""
        try:
            action = signal['action']
            quantity = signal['quantity']
            price = signal.get('price')

            self.logger.info(f"Processing {action} signal for {quantity} units at {price}")

            # Place order through base class
            if action == 'BUY':
                order_result = self.place_order('BUY', quantity, price)
                if order_result:
                    self.position_size += quantity
                    self.last_trade_time = time.time()
                    self.logger.info(f"BUY order placed successfully: {order_result}")

            elif action == 'SELL':
                order_result = self.place_order('SELL', quantity, price)
                if order_result:
                    self.position_size -= quantity
                    self.last_trade_time = time.time()
                    self.logger.info(f"SELL order placed successfully: {order_result}")

        except Exception as e:
            self.logger.error(f"Error handling signal: {e}")

    def on_order_update(self, order_update: Dict[str, Any]):
        """Handle order status updates"""
        try:
            order_id = order_update.get('order_id')
            status = order_update.get('status')

            self.logger.info(f"Order {order_id} status update: {status}")

            # Handle filled orders
            if status == 'FILLED':
                filled_quantity = order_update.get('filled_quantity', 0)
                side = order_update.get('side')

                self.logger.info(f"Order filled: {side} {filled_quantity} units")

                # Update position tracking if needed
                # This would be more sophisticated in a real strategy

        except Exception as e:
            self.logger.error(f"Error handling order update: {e}")

    def get_strategy_metrics(self) -> Dict[str, Any]:
        """Return current strategy metrics for monitoring"""
        try:
            return {
                'position_size': self.position_size,
                'short_ma_period': self.short_ma_period,
                'long_ma_period': self.long_ma_period,
                'price_history_length': len(self.price_history),
                'last_price': self.price_history[-1] if self.price_history else None,
                'short_ma': self._calculate_ma(self.short_ma_period),
                'long_ma': self._calculate_ma(self.long_ma_period),
                'last_trade_time': self.last_trade_time,
                'trades_today': self._count_trades_today()
            }
        except Exception as e:
            self.logger.error(f"Error getting strategy metrics: {e}")
            return {}

    def _count_trades_today(self) -> int:
        """Count trades executed today (placeholder)"""
        # This would typically query the order history
        # For now, return a simple estimate
        current_time = time.time()
        day_start = current_time - (current_time % 86400)  # Start of current day

        if self.last_trade_time >= day_start:
            return 1  # Simplified - would be more accurate in real implementation
        return 0

if __name__ == "__main__":
    # Initialize and start the strategy
    try:
        strategy = TestStrategy()
        strategy.start()
    except KeyboardInterrupt:
        print("Strategy stopped by user")
    except Exception as e:
        print(f"Strategy error: {e}")
        logging.error(f"Strategy startup error: {e}")