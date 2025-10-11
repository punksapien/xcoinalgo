"""
xcoin deploy - Deploy strategy to platform
"""

import click
import json
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm
from rich.table import Table
from rich import box

from xcoin_cli.api_client import APIClient, APIError
from xcoin_cli.constants import PRODUCTION_FRONTEND_URL
from xcoin_cli.backtest import BacktestEngine
from datetime import datetime, timedelta
import requests
from xcoin_cli.local_registry import register_or_update_project, update_cache, mark_deployed

console = Console()


@click.command()
@click.argument('strategy_name', required=False)
@click.option('--force', is_flag=True, help='Skip confirmation')
@click.option('--marketplace', is_flag=True, help='Also deploy to marketplace')
def deploy(strategy_name, force, marketplace):
    """
    Deploy strategy to xcoinalgo platform

    \b
    Usage (context-aware - in strategy directory):
        xcoin deploy                  # Deploy to platform
        xcoin deploy --marketplace    # Deploy and publish to marketplace

    \b
    Usage (explicit naming - from anywhere):
        xcoin deploy my-strategy                  # Deploy specific strategy
        xcoin deploy my-strategy --marketplace    # Deploy and publish
        xcoin deploy my-strategy --force          # Skip all confirmations

    \b
    This command will:
        1. Read your local strategy files
        2. Upload and validate your code
        3. Deploy to the platform (auto-approved)
        4. Optionally publish to marketplace

    \b
    Requirements:
        - strategy.py (your strategy code)
        - config.json (strategy configuration)
        - requirements.txt (optional dependencies)
    """
    console.print()
    console.print(Panel.fit(
        "🚀 Deploy Strategy",
        style="bold cyan",
        border_style="cyan"
    ))
    console.print()

    # Check authentication
    client = APIClient()
    if not client.is_authenticated():
        console.print("[red]✗ Not authenticated. Please run 'xcoin login' first[/]")
        console.print(f"[dim]Get your API key from: {PRODUCTION_FRONTEND_URL}/dashboard/settings/api-keys[/]")
        exit(1)

    # Get user info
    user_info = client.get_user_info()
    console.print(f"[dim]Logged in as:[/] {user_info.get('email', 'Unknown')}")
    console.print()

    # Determine strategy directory
    if strategy_name:
        # Explicit naming mode
        strategy_dir = Path.cwd() / strategy_name
        if not strategy_dir.exists() or not strategy_dir.is_dir():
            console.print(f"[red]✗ Strategy directory not found: {strategy_name}[/]")
            console.print("[dim]Make sure the directory exists in the current path[/]")
            exit(1)
        current_dir = strategy_dir
        console.print(f"[dim]Using strategy from: {strategy_dir}[/]")
        console.print()
    else:
        # Context-aware mode
        current_dir = Path.cwd()

    strategy_file = current_dir / 'strategy.py'
    config_file = current_dir / 'config.json'
    requirements_file = current_dir / 'requirements.txt'

    if not strategy_file.exists():
        console.print("[red]✗ strategy.py not found in current directory[/]")
        console.print("[dim]Make sure you're in your strategy directory[/]")
        console.print("[dim]Or run 'xcoin init my-strategy' to create a new strategy[/]")
        exit(1)

    if not config_file.exists():
        console.print("[red]✗ config.json not found in current directory[/]")
        console.print("[dim]Your strategy needs a config.json file[/]")
        exit(1)

    # Read config to get strategy name
    try:
        with open(config_file, 'r') as f:
            config_data = json.load(f)
        strategy_name = config_data.get('name', current_dir.name)
        strategy_code = config_data.get('code', strategy_name.lower().replace(' ', '_'))
    except Exception as e:
        console.print(f"[red]✗ Failed to read config.json: {e}[/]")
        exit(1)

    # Display files to be uploaded
    console.print("[bold]Files to upload:[/]")
    console.print(f"  • strategy.py ({strategy_file.stat().st_size} bytes)")
    console.print(f"  • config.json ({config_file.stat().st_size} bytes)")
    if requirements_file.exists():
        console.print(f"  • requirements.txt ({requirements_file.stat().st_size} bytes)")
    else:
        console.print("  • requirements.txt [dim](not found, will use defaults)[/]")
    console.print()

    console.print(f"[bold]Strategy:[/] {strategy_name}")
    console.print(f"[dim]Code:[/] {strategy_code}")
    console.print()

    # Confirm upload
    if not force:
        console.print("[yellow]This will upload and deploy your strategy to the platform.[/]")
        console.print("[dim]Your code will be validated for security and compliance.[/]")
        console.print()

        if not Confirm.ask("Continue with deployment?", default=True):
            console.print("[dim]Deployment cancelled[/]")
            exit(0)

    # Upload strategy
    console.print()
    with console.status("[cyan]Uploading and validating strategy...[/]"):
        try:
            result = client.upload_strategy_cli(
                strategy_file=strategy_file,
                config_file=config_file,
                requirements_file=requirements_file if requirements_file.exists() else None
            )
        except APIError as e:
            console.print()
            error_msg = f"[red]✗ Upload failed[/]\n\n{e}"

            # Show detailed error if available
            if e.response and isinstance(e.response, dict):
                # Debug: show entire response
                error_msg += f"\n\n[dim]Debug Response: {json.dumps(e.response, indent=2)}[/dim]"

                if 'details' in e.response:
                    error_msg += "\n\n[yellow]Details:[/]"
                    details = e.response['details']
                    if isinstance(details, list):
                        for detail in details:
                            error_msg += f"\n  • {detail}"
                    else:
                        error_msg += f"\n  {details}"

            console.print(Panel(
                error_msg,
                style="red",
                border_style="red",
                title="Error"
            ))
            exit(1)

    # Display results
    console.print()

    strategy_data = result.get('strategy', {})
    is_new = strategy_data.get('isNew', False)
    strategy_id = strategy_data.get('id')
    version = strategy_data.get('version', 'N/A')
    validation = result.get('validation', {})

    # Debug: print full response to understand validation result
    # console.print(f"[dim]Debug - Full response: {json.dumps(result, indent=2)}[/dim]")

    # Create result table
    table = Table(
        show_header=False,
        box=box.SIMPLE,
        padding=(0, 2)
    )
    table.add_column("Field", style="dim")
    table.add_column("Value", style="bold")

    table.add_row("Status", "[green]New Strategy[/]" if is_new else "[cyan]Updated[/]")
    table.add_row("Strategy ID", strategy_id or "N/A")
    table.add_row("Version", version)

    # Validation status (backend returns 'isValid' not 'status')
    is_valid = validation.get('isValid', validation.get('status') == 'passed')
    if is_valid:
        table.add_row("Validation", "[green]✓ Passed[/]")
        validation_status = 'passed'
    elif validation.get('errors'):
        table.add_row("Validation", "[red]✗ Failed[/]")
        validation_status = 'failed'
    else:
        table.add_row("Validation", "[yellow]⚠ Unknown[/]")
        validation_status = 'unknown'

    console.print(Panel(
        table,
        title="[green]✓ Strategy Deployed Successfully![/]" if validation_status == 'passed' else "[yellow]⚠ Deployment Complete[/]",
        border_style="green" if validation_status == 'passed' else "yellow",
        padding=(1, 2)
    ))

    # Show validation details
    if validation.get('errors') or validation.get('warnings'):
        console.print()

        errors = validation.get('errors', [])
        warnings = validation.get('warnings', [])

        if errors:
            console.print("[red]Errors:[/]")
            for error in errors:
                console.print(f"  • {error}")

        if warnings:
            console.print("[yellow]Warnings:[/]")
            for warning in warnings:
                console.print(f"  • {warning}")

    # Save strategy ID to local config (for future use)
    if strategy_id:
        local_config_dir = current_dir / '.xcoin'
        local_config_dir.mkdir(exist_ok=True)

        local_config_file = local_config_dir / 'strategy.json'
        with open(local_config_file, 'w') as f:
            json.dump({
                'strategyId': strategy_id,
                'version': version,
                'name': strategy_name,
                'code': strategy_code
            }, f, indent=2)

    # Register/update local registry entry
    register_or_update_project(path=current_dir, name=strategy_name, code=strategy_code, remote_id=strategy_id, version=version)

    # Note: Backend automatically runs backtest on upload
    # No need to run redundant CLI backtest here

    # Marketplace deployment
    if marketplace and validation_status == 'passed':
        console.print()

        if not force:
            console.print("[yellow]Do you want to publish this strategy to the marketplace?[/]")
            console.print("[dim]Users will be able to discover and subscribe to your strategy.[/]")
            console.print()

            if not Confirm.ask("Publish to marketplace?", default=False):
                console.print("[dim]Skipped marketplace deployment[/]")
                marketplace = False

        if marketplace:
            with console.status("[cyan]Publishing to marketplace...[/]"):
                try:
                    publish_result = client.publish_to_marketplace(strategy_id)
                    console.print()
                    console.print("[green]✓ Published to marketplace![/]")
                    console.print()

                    marketplace_url = publish_result.get('strategy', {}).get('marketplaceUrl')
                    if marketplace_url:
                        console.print(f"[bold]Marketplace URL:[/]")
                        console.print(f"  {marketplace_url}")
                        console.print()
                        console.print("[dim]Other traders can now discover and subscribe to your strategy![/]")
                except APIError as e:
                    console.print()
                    console.print(f"[red]✗ Marketplace publication failed: {e}[/]")

    # Next steps
    console.print()
    console.print("[bold]Next steps:[/]")
    console.print("  • View your strategies: [cyan]xcoin status[/]")
    console.print("  • Monitor execution: [cyan]xcoin logs[/]")

    if not marketplace:
        console.print("  • Publish to marketplace: [cyan]xcoin deploy --marketplace[/]")

    console.print()
    console.print("[dim]Your strategy is now live on the xcoinalgo platform![/]")
    console.print()


