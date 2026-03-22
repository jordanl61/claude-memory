import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  logMessage,
  loadContext,
  saveFact,
  deactivateFact,
  recall,
  saveSummary,
} from "./db.js";

// Catch uncaught errors so we get diagnostics instead of silent death
process.on("uncaughtException", (err) => {
  console.error("[memory-server] Uncaught exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[memory-server] Unhandled rejection:", reason);
});

const server = new McpServer({
  name: "memory-server",
  version: "1.0.0",
});

// --- Automatic Tools ---

server.tool(
  "log_message",
  "Save a conversation message to persistent memory. Call this for each user/assistant exchange.",
  {
    session_id: z.string().describe("Current session identifier"),
    role: z.enum(["user", "assistant"]).describe("Who sent the message"),
    content: z.string().describe("The message content"),
    source: z.string().default("terminal").describe("Message source: telegram, terminal, etc."),
  },
  async ({ session_id, role, content, source }) => {
    await logMessage(session_id, role, content, source);
    return { content: [{ type: "text" as const, text: "Message logged." }] };
  }
);

server.tool(
  "load_context",
  "Load recent conversation summaries and saved facts. Call at session start for context.",
  {
    days: z.number().default(7).describe("How many days back to load summaries"),
  },
  async ({ days }) => {
    const ctx = await loadContext(days);
    if (ctx.summaries.length === 0 && ctx.facts.length === 0) {
      return { content: [{ type: "text" as const, text: "No prior context found." }] };
    }
    const parts: string[] = [];
    if (ctx.summaries.length > 0) {
      parts.push("## Recent Session Summaries\n");
      for (const s of ctx.summaries) {
        parts.push(`**${s.created_at}** [${s.topics?.join(", ") ?? ""}]\n${s.summary}\n`);
      }
    }
    if (ctx.facts.length > 0) {
      parts.push("## Saved Facts\n");
      for (const f of ctx.facts) {
        parts.push(`- ${f.fact}${f.context ? ` (${f.context})` : ""}`);
      }
    }
    return { content: [{ type: "text" as const, text: parts.join("\n") }] };
  }
);

// --- User-Triggered Tools ---

server.tool(
  "remember",
  "Save an important fact to persistent memory. Use when the user says 'remember this'.",
  {
    session_id: z.string().describe("Current session identifier"),
    fact: z.string().describe("The fact to remember"),
    context: z.string().default("").describe("Why this fact matters"),
  },
  async ({ session_id, fact, context }) => {
    await saveFact(fact, context, session_id);
    return { content: [{ type: "text" as const, text: `Remembered: "${fact}"` }] };
  }
);

server.tool(
  "forget",
  "Deactivate a previously saved fact. Use when the user says 'forget about X'.",
  {
    fact_text: z.string().describe("Text to match against saved facts (partial match)"),
  },
  async ({ fact_text }) => {
    const found = await deactivateFact(fact_text);
    return {
      content: [
        {
          type: "text" as const,
          text: found
            ? `Forgotten facts matching: "${fact_text}"`
            : `No active facts found matching: "${fact_text}"`,
        },
      ],
    };
  }
);

server.tool(
  "recall",
  "Search conversation history, summaries, and facts for a topic. Use when the user asks about past conversations.",
  {
    query: z.string().describe("Search query to match against past conversations"),
    limit: z.number().default(10).describe("Max results per category"),
  },
  async ({ query, limit }) => {
    const results = await recall(query, limit);
    const total =
      results.messages.length + results.summaries.length + results.facts.length;
    if (total === 0) {
      return { content: [{ type: "text" as const, text: `No results found for: "${query}"` }] };
    }
    const parts: string[] = [`## Search results for: "${query}"\n`];
    if (results.facts.length > 0) {
      parts.push("### Saved Facts");
      for (const f of results.facts) {
        parts.push(`- ${f.fact} (${f.created_at})`);
      }
    }
    if (results.summaries.length > 0) {
      parts.push("\n### Session Summaries");
      for (const s of results.summaries) {
        parts.push(`**${s.created_at}** [${s.topics?.join(", ") ?? ""}]\n${s.summary}\n`);
      }
    }
    if (results.messages.length > 0) {
      parts.push("\n### Messages");
      for (const m of results.messages) {
        parts.push(`**${m.created_at}** (${m.role}, ${m.source}): ${m.content.substring(0, 200)}${m.content.length > 200 ? "..." : ""}`);
      }
    }
    return { content: [{ type: "text" as const, text: parts.join("\n") }] };
  }
);

// --- Session Lifecycle Tools ---

server.tool(
  "start_session",
  "Initialize a new memory session and load context. Call once at the start of each conversation.",
  {
    session_id: z.string().describe("Unique session identifier (use a timestamp or UUID)"),
  },
  async ({ session_id }) => {
    const ctx = await loadContext(7);
    const parts: string[] = [`Session ${session_id} started.\n`];
    if (ctx.summaries.length > 0) {
      parts.push("## Recent Session Summaries\n");
      for (const s of ctx.summaries) {
        parts.push(`**${s.created_at}** [${s.topics?.join(", ") ?? ""}]\n${s.summary}\n`);
      }
    }
    if (ctx.facts.length > 0) {
      parts.push("## Saved Facts\n");
      for (const f of ctx.facts) {
        parts.push(`- ${f.fact}${f.context ? ` (${f.context})` : ""}`);
      }
    }
    if (ctx.summaries.length === 0 && ctx.facts.length === 0) {
      parts.push("No prior context found. This appears to be a fresh start.");
    }
    return { content: [{ type: "text" as const, text: parts.join("\n") }] };
  }
);

server.tool(
  "end_session",
  "Save a session summary before ending. Call at the end of each conversation.",
  {
    session_id: z.string().describe("Current session identifier"),
    summary: z.string().describe("AI-generated summary of the conversation"),
    topics: z.array(z.string()).describe("Key topics discussed (for searchable tags)"),
  },
  async ({ session_id, summary, topics }) => {
    await saveSummary(session_id, summary, topics);
    return { content: [{ type: "text" as const, text: `Session ${session_id} summary saved.` }] };
  }
);

// --- Start Server ---

// Keep the process alive — prevent stdin EOF from killing us prematurely.
// MCP stdio transport can close if Claude Code is slow to handshake.
process.stdin.resume();
process.stdin.on("error", () => {}); // ignore EPIPE

// Prevent the process from exiting on idle — Bun/Node may exit if there's
// nothing keeping the event loop busy between MCP messages.
const keepalive = setInterval(() => {}, 30_000);
process.on("SIGINT", () => { clearInterval(keepalive); process.exit(0); });
process.on("SIGTERM", () => { clearInterval(keepalive); process.exit(0); });

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[memory-server] Started successfully.");
} catch (err) {
  console.error("[memory-server] Failed to start:", err);
  process.exit(1);
}
