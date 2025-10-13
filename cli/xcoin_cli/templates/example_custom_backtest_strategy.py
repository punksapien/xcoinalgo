"""
Example Strategy with Custom Backtest Implementation

This shows how to implement a custom backtest() method in your strategy.
The backend will use your custom backtest instead of the default one.

author: XcoinAlgo Team
version: 1.0.0
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List


class BaseStrategy:
    """Base class for all strategies"""

    def __init__(self):
        self.name = "CustomBacktestExample"
        self.version = "1.0.0"

    def generate_signal(self, candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
        """Generate trading signal - used for live trading"""
        df = pd.DataFrame(candles)

        if len(df) < 20:
            return {'signal': 'HOLD', 'price': float(df.iloc[-1]['close']), 'metadata': {}}

        df['close'] = pd.to_numeric(df['close'])
        df['sma_20'] = df['close'].rolling(window=20).mean()

        latest = df.iloc[-1]
        price = float(latest['close'])

        # Simple SMA crossover
        if latest['close'] > latest['sma_20']:
            return {
                'signal': 'LONG',
                'price': price,
                'stopLoss': price * 0.98,
                'takeProfit': price * 1.05,
                'metadata': {'reason': 'above_sma'}
            }

        return {'signal': 'HOLD', 'price': price, 'metadata': {}}

    def backtest(self, historical_data: pd.DataFrame, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Custom backtest implementation

        This example shows a simple vectorized backtest approach.
        You can implement any custom logic here - use your own indicators,
        risk management, position sizing, etc.
        """
        # Extract config
        initial_capital = config.get('initial_capital', 10000)
        risk_per_trade = config.get('risk_per_trade', 0.01)
        leverage = config.get('leverage', 10)
        commission = config.get('commission', 0.001)

        # Prepare data
        df = historical_data.copy()
        df['close'] = pd.to_numeric(df['close'])
        df['high'] = pd.to_numeric(df['high'])
        df['low'] = pd.to_numeric(df['low'])

        # Calculate indicators
        df['sma_20'] = df['close'].rolling(window=20).mean()
        df['sma_50'] = df['close'].rolling(window=50).mean()

        # Generate signals
        df['signal'] = 0
        df.loc[df['sma_20'] > df['sma_50'], 'signal'] = 1  # LONG
        df.loc[df['sma_20'] < df['sma_50'], 'signal'] = -1  # SHORT or EXIT

        # Simulate trades
        trades = []
        equity = initial_capital
        equity_curve = [{'timestamp': int(df.iloc[0]['timestamp']), 'equity': equity}]

        position = None

        for i in range(50, len(df)):
            row = df.iloc[i]

            # Check if we should enter
            if position is None and row['signal'] == 1:
                entry_price = float(row['close'])
                stop_loss = entry_price * 0.98
                take_profit = entry_price * 1.05

                # Position sizing
                risk_amount = equity * risk_per_trade
                quantity = (risk_amount * leverage) / entry_price

                position = {
                    'entry_time': int(row['timestamp']),
                    'entry_price': entry_price,
                    'quantity': quantity,
                    'stop_loss': stop_loss,
                    'take_profit': take_profit
                }

            # Check if we should exit
            elif position is not None:
                exit_price = None
                reason = None

                # Check stop loss
                if float(row['low']) <= position['stop_loss']:
                    exit_price = position['stop_loss']
                    reason = 'stop_loss'
                # Check take profit
                elif float(row['high']) >= position['take_profit']:
                    exit_price = position['take_profit']
                    reason = 'take_profit'
                # Check signal exit
                elif row['signal'] == -1:
                    exit_price = float(row['close'])
                    reason = 'signal'

                if exit_price:
                    # Calculate P&L
                    pnl = (exit_price - position['entry_price']) * position['quantity']
                    entry_commission = position['entry_price'] * position['quantity'] * commission
                    exit_commission = exit_price * position['quantity'] * commission
                    net_pnl = pnl - entry_commission - exit_commission

                    equity += net_pnl

                    trades.append({
                        'entry_time': position['entry_time'],
                        'exit_time': int(row['timestamp']),
                        'side': 'LONG',
                        'entry_price': position['entry_price'],
                        'exit_price': exit_price,
                        'quantity': position['quantity'],
                        'pnl': net_pnl,
                        'pnl_pct': (net_pnl / (position['entry_price'] * position['quantity'])) * 100,
                        'reason': reason
                    })

                    position = None

            # Update equity curve
            equity_curve.append({
                'timestamp': int(row['timestamp']),
                'equity': equity
            })

        # Calculate metrics
        if len(trades) == 0:
            metrics = {
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0,
                'total_pnl': 0,
                'total_pnl_pct': 0,
                'max_drawdown': 0,
                'max_drawdown_pct': 0,
                'sharpe_ratio': 0,
                'profit_factor': 0
            }
        else:
            winning_trades = [t for t in trades if t['pnl'] > 0]
            losing_trades = [t for t in trades if t['pnl'] < 0]

            total_pnl = equity - initial_capital
            total_wins = sum(t['pnl'] for t in winning_trades)
            total_losses = abs(sum(t['pnl'] for t in losing_trades))

            # Calculate max drawdown
            peak = initial_capital
            max_dd = 0
            for point in equity_curve:
                if point['equity'] > peak:
                    peak = point['equity']
                dd = peak - point['equity']
                if dd > max_dd:
                    max_dd = dd

            metrics = {
                'total_trades': len(trades),
                'winning_trades': len(winning_trades),
                'losing_trades': len(losing_trades),
                'win_rate': (len(winning_trades) / len(trades)) * 100,
                'total_pnl': total_pnl,
                'total_pnl_pct': (total_pnl / initial_capital) * 100,
                'max_drawdown': max_dd,
                'max_drawdown_pct': (max_dd / peak) * 100 if peak > 0 else 0,
                'sharpe_ratio': 0,  # Simplified - calculate properly in production
                'profit_factor': total_wins / total_losses if total_losses > 0 else 0
            }

        return {
            'trades': trades,
            'metrics': metrics,
            'equity_curve': equity_curve
        }


# Create strategy instance (backend needs this)
strategy = BaseStrategy()


def generate_signals(candles: List[Dict], settings: Dict[str, Any]) -> Dict[str, Any]:
    """Main entry point for backend"""
    return strategy.generate_signal(candles, settings)

