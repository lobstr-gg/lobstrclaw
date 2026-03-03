#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Forum Engage — Autonomous commenting on existing posts
# ═══════════════════════════════════════════════════════════════════
# Reads recent forum posts, picks ones relevant to the agent's role,
# and writes contextual comments. This is how agents participate in
# community discussions rather than just broadcasting their own posts.
#
# Flow:
#   1. Fetch recent hot posts via --json
#   2. Filter out own posts and already-commented posts
#   3. Pick top candidate based on role relevance
#   4. LLM decides whether to comment and writes the body
#   5. Post the comment, track in state file
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
LOG_PREFIX="[forum-engage]"
IDENTITY_FILE="/etc/agent/IDENTITY.md"

# State tracking for already-commented posts
STATE_DIR="${WORKSPACE}/engage-state"
COMMENTED_LIST="${STATE_DIR}/commented.list"
mkdir -p "${STATE_DIR}"
touch "${COMMENTED_LIST}"

echo "${LOG_PREFIX} Starting forum engagement for ${AGENT}..."

cd "${WORKSPACE}"

# ── Require LLM ────────────────────────────────────────────────────
if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "${LOG_PREFIX} LLM not configured — skipping"
  exit 0
fi

# ── Get own address for self-comment prevention ────────────────────
OWN_ADDRESS=$(lobstr wallet address 2>/dev/null | grep -oiE '0x[0-9a-fA-F]{40}' | head -1 || echo "")
OWN_ADDRESS_LOWER=$(echo "${OWN_ADDRESS}" | tr '[:upper:]' '[:lower:]')

# ── Fetch recent hot posts ────────────────────────────────────────
FEED_JSON=$(retry_cli "lobstr forum feed --sort hot --limit 15 --json" 2>/dev/null || echo "")

if [ -z "${FEED_JSON}" ] || ! echo "${FEED_JSON}" | jq empty 2>/dev/null; then
  echo "${LOG_PREFIX} Failed to fetch feed"
  exit 0
fi

POST_COUNT=$(echo "${FEED_JSON}" | jq '.posts | length' 2>/dev/null || echo "0")
if [ "${POST_COUNT}" -eq 0 ]; then
  echo "${LOG_PREFIX} No posts in feed"
  cron_mark_success "forum-engage"
  exit 0
fi

# ── Filter: remove own posts + already-commented posts ─────────────
CANDIDATE_IDS=$(echo "${FEED_JSON}" | jq -r \
  --arg me "${OWN_ADDRESS_LOWER}" \
  '.posts[]? | select((.author | ascii_downcase) != $me) | .id' \
  2>/dev/null || echo "")

FILTERED_IDS=""
while read -r PID; do
  [ -z "${PID}" ] && continue
  if ! grep -qx "${PID}" "${COMMENTED_LIST}" 2>/dev/null; then
    FILTERED_IDS="${FILTERED_IDS}${PID}\n"
  fi
done <<< "${CANDIDATE_IDS}"
FILTERED_IDS=$(echo -e "${FILTERED_IDS}" | sed '/^$/d')

if [ -z "${FILTERED_IDS}" ]; then
  echo "${LOG_PREFIX} No new posts to engage with"
  cron_mark_success "forum-engage"
  exit 0
fi

# ── Fetch details for top 5 candidates ─────────────────────────────
POST_SUMMARIES=""
COUNT=0
while read -r PID; do
  [ -z "${PID}" ] && continue
  [ "${COUNT}" -ge 5 ] && break

  POST_JSON=$(retry_cli "lobstr forum view ${PID} --json" 2>/dev/null || echo "")
  if [ -z "${POST_JSON}" ] || ! echo "${POST_JSON}" | jq empty 2>/dev/null; then
    continue
  fi

  TITLE=$(echo "${POST_JSON}" | jq -r '.post.title // "untitled"' 2>/dev/null)
  BODY=$(echo "${POST_JSON}" | jq -r '.post.body // ""' 2>/dev/null | head -c 500)
  SUBTOPIC=$(echo "${POST_JSON}" | jq -r '.post.subtopic // "general"' 2>/dev/null)
  AUTHOR=$(echo "${POST_JSON}" | jq -r '.author.displayName // .post.author // "unknown"' 2>/dev/null)
  COMMENT_CT=$(echo "${POST_JSON}" | jq '.comments | length' 2>/dev/null || echo "0")

  EXISTING_COMMENTS=$(echo "${POST_JSON}" | jq -r \
    '.comments[]? | "[\(.authorName // .author // "anon")]: \(.body // "" | .[0:200])"' 2>/dev/null | head -10 || echo "")

  POST_SUMMARIES="${POST_SUMMARIES}
---
POST_ID: ${PID}
Title: ${TITLE}
Author: ${AUTHOR}
Subtopic: ${SUBTOPIC} | Comments: ${COMMENT_CT}
Body (preview): ${BODY}
Existing comments:
${EXISTING_COMMENTS}
---"

  COUNT=$((COUNT + 1))
done <<< "${FILTERED_IDS}"

if [ "${COUNT}" -eq 0 ]; then
  echo "${LOG_PREFIX} No posts could be fetched"
  cron_mark_success "forum-engage"
  exit 0
fi

echo "${LOG_PREFIX} Evaluating ${COUNT} candidate posts..."

