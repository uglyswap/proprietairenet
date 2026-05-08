'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { useAuth } from '@/lib/auth-client';
import {
  ArrowLeft, Plus, Megaphone, FileText, BarChart3, Send, X, CheckCircle2, AlertCircle,
  Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  status: string;
  template_a_name: string;
  template_b_name: string | null;
  template_a_content: string;
  template_b_content: string | null;
  split_ratio: number;
  total_recipients: number;
  sent_a: number;
  sent_b: number;
  responses_a: number;
  responses_b: number;
  notes: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  active: { label: 'Active', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Terminée', color: 'bg-green-100 text-green-700' },
};

export default function CampaignsPage() {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [form, setForm] = useState({
    name: '',
    template_a_name: 'Template A',
    template_a_content: '',
    template_b_name: 'Template B',
    template_b_content: '',
    split_ratio: 50,
    notes: '',
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns', { headers });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (token) fetchCampaigns();
  }, [token, fetchCampaigns]);

  const createCampaign = async () => {
    if (!form.name || !form.template_a_content) {
      showMsg('Nom et Template A requis', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', headers, body: JSON.stringify(form) });
      const data = await res.json();
      if (res.ok) {
        showMsg('Campagne créée !');
        setShowCreate(false);
        setForm({ name: '', template_a_name: 'Template A', template_a_content: '', template_b_name: 'Template B', template_b_content: '', split_ratio: 50, notes: '' });
        fetchCampaigns();
      } else {
        showMsg(data.error || 'Erreur', 'error');
      }
    } catch (e: any) {
      showMsg(e.message, 'error');
    }
    setSaving(false);
  };

  const updateResults = async (campaignId: string, field: string, value: number | boolean) => {
    try {
      const body: any = { campaign_id: campaignId };
      if (field === 'mark_completed') body.mark_completed = true;
      else body[field] = value;

      const res = await fetch('/api/campaigns/results', { method: 'PUT', headers, body: JSON.stringify(body) });
      if (res.ok) {
        showMsg('Mis à jour !');
        fetchCampaigns();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                  <Megaphone className="h-6 w-6 text-blue-600" />
                  Campagnes A/B
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Testez différents courriers pour optimiser vos résultats
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {message && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {message.text}
                </div>
              )}
              <Button onClick={() => setShowCreate(true)} className="gap-1">
                <Plus className="h-4 w-4" />
                Nouvelle campagne
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {/* Create form */}
        {showCreate && (
          <Card className="border-2 border-dashed border-blue-200 bg-blue-50/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-600" />
                Nouvelle campagne
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nom de la campagne *</Label>
                <Input
                  placeholder="Ex: Test courrier prospection février"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Badge className="bg-blue-600">A</Badge> {form.template_a_name}
                  </Label>
                  <Input
                    placeholder="Nom du template A"
                    value={form.template_a_name}
                    onChange={(e) => setForm({ ...form, template_a_name: e.target.value })}
                    className="text-sm"
                  />
                  <Textarea
                    placeholder="Contenu du courrier A... Utilisez {{civilite}}, {{nom_societe}}, {{bien_adresse}} etc."
                    value={form.template_a_content}
                    onChange={(e) => setForm({ ...form, template_a_content: e.target.value })}
                    rows={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Badge variant="secondary">B</Badge> {form.template_b_name}
                  </Label>
                  <Input
                    placeholder="Nom du template B"
                    value={form.template_b_name}
                    onChange={(e) => setForm({ ...form, template_b_name: e.target.value })}
                    className="text-sm"
                  />
                  <Textarea
                    placeholder="Contenu du courrier B (optionnel — laisser vide pour envoyer uniquement le template A)"
                    value={form.template_b_content}
                    onChange={(e) => setForm({ ...form, template_b_content: e.target.value })}
                    rows={8}
                  />
                </div>
              </div>

              {form.template_b_content && (
                <div className="space-y-2">
                  <Label>Répartition A/B : {form.split_ratio}% A / {100 - form.split_ratio}% B</Label>
                  <Slider
                    value={[form.split_ratio]}
                    onValueChange={([v]) => setForm({ ...form, split_ratio: v })}
                    min={10}
                    max={90}
                    step={5}
                  />
                </div>
              )}

              <Textarea
                placeholder="Notes internes (optionnel)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />

              <Button onClick={createCampaign} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Créer la campagne
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Campaigns list */}
        {campaigns.length === 0 && !showCreate ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Megaphone className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <h3 className="font-semibold mb-1">Aucune campagne</h3>
              <p className="text-sm text-muted-foreground mb-4">Créez votre première campagne A/B pour comparer deux templates de courrier</p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Créer une campagne
              </Button>
            </CardContent>
          </Card>
        ) : (
          campaigns.map((c) => {
            const isExpanded = expandedId === c.id;
            const statusInfo = STATUS_MAP[c.status] || STATUS_MAP.draft;
            const totalResponses = c.responses_a + c.responses_b;
            const rateA = c.sent_a > 0 ? Math.round((c.responses_a / c.sent_a) * 100) : 0;
            const rateB = c.sent_b > 0 ? Math.round((c.responses_b / c.sent_b) * 100) : 0;

            return (
              <Card key={c.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <div className="flex items-center gap-3">
                    <Megaphone className="h-5 w-5 text-blue-600" />
                    <div>
                      <span className="font-medium">{c.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={`text-xs ${statusInfo.color}`}>{statusInfo.label}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString('fr-FR')}
                        </span>
                        {c.total_recipients > 0 && (
                          <span className="text-xs text-muted-foreground">
                            · {c.total_recipients} destinataires
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.total_recipients > 0 && (
                      <div className="text-right">
                        <span className="text-sm font-medium">{totalResponses} réponses</span>
                      </div>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t p-4 space-y-4 bg-gray-50/50">
                    {/* A/B Results */}
                    {c.status !== 'draft' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="border-blue-200">
                          <CardContent className="pt-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-blue-600">A</Badge>
                              <span className="font-medium text-sm">{c.template_a_name || 'Template A'}</span>
                            </div>
                            <div className="text-2xl font-bold">{c.sent_a} envoyés</div>
                            <div className="text-sm text-muted-foreground">{c.responses_a} réponses ({rateA}%)</div>
                            <div className="mt-2">
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${rateA}%` }} />
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <Label className="text-xs">Réponses :</Label>
                              <Input
                                type="number"
                                className="w-20 h-7 text-xs"
                                defaultValue={c.responses_a}
                                onBlur={(e) => updateResults(c.id, 'responses_a', parseInt(e.target.value) || 0)}
                              />
                            </div>
                          </CardContent>
                        </Card>
                        {c.template_b_content && (
                          <Card className="border-amber-200">
                            <CardContent className="pt-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary">B</Badge>
                                <span className="font-medium text-sm">{c.template_b_name || 'Template B'}</span>
                              </div>
                              <div className="text-2xl font-bold">{c.sent_b} envoyés</div>
                              <div className="text-sm text-muted-foreground">{c.responses_b} réponses ({rateB}%)</div>
                              <div className="mt-2">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${rateB}%` }} />
                                </div>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <Label className="text-xs">Réponses :</Label>
                                <Input
                                  type="number"
                                  className="w-20 h-7 text-xs"
                                  defaultValue={c.responses_b}
                                  onBlur={(e) => updateResults(c.id, 'responses_b', parseInt(e.target.value) || 0)}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}

                    {/* Winner badge */}
                    {c.status !== 'draft' && c.responses_a + c.responses_b > 0 && (
                      <div className={`text-center py-2 rounded-lg text-sm font-medium ${
                        rateA > rateB ? 'bg-blue-50 text-blue-700' : rateB > rateA ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-700'
                      }`}>
                        {rateA > rateB ? `🏆 Template A gagne avec ${rateA}% de taux de réponse` :
                         rateB > rateA ? `🏆 Template B gagne avec ${rateB}% de taux de réponse` :
                         '🤝 Égalité entre les deux templates'}
                      </div>
                    )}

                    {c.notes && (
                      <div className="text-sm text-muted-foreground bg-white rounded p-3 border">
                        <span className="font-medium">Notes :</span> {c.notes}
                      </div>
                    )}

                    <div className="flex gap-2">
                      {c.status === 'active' && (
                        <Button variant="outline" size="sm" onClick={() => updateResults(c.id, 'mark_completed', true)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Marquer comme terminée
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
