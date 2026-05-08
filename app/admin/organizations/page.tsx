'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-client';
import { Building2, Search, Gift, Users } from 'lucide-react';

export default function AdminOrganizationsPage() {
  const { token } = useAuth();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [giftModal, setGiftModal] = useState<string | null>(null);
  const [giftType, setGiftType] = useState('credits');
  const [giftCredits, setGiftCredits] = useState(100);
  const [giftPlan, setGiftPlan] = useState('pro');
  const [giftDays, setGiftDays] = useState(30);
  const [giftReason, setGiftReason] = useState('');
  const [message, setMessage] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    const [orgsRes, plansRes] = await Promise.all([
      fetch('/api/admin/organizations', { headers }),
      fetch('/api/admin/plans', { headers }),
    ]);
    const orgsData = await orgsRes.json();
    const plansData = await plansRes.json();
    setOrgs(orgsData.organizations || []);
    setPlans(plansData.plans || []);
    setLoading(false);
  }, [token]);

  useEffect(() => { if (token) fetchData(); }, [token, fetchData]);

  const sendGift = async (orgId: string) => {
    const body: any = { organization_id: orgId, gift_type: giftType, reason: giftReason };
    if (giftType === 'credits') body.credits_amount = giftCredits;
    if (giftType === 'free_plan') { body.plan_slug = giftPlan; body.plan_days = giftDays; }

    const res = await fetch('/api/admin/gifts', { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.ok) { setMessage('✅ Cadeau envoyé !'); setGiftModal(null); fetchData(); }
    else { const d = await res.json(); setMessage('❌ ' + d.error); }
    setTimeout(() => setMessage(''), 3000);
  };

  const filtered = orgs.filter(o => o.name?.toLowerCase().includes(search.toLowerCase()) || o.email?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="p-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Organisations</h1>
          <p className="text-muted-foreground">{orgs.length} organisations enregistrées</p>
        </div>
        {message && <Badge variant="secondary" className="py-1 px-3">{message}</Badge>}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="space-y-3">
        {filtered.map(org => (
          <Card key={org.id}>
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-blue-50 rounded-lg"><Building2 className="h-5 w-5 text-blue-600" /></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{org.name}</span>
                      <Badge variant={org.subscription_plan === 'free' ? 'secondary' : 'default'}>{org.subscription_plan}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span><Users className="inline h-3 w-3 mr-1" />{org.user_count} users</span>
                      <span>🔍 {org.monthly_searches_used}/{org.monthly_searches_limit === 999999 ? '∞' : org.monthly_searches_limit} recherches</span>
                      <span>💎 {org.credits_balance} crédits</span>
                      <span>📊 {org.total_searches} total rech.</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setGiftModal(org.id)}>
                    <Gift className="h-4 w-4 mr-1" /> Offrir
                  </Button>
                </div>
              </div>

              {giftModal === org.id && (
                <div className="mt-4 p-4 bg-slate-50 rounded-lg space-y-3">
                  <h4 className="font-semibold">Offrir à {org.name}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Select value={giftType} onValueChange={setGiftType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="credits">Crédits</SelectItem>
                          <SelectItem value="free_plan">Plan gratuit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {giftType === 'credits' && (
                      <Input type="number" placeholder="Nb crédits" value={giftCredits} onChange={(e) => setGiftCredits(parseInt(e.target.value) || 0)} />
                    )}
                    {giftType === 'free_plan' && (
                      <>
                        <Select value={giftPlan} onValueChange={setGiftPlan}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {plans.filter(p => p.slug !== 'free').map(p => (
                              <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" placeholder="Jours" value={giftDays} onChange={(e) => setGiftDays(parseInt(e.target.value) || 30)} />
                      </>
                    )}
                    <Input placeholder="Raison (optionnel)" value={giftReason} onChange={(e) => setGiftReason(e.target.value)} className="col-span-2" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => sendGift(org.id)}>Confirmer</Button>
                    <Button size="sm" variant="outline" onClick={() => setGiftModal(null)}>Annuler</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
