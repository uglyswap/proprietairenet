-- =============================================================================
-- 005 - Quota de recherches : rendre le "mensuel" reellement mensuel
-- =============================================================================
--
-- Base : proprietaire (container proprietaire-db, port hote 5433)
--
-- CE QU'ELLE CORRIGE
--
-- Le quota presente comme mensuel est en realite un quota A VIE. La fonction
-- reset_monthly_searches() existe bien en base, mais elle n'est appelee par
-- personne : ni pg_cron (non installe), ni endpoint applicatif, ni aucune
-- occurrence de son nom dans les deux depots. Consequence mesuree au
-- 2026-08-08 : les comptes ayant atteint leur plafond sont bloques
-- definitivement, pendant que l'interface leur affiche "ce mois-ci".
--
-- LA CORRECTION NE REBRANCHE PAS D'ORDONNANCEUR
--
-- Un cron peut etre oublie, desactive ou casse silencieusement, exactement
-- comme celui-ci l'a ete. La remise a zero est donc integree au chemin de
-- consommation (lib/auth.ts, checkSearchLimit) : elle s'execute a la premiere
-- recherche de chaque nouvelle periode, dans la meme requete atomique que
-- l'increment. Elle devient structurellement impossible a oublier.
--
-- Cette migration ne fait qu'ajouter la colonne de periode dont ce mecanisme a
-- besoin, et debloquer les comptes actuellement plafonnes.
--
-- ADDITIVE : aucun DROP, aucun TRUNCATE. La fonction reset_monthly_searches()
-- est CONSERVEE : elle reste utilisable pour une remise a zero manuelle.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- 1. Colonne de periode
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS monthly_searches_reset_at timestamptz;

COMMENT ON COLUMN public.organizations.monthly_searches_reset_at IS
  'Debut de la periode de quota en cours (date_trunc(''month'')). '
  'NULL declenche une remise a zero a la prochaine recherche.';

-- -----------------------------------------------------------------------------
-- 2. Deblocage des comptes plafonnes
-- -----------------------------------------------------------------------------
-- Les comptes bloques depuis la mise en service retrouvent leur quota.
-- On positionne la periode au mois courant pour que le compteur reparte
-- proprement, plutot que de laisser NULL qui declencherait une seconde remise
-- a zero a la premiere recherche.
UPDATE public.organizations
   SET monthly_searches_used     = 0,
       monthly_searches_reset_at = date_trunc('month', now()),
       updated_at                = now()
 WHERE monthly_searches_used > 0
    OR monthly_searches_reset_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Alignement du vocabulaire des plans
-- -----------------------------------------------------------------------------
-- La contrainte organizations_subscription_plan_check n'accepte que
-- 'free', 'starter', 'pro' et 'enterprise'. Or plans.slug porte 'gratuit' :
-- activer un abonnement sur ce plan violerait la contrainte, en HTTP 500.
-- Toutes les jointures entre plans et organizations sont par ailleurs vides,
-- ce qui explique un MRR affiche a 0.
--
-- 'free' est retenu comme valeur canonique : c'est celle que portent
-- deja les organisations et celle qu'impose la contrainte.
UPDATE public.plans
   SET slug = 'free'
 WHERE slug = 'gratuit'
   AND NOT EXISTS (SELECT 1 FROM public.plans WHERE slug = 'free');

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
--
-- La colonne existe :
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'organizations' AND column_name = 'monthly_searches_reset_at';
--
-- Plus aucun compte n'est plafonne :
--   SELECT COUNT(*) AS comptes_plafonnes
--     FROM organizations
--    WHERE monthly_searches_used >= monthly_searches_limit;
--   -- attendu : 0
--
-- Les jointures plans <-> organizations ne sont plus vides :
--   SELECT o.subscription_plan, COUNT(*) AS organisations, MAX(p.slug) AS plan_joint
--     FROM organizations o
--     LEFT JOIN plans p ON p.slug = o.subscription_plan
--    GROUP BY o.subscription_plan;
--   -- 'free' doit desormais joindre une ligne de plans
--
-- Aucune organisation ne porte un plan refuse par la contrainte :
--   SELECT DISTINCT subscription_plan FROM organizations;
--   -- doit etre inclus dans (free, starter, pro, enterprise)
--
-- ROLLBACK : migrations/rollback/005_quota_mensuel_rollback.sql
-- =============================================================================
