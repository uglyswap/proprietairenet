"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-client";
import { Pencil, Plus, Save, Trash2, X, CreditCard, Package } from "lucide-react";

interface Plan {
  id: string; name: string; slug: string; description: string;
  price_ht: number; monthly_searches_limit: number; included_users: number;
  extra_user_price: number; features: string[]; is_active: boolean; sort_order: number;
  stripe_product_id?: string; stripe_price_id?: string;
}
interface CreditPack {
  id: string; name: string; credits: number; price: number; is_active: boolean; sort_order: number;
}

export default function AdminPricingPage() {
  const { token } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editingPack, setEditingPack] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState(false);
  const [newPack, setNewPack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchData = useCallback(async () => {
    try {
      const [plansRes, packsRes] = await Promise.all([
        fetch("/api/admin/plans", { headers }),
        fetch("/api/admin/credit-packs", { headers }),
      ]);
      const plansData = await plansRes.json();
      const packsData = await packsRes.json();
      setPlans(plansData.plans || []);
      setPacks(packsData.credit_packs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { if (token) fetchData(); }, [token, fetchData]);

  const showMsg = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(""), 3000); };

  const savePlan = async (plan: Partial<Plan> & { id?: string }) => {
    setSaving(true);
    try {
      const method = plan.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/plans", { method, headers, body: JSON.stringify(plan) });
      const data = await res.json();
      if (res.ok) { showMsg("Plan sauvegardé ✅"); fetchData(); setEditingPlan(null); setNewPlan(false); }
      else showMsg(`Erreur: ${data.error}`);
    } catch (e: any) { showMsg(`Erreur: ${e.message}`); }
    setSaving(false);
  };

  const deletePlan = async (id: string) => {
    if (!confirm("Désactiver ce plan ?")) return;
    const res = await fetch(`/api/admin/plans?id=${id}`, { method: "DELETE", headers });
    if (res.ok) { showMsg("Plan désactivé"); fetchData(); }
  };

  const savePack = async (pack: Partial<CreditPack> & { id?: string }) => {
    setSaving(true);
    try {
      const method = pack.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/credit-packs", { method, headers, body: JSON.stringify(pack) });
      if (res.ok) { showMsg("Pack sauvegardé ✅"); fetchData(); setEditingPack(null); setNewPack(false); }
      else { const data = await res.json(); showMsg(`Erreur: ${data.error}`); }
    } catch (e: any) { showMsg(`Erreur: ${e.message}`); }
    setSaving(false);
  };

  if (loading) return <div className="p-8">Chargement...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Tarification</h1>
          <p className="text-muted-foreground">Gérez vos plans et packs de crédits</p>
        </div>
        {message && <Badge variant="secondary" className="text-sm py-1 px-3">{message}</Badge>}
      </div>

      {/* Plans Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2"><CreditCard className="h-5 w-5" /> Plans d&apos;abonnement</h2>
          <Button onClick={() => setNewPlan(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Nouveau plan</Button>
        </div>

        <div className="grid gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} editing={editingPlan === plan.id}
              onEdit={() => setEditingPlan(plan.id)} onCancel={() => setEditingPlan(null)}
              onSave={savePlan} onDelete={() => deletePlan(plan.id)} saving={saving} />
          ))}
          {newPlan && (
            <PlanCard plan={{ id: "", name: "", slug: "", description: "", price_ht: 0, monthly_searches_limit: 10, included_users: 1, extra_user_price: 0, features: [], is_active: true, sort_order: plans.length }}
              editing={true} onEdit={() => {}} onCancel={() => setNewPlan(false)}
              onSave={savePlan} onDelete={() => {}} saving={saving} isNew />
          )}
        </div>
      </div>

      {/* Credit Packs Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2"><Package className="h-5 w-5" /> Packs de crédits</h2>
          <Button onClick={() => setNewPack(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Nouveau pack</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {packs.map((pack) => (
            <PackCard key={pack.id} pack={pack} editing={editingPack === pack.id}
              onEdit={() => setEditingPack(pack.id)} onCancel={() => setEditingPack(null)}
              onSave={savePack} saving={saving} />
          ))}
          {newPack && (
            <PackCard pack={{ id: "", name: "", credits: 0, price: 0, is_active: true, sort_order: packs.length }}
              editing={true} onEdit={() => {}} onCancel={() => setNewPack(false)}
              onSave={savePack} saving={saving} isNew />
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, editing, onEdit, onCancel, onSave, onDelete, saving, isNew }: {
  plan: Plan; editing: boolean; onEdit: () => void; onCancel: () => void;
  onSave: (plan: any) => void; onDelete: () => void; saving: boolean; isNew?: boolean;
}) {
  const [form, setForm] = useState({ ...plan, features: plan.features || [] });
  const [featuresText, setFeaturesText] = useState((plan.features || []).join("\n"));

  if (!editing) {
    return (
      <Card className={!plan.is_active ? "opacity-50" : ""}>
        <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            <div>
              <span className="font-semibold text-lg">{plan.name}</span>
              {plan.slug === "free" && <Badge variant="secondary" className="ml-2">Gratuit</Badge>}
              {!plan.is_active && <Badge variant="destructive" className="ml-2">Inactif</Badge>}
            </div>
            <span className="text-muted-foreground">
              {plan.price_ht > 0 ? `${(plan.price_ht / 100).toFixed(0)}€ HT/mois` : "Gratuit"}
            </span>
            <span className="text-sm text-muted-foreground">
              {plan.monthly_searches_limit >= 999999 ? "∞" : plan.monthly_searches_limit} recherches
            </span>
            <span className="text-sm text-muted-foreground">{plan.included_users} user(s)</span>
            {plan.extra_user_price > 0 && <span className="text-sm text-muted-foreground">+{(plan.extra_user_price / 100).toFixed(0)}€/user</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            {plan.slug !== "free" && <Button variant="destructive" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary">
      <CardHeader><CardTitle>{isNew ? "Nouveau plan" : `Modifier: ${plan.name}`}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          {isNew && <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>}
          <div><Label>Prix HT (centimes)</Label><Input type="number" value={form.price_ht} onChange={(e) => setForm({ ...form, price_ht: parseInt(e.target.value) || 0 })} /><p className="text-xs text-muted-foreground mt-1">{(form.price_ht / 100).toFixed(2)}€</p></div>
          <div><Label>Recherches/mois</Label><Input type="number" value={form.monthly_searches_limit} onChange={(e) => setForm({ ...form, monthly_searches_limit: parseInt(e.target.value) || 0 })} /></div>
          <div><Label>Users inclus</Label><Input type="number" value={form.included_users} onChange={(e) => setForm({ ...form, included_users: parseInt(e.target.value) || 1 })} /></div>
          <div><Label>Prix user extra (centimes)</Label><Input type="number" value={form.extra_user_price} onChange={(e) => setForm({ ...form, extra_user_price: parseInt(e.target.value) || 0 })} /></div>
        </div>
        <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div><Label>Fonctionnalités (une par ligne)</Label>
          <Textarea value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} rows={4} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onSave({ ...form, features: featuresText.split("\n").filter(Boolean), ...(isNew ? {} : { id: plan.id }) })} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "..." : "Sauvegarder"}
          </Button>
          <Button variant="outline" onClick={onCancel}><X className="h-4 w-4 mr-1" /> Annuler</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PackCard({ pack, editing, onEdit, onCancel, onSave, saving, isNew }: {
  pack: CreditPack; editing: boolean; onEdit: () => void; onCancel: () => void;
  onSave: (pack: any) => void; saving: boolean; isNew?: boolean;
}) {
  const [form, setForm] = useState({ ...pack });

  if (!editing) {
    return (
      <Card className={`cursor-pointer hover:border-primary transition ${!pack.is_active ? "opacity-50" : ""}`} onClick={onEdit}>
        <CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold">{pack.credits}</p>
          <p className="text-muted-foreground text-sm">crédits</p>
          <p className="text-lg font-semibold mt-2">{(pack.price / 100).toFixed(0)}€</p>
          <p className="text-xs text-muted-foreground">{(pack.price / pack.credits / 100).toFixed(2)}€/crédit</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary">
      <CardContent className="pt-4 space-y-3">
        <div><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Crédits</Label><Input type="number" value={form.credits} onChange={(e) => setForm({ ...form, credits: parseInt(e.target.value) || 0 })} /></div>
        <div><Label>Prix (centimes)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: parseInt(e.target.value) || 0 })} />
          <p className="text-xs text-muted-foreground mt-1">{(form.price / 100).toFixed(2)}€</p></div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSave({ ...form, ...(isNew ? {} : { id: pack.id }) })} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "..." : "OK"}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}><X className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}
