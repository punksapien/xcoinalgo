import click
import time
from pathlib import Path
from ..api_client import APIClient


@click.command(name='log')
@click.argument('strategy_folder_or_code', required=True)
@click.option('--follow', is_flag=True, help='Stream logs continuously')
@click.option('--since', default='1h', help='How far back to fetch (e.g., 30m, 1h, 24h)')
def log_cmd(strategy_folder_or_code, follow, since):
    """Fetch backend logs for a strategy and append to strategy/logs.txt"""
    api = APIClient()

    # Resolve strategy id by folder or code
    strategy_dir = Path(strategy_folder_or_code)
    strategy_id = None
    if strategy_dir.exists() and strategy_dir.is_dir():
        # read config.json
        cfg = (strategy_dir / 'config.json').read_text(encoding='utf-8')
        import json
        code = json.loads(cfg).get('code')
        strat = api.find_strategy_by_code(code)
        strategy_id = strat['id'] if strat else None
        log_path = strategy_dir / 'logs.txt'
    else:
        strat = api.find_strategy_by_code(strategy_folder_or_code)
        strategy_id = strat['id'] if strat else None
        log_path = Path.cwd() / f"{strategy_folder_or_code}_logs.txt"

    if not strategy_id:
        click.echo('✗ could not resolve strategy id')
        return

    click.echo(f"Fetching logs for strategy {strategy_id} (since={since})")

    def fetch_once():
        logs = api.get_strategy_logs(strategy_id, since)
        lines = [
            f"{row['executedAt']} {row['status']} subs={row['subscribersCount']} trades={row['tradesGenerated']} dur={row['duration']}s err={row.get('error') or ''}"
            for row in logs
        ]
        with open(log_path, 'a', encoding='utf-8') as f:
            for ln in lines:
                f.write(ln + '\n')
        for ln in lines:
            click.echo(ln)

    fetch_once()
    if follow:
        while True:
            time.sleep(5)
            fetch_once()

