import Link from 'next/link';
import { Building2, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: "Conditions Générales d'Utilisation — Proprietaire.net",
};

export default function CGU() {
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

        <h1 className="text-3xl font-bold mb-8">Conditions Générales d&apos;Utilisation</h1>

        <div className="prose prose-gray max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Objet</h2>
            <p className="text-muted-foreground">
              Les présentes Conditions Générales d&apos;Utilisation (CGU) régissent l&apos;accès et l&apos;utilisation du service Proprietaire.net, plateforme de recherche de propriétaires immobiliers et d&apos;envoi de courriers postaux.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Acceptation</h2>
            <p className="text-muted-foreground">
              En créant un compte sur Proprietaire.net, vous acceptez sans réserve les présentes CGU. Si vous n&apos;acceptez pas ces conditions, vous ne devez pas utiliser le service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Description du service</h2>
            <p className="text-muted-foreground">
              Proprietaire.net propose :
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
              <li>La recherche de propriétaires immobiliers par adresse, zone géographique, SIREN ou nom</li>
              <li>L&apos;envoi de courriers postaux aux propriétaires identifiés</li>
              <li>Des outils de gestion de contacts (CRM)</li>
              <li>L&apos;export de données</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Inscription</h2>
            <p className="text-muted-foreground">
              L&apos;inscription est gratuite et ouverte aux professionnels. Vous vous engagez à fournir des informations exactes et à maintenir la confidentialité de vos identifiants de connexion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Utilisation des données</h2>
            <p className="text-muted-foreground">
              Les données accessibles via Proprietaire.net proviennent de sources publiques (données cadastrales). Vous vous engagez à utiliser ces données dans le respect de la réglementation applicable, notamment le RGPD, et à ne pas les utiliser à des fins illicites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Abonnements et paiement</h2>
            <p className="text-muted-foreground">
              Les abonnements sont facturés mensuellement ou annuellement selon l&apos;option choisie. Les paiements sont traités de manière sécurisée par Stripe. Les crédits achetés en pack sont valables sans limite de temps. Les crédits inclus dans l&apos;abonnement sont réinitialisés chaque mois.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Résiliation</h2>
            <p className="text-muted-foreground">
              Vous pouvez résilier votre abonnement à tout moment depuis votre espace client. La résiliation prend effet à la fin de la période en cours. Aucun remboursement prorata n&apos;est effectué.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Limitation de responsabilité</h2>
            <p className="text-muted-foreground">
              Proprietaire.net s&apos;efforce de fournir des données exactes mais ne garantit pas l&apos;exhaustivité ou l&apos;exactitude des informations cadastrales. Le service est fourni &quot;en l&apos;état&quot;.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Droit applicable</h2>
            <p className="text-muted-foreground">
              Les présentes CGU sont soumises au droit français. En cas de litige, les tribunaux français seront seuls compétents.
            </p>
          </section>

          <p className="text-sm text-muted-foreground italic mt-8">
            Conditions générales en cours de rédaction. Dernière mise à jour : février 2026.
          </p>
        </div>
      </main>
    </div>
  );
}
