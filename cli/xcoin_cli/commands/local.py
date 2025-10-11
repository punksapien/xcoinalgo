"""
xcoin local - Manage local strategy registry
"""

from pathlib import Path
import click
from rich.console import Console
from rich.table import Table
from rich import box

from xcoin_cli.local_registry import (
    register_or_update_project,
    list_local,
    remove_project,
    find_by_name_or_id,
)

console = Console()


@click.group()
def local():
    """Local strategy registry commands."""
    pass


@local.command()
@click.option('--path', type=click.Path(path_type=Path), default=Path.cwd(), help='Strategy folder path')
def add(path: Path):
    """Register current project into local registry."""
    entry = register_or_update_project(path=path)
    console.print(f"[green]✓ Registered:[/] {entry.get('path')}")


@local.command()
def list():
    """List local registry entries."""
    items = list_local()
    if not items:
        console.print("[yellow]No local strategies recorded[/]")
        return
    table = Table(show_header=True, header_style="bold cyan", box=box.ROUNDED)
    table.add_column("Name")
    table.add_column("Path", style="dim")
    table.add_column("RemoteId", style="dim")
    table.add_column("Version", justify="center")
    table.add_column("Updated", style="dim")
    for it in items:
        table.add_row(
            it.get('name') or Path(it.get('path','')).name,
            it.get('path',''),
            it.get('remoteId') or '—',
            it.get('version') or '—',
            it.get('updatedAt') or '—',
        )
    console.print(table)


@local.command()
@click.argument('query')
def rm(query: str):
    """Remove a local entry by path/name/id."""
    entry = find_by_name_or_id(query)
    removed = False
    if entry:
        removed = remove_project(entry.get('localId') or entry.get('path') or query)
    else:
        removed = remove_project(query)
    if removed:
        console.print("[green]✓ Removed local entry[/]")
    else:
        console.print("[yellow]No matching local entry[/]")


@local.command()
@click.argument('query')
def info(query: str):
    """Show local entry details."""
    entry = find_by_name_or_id(query)
    if not entry:
        console.print("[yellow]Not found[/]")
        return
    from rich.panel import Panel
    import json
    console.print(Panel.fit(json.dumps(entry, indent=2)))


