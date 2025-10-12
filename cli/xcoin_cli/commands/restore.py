"""
xcoin restore - reactivates a soft-deleted strategy from backend
"""

import click
from pathlib import Path
from rich.console import Console
from rich.prompt import Confirm

from xcoin_cli.api_client import APIClient, APIError

console = Console()


@click.command()
@click.argument('strategy_name', required=True)
@click.option('--force', is_flag=True, help='Skip confirmations')
def restore(strategy_name, force):
    """
    Restore (reactivate) a soft-deleted strategy from backend

    Usage:
        xcoin restore my-strategy    # reactivates strategy in backend

    This only works for soft-deleted strategies (removed with --remote but not --hard).
    Permanently deleted strategies (--hard) cannot be restored.
    """
    console.print()
    console.print("[bold cyan]♻️  restoring strategy[/]")
    console.print()

    # find local strategy folder to get strategy id
    strat_folder = Path.cwd() / strategy_name
    strat_id = None

    if strat_folder.exists():
        deploy_file = strat_folder / '.xcoin' / 'deploy.json'
        if deploy_file.exists():
            import json
            try:
                with open(deploy_file, 'r') as f:
                    deploy_data = json.load(f)
                strat_id = deploy_data.get('strategy_id')
            except:
                pass

    if not strat_id:
        console.print(f"[red]✗ no strategy id found for '{strategy_name}'[/]")
        console.print("[dim](make sure .xcoin/deploy.json exists with strategy_id)[/]")
        exit(1)

    console.print(f"[yellow]⚠ this will reactivate strategy in backend[/]")
    console.print(f"[dim]   strategy id: {strat_id}[/]")
    console.print()

    # confirm
    if not force:
        if not Confirm.ask("continue?", default=True):
            console.print("[dim]cancelled[/]")
            exit(0)

    # restore from backend
    console.print()
    api = APIClient()

    if not api.is_authenticated():
        console.print("[red]✗ not logged in, run 'xcoin login' first[/]")
        exit(1)

    try:
        with console.status("[cyan]restoring from backend...[/]"):
            api.restore_strategy(strat_id)

        console.print(f"[green]✓ strategy restored and activated in backend[/]")
    except APIError as e:
        # check if its a 404 (strategy doesnt exist)
        if hasattr(e, 'status_code') and e.status_code == 404:
            console.print("[yellow]⚠ strategy doesn't exist in backend[/]")
            console.print("[dim](was it permanently deleted with --hard?)[/]")
        else:
            console.print(f"[red]✗ restore failed: {e}[/]")
        exit(1)

    console.print()
    console.print("[dim]✓ done[/]")
    console.print()
