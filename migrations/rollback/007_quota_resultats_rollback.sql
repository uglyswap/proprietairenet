-- =============================================================================
-- ROLLBACK 007 - Quota compté en résultats
-- =============================================================================
--
-- AVERTISSEMENT
-- Ce rollback supprime `monthly_results_used`, donc la consommation de la
-- période en cours. Les organisations repartiront avec un budget neuf. C'est
-- favorable à l'utilisateur, jamais l'inverse.
--
-- Le code (lib/search-quota.ts) redétecte l'absence de la colonne et cesse de
-- débiter, en le signalant dans les logs. Le quota devient alors non bloquant :
-- redémarrer le frontend après exécution.
--
-- CE ROLLBACK VERSIONNE UN OBJET QUI NE L'ÉTAIT PAS
-- Le trigger `trg_reverse_search_count` avait été créé directement en
-- production, sans figurer dans aucun dépôt. Sa définition, relevée par
-- `pg_dump --schema-only` le 2026-08-08, est reproduite ci-dessous à
-- l'identique. C'est désormais la seule trace versionnée de cet objet.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- 1. Recréation du trigger, à l'identique du relevé de production
-- -----------------------------------------------------------------------------
-- La fonction n'avait pas été supprimée par la migration : on ne la recrée que
-- si elle manque, pour rester idempotent.
CREATE OR REPLACE FUNCTION public.reverse_search_count_on_zero() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- If the search returned 0 results, decrement the monthly_searches_used counter
      IF NEW.results_count = 0 THEN
        UPDATE organizations
        SET monthly_searches_used = GREATEST(monthly_searches_used - 1, 0)
        WHERE id = NEW.organization_id;
        RAISE NOTICE 'Reversed search count for org % (0 results)', NEW.organization_id;
      END IF;
      RETURN NEW;
    END;
    $$;

DROP TRIGGER IF EXISTS trg_reverse_search_count ON public.search_history;

CREATE TRIGGER trg_reverse_search_count
  AFTER INSERT ON public.search_history
  FOR EACH ROW EXECUTE FUNCTION public.reverse_search_count_on_zero();

-- -----------------------------------------------------------------------------
-- 2. Retrait des colonnes de quota en résultats
-- -----------------------------------------------------------------------------
ALTER TABLE public.plans        DROP COLUMN IF EXISTS max_results_per_search;
ALTER TABLE public.plans        DROP COLUMN IF EXISTS monthly_results_limit;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS monthly_results_used;

-- `monthly_searches_used` retrouve son rôle : on retire le commentaire
-- d'obsolescence posé par la migration.
COMMENT ON COLUMN public.organizations.monthly_searches_used IS NULL;

COMMIT;

-- Vérification :
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_reverse_search_count';
--   -- attendu : 1 ligne
--   SELECT COUNT(*) FROM information_schema.columns
--    WHERE (table_name = 'organizations' AND column_name = 'monthly_results_used')
--       OR (table_name = 'plans' AND column_name IN ('monthly_results_limit','max_results_per_search'));
--   -- attendu : 0
