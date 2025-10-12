"""
xcoin init - creates a new strategy folder
"""

import click
import json
from pathlib import Path
from datetime import datetime
from rich.console import Console
from rich.panel import Panel

from ..templates import get_template, render_template

console = Console()


@click.command()
@click.argument('name', required=True)
def init(name):
    """
    Create a new strategy folder

    Usage:
        xcoin init my-strategy

    creates:
      my-strategy/
      ├── strategy.py       (your strategy code)
      ├── config.json       (config)
      ├── requirements.txt  (deps)
      └── README.md         (docs)
    """
    console.print()
    console.print("[bold cyan]🚀 creating strategy[/]")
    console.print()

    # sanitize folder name
    folder_name = name.lower().replace(' ', '-').replace('_', '-')
    strat_dir = Path.cwd() / folder_name

    # check if already exists
    if strat_dir.exists():
        console.print(f"[red]✗ folder '{folder_name}' already exists[/]")
        exit(1)

    # prepare metadata for templates
    meta = {
        'strategy_name': name.replace('-', ' ').title(),
        'description': 'A trading strategy',
        'detailed_description': 'A trading strategy',  # TODO: let user customize later
        'author_name': 'Developer',  # todo: get from git config
        'author_email': 'dev@example.com',
        'default_pair': 'B-BTC_USDT',
        'default_timeframe': '15m',
        'default_resolution': '15',
        'strategy_type': 'trend-following',
        'creation_date': datetime.now().strftime('%Y-%m-%d'),
        'strategy_code': folder_name.upper().replace('-', '_') + '_V1',
        'strategy_class_name': ''.join(
            word.capitalize() for word in folder_name.split('-')
        ) + 'Strategy',
        'strategy_folder': folder_name,
        'xcoin_version': '0.1.0',
        'sma_fast_period': 10,
        'sma_slow_period': 30,
    }

    console.print(f"[dim]creating {folder_name}/...[/]")

    # create folders
    try:
        strat_dir.mkdir(parents=True, exist_ok=True)
        console.print(f"  [green]✓[/] {folder_name}/")

        # create files from templates
        files_to_make = {
            'strategy.py': 'strategy_template.py',
            'config.json': 'config_template.json',
            'requirements.txt': 'requirements_template.txt',
            'README.md': 'readme_template.md',
        }

        for output_fname, template_fname in files_to_make.items():
            try:
                template_txt = get_template(template_fname)
                rendered_txt = render_template(template_txt, **meta)

                output_path = strat_dir / output_fname
                output_path.write_text(rendered_txt, encoding='utf-8')

                console.print(f"  [green]✓[/] {output_fname}")
            except Exception as e:
                # couldnt create file, probly missing template
                console.print(f"  [yellow]⚠[/] warning: couldnt create {output_fname} ({e})")

        console.print()
        console.print(Panel(
            f"[bold green]✓ created {folder_name}/[/]\n\n"
            f"[bold]next steps:[/]\n"
            f"  cd {folder_name}\n"
            f"  (edit strategy.py)\n"
            f"  xcoin validate {folder_name}\n"
            f"  xcoin deploy {folder_name}",
            style="green",
            border_style="green"
        ))

    except Exception as e:
        console.print(f"[red]✗ error: {e}[/]")
        # cleanup if failed
        if strat_dir.exists():
            import shutil
            shutil.rmtree(strat_dir)
        exit(1)

    console.print()
