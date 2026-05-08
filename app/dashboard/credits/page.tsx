'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Loader2, Mail, ArrowLeft, Coins } from 'lucide-react';
import { getAuthHeaders, getToken, getMe } from '@/lib/auth-client';
import { toast } from 'sonner';

const LETTER_COSTS = [
  { type: 'Lettre Verte', credits: 410 }, { type: 'Verte Suivie', credits: 490 },
  { type: 'Performance', credits: 520 }, { type: 'Perf. Suivie', credits: 600 },
  { type: 'Recommandé', credits: 1080 }, { type: 'Recommandé AR', credits: 1250 },
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

interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price_euros: number;
  sort_order: number;
}

export default function CreditsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState(20000);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);

  // Fetch credit packs from API
  useEffect(() => {
    fetch('/api/plans')
      .then(r => r.json())
      .then(data => {
        setCreditPacks(data.credit_packs || []);
      })
      .catch(() => {});
  }, []);

  // Pre-select amount from URL query param
  useEffect(() => {
    const amount = searchParams.get("amount");
    if (amount) setCreditAmount(Math.max(100, parseInt(amount) || 20000));
  }, [searchParams]);

  // Auth check
  useEffect(() => {
    const token = getToken();
    if (!token) { router.push('/login'); return; }
    getMe().then(data => {
      if (data?.organization) setCurrentBalance(data.organization.credits_balance || 0);
      setLoading(false);
    }).catch(() => { router.push('/login'); });
  }, [router]);

  const handleBuyCredits = async (credits: number) => {
    setLoadingPack(String(credits));
    try {
      const headers = getAuthHeaders();
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ type: 'custom_credits', credits }),
      });
      const data = await response.json();
      if (!response.ok) { toast.error(data.error || 'Erreur'); return; }
      if (data.url) window.location.href = data.url;
    } catch { toast.error('Erreur de connexion'); } finally { setLoadingPack(null); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour au dashboard
            </Button>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Acheter des crédits</h1>
            <p className="text-muted-foreground mt-1">Crédits pour l&apos;envoi de courriers postaux. Tout inclus.</p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            <Coins className="h-4 w-4 mr-2" />
            {currentBalance.toLocaleString('fr-FR')} crédits
          </Badge>
        </div>

        {/* Tiers info */}
        <div className="flex flex-wrap justify-center gap-3 mb-6">
          <div className="px-4 py-2 rounded-full border bg-gray-50 border-gray-200 text-sm text-gray-600">100 crédits = 1€</div>
          <div className="px-4 py-2 rounded-full border bg-green-50 border-green-200 text-sm text-green-700 font-medium">60 000+ = -10%</div>
          <div className="px-4 py-2 rounded-full border bg-amber-50 border-amber-200 text-sm text-amber-700 font-medium">200 000+ = -15% 🔥</div>
        </div>

        {/* Featured packs from API */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {creditPacks.map((pack) => {
            const discountedPrice = getDiscountedPrice(pack.credits);
            const discount = getDiscountLabel(pack.credits);
            const isHighlighted = pack.credits >= 50000 && pack.credits < 100000;
            const isMega = pack.credits >= 200000;

            return (
              <div key={pack.id} className={`relative rounded-2xl border p-5 text-center transition-all cursor-pointer hover:shadow-lg ${
                isHighlighted ? 'border-2 border-blue-500 shadow-xl bg-gradient-to-b from-blue-50 to-white' :
                isMega ? 'border-2 border-amber-400 shadow-xl bg-gradient-to-b from-amber-50 to-white' :
                'border-gray-200 bg-white shadow-sm hover:border-blue-300'
              }`} onClick={() => setCreditAmount(pack.credits)}>
                {discount !== 'tarif normal' && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${
                      isMega ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' : 'bg-green-600 text-white'
                    }`}>{discount}</span>
                  </div>
                )}
                <h3 className="font-semibold text-gray-900 text-sm mt-2">{pack.name}</h3>
                <div className={`text-xl font-bold my-1 ${isHighlighted ? 'text-blue-600' : isMega ? 'text-amber-600' : 'text-gray-900'}`}>
                  {pack.credits.toLocaleString('fr-FR')}
                </div>
                <div className="text-xs text-gray-500 mb-1">crédits</div>
                <div className="text-lg font-bold text-gray-900">{discountedPrice.toLocaleString('fr-FR')}€</div>
                <div className="text-xs text-gray-500">~{Math.floor(pack.credits / 410)} lettres</div>
                {discount !== 'tarif normal' && (
                  <div className="text-xs text-green-600 font-medium mt-1">
                    Au lieu de {(pack.credits / 100).toLocaleString('fr-FR')}€
                  </div>
                )}
                <Button size="sm" className={`w-full mt-3 ${isHighlighted ? 'bg-blue-600 hover:bg-blue-700' : isMega ? 'bg-gradient-to-r from-amber-500 to-orange-500' : ''}`}
                  variant={isHighlighted || isMega ? 'default' : 'outline'}
                  onClick={(e) => { e.stopPropagation(); handleBuyCredits(pack.credits); }}
                  disabled={!!loadingPack}>
                  {loadingPack === String(pack.credits) ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Acheter'}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Slider for custom amount */}
        <Card className="mb-8">
          <CardContent className="pt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm text-muted-foreground font-medium">Montant personnalisé</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={100} step={100} value={creditAmount} onChange={(e) => { const v = parseInt(e.target.value) || 0; setCreditAmount(Math.max(100, v)); }} className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-xs text-gray-400">crédits</span>
                </div>
              </div>
              <input type="range" min={1000} max={300000} step={1000} value={Math.min(creditAmount, 300000)}
                onChange={(e) => setCreditAmount(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1 000</span><span>60 000</span><span>200 000</span><span>300 000</span>
              </div>
            </div>
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-3xl font-bold text-blue-600">{creditAmount.toLocaleString('fr-FR')}</div>
                  <div className="text-sm text-gray-500">crédits</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-green-600">~{Math.floor(creditAmount / 410)}</div>
                  <div className="text-sm text-gray-500">lettres vertes</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-gray-900">{getDiscountedPrice(creditAmount).toLocaleString('fr-FR')}€</div>
                  <div className="text-sm text-gray-500">{getDiscountLabel(creditAmount)}</div>
                  {creditAmount >= 60000 && (<div className="text-xs text-green-600 mt-1">Au lieu de {(creditAmount / 100).toLocaleString('fr-FR')}€</div>)}
                </div>
              </div>
            </div>
            <div className="text-center">
              <Button size="lg" className="h-14 px-8 text-lg" onClick={() => handleBuyCredits(creditAmount)} disabled={!!loadingPack}>
                {loadingPack ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
                Acheter {creditAmount.toLocaleString('fr-FR')} crédits pour {getDiscountedPrice(creditAmount).toLocaleString('fr-FR')}€
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Letter cost reference */}
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />Coût par courrier (en crédits)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {LETTER_COSTS.map((lc, i) => (
                <div key={i} className="flex justify-between items-center bg-white rounded-lg px-3 py-2 text-sm">
                  <span className="text-gray-600">{lc.type}</span>
                  <span className="font-semibold">{lc.credits} cr.</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">100 crédits = 1€ · Tout inclus · Les crédits n&apos;expirent jamais</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
