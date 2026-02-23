#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Moltbook Heartbeat — Social engagement on Moltbook
# ═══════════════════════════════════════════════════════════════════
# Light integration with Moltbook social network for AI agents.
# Checks if Moltbook is configured and available, then uses LLM to
# decide engagement actions (browse, post, comment, upvote).
# Optional — gracefully exits if Moltbook is not configured.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true
source /opt/scripts/memory-client.sh 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LLM="/opt/scripts/llm.sh"
LOG_PREFIX="[moltbook]"
API="https://www.moltbook.com/api/v1"

echo "${LOG_PREFIX} Moltbook heartbeat for ${AGENT}..."

# ── Pause gate: skip if commenting is paused ───────────────────────
MOLTBOOK_PAUSE_UNTIL="${MOLTBOOK_PAUSE_UNTIL:-}"
if [ -n "${MOLTBOOK_PAUSE_UNTIL}" ]; then
  PAUSE_TS=$(date -d "${MOLTBOOK_PAUSE_UNTIL}" +%s 2>/dev/null || date -jf "%Y-%m-%d" "${MOLTBOOK_PAUSE_UNTIL}" +%s 2>/dev/null || echo "0")
  NOW_TS=$(date +%s)
  if [ "${NOW_TS}" -lt "${PAUSE_TS}" ]; then
    echo "${LOG_PREFIX} Moltbook paused until ${MOLTBOOK_PAUSE_UNTIL} — skipping"
    cron_mark_success "moltbook"
    exit 0
  fi
fi

# ── Require Moltbook API key ───────────────────────────────────────
MOLTBOOK_KEY="${MOLTBOOK_API_KEY:-}"
if [ -z "${MOLTBOOK_KEY}" ]; then
  echo "${LOG_PREFIX} No MOLTBOOK_API_KEY configured — skipping"
  cron_mark_success "moltbook"
  exit 0
fi

# ── Require LLM ────────────────────────────────────────────────────
if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "${LOG_PREFIX} No LLM configured — skipping"
  cron_mark_success "moltbook"
  exit 0
fi

# ── Check account status ───────────────────────────────────────────
STATUS=$(curl -s -H "Authorization: Bearer ${MOLTBOOK_KEY}" \
  "${API}/agents/status" 2>/dev/null || echo "{}")

CLAIM_STATUS=$(echo "${STATUS}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

if [ "${CLAIM_STATUS}" = "suspended" ]; then
  echo "${LOG_PREFIX} Account SUSPENDED — check Moltbook dashboard"
  "${ALERT}" "warning" "${AGENT}" "Moltbook account suspended"
  exit 0
fi

if [ "${CLAIM_STATUS}" != "claimed" ]; then
  echo "${LOG_PREFIX} Account not claimed (status: ${CLAIM_STATUS}) — skipping"
  cron_mark_success "moltbook"
  exit 0
fi

echo "${LOG_PREFIX} Account active — Moltbook integration available"
brain_log_action "Moltbook heartbeat: account active (status: ${CLAIM_STATUS})"

cron_mark_success "moltbook"
echo "${LOG_PREFIX} Moltbook heartbeat complete"
