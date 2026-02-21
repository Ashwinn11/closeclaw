-- Track the high-water mark of credits so the progress bar stays accurate after top-ups
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS api_credits_cap  NUMERIC(10, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ;

-- Seed cap from current balance for existing subscribers
UPDATE public.users
SET api_credits_cap = api_credits
WHERE api_credits > 0;

-- Atomically raise cap to current balance (called after every top-up)
CREATE OR REPLACE FUNCTION public.sync_credits_cap(p_user_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.users
  SET api_credits_cap = GREATEST(api_credits_cap, api_credits)
  WHERE id = p_user_id;
$$;
