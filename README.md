# Claude Memory

**Persistent memory for Claude Code Channels via Telegram, powered by Supabase and MCP.**

Claude Memory is a lightweight MCP server built to give Claude Code Channels on Telegram a practical long-term memory layer. It stores facts, conversation logs, and session summaries in Supabase so Claude can recall useful context across sessions instead of starting from scratch every time.

It was created for the real-world workflow of staying connected to Claude through Telegram, where convenience is high but continuity can easily get lost.

## Why this exists

Claude Code Channels on Telegram make it incredibly convenient to stay connected to Claude from anywhere, but useful context can disappear between sessions unless you provide a memory layer.

This project solves that problem by adding persistent memory through Supabase. It allows Claude to remember important facts, recall previous conversations, and carry forward relevant context over time.

The goal is not to build a giant, overengineered framework. The goal is to create a simple, practical memory system that is easy to run, easy to understand, and genuinely useful in everyday Claude Code workflows via Telegram.

While it was built specifically for Claude Code Channels on Telegram, the same overall pattern may also be useful for other trusted MCP-based Claude workflows.

## What it stores

- **Facts** for long-lived memory
- **Messages** for conversation history
- **Summaries** for session-level context compression

## Core tools

- `remember` — save an important fact
- `recall` — search previous facts, messages, and summaries
- `forget` — deactivate a fact
- `start_session` — begin a new conversation session
- `end_session` — close a session
- `load_context` — load useful recent context
- `log_message` — store conversation messages

## Quick example

- “Remember that I prefer TypeScript” → saves a fact
- “What did we discuss yesterday?” → recalls prior context
- “Forget that TypeScript preference” → deactivates the saved fact
- Start a new session → Claude can load relevant context automatically

## Prerequisites

- [Bun](https://bun.sh) runtime (install: `curl -fsSL https://bun.sh/install | bash`)
- A free [Supabase](https://supabase.com) account
- Claude Code (CLI) or Claude Desktop

## Setup (5 minutes)

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project**, give it a name (e.g. `claude-memory`), set a password, and pick a region
3. Wait for the project to finish provisioning (~30 seconds)

### Step 2: Create the Database Tables

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Paste the entire contents of [`schema.sql`](schema.sql) into the editor
4. Click **Run** — you should see "Success. No rows returned" for each statement

This creates three tables: `messages`, `summaries`, and `facts`.

### Step 3: Get Your Credentials

1. In Supabase, go to **Settings** > **API** (left sidebar)
2. Copy these two values:
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **service_role key** (under "Project API keys" — use the `service_role` key, NOT the `anon` key)

### Step 4: Clone and Configure

```bash
git clone https://github.com/jordanl61/claude-memory.git
cd claude-memory

# Create your .env file
cp .env.example .env
```

Edit `.env` and paste in your credentials:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Step 5: Install and Build

```bash
bun install
bun run build
```

### Step 6: Register the MCP Server

#### For Claude Code (CLI)

Add this to your `.claude.json` file (in your home directory or project root):

```json
{
  "mcpServers": {
    "memory": {
      "command": "bun",
      "args": ["run", "/full/path/to/claude-memory/dist/server.js"],
      "env": {
        "SUPABASE_URL": "https://your-project-id.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key-here"
      }
    }
  }
}
```

> **Important:** Replace `/full/path/to/claude-memory/` with the actual absolute path where you cloned the repo.

#### For Claude Desktop

Add the same config to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memory": {
      "command": "bun",
      "args": ["run", "/full/path/to/claude-memory/dist/server.js"],
      "env": {
        "SUPABASE_URL": "https://your-project-id.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key-here"
      }
    }
  }
}
```

### Step 7: Restart Claude

Restart Claude Code or Claude Desktop. The memory tools should now be available.

**To verify:** Ask Claude "Do you have memory tools available?" — it should list the `remember`, `recall`, `forget` tools.

## Usage

Once installed, just talk to Claude naturally:

- **"Remember that I prefer dark mode"** — Claude calls `remember`
- **"What did we talk about yesterday?"** — Claude calls `recall`
- **"Forget that thing about dark mode"** — Claude calls `forget`

Claude will also automatically load context from past sessions when starting a new conversation (if you or Claude calls `start_session`).

## Optional: Auto-Sync Hooks (Claude Code Only)

The `scripts/` directory contains hook scripts that automatically log every message and generate session summaries without you having to do anything. These only work with Claude Code (not Desktop), since they rely on Claude Code's hook system.

See the scripts in [`scripts/`](scripts/) if you want to set these up — they require additional configuration in your Claude Code `settings.json`.

## Architecture

```
You <-> Claude <-> MCP Server <-> Supabase
                       |
                  memory tools
              (remember, recall, etc.)
