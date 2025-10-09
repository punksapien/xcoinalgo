"""
xcoin deploy - Deploy strategy to marketplace
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
@click.option('--force', is_flag=True, help='Skip confirmation')
@click.option('--strategy-id', help='Strategy ID (auto-detected if not provided)')
def deploy(force, strategy_id):
    """
    Deploy strategy to marketplace

    \b
    Usage:
        xcoin deploy             # Deploy with confirmation
        xcoin deploy --force     # Skip confirmation

    \b
    Requirements:
        - Latest validation passed
        - No active errors
        - Strategy config complete
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

    # Get current strategy status
    console.print("[dim]Checking strategy status...[/]")
    try:
        status_data = client.get_strategy_status(strategy_id)
    except APIError as e:
        console.print(f"[red]✗ Failed to fetch status: {e}[/]")
        exit(1)

    # Check validation status
    validation = status_data.get('validation', {})
    validation_status = validation.get('status', 'unknown')

    if validation_status != 'passed':
        console.print()
        console.print(Panel(
            "[red]✗ Validation has not passed[/]\n\n"
            "Please ensure your strategy passes validation before deploying.\n"
            "Run [cyan]xcoin validate[/] locally or check [cyan]xcoin status[/]",
            style="red",
            border_style="red",
            title="Validation Required"
        ))
        exit(1)

    console.print("[green]✓ Validation passed[/]")
    console.print()

    # Display strategy info
    strategy = status_data.get('strategy', {})
    console.print(f"[bold]Strategy:[/] {strategy.get('name', 'N/A')}")
    console.print(f"[dim]Code:[/] {strategy.get('code', 'N/A')}")
    console.print(f"[dim]Version:[/] {strategy.get('version', 'N/A')}")
    console.print()

    # Confirm deployment
    if not force:
        console.print("[yellow]This will deploy your strategy to the marketplace.[/]")
        console.print("[dim]Users will be able to subscribe and use it.[/]")
        console.print()

        if not Confirm.ask("Continue with deployment?", default=False):
            console.print("[dim]Deployment cancelled[/]")
            exit(0)

    # Deploy
    console.print()
    with console.status("[cyan]Deploying to marketplace...[/]"):
        try:
            result = client.deploy_strategy(strategy_id)
        except APIError as e:
            console.print()
            console.print(Panel(
                f"[red]✗ Deployment failed[/]\n\n{e}",
                style="red",
                border_style="red",
                title="Error"
            ))
            exit(1)

    # Success
    console.print()
    console.print(Panel(
        "[green]✓ Strategy deployed successfully![/]\n\n"
        f"Your strategy is now live on the marketplace.\n"
        f"Strategy URL: [cyan]{result.get('strategyUrl', 'N/A')}[/]",
        style="green",
        border_style="green",
        title="Success"
    ))
    console.print()
    console.print("[bold]Next steps:[/]")
    console.print("  • Monitor performance: [cyan]xcoin status[/]")
    console.print("  • View execution logs: [cyan]xcoin logs[/]")
    console.print("  • Share your strategy with the community!")
    console.print()
