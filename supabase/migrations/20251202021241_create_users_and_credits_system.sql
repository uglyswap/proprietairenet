/*
  # Create Users and Credits Management System

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text)
      - `credits` (integer, default 10 for free tier)
      - `subscription_tier` (text, default 'free')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `search_history`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `search_type` (text: 'text' or 'map')
      - `query_data` (jsonb)
      - `results_count` (integer)
      - `credits_used` (integer)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can only read/update their own profile
    - Users can only access their own search history

  3. Functions
    - Auto-create profile on user signup
    - Function to deduct credits safely
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  credits integer DEFAULT 10 NOT NULL,
  subscription_tier text DEFAULT 'free' NOT NULL CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  search_type text NOT NULL CHECK (search_type IN ('text', 'map')),
  query_data jsonb NOT NULL,
  results_count integer DEFAULT 0,
  credits_used integer DEFAULT 1,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own search history"
  ON search_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own search history"
  ON search_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own search history"
  ON search_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, credits, subscription_tier)
  VALUES (new.id, new.email, 10, 'free');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION deduct_credits(user_id_param uuid, credits_amount integer)
RETURNS boolean AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;