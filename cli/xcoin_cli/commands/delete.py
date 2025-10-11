"""
xcoin delete - Delete a strategy
"""

import click
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm

from xcoin_cli.api_client import APIClient, APIError
from xcoin_cli.config import ConfigManager

console = Console()


@click.command()
@click.argument('strategy_name', required=False)
@click.option('--strategy-id', help='Strategy ID (if not using name)')
@click.option('--yes', '-y', is_flag=True, help='Skip confirmation prompt')
def delete(strategy_name, strategy_id, yes):
    """
    Delete a strategy

    \b
    Usage (context-aware - in strategy directory):
        xcoin delete                    # Delete current strategy
        xcoin delete --yes              # Delete without confirmation

    \b
    Usage (explicit naming - from anywhere):
        xcoin delete my-strategy        # Delete by name
        xcoin delete --strategy-id xyz  # Delete by ID

    \b
    ⚠️  Warning:
        This will remove the strategy from the platform.
        Active deployments must be stopped first.
    """
    console.print()
    console.print(Panel.fit(
        "🗑️  Delete Strategy",
        style="bold red",
        border_style="red"
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
        console.print(f"[dim]Deleting strategy: {strategy_dir}[/]")
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

    # Fetch strategy details
    try:
        with console.status("[cyan]Fetching strategy details...[/]"):
            strategy = client.get_strategy(strategy_id)
    except APIError as e:
        console.print()
        console.print(f"[red]✗ Failed to fetch strategy: {e}[/]")
        exit(1)

    # Display strategy info
    console.print(f"[bold]Strategy:[/] {strategy.get('name', 'Unknown')}")
    console.print(f"[bold]ID:[/] {strategy_id}")
    console.print(f"[bold]Version:[/] {strategy.get('version', 'N/A')}")
    console.print()

    # Confirm deletion
    if not yes:
        confirmed = Confirm.ask(
            "[bold red]⚠️  Are you sure you want to delete this strategy?[/]",
            default=False
        )
        if not confirmed:
            console.print("[yellow]Deletion cancelled[/]")
            return

    # Delete strategy
    with console.status("[red]Deleting strategy...[/]"):
        try:
            result = client.delete_strategy(strategy_id)
        except APIError as e:
            console.print()
            console.print(f"[red]✗ Failed to delete strategy: {e}[/]")
            if "active deployments" in str(e).lower():
                console.print()
                console.print("[yellow]💡 Tip: Stop all active deployments first[/]")
                console.print("[dim]   You can manage deployments from the dashboard[/]")
            exit(1)

    # Success
    console.print()
    console.print(f"[green]✓ Strategy deleted successfully[/]")
    console.print()
    console.print("[dim]Note: Local files are not deleted. Use 'rm -rf .' to clean up.[/]")
    console.print()
