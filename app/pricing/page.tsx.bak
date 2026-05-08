'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Check, X, Zap, ArrowRight, CreditCard, Loader2, Mail, Flame, TrendingUp, Star, Sparkles } from 'lucide-react';
import { getAuthHeaders, getToken } from '@/lib/auth-client';
import { toast } from 'sonner';

const plans = [
  {
    id: 'free', name: 'Gratuit', description: 'Parfait pour tester', price: 0, period: '/mois', users: '1 utilisateur', popular: false,
    features: [
      { text: '10 recherches par mois', included: true }, { text: 'Recherche par adresse', included: true },
      { text: 'Recherche par zone sur carte', included: true }, { text: 'Export CSV basique', included: true },
      { text: 'CRM intégré', included: false }, { text: 'Templates courrier + IA', included: false },
      { text: 'Envoi courriers postaux', included: false }, { text: 'Multi-utilisateurs', included: false },
    ],
    cta: 'Commencer gratuitement', ctaVariant: 'outline' as const,
  },
  {
    id: 'pro', name: 'Pro', description: 'Pour les professionnels', price: 97, period: '/mois HT', users: '1 utilisateur inclus', popular: true,
    features: [
      { text: 'Recherches illimitées', included: true }, { text: 'Recherche par adresse et zone', included: true },
      { text: 'CRM intégré complet', included: true }, { text: 'Templates courrier + IA', included: true },
      { text: 'Envoi courriers postaux', included: true }, { text: 'Listes et favoris', included: true },
      { text: 'Multi-utilisateurs (+20€/user)', included: true }, { text: 'Dashboard analytique', included: true },
      { text: 'Export tous formats', included: true }, { text: 'Support prioritaire', included: true },
    ],
    cta: 'Choisir Pro', ctaVariant: 'default' as const,
  },
];

const LETTER_COSTS = [
  { type: 'Lettre Verte', credits: 410, price: '4,10' }, { type: 'Verte Suivie', credits: 490, price: '4,90' },
  { type: 'Performance', credits: 520, price: '5,20' }, { type: 'Perf. Suivie', credits: 600, price: '6,00' },
  { type: 'Recommandé', credits: 1080, price: '10,80' }, { type: 'Recommandé AR', credits: 1250, price: '12,50' },
];

