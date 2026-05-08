/*
  # Add Credits Balance and Credits Used Columns

  This migration adds proper credit tracking columns to the profiles table.

  ## Changes
  1. Add `credits_balance` column - tracks available credits (migrated from existing `credits` column)
  2. Add `credits_used` column - tracks total credits used by the user
  3. Migrate existing `credits` data to `credits_balance`
  4. Update the `deduct_credits` function to use new column names

  ## Important Notes
  - This migration is safe and non-destructive
  - Existing credit values are preserved
  - The old `credits` column is kept for backward compatibility during transition
*/

-- Add new columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'credits_balance'
  ) THEN
    ALTER TABLE profiles ADD COLUMN credits_balance integer DEFAULT 0 NOT NULL;
    -- Migrate data from credits to credits_balance
    UPDATE profiles SET credits_balance = credits WHERE credits_balance = 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'credits_used'
  ) THEN
    ALTER TABLE profiles ADD COLUMN credits_used integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Update the deduct_credits function to use credits_balance
CREATE OR REPLACE FUNCTION deduct_credits(user_id_param uuid, credits_amount integer)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_credits integer;
BEGIN
  SELECT credits_balance INTO current_credits
  FROM profiles
  WHERE id = user_id_param
  FOR UPDATE;
  
  IF current_credits >= credits_amount THEN
    UPDATE profiles
    SET credits_balance = credits_balance - credits_amount,
        credits_used = credits_used + credits_amount,
        updated_at = now()
    WHERE id = user_id_param;
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;