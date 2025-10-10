"""
xcoin validate - Validate strategy locally
"""

import click
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich import box

from xcoin_cli.validators import StrategyValidator, ValidationResult

console = Console()


@click.command()
@click.argument('strategy_name', required=False)
@click.option('--path', type=click.Path(exists=True),
              help='Path to strategy project (deprecated, use positional argument)')
@click.option('--strict', is_flag=True, help='Treat warnings as errors')
def validate(strategy_name, path, strict):
    """
    Validate strategy code and configuration locally

    \b
    Usage (context-aware - in strategy directory):
        xcoin validate              # Validate current directory
        xcoin validate --strict     # Warnings become errors

    \b
    Usage (explicit naming - from anywhere):
        xcoin validate my-strategy
        xcoin validate my-strategy --strict

    \b
    Checks:
        - Python syntax
        - SDK compliance
        - Security scan
        - Configuration validity
    """
    console.print()
    console.print(Panel.fit(
        "🔍 Strategy Validator",
        style="bold cyan",
        border_style="cyan"
    ))
    console.print()

    # Determine strategy directory
    if strategy_name:
        # Explicit naming mode
        strategy_dir = Path.cwd() / strategy_name
        if not strategy_dir.exists() or not strategy_dir.is_dir():
            console.print(f"[red]✗ Strategy directory not found: {strategy_name}[/]")
            console.print("[dim]Make sure the directory exists in the current path[/]")
            exit(1)
        project_path = strategy_dir
        console.print(f"[dim]Validating strategy from: {strategy_dir}[/]")
        console.print()
    elif path:
        # Backward compatibility: --path option
        project_path = Path(path).resolve()
    else:
        # Context-aware mode: current directory
        project_path = Path.cwd().resolve()

    # Run validation with progress indicator
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
        transient=True
    ) as progress:
        task = progress.add_task("Running validation checks...", total=None)

        validator = StrategyValidator()
        results = validator.validate_project(project_path)

        progress.update(task, completed=True)

    # Display results
    console.print()
    _display_results(results, strict)
    console.print()

    # Determine overall status
    is_valid = validator.is_valid(results)

    if strict:
        # Check for warnings
        has_warnings = any(
            len(result.warnings) > 0
            for result in results.values()
        )
        if has_warnings:
            is_valid = False

    # Print summary
    if is_valid:
        console.print(Panel(
            "✅ [bold green]Validation passed![/]\n\n"
            "Your strategy is ready for deployment.",
            style="green",
            border_style="green",
            title="Success"
        ))
        exit(0)
    else:
        console.print(Panel(
            "❌ [bold red]Validation failed![/]\n\n"
            "Please fix the errors above before deploying.",
            style="red",
            border_style="red",
            title="Failed"
        ))
        exit(1)


def _display_results(results: dict, strict: bool):
    """Display validation results in a formatted table"""

    for check_name, result in results.items():
        if check_name == 'error':
            # Critical error
            console.print(f"[bold red]✗ Critical Error[/]")
            for error in result.errors:
                console.print(f"  [red]• {error}[/]")
            continue

        # Create table for this check
        table = Table(
            show_header=True,
            header_style="bold",
            box=box.ROUNDED,
            border_style="dim"
        )

        table.add_column("Type", style="bold", width=12)
        table.add_column("Message", style="")

        # Add errors
        for error in result.errors:
            table.add_row("[red]ERROR[/]", f"[red]{error}[/]")

        # Add warnings
        for warning in result.warnings:
            if strict:
                table.add_row("[red]WARNING[/]", f"[red]{warning}[/]")
            else:
                table.add_row("[yellow]WARNING[/]", f"[yellow]{warning}[/]")

        # Add info
        for info in result.info:
            table.add_row("[green]INFO[/]", f"[dim]{info}[/]")

        # Determine status icon
        if result.is_valid:
            if result.warnings:
                status = "[yellow]⚠[/]"
                style = "yellow"
            else:
                status = "[green]✓[/]"
                style = "green"
        else:
            status = "[red]✗[/]"
            style = "red"

        # Format check name
        check_title = check_name.replace('_', ' ').title()

        # Print section
        console.print(Panel(
            table,
            title=f"{status} {check_title}",
            border_style=style,
            padding=(0, 1)
        ))
        console.print()
