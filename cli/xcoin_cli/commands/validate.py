"""
xcoin validate - checks if strategy code is valid
"""

import click
from pathlib import Path
from rich.console import Console
from rich.panel import Panel

from xcoin_cli.validators import StrategyValidator

console = Console()


@click.command()
@click.argument('strategy_name', required=True)
def validate(strategy_name):
    """
    Validate strategy code locally

    Usage:
        xcoin validate my-strategy

    checks:
      - python syntax
      - security issues
      - sdk compliance
      - config.json format
    """
    console.print()
    console.print("[bold cyan]🔍 validating strategy[/]")
    console.print()

    # find strategy folder
    strat_folder = Path.cwd() / strategy_name
    if not strat_folder.exists() or not strat_folder.is_dir():
        console.print(f"[red]✗ strategy folder not found: {strategy_name}[/]")
        console.print(f"[dim]make sure './{strategy_name}/' exists[/]")
        exit(1)

    console.print(f"[dim]checking {strategy_name}/...[/]")
    console.print()

    # run validation
    validator = StrategyValidator()
    results = validator.validate_project(strat_folder)

    # show results for each check
    all_good = True
    for check_name, result in results.items():
        if check_name == 'error':
            # critical error (like file not found)
            console.print(f"[red]✗ critical error:[/]")
            for err in result.errors:
                console.print(f"  • {err}")
            all_good = False
            continue

        # show check name
        check_label = check_name.replace('_', ' ')

        if result.is_valid:
            console.print(f"[green]✓ {check_label}[/]")
            # show info messages if any
            for info in result.info:
                console.print(f"  [dim]{info}[/]")
        else:
            console.print(f"[red]✗ {check_label}[/]")
            all_good = False
            # show errors
            for err in result.errors:
                console.print(f"  [red]• {err}[/]")

        # show warnings
        for warn in result.warnings:
            console.print(f"  [yellow]⚠ {warn}[/]")

        console.print()

    # final verdict
    console.print()
    if all_good:
        console.print(Panel(
            "[bold green]✅ validation passed![/]\n\n"
            "strategy looks good, ready to deploy",
            style="green",
            border_style="green"
        ))
        exit(0)
    else:
        console.print(Panel(
            "[bold red]❌ validation failed[/]\n\n"
            "fix the errors above before deploying",
            style="red",
            border_style="red"
        ))
        exit(1)
