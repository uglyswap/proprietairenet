import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Content-Security-Policy avec nonce, activable par CSP_NONCE=true.
 *
 * POURQUOI CE MODE EXISTE, ET POURQUOI IL N'EST PAS ACTIF PAR DEFAUT
 *
 * La CSP posee dans next.config.js conserve `script-src 'unsafe-inline'`, ce qui
 * annule l'essentiel de sa protection contre une XSS : c'est precisement le
 * risque a couvrir, avec un JWT de 7 jours stocke en localStorage.
 *
 * S'en passer exige un nonce par requete, propage aux scripts que Next injecte
 * lui-meme. Le mecanisme ci-dessous suit le motif documente par Next.js : le
 * nonce est place a la fois sur les en-tetes de REQUETE, pour que Next le lise
 * et l'applique a ses balises, et sur ceux de REPONSE, pour le navigateur.
 *
 * Il reste desactive par defaut parce qu'il n'a pas pu etre valide a l'execution
 * dans cette session : une CSP trop stricte ne degrade pas, elle produit une
 * page blanche. A activer apres verification sur un environnement de recette,
 * en surveillant la console du navigateur.
 */
function politiqueAvecNonce(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' autorise les scripts charges par un script deja
    // approuve, ce qui couvre le decoupage de bundles de Next sans lister
    // chaque fichier.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    // Tailwind et Radix injectent des styles en ligne : le retrait de
    // 'unsafe-inline' sur style-src casserait l'interface entiere.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.stripe.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com https://*.tile.openstreetmap.org",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function middleware(request: NextRequest) {
  const cspNonceActif = process.env.CSP_NONCE === 'true';

  let response: NextResponse;
  let csp: string | null = null;

  if (cspNonceActif) {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    csp = politiqueAvecNonce(nonce);

    const enTetesRequete = new Headers(request.headers);
    enTetesRequete.set('x-nonce', nonce);
    // Next lit la CSP des en-tetes de requete pour en extraire le nonce et
    // l'appliquer a ses propres balises script.
    enTetesRequete.set('content-security-policy', csp);

    response = NextResponse.next({ request: { headers: enTetesRequete } });
    response.headers.set('content-security-policy', csp);
  } else {
    response = NextResponse.next();
  }

  // En-tetes de securite.
  //
  // X-XSS-Protection a ete retire : cet en-tete est obsolete, ignore par les
  // navigateurs actuels, et son filtre historique a lui-meme introduit des
  // vulnerabilites. La CSP le remplace.
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  // Prevent caching of API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
