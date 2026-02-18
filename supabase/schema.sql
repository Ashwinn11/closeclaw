-- ============================================================================
-- CloseClaw Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ─── 1. Users table (extends Supabase Auth) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  plan TEXT DEFAULT 'none',             -- 'basic' | 'pro' | 'enterprise' | 'none'
  infra_credits DECIMAL DEFAULT 0,
  api_credits DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 2. Instances table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  gcp_instance_name TEXT,
  gcp_zone TEXT,
  internal_ip TEXT,
  external_ip TEXT,
  gateway_port INTEGER DEFAULT 18789,
  gateway_token TEXT,
  status TEXT DEFAULT 'available',      -- 'available' | 'claimed' | 'active' | 'error'
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 3. Channel connections table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.instances(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,                -- 'telegram' | 'discord' | 'slack'
  status TEXT DEFAULT 'pending',        -- 'pending' | 'paired' | 'active' | 'error'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 4. Auto-create user profile on signup ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any (prevents duplicate errors)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── 5. Row Level Security ──────────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Users can view their own instances
CREATE POLICY "Users can view own instances"
  ON public.instances FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view their own channel connections
CREATE POLICY "Users can view own channels"
  ON public.channel_connections FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (backend) can do everything — automatic via service_role key
