-- 0006_ai_config.sql
-- Dynamic multi-provider AI keys and configuration table.

CREATE TABLE IF NOT EXISTS ai_config (
  id           TEXT PRIMARY KEY, -- 'primary' or provider id
  provider     TEXT NOT NULL DEFAULT 'gemini', -- 'gemini', 'openai', 'claude', 'groq', 'deepseek'
  model_name   TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
  api_keys     TEXT NOT NULL, -- JSON array of API keys: ["key1", "key2", ...]
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  settings_json TEXT, -- JSON options (temperature, thinking, max_tokens, etc.)
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