const FEATURED_PACKS = [
  {
    credits: 5000, price: 50, label: 'Découverte', badge: null, badgeColor: '',
    desc: 'Idéal pour tester', letters: '~12', savings: null, highlight: false,
  },
  {
    credits: 10000, price: 100, label: 'Essentiel', badge: null, badgeColor: '',
    desc: 'Pour démarrer', letters: '~24', savings: null, highlight: false,
  },
  {
    credits: 20000, price: 200, label: 'Standard', badge: null, badgeColor: '',
    desc: 'Usage régulier', letters: '~48', savings: null, highlight: false,
  },
  {
    credits: 50000, price: 500, label: 'Professionnel', badge: '⭐ Best Seller', badgeColor: 'bg-blue-600 text-white',
    desc: 'Le plus choisi par les pros', letters: '~121', savings: null, highlight: true,
  },
  {
    credits: 100000, price: 900, label: 'Business', badge: '💰 -10%', badgeColor: 'bg-green-600 text-white',
    desc: 'Meilleur rapport qualité-prix', letters: '~243', savings: 'Économisez 100€', highlight: false,
  },
  {
    credits: 235000, price: 2000, label: 'Megapack', badge: '🔥 -15%', badgeColor: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
    desc: 'Pour les gros volumes', letters: '~573', savings: 'Économisez 350€', highlight: false, mega: true,
  },
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

export default function PricingPage() {
  const router = useRouter();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [creditAmount, setCreditAmount] = useState(50000);

  useEffect(() => { setIsLoggedIn(!!getToken()); }, []);

  const handleBuyCredits = async (credits: number, price: number) => {
    // Redirect to dashboard credits page with pre-selected amount
    router.push(`/dashboard/credits?amount=${credits}`);
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
            <Link href="/login"><Button variant="ghost">Connexion</Button></Link>
            <Link href="/register"><Button>Essai gratuit</Button></Link>
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
            {plans.map((plan, i) => {
              const displayPrice = billingPeriod === 'annual' ? Math.round(plan.price * 0.8) : plan.price;
              return (
                <Card key={i} className={`relative ${plan.popular ? 'border-2 border-blue-500 shadow-2xl scale-105' : 'border shadow-lg'}`}>
                  {plan.popular && (<div className="absolute -top-4 left-1/2 transform -translate-x-1/2"><Badge className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold px-4 py-1">Plus populaire</Badge></div>)}
                  <CardHeader className="text-center pb-6">
                    <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    <div className="mt-6"><span className="text-5xl font-bold">{displayPrice}€</span><span className="text-gray-600 ml-1">{plan.period}</span></div>
                    {billingPeriod === 'annual' && plan.price > 0 && (<p className="text-sm text-green-600 mt-1">Au lieu de {plan.price}€/mois (-20%)</p>)}
                    <p className="text-xs text-gray-500 mt-2">{plan.users}</p>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-3">
                          {f.included ? <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" /> : <X className="h-5 w-5 text-gray-300 mt-0.5 flex-shrink-0" />}
                          <span className={`text-sm ${f.included ? 'text-gray-700' : 'text-gray-400'}`}>{f.text}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/register"><Button className={`w-full h-12 font-semibold ${plan.popular ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700' : ''}`} variant={plan.popular ? 'default' : 'outline'}>{plan.cta}<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
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
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">Impression, mise sous pli, affranchissement, envoi — tout est inclus. Choisissez votre pack et commencez à prospecter.</p>
          </div>

          {/* Tiers info */}
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            <div className="px-4 py-2 rounded-full border bg-gray-50 border-gray-200 text-sm text-gray-600">100 crédits = 1€</div>
            <div className="px-4 py-2 rounded-full border bg-green-50 border-green-200 text-sm text-green-700 font-medium">60 000+ crédits = -10%</div>
            <div className="px-4 py-2 rounded-full border bg-amber-50 border-amber-200 text-sm text-amber-700 font-medium">200 000+ crédits = -15%</div>
          </div>

          {/* Featured packs grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl mx-auto mb-8">
            {FEATURED_PACKS.map((pack, i) => (
              <div
                key={i}
                className={`relative rounded-2xl border p-5 text-center transition-all cursor-pointer hover:shadow-lg ${
                  pack.highlight
                    ? 'border-2 border-blue-500 shadow-xl bg-gradient-to-b from-blue-50 to-white ring-2 ring-blue-200'
                    : (pack as any).mega
                      ? 'border-2 border-amber-400 shadow-xl bg-gradient-to-b from-amber-50 to-white'
                      : 'border-gray-200 bg-white shadow-sm hover:border-blue-300'
                }`}
                onClick={() => {
                  setCreditAmount(pack.credits);
                  
                }}
              >
                {pack.badge && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${pack.badgeColor}`}>{pack.badge}</span>
                  </div>
                )}
                <h3 className="font-semibold text-gray-900 text-sm mt-1">{pack.label}</h3>
                <div className={`text-2xl font-bold my-2 ${pack.highlight ? 'text-blue-600' : (pack as any).mega ? 'text-amber-600' : 'text-gray-900'}`}>
                  {pack.credits.toLocaleString('fr-FR')}
                </div>
                <div className="text-xs text-gray-500 mb-2">crédits</div>
                <div className="text-lg font-bold text-gray-900">{pack.price.toLocaleString('fr-FR')}€</div>
                <div className="text-xs text-gray-500">{pack.letters} lettres</div>
                {pack.savings && (
                  <div className="text-xs text-green-600 font-medium mt-1">{pack.savings}</div>
                )}
                <p className="text-xs text-gray-400 mt-2">{pack.desc}</p>

                {isLoggedIn ? (
                  <Button
                    size="sm"
                    className={`w-full mt-3 ${pack.highlight ? 'bg-blue-600 hover:bg-blue-700' : (pack as any).mega ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600' : ''}`}
                    variant={pack.highlight || (pack as any).mega ? 'default' : 'outline'}
                    onClick={(e) => { e.stopPropagation(); handleBuyCredits(pack.credits, pack.price); }}
                    disabled={!!loadingPack}
                  >
                    {loadingPack === String(pack.credits) ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Acheter'}
                  </Button>
                ) : (
                  <Link href="/login" onClick={(e) => e.stopPropagation()}><Button size="sm" className="w-full mt-3" variant="outline">Se connecter</Button></Link>
                )}
              </div>
            ))}
          </div>

          {/* Custom amount - slider + input */}
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
                  <input type="range" min={1000} max={300000} step={1000} value={creditAmount > 300000 ? 300000 : creditAmount} onChange={(e) => setCreditAmount(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1 000</span><span>60 000</span><span>200 000</span><span>300 000</span></div>
                </div>
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div><div className="text-2xl font-bold text-blue-600">{creditAmount.toLocaleString("fr-FR")}</div><div className="text-sm text-gray-500">crédits</div></div>
                    <div><div className="text-2xl font-bold text-green-600">~{Math.floor(creditAmount / 410)}</div><div className="text-sm text-gray-500">lettres vertes</div></div>
                    <div><div className="text-2xl font-bold text-gray-900">{getDiscountedPrice(creditAmount).toLocaleString("fr-FR")}€</div><div className="text-sm text-gray-500">{getDiscountLabel(creditAmount)}</div>{creditAmount >= 60000 && (<div className="text-xs text-green-600 mt-1">Au lieu de {(creditAmount / 100).toLocaleString("fr-FR")}€</div>)}</div>
                  </div>
                </div>
                <div className="text-center">
                  {isLoggedIn ? (
                    <Button size="lg" className="h-14 px-8 text-lg" onClick={() => handleBuyCredits(creditAmount, getDiscountedPrice(creditAmount))} disabled={!!loadingPack}>
                      {loadingPack ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
                      Acheter {creditAmount.toLocaleString("fr-FR")} crédits pour {getDiscountedPrice(creditAmount).toLocaleString("fr-FR")}€
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
              { q: 'Y a-t-il des réductions sur les crédits ?', a: 'Oui. À partir de 60 000 crédits (600€), vous bénéficiez de -10%. À partir de 200 000 crédits, c’est -15% avec le Megapack.' },
              { q: 'Comment fonctionne le paiement annuel ?', a: 'Le paiement annuel offre 20% de réduction sur l’abonnement uniquement. Vous payez pour 12 mois en une fois.' },
              { q: 'Les crédits expirent-ils ?', a: 'Non. Vos crédits n’expirent jamais. Utilisez-les quand vous le souhaitez.' },
              { q: 'Puis-je acheter un montant personnalisé ?', a: 'Oui. Cliquez sur « Montant personnalisé » pour choisir exactement le nombre de crédits dont vous avez besoin, par tranches de 1 000.' },
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
