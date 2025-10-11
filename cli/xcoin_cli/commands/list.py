"""
xcoin list - List user's strategies
"""

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

from xcoin_cli.api_client import APIClient, APIError
from xcoin_cli.config import ConfigManager

console = Console()


@click.command()
@click.option('--marketplace', is_flag=True, help='Show only marketplace-published strategies')
@click.option('--active', is_flag=True, help='Show only active strategies')
@click.option('--limit', default=20, help='Number of strategies to show (default: 20)')
def list(marketplace, active, limit):
    """
    List your strategies

    \b
    Usage:
        xcoin list                  # List all your strategies
        xcoin list --marketplace    # List marketplace strategies
        xcoin list --active         # List only active strategies
        xcoin list --limit 50       # Show up to 50 strategies

    \b
    Shows:
        - Strategy ID
        - Name
        - Version
        - Status (Active/Inactive)
        - Marketplace status
        - Created date
    """
    console.print()
    console.print(Panel.fit(
        "📋 Your Strategies",
        style="bold cyan",
        border_style="cyan"
    ))
    console.print()

    # Check authentication
    client = APIClient()
    if not client.is_authenticated():
        console.print("[red]✗ Not authenticated. Please run 'xcoin login' first[/]")
        exit(1)

    # Fetch strategies
    with console.status("[cyan]Fetching strategies...[/]"):
        try:
            strategies = client.list_strategies()
        except APIError as e:
            console.print()
            console.print(f"[red]✗ Failed to fetch strategies: {e}[/]")
            exit(1)

    if not strategies:
        console.print("[yellow]No strategies found[/]")
        console.print("[dim]Create your first strategy with: xcoin init my-strategy[/]")
        console.print()
        return

    # Filter strategies
    filtered = strategies
    if marketplace:
        filtered = [s for s in filtered if s.get('isActive', False)]
    if active:
        filtered = [s for s in filtered if s.get('isActive', False)]

    # Limit results
    filtered = filtered[:limit]

    # Display in table
    table = Table(
        show_header=True,
        header_style="bold cyan",
        box=box.ROUNDED,
        title=f"Showing {len(filtered)} of {len(strategies)} strategies"
    )

    table.add_column("Name", style="bold")
    table.add_column("ID", style="dim")
    table.add_column("Version", justify="center")
    table.add_column("Status", justify="center")
    table.add_column("Marketplace", justify="center")
    table.add_column("Created", style="dim")

    for strategy in filtered:
        name = strategy.get('name', 'Unknown')
        strategy_id = strategy.get('id', 'N/A')[:12] + '...'
        version = strategy.get('version', 'N/A')
        is_active = strategy.get('isActive', False)
        is_marketplace = strategy.get('isActive', False)  # isActive indicates marketplace status
        created_at = strategy.get('createdAt', 'N/A')[:10]  # Date only

        # Format status
        status = "[green]Active[/]" if is_active else "[dim]Inactive[/]"
        marketplace_status = "[green]✓[/]" if is_marketplace else "[dim]—[/]"

        table.add_row(
            name,
            strategy_id,
            version,
            status,
            marketplace_status,
            created_at
        )

    console.print(table)
    console.print()
    console.print("[dim]💡 Tip: Use 'xcoin status <name>' to see detailed info[/]")
    console.print()
