/*
  # Fix Authentication Trigger Security Context
  
  This migration addresses the "Database error querying schema" issue by:
  
  1. Dropping and recreating the trigger function with proper security context
  2. Ensuring the function has all necessary permissions
  3. Setting proper search_path to avoid schema access issues
  4. Granting explicit permissions to avoid RLS conflicts during user creation
  
  The function will now:
  - Run with SECURITY DEFINER to bypass RLS
  - Have explicit schema qualification
  - Use proper error handling
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the function with proper security context
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Insert into profiles table, bypassing RLS due to SECURITY DEFINER
  INSERT INTO public.profiles (id, email, credits, subscription_tier, role, is_admin, credits_balance, credits_used)
  VALUES (
    NEW.id,
    NEW.email,
    10,
    'free',
    'user',
    false,
    10,
    0
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the auth process
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Ensure the profiles table has proper grants for the trigger
GRANT ALL ON public.profiles TO postgres;
GRANT ALL ON public.profiles TO service_role;
