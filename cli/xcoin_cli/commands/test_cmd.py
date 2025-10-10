"""
xcoin test - Test strategy with backtest
"""

import click
import json
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich import box

from xcoin_cli.backtest import BacktestEngine, load_historical_data
import requests
from datetime import datetime, timedelta

console = Console()


@click.command()
@click.argument('strategy_name', required=False)
@click.option('--backtest', type=click.Path(exists=True), help='CSV file with historical data')
@click.option('--fetch', is_flag=True, help='Fetch historical data from CoinDCX API')
@click.option('--symbol', help='Trading symbol (e.g., B-BTC_USDT) for auto-fetch')
@click.option('--days', default=30, type=int, help='Number of days of historical data (default: 30)')
@click.option('--interval', default='15m', help='Candle interval (1m, 5m, 15m, 30m, 1h, 4h, 1d)')
@click.option('--capital', default=10000.0, help='Initial capital in USDT (default: 10000)')
@click.option('--commission', default=0.001, help='Commission rate (default: 0.001 = 0.1%)')
@click.option('--start-date', help='Start date (YYYY-MM-DD)')
@click.option('--end-date', help='End date (YYYY-MM-DD)')
def test(strategy_name, backtest, fetch, symbol, days, interval, capital, commission, start_date, end_date):
    """
    Test strategy with historical data

    \b
    Usage (context-aware - with CSV):
        xcoin test --backtest data/btc_2024.csv
        xcoin test --backtest data.csv --capital 50000

    \b
    Usage (auto-fetch from CoinDCX):
        xcoin test --fetch --symbol B-BTC_USDT --days 30
        xcoin test my-strategy --fetch --symbol B-SOL_USDT --interval 1h
        xcoin test --fetch --start-date 2024-01-01 --end-date 2024-06-01

    \b
    Usage (explicit naming):
        xcoin test my-strategy --backtest data/btc_2024.csv
        xcoin test my-strategy --fetch --symbol B-BTC_USDT

    \b
    CSV Format (for --backtest):
        timestamp,open,high,low,close,volume
        2024-01-01 00:00:00,45000,45500,44800,45200,1000
        ...
    """
    console.print()
    console.print(Panel.fit(
        "🧪 Strategy Backtest",
        style="bold cyan",
        border_style="cyan"
    ))
    console.print()

    # Determine strategy directory
    if strategy_name:
        # Explicit naming mode - look for strategy directory
        strategy_dir = Path.cwd() / strategy_name
        if not strategy_dir.exists() or not strategy_dir.is_dir():
            console.print(f"[red]✗ Strategy directory not found: {strategy_name}[/]")
            console.print(f"[dim]Make sure the directory exists in the current path[/]")
            exit(1)
        current_dir = strategy_dir
        console.print(f"[dim]Using strategy from: {strategy_dir}[/]")
        console.print()
    else:
        # Context-aware mode - use current directory
        current_dir = Path.cwd()

    strategy_file = current_dir / 'strategy.py'
    config_file = current_dir / 'config.json'

    if not strategy_file.exists():
        console.print("[red]✗ strategy.py not found[/]")
        console.print("[dim]Run this command from your strategy root directory[/]")
        exit(1)

    if not config_file.exists():
        console.print("[red]✗ config.json not found[/]")
        exit(1)

    # Load config for strategy settings
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
    except Exception as e:
        console.print(f"[red]✗ Failed to read config.json: {e}[/]")
        exit(1)

    # Determine data source
    data = None

    if fetch:
        # Auto-fetch mode - get data from CoinDCX API
        trading_symbol = symbol or config.get('pairs', [None])[0]
        if not trading_symbol:
            console.print("[red]✗ No trading symbol specified[/]")
            console.print("[dim]Use --symbol option or configure in config.json[/]")
            exit(1)

        console.print(f"[cyan]Fetching historical data from CoinDCX...[/]")
        console.print(f"[dim]Symbol: {trading_symbol}, Interval: {interval}, Days: {days}[/]")
        console.print()

        try:
            data = _fetch_historical_data_from_coindcx(trading_symbol, interval, days, start_date, end_date)
            console.print(f"[green]✓ Fetched {len(data)} candles from CoinDCX[/]")
            console.print(f"[dim]Date range: {data.index[0]} to {data.index[-1]}[/]")
            console.print()
        except Exception as e:
            console.print(f"[red]✗ Failed to fetch data from CoinDCX: {e}[/]")
            console.print(f"[dim]Tip: Check if the symbol is correct (e.g., B-BTC_USDT)[/]")
            exit(1)

    else:
        # CSV file mode
        if not backtest:
            # Try default locations
            default_files = [
                current_dir / 'data' / 'sample.csv',
                current_dir / 'data' / 'historical.csv',
                current_dir / 'backtest.csv'
            ]
            for file_path in default_files:
                if file_path.exists():
                    backtest = str(file_path)
                    break

            if not backtest:
                console.print("[red]✗ No backtest data file specified[/]")
                console.print("[dim]Use --backtest option, --fetch flag, or place data in data/sample.csv[/]")
                exit(1)

        console.print(f"[dim]Loading data from: {backtest}[/]")
        console.print(f"[dim]Initial capital: ${capital:,.2f}[/]")
        console.print(f"[dim]Commission: {commission * 100:.2f}%[/]")
        console.print()

        # Load historical data from CSV
        try:
            with console.status("[cyan]Loading historical data...[/]"):
                data = load_historical_data(Path(backtest))

                # Filter by date range if specified
                if start_date:
                    data = data[data.index >= start_date]
                if end_date:
                    data = data[data.index <= end_date]

                if len(data) == 0:
                    console.print("[red]✗ No data found in specified date range[/]")
                    exit(1)

            console.print(f"[green]✓ Loaded {len(data)} candles[/]")
            console.print(f"[dim]Date range: {data.index[0]} to {data.index[-1]}[/]")
            console.print()

        except Exception as e:
            console.print(f"[red]✗ Failed to load data: {e}[/]")
            exit(1)

    # Extract strategy settings from config
    settings = {}
    if 'parameters' in config:
        for param in config['parameters']:
            name = param.get('name')
            default = param.get('default')
            if name and default is not None:
                settings[name] = default

    # Add symbol from config
    if 'pairs' in config and config['pairs']:
        settings['symbol'] = config['pairs'][0]

    console.print("[cyan]Running backtest...[/]")
    console.print()

    # Run backtest
    try:
        engine = BacktestEngine(
            strategy_file=strategy_file,
            initial_capital=capital,
            commission=commission
        )

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
            transient=True
        ) as progress:
            task = progress.add_task("Executing strategy...", total=100)

            # Run backtest
            result = engine.run(data, settings)

            progress.update(task, completed=100)

    except Exception as e:
        console.print()
        console.print(f"[red]✗ Backtest failed: {e}[/]")
        import traceback
        console.print(f"[dim]{traceback.format_exc()}[/]")
        exit(1)

    # Display results
    console.print()
    _display_results(result, capital)
    console.print()


