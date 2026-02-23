#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Daily Report — Comprehensive end-of-day summary
# ═══════════════════════════════════════════════════════════════════
# Gathers comprehensive data: wallet balance, actions taken today
# (from brain log), mod queue stats, dispute stats, proposal stats.
# Uses LLM to generate a daily summary and posts to mod-channel.
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
LOG_PREFIX="[daily-report]"
BRAIN_FILE="${WORKSPACE}/BRAIN.md"

echo "${LOG_PREFIX} Generating daily report for ${AGENT}..."

# ── Require LLM ────────────────────────────────────────────────────
if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "${LOG_PREFIX} LLM not configured — skipping"
  exit 0
fi

cd "${WORKSPACE}"

# ── Gather comprehensive data ──────────────────────────────────────
WALLET=$(retry_cli "lobstr wallet balance" 2>/dev/null || echo "Unable to fetch balance")
STAKE=$(retry_cli "lobstr stake" 2>/dev/null || echo "Unable to fetch stake")
MOD_STATS=$(retry_cli "lobstr mod stats" 2>/dev/null || echo "Unable to fetch mod stats")
MOD_REPORTS=$(retry_cli "lobstr mod reports" 2>/dev/null || echo "Unable to fetch reports")
DISPUTES=$(retry_cli "lobstr arbitrate disputes" 2>/dev/null || echo "Unable to fetch disputes")
PROPOSALS=$(retry_cli "lobstr dao proposals" 2>/dev/null || echo "Unable to fetch proposals")
TREASURY=$(retry_cli "lobstr dao treasury" 2>/dev/null || echo "Unable to fetch treasury")

# ── Gather today's actions from brain log ──────────────────────────
TODAYS_ACTIONS=""
if [ -f "${BRAIN_FILE}" ]; then
  TODAY=$(date -u +%Y-%m-%d)
  TODAYS_ACTIONS=$(grep "${TODAY}" "${BRAIN_FILE}" 2>/dev/null | tail -30 || echo "No actions recorded today")
fi

FULL_DATA="Wallet: ${WALLET}
Stake: ${STAKE}
Mod Stats: ${MOD_STATS}
Pending Reports: ${MOD_REPORTS}
Active Disputes: ${DISPUTES}
Proposals: ${PROPOSALS}
Treasury: ${TREASURY}

Actions Taken Today:
${TODAYS_ACTIONS}"

# ── Generate daily report via LLM ──────────────────────────────────
REPORT_PROMPT="Generate your daily end-of-day report. Today is $(date -u +"%A, %B %d, %Y").

Your domain data:
${FULL_DATA}

Write a comprehensive but concise daily report covering:
- Overall protocol health summary
- Key metrics: wallet balance, active disputes, pending proposals, mod queue
- Actions you took today (from the brain log)
- Any concerns or items needing founder attention
- Status assessment: all clear, needs attention, or critical

Keep it professional but in-character. This is the report the founder reads
to understand protocol health. 10-15 lines max."

REPORT=$(echo "${REPORT_PROMPT}" | "${LLM}" 2>/dev/null || echo "")

if [ -z "${REPORT}" ]; then
  echo "${LOG_PREFIX} LLM failed to generate daily report"
  exit 1
fi

# ── Post to mod-channel ────────────────────────────────────────────
POST_RESULT=$(lobstr channel send mod-channel "${REPORT}" 2>&1 || echo "FAILED")

if echo "${POST_RESULT}" | grep -qi "fail\|error"; then
  echo "${LOG_PREFIX} Failed to post report: ${POST_RESULT}"
  "${ALERT}" "warning" "${AGENT}" "Daily report post failed: ${POST_RESULT}"
  exit 1
fi

echo "${LOG_PREFIX} Daily report posted to mod-channel"
brain_log_action "Posted daily report to mod-channel"

cron_mark_success "daily-report"
echo "${LOG_PREFIX} Daily report complete"
