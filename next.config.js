/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    // Le lint ne bloque pas le build (warnings tolerees), mais les erreurs de
    // types ci-dessous sont desormais bloquantes.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Les erreurs TypeScript bloquent a nouveau le build de production:
    // du code invalide ne doit plus partir en prod.
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },

  /**
   * En-tetes de securite.
   *
   * L'application n'envoyait AUCUNE Content-Security-Policy alors qu'elle
   * stocke un JWT de 7 jours en localStorage : toute XSS exfiltrait un jeton
   * valide une semaine, non revocable faute de token_version.
   *
   * La CSP ci-dessous est la plus stricte compatible avec les dependances
   * reelles du projet :
   *   - 'unsafe-inline' sur style-src : Tailwind et Radix injectent des styles
   *     inline, les retirer casserait l'interface ;
   *   - 'unsafe-eval' sur script-src en developpement uniquement, exige par le
   *     rafraichissement a chaud de Next ;
   *   - tile.openstreetmap.org : fonds de carte Leaflet ;
   *   - api.stripe.com et js.stripe.com : paiement.
   *
   * Toute nouvelle integration tierce doit etre ajoutee ici explicitement.
   */
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';

    // Quand le mode nonce est actif, la CSP est posee par middleware.ts, qui
    // seul peut generer une valeur par requete. En poser une ici en plus
    // produirait deux en-tetes concurrents, et le plus restrictif gagnerait de
    // facon imprevisible selon l'ordre d'application.
    const cspGereeParMiddleware = process.env.CSP_NONCE === 'true';

    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.stripe.com`,
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

    return [
      {
        source: '/:path*',
        headers: [
          ...(cspGereeParMiddleware
            ? []
            : [{ key: 'Content-Security-Policy', value: csp }]),
          // Empeche le navigateur de deviner un type MIME et d'executer une
          // reponse de donnees comme un script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), payment=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Isole le contexte de navigation des fenetres ouvertes par la page.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        // Les reponses d'API ne doivent jamais etre mises en cache par un
        // intermediaire : elles portent des donnees nominatives par organisation.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },

  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    return config;
  },
};

module.exports = nextConfig;
