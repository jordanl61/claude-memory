import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

// Lazy-init: don't block module load with a network call
let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(supabaseUrl!, supabaseKey!);
  }
  return _supabase;
}

export async function logMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  source: string = "terminal"
): Promise<void> {
  const { error } = await getSupabase()
    .from("messages")
    .insert({ session_id: sessionId, role, content, source });
  if (error) console.error("logMessage error:", error.message);
}

export async function loadContext(days: number = 7): Promise<{
  summaries: Array<{ summary: string; topics: string[]; created_at: string }>;
  facts: Array<{ fact: string; context: string }>;
}> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const db = getSupabase();
  const [summariesResult, factsResult] = await Promise.all([
    db
      .from("summaries")
      .select("summary, topics, created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false }),
    db
      .from("facts")
      .select("fact, context")
      .eq("active", true),
  ]);

  return {
    summaries: summariesResult.data ?? [],
    facts: factsResult.data ?? [],
  };
}

export async function saveFact(
  fact: string,
  context: string,
  sessionId: string
): Promise<void> {
  const { error } = await getSupabase()
    .from("facts")
    .insert({ fact, context, source_session_id: sessionId });
  if (error) console.error("saveFact error:", error.message);
}

export async function deactivateFact(factText: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("facts")
    .update({ active: false })
    .ilike("fact", `%${factText}%`)
    .eq("active", true)
    .select("id");
  if (error) {
    console.error("deactivateFact error:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function recall(
  query: string,
  limit: number = 10
): Promise<{
  messages: Array<{ role: string; content: string; source: string; created_at: string }>;
  summaries: Array<{ summary: string; topics: string[]; created_at: string }>;
  facts: Array<{ fact: string; context: string; created_at: string }>;
}> {
  const pattern = `%${query}%`;

  const db = getSupabase();
  const [messagesResult, summariesResult, factsResult] = await Promise.all([
    db
      .from("messages")
      .select("role, content, source, created_at")
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(limit),
    db
      .from("summaries")
      .select("summary, topics, created_at")
      .ilike("summary", pattern)
      .order("created_at", { ascending: false })
      .limit(limit),
    db
      .from("facts")
      .select("fact, context, created_at")
      .ilike("fact", pattern)
      .eq("active", true)
      .limit(limit),
  ]);

  return {
    messages: messagesResult.data ?? [],
    summaries: summariesResult.data ?? [],
    facts: factsResult.data ?? [],
  };
}

export async function saveSummary(
  sessionId: string,
  summary: string,
  topics: string[]
): Promise<void> {
  const { error } = await getSupabase()
    .from("summaries")
    .insert({ session_id: sessionId, summary, topics });
  if (error) console.error("saveSummary error:", error.message);
}
