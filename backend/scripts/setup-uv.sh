#!/bin/bash
# Auto-install uv (Python package manager) if not present
# This script is idempotent and safe to run multiple times

set -e  # Exit on error

echo "🔍 Checking for uv installation..."

# Check if uv is already installed
if command -v uv &> /dev/null; then
    echo "✓ uv already installed: $(uv --version)"
    exit 0
fi

echo "📦 uv not found. Installing uv (fast Python package manager)..."

# Install uv using official installer (works on Linux/macOS)
# This installs to ~/.cargo/bin/uv
if curl -LsSf https://astral.sh/uv/install.sh | sh; then
    echo "✓ uv installation completed"
else
    echo "⚠️  uv installation failed. Will fall back to pip/venv."
    exit 1
fi

# Add to PATH for current session
export PATH="$HOME/.cargo/bin:$PATH"

# Verify installation
if command -v uv &> /dev/null; then
    echo "✅ uv installed successfully: $(uv --version)"
    echo "📍 Location: $(which uv)"
else
    echo "⚠️  uv command not found after installation. Check PATH configuration."
    exit 1
fi

echo ""
echo "ℹ️  Note: uv is now installed in ~/.cargo/bin/"
echo "ℹ️  Add 'export PATH=\"\$HOME/.cargo/bin:\$PATH\"' to your ~/.bashrc or ~/.profile for persistence"


