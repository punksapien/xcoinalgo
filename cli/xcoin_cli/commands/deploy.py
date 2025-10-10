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

console = Console()


@click.command()
@click.option('--force', is_flag=True, help='Skip confirmation')
@click.option('--marketplace', is_flag=True, help='Also deploy to marketplace')
def deploy(force, marketplace):
    """
    Deploy strategy to xcoinalgo platform

    \b
    Usage:
        xcoin deploy                  # Deploy to platform
        xcoin deploy --marketplace    # Deploy and publish to marketplace
        xcoin deploy --force          # Skip all confirmations

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
        console.print("[dim]Get your API key from: http://localhost:3000/dashboard/settings/api-keys[/]")
        exit(1)

    # Get user info
    user_info = client.get_user_info()
    console.print(f"[dim]Logged in as:[/] {user_info.get('email', 'Unknown')}")
    console.print()

    # Check for required files
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
            console.print(Panel(
                f"[red]✗ Upload failed[/]\n\n{e}",
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

    # Validation status
    validation_status = validation.get('status', 'unknown')
    if validation_status == 'passed':
        table.add_row("Validation", "[green]✓ Passed[/]")
    elif validation_status == 'failed':
        table.add_row("Validation", "[red]✗ Failed[/]")
    else:
        table.add_row("Validation", "[yellow]⚠ Unknown[/]")

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