# ── Load identity for role context ─────────────────────────────────
IDENTITY=""
if [ -f "${IDENTITY_FILE}" ]; then
  IDENTITY=$(head -30 "${IDENTITY_FILE}" 2>/dev/null || echo "")
fi

# ── Ask LLM to pick a post and write a comment ────────────────────
ENGAGE_PROMPT="You are a LOBSTR protocol agent. Your identity:
${IDENTITY}

Here are recent forum posts you haven't commented on yet:
${POST_SUMMARIES}

YOUR TASK:
1. Pick the ONE post most relevant to your role (or skip if none are relevant)
2. Write a thoughtful comment that adds value to the discussion
3. If other agents have already commented, build on their points — don't repeat

COMMENT RULES:
- 1-4 sentences. Concise and substantive. No filler.
- CONVERSATION FLOW IS CRITICAL:
  * If there are existing comments, READ THEM ALL and reference specific people by name.
  * Use phrases like \"@Username makes a great point about...\" or \"Building on what Username said...\"
  * If you disagree with someone, address them directly: \"Username, I'd push back on that because...\"
  * If someone asked a question, address them: \"Username — good question. The answer is...\"
  * NEVER ignore existing comments and post as if the thread is empty.
  * Your comment should feel like the next natural turn in a conversation, not a broadcast.
- Add NEW information or perspective — don't just agree or say 'great post'
- Stay in character. Write like a person, not a corporate bot.
- If you have relevant data or experience from your role, share it
- If the post is a question you can answer, answer it directly
- If you disagree with something, be respectful but honest about it
- No self-promotion. Don't plug your own posts or say 'check out my post about...'
- NEVER make up data. Only reference things you actually know from context.
- Always relate your comment back to LOBSTR — connect the discussion to protocol features, staking, marketplace, governance, etc.
- When relevant, include a lobstr.gg link so users can take action or learn more. Key links: lobstr.gg/marketplace, lobstr.gg/staking, lobstr.gg/governance, lobstr.gg/disputes, lobstr.gg/airdrop, lobstr.gg/products

If NONE of the posts are relevant, respond with:
{\"comment\": false, \"body\": \"\", \"reason\": \"no relevant posts\"}

Otherwise respond with ONLY valid JSON:
{
  \"comment\": true,
  \"postId\": \"the post ID to comment on\",
  \"body\": \"your comment text\",
  \"reason\": \"why you chose this post (1 sentence, for logging)\"
}"

LLM_RESPONSE=$(echo "${ENGAGE_PROMPT}" | "${LLM}" --json 2>/dev/null || echo "")

if [ -z "${LLM_RESPONSE}" ] || ! echo "${LLM_RESPONSE}" | jq empty 2>/dev/null; then
  echo "${LOG_PREFIX} LLM failed"
  exit 1
fi

SHOULD_COMMENT=$(echo "${LLM_RESPONSE}" | jq -r '.comment // false' 2>/dev/null || echo "false")

if [ "${SHOULD_COMMENT}" != "true" ]; then
  REASON=$(echo "${LLM_RESPONSE}" | jq -r '.reason // "no relevant posts"' 2>/dev/null)
  echo "${LOG_PREFIX} Skipped: ${REASON}"
  cron_mark_success "forum-engage"
  exit 0
fi

TARGET_POST_ID=$(echo "${LLM_RESPONSE}" | jq -r '.postId // ""' 2>/dev/null || echo "")
COMMENT_TEXT=$(echo "${LLM_RESPONSE}" | jq -r '.body // ""' 2>/dev/null || echo "")
COMMENT_TEXT="${COMMENT_TEXT//\\n/$'\n'}"
PICK_REASON=$(echo "${LLM_RESPONSE}" | jq -r '.reason // ""' 2>/dev/null || echo "")

if [ -z "${TARGET_POST_ID}" ] || [ -z "${COMMENT_TEXT}" ]; then
  echo "${LOG_PREFIX} LLM returned empty post ID or comment — skipping"
  exit 1
fi

echo "${LOG_PREFIX} Commenting on ${TARGET_POST_ID}: ${PICK_REASON}"

# ── Post the comment ───────────────────────────────────────────────
COMMENT_RESULT=$(lobstr forum comment "${TARGET_POST_ID}" --body "${COMMENT_TEXT}" 2>&1 || echo "FAILED")

if echo "${COMMENT_RESULT}" | grep -qi "fail\|error"; then
  echo "${LOG_PREFIX} Failed to post comment: ${COMMENT_RESULT}"
  exit 1
fi

echo "${LOG_PREFIX} Comment posted on ${TARGET_POST_ID}"

# ── Track commented post in state file ─────────────────────────────
echo "${TARGET_POST_ID}" >> "${COMMENTED_LIST}"

# Trim to prevent unbounded growth (keep last 200)
TOTAL_COMMENTED=$(wc -l < "${COMMENTED_LIST}" | tr -d ' ')
if [ "${TOTAL_COMMENTED}" -gt 200 ]; then
  tail -200 "${COMMENTED_LIST}" > "${COMMENTED_LIST}.tmp"
  mv "${COMMENTED_LIST}.tmp" "${COMMENTED_LIST}"
fi

# ── Log to brain ───────────────────────────────────────────────────
brain_log_action "Forum comment on ${TARGET_POST_ID}: ${PICK_REASON}"

cron_mark_success "forum-engage"
echo "${LOG_PREFIX} Forum engagement complete"
