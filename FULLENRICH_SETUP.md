# Configuration FullEnrich

Ce guide explique comment configurer l'intégration FullEnrich pour l'enrichissement des contacts.

## 📋 Prérequis

1. Un compte FullEnrich (créez-en un sur [app.fullenrich.com](https://app.fullenrich.com/))
2. Votre projet Supabase configuré et déployé
3. Accès à votre dashboard Supabase

## 🔑 Étape 1 : Obtenir votre clé API FullEnrich

1. Connectez-vous à [app.fullenrich.com](https://app.fullenrich.com/)
2. Allez dans **Settings** > **API Keys**
3. Copiez votre clé API

## ⚙️ Étape 2 : Ajouter la clé API

### Option A : Via le Dashboard Admin (Recommandé) 🎯

1. Connectez-vous à votre application en tant qu'administrateur
2. Allez dans **Admin** > **Application Settings**
3. Dans la section **API Keys**, trouvez **Fullenrich Api Key**
4. Collez votre clé API FullEnrich
5. Cliquez sur **Save**

✅ **Avantages** :
- Pas besoin de redéployer l'application
- Modification immédiate
- Sécurisé et stocké dans la base de données
- Aucune manipulation de code requise

### Option B : Via le Dashboard Supabase

1. Allez sur [app.supabase.com](https://app.supabase.com)
2. Sélectionnez votre projet
3. Allez dans **Project Settings** > **Edge Functions** > **Secrets**
4. Cliquez sur **Add Secret**
5. Ajoutez :
   - **Name**: `FULLENRICH_API_KEY`
   - **Value**: Votre clé API FullEnrich
6. Cliquez sur **Save**

### Option C : Via le fichier .env local (Développement uniquement)

Ajoutez dans votre fichier `.env` :

```env
FULLENRICH_API_KEY=votre_cle_api_fullenrich_ici
```

⚠️ **Important** : Ne commitez jamais votre clé API dans Git !

### Ordre de priorité

L'application cherche la clé API dans cet ordre :
1. **Database** (table `app_settings`) - Configuré via Admin Dashboard
2. **Environment Variables** - Configuré via Supabase ou .env

💡 **Recommandation** : Utilisez l'option A (Admin Dashboard) pour faciliter la gestion et éviter les redéploiements.

## 🧪 Étape 3 : Tester l'intégration

1. Connectez-vous à votre application
2. Effectuez une recherche cadastrale
3. Révélez un propriétaire avec un dirigeant
4. Cliquez sur le bouton **"Enrichir"**
5. Vérifiez que vous obtenez les coordonnées du dirigeant

## 💰 Coûts des enrichissements

FullEnrich facture selon les données retournées :

| Type de donnée | Coût FullEnrich | Coût dans l'app |
|----------------|-----------------|-----------------|
| Email professionnel | 1 crédit | 1 crédit |
| Email personnel | 3 crédits | 3 crédits |
| Numéro de téléphone | 10 crédits | 10 crédits |

**Total maximum par enrichissement : 14 crédits**

## 🔒 Sécurité

- La clé API FullEnrich n'est **jamais** exposée côté client
- Tous les appels sont effectués via l'Edge Function Supabase
- Seuls les utilisateurs authentifiés peuvent enrichir des contacts
- Les admins ne consomment pas de crédits pour l'enrichissement

## 📊 Fonctionnalités

### Cache automatique
Les contacts enrichis sont automatiquement mis en cache. Si vous enrichissez deux fois la même personne, seul le premier enrichissement sera facturé.

### Système asynchrone
L'enrichissement utilise l'API asynchrone de FullEnrich avec un système de polling automatique qui vérifie le statut toutes les 3 secondes.

### Gestion des erreurs
- Crédits insuffisants : L'utilisateur est averti avant l'enrichissement
- Timeout : Maximum 60 secondes d'attente
- Échec API : Message d'erreur clair avec détails

## 🐛 Dépannage

### "FullEnrich API key not configured"

La clé API n'est pas configurée dans Supabase. Suivez l'étape 2.

### "Insufficient credits"

L'utilisateur n'a pas assez de crédits. Minimum 1 crédit requis pour lancer un enrichissement.

### "Délai d'attente dépassé"

L'enrichissement a pris plus de 60 secondes. L'enrichissement peut continuer côté FullEnrich et sera disponible dans le cache lors de la prochaine tentative.

### Pas de données retournées

FullEnrich n'a pas trouvé de coordonnées pour cette personne. Aucun crédit n'est déduit dans ce cas.

## 📝 Logs et Monitoring

Les logs de l'Edge Function sont disponibles dans :
- **Supabase Dashboard** > **Edge Functions** > **fullenrich** > **Logs**

Vous pouvez y voir :
- Les appels à l'API FullEnrich
- Les erreurs éventuelles
- Les temps de réponse
- Les crédits consommés

## 🔄 Mise à jour de la clé API

### Méthode rapide (Admin Dashboard)

1. Connectez-vous en tant qu'admin
2. Allez dans **Admin** > **Application Settings**
3. Modifiez **Fullenrich Api Key**
4. Cliquez sur **Save**
5. ✅ La nouvelle clé est active immédiatement

### Méthode alternative (Supabase Dashboard)

1. Allez dans **Project Settings** > **Edge Functions** > **Secrets**
2. Cliquez sur **Edit** à côté de `FULLENRICH_API_KEY`
3. Entrez la nouvelle clé
4. Cliquez sur **Save**
5. Redémarrez l'Edge Function (automatique dans la plupart des cas)

## 📞 Support

Pour toute question concernant :
- **FullEnrich** : [support@fullenrich.com](mailto:support@fullenrich.com)
- **Cette intégration** : Consultez les logs et la documentation du code