def _display_results(result, initial_capital: float):
    """Display backtest results in formatted panels"""

    # Summary Panel
    summary_table = Table(
        show_header=False,
        box=box.SIMPLE,
        padding=(0, 2)
    )
    summary_table.add_column("Metric", style="dim")
    summary_table.add_column("Value", style="bold")

    # Determine overall performance color
    if result.total_pnl > 0:
        pnl_color = "green"
        pnl_icon = "↗"
    elif result.total_pnl < 0:
        pnl_color = "red"
        pnl_icon = "↘"
    else:
        pnl_color = "yellow"
        pnl_icon = "→"

    final_capital = initial_capital + result.total_pnl

    summary_table.add_row("Initial Capital", f"${initial_capital:,.2f}")
    summary_table.add_row("Final Capital", f"${final_capital:,.2f}")
    summary_table.add_row(
        "Total P&L",
        f"[{pnl_color}]{pnl_icon} ${result.total_pnl:,.2f} ({result.total_pnl_percentage:+.2f}%)[/]"
    )

    console.print(Panel(
        summary_table,
        title="📊 Performance Summary",
        border_style=pnl_color,
        padding=(1, 2)
    ))
    console.print()

    # Trade Statistics
    trade_stats = Table(
        show_header=False,
        box=box.SIMPLE,
        padding=(0, 2)
    )
    trade_stats.add_column("Metric", style="dim")
    trade_stats.add_column("Value")

    trade_stats.add_row("Total Trades", f"[bold]{result.total_trades}[/]")
    trade_stats.add_row(
        "Winning Trades",
        f"[green]{result.winning_trades}[/] ([green]{result.win_rate:.1f}%[/])"
    )
    trade_stats.add_row(
        "Losing Trades",
        f"[red]{result.losing_trades}[/] ([red]{100 - result.win_rate:.1f}%[/])"
    )
    trade_stats.add_row("Average Win", f"[green]${result.avg_win:,.2f}[/]")
    trade_stats.add_row("Average Loss", f"[red]${result.avg_loss:,.2f}[/]")
    trade_stats.add_row("Largest Win", f"[green]${result.largest_win:,.2f}[/]")
    trade_stats.add_row("Largest Loss", f"[red]${result.largest_loss:,.2f}[/]")

    console.print(Panel(
        trade_stats,
        title="📈 Trade Statistics",
        border_style="cyan",
        padding=(1, 2)
    ))
    console.print()

    # Risk Metrics
    risk_table = Table(
        show_header=False,
        box=box.SIMPLE,
        padding=(0, 2)
    )
    risk_table.add_column("Metric", style="dim")
    risk_table.add_column("Value")

    dd_color = "red" if result.max_drawdown_percentage > 20 else "yellow" if result.max_drawdown_percentage > 10 else "green"
    pf_color = "green" if result.profit_factor > 1.5 else "yellow" if result.profit_factor > 1.0 else "red"
    sharpe_color = "green" if result.sharpe_ratio > 1.0 else "yellow" if result.sharpe_ratio > 0.5 else "red"

    risk_table.add_row(
        "Max Drawdown",
        f"[{dd_color}]${result.max_drawdown:,.2f} ({result.max_drawdown_percentage:.2f}%)[/]"
    )
    risk_table.add_row(
        "Profit Factor",
        f"[{pf_color}]{result.profit_factor:.2f}[/]"
    )
    risk_table.add_row(
        "Sharpe Ratio",
        f"[{sharpe_color}]{result.sharpe_ratio:.2f}[/]"
    )
    risk_table.add_row(
        "Avg Trade Duration",
        f"[bold]{result.avg_trade_duration:.1f} hours[/]"
    )

    console.print(Panel(
        risk_table,
        title="⚠️  Risk Metrics",
        border_style="yellow",
        padding=(1, 2)
    ))
    console.print()

    # Recent Trades (last 10)
    if result.trades:
        recent_trades = result.trades[-10:]

        trades_table = Table(
            show_header=True,
            header_style="bold cyan",
            box=box.ROUNDED,
            border_style="dim"
        )

        trades_table.add_column("Entry", style="dim", width=16)
        trades_table.add_column("Exit", style="dim", width=16)
        trades_table.add_column("Side", width=6)
        trades_table.add_column("P&L", width=15)
        trades_table.add_column("Exit Reason", style="dim")

        for trade in recent_trades:
            entry_time = trade.entry_time.strftime("%Y-%m-%d %H:%M") if trade.entry_time else "N/A"
            exit_time = trade.exit_time.strftime("%Y-%m-%d %H:%M") if trade.exit_time else "N/A"

            side_color = "green" if trade.side == "LONG" else "red"
            side_text = f"[{side_color}]{trade.side}[/]"

            pnl_color = "green" if trade.pnl > 0 else "red"
            pnl_text = f"[{pnl_color}]${trade.pnl:+,.2f} ({trade.pnl_percentage:+.2f}%)[/]"

            trades_table.add_row(
                entry_time,
                exit_time,
                side_text,
                pnl_text,
                trade.exit_reason
            )

        console.print(Panel(
            trades_table,
            title=f"📋 Recent Trades (Last {len(recent_trades)} of {result.total_trades})",
            border_style="magenta",
            padding=(1, 2)
        ))
        console.print()

    # Performance Summary
    if result.total_pnl > 0:
        emoji = "🎉"
        message = "[bold green]Strategy is profitable![/]"
    elif result.total_pnl == 0:
        emoji = "😐"
        message = "[bold yellow]Strategy broke even[/]"
    else:
        emoji = "📉"
        message = "[bold red]Strategy needs improvement[/]"

    console.print(Panel(
        f"{emoji} {message}\n\n"
        f"Consider analyzing the trade statistics and risk metrics\n"
        f"to optimize your strategy parameters.",
        title="Analysis",
        border_style="cyan",
        padding=(1, 2)
    ))


