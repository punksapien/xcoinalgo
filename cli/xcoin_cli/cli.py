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


# import and register commands (only the essential ones now)
from .commands.init import init
from .commands.login import login
from .commands.validate import validate
from .commands.deploy import deploy
from .commands.list import list as list_cmd
from .commands.remove import remove
from .commands.restore import restore
from .commands.logs import log_cmd
from .commands.backtest import backtest

cli.add_command(init)
cli.add_command(login)
cli.add_command(validate)
cli.add_command(deploy)
cli.add_command(list_cmd, name="list")
cli.add_command(remove)
cli.add_command(restore)
cli.add_command(log_cmd, name='log')
cli.add_command(backtest)


if __name__ == "__main__":
    cli()
