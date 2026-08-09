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
function construireCle(ip: string, action: string, discriminant?: string): string {
  if (ip !== 'unknown') return `${action}:${ip}`;

  if (!avertissementIpEmis) {
    avertissementIpEmis = true;
    console.warn(
      '[RATE-LIMIT] IP cliente non resoluble. Definir TRUST_PROXY=1 si ' +
        'l\'application tourne derriere un proxy de confiance. Repli sur un ' +
        'comptage par compte.'
    );
  }

  if (discriminant) {
    return `${action}:id:${discriminant.trim().toLowerCase()}`;
  }

  // Sans discriminant, un compteur global rebloquerait tout le monde : on
  // preferere ne pas limiter plutot que de provoquer un deni de service.
  return `${action}:unbounded:${Math.random()}`;
}

export function checkRateLimit(
  ip: string,
  action: string,
  discriminant?: string
): { allowed: boolean; retryAfter?: number } {
  const config = RATE_LIMITS[action];
  if (!config) return { allowed: true };

  const key = construireCle(ip, action, discriminant);
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
