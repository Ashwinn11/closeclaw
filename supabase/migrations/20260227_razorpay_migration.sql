-- ============================================================================
-- Migration: Switch from Dodo Payments to Razorpay
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- Rename dodo_subscription_id → razorpay_subscription_id
ALTER TABLE public.users
  RENAME COLUMN dodo_subscription_id TO razorpay_subscription_id;

-- Drop dodo_customer_id (Razorpay doesn't have a separate customer object;
-- subscriptions are linked directly to users via notes.user_id)
ALTER TABLE public.users
  DROP COLUMN IF EXISTS dodo_customer_id;

-- Confirm
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users';
