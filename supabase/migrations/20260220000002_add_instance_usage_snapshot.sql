-- Track last known sessions.usage snapshot per instance.
-- Used by the proxy to detect session resets and correctly
-- compute billing deltas even when token counts drop to zero.

ALTER TABLE public.instances
  ADD COLUMN IF NOT EXISTS last_usage_cost    DECIMAL     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_usage_tokens  INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_usage_synced_at TIMESTAMPTZ DEFAULT NULL;
