-- =============================================================================
-- ROLLBACK 004 - Journal de credits
-- =============================================================================
--
-- AVERTISSEMENT
-- Ce rollback est DESTRUCTIF pour les donnees ajoutees par la migration :
-- il supprime les colonnes reference, balance_after, amount_eur_centimes et
-- metadata, donc l'historique d'idempotence ET la seule trace en euros des
-- mouvements posterieurs a la migration. Le chiffre d'affaires redevient
-- inconnaissable depuis la base.
--
-- Les lignes de credit_transactions elles-memes ne sont PAS supprimees : les
-- soldes restent corrects.
--
-- Avant de l'executer, exporter ce qui va disparaitre :
--   \copy (SELECT id, organization_id, created_at, amount, type, reference,
--                 amount_eur_centimes, metadata
--            FROM credit_transactions
--           WHERE reference IS NOT NULL OR amount_eur_centimes IS NOT NULL)
--     TO 'credits_avant_rollback_004.csv' CSV HEADER
--
-- Le code applicatif (lib/credits.ts) redetecte le schema au demarrage suivant
-- et repasse en mode degrade sans idempotence : il ne cassera pas, mais il
-- perdra la protection contre le double debit. Redemarrer le frontend apres
-- execution, ou appeler invaliderCacheSchema().
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DROP VIEW IF EXISTS public.v_revenus_mensuels;
DROP VIEW IF EXISTS public.v_credits_reconciliation;

DROP INDEX IF EXISTS public.idx_credit_transactions_org_date;
DROP INDEX IF EXISTS public.credit_transactions_reference_key;

ALTER TABLE public.credit_transactions DROP COLUMN IF EXISTS metadata;
ALTER TABLE public.credit_transactions DROP COLUMN IF EXISTS amount_eur_centimes;
ALTER TABLE public.credit_transactions DROP COLUMN IF EXISTS balance_after;
ALTER TABLE public.credit_transactions DROP COLUMN IF EXISTS reference;

COMMIT;

-- Verification : les 4 colonnes ont disparu, la table subsiste.
--   SELECT COUNT(*) FROM information_schema.columns
--    WHERE table_name = 'credit_transactions'
--      AND column_name IN ('reference','balance_after','amount_eur_centimes','metadata');
--   -- attendu : 0
--   SELECT COUNT(*) FROM credit_transactions;  -- inchange
