export interface CadastreDirigeant {
  type: 'personne_physique' | 'personne_morale';
  nom?: string;
  prenoms?: string;
  denomination?: string;
  siren?: string;
  qualite?: string;
  date_naissance?: string;
}

export interface CadastreProprietaire {
  id?: string;
  denomination: string;
  forme_juridique?: string;
  adresse: string;
  code_postal?: string;
  ville?: string;
  type: 'personne_physique' | 'personne_morale';
  siren?: string;
  type_droit?: string;
  dirigeant?: string;
}

export interface CadastreEntreprise {
  siren: string;
  denomination: string;
  forme_juridique?: string;
  categorie_entreprise?: string;
  tranche_effectif?: string;
  date_creation?: string;
  etat_administratif?: string;
  dirigeants?: CadastreDirigeant[];
  siege?: {
    adresse?: string;
    code_postal?: string;
    commune?: string;
    latitude?: string;
    longitude?: string;
  };
}

export interface CadastrePropriete {
  id?: string;
  adresse: string;
  code_postal: string;
  ville: string;
  departement?: string;
  section?: string;
  numero_parcelle?: string;
  reference_cadastrale?: string;
  surface?: number;
  nature?: string;
  latitude?: number;
  longitude?: number;
}

export interface EnrichedContact {
  id?: string;
  firstname?: string;
  lastname?: string;
  company_name?: string;
  email_pro?: string;
  email_perso?: string;
  phone?: string;
  linkedin_url?: string;
  enriched_at?: string;
  credits_used?: number;
}

export interface CadastreResult {
  id?: string;
  proprietaire: CadastreProprietaire;
  entreprise?: CadastreEntreprise;
  proprietes: CadastrePropriete[];
  nombre_adresses: number;
  nombre_lots: number;
  revealed?: boolean;
  enriched?: boolean;
  enriched_contacts?: EnrichedContact[];
  reveal_cost?: number;
}

export interface CadastreApiResponse {
  success: boolean;
  query: any;
  resultats: CadastreResult[];
  total_proprietaires: number;
  total_lots: number;
  stats?: any;
}

export interface SearchQuery {
  adresse?: string;
  code_postal?: string;
  departement?: string;
  siren?: string;
  denomination?: string;
  limit?: number;
}

export interface GeographicSearchQuery {
  coordinates: number[][];
  departements?: string[];
  limit?: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface UserProfile {
  id: string;
  email: string;
  credits_balance: number;
  credits_used: number;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  is_admin: boolean;
  role: 'user' | 'admin';
  organization_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  siret?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  credits_balance: number;
  credits_used: number;
  subscription_plan: 'free' | 'starter' | 'pro' | 'enterprise';
  max_users: number;
  owner_id: string;
  created_at: string;
}

export interface MailTemplate {
  id: string;
  organization_id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SearchHistory {
  id: string;
  user_id: string;
  search_type: 'text' | 'map' | 'siren' | 'owner' | 'address' | 'batch' | 'reveal';
  query_data: any;
  results_count: number;
  credits_used: number;
  created_at: string;
}
