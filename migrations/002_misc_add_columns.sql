-- Migration: Add missing columns to various tables
-- Date: 2026-05-10
-- Purpose: Enable user activity tracking, drip email sequencing, mail revenue

-- Users: track last login timestamp
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
UPDATE users SET last_login_at = last_login WHERE last_login IS NOT NULL AND last_login_at IS NULL;

-- Drip email queue: track step and email address
ALTER TABLE drip_email_queue ADD COLUMN IF NOT EXISTS step INTEGER DEFAULT 0;
ALTER TABLE drip_email_queue ADD COLUMN IF NOT EXISTS email TEXT;

-- Mail history: track price for revenue calculation
ALTER TABLE mail_history ADD COLUMN IF NOT EXISTS prix NUMERIC DEFAULT 0;
