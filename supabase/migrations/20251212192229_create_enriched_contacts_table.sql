/*
  # Create Enriched Contacts Table

  1. New Tables
    - `enriched_contacts`
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (uuid, foreign key) - User who requested enrichment
      - `person_name` (text) - Full name of the person
      - `company_name` (text) - Company name
      - `work_emails` (jsonb) - Array of professional emails
      - `personal_emails` (jsonb) - Array of personal emails
      - `phones` (jsonb) - Array of phone numbers
      - `linkedin_url` (text) - LinkedIn profile URL
      - `credits_used` (integer) - Credits consumed for this enrichment
      - `enrichment_id` (text) - FullEnrich enrichment ID
      - `status` (text) - Enrichment status (pending, completed, failed)
      - `raw_data` (jsonb) - Complete FullEnrich response
      - `created_at` (timestamptz) - When enrichment was requested
      - `completed_at` (timestamptz) - When enrichment completed

  2. Security
    - Enable RLS on `enriched_contacts` table
    - Add policy for users to view their own enrichments
    - Add policy for users to create enrichments
    - Add policy for admins to view all enrichments

  3. Indexes
    - Index on user_id for fast lookups
    - Index on person_name and company_name for search
*/

CREATE TABLE IF NOT EXISTS enriched_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  company_name text,
  work_emails jsonb DEFAULT '[]'::jsonb,
  personal_emails jsonb DEFAULT '[]'::jsonb,
  phones jsonb DEFAULT '[]'::jsonb,
  linkedin_url text,
  credits_used integer DEFAULT 0,
  enrichment_id text,
  status text DEFAULT 'pending',
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE enriched_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own enrichments"
  ON enriched_contacts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create enrichments"
  ON enriched_contacts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all enrichments"
  ON enriched_contacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_enriched_contacts_user_id ON enriched_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_enriched_contacts_person_name ON enriched_contacts(person_name);
CREATE INDEX IF NOT EXISTS idx_enriched_contacts_company ON enriched_contacts(company_name);
CREATE INDEX IF NOT EXISTS idx_enriched_contacts_status ON enriched_contacts(status);
