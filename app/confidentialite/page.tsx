import Link from 'next/link';
import { Building2, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Politique de confidentialité — Proprietaire.net',
};

export default function Confidentialite() {
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

        <h1 className="text-3xl font-bold mb-8">Politique de confidentialité</h1>

        <div className="prose prose-gray max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Responsable du traitement</h2>
            <p className="text-muted-foreground">
              Le responsable du traitement des données personnelles est [Société à compléter], éditeur du site Proprietaire.net.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Données collectées</h2>
            <p className="text-muted-foreground">
              Nous collectons les données suivantes lors de votre inscription et utilisation du service :
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li>Nom et prénom</li>
              <li>Adresse email professionnelle</li>
              <li>Données de connexion et d&apos;utilisation</li>
              <li>Données de facturation (traitées par Stripe)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Finalités du traitement</h2>
            <p className="text-muted-foreground">
              Vos données sont utilisées pour :
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li>La gestion de votre compte utilisateur</li>
              <li>La fourniture du service de recherche de propriétaires</li>
              <li>L&apos;envoi de courriers postaux via notre partenaire</li>
              <li>La facturation et le suivi des abonnements</li>
              <li>L&apos;amélioration de nos services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Base légale</h2>
            <p className="text-muted-foreground">
              Le traitement de vos données repose sur l&apos;exécution du contrat (conditions d&apos;utilisation) et votre consentement pour les communications marketing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Durée de conservation</h2>
            <p className="text-muted-foreground">
              Vos données sont conservées pendant la durée de votre compte, puis supprimées dans un délai de 3 ans après la clôture de votre compte, sauf obligation légale de conservation plus longue.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Sous-traitants</h2>
            <p className="text-muted-foreground">
              Nous faisons appel aux sous-traitants suivants :
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li><strong>Stripe</strong> — Traitement des paiements</li>
              <li><strong>Resend</strong> — Envoi d&apos;emails transactionnels</li>
              <li><strong>Service Postal</strong> — Impression et envoi de courriers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Vos droits (RGPD)</h2>
            <p className="text-muted-foreground">
              Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez des droits suivants :
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li>Droit d&apos;accès à vos données</li>
              <li>Droit de rectification</li>
              <li>Droit à l&apos;effacement</li>
              <li>Droit à la portabilité</li>
              <li>Droit d&apos;opposition</li>
              <li>Droit à la limitation du traitement</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              Pour exercer ces droits, contactez-nous à : <a href="mailto:contact@proprietaire.net" className="text-primary hover:underline">contact@proprietaire.net</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Cookies</h2>
            <p className="text-muted-foreground">
              Le site utilise des cookies techniques nécessaires au fonctionnement du service (authentification, préférences). Aucun cookie publicitaire ou de tracking tiers n&apos;est utilisé.
            </p>
          </section>

          <p className="text-sm text-muted-foreground italic mt-8">
            Dernière mise à jour : février 2026.
          </p>
        </div>
      </main>
    </div>
  );
}
