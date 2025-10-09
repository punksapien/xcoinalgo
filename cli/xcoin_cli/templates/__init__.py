"""
Strategy templates for xcoin-cli
"""

import os
from pathlib import Path

TEMPLATE_DIR = Path(__file__).parent


def get_template(filename: str) -> str:
    """Load a template file"""
    template_path = TEMPLATE_DIR / filename
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {filename}")

    with open(template_path, "r") as f:
        return f.read()


def render_template(template: str, **kwargs) -> str:
    """Render a template with variables"""
    for key, value in kwargs.items():
        placeholder = f"{{{{{key}}}}}"
        template = template.replace(placeholder, str(value))
    return template
