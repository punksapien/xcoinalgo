"""
xcoin deploy - uploads strategy code to backend
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
from xcoin_cli.validators import StrategyValidator  # for validation before upload

console = Console()


@click.command()
@click.argument('strategy_name', required=True)
@click.option('--force', is_flag=True, help='Skip confirmations')
def deploy(strategy_name, force):
    """
    Deploy strategy to backend

    Usage:
        xcoin deploy my-strategy
        xcoin deploy my-strategy --force

    Always run from parent directory of strategies.
    """
    console.print()
    console.print("[bold cyan]🚀 Deploying Strategy[/]")
    console.print()

    # check if user is logged in
    api = APIClient()
    if not api.is_authenticated():
        console.print("[red]✗ not logged in, run 'xcoin login' first[/]")
        exit(1)

    user_data = api.get_user_info()
    console.print(f"[dim]logged in as: {user_data.get('email', 'unknown')}[/]")
    console.print()

    # find strategy folder
    strat_folder = Path.cwd() / strategy_name
    if not strat_folder.exists() or not strat_folder.is_dir():
        console.print(f"[red]✗ strategy folder not found: {strategy_name}[/]")
        console.print(f"[dim]make sure './{strategy_name}/' exists in current directory[/]")
        exit(1)

    strat_file = strat_folder / "strategy.py"
    config_file = strat_folder / "config.json"
    req_file = strat_folder / "requirements.txt"

    # check if files exist
    if not strat_file.exists():
        console.print(f"[red]✗ strategy.py not found in {strategy_name}/[/]")
        exit(1)

    if not config_file.exists():
        console.print(f"[red]✗ config.json not found in {strategy_name}/[/]")
        exit(1)

    # read config to get strategy name/code
    try:
        with open(config_file, 'r') as f:
            config_data = json.load(f)
        strat_name = config_data.get('name', strategy_name)
        strat_code = config_data.get('code', strategy_name.upper().replace('-', '_'))
    except Exception as e:
        console.print(f"[red]✗ cant read config.json: {e}[/]")
        exit(1)

    console.print(f"[bold]Strategy:[/] {strat_name}")
    console.print(f"[dim]Code:[/] {strat_code}")
    console.print(f"[dim]Folder:[/] {strategy_name}/")
    console.print()

    # validate strategy before uploading (optional but recommended)
    console.print("[dim]validating strategy code...[/]")
    validator = StrategyValidator()
    validation_results = validator.validate_project(strat_folder)

    # check if validation passed
    all_valid = True
    for check_name, result in validation_results.items():
        if not result.is_valid:
            all_valid = False
            console.print(f"[red]✗ {check_name} validation failed:[/]")
            for err in result.errors:
                console.print(f"  • {err}")

    if not all_valid:
        console.print()
        console.print("[yellow]⚠ validation found issues[/]")
        if not force:
            if not Confirm.ask("deploy anyway?", default=False):
                console.print("[dim]deployment cancelled[/]")
                exit(0)
    else:
        console.print("[green]✓ validation passed[/]")

    console.print()

    # show what we're uploading
    console.print("[bold]files:[/]")
    console.print(f"  • strategy.py ({strat_file.stat().st_size} bytes)")
    console.print(f"  • config.json ({config_file.stat().st_size} bytes)")
    if req_file.exists():
        console.print(f"  • requirements.txt ({req_file.stat().st_size} bytes)")
    else:
        console.print("  • requirements.txt [dim](not found, using defaults)[/]")
    console.print()

    # confirm before uploading
    if not force:
        console.print("[yellow]this will upload your code to the backend[/]")
        if not Confirm.ask("continue?", default=True):
            console.print("[dim]cancelled[/]")
            exit(0)

    # upload to backend
    console.print()
    with console.status("[cyan]uploading...[/]"):
        try:
            result = api.upload_strategy_cli(
                strategy_file=strat_file,
                config_file=config_file,
                requirements_file=req_file if req_file.exists() else None
            )
        except APIError as e:
            console.print()
            console.print(f"[red]✗ upload failed: {e}[/]")
            # show error details if available
            if e.response and isinstance(e.response, dict):
                if 'details' in e.response:
                    console.print()
                    console.print("[yellow]details:[/]")
                    details = e.response['details']
                    if isinstance(details, list):
                        for d in details:
                            console.print(f"  • {d}")
                    else:
                        console.print(f"  {details}")
            exit(1)

    # show results
    console.print()

    strat_data = result.get('strategy', {})
    is_new = strat_data.get('isNew', False)
    strat_id = strat_data.get('id')
    version = strat_data.get('version', '1.0.0')
    validation_result = result.get('validation', {})

    # make a results table
    results_table = Table(show_header=False, box=box.SIMPLE, padding=(0, 2))
    results_table.add_column("field", style="dim")
    results_table.add_column("value", style="bold")

    results_table.add_row("status", "[green]new strategy[/]" if is_new else "[cyan]updated[/]")
    results_table.add_row("id", strat_id or "n/a")
    results_table.add_row("version", version)

    # check validation status from backend
    backend_valid = validation_result.get('isValid', False)
    if backend_valid:
        results_table.add_row("validation", "[green]✓ passed[/]")
    else:
        results_table.add_row("validation", "[yellow]⚠ pending[/]")

    console.print(Panel(
        results_table,
        title="[green]✓ deployed successfully![/]" if backend_valid else "[yellow]⚠ deployed[/]",
        border_style="green" if backend_valid else "yellow",
        padding=(1, 2)
    ))

    # show validation errors/warnings if any
    if validation_result.get('errors') or validation_result.get('warnings'):
        console.print()
        errors = validation_result.get('errors', [])
        warnings = validation_result.get('warnings', [])

        if errors:
            console.print("[red]errors:[/]")
            for err in errors:
                console.print(f"  • {err}")

        if warnings:
            console.print("[yellow]warnings:[/]")
            for warn in warnings:
                console.print(f"  • {warn}")

    # save strategy id locally for future reference
    if strat_id:
        local_cfg_dir = strat_folder / '.xcoin'
        local_cfg_dir.mkdir(exist_ok=True)

        local_cfg_file = local_cfg_dir / 'deploy.json'
        with open(local_cfg_file, 'w') as f:
            json.dump({
                'strategy_id': strat_id,
                'version': version,
                'name': strat_name,
                'code': strat_code,
                'deployed_at': str(Path.cwd())  # remember where we deployed from
            }, f, indent=2)

    console.print()
    console.print("[dim]✓ strategy deployed to backend![/]")
    console.print()
