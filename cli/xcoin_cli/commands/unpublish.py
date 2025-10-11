"""
xcoin unpublish - Remove strategy from marketplace
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
def unpublish(strategy_name, strategy_id, yes):
    """
    Remove strategy from marketplace

    \b
    Usage (context-aware - in strategy directory):
        xcoin unpublish                 # Unpublish current strategy
        xcoin unpublish --yes           # Unpublish without confirmation

    \b
    Usage (explicit naming - from anywhere):
        xcoin unpublish my-strategy     # Unpublish by name
        xcoin unpublish --strategy-id xyz  # Unpublish by ID

    \b
    This removes the strategy from the marketplace but keeps it in your account.
    You can republish it later with 'xcoin deploy --marketplace'
    """
    console.print()
    console.print(Panel.fit(
        "📤 Unpublish from Marketplace",
        style="bold yellow",
        border_style="yellow"
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
        console.print(f"[dim]Unpublishing strategy: {strategy_dir}[/]")
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

    # Check if already inactive
    if not strategy.get('isActive', False):
        console.print("[yellow]⚠️  Strategy is already unpublished from marketplace[/]")
        console.print()
        return

    # Confirm unpublish
    if not yes:
        confirmed = Confirm.ask(
            "[bold yellow]Remove this strategy from marketplace?[/]",
            default=False
        )
        if not confirmed:
            console.print("[yellow]Unpublish cancelled[/]")
            return

    # Unpublish strategy
    with console.status("[yellow]Removing from marketplace...[/]"):
        try:
            result = client.unpublish_from_marketplace(strategy_id)
        except APIError as e:
            console.print()
            console.print(f"[red]✗ Failed to unpublish strategy: {e}[/]")
            exit(1)

    # Success
    console.print()
    console.print(f"[green]✓ Strategy removed from marketplace[/]")
    console.print()
    console.print("[dim]💡 Tip: Republish anytime with 'xcoin deploy --marketplace'[/]")
    console.print()
