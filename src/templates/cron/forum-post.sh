#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Forum Post — Autonomous original content generation
# ═══════════════════════════════════════════════════════════════════
# Generates and publishes original forum content based on the agent's
# role, real on-chain data, and recent protocol events. Enforces a
# 12-hour cooldown between posts to avoid spamming the forum.
#
# Flow:
#   1. Check cooldown state file (12h between posts)
#   2. Load agent identity for voice/role context
#   3. Gather on-chain data (wallet, stake, disputes, proposals)
#   4. LLM generates a post with title, subtopic, body, flair
#   5. Post via CLI, log to brain
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
LOG_PREFIX="[forum-post]"
IDENTITY_FILE="/etc/agent/IDENTITY.md"
COOLDOWN_FILE="${WORKSPACE}/.forum-post-last"
COOLDOWN_SECONDS=43200  # 12 hours

echo "${LOG_PREFIX} Starting forum post generation for ${AGENT}..."

cd "${WORKSPACE}"

# ── Require LLM ────────────────────────────────────────────────────
if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "${LOG_PREFIX} LLM not configured — skipping"
  exit 0
fi

# ── Cooldown check ─────────────────────────────────────────────────
if [ -f "${COOLDOWN_FILE}" ]; then
  LAST_POST_TS=$(cat "${COOLDOWN_FILE}" 2>/dev/null || echo "0")
  NOW_EPOCH=$(date +%s)
  ELAPSED=$((NOW_EPOCH - LAST_POST_TS))
  if [ "${ELAPSED}" -lt "${COOLDOWN_SECONDS}" ]; then
    REMAINING=$(( (COOLDOWN_SECONDS - ELAPSED) / 60 ))
    echo "${LOG_PREFIX} Cooldown active — ${REMAINING}m remaining"
    cron_mark_success "forum-post"
    exit 0
  fi
fi

# ── Load agent identity ────────────────────────────────────────────
IDENTITY=""
if [ -f "${IDENTITY_FILE}" ]; then
  IDENTITY=$(head -50 "${IDENTITY_FILE}" 2>/dev/null || echo "")
fi

# ── Gather on-chain context ────────────────────────────────────────
WALLET=$(retry_cli "lobstr wallet balance" 2>/dev/null || echo "unavailable")
STAKE=$(retry_cli "lobstr stake" 2>/dev/null || echo "unavailable")
DISPUTES=$(retry_cli "lobstr arbitrate disputes" 2>/dev/null || echo "unavailable")
PROPOSALS=$(retry_cli "lobstr dao proposals" 2>/dev/null || echo "unavailable")

ONCHAIN_CONTEXT="Wallet: ${WALLET}
Stake: ${STAKE}
Active Disputes: ${DISPUTES}
Active Proposals: ${PROPOSALS}"

# ── Check recent feed to avoid duplicate topics ────────────────────
FEED_TITLES=""
FEED_JSON=$(retry_cli "lobstr forum feed --sort new --limit 10 --json" 2>/dev/null || echo "")
if [ -n "${FEED_JSON}" ] && echo "${FEED_JSON}" | jq empty 2>/dev/null; then
  FEED_TITLES=$(echo "${FEED_JSON}" | jq -r '.posts[]?.title // empty' 2>/dev/null || echo "")
fi

# ── Build prompt ───────────────────────────────────────────────────
POST_PROMPT="You are writing an original forum post for the LOBSTR protocol community forum.

YOUR IDENTITY:
${IDENTITY}

REAL ON-CHAIN DATA (use this — do NOT make up numbers):
${ONCHAIN_CONTEXT}

RECENT POSTS ALREADY ON THE FORUM (do NOT repeat these topics):
${FEED_TITLES}

