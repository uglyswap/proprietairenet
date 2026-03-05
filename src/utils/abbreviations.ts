// Dictionnaire des types de voies (nature_voie)
export const NATURE_VOIE: Record<string, string> = {
  'ALL': 'Allée',
  'AV': 'Avenue',
  'BD': 'Boulevard',
  'CAR': 'Carrefour',
  'CHE': 'Chemin',
  'CHS': 'Chaussée',
  'CITE': 'Cité',
  'COR': 'Corniche',
  'CRS': 'Cours',
  'DOM': 'Domaine',
  'DSC': 'Descente',
  'ECA': 'Écart',
  'ESP': 'Esplanade',
  'FG': 'Faubourg',
  'GR': 'Grande Rue',
  'HAM': 'Hameau',
  'HLE': 'Halle',
  'IMP': 'Impasse',
  'LD': 'Lieu-dit',
  'LOT': 'Lotissement',
  'MAR': 'Marché',
  'MTE': 'Montée',
  'PAS': 'Passage',
  'PL': 'Place',
  'PLN': 'Plaine',
  'PLT': 'Plateau',
  'PRO': 'Promenade',
  'PRV': 'Parvis',
  'QUA': 'Quartier',
  'QUAI': 'Quai',
  'RES': 'Résidence',
  'RLE': 'Ruelle',
  'ROC': 'Rocade',
  'RPT': 'Rond-point',
  'RTE': 'Route',
  'RUE': 'Rue',
  'SEN': 'Sente',
  'SQ': 'Square',
  'TPL': 'Terre-plein',
  'TRA': 'Traverse',
  'VLA': 'Villa',
  'VLGE': 'Village',
  'VOI': 'Voie',
  'ZA': 'Zone d\'Activité',
  'ZAC': 'Zone d\'Aménagement Concerté',
  'ZAD': 'Zone d\'Aménagement Différé',
  'ZI': 'Zone Industrielle',
  'ZUP': 'Zone à Urbaniser en Priorité',
};

// Dictionnaire des codes droit (type de propriété)
export const CODE_DROIT: Record<string, string> = {
  'P': 'Propriétaire',
  'U': 'Usufruitier',
  'N': 'Nu-propriétaire',
  'B': 'Bailleur à construction',
  'R': 'Preneur à construction',
  'F': 'Foncier',
  'T': 'Ténuyer',
  'D': 'Domanier',
  'V': 'Bailleur d\'emphytéose',
  'W': 'Preneur d\'emphytéose',
  'A': 'Locataire-attributaire',
  'E': 'Emphytéote',
  'K': 'Antichrésiste',
  'L': 'Fonctionnaire logé',
  'G': 'Gérant, mandataire, gestionnaire',
  'S': 'Syndic de copropriété',
  'H': 'Associé dans une société en transparence fiscale',
  'O': 'Autorisation d\'occupation temporaire',
  'J': 'Jeune agriculteur',
  'Q': 'Gestionnaire taxe bureaux',
  'X': 'La Poste occupant et propriétaire',
  'Y': 'La Poste occupant et non propriétaire',
  'C': 'Fiduciaire',
  'M': 'Occupant d\'une parcelle appartenant au département',
  'Z': 'Gestionnaire d\'un bien de l\'État',
  'I': 'Occupant temporaire du domaine public',
};

// Dictionnaire des groupes de personnes
export const GROUPE_PERSONNE: Record<string, string> = {
  '0': 'Groupement de droit privé non doté de la personnalité morale (société créée de fait)',
  '1': 'Personne physique',
  '2': 'Personne morale (PM) de droit privé avec forme juridique',
  '3': 'PM de droit public soumise au droit commercial',
  '4': 'PM de droit public soumise à un statut particulier',
  '5': 'Établissement public national à caractère scientifique, culturel ou professionnel',
  '6': 'PM comprenant une entité publique (État, collectivité territoriale, établissement public)',
  '7': 'PM de droit privé sans forme juridique',
  '8': 'Société civile de droit privé',
  '9': 'Groupement de droit public non doté de la personnalité morale',
};

