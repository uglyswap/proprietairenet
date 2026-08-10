'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Search, Mail, Coins, Users, TrendingUp, TrendingDown,
  MapPin, Loader2, BarChart3, Target, Minus, Lock,
} from 'lucide-react';
import { getMe, getAuthHeaders, ClientUser, ClientOrganization } from '@/lib/auth-client';

interface AnalyticsData {
  searches: { total: number; this_month: number; last_month: number };
  courriers: {
    total: number;
    this_month: number;
    by_type: Record<string, number>;
    by_month: { month: string; label: string; count: number }[];
  };
  credits: { balance: number; total_used: number; this_month: number };
  contacts: {
    total: number;
    by_status: { status: string; count: number }[];
    conversion_rate: number;
  };
  top_zones: { zone: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  interested: 'Intéressé',
  negotiation: 'Négociation',
  won: 'Gagné',
  lost: 'Perdu',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-gray-400',
  contacted: 'bg-blue-500',
  interested: 'bg-yellow-500',
  negotiation: 'bg-purple-500',
  won: 'bg-green-500',
  lost: 'bg-red-400',
};

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  // Refus de plan : sans cet etat, un 402 laissait `data` a null et `loading` a
  // false, donc la garde `if (loading || !data)` affichait un spinner
  // indefiniment. Un cul-de-sac silencieux pour tout compte gratuit.
  const [verrouilleParPlan, setVerrouilleParPlan] = useState(false);
  const [messagePlan, setMessagePlan] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const me = await getMe();
      if (!me) { router.push('/login'); return; }

      const res = await fetch('/api/analytics', { headers: getAuthHeaders() });
      if (res.ok) {
        const analytics = await res.json();
        setData(analytics);
      } else if (res.status === 402) {
        const corps = await res.json().catch(() => ({}));
        setVerrouilleParPlan(true);
        setMessagePlan(
          typeof corps?.error === 'string' && corps.error.trim()
            ? corps.error
            : "Le tableau de bord analytique est réservé à l'offre Pro."
        );
      }
    } catch (err) {
      console.error('Analytics error:', err);
    } finally { setLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (verrouilleParPlan) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Tableau de bord analytique</h1>
        <p className="max-w-md text-sm text-muted-foreground">{messagePlan}</p>
        <Button onClick={() => router.push('/pricing')}>Voir les offres</Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">Données indisponibles</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Les statistiques n&apos;ont pas pu être chargées. Réessayez dans un instant.
        </p>
        <Button variant="outline" onClick={() => { setLoading(true); loadData(); }}>
          Réessayer
        </Button>
      </div>
    );
  }

  const searchTrend = data.searches.last_month > 0
    ? Math.round(((data.searches.this_month - data.searches.last_month) / data.searches.last_month) * 100)
    : data.searches.this_month > 0 ? 100 : 0;

  const maxBarValue = Math.max(...data.courriers.by_month.map(m => m.count), 1);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Dashboard</Button>
            </Link>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              <h1 className="text-lg font-semibold">Analytics</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* ═══ KPI Cards ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Searches */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Recherches</p>
                  <p className="text-3xl font-bold">{data.searches.total}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {searchTrend > 0 ? (
                      <TrendingUp className="h-3 w-3 text-green-600" />
                    ) : searchTrend < 0 ? (
                      <TrendingDown className="h-3 w-3 text-red-600" />
                    ) : (
                      <Minus className="h-3 w-3 text-gray-400" />
                    )}
                    <span className={`text-xs ${searchTrend > 0 ? 'text-green-600' : searchTrend < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {searchTrend > 0 ? '+' : ''}{searchTrend}% vs mois dernier
                    </span>
                  </div>
                </div>
                <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Search className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{data.searches.this_month} ce mois</p>
            </CardContent>
          </Card>

          {/* Courriers */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Courriers envoyés</p>
                  <p className="text-3xl font-bold">{data.courriers.total}</p>
                </div>
                <div className="h-12 w-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Mail className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{data.courriers.this_month} ce mois</p>
            </CardContent>
          </Card>

          {/* Credits */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Crédits</p>
                  <p className="text-3xl font-bold">{data.credits.balance}</p>
                  <p className="text-xs text-muted-foreground">restants</p>
                </div>
                <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Coins className="h-6 w-6 text-yellow-600" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{data.credits.this_month} utilisés ce mois · {data.credits.total_used} total</p>
            </CardContent>
          </Card>

          {/* Contacts */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Contacts CRM</p>
                  <p className="text-3xl font-bold">{data.contacts.total}</p>
                </div>
                <div className="h-12 w-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-indigo-600" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Taux de conversion : {data.contacts.conversion_rate}%</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ═══ Courriers par mois (Chart) ═══ */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Courriers envoyés par mois
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 h-[200px]">
                {data.courriers.by_month.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{m.count}</span>
                    <div className="w-full bg-gray-100 rounded-t relative" style={{ height: '160px' }}>
                      <div
                        className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all duration-500"
                        style={{ height: `${maxBarValue > 0 ? (m.count / maxBarValue) * 100 : 0}%`, minHeight: m.count > 0 ? '4px' : '0px' }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground text-center leading-tight">{m.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ═══ Conversion Rate ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" />
                Taux de conversion
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                  <circle
                    cx="60" cy="60" r="50" fill="none"
                    stroke={data.contacts.conversion_rate >= 50 ? '#22c55e' : data.contacts.conversion_rate >= 20 ? '#eab308' : '#6366f1'}
                    strokeWidth="12"
                    strokeDasharray={`${(data.contacts.conversion_rate / 100) * 314} 314`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold">{data.contacts.conversion_rate}%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Contacts &quot;Gagné&quot; / Total
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ═══ CRM Status Distribution ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Répartition des contacts par statut
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.contacts.by_status.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucun contact dans le CRM</p>
              ) : (
                <div className="space-y-3">
                  {data.contacts.by_status.map((item, i) => {
                    const pct = data.contacts.total > 0 ? Math.round((item.count / data.contacts.total) * 100) : 0;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{STATUS_LABELS[item.status] || item.status}</span>
                          <span className="text-muted-foreground">{item.count} ({pct}%)</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${STATUS_COLORS[item.status] || 'bg-gray-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ═══ Top 5 Zones ═══ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Top 5 zones recherchées
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.top_zones.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Aucune recherche enregistrée</p>
              ) : (
                <div className="space-y-3">
                  {data.top_zones.map((zone, i) => {
                    const maxCount = data.top_zones[0]?.count || 1;
                    const pct = Math.round((zone.count / maxCount) * 100);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="font-medium">{zone.zone}</span>
                            <span className="text-muted-foreground">{zone.count} recherche{zone.count > 1 ? 's' : ''}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══ Courriers par type d'affranchissement ═══ */}
        {Object.keys(data.courriers.by_type).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Courriers par type d&apos;affranchissement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {Object.entries(data.courriers.by_type).map(([type, count]) => {
                  const labels: Record<string, string> = {
                    ecopli: 'Écopli', verte: 'Lettre Verte', vertesuivi: 'Verte Suivie',
                    performance: 'Performance', perfsuivi: 'Perf. Suivie', lr: 'Recommandé', lrar: 'LRAR',
                  };
                  return (
                    <Badge key={type} variant="secondary" className="px-3 py-2 text-sm">
                      {labels[type] || type}: <span className="font-bold ml-1">{count}</span>
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
