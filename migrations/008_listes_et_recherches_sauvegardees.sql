-- =============================================================================
-- 008 - Listes de biens et recherches sauvegardées
-- =============================================================================
--
-- Base : proprietaire (container proprietaire-db, port hôte 5433)
-- Prérequis : aucun. Indépendante des migrations 004 à 007.
--
-- CE QU'ELLE CORRIGE
--
-- La fonctionnalité listes et favoris est cassée à CHAQUE étape, et le module
-- entier est pourtant vendu avec l'offre Pro :
--
-- 1. `property_list_items` n'existe pas du tout. Les quatre endpoints qui
--    l'interrogent lèvent un 42P01, remonté en HTTP 500 opaque. Ajouter un bien
--    à une liste, consulter une liste, en retirer un item et compter les items
--    échouent tous.
--
-- 2. `property_lists` existe mais sans `description`, `color` ni `updated_at`,
--    que le code écrit. Créer une liste échoue donc aussi, en amont.
--
-- 3. `saved_searches` porte `query_data` alors que le code écrit
--    `query_params`, et il lui manque `result_count` et `last_run_at`. Tout
--    POST renvoie 500.
--
-- Pour le point 3, c'est le CODE qui a été aligné sur la base (`query_data`) et
-- non l'inverse : ajouter une colonne `query_params` à côté de `query_data`
-- aurait créé deux colonnes de même sémantique, dont personne n'aurait su
-- laquelle fait foi. Cette migration n'ajoute que les deux colonnes réellement
-- absentes.
--
-- ADDITIVE : aucun DROP, aucun TRUNCATE. Les 3 tables concernées sont vides en
-- production (comptages-2026-08-08.txt), la création est donc sans risque de
-- données.
--
-- Rollback : migrations/rollback/008_listes_et_recherches_sauvegardees_rollback.sql
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- 1. property_lists : les trois colonnes manquantes
-- -----------------------------------------------------------------------------
ALTER TABLE public.property_lists
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.property_lists
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#3B82F6';

ALTER TABLE public.property_lists
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- -----------------------------------------------------------------------------
-- 2. property_list_items : la table absente
-- -----------------------------------------------------------------------------
-- Les colonnes reprennent exactement celles que le code nomme
-- (app/api/lists/items/route.ts). `data` conserve le résultat de recherche
-- complet, ce qui permet de réafficher un bien sans réinterroger le cadastre.
CREATE TABLE IF NOT EXISTS public.property_list_items (
  id                   uuid        DEFAULT gen_random_uuid() NOT NULL,
  list_id              uuid        NOT NULL,
  company_name         text,
  director_name        text,
  property_address     text,
  property_postal_code text,
  property_city        text,
  siren                text,
  data                 jsonb,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  CONSTRAINT property_list_items_pkey PRIMARY KEY (id)
);

-- ON DELETE CASCADE, volontairement.
--
-- Cinq clés étrangères vers users.id n'ont AUCUNE clause ON DELETE en
-- production, ce qui rend physiquement impossible la suppression d'un
-- utilisateur ayant une ligne d'audit : un obstacle direct à l'exercice du
-- droit à l'effacement. On ne reproduit pas ce défaut ici. Supprimer une liste
-- supprime ses items, ce qui est la sémantique attendue.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'property_list_items_list_id_fkey'
  ) THEN
    ALTER TABLE public.property_list_items
      ADD CONSTRAINT property_list_items_list_id_fkey
      FOREIGN KEY (list_id) REFERENCES public.property_lists(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Accès principal : lister les items d'une liste, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_property_list_items_list
  ON public.property_list_items (list_id, created_at DESC);

-- Recherche d'un item par propriétaire, utilisée pour la bascule favori.
CREATE INDEX IF NOT EXISTS idx_property_list_items_siren
  ON public.property_list_items (siren)
  WHERE siren IS NOT NULL;

COMMENT ON TABLE public.property_list_items IS
  'Biens enregistrés dans une liste. `data` conserve le résultat de recherche '
  'complet pour un réaffichage sans nouvelle interrogation du cadastre.';

-- -----------------------------------------------------------------------------
-- 3. saved_searches : les deux colonnes réellement absentes
-- -----------------------------------------------------------------------------
-- `query_params` n'est PAS ajoutée : le code a été aligné sur `query_data`, qui
-- existe déjà et porte la même sémantique que dans `search_history`.
ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS result_count integer DEFAULT 0;

ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz;

COMMENT ON COLUMN public.saved_searches.query_data IS
  'Critères de la recherche sauvegardée. Colonne canonique : le code écrivait '
  '`query_params`, qui n''a jamais existé. Aligné en 2026-08-10.';

-- Lecture des recherches d'une organisation, les plus récemment jouées d'abord.
CREATE INDEX IF NOT EXISTS idx_saved_searches_org
  ON public.saved_searches (organization_id, created_at DESC);

COMMIT;

-- =============================================================================
-- VÉRIFICATION
-- =============================================================================
--
-- La table existe avec ses 11 colonnes :
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'property_list_items' ORDER BY ordinal_position;
--   -- attendu : 11 lignes
--
-- La clé étrangère cascade bien :
--   SELECT conname, confdeltype FROM pg_constraint
--    WHERE conname = 'property_list_items_list_id_fkey';
--   -- attendu : confdeltype = 'c' (cascade)
--
-- Les colonnes ajoutées à property_lists et saved_searches :
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE (table_name = 'property_lists'  AND column_name IN ('description','color','updated_at'))
--       OR (table_name = 'saved_searches' AND column_name IN ('result_count','last_run_at'))
--    ORDER BY table_name, column_name;
--   -- attendu : 5 lignes
--
-- Contrôle de bout en bout depuis l'application, avec un compte Pro :
--   1. créer une liste                       -> 201
--   2. ajouter un résultat de recherche       -> 201
--   3. ouvrir la liste                        -> l'item apparaît
--   4. mettre en favori depuis les résultats   -> l'étoile reste allumée après rechargement
--   5. retirer l'item                          -> la liste est vide
--   6. supprimer la liste                      -> aucun item orphelin :
--      SELECT COUNT(*) FROM property_list_items i
--        LEFT JOIN property_lists l ON l.id = i.list_id WHERE l.id IS NULL;
--      -- attendu : 0
-- =============================================================================
