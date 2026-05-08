# Guide d'Administration - Cadastre Pro

## Vue d'ensemble

Votre application dispose maintenant d'un système d'administration complet qui vous permet de gérer tous les paramètres sans modifier le code.

## Accès au panneau admin

### 1. Créer le premier administrateur

Pour créer votre premier compte administrateur, vous devez exécuter une requête SQL dans Supabase :

```sql
-- Remplacez 'your-user-email@example.com' par votre email
UPDATE profiles
SET is_admin = true, role = 'admin'
WHERE email = 'your-user-email@example.com';
```

### 2. Accéder au dashboard admin

Une fois votre compte configuré en tant qu'admin :

1. Connectez-vous à l'application
2. Cliquez sur le bouton "Admin" dans le header du dashboard
3. Vous accédez au panneau d'administration

## Fonctionnalités du panneau admin

### Page Settings (Paramètres)

Cette page permet de configurer toutes les clés API et paramètres de l'application :

#### API Keys (Clés API)

**Cadastre API Key**
- Clé pour accéder à l'API cadastre française
- Type : Secret (masqué par défaut)

**Resend API Key**
- Clé pour envoyer des emails via Resend
- Type : Secret (masqué par défaut)
- Obtenir une clé : [resend.com](https://resend.com)

#### Stripe Configuration

**Stripe Secret Key**
- Clé secrète Stripe pour les paiements
- Type : Secret (masqué par défaut)
- Obtenir : Dashboard Stripe → Developers → API keys

**Stripe Publishable Key**
- Clé publique Stripe
- Type : Public
- Affichée dans le frontend

**Stripe Webhook Secret**
- Secret pour vérifier les webhooks Stripe
- Type : Secret (masqué par défaut)

#### General Settings (Paramètres généraux)

**App Name**
- Nom de l'application affiché aux utilisateurs
- Par défaut : "Cadastre Search App"

**Support Email**
- Email de contact pour le support
- Utilisé pour envoyer les emails

**Credits Per Search**
- Nombre de crédits consommés par recherche
- Par défaut : 1

### Page Pricing Plans (Tarifs)

Gérez les plans tarifaires de manière dynamique :

#### Fonctionnalités

**Créer un nouveau plan**
- Cliquez sur "Add New Plan"
- Le plan est créé désactivé par défaut

**Modifier un plan**
- Nom du plan
- Nombre de crédits inclus
- Prix (avec 2 décimales)
- Devise (EUR, USD, etc.)
- Liste des fonctionnalités
- Statut actif/inactif
- Ordre d'affichage

**Synchroniser avec Stripe**
- Cliquez sur "Sync with Stripe"
- Crée/met à jour automatiquement :
  - Le produit Stripe
  - Le prix Stripe
  - Archive l'ancien prix si modification

**Supprimer un plan**
- Cliquez sur "Delete"
- Confirmation requise

#### Affichage sur le frontend

- Les plans actifs s'affichent automatiquement sur `/pricing`
- Les modifications de prix et fonctionnalités sont instantanées
- Les plans désactivés ne sont pas visibles aux utilisateurs

## Système d'emails

### Configuration Resend

1. Créez un compte sur [resend.com](https://resend.com)
2. Obtenez votre clé API
3. Ajoutez-la dans Settings → Resend API Key
4. Configurez votre domaine d'envoi (dans Resend)

### Templates d'emails disponibles

Les templates suivants sont prêts à l'emploi :

**Email de bienvenue**
- Envoyé à l'inscription
- Affiche les crédits de départ
- Lien vers le dashboard

**Confirmation d'achat**
- Envoyé après un achat de crédits
- Récapitulatif de la transaction
- Détails des crédits ajoutés

### Envoyer un email depuis le code

```typescript
import { sendEmail, getWelcomeEmailTemplate } from '@/lib/email';

await sendEmail({
  to: 'user@example.com',
  subject: 'Bienvenue !',
  html: getWelcomeEmailTemplate('Jean Dupont', 10)
});
```

## Intégration Stripe

### Configuration

1. Créez un compte Stripe sur [stripe.com](https://stripe.com)
2. Dans le Dashboard Stripe :
   - Allez dans Developers → API keys
   - Copiez la Secret key et Publishable key
3. Dans votre panneau admin :
   - Collez les clés dans Settings → Stripe

### Synchronisation des tarifs

Lorsque vous modifiez un tarif :

1. Cliquez sur "Sync with Stripe" sur le plan
2. Le système :
   - Crée le produit Stripe (première fois)
   - Crée un nouveau prix Stripe
   - Archive l'ancien prix
   - Met à jour la base de données

### Important

- Les prix Stripe sont immuables
- Chaque modification crée un nouveau prix
- Les anciens prix sont archivés automatiquement
- Les nouveaux clients verront le nouveau prix
- Les abonnements existants gardent leur ancien prix

## Sécurité

### Row Level Security (RLS)

Toutes les tables sensibles sont protégées :

**app_settings**
- Lecture : Admin uniquement
- Écriture : Admin uniquement

**pricing_plans**
- Lecture : Utilisateurs authentifiés (plans actifs)
- Écriture : Admin uniquement

**profiles**
- Lecture : Propriétaire uniquement
- Écriture : Propriétaire uniquement

### Clés secrètes

- Toutes les clés secrètes sont masquées par défaut
- Cliquez sur l'icône œil pour afficher temporairement
- Jamais exposées dans le frontend
- Stockées en base de données avec RLS strict

## Bonnes pratiques

### Gestion des clés API

1. Ne partagez jamais vos clés API
2. Utilisez des clés de test en développement
3. Passez aux clés de production uniquement en production
4. Changez vos clés en cas de compromission

### Tarification

1. Testez les modifications sur un plan inactif
2. Activez seulement après validation
3. Synchronisez avec Stripe avant d'activer
4. Communiquez les changements aux utilisateurs

### Emails

1. Configurez un domaine d'envoi vérifié
2. Testez les emails avant la production
3. Respectez les lois anti-spam (RGPD, CAN-SPAM)
4. Incluez toujours un lien de désinscription

## Dépannage

### Les paramètres ne se sauvegardent pas

- Vérifiez que vous êtes bien admin
- Consultez les logs du navigateur
- Vérifiez la connexion à Supabase

### La synchronisation Stripe échoue

- Vérifiez que la clé Stripe est correcte
- Assurez-vous d'être en mode Live ou Test cohérent
- Consultez les logs Stripe

### Les emails ne partent pas

- Vérifiez la clé Resend
- Vérifiez que le domaine est vérifié dans Resend
- Consultez les logs Resend

## Support technique

Pour toute question ou problème :
- Consultez la documentation Supabase
- Consultez la documentation Stripe
- Consultez la documentation Resend
