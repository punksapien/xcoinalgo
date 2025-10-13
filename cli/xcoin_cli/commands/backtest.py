import click
import json
from pathlib import Path
from ..api_client import APIClient


@click.command()
@click.argument('strategy_folder', required=True)
def backtest(strategy_folder):
    """Server backtest using uploaded strategy; prints summary"""
    api = APIClient()
    strat_dir = Path(strategy_folder)
    if not strat_dir.exists():
        click.echo('✗ folder not found')
        return
    cfg = json.loads((strat_dir / 'config.json').read_text(encoding='utf-8'))
    code = cfg.get('code')
    strat = api.find_strategy_by_code(code)
    if not strat:
        click.echo('✗ strategy not found on server (deploy first)')
        return
    # For now: fetch latest logs as proxy for backtest trigger/output
    logs = api.get_strategy_logs(strat['id'], '24h')
    click.echo(f"Fetched {len(logs)} log lines")

