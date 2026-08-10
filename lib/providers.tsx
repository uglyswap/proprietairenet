'use client';

import { Toaster } from '@/components/ui/sonner';
import { PlanUpgradeInterceptor } from '@/components/PlanUpgradeInterceptor';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Rendu AVANT {children}, volontairement.
          React execute les effets dans l'ordre de l'arbre : place apres, cet
          intercepteur s'installait apres les effets de montage des pages, et
          manquait donc precisement les requetes du premier chargement, c'est-a-dire
          le cas qu'il existe pour traiter. */}
      <PlanUpgradeInterceptor />
      {children}
      <Toaster />
    </>
  );
}