def _run_and_upload_backtest(client: APIClient, strategy_id: str, strategy_file: Path, config_data: dict):
    """
    Run backtest and upload results to backend

    Returns backtest metrics or None if failed
    """
    import pandas as pd

    try:
        # Get symbol from config
        symbol = config_data.get('pair') or config_data.get('pairs', [None])[0]
        if not symbol:
            console.print("[yellow]⚠ No symbol found in config, skipping backtest[/]")
            return None

        # Fetch last 30 days of data from CoinDCX
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)

        console.print(f"[dim]Fetching historical data for {symbol}...[/]")

        # Fetch data from CoinDCX
        end_ts = int(end_date.timestamp() * 1000)
        start_ts = int(start_date.timestamp() * 1000)

        url = f"https://public.coindcx.com/market_data/candlesticks"
        params = {
            'pair': symbol,
            'from': start_ts,
            'to': end_ts,
            'resolution': '15',  # 15 minute candles
            'pcode': 'f'
        }

        response = requests.get(url, params=params)
        response.raise_for_status()
        data_json = response.json()

        if 'data' not in data_json or not data_json['data']:
            console.print(f"[yellow]⚠ No historical data available for {symbol}[/]")
            return None

        # Parse candles
        candles_data = data_json['data']
        df = pd.DataFrame(candles_data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)

        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')

        df.sort_index(inplace=True)

        console.print(f"[dim]Running backtest on {len(df)} candles...[/]")

        # Run backtest
        engine = BacktestEngine(
            strategy_file=strategy_file,
            initial_capital=10000.0,
            commission=0.001
        )

        # Extract settings from config
        settings = {}
        if 'parameters' in config_data:
            for param in config_data['parameters']:
                name = param.get('name')
                default = param.get('default')
                if name and default is not None:
                    settings[name] = default
        settings['symbol'] = symbol

        result = engine.run(df, settings)

        # Compute drawdown series from equity curve if not provided
        eq = result.equity_curve
        peak = 0.0
        equity_points = []
        for point in eq:
            # point: (timestamp, equity)
            ts, eqv = point[0], point[1]
            peak = max(peak, eqv if equity_points else eqv)
            dd = 0.0 if peak == 0 else (peak - eqv) / peak * 100.0
            equity_points.append({
                'time': (ts if isinstance(ts, str) else pd.to_datetime(ts).to_pydatetime().isoformat()),
                'equity': float(eqv),
                'drawdown': float(dd)
            })

        # Prepare backtest result payload (standardized shape)
        backtest_payload = {
            'startDate': start_date.isoformat(),
            'endDate': end_date.isoformat(),
            'initialBalance': 10000.0,
            'finalBalance': 10000.0 + result.total_pnl,
            'totalReturn': result.total_pnl,
            'totalReturnPct': result.total_pnl_percentage,
            'maxDrawdown': result.max_drawdown_percentage,
            'sharpeRatio': result.sharpe_ratio,
            'winRate': result.win_rate,
            'profitFactor': result.profit_factor,
            'totalTrades': result.total_trades,
            'avgTrade': result.total_pnl / result.total_trades if result.total_trades > 0 else 0,
            'timeframe': '15m',
            'equityCurve': equity_points[:250],
            'monthlyReturns': getattr(result, 'monthly_returns', {}),
            'tradeHistory': [
                {
                    'entryTime': str(t.entry_time),
                    'exitTime': str(t.exit_time) if t.exit_time else None,
                    'side': t.side,
                    'pnl': t.pnl,
                    'pnlPercentage': t.pnl_percentage
                }
                for t in result.trades[:50]
            ]
        }

        # Upload to backend
        console.print("[dim]Uploading backtest results...[/]")
        upload_result = client.upload_backtest_results(strategy_id, backtest_payload)

        if upload_result and upload_result.get('success'):
            return upload_result.get('backtestResult', {})
        else:
            return None

    except Exception as e:
        console.print(f"[dim]Backtest error: {str(e)}[/]")
        return None
