-- Atomic credit deduction — clamps to 0, never goes negative
CREATE OR REPLACE FUNCTION public.deduct_api_credits(p_user_id UUID, p_amount DECIMAL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.users
  SET api_credits = GREATEST(0, api_credits - p_amount)
  WHERE id = p_user_id;
$$;

-- usage_log: one row per LLM API call routed through the CloseClaw proxy
CREATE TABLE public.usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,           -- 'openai' | 'anthropic' | 'google'
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own usage" ON public.usage_log
  FOR SELECT USING (auth.uid() = user_id);
