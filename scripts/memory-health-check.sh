#!/bin/bash
# Memory system health check — runs on SessionStart
# 1. Resets sync state so the new session starts fresh
# 2. Verifies Supabase connectivity
# 3. Reminds Claude to call start_session if MCP memory tools are available

HOME_DIR="${USERPROFILE:-$HOME}"
STATE_FILE="$HOME_DIR/.claude/sync-state.json"
ENV_FILE="$HOME_DIR/.claude/supabase.env"

# Reset sync state for the new session
rm -f "$STATE_FILE"

# Quick connectivity check to Supabase
SUPABASE_OK="false"
if [ -f "$ENV_FILE" ]; then
  SUPABASE_URL=$(grep '^SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
  SUPABASE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2-)
  if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_KEY" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 5 \
      -H "apikey: $SUPABASE_KEY" \
      -H "Authorization: Bearer $SUPABASE_KEY" \
      "$SUPABASE_URL/rest/v1/facts?select=id&limit=1" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ]; then
      SUPABASE_OK="true"
    fi
  fi
fi

if [ "$SUPABASE_OK" = "true" ]; then
  echo "{\"hookSpecificOutput\": {\"hookEventName\": \"SessionStart\", \"additionalContext\": \"Memory system ready. Auto-sync hook will log all messages to Supabase after each turn. If mcp__memory tools are available, call start_session to load prior context.\"}}"
else
  echo "{\"systemMessage\": \"WARNING: Supabase connectivity check failed. Auto-sync may not work this session.\", \"hookSpecificOutput\": {\"hookEventName\": \"SessionStart\", \"additionalContext\": \"Supabase connectivity check FAILED. The Stop hook auto-sync may not work. Check ~/.claude/supabase.env credentials.\"}}"
fi
