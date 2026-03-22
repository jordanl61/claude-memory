#!/usr/bin/env bun
/**
 * Auto-generate session summary on SessionEnd.
 * Reads the current session's JSONL, extracts key info,
 * and POSTs a summary to the Supabase summaries table.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const HOME = process.env.USERPROFILE || process.env.HOME || "";
const ENV_FILE = join(HOME, ".claude", "supabase.env");
const PROJECT_DIR = join(HOME, ".claude", "projects", "C--Users-jorda");

// ── Load credentials ────────────────────────────────────────
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
if (!creds) process.exit(0);

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

// ── Extract summary data from JSONL ─────────────────────────
interface SessionData {
  sessionId: string;
  userMessages: string[];
  assistantMessages: string[];
  firstTimestamp: string;
  lastTimestamp: string;
  sources: Set<string>;
}

function parseSession(filePath: string): SessionData | null {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  const data: SessionData = {
    sessionId: "",
    userMessages: [],
    assistantMessages: [],
    firstTimestamp: "",
    lastTimestamp: "",
    sources: new Set(),
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);

      if (!data.sessionId && obj.sessionId) data.sessionId = obj.sessionId;
      if (obj.timestamp) {
        if (!data.firstTimestamp) data.firstTimestamp = obj.timestamp;
        data.lastTimestamp = obj.timestamp;
      }

      // User messages (actual input, not tool results)
      if (obj.type === "user" && typeof obj.message?.content === "string") {
        const content = obj.message.content;
        // Extract clean text from Telegram channel messages
        const telegramMatch = content.match(/<channel[^>]*>([\s\S]*?)<\/channel>/);
        const cleanText = telegramMatch ? telegramMatch[1].trim() : content.trim();
        if (cleanText) {
          data.userMessages.push(cleanText.substring(0, 500));
          data.sources.add(content.includes('source="plugin:telegram') ? "telegram" : "terminal");
        }
      }

      // Assistant final responses
      if (
        obj.type === "assistant" &&
        obj.message?.stop_reason === "end_turn" &&
        Array.isArray(obj.message?.content)
      ) {
        const text = obj.message.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join(" ");
        if (text) data.assistantMessages.push(text.substring(0, 500));
      }
    } catch {}
  }

  if (data.userMessages.length === 0) return null;
  return data;
}

// ── Generate summary text ───────────────────────────────────
function generateSummary(data: SessionData): { summary: string; topics: string[] } {
  const totalExchanges = Math.min(data.userMessages.length, data.assistantMessages.length);
  const sources = Array.from(data.sources).join(", ");

  // Extract topics: use keywords from user messages
  const allUserText = data.userMessages.join(" ").toLowerCase();
  const topicKeywords = extractTopics(allUserText);

  // Build summary
  const parts: string[] = [];

  // Time range
  if (data.firstTimestamp) {
    const start = new Date(data.firstTimestamp);
    parts.push(`Session on ${start.toISOString().split("T")[0]} (${sources}).`);
  }

  parts.push(`${totalExchanges} exchange(s), ${data.userMessages.length} user message(s).`);

  // First user message as context
  if (data.userMessages.length > 0) {
    parts.push(`Started with: "${data.userMessages[0].substring(0, 200)}"`);
  }

  // Key topics if any assistant responses mention significant work
  if (data.assistantMessages.length > 0) {
    const lastResponse = data.assistantMessages[data.assistantMessages.length - 1];
    parts.push(`Last response: "${lastResponse.substring(0, 200)}"`);
  }

  return {
    summary: parts.join(" "),
    topics: topicKeywords,
  };
}

// ── Simple topic extraction from user messages ──────────────
function extractTopics(text: string): string[] {
  // Common technical terms to look for
  const knownTopics = [
    "supabase", "mcp", "memory", "telegram", "hook", "sync",
    "database", "api", "server", "deploy", "test", "bug", "fix",
    "build", "config", "settings", "auth", "login", "docker",
    "git", "commit", "branch", "merge", "pr", "review",
    "react", "vue", "node", "python", "typescript", "bun",
    "n8n", "workflow", "automation", "playwright", "obsidian",
    "claude", "agent", "prompt", "skill", "plugin",
  ];

  const found = knownTopics.filter((t) => text.includes(t));

  // Also extract capitalized multi-word phrases (likely proper nouns/features)
  const words = text.split(/\s+/);
  const phrases: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i].length > 3 && words[i + 1].length > 3) {
      // Already lowercase, just look for repeated important words
    }
  }

  return [...new Set(found)].slice(0, 8);
}

// ── POST to Supabase ────────────────────────────────────────
async function saveSummary(sessionId: string, summary: string, topics: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${creds!.url}/rest/v1/summaries`, {
      method: "POST",
      headers: {
        apikey: creds!.key,
        Authorization: `Bearer ${creds!.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ session_id: sessionId, summary, topics }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const jsonlPath = findCurrentJSONL();
  if (!jsonlPath) return;

  const data = parseSession(jsonlPath);
  if (!data || !data.sessionId) return;

  const { summary, topics } = generateSummary(data);
  await saveSummary(data.sessionId, summary, topics);
}

main().catch(() => process.exit(0));
