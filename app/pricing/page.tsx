'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Check, X, Zap, ArrowRight, CreditCard, Loader2, Mail, ArrowDown, ArrowUp } from 'lucide-react';
import { getAuthHeaders, getToken } from '@/lib/auth-client';
import { toast } from 'sonner';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_euros: number;
  monthly_searches_limit: number;
  /** Budget mensuel de resultats. null = illimite (migration 007). */
  monthly_results_limit?: number | null;
  /** Plafond de resultats par recherche (migration 007). */
  max_results_per_search?: number | null;
  included_users: number;
  extra_user_price: number;
  features: string[];
  sort_order: number;
}

interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price_euros: number;
  sort_order: number;
}

const LETTER_COSTS = [
  { type: 'Lettre Verte', credits: 410, price: '4,10' }, { type: 'Verte Suivie', credits: 490, price: '4,90' },
  { type: 'Performance', credits: 520, price: '5,20' }, { type: 'Perf. Suivie', credits: 600, price: '6,00' },
  { type: 'Recommandé', credits: 1080, price: '10,80' }, { type: 'Recommandé AR', credits: 1250, price: '12,50' },
];

function getDiscountedPrice(credits: number): number {
  const base = credits / 100;
  if (credits >= 200000) return Math.round(base * 0.85);
  if (credits >= 60000) return Math.round(base * 0.90);
  return base;
}

function getDiscountLabel(credits: number): string {
  if (credits >= 200000) return 'Megapack -15%';
  if (credits >= 60000) return '-10%';
  return 'tarif normal';
}

// Feature mapping per plan slug
/** Normalise un slug de plan : la base peut porter `gratuit` ou `free`. */
function normaliserSlug(slug: string): string {
  const alias: Record<string, string> = { gratuit: 'free', freemium: 'free', professionnel: 'pro' };
  const s = String(slug || '').trim().toLowerCase();
  return alias[s] ?? s;
}

const FEATURE_MAP: Record<string, { text: string; included: boolean }[]> = {
  free: [
    { text: '10 résultats de recherche par mois', included: true }, { text: 'Comptabilisés uniquement si résultats', included: true },
    { text: 'Recherche par adresse', included: true }, { text: 'Recherche par zone sur carte', included: true },
    { text: 'Export CSV basique', included: true }, { text: 'CRM intégré', included: false },
    { text: 'Templates courrier + IA', included: false }, { text: 'Envoi courriers postaux', included: false },
    { text: 'Multi-utilisateurs', included: false },
  ],
  pro: [
    { text: 'Recherches illimitées', included: true }, { text: 'Max 200 résultats par recherche', included: true },
    { text: 'Recherche par adresse et zone', included: true }, { text: 'CRM intégré complet', included: true },
    { text: 'Templates courrier + IA', included: true }, { text: 'Envoi courriers postaux', included: true },
    { text: 'Listes et favoris', included: true }, { text: 'Multi-utilisateurs (+20€/user)', included: true },
    { text: 'Dashboard analytique', included: true }, { text: 'Export tous formats', included: true },
    { text: 'Support prioritaire', included: true },
  ],
};

