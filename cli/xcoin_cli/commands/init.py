"""
xcoin init - Initialize a new trading strategy project
"""

import click
import os
import subprocess
from pathlib import Path
from datetime import datetime
from rich.console import Console
from rich.prompt import Prompt, Confirm
from rich.panel import Panel
from rich.text import Text
from rich import print as rprint

from ..templates import get_template, render_template
from ..config import LocalConfig
from .. import __version__

console = Console()


@click.command()
@click.argument('name', required=False)
@click.option('--no-git', is_flag=True, help='Skip git initialization')
@click.option('--non-interactive', is_flag=True, help='Use defaults without prompts')
def init(name, no_git, non_interactive):
    """
    Initialize a new trading strategy project

    \b
    Usage:
        xcoin init my-strategy          # Interactive mode
        xcoin init --non-interactive    # Use all defaults
        xcoin init my-strategy --no-git # Skip git initialization

    \b
    Creates:
        my-strategy/
        ├── strategy.py       # SDK-compliant strategy code
        ├── config.json       # Strategy metadata
        ├── requirements.txt  # Python dependencies
        ├── README.md         # Documentation
        ├── tests/            # Unit tests
        ├── data/             # Sample data
        └── .xcoin/           # Local configuration
    """

    console.print(Panel.fit(
        "[bold cyan]🚀 xcoinalgo Strategy Initializer[/]",
        border_style="cyan"
    ))
    console.print()

    # Get strategy name
    if not name:
        if non_interactive:
            console.print("[red]Error: Strategy name required in non-interactive mode[/]")
            return

        name = Prompt.ask(
            "[cyan]Strategy folder name[/]",
            default="my-strategy"
        )

    # Create folder name (sanitize)
    folder_name = name.lower().replace(' ', '-').replace('_', '-')
    project_dir = Path.cwd() / folder_name

    # Check if directory exists
    if project_dir.exists():
        console.print(f"[red]Error: Directory '{folder_name}' already exists![/]")
        return

    # Gather metadata
    if non_interactive:
        metadata = get_default_metadata(name)
    else:
        metadata = gather_metadata_interactive(name, folder_name)

    # Create project structure
    try:
        console.print(f"\n[cyan]Creating project structure...[/]")
        create_project_structure(project_dir, metadata, no_git)

        console.print()
        console.print(Panel(
            Text.from_markup(
                f"[bold green]✓ Successfully created {folder_name}/[/]\n\n"
                f"[bold]Next steps:[/]\n"
                f"  [cyan]cd {folder_name}[/]\n"
                f"  [cyan]xcoin validate[/]              # Validate strategy\n"
                f"  [cyan]xcoin test --backtest[/]       # Run backtest\n"
                f"  [cyan]xcoin link-git[/]              # Connect to platform\n\n"
                f"[dim]Edit strategy.py to implement your trading logic[/]"
            ),
            title="[bold green]Success![/]",
            border_style="green"
        ))

    except Exception as e:
        console.print(f"[red]Error creating project: {e}[/]")
        # Cleanup on error
        if project_dir.exists():
            import shutil
            shutil.rmtree(project_dir)


def gather_metadata_interactive(name: str, folder_name: str) -> dict:
    """Gather project metadata through interactive prompts"""

    console.print("\n[bold]Strategy Configuration[/]")
    console.print("[dim]Press Enter to use defaults shown in brackets[/]\n")

    # Get git user info for defaults
    git_name = get_git_config('user.name') or 'Unknown'
    git_email = get_git_config('user.email') or 'unknown@example.com'

    metadata = {}

    # Strategy name
    metadata['strategy_name'] = Prompt.ask(
        "[cyan]Strategy display name[/]",
        default=name.replace('-', ' ').title()
    )

    # Description
    metadata['description'] = Prompt.ask(
        "[cyan]Short description[/]",
        default="A trading strategy"
    )

    # Detailed description
    metadata['detailed_description'] = Prompt.ask(
        "[cyan]Detailed description[/]",
        default=metadata['description']
    )

    # Author info
    metadata['author_name'] = Prompt.ask(
        "[cyan]Author name[/]",
        default=git_name
    )

    metadata['author_email'] = Prompt.ask(
        "[cyan]Author email[/]",
        default=git_email
    )

    # Trading pair
    metadata['default_pair'] = Prompt.ask(
        "[cyan]Default trading pair[/]",
        default="B-BTC_USDT",
        show_choices=False
    )

    # Timeframe
    timeframe_options = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
    metadata['default_timeframe'] = Prompt.ask(
        "[cyan]Default timeframe[/]",
        default="15m",
        choices=timeframe_options
    )

    # Convert timeframe to resolution (minutes)
    timeframe_to_minutes = {
        '1m': '1', '5m': '5', '15m': '15', '30m': '30',
        '1h': '60', '4h': '240', '1d': '1440'
    }
    metadata['default_resolution'] = timeframe_to_minutes.get(
        metadata['default_timeframe'], '15'
    )

    # Strategy type
    strategy_types = ['trend-following', 'mean-reversion', 'hybrid', 'arbitrage', 'other']
    metadata['strategy_type'] = Prompt.ask(
        "[cyan]Strategy type[/]",
        default="trend-following",
        choices=strategy_types
    )

    # Additional metadata
    metadata['creation_date'] = datetime.now().strftime('%Y-%m-%d')
    metadata['strategy_code'] = folder_name.upper().replace('-', '_') + '_V1'
    metadata['strategy_class_name'] = ''.join(
        word.capitalize() for word in folder_name.split('-')
    ) + 'Strategy'
    metadata['strategy_folder'] = folder_name
    metadata['xcoin_version'] = __version__
    metadata['github_username'] = get_git_config('github.user') or 'youruser name'

    # SMA parameters (used in template)
    metadata['sma_fast_period'] = 10
    metadata['sma_slow_period'] = 30

    return metadata


