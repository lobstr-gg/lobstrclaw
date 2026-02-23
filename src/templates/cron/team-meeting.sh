#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Team Meeting — Periodic team status update
# ═══════════════════════════════════════════════════════════════════
# Gathers domain-specific data for the agent's role (wallet balance,
# active disputes, mod queue, proposals, treasury health) and uses
# LLM to generate a concise status update posted to mod-channel.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/retry.sh 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true
source /opt/scripts/memory-client.sh 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LLM="/opt/scripts/llm.sh"
LOG_PREFIX="[team-meeting]"

echo "${LOG_PREFIX} Team meeting check-in for ${AGENT}..."

# ── Require LLM ────────────────────────────────────────────────────
if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "${LOG_PREFIX} LLM not configured — skipping"
  exit 0
fi

cd "${WORKSPACE}"

# ── Gather domain data ─────────────────────────────────────────────
WALLET=$(retry_cli "lobstr wallet balance" 2>/dev/null || echo "Unable to fetch balance")
STAKE=$(retry_cli "lobstr stake" 2>/dev/null || echo "Unable to fetch stake")
MOD_REPORTS=$(retry_cli "lobstr mod reports" 2>/dev/null || echo "Unable to fetch reports")
DISPUTES=$(retry_cli "lobstr arbitrate disputes" 2>/dev/null || echo "Unable to fetch disputes")
PROPOSALS=$(retry_cli "lobstr dao proposals" 2>/dev/null || echo "Unable to fetch proposals")
TREASURY=$(retry_cli "lobstr dao treasury" 2>/dev/null || echo "Unable to fetch treasury")

DATA="Wallet: ${WALLET}
Stake: ${STAKE}
Mod Reports: ${MOD_REPORTS}
Active Disputes: ${DISPUTES}
Proposals: ${PROPOSALS}
Treasury: ${TREASURY}"

# ── Generate status update via LLM ─────────────────────────────────
MEETING_PROMPT="It's time for the team standup meeting. You are posting your status update.

Current on-chain data from your domain:
${DATA}

Current UTC time: $(date -u +"%Y-%m-%d %H:%M UTC")

Write a concise team meeting status update covering:
1. What's happened since your last update (new reports/disputes/proposals)
2. Current state of your domain (pending items, health status)
3. Any concerns or items needing attention from other agents
4. Your agent wallet gas status

Keep it to 3-5 bullet points max. Be direct, in-character."

UPDATE=$(echo "${MEETING_PROMPT}" | "${LLM}" 2>/dev/null || echo "")

if [ -z "${UPDATE}" ]; then
  echo "${LOG_PREFIX} LLM failed to generate meeting update"
  exit 1
fi

# ── Post to mod-channel ────────────────────────────────────────────
POST_RESULT=$(lobstr channel send mod-channel "${UPDATE}" 2>&1 || echo "FAILED")

if echo "${POST_RESULT}" | grep -qi "fail\|error"; then
  echo "${LOG_PREFIX} Failed to post update: ${POST_RESULT}"
  "${ALERT}" "warning" "${AGENT}" "Team meeting post failed: ${POST_RESULT}"
  exit 1
fi

echo "${LOG_PREFIX} Posted meeting update to mod-channel"
brain_log_action "Posted team meeting update to mod-channel"

cron_mark_success "team-meeting"
echo "${LOG_PREFIX} Meeting check-in complete"