def _fetch_historical_data_from_coindcx(symbol: str, interval: str, days: int, start_date: str = None, end_date: str = None):
    """
    Fetch historical OHLCV data from CoinDCX public API

    Args:
        symbol: Trading pair (e.g., "B-BTC_USDT")
        interval: Candle interval (e.g., "1m", "5m", "15m", "1h", "1d")
        days: Number of days to fetch (if start_date/end_date not provided)
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)

    Returns:
        pandas DataFrame with OHLCV data
    """
    import pandas as pd

    # Calculate timestamps
    if start_date and end_date:
        start_ts = int(datetime.strptime(start_date, '%Y-%m-%d').timestamp() * 1000)
        end_ts = int(datetime.strptime(end_date, '%Y-%m-%d').timestamp() * 1000)
    else:
        end_ts = int(datetime.now().timestamp() * 1000)
        start_ts = int((datetime.now() - timedelta(days=days)).timestamp() * 1000)

    # Convert interval to CoinDCX format
    interval_map = {
        '1m': '1', '5m': '5', '15m': '15', '30m': '30',
        '1h': '60', '2h': '120', '4h': '240', '1d': '1D'
    }
    resolution = interval_map.get(interval, '15')

    # CoinDCX public API endpoint
    url = f"https://public.coindcx.com/market_data/candlesticks"
    params = {
        'pair': symbol,
        'from': start_ts,
        'to': end_ts,
        'resolution': resolution,
        'pcode': 'f'  # Futures market
    }

    response = requests.get(url, params=params)
    response.raise_for_status()

    data_json = response.json()

    if 'data' not in data_json or not data_json['data']:
        raise Exception(f"No data returned from CoinDCX for {symbol}")

    # Parse candles
    candles_data = data_json['data']
    df = pd.DataFrame(candles_data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

    # Convert timestamp to datetime
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
    df.set_index('timestamp', inplace=True)

    # Convert to numeric
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    # Sort by timestamp
    df.sort_index(inplace=True)

    return df
