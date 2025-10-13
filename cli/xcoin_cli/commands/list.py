"""
xcoin list - shows local stratgies in current directory
"""

import click
import json
from pathlib import Path
from rich.console import Console
from rich.table import Table
from rich import box

console = Console()


@click.command()
@click.option('--remote', is_flag=True, help='Show strategies from backend instead')
@click.option('--all', is_flag=True, help='Show all strategies (including inactive)')
@click.option('--full', 'show_full', is_flag=True, help='Show full IDs (no truncation)')
def list(remote, all, show_full):
    """
    List strategies (local or remote)

    Usage:
        xcoin list              # list local strategies in current dir
        xcoin list --remote     # list active strategies from backend
        xcoin list --remote --all  # list all strategies (including soft-deleted)

    Local: scans subdirectories for strategy.py + config.json files
    Remote: shows strategies deployed to backend (active only by default)
    """
    console.print()

    # remote mode - list from backend
    if remote:
        from xcoin_cli.api_client import APIClient, APIError

        console.print("[bold cyan]📋 backend strategies[/]")
        console.print()

        api = APIClient()
        if not api.is_authenticated():
            console.print("[red]✗ not logged in, run 'xcoin login' first[/]")
            exit(1)

        # fetch from backend
        try:
            with console.status("[cyan]fetching from backend...[/]"):
                backend_strats = api.list_strategies(show_all=all)
        except APIError as e:
            console.print(f"[red]✗ failed to fetch: {e}[/]")
            exit(1)

        if not backend_strats:
            console.print("[dim]no strategies in backend[/]")
            console.print("[dim]deploy one with: xcoin deploy my-strategy[/]")
            console.print()
            return

        # make table
        table = Table(box=box.ROUNDED, show_header=True)
        table.add_column("name", style="bold")
        table.add_column("id", style="dim")
        table.add_column("version", style="cyan")
        table.add_column("deployed", style="dim")
        if all:
            table.add_column("status", style="")

        for s in backend_strats:
            name = s.get('name', 'unknown')
            sid = s.get('id', 'n/a')
            strat_id = sid if show_full else (sid[:20] + '...' if len(sid) > 23 else sid)
            version = s.get('version', '1.0.0')
            created = s.get('createdAt', 'unknown')[:10]

            row_data = [name, strat_id, version, created]
            if all:
                is_active = s.get('isActive', True)
                status = "[green]active[/]" if is_active else "[dim]inactive[/]"
                row_data.append(status)

            table.add_row(*row_data)

        console.print(table)
        if not show_full:
            console.print("[dim]Tip: use[/] [bold]xcoin list --remote --full[/] [dim]to show full IDs[/]")
        console.print()
        console.print(f"[dim]found {len(backend_strats)} strategie(s) in backend[/]")
        console.print()
        return

    # local mode - scan current dir
    console.print("[bold cyan]📋 Local Strategies[/]")
    console.print()

    # scan current dir for strategy folders
    current_dir = Path.cwd()
    strats_found = []

    # look at each subdirectory
    for item in current_dir.iterdir():
        if not item.is_dir():
            continue  # skip files, only check folders

        # check if it has strategy.py and config.json
        strat_file = item / "strategy.py"
        config_file = item / "config.json"

        if strat_file.exists() and config_file.exists():
            # yep, looks like a strategy!
            try:
                with open(config_file, 'r') as f:
                    config_data = json.load(f)

                strat_name = config_data.get('name', item.name)
                strat_version = config_data.get('version', '1.0.0')
                strat_desc = config_data.get('description', 'no description')

                strats_found.append({
                    'folder': item.name,
                    'name': strat_name,
                    'version': strat_version,
                    'description': strat_desc
                })
            except Exception as e:
                # couldnt read config, probly bad json or something
                console.print(f"[yellow]⚠ Skipping {item.name} - bad config.json ({e})[/]")
                continue

    # show results
    if not strats_found:
        console.print("[dim]No strategies found in current directory[/]")
        console.print("[dim]Tip: Run 'xcoin init my-strategy' to create one[/]")
        console.print()
        return

    # make a nice table
    table = Table(box=box.ROUNDED, show_header=True)
    table.add_column("Folder", style="cyan", no_wrap=True)
    table.add_column("Name", style="bold")
    table.add_column("Version", style="dim")
    table.add_column("Description", style="")

    for s in strats_found:
        # truncate desc if too long
        desc = s['description']
        if len(desc) > 60:
            desc = desc[:57] + "..."

        table.add_row(
            s['folder'],
            s['name'],
            s['version'],
            desc
        )

    console.print(table)
    console.print()
    console.print(f"[dim]Found {len(strats_found)} strategie(s)[/]")
    console.print()
