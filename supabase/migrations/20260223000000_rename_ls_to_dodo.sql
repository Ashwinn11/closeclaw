-- Migrate from LemonSqueezy to Dodo Payments: rename tracking columns
ALTER TABLE public.users
  RENAME COLUMN ls_subscription_id TO dodo_subscription_id;

ALTER TABLE public.users
  RENAME COLUMN ls_customer_id TO dodo_customer_id;
