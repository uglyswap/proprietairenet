'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth-client';
import { Plus, Trash2, Tag, Percent, Gift, CreditCard } from 'lucide-react';

export default function AdminPromoCodesPage() {
  const { token } = useAuth();
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState('');

  const defaultForm = {
    code: '', description: '', type: 'stripe_discount',
    discount_type: 'percent', discount_value: 0, discount_duration: 'once', discount_months: 3,
    credits_amount: 0, free_plan_slug: 'pro', free_plan_days: 30, max_uses: 0, expires_at: '',
  };
  const [form, setForm] = useState(defaultForm);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/admin/promo-codes', { headers });
    const d = await res.json();
    setCodes(d.promo_codes || []);
    setLoading(false);
  }, [token]);

  useEffect(() => { if (token) fetchData(); }, [token, fetchData]);

  const createCode = async () => {
    const body: any = { ...form, max_uses: form.max_uses || null, expires_at: form.expires_at || null };
    const res = await fetch('/api/admin/promo-codes', { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.ok) {
      setMessage('✅ Code promo créé !');
      setShowNew(false);
      fetchData();
      setForm(defaultForm);
    } else {
      const d = await res.json();
      setMessage('❌ ' + d.error);
    }
    setTimeout(() => setMessage(''), 3000);
  };

  const deleteCode = async (id: string) => {
    if (!confirm('Désactiver ce code promo ?')) return;
    await fetch(`/api/admin/promo-codes?id=${id}`, { method: 'DELETE', headers });
    fetchData();
  };

  const typeIcons: Record<string, any> = {
    stripe_discount: Percent,
    credit_discount: Percent,
    credits: CreditCard,
    free_plan: Gift,
  };
  const typeLabels: Record<string, string> = {
    stripe_discount: 'Réduction abonnement',
    credit_discount: 'Réduction crédits',
    credits: 'Crédits offerts',
    free_plan: 'Plan gratuit',
  };

  const getDurationLabel = (code: any) => {
    if (code.discount_duration === 'repeating') return `${code.discount_months || 3} mois`;
    if (code.discount_duration === 'forever') return 'à vie';
    return '1 fois';
  };

  if (loading) return <div className="p-8">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Codes promo</h1>
          <p className="text-muted-foreground">{codes.length} codes créés</p>
        </div>
        <div className="flex items-center gap-3">
          {message && <Badge variant="secondary" className="py-1 px-3">{message}</Badge>}
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau code
          </Button>
        </div>
      </div>

      {showNew && (
        <Card className="border-primary">
          <CardHeader><CardTitle>Nouveau code promo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label>Code</Label>
                <Input
                  placeholder="PROMO2026"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe_discount">R&eacute;duction abonnement</SelectItem>
                    <SelectItem value="credit_discount">R&eacute;duction cr&eacute;dits (%)</SelectItem>
                    <SelectItem value="credits">Cr&eacute;dits offerts</SelectItem>
                    <SelectItem value="free_plan">Plan gratuit temporaire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  placeholder="Offre de lancement..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>

            {/* Subscription discount options */}
            {form.type === 'stripe_discount' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Type de r&eacute;duction</Label>
                    <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Pourcentage</SelectItem>
                        <SelectItem value="fixed">Montant fixe (centimes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{form.discount_type === 'percent' ? 'Pourcentage (%)' : 'Montant (centimes)'}</Label>
                    <Input
                      type="number"
                      value={form.discount_value}
                      onChange={(e) => setForm({ ...form, discount_value: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label>Dur&eacute;e</Label>
                    <Select value={form.discount_duration} onValueChange={(v) => setForm({ ...form, discount_duration: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">1er mois uniquement</SelectItem>
                        <SelectItem value="repeating">X mois</SelectItem>
                        <SelectItem value="forever">&Agrave; vie (lifetime)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {form.discount_duration === 'repeating' && (
                  <div className="max-w-xs">
                    <Label>Nombre de mois</Label>
                    <Input
                      type="number"
                      min={1}
                      max={36}
                      value={form.discount_months}
                      onChange={(e) => setForm({ ...form, discount_months: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Credit discount options */}
            {form.type === 'credit_discount' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>R&eacute;duction (%)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={form.discount_value}
                    onChange={(e) => setForm({ ...form, discount_value: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Appliqu&eacute; sur les packs de cr&eacute;dits</p>
                </div>
                <div>
                  <Label>Dur&eacute;e</Label>
                  <Select value={form.discount_duration} onValueChange={(v) => setForm({ ...form, discount_duration: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">1 achat</SelectItem>
                      <SelectItem value="forever">&Agrave; vie (lifetime)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Free credits options */}
            {form.type === 'credits' && (
              <div>
                <Label>Nombre de cr&eacute;dits offerts</Label>
                <Input
                  type="number"
                  value={form.credits_amount}
                  onChange={(e) => setForm({ ...form, credits_amount: parseInt(e.target.value) || 0 })}
                />
              </div>
            )}

            {/* Free plan options */}
            {form.type === 'free_plan' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Plan</Label>
                  <Select value={form.free_plan_slug} onValueChange={(v) => setForm({ ...form, free_plan_slug: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pro">Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dur&eacute;e (jours)</Label>
                  <Input
                    type="number"
                    value={form.free_plan_days}
                    onChange={(e) => setForm({ ...form, free_plan_days: parseInt(e.target.value) || 30 })}
                  />
                </div>
              </div>
            )}

            {/* Common options */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Utilisations max (0 = illimit&eacute;)</Label>
                <Input
                  type="number"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Expire le (optionnel)</Label>
                <Input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={createCode}>Cr&eacute;er le code</Button>
              <Button variant="outline" onClick={() => setShowNew(false)}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing codes list */}
      <div className="space-y-3">
        {codes.map((code) => {
          const Icon = typeIcons[code.type] || Tag;
          return (
            <Card key={code.id} className={!code.is_active ? 'opacity-50' : ''}>
              <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-violet-50 rounded-lg">
                    <Icon className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-bold text-lg">{code.code}</code>
                      <Badge variant="secondary">{typeLabels[code.type] || code.type}</Badge>
                      {!code.is_active && <Badge variant="destructive">Inactif</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {code.description && <span>{code.description} &middot; </span>}
                      {code.type === 'stripe_discount' && (
                        <span>
                          {code.discount_value}{code.discount_type === 'percent' ? '%' : '¢'} off ({getDurationLabel(code)}) &middot;{' '}
                        </span>
                      )}
                      {code.type === 'credit_discount' && (
                        <span>{code.discount_value}% sur cr&eacute;dits ({getDurationLabel(code)}) &middot; </span>
                      )}
                      {code.type === 'credits' && <span>{code.credits_amount} cr&eacute;dits &middot; </span>}
                      {code.type === 'free_plan' && (
                        <span>Plan {code.free_plan_slug} pour {code.free_plan_days}j &middot; </span>
                      )}
                      <span>
                        {code.current_uses}{code.max_uses ? `/${code.max_uses}` : ''} utilisations
                      </span>
                      {code.expires_at && (
                        <span> &middot; Expire: {new Date(code.expires_at).toLocaleDateString('fr-FR')}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="destructive" onClick={() => deleteCode(code.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {codes.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Aucun code promo cr&eacute;&eacute;</p>
        )}
      </div>
    </div>
  );
}
