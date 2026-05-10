# Migrations Proprietaire.net

Fichiers de migration SQL pour la base de données PostgreSQL.

## Ordre d'exécution

Les fichiers doivent être exécutés dans l'ordre numérique :

1. `001_organizations_add_columns.sql` — Colonnes orgs (subscription, Stripe, owner)
2. `002_misc_add_columns.sql` — Colonnes users, drip, mail
3. `003_create_tables.sql` — Tables sessions, campaigns, saved_searches, audit_log

## Exécution

```bash
psql -h proprietaire-db -p 5432 -U proprietaire -d proprietaire -f migrations/001_organizations_add_columns.sql
psql -h proprietaire-db -p 5432 -U proprietaire -d proprietaire -f migrations/002_misc_add_columns.sql
psql -h proprietaire-db -p 5432 -U proprietaire -d proprietaire -f migrations/003_create_tables.sql
```

Ou via Docker :

```bash
docker exec -i proprietaire-db psql -U proprietaire -d proprietaire < migrations/001_organizations_add_columns.sql
docker exec -i proprietaire-db psql -U proprietaire -d proprietaire < migrations/002_misc_add_columns.sql
docker exec -i proprietaire-db psql -U proprietaire -d proprietaire < migrations/003_create_tables.sql
```

## Convention de nommage

`NNN_description.sql` — toujours un préfixe numérique à 3 chiffres.
