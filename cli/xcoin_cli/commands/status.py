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
    if strat_dir.exists() and strat_dir.is_dir():
        cfg = json.loads((strat_dir / 'config.json').read_text(encoding='utf-8'))
        code = cfg.get('code')
        strat = api.find_strategy_by_code(code)
        strategy_id = strat['id'] if strat else None
    else:
        strat = api.find_strategy_by_code(strategy_folder_or_code)
        strategy_id = strat['id'] if strat else None

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