// Dictionnaire des formes juridiques (principales)
// Inclut les abréviations textuelles ET les codes numériques INSEE
export const FORME_JURIDIQUE: Record<string, string> = {
  // Personnes physiques
  '': 'Non spécifié',

  // Entreprises individuelles
  'EI': 'Entrepreneur Individuel',
  'EIRL': 'Entrepreneur Individuel à Responsabilité Limitée',

  // Sociétés commerciales
  'SA': 'Société Anonyme',
  'SAS': 'Société par Actions Simplifiée',
  'SASU': 'Société par Actions Simplifiée Unipersonnelle',
  'SARL': 'Société à Responsabilité Limitée',
  'EURL': 'Entreprise Unipersonnelle à Responsabilité Limitée',
  'SNC': 'Société en Nom Collectif',
  'SCS': 'Société en Commandite Simple',
  'SCA': 'Société en Commandite par Actions',
  'SE': 'Société Européenne',

  // Sociétés civiles
  'SCI': 'Société Civile Immobilière',
  'SCPI': 'Société Civile de Placement Immobilier',
  'SCP': 'Société Civile Professionnelle',
  'SCM': 'Société Civile de Moyens',
  'SC': 'Société Civile',
  'SCEA': 'Société Civile d\'Exploitation Agricole',
  'GAEC': 'Groupement Agricole d\'Exploitation en Commun',
  'EARL': 'Exploitation Agricole à Responsabilité Limitée',

  // Coopératives et mutuelles
  'SCOP': 'Société Coopérative et Participative',
  'SCIC': 'Société Coopérative d\'Intérêt Collectif',
  'COOP': 'Coopérative',

  // Associations et fondations
  'ASSO': 'Association',
  'FOND': 'Fondation',

  // Secteur public
  'EPIC': 'Établissement Public Industriel et Commercial',
  'EPA': 'Établissement Public Administratif',
  'EPCI': 'Établissement Public de Coopération Intercommunale',
  'SEM': 'Société d\'Économie Mixte',
  'SPL': 'Société Publique Locale',
  'GIP': 'Groupement d\'Intérêt Public',

  // Autres
  'GIE': 'Groupement d\'Intérêt Économique',
  'SEL': 'Société d\'Exercice Libéral',
  'SELARL': 'Société d\'Exercice Libéral à Responsabilité Limitée',
  'SELAS': 'Société d\'Exercice Libéral par Actions Simplifiée',
  'SEP': 'Société en Participation',
  'INDIV': 'Indivision',
  'COPRO': 'Copropriété',
  'SYND': 'Syndicat',

  // ========================================
  // Codes numériques INSEE (catégories juridiques)
  // Source: nomenclature officielle INSEE des catégories juridiques
  // ========================================

  // 1xxx - Personnes physiques
  '1000': 'Entrepreneur individuel',

  // 2xxx - Indivisions et groupements de fait
  '2110': 'Indivision entre personnes physiques',
  '2120': 'Indivision avec personne morale',
  '2210': 'Société créée de fait entre personnes physiques',
  '2220': 'Société créée de fait avec personne morale',
  '2310': 'Société en participation entre personnes physiques',
  '2320': 'Société en participation avec personne morale',
  '2385': 'Société en participation de professions libérales',
  '2400': 'Fiducie',
  '2700': 'Paroisse hors concordat',
  '2900': 'Autre groupement de droit privé non doté de la personnalité morale',

  // 3xxx - Personnes morales de droit étranger
  '3110': 'Représentation ou agence commerciale d\'état étranger',
  '3120': 'Société commerciale étrangère immatriculée au RCS',
  '3205': 'Organisation internationale',
  '3210': 'État, collectivité ou établissement public étranger',
  '3220': 'Société étrangère non immatriculée au RCS',
  '3290': 'Autre personne morale de droit étranger',

  // 4xxx - Personnes physiques avec activité agricole ou artisanale
  '4110': 'Exploitant agricole',
  '4120': 'Ancien exploitant agricole',
  '4130': 'Cotisant solidaire (MSA)',
  '4140': 'Exploitant agricole ou ancien exploitant',
  '4150': 'Cotisant de solidarité',
  '4160': 'Conjoint exploitant',

  // 5xxx - Sociétés commerciales
  // 51xx - SARL
  '5191': 'Société de caution mutuelle',
  '5192': 'Société coopérative de banque populaire',
  '5193': 'Caisse de crédit maritime mutuel',
  '5194': 'Caisse (fédérale) de crédit mutuel',
  '5195': 'Association coopérative inscrite (droit local Alsace-Moselle)',
  '5196': 'Caisse d\'épargne et de prévoyance à forme coopérative',
  '5202': 'Société en nom collectif',
  '5203': 'Société en nom collectif coopérative',
  '5306': 'Société en commandite simple',
  '5307': 'Société en commandite simple coopérative',
  '5308': 'Société en commandite par actions',
  '5309': 'Société en commandite par actions coopérative',
  '5370': 'Société de participations financières de professions libérales SA à CdA',
  '5385': 'Société d\'exercice libéral en commandite par actions',
  '5410': 'SARL nationale',
  '5415': 'SARL d\'économie mixte',
  '5422': 'SARL immobilière pour le commerce et l\'industrie',
  '5426': 'SARL immobilière de gestion',
  '5430': 'SARL d\'aménagement foncier et d\'équipement rural',
  '5431': 'SARL mixte d\'intérêt agricole',
  '5432': 'SARL d\'intérêt collectif agricole',
  '5442': 'SARL immobilière de copropriété',
  '5443': 'SARL artisanale',
  '5451': 'SARL coopérative de construction',
  '5453': 'SARL coopérative artisanale',
  '5454': 'SARL coopérative d\'intérêt maritime',
  '5455': 'SARL coopérative de transport',
  '5458': 'SARL coopérative ouvrière de production (SCOP)',
  '5459': 'SARL union de coopératives',
  '5460': 'Autre SARL coopérative',
  '5470': 'Société de participations financières de professions libérales SARL',
  '5485': 'Société d\'exercice libéral à responsabilité limitée',
  '5498': 'SARL unipersonnelle (EURL)',
  '5499': 'Société à responsabilité limitée (SARL)',
  '5505': 'SA à participation ouvrière à conseil d\'administration',
  '5510': 'SA nationale à conseil d\'administration',
  '5515': 'SA d\'économie mixte à conseil d\'administration',
  '5520': 'Société d\'investissement à capital variable (SICAV) à CdA',
  '5522': 'SA immobilière pour le commerce et l\'industrie à CdA',
  '5525': 'SA immobilière d\'investissement à CdA',
  '5530': 'SA d\'aménagement foncier et d\'équipement rural à CdA',
  '5531': 'SA mixte d\'intérêt agricole à CdA',
  '5532': 'SA d\'intérêt collectif agricole à CdA',
  '5542': 'SA immobilière de copropriété à CdA',
  '5543': 'SA de construction d\'attribution à CdA',
  '5546': 'SA coopérative de construction à CdA',
  '5547': 'SA coopérative de production HLM à CdA',
  '5548': 'SA de crédit immobilier à CdA',
  '5551': 'SA coopérative de consommation à CdA',
  '5552': 'SA coopérative de commerçants-détaillants à CdA',
  '5553': 'SA coopérative artisanale à CdA',
  '5554': 'SA coopérative (d\'intérêt) maritime à CdA',
  '5555': 'SA coopérative de transport à CdA',
  '5558': 'SA coopérative ouvrière de production (SCOP) à CdA',
  '5559': 'SA union de coopératives à CdA',
  '5560': 'Autre SA coopérative à conseil d\'administration',
  '5570': 'Société de participations financières de professions libérales SA à CdA',
  '5585': 'Société d\'exercice libéral à forme anonyme à CdA',
  '5599': 'Société anonyme à conseil d\'administration',
  '5605': 'SA à participation ouvrière à directoire',
  '5610': 'SA nationale à directoire',
  '5615': 'SA d\'économie mixte à directoire',
  '5620': 'SICAV à directoire',
  '5622': 'SA immobilière pour le commerce et l\'industrie à directoire',
  '5625': 'SA immobilière d\'investissement à directoire',
  '5630': 'SA d\'aménagement foncier et d\'équipement rural à directoire',
  '5631': 'SA mixte d\'intérêt agricole à directoire',
  '5632': 'SA d\'intérêt collectif agricole à directoire',
  '5642': 'SA immobilière de copropriété à directoire',
  '5643': 'SA de construction d\'attribution à directoire',
  '5646': 'SA coopérative de construction à directoire',
  '5647': 'SA coopérative de production HLM à directoire',
  '5648': 'SA de crédit immobilier à directoire',
  '5651': 'SA coopérative de consommation à directoire',
  '5652': 'SA coopérative de commerçants-détaillants à directoire',
  '5653': 'SA coopérative artisanale à directoire',
  '5654': 'SA coopérative d\'intérêt maritime à directoire',
  '5655': 'SA coopérative de transport à directoire',
  '5658': 'SA coopérative ouvrière de production (SCOP) à directoire',
  '5659': 'SA union de coopératives à directoire',
  '5660': 'Autre SA coopérative à directoire',
  '5670': 'Société de participations financières de professions libérales SA à directoire',
  '5685': 'Société d\'exercice libéral à forme anonyme à directoire',
  '5699': 'Société anonyme à directoire',
  '5710': 'Société par actions simplifiée (SAS)',
  '5720': 'Société par actions simplifiée unipersonnelle (SASU)',
  '5770': 'Société de participations financières de professions libérales SAS',
  '5785': 'Société d\'exercice libéral par actions simplifiée',
  '5800': 'Société européenne',

  // 6xxx - Sociétés civiles
  '6100': 'Caisse d\'épargne et de prévoyance',
  '6210': 'Groupement européen d\'intérêt économique (GEIE)',
  '6220': 'Groupement d\'intérêt économique (GIE)',
  '6316': 'Coopérative d\'utilisation de matériel agricole en commun (CUMA)',
  '6317': 'Société coopérative agricole',
  '6318': 'Union de sociétés coopératives agricoles',
  '6411': 'Société d\'assurance à forme mutuelle',
  '6511': 'Sociétés interprofessionnelles de soins ambulatoires',
  '6521': 'Société civile de placement collectif immobilier (SCPI)',
  '6532': 'Société civile d\'intérêt collectif agricole (SICA)',
  '6533': 'Groupement agricole d\'exploitation en commun (GAEC)',
  '6534': 'Groupement foncier agricole',
  '6535': 'Groupement agricole foncier',
  '6536': 'Groupement forestier',
  '6537': 'Groupement pastoral',
  '6538': 'Groupement foncier et rural',
  '6539': 'Société civile foncière',
  '6540': 'Société civile immobilière (SCI)',
  '6541': 'SCI de construction-vente',
  '6542': 'SCI d\'attribution',
  '6543': 'SCI coopérative de construction',
  '6544': 'SCI d\'accession progressive à la propriété',
  '6551': 'Société civile coopérative de consommation',
  '6554': 'Société civile coopérative d\'intérêt maritime',
  '6558': 'Société civile coopérative entre médecins',
  '6560': 'Autre société civile coopérative',
  '6561': 'SCP d\'avocats',
  '6562': 'SCP d\'avocats aux conseils',
  '6563': 'SCP d\'avoués près les cours d\'appel',
  '6564': 'SCP de commissaires-priseurs',
  '6565': 'SCP d\'huissiers de justice',
  '6566': 'SCP de notaires',
  '6567': 'SCP d\'officiers ministériels',
  '6568': 'SCP de médecins',
  '6569': 'SCP de dentistes',
  '6571': 'SCP d\'infirmiers',
  '6572': 'SCP de masseurs-kinésithérapeutes',
  '6573': 'SCP de directeurs de laboratoire d\'analyse médicale',
  '6574': 'SCP de vétérinaires',
  '6575': 'SCP de géomètres-experts',
  '6576': 'SCP d\'architectes',
  '6577': 'SCP d\'experts-comptables',
  '6578': 'SCP de commissaires aux comptes',
  '6585': 'Autre société civile professionnelle',
  '6588': 'Société civile loi 1820',
  '6589': 'Société civile de moyens',
  '6595': 'Caisse locale de crédit mutuel',
  '6596': 'Caisse de crédit agricole mutuel',
  '6597': 'Société civile d\'exploitation agricole (SCEA)',
  '6598': 'Exploitation agricole à responsabilité limitée (EARL)',
  '6599': 'Autre société civile',
  '6901': 'Autre personne de droit privé inscrite au RCS',

  // 7xxx - Personnes morales de droit public
  '7111': 'Autorité constitutionnelle',
  '7112': 'Autorité administrative ou publique indépendante',
  '7113': 'Ministère',
  '7120': 'Service central d\'un ministère',
  '7150': 'Service du ministère de la Défense',
  '7160': 'Service déconcentré à compétence nationale d\'un ministère',
  '7171': 'Service déconcentré de l\'État à compétence (inter)régionale',
  '7172': 'Service déconcentré de l\'État à compétence (inter)départementale',
  '7179': 'Autre service déconcentré',
  '7190': 'Échelon local',
  '7210': 'Commune et commune nouvelle',
  '7220': 'Département',
  '7225': 'Collectivité et territoire d\'Outre-Mer',
  '7229': 'Autre collectivité territoriale',
  '7230': 'Région',
  '7312': 'Commune associée et commune déléguée',
  '7313': 'Section de commune',
  '7314': 'Ensemble urbain',
  '7321': 'Association syndicale autorisée',
  '7322': 'Association foncière urbaine',
  '7323': 'Association foncière de remembrement',
  '7331': 'Établissement public local d\'enseignement',
  '7340': 'Pôle métropolitain',
  '7341': 'Secteur de commune',
  '7342': 'District urbain',
  '7343': 'Communauté urbaine',
  '7344': 'Métropole',
  '7345': 'Syndicat intercommunal à vocation multiple (SIVOM)',
  '7346': 'Communauté de communes',
  '7347': 'Communauté de villes',
  '7348': 'Communauté d\'agglomération',
  '7349': 'Autre établissement public local de coopération non spécialisé',
  '7351': 'Institution interdépartementale ou entente',
  '7352': 'Institution interrégionale ou entente',
  '7353': 'Syndicat intercommunal à vocation unique (SIVU)',
  '7354': 'Syndicat mixte communal',
  '7355': 'Autre syndicat mixte',
  '7356': 'Commission syndicale pour la gestion des biens indivis',
  '7361': 'Centre communal d\'action sociale (CCAS)',
  '7362': 'Caisse des écoles',
  '7363': 'Caisse de crédit municipal',
  '7364': 'Établissement d\'hospitalisation',
  '7365': 'Syndicat inter-hospitalier',
  '7366': 'Groupement d\'intérêt public (GIP)',
  '7371': 'Centre de ressources, d\'expertise et de performances sportives (CREPS)',
  '7372': 'Centre technique industriel ou comité professionnel du développement économique',
  '7373': 'Groupement d\'intérêt public (GIP)',
  '7378': 'Régie d\'une collectivité locale à caractère administratif',
  '7379': 'Autre EP local à caractère administratif',
  '7381': 'Organisme consulaire',
  '7382': 'Établissement public national à caractère scientifique, culturel et professionnel',
  '7383': 'Autre établissement public national d\'enseignement',
  '7384': 'Autre organisme de recherche',
  '7385': 'Autre EP national administratif à compétence territoriale limitée',
  '7389': 'Établissement public national à caractère administratif',
  '7410': 'Groupement d\'intérêt public (GIP)',
  '7430': 'Établissement public des cultes d\'Alsace-Lorraine',
  '7450': 'Établissement public administratif, reconnu d\'utilité publique',
  '7470': 'Groupement de coopération sanitaire à gestion publique',
  '7490': 'Autre personne morale de droit administratif',

  // 8xxx - Organismes privés spécialisés
  '8110': 'Régime général de la Sécurité Sociale',
  '8120': 'Régime spécial de Sécurité Sociale',
  '8130': 'Institution de retraite complémentaire',
  '8140': 'Mutualité sociale agricole',
  '8150': 'Régime maladie des non-salariés non agricoles',
  '8160': 'Régime vieillesse ne dépendant pas du régime général de la SS',
  '8170': 'Régime d\'assurance chômage',
  '8190': 'Autre régime de prévoyance sociale',
  '8210': 'Mutuelle',
  '8250': 'Assurance mutuelle agricole',
  '8290': 'Autre organisme mutualiste',
  '8310': 'Comité central d\'entreprise',
  '8311': 'Comité d\'établissement',
  '8410': 'Syndicat de salariés',
  '8420': 'Syndicat patronal',
  '8450': 'Ordre professionnel',
  '8470': 'Centre technique industriel',
  '8490': 'Autre organisme professionnel',
  '8510': 'Institution de prévoyance',
  '8520': 'Institution de retraite supplémentaire',

  // 9xxx - Groupements de droit privé
  '9110': 'Syndicat de propriétaires',
  '9150': 'Association syndicale libre',
  '9210': 'Association non déclarée',
  '9220': 'Association déclarée',
  '9221': 'Association déclarée d\'insertion par l\'économique',
  '9222': 'Association intermédiaire',
  '9223': 'Groupement d\'employeurs',
  '9224': 'Association d\'avocats à responsabilité professionnelle individuelle',
  '9230': 'Association déclarée reconnue d\'utilité publique',
  '9240': 'Congrégation',
  '9260': 'Association de droit local (Alsace-Moselle)',
  '9300': 'Fondation',
  '9900': 'Autre personne morale de droit privé',
  '9970': 'Groupement de coopération sanitaire à gestion privée',
};

