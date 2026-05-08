/*
  # Fix Security and Performance Issues

  This migration addresses the following issues identified by Supabase:

  ## 1. Performance Optimization
    - Add index on `search_history.user_id` to optimize foreign key queries
    - Optimize RLS policies by using `(select auth.uid())` to evaluate once per query instead of per row

  ## 2. Function Security
    - Set immutable search_path on functions to prevent security vulnerabilities
    - Functions: `handle_new_user` and `deduct_credits`

  ## 3. RLS Policy Updates
    - Profiles table: Optimize "Users can view own profile" and "Users can update own profile"
    - Search_history table: Optimize all RLS policies (view, insert, delete)

  ## Important Notes
    - These changes improve query performance at scale
    - Search path fixes prevent potential security exploits
    - Index on foreign key improves JOIN performance
*/

-- Add missing index on foreign key
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);

-- Drop and recreate RLS policies with optimized auth.uid() calls
-- Profiles table policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- Search_history table policies
DROP POLICY IF EXISTS "Users can view own search history" ON search_history;
CREATE POLICY "Users can view own search history"
  ON search_history FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own search history" ON search_history;
CREATE POLICY "Users can insert own search history"
  ON search_history FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own search history" ON search_history;
CREATE POLICY "Users can delete own search history"
  ON search_history FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Fix function security: set immutable search_path
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, credits, subscription_tier)
  VALUES (new.id, new.email, 10, 'free');
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION deduct_credits(user_id_param uuid, credits_amount integer)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_credits integer;
BEGIN
  SELECT credits INTO current_credits
  FROM profiles
  WHERE id = user_id_param
  FOR UPDATE;
  
  IF current_credits >= credits_amount THEN
    UPDATE profiles
    SET credits = credits - credits_amount,
        updated_at = now()
    WHERE id = user_id_param;
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;