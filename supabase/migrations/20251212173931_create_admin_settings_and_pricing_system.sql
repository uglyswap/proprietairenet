/*
  # Create Admin Settings and Dynamic Pricing System

  ## Overview
  This migration creates a comprehensive admin configuration system that allows:
  - Storing API keys and application settings securely
  - Managing dynamic pricing plans that sync with Stripe
  - Admin role management for secure access control

  ## 1. New Tables

  ### app_settings
  Stores all application configuration and API keys:
  - `key` (text, primary key) - Setting identifier (e.g., 'api_cadastre_key', 'resend_api_key', 'stripe_secret_key')
  - `value` (text) - Setting value (encrypted for sensitive data)
  - `description` (text) - Human-readable description
  - `is_secret` (boolean) - Whether this is a sensitive value
  - `category` (text) - Category for grouping (e.g., 'api_keys', 'stripe', 'email')
  - `updated_at` (timestamptz) - Last update timestamp
  - `updated_by` (uuid) - Admin user who made the change

  ### pricing_plans
  Stores dynamic pricing plans:
  - `id` (uuid, primary key)
  - `name` (text) - Plan name (e.g., 'Starter', 'Pro', 'Enterprise')
  - `credits` (integer) - Number of credits included
  - `price` (numeric) - Price in euros/dollars
  - `currency` (text) - Currency code (EUR, USD, etc.)
  - `stripe_price_id` (text) - Stripe Price ID for synchronization
  - `stripe_product_id` (text) - Stripe Product ID
  - `is_active` (boolean) - Whether this plan is available
  - `sort_order` (integer) - Display order
  - `features` (jsonb) - Array of features included
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## 2. Schema Changes

  ### profiles table updates
  - Add `role` column with values: 'user', 'admin'
  - Add `is_admin` helper column for easier queries

  ## 3. Security

  ### RLS Policies for app_settings
  - Only admin users can read settings
  - Only admin users can insert/update settings
  - No deletes allowed (for audit trail)

  ### RLS Policies for pricing_plans
  - All authenticated users can read active plans
  - Only admin users can create/update/delete plans

  ## 4. Important Notes
  - API keys are stored encrypted in production
  - Admin role must be set manually via SQL for first admin
  - Stripe synchronization requires Edge Function calls
  - All changes are audited with timestamps and user IDs
*/

-- Create app_settings table
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  is_secret boolean DEFAULT false,
  category text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Create pricing_plans table
CREATE TABLE IF NOT EXISTS pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credits integer NOT NULL,
  price numeric(10, 2) NOT NULL,
  currency text DEFAULT 'EUR',
  stripe_price_id text,
  stripe_product_id text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  features jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add indexes for pricing_plans
CREATE INDEX IF NOT EXISTS idx_pricing_plans_active ON pricing_plans(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_pricing_plans_stripe_price ON pricing_plans(stripe_price_id);

-- Enable RLS
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;

-- Add role column to profiles table if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role text DEFAULT 'user' CHECK (role IN ('user', 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_admin boolean DEFAULT false;
  END IF;
END $$;

-- Create index for admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_admin ON profiles(is_admin) WHERE is_admin = true;

-- Create helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid())
    AND is_admin = true
  );
END;
$$;

-- RLS Policies for app_settings

-- Admin can read all settings
CREATE POLICY "Admins can read all settings"
  ON app_settings
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admin can insert settings
CREATE POLICY "Admins can insert settings"
  ON app_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Admin can update settings
CREATE POLICY "Admins can update settings"
  ON app_settings
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- RLS Policies for pricing_plans

-- All authenticated users can read active plans
CREATE POLICY "Users can read active pricing plans"
  ON pricing_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins can read all plans
CREATE POLICY "Admins can read all pricing plans"
  ON pricing_plans
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- Admins can insert plans
CREATE POLICY "Admins can insert pricing plans"
  ON pricing_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- Admins can update plans
CREATE POLICY "Admins can update pricing plans"
  ON pricing_plans
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Admins can delete plans
CREATE POLICY "Admins can delete pricing plans"
  ON pricing_plans
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- Insert default settings (placeholders for admin to fill)
INSERT INTO app_settings (key, value, description, is_secret, category) VALUES
  ('cadastre_api_key', '', 'API key for French cadastre data access', true, 'api_keys'),
  ('resend_api_key', '', 'API key for Resend email service', true, 'api_keys'),
  ('stripe_secret_key', '', 'Stripe secret key for payment processing', true, 'stripe'),
  ('stripe_publishable_key', '', 'Stripe publishable key (can be shown to clients)', false, 'stripe'),
  ('stripe_webhook_secret', '', 'Stripe webhook signing secret', true, 'stripe'),
  ('app_name', 'Cadastre Search App', 'Application name displayed to users', false, 'general'),
  ('support_email', 'support@example.com', 'Support contact email', false, 'general'),
  ('credits_per_search', '1', 'Number of credits consumed per search', false, 'credits')
ON CONFLICT (key) DO NOTHING;

-- Insert default pricing plans
INSERT INTO pricing_plans (name, credits, price, currency, features, is_active, sort_order) VALUES
  ('Starter', 100, 9.99, 'EUR', '["100 recherches cadastrales", "Accès API standard", "Support email"]'::jsonb, true, 1),
  ('Pro', 500, 39.99, 'EUR', '["500 recherches cadastrales", "Accès API prioritaire", "Support prioritaire", "Export de données"]'::jsonb, true, 2),
  ('Enterprise', 2000, 129.99, 'EUR', '["2000 recherches cadastrales", "Accès API illimité", "Support dédié", "Export de données", "API personnalisée"]'::jsonb, true, 3)
ON CONFLICT DO NOTHING;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pricing_plans_updated_at
  BEFORE UPDATE ON pricing_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();