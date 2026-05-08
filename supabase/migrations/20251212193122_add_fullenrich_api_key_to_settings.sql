/*
  # Add FullEnrich API Key to Application Settings

  1. New Settings
    - `fullenrich_api_key` - API key for FullEnrich contact enrichment service
      - Category: api_keys
      - Secret: true
      - Description: Used to enrich contact data with emails and phone numbers

  2. Notes
    - This allows admins to configure the FullEnrich API key from the dashboard
    - No need to modify environment variables or redeploy code
    - The edge function will read from this setting first, then fall back to env vars
*/

-- Add FullEnrich API key setting
INSERT INTO app_settings (key, value, description, is_secret, category) VALUES
  ('fullenrich_api_key', '', 'API key for FullEnrich contact enrichment (emails & phone numbers)', true, 'api_keys')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  is_secret = EXCLUDED.is_secret,
  category = EXCLUDED.category;
