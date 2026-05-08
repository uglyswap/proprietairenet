import './globals.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/lib/providers';
import AdminPreviewBanner from '@/components/AdminPreviewBanner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Proprietaire.net — Trouvez le propriétaire de n\'importe quel bien en France',
    template: '%s | Proprietaire.net',
  },
  description: 'Trouvez le propriétaire de n\'importe quel bien immobilier en France. Recherche par adresse ou zone géographique parmi 22,5 millions de propriétés. Courrier postal automatisé pour les professionnels.',
  keywords: ['trouver propriétaire', 'propriétaire immobilier', 'recherche propriétaire', 'cadastre', 'prospection immobilière', 'courrier postal', 'proprietaire.net', 'propriétaire bien immobilier', 'données cadastrales'],
  authors: [{ name: 'Proprietaire.net' }],
  creator: 'Proprietaire.net',
  publisher: 'Proprietaire.net',
  metadataBase: new URL('https://proprietaire.net'),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: 'https://proprietaire.net',
    siteName: 'Proprietaire.net',
    title: 'Proprietaire.net — Trouvez le propriétaire. Contactez-le.',
    description: 'Accédez à 22,5 millions de propriétés en France. Recherche par adresse ou zone, courrier postal automatisé, tout inclus.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Proprietaire.net' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Proprietaire.net — Trouvez le propriétaire. Contactez-le.',
    description: 'Accédez à 22,5 millions de propriétés en France. Prospection immobilière simplifiée.',
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/favicon.svg' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  document.documentElement.classList.remove('dark');
                  localStorage.setItem('theme', 'light');
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-white text-gray-900`}>
        <Providers>
          <AdminPreviewBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
