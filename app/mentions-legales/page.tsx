import Link from 'next/link';
import { Building2, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Mentions légales — Proprietaire.net',
};

export default function MentionsLegales() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-primary">Proprietaire.net</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16 max-w-3xl">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-8">
          <ArrowLeft className="h-3 w-3" />
          Retour à l&apos;accueil
        </Link>

        <h1 className="text-3xl font-bold mb-8">Mentions légales</h1>

        <div className="prose prose-gray max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">Éditeur du site</h2>
            <p className="text-muted-foreground">
              Le site Proprietaire.net est édité par [Société à compléter].
            </p>
            <p className="text-muted-foreground">
              Siège social : [Adresse à compléter]<br />
              Numéro SIRET : [À compléter]<br />
              Directeur de la publication : [À compléter]
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p className="text-muted-foreground">
              Email : <a href="mailto:contact@proprietaire.net" className="text-primary hover:underline">contact@proprietaire.net</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Hébergement</h2>
            <p className="text-muted-foreground">
              Le site est hébergé par [Hébergeur à compléter].<br />
              Adresse : [À compléter]
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Propriété intellectuelle</h2>
            <p className="text-muted-foreground">
              L&apos;ensemble du contenu de ce site (textes, images, logos, base de données) est protégé par le droit de la propriété intellectuelle. Toute reproduction, même partielle, est interdite sans autorisation préalable.
            </p>
          </section>

          <p className="text-sm text-muted-foreground italic mt-8">
            Mentions légales en cours de rédaction. Dernière mise à jour : février 2026.
          </p>
        </div>
      </main>
    </div>
  );
}