def get_default_metadata(name: str) -> dict:
    """Get default metadata without prompts"""
    folder_name = name.lower().replace(' ', '-')
    git_name = get_git_config('user.name') or 'Unknown'
    git_email = get_git_config('user.email') or 'unknown@example.com'

    return {
        'strategy_name': name.replace('-', ' ').title(),
        'description': 'A trading strategy',
        'detailed_description': 'A trading strategy',
        'author_name': git_name,
        'author_email': git_email,
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
        'xcoin_version': __version__,
        'github_username': 'yourusername',
        'sma_fast_period': 10,
        'sma_slow_period': 30,
    }


def create_project_structure(project_dir: Path, metadata: dict, no_git: bool):
    """Create project directory structure with files"""

    # Create main directory
    project_dir.mkdir(parents=True, exist_ok=True)
    console.print(f"  [green]✓[/] Created {project_dir.name}/")

    # Create subdirectories
    (project_dir / 'tests').mkdir(exist_ok=True)
    console.print(f"  [green]✓[/] Created tests/")

    (project_dir / 'data').mkdir(exist_ok=True)
    console.print(f"  [green]✓[/] Created data/")

    (project_dir / '.xcoin').mkdir(exist_ok=True)
    console.print(f"  [green]✓[/] Created .xcoin/")

    # Generate files from templates
    files_to_create = {
        'strategy.py': 'strategy_template.py',
        'config.json': 'config_template.json',
        'requirements.txt': 'requirements_template.txt',
        'README.md': 'readme_template.md',
        '.gitignore': 'gitignore_template',
        'tests/test_strategy.py': 'test_template.py',
    }

    for output_file, template_file in files_to_create.items():
        try:
            template_content = get_template(template_file)
            rendered_content = render_template(template_content, **metadata)

            output_path = project_dir / output_file
            output_path.write_text(rendered_content, encoding='utf-8')

            console.print(f"  [green]✓[/] Created {output_file}")
        except Exception as e:
            console.print(f"  [yellow]⚠[/] Warning: Could not create {output_file}: {e}")

    # Create local config
    local_config = LocalConfig(project_dir)
    local_config.save({
        'strategy_name': metadata['strategy_name'],
        'created_at': metadata['creation_date'],
        'version': '1.0.0'
    })
    console.print(f"  [green]✓[/] Created .xcoin/config.yml")

    # Initialize git repository
    if not no_git:
        try:
            subprocess.run(
                ['git', 'init'],
                cwd=project_dir,
                check=True,
                capture_output=True
            )
            console.print(f"  [green]✓[/] Initialized git repository")

            # Initial commit
            subprocess.run(
                ['git', 'add', '.'],
                cwd=project_dir,
                check=True,
                capture_output=True
            )
            subprocess.run(
                ['git', 'commit', '-m', 'Initial commit: Strategy scaffolding'],
                cwd=project_dir,
                check=True,
                capture_output=True
            )
            console.print(f"  [green]✓[/] Created initial commit")

        except subprocess.CalledProcessError:
            console.print(f"  [yellow]⚠[/] Warning: Could not initialize git repository")
        except FileNotFoundError:
            console.print(f"  [yellow]⚠[/] Warning: git not found, skipping git initialization")

    # Create sample data file
    create_sample_data(project_dir / 'data' / 'sample.csv')
    console.print(f"  [green]✓[/] Created data/sample.csv")


def create_sample_data(file_path: Path):
    """Create sample CSV data for backtesting"""
    import csv

    # Generate 100 sample candles
    base_timestamp = 1633024800000  # October 1, 2021
    base_price = 45000.0

    with open(file_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['timestamp', 'open', 'high', 'low', 'close', 'volume'])

        for i in range(100):
            timestamp = base_timestamp + (i * 900000)  # 15-minute candles
            open_price = base_price + (i % 100)
            high_price = open_price + 50
            low_price = open_price - 50
            close_price = base_price + ((i + 1) % 100)
            volume = 1000 + (i % 200)

            writer.writerow([
                timestamp,
                f"{open_price:.2f}",
                f"{high_price:.2f}",
                f"{low_price:.2f}",
                f"{close_price:.2f}",
                f"{volume:.2f}"
            ])


def get_git_config(key: str) -> str:
    """Get git config value"""
    try:
        result = subprocess.run(
            ['git', 'config', '--get', key],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ''
