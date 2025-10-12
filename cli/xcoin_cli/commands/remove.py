"""
xcoin remove - deletes strategy locally and/or from backend
"""

import click
import shutil
from pathlib import Path
from rich.console import Console
from rich.prompt import Confirm

from xcoin_cli.api_client import APIClient, APIError

console = Console()


@click.command()
@click.argument('strategy_name', required=True)
@click.option('--remote', is_flag=True, help='Delete from backend too')
@click.option('--hard', is_flag=True, help='Permanently delete from backend (cant undo!)')
@click.option('--force', is_flag=True, help='Skip confirmations')
def remove(strategy_name, remote, hard, force):
    """
    Remove strategy locally and/or from backend

    Usage:
        xcoin remove my-strategy              # delete local folder only
        xcoin remove my-strategy --remote     # soft delete from backend (can restore)
        xcoin remove my-strategy --remote --hard  # PERMANENT delete (cant undo!)

    Soft delete marks strategies as inactive (isActive=false) in backend.
    Use 'xcoin restore my-strategy' to recover soft-deleted strategies.
    """
    console.print()
    console.print("[bold cyan]🗑️  removing strategy[/]")
    console.print()

    # find local strategy folder
    strat_folder = Path.cwd() / strategy_name
    local_exists = strat_folder.exists() and strat_folder.is_dir()

    if not local_exists and not remote:
        console.print(f"[yellow]⚠ folder '{strategy_name}' doesn't exist[/]")
        console.print("[dim](use --remote to remove from backend only)[/]")
        exit(1)

    # get strategy id if exists locally
    strat_id = None
    if local_exists:
        deploy_file = strat_folder / '.xcoin' / 'deploy.json'
        if deploy_file.exists():
            import json
            try:
                with open(deploy_file, 'r') as f:
                    deploy_data = json.load(f)
                strat_id = deploy_data.get('strategy_id')
            except:
                pass  # no biggie, just means not deployed

    # show whats gonna happen
    if local_exists:
        console.print(f"[yellow]⚠ this will delete local folder:[/] {strategy_name}/")

    if remote:
        if not strat_id:
            console.print("[yellow]⚠ no strategy id found, cant remove from backend[/]")
            console.print("[dim](strategy was never deployed or .xcoin/deploy.json missing)[/]")
            remote = False  # disable remote deletion
        else:
            if hard:
                console.print(f"[red]⚠ this will PERMANENTLY delete from backend![/]")
                console.print(f"[red]   strategy id: {strat_id}[/]")
                console.print("[red]   THIS CANNOT BE UNDONE![/]")
            else:
                console.print(f"[yellow]⚠ this will soft-delete from backend (can restore later)[/]")
                console.print(f"[dim]   strategy id: {strat_id}[/]")

    console.print()

    # confirm
    if not force:
        if hard:
            console.print("[red]are you ABSOLUTELY SURE? this is permanent![/]")
            confirm_msg = "type 'DELETE' to confirm"
            user_input = click.prompt(confirm_msg, type=str, default="")
            if user_input != "DELETE":
                console.print("[dim]cancelled[/]")
                exit(0)
        else:
            if not Confirm.ask("continue?", default=False):
                console.print("[dim]cancelled[/]")
                exit(0)

    # remove from backend first (if requested)
    if remote and strat_id:
        console.print()
        api = APIClient()

        if not api.is_authenticated():
            console.print("[red]✗ not logged in, cant remove from backend[/]")
            console.print("[dim]skipping backend deletion[/]")
        else:
            try:
                with console.status(f"[cyan]{'deleting' if hard else 'soft-deleting'} from backend...[/]"):
                    if hard:
                        # permanent deletion
                        api.delete_strategy(strat_id)
                    else:
                        # soft delete (deactivate)
                        api.soft_delete_strategy(strat_id)

                if hard:
                    console.print(f"[green]✓ permanently removed from backend[/]")
                else:
                    console.print(f"[green]✓ soft deleted from backend (use 'xcoin restore' to recover)[/]")
            except APIError as e:
                # check if its a 404 (strategy doesnt exist)
                if hasattr(e, 'status_code') and e.status_code == 404:
                    console.print("[yellow]⚠ strategy doesn't exist in backend (already deleted?)[/]")
                else:
                    console.print(f"[red]✗ backend deletion failed: {e}[/]")

                if not force:
                    if not Confirm.ask("continue with local deletion?", default=True):
                        exit(1)

    # remove local folder
    if local_exists:
        try:
            shutil.rmtree(strat_folder)
            console.print(f"[green]✓ deleted local folder: {strategy_name}/[/]")
        except FileNotFoundError:
            console.print(f"[yellow]⚠ folder '{strategy_name}' doesn't exist (already deleted?)[/]")
        except PermissionError:
            console.print(f"[red]✗ permission denied: cant delete '{strategy_name}/'[/]")
            exit(1)
        except Exception as e:
            console.print(f"[red]✗ failed to delete folder: {e}[/]")
            exit(1)
    elif not remote:
        # if we didnt try remote deletion and local doesnt exist, show friendly msg
        console.print(f"[yellow]⚠ folder '{strategy_name}' doesn't exist[/]")
        console.print("[dim](use --remote to remove from backend only)[/]")

    console.print()
    console.print("[dim]✓ done[/]")
    console.print()
