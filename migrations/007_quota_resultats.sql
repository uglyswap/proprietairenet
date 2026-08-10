-- =============================================================================
-- 007 - Quota compté en RÉSULTATS, et non en requêtes
-- =============================================================================
--
-- Base : proprietaire (container proprietaire-db, port hôte 5433)
-- Prérequis : 005_quota_mensuel.sql, pour `organizations.monthly_searches_reset_at`.
--             Sans elle, le compteur ne peut pas connaître sa période et le
--             quota reste volontairement non bloquant.
--
-- LE MODÈLE QU'ELLE MET EN PLACE
--   Gratuit : 10 résultats par mois. Nombre de recherches illimité.
--   Pro     : résultats mensuels illimités, 200 résultats maximum par recherche.
--
-- Un « résultat » est UN PROPRIÉTAIRE renvoyé, pas une parcelle.
--
-- CE QU'ELLE CORRIGE
--
-- 1. L'unité de comptage était la requête, pas le résultat.
--    `organizations.monthly_searches_used` compte des recherches. Le modèle
--    commercial parle de résultats. Une recherche renvoyant 40 propriétaires
--    coûtait autant qu'une recherche en renvoyant un seul.
--
-- 2. Le plafond par recherche n'existait nulle part en base.
--    Les 200 résultats de l'offre Pro n'étaient qu'une valeur par défaut codée
--    dans deux routes du frontend, invisible depuis le référentiel de plans.
--
-- 3. L'illimité n'était pas encodable.
--    `plans.monthly_searches_limit` est `integer DEFAULT 10`, sans convention
--    documentée pour l'illimité. La page tarifs le déduisait d'un `>= 999999`,
--    une sentinelle magique qui est aussi une valeur entière plausible.
--    Ici, `monthly_results_limit IS NULL` signifie illimité, explicitement.
--
-- 4. Le trigger `trg_reverse_search_count` devient faux. Voir section 3.
--
-- ADDITIVE, à une exception assumée et autorisée : le DROP TRIGGER de la
-- section 3. Le rollback le recrée à l'identique.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- 1. Compteur de résultats consommés
-- -----------------------------------------------------------------------------
-- Colonne NOUVELLE, et non réaffectation de `monthly_searches_used` : un nom qui
-- mentirait sur son unité est exactement le genre de piège qui a produit les
-- pannes de ce projet. L'ancienne colonne est conservée, non utilisée.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS monthly_results_used integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.organizations.monthly_results_used IS
  'Résultats de recherche (propriétaires) consommés sur la période courante. '
  'La période est portée par monthly_searches_reset_at. Remplace '
  'monthly_searches_used, dont l''unité était la requête.';

COMMENT ON COLUMN public.organizations.monthly_searches_used IS
  'OBSOLÈTE depuis la migration 007 : l''unité de facturation est le résultat, '
  'pas la requête. Conservée pour référence historique, plus lue par le code.';

-- -----------------------------------------------------------------------------
-- 2. Limites portées par le référentiel de plans
-- -----------------------------------------------------------------------------
-- NULL = illimité. Convention explicite, contrairement à la sentinelle 999999.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS monthly_results_limit integer;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_results_per_search integer NOT NULL DEFAULT 200;

COMMENT ON COLUMN public.plans.monthly_results_limit IS
  'Budget mensuel de résultats. NULL signifie ILLIMITÉ. Ne jamais utiliser de '
  'valeur sentinelle : 999999 est aussi un entier plausible.';

COMMENT ON COLUMN public.plans.max_results_per_search IS
  'Plafond de résultats renvoyés par une seule recherche. Protection contre '
  'l''aspiration massive, pas quota commercial.';

-- Valeurs du modèle. Le WHERE couvre les deux vocabulaires : `plans.slug` porte
-- encore `gratuit` si la migration 005 n'a pas été appliquée.
UPDATE public.plans
   SET monthly_results_limit  = 10,
       max_results_per_search = 10,
       updated_at             = now()
 WHERE lower(slug) IN ('free', 'gratuit');

UPDATE public.plans
   SET monthly_results_limit  = NULL,
       max_results_per_search = 200,
       updated_at             = now()
 WHERE lower(slug) IN ('pro', 'professionnel', 'enterprise', 'starter');

-- -----------------------------------------------------------------------------
-- 3. Retrait du trigger trg_reverse_search_count
-- -----------------------------------------------------------------------------
-- Ce trigger retranchait 1 à `monthly_searches_used` quand une recherche
-- renvoyait 0 résultat : c'est l'implémentation de « comptabilisés uniquement si
-- résultats », en unité REQUÊTE.
--
-- En unité RÉSULTAT, il n'a plus d'objet : une recherche sans résultat débite
-- naturellement zéro. Le conserver rendrait un résultat gratuit à chaque
-- recherche vide, et permettrait de reconstituer indéfiniment son budget en
-- enchaînant des recherches infructueuses.
--
-- La FONCTION est conservée : seul le déclencheur est retiré. Le rollback le
-- recrée à l'identique, ce qui versionne enfin cet objet créé directement en
-- production et absent de tout dépôt.
DROP TRIGGER IF EXISTS trg_reverse_search_count ON public.search_history;

COMMIT;

-- =============================================================================
-- VÉRIFICATION
-- =============================================================================
--
-- Les 3 colonnes existent :
--   SELECT table_name, column_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE (table_name = 'organizations' AND column_name = 'monthly_results_used')
--       OR (table_name = 'plans' AND column_name IN ('monthly_results_limit','max_results_per_search'))
--    ORDER BY table_name, column_name;
--   -- attendu : 3 lignes, monthly_results_limit NULLABLE
--
-- Les plans portent bien le modèle. ATTENTION : si ce SELECT ne renvoie pas
-- exactement 2 lignes, le référentiel de plans n'est pas celui qu'on croit et
-- la page tarifs affiche autre chose que ce qui est facturé.
--   SELECT slug, price_ht, monthly_results_limit, max_results_per_search
--     FROM plans ORDER BY sort_order;
--   -- attendu : free -> 10 / 10, pro -> NULL / 200
--
-- Le trigger a disparu, la fonction est conservée :
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_reverse_search_count';
--   -- attendu : 0 ligne
--   SELECT proname FROM pg_proc WHERE proname = 'reverse_search_count_on_zero';
--   -- attendu : 1 ligne
--
-- Aucune organisation ne démarre avec un compteur non nul :
--   SELECT COUNT(*) FROM organizations WHERE monthly_results_used <> 0;
--   -- attendu : 0
--
-- Contrôle de bout en bout, à faire depuis l'application :
--   1. compte gratuit, recherche renvoyant 4 résultats -> monthly_results_used = 4
--   2. même compte, recherche renvoyant 0 résultat     -> reste à 4
--   3. même compte, recherche large                     -> renvoie 6, tronqué,
--      quota.upgrade_requis = true, total_disponible > 6
--   4. recherche suivante -> HTTP 403, upgrade_required
--
-- ROLLBACK : migrations/rollback/007_quota_resultats_rollback.sql
-- =============================================================================
