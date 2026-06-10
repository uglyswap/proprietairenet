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
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    return config;
  },
};

module.exports = nextConfig;
