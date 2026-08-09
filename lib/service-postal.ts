const SP_API_URL = process.env.SERVICE_POSTAL_API_URL || "https://prod-api.servicepostal.com";
const SP_API_KEY = process.env.SERVICE_POSTAL_API_KEY || "";

export function getSpHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    apiKey: SP_API_KEY,
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

export function isConfigured(): boolean {
  return !!SP_API_KEY;
}

export async function spFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${SP_API_URL}${path}`;
  const headers = {
    ...getSpHeaders('application/json'),
    ...(options.headers || {}),
  };
  return fetch(url, { ...options, headers });
}

/**
 * Bareme des credits.
 *
 * Ces six nombres etaient la source de verite tarifaire, avec la marge deja
 * fondue dedans et invisible. Le calcul vit desormais dans lib/pricing.ts, qui
 * decompose cout prestataire, marge et TVA. Les valeurs produites sont
 * identiques : ce deplacement ne change aucun prix.
 *
 * Ces exports sont conserves pour les appelants existants. Preferer
 * `calculerTarif` de lib/pricing, qui retourne la decomposition complete.
 */
export { getCreditCost, TYPES_AFFRANCHISSEMENT } from './pricing';

import { baremeComplet, TYPES_AFFRANCHISSEMENT as TYPES } from './pricing';

/**
 * Bareme en credits, calcule et non plus code en dur.
 *
 * Le calcul est PARESSEUX. L'evaluer au chargement du module faisait dependre
 * l'import lui-meme de la configuration : une seule variable tarifaire mal
 * renseignee levait a l'import et mettait hors service toutes les routes
 * courrier, y compris celles qui n'ont pas besoin du bareme. Une erreur de
 * configuration ne doit degrader que ce qui en depend.
 */
let baremeCache: Record<string, number> | null = null;

export function getCreditCosts(): Record<string, number> {
  if (baremeCache) return baremeCache;
  try {
    baremeCache = Object.fromEntries(
      baremeComplet().map((tarif) => [tarif.type_affranchissement, tarif.credits])
    );
  } catch (err) {
    console.error(
      '[TARIFICATION] Bareme incalculable, verifier la configuration COURRIER_*',
      err
    );
    baremeCache = {};
  }
  return baremeCache;
}

/**
 * Conserve pour les appelants existants. Accede au bareme paresseux : la lecture
 * d'une cle absente vaut undefined, comme avant, sans faire echouer l'import.
 */
export const CREDIT_COSTS: Record<string, number> = new Proxy(
  {} as Record<string, number>,
  {
    get: (_cible, propriete: string) => getCreditCosts()[propriete],
    ownKeys: () => Reflect.ownKeys(getCreditCosts()),
    has: (_cible, propriete: string) => propriete in getCreditCosts(),
    getOwnPropertyDescriptor: (_cible, propriete: string) => ({
      value: getCreditCosts()[propriete as string],
      enumerable: true,
      configurable: true,
    }),
  }
);

/**
 * Generate a CSV for Service Postal publipostage from recipient data.
 * Uses semicolon separator as required by Service Postal.
 * Returns base64-encoded CSV content.
 */
export function generateCsv(
  recipients: Array<{
    civilite?: string;
    prenom?: string;
    nom?: string;
    nom_societe?: string;
    adresse_ligne1: string;
    adresse_ligne2?: string;
    code_postal: string;
    ville: string;
    pays?: string;
  }>
): string {
  const headers = ['civilite', 'prenom', 'nom', 'nom_societe', 'adresse_ligne1', 'adresse_ligne2', 'code_postal', 'ville', 'pays'];
  const rows = recipients.map(r =>
    headers.map(h => {
      const val = (r as any)[h] || '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(';')
  );
  const csv = [headers.join(';'), ...rows].join('\n');
  return Buffer.from(csv, 'utf-8').toString('base64');
}

/**
 * Replace template variables with recipient data.
 */
export function replaceVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  return result;
}
