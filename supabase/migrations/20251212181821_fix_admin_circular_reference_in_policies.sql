/*
  # Fix Admin Circular Reference in RLS Policies

  1. Problem
    - The admin policies create a circular reference
    - To check if user is admin, they query profiles table
    - But to query profiles, RLS needs to check if user is admin
    - This creates a deadlock or access issues

  2. Solution
    - Remove the problematic admin policies
    - Keep only the original user policies that work correctly
    - Admins will use service role key for profile management operations

  3. Security Notes
    - Users can still only view/update their own profiles
    - Admin operations should use service role key through Edge Functions
    - This is more secure than using RLS for admin operations
*/

-- Drop the problematic admin policies that create circular reference
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- The original policies remain and work correctly:
-- "Users can view own profile" - allows users to see their own profile
-- "Users can update own profile" - allows users to update their own profile