// Fonction pour décoder le type de voie
export function decodeNatureVoie(code: string): string {
  if (!code) return '';
  const normalized = code.trim().toUpperCase();
  return NATURE_VOIE[normalized] || normalized;
}

// Fonction pour décoder le code droit
export function decodeCodeDroit(code: string): string {
  if (!code) return '';
  const normalized = code.trim().toUpperCase();
  return CODE_DROIT[normalized] || normalized;
}

// Fonction pour décoder le groupe personne
export function decodeGroupePersonne(code: string): string {
  if (!code) return '';
  const normalized = code.trim();
  return GROUPE_PERSONNE[normalized] || `Groupe ${normalized}`;
}

// Fonction pour décoder la forme juridique
export function decodeFormeJuridique(code: string): string {
  if (!code) return '';
  const normalized = code.trim().toUpperCase();
  return FORME_JURIDIQUE[normalized] || normalized;
}

// Fonction pour normaliser un nom de voie (capitalisation)
export function normalizeNomVoie(nom: string): string {
  if (!nom) return '';

  // Liste de mots à garder en minuscule (articles, prépositions)
  const lowercase = ['de', 'du', 'des', 'la', 'le', 'les', 'l', 'à', 'au', 'aux', 'en', 'et', 'd', 'sur', 'sous'];

  return nom
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((word, index) => {
      if (index === 0) return capitalizeFirst(word);
      if (lowercase.includes(word.toLowerCase())) return word.toLowerCase();
      return capitalizeFirst(word);
    })
    .join('');
}

// Capitalise la première lettre
function capitalizeFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Fonction pour construire une adresse complète formatée
export function formatAdresseComplete(
  numero: string,
  indiceRepetition: string,
  natureVoie: string,
  nomVoie: string,
  commune: string,
  departement: string
): string {
  const parts: string[] = [];

  // Numéro et indice
  if (numero && numero !== '0' && numero !== '00000') {
    let numPart = parseInt(numero).toString();
    if (indiceRepetition) {
      numPart += ` ${indiceRepetition.toLowerCase()}`;
    }
    parts.push(numPart);
  }

  // Type de voie décodé
  const typeVoie = decodeNatureVoie(natureVoie);
  if (typeVoie) parts.push(typeVoie);

  // Nom de voie normalisé
  const voie = normalizeNomVoie(nomVoie);
  if (voie) parts.push(voie);

  // Commune et département
  const location = [commune, departement].filter(Boolean).join(' ');
  if (location) parts.push(`- ${location}`);

  return parts.join(' ');
}
