"""
xcoin status - Check strategy status on platform
"""

import click
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import box

from xcoin_cli.api_client import APIClient, APIError
from xcoin_cli.config import ConfigManager

console = Console()


@click.command()
@click.option('--strategy-id', help='Strategy ID (auto-detected if not provided)')
def status(strategy_id):
    """
    Check strategy status on platform

    \b
    Usage:
        xcoin status                    # Check current strategy
        xcoin status --strategy-id ID   # Check specific strategy

    \b
    Shows:
        - Git repository info
        - Validation status
        - Deployment status
        - Subscriber count
        - Performance metrics
    """
    console.print()
    console.print(Panel.fit(
        "📊 Strategy Status",
        style="bold cyan",
        border_style="cyan"
    ))
    console.print()

    # Check authentication
    client = APIClient()
    if not client.is_authenticated():
        console.print("[red]✗ Not authenticated. Please run 'xcoin login' first[/]")
        exit(1)

    # Get strategy ID from local config if not provided
    if not strategy_id:
        current_dir = Path.cwd()
        local_config_file = current_dir / '.xcoin' / 'config.yml'

        if local_config_file.exists():
            local_config = ConfigManager(local_config_file)
            strategy_id = local_config.get('strategy_id')

        if not strategy_id:
            console.print("[red]✗ Strategy ID not found[/]")
            console.print("[dim]Run 'xcoin link-git' first or provide --strategy-id[/]")
            exit(1)

    # Fetch strategy status
    with console.status("[cyan]Fetching strategy status...[/]"):
        try:
            status_data = client.get_strategy_status(strategy_id)
        except APIError as e:
            console.print()
            console.print(f"[red]✗ Failed to fetch status: {e}[/]")
            exit(1)

    # Display status
    console.print()
    _display_status(status_data)
    console.print()


def _display_status(status_data: dict):
    """Display strategy status in formatted panels"""

    strategy = status_data.get('strategy', {})
    git_info = status_data.get('gitInfo', {})
    validation = status_data.get('validation', {})
    deployment = status_data.get('deployment', {})
    metrics = status_data.get('metrics', {})

    # Strategy Info
    info_table = Table(
        show_header=False,
        box=box.SIMPLE,
        padding=(0, 2)
    )
    info_table.add_column("Field", style="dim")
    info_table.add_column("Value", style="bold")

    info_table.add_row("Name", strategy.get('name', 'N/A'))
    info_table.add_row("Code", strategy.get('code', 'N/A'))
    info_table.add_row("ID", strategy.get('_id', 'N/A'))
    info_table.add_row("Version", strategy.get('version', 'N/A'))

    console.print(Panel(
        info_table,
        title="Strategy Info",
        border_style="cyan",
        padding=(1, 2)
    ))
    console.print()

    # Git Info
    if git_info:
        git_table = Table(
            show_header=False,
            box=box.SIMPLE,
            padding=(0, 2)
        )
        git_table.add_column("Field", style="dim")
        git_table.add_column("Value")

        repo = git_info.get('repositoryUrl', 'Not linked')
        branch = git_info.get('branch', 'N/A')
        last_sync = git_info.get('lastSyncedAt', 'Never')
        auto_deploy = git_info.get('autoDeploy', False)

        git_table.add_row("Repository", repo)
        git_table.add_row("Branch", f"[bold]{branch}[/]")
        git_table.add_row("Last Synced", last_sync)
        git_table.add_row("Auto-deploy", "[green]Enabled[/]" if auto_deploy else "[dim]Disabled[/]")

        console.print(Panel(
            git_table,
            title="Git Integration",
            border_style="blue",
            padding=(1, 2)
        ))
        console.print()

    # Validation Status
    validation_status = validation.get('status', 'unknown')
    validation_errors = validation.get('errors', [])

    if validation_status == 'passed':
        status_icon = "[green]✓[/]"
        status_text = "[green]Passed[/]"
        border_style = "green"
    elif validation_status == 'failed':
        status_icon = "[red]✗[/]"
        status_text = "[red]Failed[/]"
        border_style = "red"
    else:
        status_icon = "[yellow]⚠[/]"
        status_text = "[yellow]Pending[/]"
        border_style = "yellow"

    validation_content = f"{status_icon} {status_text}"

    if validation_errors:
        validation_content += "\n\n[red]Errors:[/]"
        for error in validation_errors[:3]:  # Show first 3 errors
            validation_content += f"\n  • {error}"
        if len(validation_errors) > 3:
            validation_content += f"\n  ... and {len(validation_errors) - 3} more"

    console.print(Panel(
        validation_content,
        title="Validation Status",
        border_style=border_style,
        padding=(1, 2)
    ))
    console.print()

    # Deployment Status
    deployment_status = deployment.get('status', 'not_deployed')
    deployed_at = deployment.get('deployedAt', 'Never')

    if deployment_status == 'deployed':
        deploy_icon = "[green]✓[/]"
        deploy_text = f"[green]Deployed[/]\n[dim]At: {deployed_at}[/]"
        deploy_border = "green"
    else:
        deploy_icon = "[dim]○[/]"
        deploy_text = "[dim]Not deployed[/]"
        deploy_border = "dim"

    console.print(Panel(
        f"{deploy_icon} {deploy_text}",
        title="Deployment Status",
        border_style=deploy_border,
        padding=(1, 2)
    ))
    console.print()

    # Metrics (if available)
    if metrics:
        metrics_table = Table(
            show_header=False,
            box=box.SIMPLE,
            padding=(0, 2)
        )
        metrics_table.add_column("Metric", style="dim")
        metrics_table.add_column("Value", style="bold")

        subscribers = metrics.get('subscribers', 0)
        total_executions = metrics.get('totalExecutions', 0)
        success_rate = metrics.get('successRate', 0)

        metrics_table.add_row("Subscribers", str(subscribers))
        metrics_table.add_row("Total Executions", str(total_executions))
        metrics_table.add_row("Success Rate", f"{success_rate:.1f}%")

        console.print(Panel(
            metrics_table,
            title="Performance Metrics",
            border_style="magenta",
            padding=(1, 2)
        ))
