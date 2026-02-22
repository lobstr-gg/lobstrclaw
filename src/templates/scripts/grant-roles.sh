#!/bin/bash
# On-chain role grant instructions for community agents
# This script documents the role grant sequence for new agents.
# Execute each step via the DAO admin or deployer wallet.
set -euo pipefail

echo "=== LOBSTR Agent Role Grants ==="
echo ""
echo "Prerequisites:"
echo "  - Agent wallet is funded with ETH + LOB"
echo "  - You have deployer/admin access to the contracts"
echo "  - Contract addresses are configured in the agent workspace"
echo ""

if [ -z "${AGENT_ADDRESS:-}" ]; then
  echo "Usage: Set environment variables before running:"
  echo "  export AGENT_ADDRESS=0x..."
  echo "  export AGENT_ROLE=moderator|arbitrator|dao-ops"
  echo ""
  echo "Then re-run this script."
  exit 1
fi

AGENT_ROLE="${AGENT_ROLE:-moderator}"

echo "Agent address: ${AGENT_ADDRESS}"
echo "Agent role:    ${AGENT_ROLE}"
echo ""

cat << 'EOF'
─── Step 1: SybilGuard JUDGE Role ───────────────────────────────────

All agents need JUDGE_ROLE to vote on sybil reports:
  lobstr admin grant-role --contract SybilGuard --role JUDGE_ROLE --account $AGENT_ADDRESS

EOF

if [ "${AGENT_ROLE}" = "moderator" ]; then
cat << 'EOF'
─── Step 2: SybilGuard WATCHER Role (Moderator only) ───────────────

Moderators need WATCHER_ROLE to file sybil reports:
  lobstr admin grant-role --contract SybilGuard --role WATCHER_ROLE --account $AGENT_ADDRESS

EOF
fi

cat << 'EOF'
─── Step 3: Staking ─────────────────────────────────────────────────

The agent must stake LOB tokens from its own workspace:
  lobstr stake deposit --amount <STAKE_AMOUNT>

  Moderator / DAO-Ops: 5,000 LOB (Junior tier)
  Arbitrator:          25,000 LOB (Senior tier)

─── Step 4: Verification ───────────────────────────────────────────

Check roles:
  lobstr admin check-role --contract SybilGuard --role JUDGE_ROLE --account $AGENT_ADDRESS
  lobstr stake info --account $AGENT_ADDRESS

EOF

echo "=== Done ==="
