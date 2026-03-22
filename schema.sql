-- Memory MCP Server Schema
-- Run this in your Supabase SQL Editor

-- Messages: raw conversation log
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  source TEXT DEFAULT 'terminal',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- Summaries: AI-generated session recaps
CREATE TABLE IF NOT EXISTS summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  topics TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_summaries_created ON summaries(created_at DESC);

-- Facts: explicit "remember this" items
CREATE TABLE IF NOT EXISTS facts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fact TEXT NOT NULL,
  context TEXT DEFAULT '',
  source_session_id TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_facts_active ON facts(active) WHERE active = true;
