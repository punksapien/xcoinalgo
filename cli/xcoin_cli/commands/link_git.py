"""
xcoin link-git - Link strategy to GitHub repository
"""

import click
import subprocess
import json
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.prompt import Confirm
from rich.markdown import Markdown
from rich import box

from xcoin_cli.api_client import APIClient, APIError
from xcoin_cli.config import ConfigManager

console = Console()


@click.command()
@click.option('--repo', help='Git repository URL (auto-detected if not provided)')
@click.option('--branch', default='main', help='Branch name (default: main)')
@click.option('--auto-deploy', is_flag=True, help='Auto-deploy on git push')
def link_git(repo, branch, auto_deploy):
    """
    Link strategy to Git repository for auto-sync

    \b
    Usage:
        xcoin link-git                                  # Auto-detect from .git
        xcoin link-git --repo https://github.com/...    # Specify repo URL
        xcoin link-git --auto-deploy                    # Enable auto-deploy

    \b
    This will:
        1. Link your strategy to a Git repository
        2. Provide webhook URL for GitHub/GitLab
        3. Auto-sync code on every push
        4. Optionally auto-deploy validated strategies
    """
    console.print()
    console.print(Panel.fit(
        "🔗 Link Git Repository",
        style="bold cyan",
        border_style="cyan"
    ))
    console.print()

    # Check if we're in a strategy project
    current_dir = Path.cwd()
    config_file = current_dir / 'config.json'
    local_config_file = current_dir / '.xcoin' / 'config.yml'

    if not config_file.exists():
        console.print("[red]✗ Not in a strategy project directory[/]")
        console.print("[dim]Run this command from your strategy root directory[/]")
        exit(1)

    # Load strategy config
    try:
        with open(config_file, 'r') as f:
            strategy_config = json.load(f)
    except Exception as e:
        console.print(f"[red]✗ Failed to read config.json: {e}[/]")
        exit(1)

    # Auto-detect git repository if not provided
    if not repo:
        repo = _get_git_remote_url()
        if not repo:
            console.print("[red]✗ Could not detect git repository[/]")
            console.print("[dim]Initialize git first or provide --repo option[/]")
            exit(1)
        console.print(f"[dim]Detected repository: {repo}[/]")

    # Check authentication
    client = APIClient()
    if not client.is_authenticated():
        console.print("[red]✗ Not authenticated. Please run 'xcoin login' first[/]")
        exit(1)

    # Load local config
    local_config = ConfigManager(local_config_file)
    strategy_id = local_config.get('strategy_id')

    # Create strategy if needed
    if not strategy_id:
        console.print()
        console.print("[yellow]Strategy not yet created on platform[/]")
        create = Confirm.ask("Create it now?", default=True)

        if not create:
            console.print("[dim]Cancelled[/]")
            exit(0)

        console.print()
        with console.status("[cyan]Creating strategy on platform...[/]"):
            try:
                result = client.create_strategy(strategy_config)
                strategy_id = result.get('strategy', {}).get('_id')

                if not strategy_id:
                    console.print("[red]✗ Failed to create strategy[/]")
                    exit(1)

                # Save strategy ID to local config
                local_config.set('strategy_id', strategy_id)
                local_config.save()

                console.print(f"[green]✓ Strategy created: {strategy_id}[/]")

            except APIError as e:
                console.print()
                console.print(f"[red]✗ Failed to create strategy: {e}[/]")
                exit(1)

    # Link Git repository
    console.print()
    with console.status("[cyan]Linking Git repository...[/]"):
        try:
            result = client.link_git_repository(
                strategy_id=strategy_id,
                repo_url=repo,
                branch=branch,
                auto_deploy=auto_deploy
            )

        except APIError as e:
            console.print()
            console.print(f"[red]✗ Failed to link repository: {e}[/]")
            exit(1)

    # Display success with webhook setup instructions
    console.print()
    webhook_url = result.get('webhookUrl', '')
    webhook_secret = result.get('webhookSecret', '')

    # Create info table
    table = Table(
        show_header=False,
        box=box.SIMPLE,
        padding=(0, 2)
    )
    table.add_column("Field", style="dim")
    table.add_column("Value", style="bold")

    table.add_row("Repository", repo)
    table.add_row("Branch", branch)
    table.add_row("Auto-deploy", "Enabled" if auto_deploy else "Disabled")
    table.add_row("Strategy ID", strategy_id)

    console.print(Panel(
        table,
        title="[green]✓ Git Repository Linked[/]",
        border_style="green",
        padding=(1, 2)
    ))

    # Webhook setup instructions
    console.print()
    console.print(Panel.fit(
        "[bold]🪝 Webhook Setup Required[/]",
        style="yellow",
        border_style="yellow"
    ))
    console.print()

    setup_md = f"""
## GitHub Setup

1. Go to your repository settings: `Settings > Webhooks > Add webhook`
2. Enter the following details:

   **Payload URL:** `{webhook_url}`

   **Content type:** `application/json`

   **Secret:** `{webhook_secret}`

   **Events:** Select "Just the push event"

3. Click "Add webhook"

## GitLab Setup

1. Go to your repository: `Settings > Webhooks`
2. Enter the webhook URL and secret above
3. Check "Push events"
4. Click "Add webhook"

## Verification

Push a commit to test:
```bash
git push origin {branch}
```

Your strategy will be automatically synced and validated!
    """

    console.print(Markdown(setup_md))

    # Save webhook info to local config
    local_config.set('git', {
        'repository': repo,
        'branch': branch,
        'webhookUrl': webhook_url,
        'webhookSecret': webhook_secret,
        'autoDeploy': auto_deploy
    })
    local_config.save()

    console.print()
    console.print("[bold]Next steps:[/]")
    console.print("  1. Set up the webhook in GitHub/GitLab (instructions above)")
    console.print("  2. Push your code: [cyan]git push[/]")
    console.print(f"  3. Check status: [cyan]xcoin status[/]")
    console.print()


def _get_git_remote_url() -> str:
    """Get git remote URL from current directory"""
    try:
        result = subprocess.run(
            ['git', 'remote', 'get-url', 'origin'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ''
