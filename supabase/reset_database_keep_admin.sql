-- ============================================================================
-- Meru Art Studio: Complete Database Reset (Preserving Dev / Admin Account)
-- Project: ikeeddqgliobgfglytgr (https://supabase.com/dashboard/project/ikeeddqgliobgfglytgr)
-- ============================================================================
-- What this script does:
--   1. Ensures all required columns (payment_details_json, revisions, reviews) exist.
--   2. Validates & guarantees your dev account has role = 'artist' in app_metadata.
--   3. Wipes all test commissions, messages, WIP items, payments, timeline events,
--      notifications, and read states safely using dynamic cascade truncation.
--   4. Purges uploaded storage files (receipts, references, WIP passes) to prevent orphaned files.
--   5. Resets studio_settings (id = 1) to clean open defaults and real payment gateway credentials.
--   6. Purges non-admin test client accounts from auth.users, keeping your dev account intact.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 0: Guarantee Required Schema Columns Exist (Idempotent)
-- ----------------------------------------------------------------------------
ALTER TABLE public.studio_settings
  ADD COLUMN IF NOT EXISTS payment_details_json jsonb DEFAULT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wip_uploads') THEN
    ALTER TABLE public.wip_uploads
      ADD COLUMN IF NOT EXISTS revision_requested boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS revision_notes text,
      ADD COLUMN IF NOT EXISTS revision_category text,
      ADD COLUMN IF NOT EXISTS revision_scale text,
      ADD COLUMN IF NOT EXISTS revision_requested_at timestamptz;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'commissions') THEN
    ALTER TABLE public.commissions
      ADD COLUMN IF NOT EXISTS review_json jsonb;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- STEP 1: Safeguard and Guarantee the Dev / Admin Account
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  -- Specify your dev email here (or leave as NULL to auto-detect any user with role = 'artist'):
  v_dev_email text := 'mhelricbanaag102703@gmail.com'; 
  v_admin_count int := 0;
BEGIN
  -- 1. If dev email is provided, ensure it has the artist role in app_metadata
  IF v_dev_email IS NOT NULL AND trim(v_dev_email) <> '' THEN
    UPDATE auth.users
    SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "artist"}'::jsonb
    WHERE lower(email) = lower(trim(v_dev_email));
  END IF;

  -- 2. Count existing accounts with role = 'artist'
  SELECT count(*) INTO v_admin_count
  FROM auth.users
  WHERE (raw_app_meta_data->>'role') = 'artist';

  -- 3. Fail-safe: If no artist account exists yet, promote the most recently active account
  IF v_admin_count = 0 THEN
    UPDATE auth.users
    SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "artist"}'::jsonb
    WHERE id = (
      SELECT id FROM auth.users ORDER BY coalesce(last_sign_in_at, created_at) DESC LIMIT 1
    );

    SELECT count(*) INTO v_admin_count
    FROM auth.users
    WHERE (raw_app_meta_data->>'role') = 'artist';
  END IF;

  -- 4. Final safety check
  IF v_admin_count = 0 THEN
    RAISE NOTICE 'Notice: No existing users found in auth.users. You will start with a fresh signup.';
  ELSE
    RAISE NOTICE 'Safeguard passed: % dev/admin account(s) verified with role "artist".', v_admin_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- STEP 2: Safely Truncate All Existing Commission & Operational Tables
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'commission_read_state',
    'commission_events',
    'payments',
    'messages',
    'wip_uploads',
    'notification_logs',
    'commissions'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = v_tbl
    ) THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE;', v_tbl);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- STEP 3: Clean Test Storage Files (References, Receipts, WIPs)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id IN ('commission-references', 'commission-receipts', 'commission-wips');
  RAISE NOTICE 'Storage cleanup: Cleared commission test attachments and WIP files.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Storage notice: Could not clear storage.objects directly (safe to ignore if managed by Supabase API).';
END $$;

-- ----------------------------------------------------------------------------
-- STEP 4: Reset Studio Settings (id = 1) to Clean Default State
-- ----------------------------------------------------------------------------
INSERT INTO public.studio_settings (
  id,
  is_open,
  availability_status,
  max_slots,
  usd_to_php_rate,
  base_prices_json,
  multipliers_json,
  blocked_dates,
  payment_details_json,
  updated_at
) VALUES (
  1,
  true,
  'open',
  5,
  58.00,
  '{"headshot": 15, "halfbody": 25, "fullbody": 40, "chibi": 10, "graphics": 5}'::jsonb,
  '{"nsfw": 0.5, "softFurry": 0.5, "commercial": 2.0}'::jsonb,
  '[]'::jsonb,
  '{
    "paypalEmail": "mkun.arts@gmail.com",
    "paypalMeUsername": "mkunarts",
    "gcashNumber": "09455121351",
    "gcashName": "Mhelric Banaag",
    "gcashQrImageUrl": "/brand/gcash-qr.png",
    "bankName": "Bank of the Philippine Islands (BPI)",
    "bankAccountNumber": "9425-0182-44",
    "bankAccountName": "Mhelric Banaag",
    "instructionsNote": "Please include your Commission Code in the payment note/memo for instant verification."
  }'::jsonb,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  is_open = true,
  availability_status = 'open',
  max_slots = 5,
  usd_to_php_rate = 58.00,
  base_prices_json = '{"headshot": 15, "halfbody": 25, "fullbody": 40, "chibi": 10, "graphics": 5}'::jsonb,
  multipliers_json = '{"nsfw": 0.5, "softFurry": 0.5, "commercial": 2.0}'::jsonb,
  blocked_dates = '[]'::jsonb,
  payment_details_json = '{
    "paypalEmail": "mkun.arts@gmail.com",
    "paypalMeUsername": "mkunarts",
    "gcashNumber": "09455121351",
    "gcashName": "Mhelric Banaag",
    "gcashQrImageUrl": "/brand/gcash-qr.png",
    "bankName": "Bank of the Philippine Islands (BPI)",
    "bankAccountNumber": "9425-0182-44",
    "bankAccountName": "Mhelric Banaag",
    "instructionsNote": "Please include your Commission Code in the payment note/memo for instant verification."
  }'::jsonb,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- STEP 5: Purge Non-Admin Client Accounts from auth.users
-- ----------------------------------------------------------------------------
DELETE FROM auth.users
WHERE (raw_app_meta_data->>'role') IS DISTINCT FROM 'artist';

COMMIT;

-- ----------------------------------------------------------------------------
-- STEP 6: Verification Output
-- ----------------------------------------------------------------------------
-- 1. Display remaining dev/admin account(s):
SELECT 
  id as dev_account_id,
  email,
  raw_app_meta_data->>'role' as role,
  created_at,
  last_sign_in_at
FROM auth.users;

-- 2. Confirm core tables are cleanly cleared:
SELECT 
  (SELECT count(*) FROM public.commissions) as commissions_count,
  (SELECT count(*) FROM public.messages) as messages_count,
  (SELECT count(*) FROM public.wip_uploads) as wips_count,
  (SELECT count(*) FROM auth.users) as remaining_dev_accounts;