```

- **MCP Server** (`server.ts`) — Exposes memory tools via the Model Context Protocol
- **Database** (`db.ts`) — Handles all Supabase queries
- **Schema** (`schema.sql`) — Three tables: `messages`, `summaries`, `facts`

## Files

| File | Purpose |
|------|---------|
| `server.ts` | MCP server entry point — defines all tools |
| `db.ts` | Supabase database helpers |
| `schema.sql` | Database table definitions |
| `package.json` | Dependencies and build scripts |
| `scripts/sync-to-supabase.ts` | Auto-sync hook (logs messages after each turn) |
| `scripts/session-summary.ts` | Session end summary hook |
| `scripts/save-fact.ts` | Utility to save facts directly |
| `scripts/memory-health-check.sh` | Health check script |

## Security Notes

This project is intended to run in a trusted local or server-side MCP environment for Claude Code Channels via Telegram.

- Use the `service_role` key only in environments you control
- Never expose the `service_role` key in browser-based apps or client-side code
- Never commit your `.env` file or API keys to GitHub
- Rotate your key immediately if you believe it has been exposed
- Consider creating a dedicated Supabase project just for this memory server

Row Level Security (RLS) is enabled in the Supabase setup, but the `service_role` key still has elevated privileges and should always be treated as highly sensitive.

## Trust Model

Claude Memory is designed for a trusted MCP runtime using Supabase server credentials.

This project uses Supabase as the persistent memory layer and is intended to run locally or in a server environment you control. Row Level Security (RLS) is enabled, but the MCP server uses the Supabase `service_role` key for trusted server-side access.

That means:

- database access happens through the MCP server, not directly from a client app
- the `service_role` key must remain private
- this project is optimized for trusted Claude workflows rather than public-facing        client deployments

If you want to adapt this project for a broader multi-user or less-trusted environment, you may want to extend it further with:

- per-user ownership and tenancy design
- stricter authenticated access patterns
- tighter secret handling and deployment controls
- additional audit and usage safeguards

## Disclaimer

This project is provided in good faith as a practical tool for trusted Claude Code Channels via Telegram workflows.

It is provided **as is**, without warranty of any kind. You are responsible for reviewing the code, securing your environment, protecting your secrets, and deciding whether it is appropriate for your use case.

Please do not expose privileged Supabase credentials in untrusted or client-side environments. See the `LICENSE` file for the full license terms.

## Roadmap

- [x] Persistent fact storage
- [x] Conversation logging
- [x] Session summaries
- [x] Claude Code Channels via Telegram workflow
- [x] Supabase-backed persistent storage
- [x] RLS-enabled database setup
- [ ] Better search and recall quality
- [ ] Optional semantic search / embeddings
- [ ] Multi-user namespacing
- [ ] Hardened deployment guidance for broader use cases
- [ ] Backup / export utilities
- [ ] Additional examples, screenshots, and setup docs

## Troubleshooting

**"Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"**
Your `.env` file is missing or the env vars aren't being passed. Make sure the `env` block in your MCP config has the correct values.

**Memory tools don't show up**
Restart Claude Code/Desktop after adding the MCP config. Check that the path to `dist/server.js` is correct and absolute.

**"logMessage error" / database errors**
Make sure you ran `schema.sql` in the Supabase SQL Editor. Check that you're using the `service_role` key (not the `anon` key).

Created by Lawrence Jordan

## License

MIT
