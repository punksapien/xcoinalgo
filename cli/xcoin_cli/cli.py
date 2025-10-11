"""
Main CLI entry point for xcoin-cli
"""

import click
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from . import __version__

console = Console()


@click.group()
@click.version_option(version=__version__, prog_name="xcoin")
@click.pass_context
def cli(ctx):
    """
    🚀 xcoinalgo CLI - Strategy development toolkit for quant teams

    Develop, test, and deploy trading strategies with ease.

    \b
    Quick Start:
      xcoin init my-strategy    # Create new strategy
      xcoin validate            # Validate strategy
      xcoin test --backtest     # Run backtest
      xcoin link-git            # Connect to platform
      xcoin deploy              # Deploy to marketplace

    \b
    Documentation: https://docs.xcoinalgo.com/cli
    """
    ctx.ensure_object(dict)


@cli.command()
def version():
    """Show CLI version information"""
    console.print(
        Panel(
            Text.from_markup(
                f"[bold cyan]xcoin-cli[/] v{__version__}\n\n"
                "Strategy development toolkit for xcoinalgo\n"
                "[dim]https://xcoinalgo.com[/]"
            ),
            title="Version Info",
            border_style="cyan",
        )
    )


# Import and register commands
from .commands.init import init
from .commands.login import login
from .commands.validate import validate
from .commands.test_cmd import test as test_cmd
from .commands.link_git import link_git
from .commands.status import status
from .commands.deploy import deploy
from .commands.logs import logs
from .commands.list import list as list_cmd
from .commands.delete import delete
from .commands.unpublish import unpublish
from .commands.local import local
from .commands.sync import sync

cli.add_command(init)
cli.add_command(login)
cli.add_command(validate)
cli.add_command(test_cmd, name="test")
cli.add_command(link_git)
cli.add_command(status)
cli.add_command(deploy)
cli.add_command(logs)
cli.add_command(list_cmd, name="list")
cli.add_command(delete)
cli.add_command(unpublish)
cli.add_command(local)
cli.add_command(sync)


if __name__ == "__main__":
    cli()
