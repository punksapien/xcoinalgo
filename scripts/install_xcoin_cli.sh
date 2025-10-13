#!/usr/bin/env bash
set -euo pipefail

# xcoin CLI installer (uv-based, isolated)
# Idempotent: safe to re-run.

echo "[xcoin-installer] starting"

# Resolve repo root (works when run from anywhere inside repo)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "${REPO_ROOT}" || ! -d "${REPO_ROOT}" ]]; then
  # fallback to script dir/.. if git metadata missing
  SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
  REPO_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
fi

CLI_PATH="${REPO_ROOT}/cli"
if [[ ! -f "${CLI_PATH}/pyproject.toml" ]]; then
  echo "[xcoin-installer] ERROR: could not find CLI at ${CLI_PATH}" >&2
  exit 1
fi

# Ensure ~/.local/bin exists and is on PATH (used for the shim)
mkdir -p "${HOME}/.local/bin"
case ":${PATH}:" in
  *:"${HOME}/.local/bin":*) ;; # already present
  *) echo "[xcoin-installer] NOTICE: add to your shell rc: export PATH=\"$HOME/.local/bin:$PATH\"" ;;
esac

# Install uv if missing
if ! command -v uv >/dev/null 2>&1; then
  echo "[xcoin-installer] installing uv"
  curl -fsSL https://astral.sh/uv/install.sh | sh
  # add cargo/bin and ~/.local/bin to PATH for current session if available
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

# Create isolated venv for xcoin
VENV_DIR="${HOME}/.xcoin-cli/venv"
mkdir -p "$(dirname "${VENV_DIR}")"
if [[ ! -d "${VENV_DIR}" ]]; then
  echo "[xcoin-installer] creating venv at ${VENV_DIR}"
  uv venv "${VENV_DIR}"
fi

PY="${VENV_DIR}/bin/python"
PIP="${VENV_DIR}/bin/pip"

"${PY}" -m pip install -U pip setuptools wheel >/dev/null

echo "[xcoin-installer] installing xcoin CLI (editable) from ${CLI_PATH}"
uv pip install --python "${PY}" -e "${CLI_PATH}"

# Create shim so `xcoin` is on PATH without activating venv
SHIM="${HOME}/.local/bin/xcoin"
cat > "${SHIM}" <<'EOF'
#!/usr/bin/env bash
exec "$HOME/.xcoin-cli/venv/bin/xcoin" "$@"
EOF
chmod +x "${SHIM}"

echo "[xcoin-installer] installed: $("${HOME}/.xcoin-cli/venv/bin/xcoin" --version || true)"
echo "[xcoin-installer] binary shim: ${SHIM}"
echo "[xcoin-installer] done"