export default function PricingPage() {
  const router = useRouter();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [creditAmount, setCreditAmount] = useState(50000);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setIsLoggedIn(!!getToken()); }, []);

  useEffect(() => {
    fetch('/api/plans')
      .then(r => r.json())
      .then(data => {
        setPlans(data.plans || []);
        setCreditPacks(data.credit_packs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleBuyCredits = async (credits: number) => {
    router.push(`/dashboard/credits?amount=${credits}`);
  };

  const handleSubscribe = async (slug: string) => {
    if (slug === 'gratuit') {
      router.push(isLoggedIn ? '/dashboard' : '/register?plan=gratuit');
      return;
    }
    
    if (isLoggedIn) {
      // Utilisateur connecté → appel direct au checkout Stripe
      try {
        const headers = getAuthHeaders();
        const response = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            type: 'subscription',
            plan_slug: slug,
            billing_period: billingPeriod,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          toast.error(data.error || 'Erreur lors de la souscription');
          return;
        }
        if (data.url) {
          window.location.href = data.url;
        }
      } catch {
        toast.error('Erreur de connexion');
      }
    } else {
      // Utilisateur non connecté → redirection vers inscription avec plan et period
      router.push(`/register?plan=${slug}&period=${billingPeriod}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-primary">Proprietaire.net</span>
          </Link>
          <nav className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link href="/dashboard"><Button variant="ghost">Dashboard</Button></Link>
            ) : (
              <>
                <Link href="/login"><Button variant="ghost">Connexion</Button></Link>
                <Link href="/register"><Button>Essai gratuit</Button></Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 bg-gradient-to-b from-blue-50 to-white">
        <div className="container mx-auto px-4 text-center">
          <Badge variant="secondary" className="mb-4"><Zap className="h-3 w-3 mr-1" />Tarification transparente</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Des tarifs adaptés à votre activité</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-4">Recherche de propriétaires <strong>illimitée</strong> avec le plan Pro. Crédits courrier vendus séparément.</p>
          <p className="text-xs text-gray-500">Maximum 200 résultats par recherche.</p>
          <div className="flex items-center justify-center gap-3 mt-8 mb-12">
            <span className={`text-sm ${billingPeriod === 'monthly' ? 'font-semibold' : 'text-muted-foreground'}`}>Mensuel</span>
            <button onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'annual' : 'monthly')} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${billingPeriod === 'annual' ? 'bg-primary' : 'bg-gray-200'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingPeriod === 'annual' ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className={`text-sm ${billingPeriod === 'annual' ? 'font-semibold' : 'text-muted-foreground'}`}>Annuel</span>
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Annuel : -20%</Badge>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {plans.map((plan) => {
              const displayPrice = billingPeriod === 'annual' ? Math.round(plan.price_euros * 0.8) : plan.price_euros;
              // Le slug est normalise avant toute comparaison : `plans.slug` vaut
              // `gratuit` jusqu'a l'application de la migration 005, qui le
              // renomme en `free`. Indexer FEATURE_MAP sur le slug brut, comme
              // avant, faisait donc disparaitre les puces de fonctionnalites le
              // jour ou la migration passait.
              const slug = normaliserSlug(plan.slug);
              const isPopular = slug === 'pro';
              const features = FEATURE_MAP[slug] || plan.features.map(f => ({ text: f, included: true }));

              // L'illimite est desormais encode par NULL, explicitement, et non
              // par la sentinelle 999999 qui est aussi un entier plausible.
              const budget = plan.monthly_results_limit;
              const searchLimit =
                budget === null
                  ? 'Résultats illimités'
                  : budget !== undefined
                    ? `${budget} résultats/mois`
                    : plan.monthly_searches_limit >= 999999
                      ? 'Illimité'
                      : `${plan.monthly_searches_limit} recherches/mois`;
              const capParRecherche = plan.max_results_per_search ?? null;

              return (
                <Card key={plan.id} className={`relative ${isPopular ? 'border-2 border-blue-500 shadow-2xl scale-105' : 'border shadow-lg'}`}>
                  {isPopular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold px-4 py-1">Plus populaire</Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-6">
                    <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="mt-6">
                      <span className="text-5xl font-bold">{displayPrice}€</span>
                      <span className="text-gray-600 ml-1">{plan.price_euros > 0 ? '/mois HT' : ''}</span>
                    </div>
                    {billingPeriod === 'annual' && plan.price_euros > 0 && (
                      <div className="mt-1">
                        <p className="text-sm text-green-600">Au lieu de {plan.price_euros}€/mois (-20%)</p>
                        <p className="text-xs text-gray-500">Facturé {Math.round(plan.price_euros * 0.8 * 12)}€ en une fois</p>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-2">{plan.included_users} utilisateur inclus · {searchLimit}</p>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 mb-8">
                      {features.map((f, j) => (
                        <li key={j} className="flex items-start gap-3">
                          {f.included ? <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" /> : <X className="h-5 w-5 text-gray-300 mt-0.5 flex-shrink-0" />}
                          <span className={`text-sm ${f.included ? 'text-gray-700' : 'text-gray-400'}`}>{f.text}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className={`w-full h-12 font-semibold ${isPopular ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700' : ''}`}
                      variant={isPopular ? 'default' : 'outline'}
                      onClick={() => handleSubscribe(plan.slug)}
                    >
                      {plan.slug === 'gratuit' ? 'Commencer gratuitement' : `Choisir ${plan.name}`}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Credits Section */}
      <section id="credits" className="py-16 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-4">
            <Badge variant="secondary" className="mb-4"><CreditCard className="h-3 w-3 mr-1" />Crédits courrier</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Envoyez vos courriers en un clic</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">Impression, mise sous pli, affranchissement, envoi — tout est inclus.</p>
          </div>

          {/* Tiers info */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            <div className="px-4 py-2 rounded-full border bg-gray-50 border-gray-200 text-sm text-gray-600">100 crédits = 1€</div>
            <div className="px-4 py-2 rounded-full border bg-green-50 border-green-200 text-sm text-green-700 font-medium">60 000+ crédits = -10%</div>
            <div className="px-4 py-2 rounded-full border bg-amber-50 border-amber-200 text-sm text-amber-700 font-medium">200 000+ crédits = -15%</div>
          </div>

          {/* Featured packs grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl mx-auto mb-8">
            {creditPacks.map((pack) => {
              const isHighlighted = pack.credits >= 50000 && pack.credits < 100000;
              const isMega = pack.credits >= 200000;
              const discount = getDiscountLabel(pack.credits);
              const isDiscount = discount !== 'tarif normal';

              return (
                <div
                  key={pack.id}
                  className={`relative rounded-2xl border p-5 text-center transition-all cursor-pointer hover:shadow-lg ${
                    isHighlighted ? 'border-2 border-blue-500 shadow-xl bg-gradient-to-b from-blue-50 to-white ring-2 ring-blue-200'
                      : isMega ? 'border-2 border-amber-400 shadow-xl bg-gradient-to-b from-amber-50 to-white'
                      : 'border-gray-200 bg-white shadow-sm hover:border-blue-300'
                  }`}
                  onClick={() => setCreditAmount(pack.credits)}
                >
                  {isDiscount && (
                    <div className={`absolute -top-3 left-1/2 transform -translate-x-1/2`}>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${
                        isMega ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' : 'bg-green-600 text-white'
                      }`}>{discount}</span>
                    </div>
                  )}
                  <h3 className="font-semibold text-gray-900 text-sm mt-2">{pack.name}</h3>
                  <div className={`text-2xl font-bold my-2 ${isHighlighted ? 'text-blue-600' : isMega ? 'text-amber-600' : 'text-gray-900'}`}>
                    {pack.credits.toLocaleString('fr-FR')}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">crédits</div>
                  <div className="text-lg font-bold text-gray-900">{getDiscountedPrice(pack.credits).toLocaleString('fr-FR')}€</div>
                  <div className="text-xs text-gray-500">~{Math.floor(pack.credits / 410)} lettres</div>
                  {isDiscount && (
                    <div className="text-xs text-green-600 font-medium mt-1">
                      Au lieu de {(pack.credits / 100).toLocaleString('fr-FR')}€
                    </div>
                  )}

                  {isLoggedIn ? (
                    <Button
                      size="sm"
                      className={`w-full mt-3 ${isHighlighted ? 'bg-blue-600 hover:bg-blue-700' : isMega ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600' : ''}`}
                      variant={isHighlighted || isMega ? 'default' : 'outline'}
                      onClick={(e) => { e.stopPropagation(); handleBuyCredits(pack.credits); }}
                      disabled={!!loadingPack}
                    >
                      {loadingPack === String(pack.credits) ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Acheter'}
                    </Button>
                  ) : (
                    <Link href="/login" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" className="w-full mt-3" variant="outline">Se connecter</Button>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {/* Custom amount */}
          <div className="max-w-2xl mx-auto mb-10">
            <Card className="border-blue-200 shadow-lg">
              <CardContent className="pt-6 space-y-5">
                <div className="text-center mb-2">
                  <h3 className="font-semibold text-lg">Montant personnalisé</h3>
                  <p className="text-sm text-muted-foreground">Choisissez le nombre exact de crédits dont vous avez besoin</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm text-muted-foreground font-medium">Ajustez le curseur ou saisissez un montant</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={100} step={100} value={creditAmount} onChange={(e) => { const v = parseInt(e.target.value) || 0; setCreditAmount(Math.max(100, v)); }} className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <span className="text-xs text-gray-400">crédits</span>
                    </div>
                  </div>
                  <input type="range" min={1000} max={300000} step={1000} value={Math.min(creditAmount, 300000)} onChange={(e) => setCreditAmount(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1 000</span><span>60 000</span><span>200 000</span><span>300 000</span></div>
                </div>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div><div className="text-2xl font-bold text-blue-600">{creditAmount.toLocaleString('fr-FR')}</div><div className="text-sm text-gray-500">crédits</div></div>
                    <div><div className="text-2xl font-bold text-green-600">~{Math.floor(creditAmount / 410)}</div><div className="text-sm text-gray-500">lettres vertes</div></div>
                    <div><div className="text-2xl font-bold text-gray-900">{getDiscountedPrice(creditAmount).toLocaleString('fr-FR')}€</div><div className="text-sm text-gray-500">{getDiscountLabel(creditAmount)}</div>{creditAmount >= 60000 && (<div className="text-xs text-green-600 mt-1">Au lieu de {(creditAmount / 100).toLocaleString('fr-FR')}€</div>)}</div>
                  </div>
                </div>
                <div className="text-center">
                  {isLoggedIn ? (
                    <Button size="lg" className="h-14 px-8 text-lg" onClick={() => handleBuyCredits(creditAmount)} disabled={!!loadingPack}>
                      {loadingPack ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
                      Acheter {creditAmount.toLocaleString('fr-FR')} crédits pour {getDiscountedPrice(creditAmount).toLocaleString('fr-FR')}€
                    </Button>
                  ) : (
                    <Link href="/login"><Button size="lg" className="h-14 px-8 text-lg">Se connecter pour acheter<ArrowRight className="ml-2 h-5 w-5" /></Button></Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Letter cost reference */}
          <div className="max-w-3xl mx-auto">
            <Card className="border-blue-100 bg-blue-50/50">
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Mail className="h-5 w-5 text-blue-600" />Coût par courrier (en crédits)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {LETTER_COSTS.map((lc, i) => (<div key={i} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 text-sm"><span className="text-gray-600">{lc.type}</span><span className="font-semibold">{lc.credits} cr.</span></div>))}
                </div>
                <p className="text-xs text-gray-500 mt-3">100 crédits = 1€ · Tout inclus : impression, mise sous pli, affranchissement et envoi · Les crédits n&apos;expirent jamais</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Questions fréquentes</h2>
          <div className="max-w-3xl mx-auto space-y-6">
            {[
              { q: 'La recherche est-elle vraiment gratuite ?', a: 'Oui. Le plan Gratuit offre 10 recherches par mois. Le plan Pro offre des recherches illimitées.' },
              { q: 'Que sont les crédits ?', a: 'Les crédits servent uniquement à envoyer des courriers postaux. 100 crédits = 1€. Une lettre verte coûte 410 crédits (4,10€), tout inclus.' },
              { q: 'Y a-t-il des réductions sur les crédits ?', a: 'Oui. À partir de 60 000 crédits (600€), vous bénéficiez de -10%. À partir de 200 000 crédits, c\'est -15% avec le Megapack.' },
              { q: 'Comment fonctionne le paiement annuel ?', a: 'Le paiement annuel offre 20% de réduction. Le montant total est facturé en une seule fois chaque année (exemple : 931€ au lieu de 1 164€ pour le plan Pro).' },
              { q: 'Les crédits expirent-ils ?', a: 'Non. Vos crédits n\'expirent jamais. Utilisez-les quand vous le souhaitez.' },
              { q: 'Puis-je acheter un montant personnalisé ?', a: 'Oui. Choisissez le nombre exact de crédits dont vous avez besoin, par tranches de 1 000.' },
            ].map((faq, i) => (<Card key={i}><CardHeader className="pb-3"><CardTitle className="text-base">{faq.q}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{faq.a}</p></CardContent></Card>))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Prêt à commencer ?</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">Inscription gratuite, résultats en quelques secondes.</p>
          <Link href="/register"><Button size="lg" variant="secondary" className="h-14 px-8 text-lg">Créer mon compte gratuitement<ArrowRight className="ml-2 h-5 w-5" /></Button></Link>
        </div>
      </section>

      <footer className="border-t py-8 bg-white">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">© 2026 Proprietaire.net. Tous droits réservés.</div>
      </footer>
    </div>
  );
}
