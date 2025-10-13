import click
import time
import json
from pathlib import Path
from ..api_client import APIClient


@click.command()
@click.argument('strategy_folder_or_code', required=True)
@click.option('--watch', is_flag=True, help='Stream status until DONE/FAILED')
def status(strategy_folder_or_code, watch):
    """Show backtest status for a strategy"""
    api = APIClient()

    # Resolve strategy id from folder or code
    strat_dir = Path(strategy_folder_or_code)
    strategy_id = None
    # If it looks like a strategy ID, use it directly
    if len(strategy_folder_or_code) > 20 and strategy_folder_or_code.startswith('c'):
        strategy_id = strategy_folder_or_code
    elif strat_dir.exists() and strat_dir.is_dir():
        # Resolve by code from local config
        try:
            cfg = json.loads((strat_dir / 'config.json').read_text(encoding='utf-8'))
            code = cfg.get('code')
            items = api.list_strategies(show_all=True)
            match = next((s for s in items if s.get('code') == code), None)
            strategy_id = match['id'] if match else None
        except Exception:
            strategy_id = None
    else:
        # Treat as code; search remotely
        try:
            items = api.list_strategies(show_all=True)
            match = next((s for s in items if s.get('code') == strategy_folder_or_code), None)
            strategy_id = match['id'] if match else None
        except Exception:
            strategy_id = None

    if not strategy_id:
        click.echo('✗ could not resolve strategy id')
        return

    def once():
        s = api.get_backtest_status(strategy_id)
        st = s.get('stage', 'IDLE')
        pr = s.get('progress', 0)
        msg = s.get('message', '')
        err = s.get('error', '')
        click.echo(f"{st} {pr}% {('- ' + msg) if msg else ''}{(' | ' + err) if err else ''}")
        return st

    st = once()
    if watch:
        while st not in ('DONE', 'FAILED'):
            time.sleep(2)
            st = once()


