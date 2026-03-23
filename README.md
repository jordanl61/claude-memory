# Claude -> Telegram Memory

Give Claude persistent memory across conversations using Supabase as a backend. Works with **Claude Code** (CLI) and **Claude Desktop**.

Claude can remember facts, recall past conversations, and automatically log session summaries — so it picks up where you left off every time.

## What You Get

| Tool | What it does |
|------|-------------|
| `remember` | Save a fact ("remember that I prefer TypeScript") |
| `recall` | Search past conversations, facts, and summaries |
| `forget` | Remove a previously saved fact |
| `start_session` | Load context from recent sessions at conversation start |
| `end_session` | Save a summary when a conversation ends |
| `load_context` | Pull recent summaries and saved facts |
| `log_message` | Store individual messages to the database |

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

## Troubleshooting

**"Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"**
Your `.env` file is missing or the env vars aren't being passed. Make sure the `env` block in your MCP config has the correct values.

**Memory tools don't show up**
Restart Claude Code/Desktop after adding the MCP config. Check that the path to `dist/server.js` is correct and absolute.

**"logMessage error" / database errors**
Make sure you ran `schema.sql` in the Supabase SQL Editor. Check that you're using the `service_role` key (not the `anon` key).

## License

MIT
