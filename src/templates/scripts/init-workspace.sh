#!/bin/bash
# Initialize an OpenClaw workspace + wallet locally
# Run this on your LOCAL machine before deploying to VPS
# Usage: bash init-workspace.sh <agent_name> [output_dir]
set -euo pipefail

AGENT_NAME="${1:-}"
OUTPUT_DIR="${2:-./agent-workspaces}"

if [ -z "${AGENT_NAME}" ]; then
  echo "Usage: bash init-workspace.sh <agent_name> [output_dir]"
  exit 1
fi

echo "=== LOBSTR Agent Workspace Initializer ==="
echo "Agent: ${AGENT_NAME}"
echo "Output: ${OUTPUT_DIR}"
echo ""

AGENT_DIR="${OUTPUT_DIR}/${AGENT_NAME}"

echo "──────────────────────────────────────"
echo "Creating workspace for: ${AGENT_NAME}"
echo "──────────────────────────────────────"

mkdir -p "${AGENT_DIR}"

# Create workspace via OpenClaw CLI
echo "Initializing OpenClaw workspace..."
(cd "${AGENT_DIR}" && npx lobstr init --name "${AGENT_NAME}")

echo ""
echo "[${AGENT_NAME}] Workspace created at: ${AGENT_DIR}"

# Extract wallet address if wallet.json exists
if [ -f "${AGENT_DIR}/wallet.json" ]; then
  ADDRESS=$(jq -r '.address // "unknown"' "${AGENT_DIR}/wallet.json" 2>/dev/null || echo "unknown")
  echo "[${AGENT_NAME}] Wallet address: ${ADDRESS}"
fi

echo ""
echo "=== Workspace Created ==="
echo ""
echo "Required funding:"
echo "  - 0.05 ETH (gas)"
echo "  - LOB tokens (for staking — amount depends on role)"
echo ""
echo "Next steps:"
echo "  1. Fund the wallet address above"
echo "  2. Copy workspace dir to VPS at /opt/lobstr/data/"
echo "  3. Store wallet password in /opt/lobstr/secrets/wallet_password on VPS"
