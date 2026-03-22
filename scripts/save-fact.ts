#!/usr/bin/env bun
/**
 * Save a fact directly to Supabase (bypasses MCP).
 * Usage: bun run save-fact.ts "The fact to save" "Optional context"
 */

import { readFileSync } from "fs";
import { join } from "path";

const HOME = process.env.USERPROFILE || process.env.HOME || "";
const ENV_FILE = join(HOME, ".claude", "supabase.env");

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
if (!creds) {
  console.error("Missing Supabase credentials in ~/.claude/supabase.env");
  process.exit(1);
}

const fact = process.argv[2];
const context = process.argv[3] || "";

if (!fact) {
  console.error("Usage: bun run save-fact.ts \"fact text\" [\"context\"]");
  process.exit(1);
}

const res = await fetch(`${creds.url}/rest/v1/facts`, {
  method: "POST",
  headers: {
    apikey: creds.key,
    Authorization: `Bearer ${creds.key}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  },
  body: JSON.stringify({
    fact,
    context,
    source_session_id: "direct-save",
  }),
  signal: AbortSignal.timeout(8000),
});

if (res.ok) {
  console.log(`Saved: "${fact}"`);
} else {
  console.error(`Failed (${res.status}): ${await res.text()}`);
  process.exit(1);
}
