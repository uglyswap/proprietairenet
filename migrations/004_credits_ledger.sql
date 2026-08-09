-- =============================================================================
-- 004 - Journal de credits : idempotence, tracabilite monetaire, reconciliation
-- =============================================================================
--
-- Base : proprietaire (container proprietaire-db, port hote 5433)
-- Prerequis : aucun. Cette migration est independante des lots 004 a 009 du
--             dossier migrations-correctives, et peut etre appliquee avant eux.
--
-- CE QU'ELLE CORRIGE
--
-- 1. Le solde n'etait pas reconstructible.
--    Les consommations modifiaient organizations.credits_balance sans toujours
--    ecrire de ligne dans credit_transactions, alors que les remboursements en
--    ecrivaient une. L'invariant credits_balance = SUM(amount) etait donc faux
--    par construction, et aucun controle ne le signalait.
--
-- 2. Aucune idempotence sur le circuit d'argent.
--    organizations.stripe_customer_id et stripe_subscription_id ne sont pas
--    uniques, mail_history.service_postal_uid non plus : un rejeu de requete
--    ou de webhook debitait deux fois. La colonne `reference` avec son index
--    unique rend chaque mouvement rejouable sans effet de bord.
--
-- 3. Le chiffre d'affaires n'etait pas connaissable en base.
--    credit_transactions ne journalisait que des credits, jamais des euros.
--    `amount_eur_centimes` enregistre le montant reellement facture, et
--    `metadata` la decomposition cout prestataire / marge / TVA.
--
-- CETTE MIGRATION EST PUREMENT ADDITIVE
-- Aucun DROP, aucun TRUNCATE, aucune suppression de donnee. Elle n'ajoute que
-- des colonnes nullables, des index et deux vues. Le code deploye continue de
-- fonctionner sans elle : lib/credits.ts detecte les colonnes presentes et
-- s'adapte. L'appliquer active l'idempotence et la tracabilite monetaire.
--
-- Rollback fourni : migrations/rollback/004_credits_ledger_rollback.sql
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- 1. Colonnes du journal
-- -----------------------------------------------------------------------------

-- Cle d'idempotence. Nullable : les lignes historiques n'en ont pas.
ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS reference text;

COMMENT ON COLUMN public.credit_transactions.reference IS
  'Cle d''idempotence applicative (ex: "courrier:<uuid>", "stripe:<event_id>"). '
  'Deux appels portant la meme reference ne produisent qu''un seul mouvement.';

-- Solde apres application du mouvement : permet de rejouer l'historique et de
-- localiser precisement le point ou un ecart apparait.
ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS balance_after integer;

-- Montant reellement facture, en centimes d'euro. C'est ce qui rend le chiffre
-- d'affaires calculable : les credits seuls ne sont pas des euros.
ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS amount_eur_centimes integer;

COMMENT ON COLUMN public.credit_transactions.amount_eur_centimes IS
  'Montant facture en centimes d''euro. Positif pour un encaissement, negatif '
  'pour une depense. Sans cette colonne, seul Stripe connait le CA reel.';

-- Decomposition tarifaire et contexte (cout prestataire, marge, TVA, envoi_id).
ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- -----------------------------------------------------------------------------
-- 2. Index
-- -----------------------------------------------------------------------------

-- Unicite de la reference : c'est ce qui garantit l'idempotence.
-- Index partiel : les lignes historiques sans reference ne sont pas contraintes.
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_reference_key
  ON public.credit_transactions (reference)
  WHERE reference IS NOT NULL;

-- Reconciliation et affichage de l'historique par organisation.
CREATE INDEX IF NOT EXISTS idx_credit_transactions_org_date
  ON public.credit_transactions (organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. Vue de reconciliation
-- -----------------------------------------------------------------------------
-- Compare le solde enregistre a la somme du journal, organisation par
-- organisation. Une ligne avec ecart <> 0 signale un mouvement passe hors du
-- module de credits.
--
-- Cette vue ne corrige rien : une correction automatique masquerait la fuite.

CREATE OR REPLACE VIEW public.v_credits_reconciliation AS
SELECT
  o.id                                   AS organization_id,
  o.name                                 AS organization_name,
  o.credits_balance                      AS solde_enregistre,
  COALESCE(t.total, 0)                   AS solde_journal,
  o.credits_balance - COALESCE(t.total, 0) AS ecart,
  COALESCE(t.nb_mouvements, 0)           AS nb_mouvements,
  t.dernier_mouvement
FROM public.organizations o
LEFT JOIN (
  SELECT organization_id,
         SUM(amount)      AS total,
         COUNT(*)         AS nb_mouvements,
         MAX(created_at)  AS dernier_mouvement
    FROM public.credit_transactions
   GROUP BY organization_id
) t ON t.organization_id = o.id;

COMMENT ON VIEW public.v_credits_reconciliation IS
  'Controle de l''invariant credits_balance = SUM(credit_transactions.amount). '
  'Toute ligne avec ecart <> 0 doit etre investiguee, jamais corrigee en masse.';

-- -----------------------------------------------------------------------------
-- 4. Vue de chiffre d'affaires
-- -----------------------------------------------------------------------------
-- Ne devient significative qu'a partir des mouvements ecrits apres cette
-- migration : les lignes anterieures n'ont pas de montant en euros.

CREATE OR REPLACE VIEW public.v_revenus_mensuels AS
SELECT
  date_trunc('month', created_at)::date          AS mois,
  type,
  COUNT(*)                                       AS nb_mouvements,
  SUM(amount)                                    AS total_credits,
  SUM(COALESCE(amount_eur_centimes, 0))          AS total_centimes,
  SUM(COALESCE((metadata->>'marge_ht_centimes')::int, 0)) AS marge_ht_centimes
FROM public.credit_transactions
GROUP BY 1, 2;

COMMENT ON VIEW public.v_revenus_mensuels IS
  'Revenus et marge par mois et par type de mouvement. Ne couvre que les '
  'mouvements posterieurs a la migration 004.';

COMMIT;

-- =============================================================================
-- VERIFICATION (a executer apres COMMIT)
-- =============================================================================
--
-- Les 4 colonnes sont presentes :
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'credit_transactions'
--      AND column_name IN ('reference','balance_after','amount_eur_centimes','metadata');
--   -- attendu : 4 lignes
--
-- L'index unique est actif :
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'credit_transactions'
--      AND indexname = 'credit_transactions_reference_key';
--
-- Etat de l'invariant sur le parc existant. Un ecart est ATTENDU sur les
-- organisations creees avant la mise en place du module : le solde initial de
-- 10 credits offerts a bien une ligne 'bonus', mais toute consommation
-- anterieure passee hors journal apparaitra ici.
--   SELECT COUNT(*) AS organisations_en_ecart
--     FROM v_credits_reconciliation WHERE ecart <> 0;
--
-- Detail des ecarts :
--   SELECT * FROM v_credits_reconciliation WHERE ecart <> 0 ORDER BY abs(ecart) DESC;
--
-- L'idempotence fonctionne (doit lever une violation d'unicite au 2e INSERT) :
--   BEGIN;
--   INSERT INTO credit_transactions (organization_id, amount, type, description, reference)
--   SELECT id, 0, 'adjustment', 'test idempotence', 'test:migration-004'
--     FROM organizations LIMIT 1;
--   INSERT INTO credit_transactions (organization_id, amount, type, description, reference)
--   SELECT id, 0, 'adjustment', 'test idempotence', 'test:migration-004'
--     FROM organizations LIMIT 1;
--   -- attendu : ERROR duplicate key value violates unique constraint
--   ROLLBACK;
-- =============================================================================
