#!/usr/bin/env bash
set -e

# Setup script for Apple MLX provisioning
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
MEM_CORE_DIR="$(dirname "$SCRIPT_DIR")"
VENV_PATH="$MEM_CORE_DIR/.venv"

echo "Provisioning MLX Python Virtual Environment..."

if [ ! -d "$VENV_PATH" ]; then
    echo "Creating virtual environment at $VENV_PATH"
    python3 -m venv "$VENV_PATH"
fi

echo "Activating virtual environment..."
source "$VENV_PATH/bin/activate"

echo "Installing requirements (mlx-lm, huggingface_hub)..."
pip install --upgrade pip
pip install mlx-lm huggingface_hub

echo "=========================================================="
echo "✅ Setup complete. The environment is provisioned at:"
echo "   $VENV_PATH"
echo "=========================================================="
echo "If auto-booting is disabled or fails, you can run the daemon manually:"
echo "  source $VENV_PATH/bin/activate"
echo "  python -m mlx_lm.server --model <repo_id> --port 11435"
