-- LemonSqueezy subscription tracking fields
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ls_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS ls_customer_id TEXT;

-- Atomic credit addition (for top-ups and renewals)
CREATE OR REPLACE FUNCTION public.add_api_credits(p_user_id UUID, p_amount DECIMAL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.users
  SET api_credits = api_credits + p_amount
  WHERE id = p_user_id;
$$;
