"""
xcoin logs - Stream strategy execution logs
"""

import click
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.live import Live
from rich import box
import time

from xcoin_cli.api_client import APIClient, APIError
from xcoin_cli.config import ConfigManager

console = Console()


@click.command()
@click.argument('strategy_name', required=False)
@click.option('--tail', is_flag=True, help='Stream logs in real-time (not yet implemented)')
@click.option('--lines', default=50, help='Number of lines to show')
@click.option('--strategy-id', help='Strategy ID (deprecated, use positional argument or auto-detect)')
def logs(strategy_name, tail, lines, strategy_id):
    """
    View strategy execution logs

    \b
    Usage (context-aware - in strategy directory):
        xcoin logs              # Show recent logs
        xcoin logs --lines 100  # Show last 100 lines
        xcoin logs --tail       # Stream real-time logs (coming soon)

    \b
    Usage (explicit naming - from anywhere):
        xcoin logs my-strategy
        xcoin logs my-strategy --lines 100
    """
    console.print()
    console.print(Panel.fit(
        "📜 Execution Logs",
        style="bold cyan",
        border_style="cyan"
    ))
    console.print()

    # Check authentication
    client = APIClient()
    if not client.is_authenticated():
        console.print("[red]✗ Not authenticated. Please run 'xcoin login' first[/]")
        exit(1)

    # Determine strategy directory
    if strategy_name:
        # Explicit naming mode
        strategy_dir = Path.cwd() / strategy_name
        if not strategy_dir.exists() or not strategy_dir.is_dir():
            console.print(f"[red]✗ Strategy directory not found: {strategy_name}[/]")
            console.print("[dim]Make sure the directory exists in the current path[/]")
            exit(1)
        current_dir = strategy_dir
        console.print(f"[dim]Fetching logs for: {strategy_dir}[/]")
        console.print()
    else:
        # Context-aware mode
        current_dir = Path.cwd()

    # Get strategy ID from local config if not provided via option
    if not strategy_id:
        # Try .xcoin/strategy.json first (created by deploy command)
        local_strategy_file = current_dir / '.xcoin' / 'strategy.json'
        if local_strategy_file.exists():
            import json
            with open(local_strategy_file, 'r') as f:
                local_data = json.load(f)
                strategy_id = local_data.get('strategyId')

        # Fallback to old config.yml format
        if not strategy_id:
            local_config_file = current_dir / '.xcoin' / 'config.yml'
            if local_config_file.exists():
                local_config = ConfigManager(local_config_file)
                strategy_id = local_config.get('strategy_id')

        if not strategy_id:
            console.print("[red]✗ Strategy ID not found[/]")
            console.print("[dim]Deploy your strategy first with 'xcoin deploy' or provide --strategy-id[/]")
            exit(1)

    # Fetch logs
    with console.status(f"[cyan]Fetching last {lines} log entries...[/]"):
        try:
            logs_data = client.get_execution_logs(
                strategy_id=strategy_id,
                limit=lines
            )
        except APIError as e:
            console.print()
            console.print(f"[red]✗ Failed to fetch logs: {e}[/]")
            exit(1)

    # Display logs
    console.print()
    _display_logs(logs_data)
    console.print()

    if tail:
        console.print("[yellow]⚠ Real-time log streaming not yet implemented[/]")
        console.print("[dim]Coming soon: Live log updates[/]")


def _display_logs(logs_data: dict):
    """Display execution logs in a formatted table"""

    log_entries = logs_data.get('logs', [])

    if not log_entries:
        console.print("[dim]No logs found[/]")
        return

    # Create logs table
    table = Table(
        show_header=True,
        header_style="bold cyan",
        box=box.ROUNDED,
        border_style="dim"
    )

    table.add_column("Timestamp", style="dim", width=20)
    table.add_column("Type", style="bold", width=10)
    table.add_column("Signal", style="bold", width=12)
    table.add_column("Price", style="cyan", width=12)
    table.add_column("Details", style="")

    for entry in log_entries:
        timestamp = entry.get('timestamp', 'N/A')
        log_type = entry.get('type', 'info')
        signal = entry.get('signal', 'HOLD')
        price = entry.get('price', 0)
        details = entry.get('details', '')

        # Format signal with color
        if signal == 'LONG':
            signal_text = "[green]LONG[/]"
        elif signal == 'SHORT':
            signal_text = "[red]SHORT[/]"
        elif signal == 'EXIT_LONG' or signal == 'EXIT_SHORT':
            signal_text = f"[yellow]{signal}[/]"
        else:
            signal_text = f"[dim]{signal}[/]"

        # Format type with color
        if log_type == 'error':
            type_text = "[red]ERROR[/]"
        elif log_type == 'warning':
            type_text = "[yellow]WARN[/]"
        elif log_type == 'success':
            type_text = "[green]SUCCESS[/]"
        else:
            type_text = f"[dim]{log_type.upper()}[/]"

        # Format price
        price_text = f"${price:.2f}" if price > 0 else "-"

        table.add_row(
            timestamp,
            type_text,
            signal_text,
            price_text,
            details
        )

    console.print(table)

    # Summary
    total = logs_data.get('total', len(log_entries))
    console.print()
    console.print(f"[dim]Showing {len(log_entries)} of {total} total log entries[/]")
