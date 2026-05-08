import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tarifs — Plans et crédits courrier',
  description: 'Découvrez les tarifs de Proprietaire.net : plan Gratuit ou Pro à 97€/mois HT. Crédits courrier à partir de 4,10€ la lettre, tout inclus. Réductions volume disponibles.',
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
