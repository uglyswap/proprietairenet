-- Migration: Add missing columns to organizations table
-- Date: 2026-05-10
-- Purpose: Enable MRR tracking, Stripe integration, and owner contact info

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_first_name TEXT;

-- Populate owner_email and owner_first_name from the users table
UPDATE organizations o 
SET owner_email = u.email, owner_first_name = u.first_name
FROM users u 
WHERE u.id = o.owner_id 
AND (o.owner_email IS NULL OR o.owner_first_name IS NULL);
