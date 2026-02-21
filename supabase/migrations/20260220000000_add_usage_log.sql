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

