// Rate limiter en memoire (Map) base sur IP + timestamp.
// ATTENTION: ce store est local au process et NON distribue. En deploiement
// multi-instance (scaling horizontal, serverless), chaque instance possede
// son propre compteur, donc la limite globale n'est pas garantie. Pour une
// limitation fiable a l'echelle, migrer vers un store partage (ex: Redis).
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },          // 5 attempts per 15 min
  register: { maxAttempts: 3, windowMs: 60 * 60 * 1000 },       // 3 attempts per hour
  'forgot-password': { maxAttempts: 3, windowMs: 15 * 60 * 1000 }, // 3 attempts per 15 min
};

export function getClientIP(req: Request): string {
  // Les headers X-Forwarded-For / X-Real-IP sont spoofables par le client.
  // On ne leur fait confiance QUE si l'app tourne derriere un proxy de confiance
  // (variable d'env TRUST_PROXY definie). Dans ce cas, le premier hop est l'IP
  // cliente reelle injectee par notre proxy. Sinon on retombe sur l'IP de
  // connexion exposee par le runtime (request.ip, dispo sur NextRequest).
  const trustProxy = Boolean(process.env.TRUST_PROXY);

  if (trustProxy) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIP = req.headers.get('x-real-ip');
    if (realIP) return realIP;
  }

  // IP de connexion fournie par le runtime (non spoofable par les headers).
  // Request standard ne type pas `ip`, mais NextRequest l'expose: narrowing sur unknown.
  const maybeIp = (req as unknown as { ip?: unknown }).ip;
  if (typeof maybeIp === 'string' && maybeIp.length > 0) {
    return maybeIp;
  }

  return 'unknown';
}

/** Signale une seule fois que l'IP cliente n'est pas resoluble. */
let avertissementIpEmis = false;

/**
 * Cle de comptage.
 *
 * DENI DE SERVICE D'AUTHENTIFICATION CORRIGE ICI
 *
 * Quand TRUST_PROXY n'est pas defini et que le runtime n'expose pas d'IP, ce
 * qui est le cas derriere Docker en mode standalone, getClientIP retombait sur
 * la chaine 'unknown'. TOUTES les requetes partageaient alors la meme cle
 * `login:unknown` : cinq echecs de connexion, provenant de n'importe qui,
 * bloquaient la connexion de TOUS les utilisateurs pendant quinze minutes.
 *
 * Quand l'IP est indeterminee, on se rabat donc sur un discriminant fonctionnel
 * fourni par l'appelant (l'adresse email pour une connexion). Le comptage reste
 * effectif par compte, ce qui est de toute facon la dimension pertinente pour
 * une attaque par force brute, sans jamais devenir global.
 */
/**
 * Facteur applique a l'allocation quand le comptage se fait par compte et non
 * par adresse IP.
 *
 * Un compteur par email est indispensable quand l'IP n'est pas resoluble, mais
 * il ouvre un autre abus : un tiers peut verrouiller le compte d'une victime en
 * saturant deliberement sa cle. Elargir l'allocation rend ce verrouillage
 * beaucoup plus couteux tout en conservant une protection reelle contre la
 * force brute, qui exige, elle, des milliers de tentatives.
 */
const FACTEUR_CLE_PAR_COMPTE = 4;

interface CleComptage {
  cle: string;
  /** Multiplicateur applique a maxAttempts pour cette cle. */
  facteur: number;
}

function construireCle(ip: string, action: string, discriminant?: string): CleComptage {
  if (ip !== 'unknown') return { cle: `${action}:${ip}`, facteur: 1 };

  if (!avertissementIpEmis) {
    avertissementIpEmis = true;
    console.warn(
      '[RATE-LIMIT] IP cliente non resoluble. Definir TRUST_PROXY=1 si ' +
        'l\'application tourne derriere un proxy de confiance. Repli sur un ' +
        'comptage par compte.'
    );
  }

  if (discriminant) {
    return {
      cle: `${action}:id:${discriminant.trim().toLowerCase()}`,
      facteur: FACTEUR_CLE_PAR_COMPTE,
    };
  }

  // Dernier recours : ni IP ni discriminant.
  //
  // Une cle aleatoire annulerait purement la limitation, ce qui laissait
  // /auth/register et /auth/forgot-password sans aucune protection. Un compteur
  // global avec l'allocation nominale rebloquerait au contraire tous les
  // utilisateurs des cinq premiers echecs. On garde donc un compteur global mais
  // tres large : il arrete un abus massif sans pouvoir servir de deni de service
  // cible.
  return { cle: `${action}:global`, facteur: 20 };
}

export function checkRateLimit(
  ip: string,
  action: string,
  discriminant?: string
): { allowed: boolean; retryAfter?: number } {
  const configBase = RATE_LIMITS[action];
  if (!configBase) return { allowed: true };

  const { cle: key, facteur } = construireCle(ip, action, discriminant);
  const config = {
    windowMs: configBase.windowMs,
    maxAttempts: configBase.maxAttempts * facteur,
  };
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true };
  }

  if (entry.count >= config.maxAttempts) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}
