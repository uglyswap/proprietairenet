# Configuration FullEnrich via Admin Dashboard

## Guide rapide

Ce guide explique comment configurer la clé API FullEnrich directement depuis le dashboard admin, sans toucher au code.

## Prérequis

- Avoir un compte administrateur sur l'application
- Avoir obtenu une clé API FullEnrich sur [app.fullenrich.com](https://app.fullenrich.com/)

## Étapes de configuration

### 1. Accéder au dashboard admin

1. Connectez-vous à votre application
2. Cliquez sur le bouton **Admin** dans l'en-tête (visible uniquement pour les administrateurs)
3. Cliquez sur **Application Settings** dans le menu de gauche

### 2. Configurer la clé API FullEnrich

1. Faites défiler jusqu'à la section **API Keys**
2. Trouvez le champ **Fullenrich Api Key**
   - Description : "API key for FullEnrich contact enrichment (emails & phone numbers)"
   - Type : Champ masqué (mot de passe) pour la sécurité
3. Cliquez sur l'icône "œil" pour révéler le champ si vous voulez voir ce que vous tapez
4. Collez votre clé API FullEnrich
5. Cliquez sur le bouton **Save** à droite du champ

### 3. Vérifier la configuration

1. Allez dans le **Dashboard** principal
2. Effectuez une recherche cadastrale
3. Révélez un propriétaire avec un dirigeant
4. Cliquez sur **Enrichir**
5. Si la configuration est correcte, l'enrichissement démarre

## Avantages de cette méthode

✅ **Pas de redéploiement** - Changement immédiat sans redémarrer l'application

✅ **Sécurisé** - La clé est stockée de manière sécurisée dans la base de données

✅ **Interface utilisateur** - Pas besoin d'accéder au code ou aux fichiers de configuration

✅ **Historique** - Les modifications sont tracées (date et utilisateur)

✅ **Facilité** - Changement de clé en quelques secondes

## Structure de la base de données

La clé est stockée dans la table `app_settings` :

| Colonne | Valeur |
|---------|--------|
| key | `fullenrich_api_key` |
| value | Votre clé API (chiffrée en production) |
| description | API key for FullEnrich contact enrichment (emails & phone numbers) |
| is_secret | `true` |
| category | `api_keys` |

## Ordre de priorité

L'Edge Function `fullenrich` cherche la clé API dans cet ordre :

1. **Table `app_settings`** (configuré via Admin Dashboard) ⭐ **Recommandé**
2. **Variable d'environnement** `FULLENRICH_API_KEY` (Supabase ou .env)

Si aucune clé n'est trouvée, l'utilisateur reçoit ce message d'erreur :
```
FullEnrich API key not configured. Please add it in Admin Settings > API Keys.
```

## Modification de la clé

Pour changer la clé API :

1. Retournez dans **Admin** > **Application Settings**
2. Modifiez le champ **Fullenrich Api Key**
3. Cliquez sur **Save**
4. ✅ La nouvelle clé est active immédiatement

Aucun redémarrage nécessaire !

## Sécurité

- ✅ La clé n'est visible que par les administrateurs
- ✅ Elle est affichée en mode "mot de passe" par défaut
- ✅ Elle n'est jamais exposée côté client
- ✅ Seules les Edge Functions côté serveur y ont accès
- ✅ Les modifications sont tracées avec l'ID de l'admin et la date

## Dépannage

### Le champ n'apparaît pas

- Vérifiez que vous êtes bien connecté en tant qu'administrateur
- Vérifiez que la migration de base de données a été appliquée
- Rechargez la page

### L'enrichissement ne fonctionne pas après configuration

- Vérifiez que vous avez cliqué sur **Save**
- Vérifiez que la clé API est correcte (pas d'espaces avant/après)
- Vérifiez que votre compte FullEnrich a des crédits
- Consultez les logs de l'Edge Function dans Supabase Dashboard

### Je veux supprimer la clé

Pour des raisons de sécurité, vous ne pouvez pas supprimer la clé, mais vous pouvez :
- La remplacer par une chaîne vide `""`
- La remplacer par une clé invalide
- Utiliser la variable d'environnement à la place

## Support

Pour toute question :
- Consultez `FULLENRICH_SETUP.md` pour plus de détails
- Vérifiez les logs de l'Edge Function `fullenrich`
- Contactez le support FullEnrich pour les questions liées à leur API
