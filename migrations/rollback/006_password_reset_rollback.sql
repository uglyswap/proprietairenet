-- =============================================================================
-- ROLLBACK 006 - Reinitialisation de mot de passe et revocation de session
-- =============================================================================
--
-- AVERTISSEMENT
-- Supprimer token_version REACTIVE le defaut de securite qu'elle corrigeait :
-- plus aucune session ne pourra etre revoquee, et un changement de mot de passe
-- ne deconnectera plus un intrus pendant les 7 jours de validite du JWT.
--
-- Supprimer password_reset_token invalide de fait tous les liens de
-- reinitialisation en circulation. Les utilisateurs concernes devront relancer
-- la procedure, qui redeviendra elle-meme inoperante.
--
-- Le code applicatif redetecte l'absence des colonnes et repasse en mode
-- degrade : il continue de renvoyer une reponse unique, l'oracle d'enumeration
-- reste donc ferme. Redemarrer le frontend apres execution.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DROP INDEX IF EXISTS public.idx_users_password_reset_token;

ALTER TABLE public.users DROP COLUMN IF EXISTS token_version;
ALTER TABLE public.users DROP COLUMN IF EXISTS password_reset_expires;
ALTER TABLE public.users DROP COLUMN IF EXISTS password_reset_token;

COMMIT;

-- Verification :
--   SELECT COUNT(*) FROM information_schema.columns
--    WHERE table_name = 'users'
--      AND column_name IN ('password_reset_token','password_reset_expires','token_version');
--   -- attendu : 0
