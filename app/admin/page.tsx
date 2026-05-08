'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { useAuth } from '@/lib/auth-client';
import { 
  Bot, Building2, Users, Search, CreditCard, TrendingUp, Activity, DollarSign, BarChart3,
  Target, Calendar, Mail, Zap, ArrowUp, ArrowDown, Percent, Euro, Clock,
  UserPlus, Building, Trophy, AlertTriangle, Send, Receipt, Tag, ChevronRight,
  CheckCircle, Clock3, CheckCircle2, Sparkles
} from 'lucide-react';

// Format numbers with proper French formatting
const formatNumber = (num: number) => {
  return new Intl.NumberFormat('fr-FR').format(num);
};

const formatEuro = (num: number) => {
  return new Intl.NumberFormat('fr-FR', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(num);
};

const formatPercent = (num: number) => {
  return `${num}%`;
};

// Enhanced KPI Card component with dark mode support
function KPICard({ 
  icon: Icon, 
  label, 
  value, 
  sub, 
  trend, 
  color = "text-blue-600 dark:text-blue-400", 
  bg = "bg-blue-50 dark:bg-blue-950/50",
  borderColor = "border-blue-200 dark:border-blue-800"
}: { 
  icon: any; 
  label: string; 
  value: string; 
  sub?: string; 
  trend?: { value: number; positive?: boolean };
  color?: string; 
  bg?: string;
  borderColor?: string;
}) {
  return (
    <Card className={`${borderColor} bg-white dark:bg-gray-800 hover:shadow-md transition-shadow`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${bg}`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
              {sub && <p className="text-xs text-gray-500 dark:text-gray-500">{sub}</p>}
            </div>
          </div>
          {trend && (
            <div className={`flex items-center gap-1 ${
              trend.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {trend.positive ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              <span className="text-sm font-medium">{formatPercent(Math.abs(trend.value))}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Simple bar chart component with dark mode
function BarChart({ data, height = 120, color = "bg-blue-500 dark:bg-blue-400" }: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  if (!data || data.length === 0) return <div className="text-gray-500 dark:text-gray-400 text-sm">Pas de données</div>;
  
  const max = Math.max(...data.map(d => d.value));
  
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * 100 : 0;
        return (
          <div key={i} className="flex-1 group relative">
            <div 
              className={`${color} hover:opacity-80 rounded-t transition-all`}
              style={{ height: `${Math.max(h, 2)}%` }} 
            />
            <div className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-black dark:bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
              {d.label}: {formatNumber(d.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Horizontal bar chart with dark mode
function HorizontalBarChart({ data, colors }: {
  data: { label: string; value: number; color?: string }[];
  colors?: string[];
}) {
  if (!data || data.length === 0) return <div className="text-gray-500 dark:text-gray-400 text-sm">Pas de données</div>;
  
  const total = data.reduce((sum, d) => sum + d.value, 0);
  
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const percentage = total > 0 ? (d.value / total) * 100 : 0;
        const barColor = d.color || (colors && colors[i]) || 'bg-gray-400 dark:bg-gray-600';
        
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
              {d.label}
            </div>
            <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
              <div 
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="w-20 text-sm text-right text-gray-600 dark:text-gray-400">
              {formatNumber(d.value)} ({percentage.toFixed(0)}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Conversion funnel component
function ConversionFunnel({ data }: {
  data: {
    total_signups: number;
    users_with_search: number;
    users_with_mail: number;
    users_paid: number;
    signup_to_search_rate: number;
    search_to_mail_rate: number;
    free_to_paid_rate: number;
  };
}) {
  const steps = [
    { label: 'Inscriptions', value: data.total_signups, rate: 100 },
    { label: 'Première recherche', value: data.users_with_search, rate: data.signup_to_search_rate },
    { label: 'Premier courrier', value: data.users_with_mail, rate: data.search_to_mail_rate },
    { label: 'Upgrade payant', value: data.users_paid, rate: data.free_to_paid_rate }
  ];

  return (
    <div className="space-y-4">
      {steps.map((step, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-gray-900 dark:text-white">{step.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-900 dark:text-white">{formatNumber(step.value)}</span>
              {i > 0 && (
                <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-700">
                  {formatPercent(step.rate)}
                </Badge>
              )}
            </div>
          </div>
          <div className="relative">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${step.rate}%` }}
              />
            </div>
            {i < steps.length - 1 && (
              <div className="absolute -right-2 top-1/2 transform -translate-y-1/2">
                <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-600" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Section header component
function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard', { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      
      if (!res.ok) {
        throw new Error('Erreur lors du chargement des données');
      }
      
      const d = await res.json();
      setData(d);
      
      // Fetch AI stats (OpenRouter balance)
      try {
        const aiRes = await fetch('/api/admin/ai-stats', { 
          headers: { Authorization: `Bearer ${token}` } 
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          d.ai_stats = aiData;
          setData({...d});
        }
      } catch {}
      setError(null);
    } catch (e: any) { 
      console.error(e); 
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { 
    if (token) fetchData(); 
  }, [token, fetchData]);

  if (loading) return (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded"></div>
          ))}
        </div>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
        Erreur de chargement: {error || 'Données non disponibles'}
      </div>
    </div>
  );

  const { financial, users_orgs, usage, engagement, funnel, promo, trends, tables } = data;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="space-y-8 p-4 md:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">Dashboard Admin</h1>
          <p className="text-gray-600 dark:text-gray-400">Vue d&apos;ensemble complète de Proprietaire.net</p>
        </div>

        {/* Section 1: Financial Overview */}
        <div className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 p-6 rounded-xl border border-green-200 dark:border-green-800">
          <SectionHeader 
            title="Vue Financière" 
            description="Indicateurs de performance financière et de croissance"
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <KPICard 
              icon={DollarSign} 
              label="MRR" 
              value={formatEuro(financial.mrr)} 
              sub="Revenu mensuel récurrent"
              trend={financial.mrr_growth !== 0 ? { value: financial.mrr_growth, positive: financial.mrr_growth > 0 } : undefined}
              color="text-green-600 dark:text-green-400" 
              bg="bg-green-50 dark:bg-green-950/50" 
              borderColor="border-green-200 dark:border-green-800"
            />
            
            <KPICard 
              icon={TrendingUp} 
              label="ARR" 
              value={formatEuro(financial.arr)} 
              sub="Revenu annuel récurrent"
              color="text-blue-600 dark:text-blue-400" 
              bg="bg-blue-50 dark:bg-blue-950/50" 
              borderColor="border-blue-200 dark:border-blue-800"
            />
            
            <KPICard 
              icon={Target} 
              label="ARPA" 
              value={formatEuro(financial.arpa)} 
              sub="Revenu moyen par compte"
              color="text-purple-600 dark:text-purple-400" 
              bg="bg-purple-50 dark:bg-purple-950/50" 
              borderColor="border-purple-200 dark:border-purple-800"
            />
            
            <KPICard 
              icon={Percent} 
              label="Churn Rate" 
              value={formatPercent(financial.churn_rate)} 
              sub="Taux d&apos;attrition mensuel"
              color="text-red-600 dark:text-red-400" 
              bg="bg-red-50 dark:bg-red-950/50" 
              borderColor="border-red-200 dark:border-red-800"
            />
            
            <KPICard 
              icon={Zap} 
              label="LTV" 
              value={formatEuro(financial.ltv)} 
              sub="Valeur vie client estimée"
              color="text-yellow-600 dark:text-yellow-400" 
              bg="bg-yellow-50 dark:bg-yellow-950/50" 
              borderColor="border-yellow-200 dark:border-yellow-800"
            />
            
            <KPICard 
              icon={Euro} 
              label="Revenue Total" 
              value={formatEuro(financial.lifetime_revenue)} 
              sub="Revenus cumulés"
              color="text-indigo-600 dark:text-indigo-400" 
              bg="bg-indigo-50 dark:bg-indigo-950/50" 
              borderColor="border-indigo-200 dark:border-indigo-800"
            />
          </div>

          {/* OpenRouter Balance + AI Cost */}
          {data.ai_stats?.openrouter_balance && (
            <div className="mt-4 flex flex-wrap gap-4">
              {data.ai_stats.openrouter_balance.remaining !== null && (
                <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Bot className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-gray-500">Solde OpenRouter</p>
                    <p className={`text-lg font-bold ${data.ai_stats.openrouter_balance.remaining < 5 ? 'text-red-600' : data.ai_stats.openrouter_balance.remaining < 20 ? 'text-orange-600' : 'text-blue-600'}`}>
                      {"$" + data.ai_stats.openrouter_balance.remaining.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
              {data.ai_stats.month && (
                <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-800">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-xs text-gray-500">IA ce mois</p>
                    <p className="text-lg font-bold text-purple-600">
                      {data.ai_stats.month.total_generations + " gen."}
                    </p>
                  </div>
                </div>
              )}
              {data.ai_stats.month && parseFloat(data.ai_stats.month.total_cost_usd) > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 rounded-lg border border-green-200 dark:border-green-800">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-gray-500">Coût IA ce mois</p>
                    <p className="text-lg font-bold text-green-600">
                      {"$" + parseFloat(data.ai_stats.month.total_cost_usd).toFixed(4)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2: Main Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">MRR Mensuel (12 mois)</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart 
                data={trends.monthly_mrr?.map((d: any) => ({
                  label: new Date(d.month).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
                  value: d.mrr
                })) || []}
                color="bg-green-500 dark:bg-green-400"
              />
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Revenus Quotidiens (30j)</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart 
                data={trends.daily_revenue?.map((d: any) => ({
                  label: new Date(d.day).toLocaleDateString('fr-FR'),
                  value: d.revenue
                })) || []}
                color="bg-blue-500 dark:bg-blue-400"
              />
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Users & Organizations */}
        <div>
          <SectionHeader 
            title="Utilisateurs & Organisations" 
            description="Métriques d&apos;acquisition et d&apos;engagement utilisateurs"
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard 
              icon={Users} 
              label="Total Utilisateurs" 
              value={formatNumber(users_orgs.total_users)} 
              sub={`+${users_orgs.new_users_week} cette semaine`}
            />
            
            <KPICard 
              icon={UserPlus} 
              label="Nouveaux (mois)" 
              value={formatNumber(users_orgs.new_users_month)} 
              sub="Inscriptions ce mois"
              color="text-green-600 dark:text-green-400" 
              bg="bg-green-50 dark:bg-green-950/50"
            />
            
            <KPICard 
              icon={Activity} 
              label="Utilisateurs Actifs" 
              value={formatNumber(users_orgs.active_users)} 
              sub="7 derniers jours"
              color="text-blue-600 dark:text-blue-400" 
              bg="bg-blue-50 dark:bg-blue-950/50"
            />
            
            <KPICard 
              icon={Percent} 
              label="Taux d&apos;Activité" 
              value={formatPercent(users_orgs.active_rate)} 
              sub="Utilisateurs actifs / total"
              color="text-purple-600 dark:text-purple-400" 
              bg="bg-purple-50 dark:bg-purple-950/50"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard 
              icon={Building2} 
              label="Total Organisations" 
              value={formatNumber(users_orgs.total_orgs)} 
              sub={`+${users_orgs.new_orgs_week} cette semaine`}
            />
            
            <KPICard 
              icon={Building} 
              label="Nouvelles (mois)" 
              value={formatNumber(users_orgs.new_orgs_month)} 
              sub="Organisations ce mois"
              color="text-green-600 dark:text-green-400" 
              bg="bg-green-50 dark:bg-green-950/50"
            />
            
            <KPICard 
              icon={Users} 
              label="Moy. Users/Org" 
              value={users_orgs.avg_users_per_org.toString()} 
              sub="Utilisateurs par organisation"
              color="text-blue-600 dark:text-blue-400" 
              bg="bg-blue-50 dark:bg-blue-950/50"
            />
            
            <KPICard 
              icon={AlertTriangle} 
              label="Orgs à Risque" 
              value={formatNumber(users_orgs.inactive_orgs)} 
              sub="Inactives >30j"
              color="text-red-600 dark:text-red-400" 
              bg="bg-red-50 dark:bg-red-950/50"
            />
          </div>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Inscriptions Quotidiennes (30j)</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart 
                data={trends.daily_signups?.map((d: any) => ({
                  label: new Date(d.day).toLocaleDateString('fr-FR'),
                  value: d.signups
                })) || []}
                color="bg-purple-500 dark:bg-purple-400"
              />
            </CardContent>
          </Card>
        </div>

        {/* Section 4: Usage & Courriers */}
        <div>
          <SectionHeader 
            title="Usage & Courriers" 
            description="Métriques d&apos;utilisation du service de courrier"
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard 
              icon={Mail} 
              label="Total Courriers" 
              value={formatNumber(usage.total_mails)} 
              sub="Depuis le lancement"
            />
            
            <KPICard 
              icon={Calendar} 
              label="Ce Mois" 
              value={formatNumber(usage.mails_month)} 
              sub="Courriers envoyés"
              color="text-blue-600 dark:text-blue-400" 
              bg="bg-blue-50 dark:bg-blue-950/50"
            />
            
            <KPICard 
              icon={Clock} 
              label="Cette Semaine" 
              value={formatNumber(usage.mails_week)} 
              sub="Courriers envoyés"
              color="text-green-600 dark:text-green-400" 
              bg="bg-green-50 dark:bg-green-950/50"
            />
            
            <KPICard 
              icon={Send} 
              label="Aujourd&apos;hui" 
              value={formatNumber(usage.mails_today)} 
              sub="Courriers envoyés"
              color="text-purple-600 dark:text-purple-400" 
              bg="bg-purple-50 dark:bg-purple-950/50"
            />
          </div>

          <div className="mb-6">
            <KPICard 
              icon={Receipt} 
              label="Revenus Courriers" 
              value={formatEuro(usage.mail_revenue)} 
              sub="Chiffre d&apos;affaires postal"
              color="text-yellow-600 dark:text-yellow-400" 
              bg="bg-yellow-50 dark:bg-yellow-950/50"
              borderColor="border-yellow-200 dark:border-yellow-800"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-white">Distribution par Type d&apos;Affranchissement</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart 
                  data={usage.mails_by_type?.map((d: any) => ({
                    label: d.type_affranchissement || 'Non défini',
                    value: d.count
                  })) || []}
                  colors={['bg-blue-500 dark:bg-blue-400', 'bg-green-500 dark:bg-green-400', 'bg-purple-500 dark:bg-purple-400', 'bg-orange-500 dark:bg-orange-400']}
                />
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-white">Courriers Quotidiens (30j)</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart 
                  data={trends.daily_mails?.map((d: any) => ({
                    label: new Date(d.day).toLocaleDateString('fr-FR'),
                    value: d.mails
                  })) || []}
                  color="bg-indigo-500 dark:bg-indigo-400"
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section 5: Credits & Monetization */}
        <div>
          <SectionHeader 
            title="Crédits & Monétisation" 
            description="Gestion et utilisation des crédits"
          />
          
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <KPICard 
                icon={CreditCard} 
                label="Crédits Vendus" 
                value={formatNumber(usage.credits_purchased)} 
                sub="Total vendu"
                color="text-green-600 dark:text-green-400" 
                bg="bg-green-50 dark:bg-green-950/50"
              />
              
              <KPICard 
                icon={Activity} 
                label="Crédits Utilisés" 
                value={formatNumber(usage.credits_used)} 
                sub="Total consommé"
                color="text-red-600 dark:text-red-400" 
                bg="bg-red-50 dark:bg-red-950/50"
              />
            </div>
            
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg text-gray-900 dark:text-white">Taux d&apos;Utilisation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Utilisation globale</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                      {formatPercent(usage.credit_utilization_rate)}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(usage.credit_utilization_rate, 100)}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatNumber(usage.credits_remaining)} crédits restants au total
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Recherches par Type</CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart 
                data={usage.searches_by_type?.map((d: any) => ({
                  label: d.search_type || 'Non défini',
                  value: d.count
                })) || []}
                colors={['bg-cyan-500 dark:bg-cyan-400', 'bg-pink-500 dark:bg-pink-400', 'bg-amber-500 dark:bg-amber-400', 'bg-lime-500 dark:bg-lime-400']}
              />
            </CardContent>
          </Card>
        </div>

        {/* Section 6: Conversion Funnel */}
        <div>
          <SectionHeader 
            title="Funnel de Conversion" 
            description="Parcours utilisateur de l&apos;inscription au paiement"
          />
          
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <KPICard 
              icon={Clock3} 
              label="Délai Inscription→Recherche" 
              value={`${funnel.avg_hours_to_search}h`} 
              sub="Temps moyen"
              color="text-blue-600 dark:text-blue-400" 
              bg="bg-blue-50 dark:bg-blue-950/50"
            />
            
            <KPICard 
              icon={CheckCircle2} 
              label="Délai Recherche→Courrier" 
              value={`${funnel.avg_hours_search_to_mail}h`} 
              sub="Temps moyen"
              color="text-green-600 dark:text-green-400" 
              bg="bg-green-50 dark:bg-green-950/50"
            />
            
            <KPICard 
              icon={Target} 
              label="Conversion Globale" 
              value={formatPercent(funnel.free_to_paid_rate)} 
              sub="Gratuit → Payant"
              color="text-purple-600 dark:text-purple-400" 
              bg="bg-purple-50 dark:bg-purple-950/50"
            />
          </div>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Funnel de Conversion</CardTitle>
            </CardHeader>
            <CardContent>
              <ConversionFunnel data={funnel} />
            </CardContent>
          </Card>
        </div>

        {/* Section 7: Engagement */}
        <div>
          <SectionHeader 
            title="Engagement" 
            description="Activité et interaction utilisateurs"
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard 
              icon={Activity} 
              label="Sessions (24h)" 
              value={formatNumber(engagement.sessions_24h)} 
              sub="Connexions actives"
              color="text-green-600 dark:text-green-400" 
              bg="bg-green-50 dark:bg-green-950/50"
            />
            
            <KPICard 
              icon={Users} 
              label="Contacts CRM" 
              value={formatNumber(engagement.contacts_month)} 
              sub="Créés ce mois"
              color="text-blue-600 dark:text-blue-400" 
              bg="bg-blue-50 dark:bg-blue-950/50"
            />
            
            <KPICard 
              icon={Send} 
              label="Campagnes Actives" 
              value={formatNumber(engagement.active_campaigns)} 
              sub="En cours"
              color="text-purple-600 dark:text-purple-400" 
              bg="bg-purple-50 dark:bg-purple-950/50"
            />
            
            <KPICard 
              icon={CheckCircle} 
              label="Drip Complétés" 
              value={formatNumber(engagement.drip_completed)} 
              sub="Séquences terminées"
              color="text-green-600 dark:text-green-400" 
              bg="bg-green-50 dark:bg-green-950/50"
            />
          </div>

          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg text-gray-900 dark:text-white">Répartition Emails Drip</CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBarChart 
                data={engagement.drip_by_step?.map((d: any) => ({
                  label: `Étape ${d.step}`,
                  value: d.count
                })) || []}
                colors={['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500']}
              />
            </CardContent>
          </Card>
        </div>

        {/* Section 8: Detailed Tables */}
        <div>
          <SectionHeader 
            title="Données Détaillées" 
            description="Tables de données approfondies"
          />
          
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* Top Organizations */}
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Top Organisations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tables.top_organizations?.map((org: any, i: number) => (
                    <div key={org.id} className="flex items-center justify-between py-3 border-b last:border-0 border-gray-200 dark:border-gray-700">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">{org.name}</span>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${
                              org.subscription_plan === 'free' 
                                ? 'bg-gray-100 dark:bg-gray-700' 
                                : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300'
                            }`}
                          >
                            {org.subscription_plan}
                          </Badge>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <span>{formatEuro(org.individual_mrr || 0)}/mois</span>
                          <span>{org.user_count} users</span>
                          <span>{formatNumber(org.credits_balance)} crédits</span>
                          {org.last_activity && (
                            <span>Actif: {new Date(org.last_activity).toLocaleDateString('fr-FR')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Signups */}
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                  <UserPlus className="h-5 w-5 text-green-500" />
                  Dernières Inscriptions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tables.recent_signups?.map((user: any) => (
                    <div key={user.id} className="flex items-center justify-between py-3 border-b last:border-0 border-gray-200 dark:border-gray-700">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {user.first_name} {user.last_name}
                          </span>
                          <Badge 
                            variant={user.onboarding_status === 'completed' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {user.onboarding_status === 'completed' ? '✓ Actif' : '⏳ En attente'}
                          </Badge>
                        </div>
                        <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <span>{user.email}</span>
                          <span>{user.org_name}</span>
                          <span>{new Date(user.created_at).toLocaleDateString('fr-FR')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Promo Codes */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                <Tag className="h-5 w-5 text-orange-500" />
                Codes Promo Actifs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tables.active_promo_codes?.map((promo: any, i: number) => (
                  <div key={i} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-2">
                      <code className="font-mono font-bold text-gray-900 dark:text-white bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded">
                        {promo.code}
                      </code>
                      <Badge variant="outline" className="text-xs">
                        {promo.type}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <div>Remise: {promo.discount_percent}%</div>
                      <div>Utilisations: {promo.uses_count}/{promo.max_uses}</div>
                      <div>Expire: {new Date(promo.expires_at).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>
                ))}
                
                {(!tables.active_promo_codes || tables.active_promo_codes.length === 0) && (
                  <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
                    Aucun code promo actif
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}