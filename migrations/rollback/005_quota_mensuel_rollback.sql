-- =============================================================================
-- ROLLBACK 005 - Quota mensuel
-- =============================================================================
--
-- AVERTISSEMENT
-- Supprimer monthly_searches_reset_at fait perdre la periode de quota en cours.
-- Le code (lib/auth.ts) redetecte l'absence de la colonne au demarrage suivant
-- et repasse au comportement precedent, c'est-a-dire un quota A VIE : les
-- comptes se rebloqueront definitivement des qu'ils atteindront leur plafond.
--
-- Ce rollback ne remet PAS les compteurs a leur valeur d'avant migration :
-- les comptes debloques restent debloques, ce qui est le comportement voulu.
--
-- Le renommage de plans.slug ('gratuit' -> 'free') n'est PAS annule : le
-- restaurer recasserait toutes les jointures et violerait a nouveau la
-- contrainte organizations_subscription_plan_check. Si la valeur 'gratuit'
-- doit imperativement revenir, il faut d'abord modifier cette contrainte, ce
-- qui sort du perimetre de ce rollback.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS monthly_searches_reset_at;

COMMIT;

-- Verification :
--   SELECT COUNT(*) FROM information_schema.columns
--    WHERE table_name = 'organizations' AND column_name = 'monthly_searches_reset_at';
--   -- attendu : 0
