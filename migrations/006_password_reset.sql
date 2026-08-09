-- =============================================================================
-- 006 - Reinitialisation de mot de passe et revocation de session
-- =============================================================================
--
-- Base : proprietaire (container proprietaire-db, port hote 5433)
--
-- PERIMETRE VOLONTAIREMENT ETROIT
-- Cette migration n'ajoute que trois colonnes a `users`. Elle ne touche
-- deliberement PAS a `users.role_level`, qui fait l'objet d'un conflit non
-- resolu entre les lots 004 et 005 du dossier migrations-correctives (memes
-- nom de contrainte, DEFAULT et CHECK incompatibles). Melanger les deux
-- risquerait de faire perdre leurs droits aux comptes existants.
--
-- CE QU'ELLE CORRIGE
--
-- 1. La reinitialisation de mot de passe est impossible.
--    password_reset_token et password_reset_expires n'existent pas : l'UPDATE
--    de /api/auth/forgot-password levait systematiquement une erreur.
--
-- 2. Cette erreur en faisait un ORACLE D'ENUMERATION.
--    Email inconnu -> HTTP 200. Email connu -> HTTP 500. Le code promettait
--    pourtant explicitement de ne pas divulguer l'existence d'un compte.
--    Le correctif applicatif referme deja l'oracle sans cette migration ; la
--    migration retablit la fonctionnalite elle-meme.
--
-- 3. Changer son mot de passe ne chassait pas un intrus.
--    Le JWT HS256 reste valide 7 jours et ne porte ni jti ni version : aucune
--    session ne peut etre revoquee. `token_version` permet d'invalider d'un
--    coup toutes les sessions d'un utilisateur, ce que doit faire tout
--    changement de mot de passe.
--
-- ADDITIVE : aucun DROP, aucun TRUNCATE.
-- Rollback : migrations/rollback/006_password_reset_rollback.sql
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- 1. Jeton de reinitialisation
-- -----------------------------------------------------------------------------
-- Seul le hash SHA-256 du jeton est stocke : une fuite de la base ne livre pas
-- de jeton exploitable. Le code hashe le jeton recu avant de faire son lookup.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_reset_token text;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_reset_expires timestamptz;

COMMENT ON COLUMN public.users.password_reset_token IS
  'Hash SHA-256 du jeton de reinitialisation. Jamais le jeton en clair. '
  'Efface apres usage (usage unique).';

-- Lookup par jeton, sur les seules lignes qui en portent un.
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
  ON public.users (password_reset_token)
  WHERE password_reset_token IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Revocation de session
-- -----------------------------------------------------------------------------
-- Incrementer cette valeur invalide instantanement tous les JWT deja emis pour
-- l'utilisateur. A incrementer a chaque changement de mot de passe et a chaque
-- deconnexion globale demandee.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users.token_version IS
  'Version de session. Le JWT porte cette valeur ; toute difference invalide le '
  'jeton. Sans elle, changer son mot de passe ne deconnecte pas un intrus '
  'pendant les 7 jours de validite du jeton.';

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
--
-- Les 3 colonnes existent :
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'users'
--      AND column_name IN ('password_reset_token','password_reset_expires','token_version');
--   -- attendu : 3 lignes, token_version NOT NULL DEFAULT 0
--
-- Aucun utilisateur ne porte de jeton residuel :
--   SELECT COUNT(*) FROM users WHERE password_reset_token IS NOT NULL;
--   -- attendu : 0 juste apres migration
--
-- L'oracle est ferme : les deux appels doivent renvoyer le MEME statut et le
-- MEME corps.
--   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<hote>/api/auth/forgot-password \
--        -H 'Content-Type: application/json' -d '{"email":"inexistant@example.invalid"}'
--   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<hote>/api/auth/forgot-password \
--        -H 'Content-Type: application/json' -d '{"email":"<un compte reel>"}'
--   -- attendu : 200 dans les deux cas
--
-- Purge des jetons expires (a planifier) :
--   UPDATE users SET password_reset_token = NULL, password_reset_expires = NULL
--    WHERE password_reset_expires < now();
-- =============================================================================