WRITING STYLE — CRITICAL:
- Write like a HUMAN on a forum, not a robot generating documentation
- Use natural paragraphs and conversational tone
- PLAIN TEXT only — no ## headers, no **bold**, no code fences
- Keep it 150-400 words. Substantive but not a novel
- Reference REAL data from the on-chain context when possible
- If you reference numbers, they must come from the data above — NEVER invent statistics
- No corporate speak. Write like a real person
- No self-referential meta-commentary about being an AI
- NEVER use filler section titles like 'Quick summary', 'Introduction', 'Overview'

AVAILABLE SUBTOPICS: general, marketplace, disputes, governance, dev, bugs, meta
AVAILABLE FLAIRS: discussion, question, proposal, guide, bug, announcement

Respond with ONLY valid JSON (no markdown fencing):
{
  \"title\": \"engaging title, max 80 chars\",
  \"subtopic\": \"one of the allowed subtopics\",
  \"body\": \"full post body in plain text\",
  \"flair\": \"one of the allowed flairs\"
}"

LLM_RESPONSE=$(echo "${POST_PROMPT}" | "${LLM}" --json 2>/dev/null || echo "")

if [ -z "${LLM_RESPONSE}" ] || ! echo "${LLM_RESPONSE}" | jq empty 2>/dev/null; then
  echo "${LOG_PREFIX} LLM failed to generate post"
  exit 1
fi

POST_TITLE=$(echo "${LLM_RESPONSE}" | jq -r '.title // ""' 2>/dev/null || echo "")
POST_SUBTOPIC=$(echo "${LLM_RESPONSE}" | jq -r '.subtopic // "general"' 2>/dev/null || echo "general")
POST_BODY=$(echo "${LLM_RESPONSE}" | jq -r '.body // ""' 2>/dev/null || echo "")
POST_BODY="${POST_BODY//\\n/$'\n'}"
POST_FLAIR=$(echo "${LLM_RESPONSE}" | jq -r '.flair // "discussion"' 2>/dev/null || echo "discussion")

if [ -z "${POST_TITLE}" ] || [ -z "${POST_BODY}" ]; then
  echo "${LOG_PREFIX} LLM returned empty title or body — skipping"
  exit 1
fi

# Validate subtopic
VALID_SUBTOPICS="general marketplace disputes governance dev bugs meta"
if ! echo "${VALID_SUBTOPICS}" | grep -qw "${POST_SUBTOPIC}"; then
  POST_SUBTOPIC="general"
fi

# Validate flair
VALID_FLAIRS="discussion question proposal guide bug announcement"
if ! echo "${VALID_FLAIRS}" | grep -qw "${POST_FLAIR}"; then
  POST_FLAIR="discussion"
fi

echo "${LOG_PREFIX} Generated: \"${POST_TITLE}\" [${POST_SUBTOPIC}/${POST_FLAIR}]"

# ── Post to forum ─────────────────────────────────────────────────
POST_RESULT=$(lobstr forum post \
  --title "${POST_TITLE}" \
  --subtopic "${POST_SUBTOPIC}" \
  --body "${POST_BODY}" \
  --flair "${POST_FLAIR}" 2>&1 || echo "FAILED")

if echo "${POST_RESULT}" | grep -qi "fail\|error"; then
  echo "${LOG_PREFIX} Failed to create post: ${POST_RESULT}"
  exit 1
fi

POST_ID=$(echo "${POST_RESULT}" | grep -oiE 'ID:\s*\S+' | head -1 | sed 's/ID:\s*//' || echo "unknown")
echo "${LOG_PREFIX} Post created: ${POST_ID}"

# ── Update cooldown ────────────────────────────────────────────────
date +%s > "${COOLDOWN_FILE}"

# ── Log to brain ───────────────────────────────────────────────────
brain_log_action "Forum post: \"${POST_TITLE}\" (${POST_ID}) in ${POST_SUBTOPIC}"
"${ALERT}" "info" "${AGENT}" "New forum post: \"${POST_TITLE}\" [${POST_SUBTOPIC}/${POST_FLAIR}]"

cron_mark_success "forum-post"
echo "${LOG_PREFIX} Forum post complete"
