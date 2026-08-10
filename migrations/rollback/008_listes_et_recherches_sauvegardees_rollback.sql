-- =============================================================================
-- ROLLBACK 008 - Listes de biens et recherches sauvegardées
-- =============================================================================
--
-- AVERTISSEMENT
-- Ce rollback SUPPRIME la table `property_list_items` et donc tous les biens
-- enregistrés dans des listes par les utilisateurs. Contrairement aux autres
-- rollbacks de ce dépôt, il détruit des données métier, pas seulement des
-- colonnes techniques.
--
-- Exporter AVANT d'exécuter :
--   \copy (SELECT * FROM property_list_items) TO 'property_list_items_avant_rollback.csv' CSV HEADER
--   \copy (SELECT id, name, description, color FROM property_lists) TO 'property_lists_avant_rollback.csv' CSV HEADER
--
-- Le code redétecte l'absence de la table au prochain appel (lib/db.ts
-- tableExiste, cache de 5 minutes) et repasse en réponse 503 explicite plutôt
-- qu'en 500 opaque. Il ne casse pas, mais la fonctionnalité listes redevient
-- indisponible.
--
-- `saved_searches.query_data` n'est PAS renommée en `query_params` : le code est
-- désormais aligné sur `query_data`, la renommer le recasserait.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DROP INDEX IF EXISTS public.idx_saved_searches_org;
ALTER TABLE public.saved_searches DROP COLUMN IF EXISTS last_run_at;
ALTER TABLE public.saved_searches DROP COLUMN IF EXISTS result_count;
COMMENT ON COLUMN public.saved_searches.query_data IS NULL;

DROP INDEX IF EXISTS public.idx_property_list_items_siren;
DROP INDEX IF EXISTS public.idx_property_list_items_list;
DROP TABLE IF EXISTS public.property_list_items;

ALTER TABLE public.property_lists DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.property_lists DROP COLUMN IF EXISTS color;
ALTER TABLE public.property_lists DROP COLUMN IF EXISTS description;

COMMIT;

-- Vérification :
--   SELECT COUNT(*) FROM information_schema.tables
--    WHERE table_name = 'property_list_items';
--   -- attendu : 0
--   SELECT COUNT(*) FROM information_schema.columns
--    WHERE (table_name = 'property_lists'  AND column_name IN ('description','color','updated_at'))
--       OR (table_name = 'saved_searches' AND column_name IN ('result_count','last_run_at'));
--   -- attendu : 0
