-- Migration: Add payment_details_json to studio_settings
-- Enables customizable studio payment credentials (PayPal, GCash QR, and Bank Transfer).

ALTER TABLE public.studio_settings
  ADD COLUMN IF NOT EXISTS payment_details_json jsonb DEFAULT NULL;

COMMENT ON COLUMN public.studio_settings.payment_details_json IS
  'Custom studio payment gateway credentials & account details (PayPal, GCash QR, Bank Transfer).';
