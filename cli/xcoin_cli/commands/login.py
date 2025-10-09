"""
xcoin login - Authenticate with xcoinalgo platform
"""

import click
from rich.console import Console
from rich.prompt import Prompt
from rich.panel import Panel
from rich.table import Table
from rich import box

from xcoin_cli.api_client import APIClient, APIError

console = Console()


@click.command()
@click.option('--api-key', help='API key (or will prompt)')
@click.option('--api-url', default='http://localhost:3000', help='API URL')
def login(api_key, api_url):
    """
    Authenticate with the xcoinalgo platform

    \b
    Usage:
        xcoin login                    # Interactive prompt
        xcoin login --api-key KEY      # Provide key directly
        xcoin login --api-url http://custom-url.com  # Custom API URL

    \b
    Get your API key from:
        https://xcoinalgo.com/settings/api-keys
    """
    console.print()
    console.print(Panel.fit(
        "🔐 xcoinalgo Login",
        style="bold cyan",
        border_style="cyan"
    ))
    console.print()

    # Prompt for API key if not provided
    if not api_key:
        console.print("[dim]Get your API key from: https://xcoinalgo.com/settings/api-keys[/]")
        console.print()
        api_key = Prompt.ask(
            "[cyan]Enter your API key[/]",
            password=True
        )

    if not api_key:
        console.print("[red]✗ API key is required[/]")
        exit(1)

    # Attempt authentication
    console.print()
    with console.status("[cyan]Authenticating...[/]"):
        try:
            client = APIClient(api_url=api_url)
            user_info = client.login(api_key)

        except APIError as e:
            console.print()
            console.print(Panel(
                f"[red]✗ Authentication failed[/]\n\n{e}",
                style="red",
                border_style="red",
                title="Error"
            ))
            exit(1)

    # Display success
    console.print()
    user = user_info.get('user', {})

    # Create user info table
    table = Table(
        show_header=False,
        box=box.SIMPLE,
        padding=(0, 2)
    )
    table.add_column("Field", style="dim")
    table.add_column("Value", style="bold")

    table.add_row("Email", user.get('email', 'N/A'))
    table.add_row("Role", user.get('role', 'N/A'))

    if user.get('team'):
        table.add_row("Team", user['team'])

    console.print(Panel(
        table,
        title="[green]✓ Authentication Successful[/]",
        border_style="green",
        padding=(1, 2)
    ))

    console.print()
    console.print("[dim]Your API key has been securely stored in ~/.xcoin/config.yml[/]")
    console.print()
    console.print("[bold]Next steps:[/]")
    console.print("  [cyan]xcoin init my-strategy[/]     # Create a new strategy")
    console.print("  [cyan]xcoin status[/]               # View your strategies")
    console.print()
