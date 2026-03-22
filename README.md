# Claude Memory

Persistent conversation memory for Claude Code via Supabase.

## Architecture

Two-layer system:

1. **MCP Server** — Interactive tools (`remember`, `recall`, `forget`, `start_session`, `end_session`, `load_context`, `log_message`) registered in `.claude.json`
2. **Auto-sync hooks** — Shell scripts that run on Claude Code lifecycle events, logging messages and generating session summaries directly via Supabase REST API

## Setup

1. Create a Supabase project and run `schema.sql` to create the tables
2. Copy `.env.example` to `.env` and fill in your credentials
3. Install dependencies: `bun install`
4. Register the MCP server in your `.claude.json`
5. Configure Claude Code hooks to run the scripts in `scripts/`

## Files

- `server.ts` — MCP server entry point
- `db.ts` — Supabase database helpers
- `schema.sql` — Database schema
- `scripts/sync-to-supabase.ts` — Auto-sync hook (logs messages after each turn)
- `scripts/session-summary.ts` — Session end summary hook
- `scripts/save-fact.ts` — Utility to save facts directly
- `scripts/memory-health-check.sh` — Health check script
