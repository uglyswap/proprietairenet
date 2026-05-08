# Cadastre Pro - Recherche de Propriétaires Immobiliers

Application SaaS professionnelle pour rechercher les propriétaires de biens immobiliers en France.

## 🚀 Fonctionnalités

### Recherche Textuelle
- Recherche par adresse et code postal
- Filtrage par département
- Résultats détaillés instantanés

### Recherche Géographique
- Sélection visuelle de zone sur carte interactive
- Dessin de polygones ou rectangles
- Analyse complète des propriétaires d'une zone

### Système de Crédits
- **Free**: 10 crédits gratuits à l'inscription
- **Pro**: 100 crédits/mois - 29€
- **Enterprise**: 1000 crédits/mois - 199€

### Enrichissement de Contacts (FullEnrich)
- Obtenir les emails professionnels des dirigeants (1 crédit)
- Obtenir les emails personnels (3 crédits)
- Obtenir les numéros de téléphone (10 crédits)
- Cache automatique pour éviter les doublons
- Système de polling pour résultats asynchrones

### Fonctionnalités Additionnelles
- Export des résultats en CSV
- Historique des recherches
- Interface responsive mobile/desktop
- Authentification sécurisée avec Supabase

## 🛠️ Stack Technique

- **Framework**: Next.js 13.5 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **Cartographie**: React-Leaflet + Leaflet Draw
- **Base de données**: Supabase (PostgreSQL)
- **Authentification**: Supabase Auth
- **Validation**: React Hook Form + Zod
- **State Management**: TanStack Query

## 📦 Installation

```bash
npm install --legacy-peer-deps
```

## 🔧 Configuration

Créer un fichier `.env` avec :

```env
NEXT_PUBLIC_SUPABASE_URL=votre_url_supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_anon_key

CADASTRE_API_URL=http://84.247.175.132:3013
CADASTRE_API_KEY=cadastre_master_key_2025_secure

# FullEnrich API - Optionnel, peut être configuré via Admin Dashboard
# Get your API key from https://app.fullenrich.com/
FULLENRICH_API_KEY=votre_cle_api_fullenrich
```

**Note** : La clé FullEnrich peut aussi être configurée directement depuis le dashboard admin dans **Admin > Application Settings > API Keys**, ce qui est la méthode recommandée.

## 🚀 Démarrage

```bash
# Développement
npm run dev

# Build production
npm run build

# Lancer en production
npm start
```

## 📊 Structure de la Base de Données

### Table `profiles`
- Profils utilisateurs avec crédits
- Tiers d'abonnement (free, pro, enterprise)
- Gestion automatique des crédits

### Table `search_history`
- Historique des recherches
- Type de recherche (text/map)
- Nombre de résultats et crédits utilisés

### Table `enriched_contacts`
- Coordonnées enrichies via FullEnrich
- Emails professionnels et personnels
- Numéros de téléphone
- Cache automatique pour éviter les coûts en double
- Tracking des crédits utilisés par enrichissement

## 🗺️ Utilisation de la Carte

1. Allez dans l'onglet "Recherche Carte"
2. Cliquez sur l'icône polygone (⬟) ou rectangle (▢) en haut à droite
3. Dessinez une zone sur la carte
4. La zone sera sauvegardée automatiquement

## ✨ Enrichissement des Contacts

Une fois qu'un propriétaire est révélé et qu'un dirigeant est identifié :

1. Cliquez sur le bouton **"Enrichir"** sur le résultat
2. Le système appelle FullEnrich pour obtenir :
   - Email professionnel (1 crédit)
   - Email personnel (3 crédits)
   - Numéro de téléphone (10 crédits)
3. Les résultats s'affichent dans une fenêtre avec copie rapide
4. Les contacts enrichis sont mis en cache pour éviter les coûts répétés

**Notes importantes :**
- Le coût varie entre 1 et 14 crédits selon les données disponibles
- Les admins ne paient pas de crédits pour l'enrichissement
- L'enrichissement est asynchrone et peut prendre quelques secondes
- Les résultats sont automatiquement sauvegardés dans votre compte

## 🔐 Sécurité

- API key cadastre stockée côté serveur uniquement
- Routes API protégées par authentification
- RLS (Row Level Security) activé sur toutes les tables
- Validation des données côté client et serveur

## 📱 Responsive Design

- Mobile: Vue carte plein écran avec drawer pour résultats
- Tablet: Layout vertical empilé
- Desktop: Layout 2 colonnes (sidebar + carte)

## 🎨 Thème

Couleurs professionnelles :
- **Primary**: Bleu (#4299E1 - hsl(220, 90%, 56%))
- **Secondary**: Vert (#2F855A - hsl(142, 76%, 36%))
- **Accent**: Orange (#F59E0B - hsl(47, 96%, 53%))

## 📝 License

© 2025 Cadastre Pro. Tous droits réservés.
