'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Bot, RefreshCw, Save, Loader2, Search, Check, Eye, EyeOff } from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-client';

interface AIModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

export default function AdminAIPage() {
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('openai/gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [models, setModels] = useState<AIModel[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const [aiStats, setAiStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/admin/ai-stats', { headers: getAuthHeaders() });
      if (res.ok) setAiStats(await res.json());
    } catch {} finally { setStatsLoading(false); }
  };

  useEffect(() => { loadStats(); }, []);


  const loadSettings = async () => {
    try {
      const res = await fetch('/api/admin/ai-settings', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.provider) setProvider(data.provider);
      if (data.model) setModel(data.model);
      if (data.api_key_masked) setApiKeyMasked(data.api_key_masked);
      if (data.has_api_key) setHasApiKey(data.has_api_key);
      if (data.system_prompt) setSystemPrompt(data.system_prompt);
    } catch (err) {
      toast.error('Erreur de chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const res = await fetch('/api/admin/ai-models', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.models) {
        setModels(data.models);
        toast.success(`${data.count} modèles chargés`);
      }
    } catch (err) {
      toast.error('Erreur de chargement des modèles');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = { provider, model, system_prompt: systemPrompt };
      if (apiKey) payload.api_key = apiKey;

      const res = await fetch('/api/admin/ai-settings', {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Paramètres IA sauvegardés');
        setApiKey('');
        loadSettings();
      } else {
        toast.error(data.error || 'Erreur');
      }
    } catch (err) {
      toast.error('Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const filteredModels = models.filter(m =>
    m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Bot className="h-8 w-8 text-primary" />
          Intelligence Artificielle
        </h1>
        <p className="text-muted-foreground mt-1">
          Configurez le provider et le mod&egrave;le utilis&eacute; pour la g&eacute;n&eacute;ration de courriers par IA.
        </p>
      </div>

      {/* Provider & API Key */}
      <Card>
        <CardHeader>
          <CardTitle>Provider</CardTitle>
          <CardDescription>Choisissez votre fournisseur d&apos;IA et renseignez votre cl&eacute; API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Provider</Label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="openrouter">OpenRouter (acc&egrave;s &agrave; tous les mod&egrave;les)</option>
              <option value="openai">OpenAI (direct)</option>
            </select>
          </div>

          <div>
            <Label>Cl&eacute; API {provider === 'openrouter' ? 'OpenRouter' : 'OpenAI'}</Label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasApiKey ? `Clé actuelle : ${apiKeyMasked}` : 'Entrez votre clé API...'}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {hasApiKey && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <Check className="h-3 w-3" /> Cl&eacute; API configur&eacute;e
              </p>
            )}
            {provider === 'openrouter' && (
              <p className="text-xs text-muted-foreground mt-1">
                Obtenez votre cl&eacute; sur <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">openrouter.ai/keys</a>
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mod&egrave;le</CardTitle>
              <CardDescription>S&eacute;lectionnez le mod&egrave;le de langage &agrave; utiliser.</CardDescription>
            </div>
            <Button variant="outline" onClick={fetchModels} disabled={loadingModels}>
              {loadingModels ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {models.length > 0 ? 'Rafraîchir' : 'Charger les modèles'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Mod&egrave;le actuel</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 font-mono" />
          </div>

          {models.length > 0 && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Rechercher un modèle..."
                  className="pl-10"
                />
              </div>
              <div className="max-h-80 overflow-y-auto border rounded-lg">
                {filteredModels.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); toast.success(`Modèle sélectionné : ${m.name}`); }}
                    className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b last:border-b-0 flex items-center justify-between transition-colors ${
                      model === m.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <div>
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{m.id}</div>
                    </div>
                    <div className="text-right">
                      {m.context_length && (
                        <Badge variant="secondary" className="text-xs">
                          {(m.context_length / 1000).toFixed(0)}K ctx
                        </Badge>
                      )}
                      {model === m.id && <Check className="h-4 w-4 text-blue-600 ml-2 inline" />}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{filteredModels.length} mod&egrave;les affich&eacute;s sur {models.length}</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* System Prompt */}
      <Card>
        <CardHeader>
          <CardTitle>Prompt syst&egrave;me</CardTitle>
          <CardDescription>
            Ce prompt est envoy&eacute; au mod&egrave;le avant chaque g&eacute;n&eacute;ration de courrier.
            Il d&eacute;finit le comportement et le style de r&eacute;daction de l&apos;IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={15}
            className="font-mono text-sm"
            placeholder="Instructions pour l'IA..."
          />
          <p className="text-xs text-muted-foreground mt-2">
            Variables disponibles : {'{{nom}}'}, {'{{prenom}}'}, {'{{nom_societe}}'}, {'{{bien_adresse}}'}, {'{{expediteur_societe}}'}
          </p>
        </CardContent>
      </Card>

      
      {/* OpenRouter Balance & AI Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Consommation IA
          </CardTitle>
          <CardDescription>Statistiques d'utilisation et solde OpenRouter</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : aiStats ? (
            <div className="space-y-6">
              {/* OpenRouter Balance */}
              {aiStats.openrouter_balance && aiStats.openrouter_balance.remaining !== null && (
                <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-blue-800">Solde OpenRouter</span>
                    <Badge variant={aiStats.openrouter_balance.remaining < 5 ? "destructive" : aiStats.openrouter_balance.remaining < 20 ? "secondary" : "default"} className="text-base px-3 py-1">
                      {"$" + aiStats.openrouter_balance.remaining.toFixed(2)}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Monthly KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-gray-900">{aiStats.month.total_generations}</div>
                  <div className="text-xs text-gray-500">Générations ce mois</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-gray-900">{"$" + parseFloat(aiStats.month.total_cost_usd).toFixed(4)}</div>
                  <div className="text-xs text-gray-500">Coût total (USD)</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-gray-900">{"$" + parseFloat(aiStats.month.avg_cost_usd).toFixed(4)}</div>
                  <div className="text-xs text-gray-500">Coût moyen / génération</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-gray-900">{parseInt(aiStats.month.total_tokens).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Tokens totaux</div>
                </div>
              </div>

              {/* Model breakdown */}
              {aiStats.by_model.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Par modèle</h4>
                  <div className="space-y-1">
                    {aiStats.by_model.map((m: any) => (
                      <div key={m.model} className="flex justify-between text-sm py-1 border-b border-gray-100">
                        <span className="font-mono text-xs">{m.model}</span>
                        <span>{m.count} appels — {"$" + parseFloat(m.cost_usd).toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All-time */}
              <div className="text-xs text-gray-400 text-right">
                Total historique : {aiStats.all_time.total_generations} générations — {"$" + parseFloat(aiStats.all_time.total_cost_usd).toFixed(4)} USD
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Aucune donnée disponible</p>
          )}
        </CardContent>
      </Card>

{/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Enregistrer les param&egrave;tres
        </Button>
      </div>
    </div>
  );
}
