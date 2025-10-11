"""
xcoin sync - Reconcile local and remote strategy metadata and caches
"""

import json
from pathlib import Path
import click
from rich.console import Console
from rich.panel import Panel

from xcoin_cli.api_client import APIClient, APIError
from xcoin_cli.local_registry import (
    register_or_update_project,
    list_local,
    find_by_name_or_id,
    update_cache,
)

console = Console()


@click.group()
def sync():
    """Synchronize local registry with remote platform."""
    pass


@sync.command()
@click.argument('query', required=False)
def pull(query: str | None):
    """Pull remote metadata/backtest into local cache."""
    client = APIClient()
    if not client.is_authenticated():
        console.print("[red]✗ Not authenticated. Run 'xcoin login' first[/]")
        return

    targets = []
    if query:
        entry = find_by_name_or_id(query)
        if entry:
            targets = [entry]
    else:
        targets = list_local()

    if not targets:
        console.print("[yellow]No local strategies registered. Use 'xcoin local add --path .'[/]")
        return

    for entry in targets:
        remote_id = entry.get('remoteId')
        if not remote_id:
            continue
        try:
            detail = client.get_strategy(remote_id)
        except APIError as e:
            console.print(f"[red]Failed to fetch {remote_id}: {e}[/]")
            continue

        # Fetch latest backtest if available via marketplace route (best effort)
        # Not all APIs are exposed here; skip if unavailable.
        summary = {
            'winRate': detail.get('winRate'),
            'roi': detail.get('roi'),
            'maxDrawdown': detail.get('maxDrawdown'),
            'profitFactor': detail.get('profitFactor'),
            'totalTrades': detail.get('totalTrades'),
        }
        update_cache(remote_id, backtest_summary=summary)
        console.print(f"[green]✓ Pulled summary for {entry.get('name') or entry.get('path')}[/]")


@sync.command()
@click.argument('query', required=False)
def doctor(query: str | None):
    """Show local/remote drift (lightweight)."""
    entries = [find_by_name_or_id(query)] if query else list_local()
    entries = [e for e in entries if e]
    if not entries:
        console.print("[yellow]No local strategies found[/]")
        return
    for e in entries:
        cache = (e.get('cache') or {}).get('backtestSummary')
        note = "OK" if cache else "missing cache"
        console.print(f"- {e.get('name') or e.get('path')}: {note}")


