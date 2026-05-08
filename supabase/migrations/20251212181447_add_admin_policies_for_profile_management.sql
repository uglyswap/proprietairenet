/*
  # Add Admin Policies for Profile Management

  1. Security Updates
    - Add policy for admins to view all profiles
    - Add policy for admins to update any profile
    - This allows admins to manage user credits and settings through the admin panel

  2. Important Notes
    - Existing user policies remain unchanged
    - Admins can now modify any user profile including their own
    - All changes respect existing RLS security model
*/

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );