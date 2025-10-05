# Changelog

All notable changes to the XCoinAlgo Strategy SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-05

### Added
- Initial release of XCoinAlgo Strategy SDK
- `BaseStrategy` abstract class for strategy development
- `StrategyConfig` for configuration management
- `TechnicalIndicators` with 20+ built-in indicators
  - Moving averages (SMA, EMA)
  - Oscillators (RSI, Stochastic, Williams %R, CCI)
  - Volatility (ATR, Bollinger Bands, Keltner Channels)
  - Trend (MACD, Supertrend, ADX)
  - Volume (MFI, OBV, VWAP)
- `RiskManager` for position sizing and risk management
- `BacktestEngine` for historical strategy testing
- `CryptoClient` for exchange integration
- Signal types: LONG, SHORT, CLOSE_LONG, CLOSE_SHORT, HOLD
- Comprehensive logging system
- Example strategies in `examples/` directory
- Full documentation and quickstart guide

### Features
- Type-safe strategy development with Python type hints
- Automatic position sizing based on risk parameters
- Stop-loss and take-profit using ATR multipliers
- Daily loss limits and maximum position limits
- Backtesting with slippage and commission modeling
- YAML/JSON configuration support
- Extensible indicator framework

### Documentation
- SDK_QUICKSTART.md - Getting started guide
- PUBLISHING_GUIDE.md - PyPI publishing instructions
- README.md - Comprehensive SDK documentation
- Example strategies with detailed comments

## [Unreleased]

### Planned
- Additional technical indicators
- Multi-timeframe analysis support
- Portfolio optimization features
- Machine learning integration helpers
- More example strategies
- Performance optimization
- WebSocket support for real-time data
