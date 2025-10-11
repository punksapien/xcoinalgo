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
from xcoin_cli.local_registry import list_local

console = Console()


@click.command()
@click.option('--marketplace', is_flag=True, help='Show only marketplace-published strategies')
@click.option('--active', is_flag=True, help='Show only active strategies')
@click.option('--limit', default=20, help='Number of strategies to show (default: 20)')
@click.option('--scope', type=click.Choice(['local', 'remote']), default='remote', help='List local registry or remote strategies')
@click.option('--perf', is_flag=True, help='Show basic performance metrics if available')
def list(marketplace, active, limit, scope, perf):
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

    if scope == 'remote':
        # Check authentication
        client = APIClient()
        if not client.is_authenticated():
            console.print("[red]✗ Not authenticated. Please run 'xcoin login' first[/]")
            exit(1)

    # Fetch strategies
    if scope == 'remote':
        with console.status("[cyan]Fetching strategies...[/]"):
            try:
                strategies = client.list_strategies()
            except APIError as e:
                console.print()
                console.print(f"[red]✗ Failed to fetch strategies: {e}[/]")
                exit(1)
    else:
        strategies = list_local()

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
    table.add_column("ID/Path", style="dim")
    table.add_column("Version", justify="center")
    table.add_column("Status", justify="center")
    table.add_column("Marketplace", justify="center")
    if perf:
        table.add_column("Win%", justify="right")
        table.add_column("ROI%", justify="right")
        table.add_column("MaxDD%", justify="right")
    table.add_column("Created", style="dim")

    for strategy in filtered:
        if scope == 'remote':
            name = strategy.get('name', 'Unknown')
            id_or_path = (strategy.get('id', 'N/A')[:12] + '...')
            version = strategy.get('version', 'N/A')
            is_active = strategy.get('isActive', False)
            is_marketplace = strategy.get('isActive', False)
            created_at = strategy.get('createdAt', 'N/A')[:10]
            status = "[green]Active[/]" if is_active else "[dim]Inactive[/]"
            marketplace_status = "[green]✓[/]" if is_marketplace else "[dim]—[/]"
            row = [name, id_or_path, version, status, marketplace_status]
            if perf:
                cache = strategy  # remote doesn't have cache; skip unless later extended
                row += [
                    "-",
                    "-",
                    "-",
                ]
            row += [created_at]
            table.add_row(*row)
        else:
            name = strategy.get('name') or Path(strategy.get('path', '')).name
            id_or_path = strategy.get('path', 'N/A')
            version = strategy.get('version', 'N/A')
            status = "[dim]Local[/]"
            marketplace_status = "[dim]—[/]" if not strategy.get('remoteId') else "[green]Linked[/]"
            row = [name, id_or_path, version, status, marketplace_status]
            if perf:
                b = (strategy.get('cache', {}) or {}).get('backtestSummary', {})
                row += [
                    f"{b.get('winRate', 0):.1f}%" if 'winRate' in b else '-',
                    f"{b.get('roi', 0):.2f}%" if 'roi' in b else '-',
                    f"{b.get('maxDrawdown', 0):.2f}%" if 'maxDrawdown' in b else '-',
                ]
            created_at = strategy.get('createdAt', 'N/A')
            row += [created_at[:10] if isinstance(created_at, str) else 'N/A']
            table.add_row(*row)

    console.print(table)
    console.print()
    console.print("[dim]💡 Tip: Use 'xcoin status <name>' to see detailed info[/]")
    console.print()
