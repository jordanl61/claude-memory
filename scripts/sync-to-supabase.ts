#!/usr/bin/env bun
/**
 * Auto-sync conversation messages to Supabase.
 * Called by the Stop hook after every assistant turn.
 *
 * Reads the current session's JSONL transcript, extracts new
 * user and assistant messages since last sync, and POSTs them
 * to the Supabase REST API (PostgREST).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────
const HOME = process.env.USERPROFILE || process.env.HOME || "";
const ENV_FILE = join(HOME, ".claude", "supabase.env");
const STATE_FILE = join(HOME, ".claude", "sync-state.json");
const PROJECT_DIR = join(HOME, ".claude", "projects", "C--Users-jorda");

// Load Supabase credentials from .env file (not dependent on process env)
function loadEnv(): { url: string; key: string } | null {
  try {
    const text = readFileSync(ENV_FILE, "utf8");
    const vars: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const match = line.match(/^(\w+)=(.+)$/);
      if (match) vars[match[1]] = match[2].trim();
    }
    if (vars.SUPABASE_URL && vars.SUPABASE_SERVICE_ROLE_KEY) {
      return { url: vars.SUPABASE_URL, key: vars.SUPABASE_SERVICE_ROLE_KEY };
    }
  } catch {}
  return null;
}

const creds = loadEnv();
if (!creds) process.exit(0); // silently skip if no credentials
const SUPABASE_URL = creds.url;
const SUPABASE_KEY = creds.key;

// ── Types ───────────────────────────────────────────────────
interface SyncState {
  file: string;
  offset: number; // byte offset of last sync
}

interface MessageRow {
  session_id: string;
  role: string;
  content: string;
  source: string;
}

// ── State persistence ───────────────────────────────────────
function loadState(): SyncState | null {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {}
  return null;
}

function saveState(state: SyncState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state));
}

// ── Find current session JSONL ──────────────────────────────
function findCurrentJSONL(): string | null {
  try {
    const files = readdirSync(PROJECT_DIR)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const full = join(PROJECT_DIR, f);
        return { path: full, mtime: statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? files[0].path : null;
  } catch {
    return null;
  }
}

// ── Extract messages from JSONL lines ───────────────────────
function extractMessages(lines: string[]): MessageRow[] {
  const messages: MessageRow[] = [];
  let sessionId = "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);

      // Grab session ID from any entry that has it
      if (!sessionId && obj.sessionId) sessionId = obj.sessionId;

      // User message — actual user input (string content, not tool_result arrays)
      if (obj.type === "user" && typeof obj.message?.content === "string") {
        const content = obj.message.content;
        const source = content.includes('source="plugin:telegram') ? "telegram" : "terminal";
        messages.push({
          session_id: sessionId,
          role: "user",
          content: content.length > 50000 ? content.substring(0, 50000) : content,
          source,
        });
      }

      // Assistant message — only final responses with text (stop_reason: "end_turn")
      if (
        obj.type === "assistant" &&
        obj.message?.stop_reason === "end_turn" &&
        Array.isArray(obj.message?.content)
      ) {
        const textParts = obj.message.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");
        if (textParts) {
          messages.push({
            session_id: sessionId,
            role: "assistant",
            content: textParts.length > 50000 ? textParts.substring(0, 50000) : textParts,
            source: "terminal",
          });
        }
      }
    } catch {}
  }

  return messages;
}

// ── Sync to Supabase ────────────────────────────────────────
async function syncToSupabase(messages: MessageRow[]): Promise<boolean> {
  if (messages.length === 0) return true;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(8000), // 8s timeout
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const jsonlPath = findCurrentJSONL();
  if (!jsonlPath || !existsSync(jsonlPath)) return;

  const state = loadState();
  const fileContent = readFileSync(jsonlPath, "utf8");

  // Determine where to start reading
  let newContent: string;
  if (state && state.file === jsonlPath && state.offset > 0 && state.offset <= fileContent.length) {
    // Resume from last sync position
    newContent = fileContent.substring(state.offset);
  } else {
    // New session or first run — sync everything in this file
    newContent = fileContent;
  }

  if (!newContent.trim()) {
    // Nothing new, but update state to track this file
    saveState({ file: jsonlPath, offset: fileContent.length });
    return;
  }

  const lines = newContent.split("\n");
  const messages = extractMessages(lines);

  const ok = await syncToSupabase(messages);
  if (ok) {
    saveState({ file: jsonlPath, offset: fileContent.length });
  }
  // If sync failed, don't update state — retry next time
}

main().catch(() => process.exit(0));
