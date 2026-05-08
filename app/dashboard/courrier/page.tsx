'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import {
  Mail, ArrowLeft, Send, Eye, FileText, History, Loader2, AlertCircle,
  CheckCircle2, Clock, XCircle, Truck, Upload, Coins, X, Wand2, Users,
  Plus, Trash2, Save, Sparkles, CreditCard, Download, PenTool, Settings, Zap, ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { getMe, getToken, getAuthHeaders, ClientUser, ClientOrganization } from '@/lib/auth-client';

// ─── Types ───────────────────────────────────────────────────────
const AFFRANCHISSEMENT_OPTIONS = [
  { value: 'verte', label: 'Lettre Verte (J+3)', credits: 410, description: 'Standard, sans suivi — 410 crédits' },
  { value: 'vertesuivi', label: 'Lettre Verte Suivie (J+3)', credits: 490, description: 'Standard avec suivi — 490 crédits' },
  { value: 'performance', label: 'Lettre Performance (J+2)', credits: 520, description: 'Rapide, sans suivi — 520 crédits' },
  { value: 'perfsuivi', label: 'Lettre Performance Suivie (J+2)', credits: 600, description: 'Rapide avec suivi — 600 crédits' },
  { value: 'lr', label: 'Recommandé Simple', credits: 1080, description: 'Recommandé sans AR — 1 080 crédits' },
  { value: 'lrar', label: 'Recommandé avec AR', credits: 1250, description: 'Recommandé avec accusé — 1 250 crédits' },
];

interface Recipient {
  prenom: string;
  nom: string;
  nom_societe: string;
  adresse_ligne1: string;
  adresse_ligne2: string;
  code_postal: string;
  ville: string;
  pays: string;
  bien_adresse: string;
  bien_cp: string;
  bien_ville: string;
}

interface MailHistoryItem {
  id: string;
  service_postal_uid: string;
  destinataire: any;
  recipient_name: string;
  type_affranchissement: string;
  couleur: string;
  status: string;
  prix: number;
  credits_used: number;
  preview_url: string;
  created_at: string;
  sent_at: string;
  template_name: string;
  user_email: string;
}

interface TemplateItem {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  is_default: boolean;
  ai_generated?: boolean;
  category?: string;
}

const TEMPLATE_CATEGORIES = [
  { key: 'all', label: 'Tous', icon: '📋' },
  { key: 'agence', label: 'Agences immo', icon: '🏠' },
  { key: 'marchand', label: 'Marchands de biens', icon: '💼' },
  { key: 'promoteur', label: 'Promoteurs', icon: '🏗️' },
  { key: 'diagnostiqueur', label: 'Diagnostiqueurs', icon: '🔍' },
  { key: 'chasseur', label: 'Chasseurs immo', icon: '🎯' },
  { key: 'administrateur', label: 'Admin. de biens', icon: '🏢' },
  { key: 'geometre', label: 'Géomètres', icon: '📐' },
  { key: 'investisseur', label: 'Investisseurs', icon: '💰' },
];

// ─── Helper: parse recipients from sessionStorage ────────────────
function loadRecipientsFromStorage(): Recipient[] {
  try {
    // Try 'courrier_recipients' first (from old flow)
    const data = sessionStorage.getItem('courrier_recipients');
    if (data) {
      const parsed = JSON.parse(data);
      sessionStorage.removeItem('courrier_recipients');
      return parsed;
    }
    // Try 'bulk_courrier_results' (from TableView/dashboard bulk button)
    const bulkData = sessionStorage.getItem('bulk_courrier_results');
    if (bulkData) {
      const results = JSON.parse(bulkData);
      sessionStorage.removeItem('bulk_courrier_results');
      // Convert CadastreResult[] to Recipient[]
      return results.map((r: any) => {
        const prop = r.proprietes?.[0] || {};
        const adresse = cleanAddress(prop.adresse || "");
        const ville = cleanCity(prop.ville || "");
        const dirigeants = r.entreprise?.dirigeants || [];
        const d = dirigeants[0];
        const prenom = d?.type === 'personne_physique' ? (d.prenoms || '').split(' ')[0] : '';
        const nom = d?.type === 'personne_physique' ? (d.nom || '') : '';
        return {
          prenom,
          nom,
          nom_societe: r.proprietaire?.denomination || '',
          adresse_ligne1: adresse,
          adresse_ligne2: '',
          code_postal: prop.code_postal || '',
          ville: ville,
          pays: 'France',
          bien_adresse: adresse,
          bien_cp: prop.code_postal || '',
          bien_ville: ville,
        };
      });
    }
  } catch {}
  return [];
}

function emptyRecipient(): Recipient {
  return {
    prenom: '', nom: '', nom_societe: '',
    adresse_ligne1: '', adresse_ligne2: '', code_postal: '', ville: '', pays: 'France',
    bien_adresse: '', bien_cp: '', bien_ville: '',
  };
}

// ─── Main Content Component ──────────────────────────────────────
// Helper: strip leading zeros from numbers in addresses
function cleanAddress(addr: string): string {
  if (!addr) return '';
  return addr.replace(/\b0+(\d+)/g, '$1');
}

// Helper: clean city name (just the city, no arrondissement)
function cleanCity(ville: string): string {
  if (!ville) return '';
  // Remove arrondissement number if present
  return ville.replace(/\s+\d{1,2}$/, '').trim();
}

function CourrierPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Auth
  const [user, setUser] = useState<ClientUser | null>(null);
  const [org, setOrg] = useState<ClientOrganization | null>(null);
  const [loading, setLoading] = useState(true);

  // Recipients
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Template / content
  const [letterContent, setLetterContent] = useState('');
  
  
  // PDF mode removed - text only

  // Options
  const [affranchissement, setAffranchissement] = useState('verte');
  const [couleur, setCouleur] = useState('nb');
  const [rectoVerso, setRectoVerso] = useState('recto');

  // Templates
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [builtInTemplates, setBuiltInTemplates] = useState<TemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [aiContext, setAiContext] = useState('');

  // Preview / send
  const [previewing, setPreviewing] = useState(false);
  const [bulkPreviewData, setBulkPreviewData] = useState<any>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  // History
  const [history, setHistory] = useState<MailHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Tracking
  const [trackingData, setTrackingData] = useState<any>(null);

  // Save template dialog
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');

  // Template category filter
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState('all');

  // Active tab
  const [activeTab, setActiveTab] = useState('compose');

  // Recipients accordion
  const [recipientsExpanded, setRecipientsExpanded] = useState(true);

  // ─── Auth ──────────────────────────────────────────────────────
  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      const data = await getMe();
      if (!data) { router.push('/login'); return; }
      setUser(data.user);
      setOrg(data.organization);
    } catch { router.push('/login'); }
    finally { setLoading(false); }
  };

  // ─── Load recipients from URL params or sessionStorage ─────────
  useEffect(() => {
    // First try sessionStorage (for multi-select bulk)
    const stored = loadRecipientsFromStorage();
    if (stored.length > 0) {
      setRecipients(stored);
      return;
    }

    // Then try URL params (for single recipient)
    const destNom = searchParams.get('dest_nom_famille') || searchParams.get('dest_nom') || '';
    const destPrenom = searchParams.get('dest_prenom') || '';
    const destSociete = searchParams.get('dest_societe') || '';
    const destAdresse = searchParams.get('dest_adresse') || '';
    const destCP = searchParams.get('dest_cp') || '';
    const destVille = searchParams.get('dest_ville') || '';
    const bienAdresse = searchParams.get('bien_adresse') || '';
    const bienCP = searchParams.get('bien_cp') || '';
    const bienVille = searchParams.get('bien_ville') || '';

    if (destSociete || destNom || destAdresse) {
      setRecipients([{
        prenom: destPrenom, nom: destNom,
        nom_societe: destSociete, adresse_ligne1: destAdresse, adresse_ligne2: '',
        code_postal: destCP, ville: destVille, pays: 'France',
        bien_adresse: bienAdresse, bien_cp: bienCP, bien_ville: bienVille,
      }]);
    } else {
      setRecipients([emptyRecipient()]);
    }
  }, [searchParams]);

  // ─── Load templates ────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    try {
      // Load saved templates
      const res = await fetch('/api/courrier/templates', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
      // Load built-in templates
      const res2 = await fetch('/api/courrier/generate-template', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res2.ok) {
        const data2 = await res2.json();
        setBuiltInTemplates(data2.templates || []);
      }
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/courrier/history', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.courriers || []);
      }
    } catch {} finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    if (!loading && user) { loadTemplates(); loadHistory(); }
  }, [loading, user, loadTemplates, loadHistory]);

  // ─── Recipients management ─────────────────────────────────────
  const updateRecipient = (index: number, field: keyof Recipient, value: string) => {
    setRecipients(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addRecipient = () => {
    setRecipients(prev => [...prev, emptyRecipient()]);
  };

  const removeRecipient = (index: number) => {
    if (recipients.length <= 1) return;
    setRecipients(prev => prev.filter((_, i) => i !== index));
  };

  const isBulk = recipients.length > 1;

  // Sync accordion state when recipients change
  useEffect(() => {
    setRecipientsExpanded(recipients.length <= 1);
  }, [recipients.length]);

  // ─── Template handling ─────────────────────────────────────────
  const applyTemplate = (template: TemplateItem | { body: string; name: string }) => {
    setLetterContent(template.body);
    ;
    toast.success(`Template "${template.name}" appliqué`);
  };

  const handleSaveTemplate = async () => {
    if (!saveTemplateName.trim() || !letterContent.trim()) {
      toast.error('Nom et contenu requis');
      return;
    }
    try {
      const res = await fetch('/api/courrier/templates', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveTemplateName,
          subject: saveTemplateName,
          content: letterContent,
          variables: extractVariables(letterContent),
        }),
      });
      if (res.ok) {
        toast.success('Template sauvegardé !');
        setSaveTemplateOpen(false);
        setSaveTemplateName('');
        loadTemplates();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur');
      }
    } catch { toast.error('Erreur de sauvegarde'); }
  };

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
  };

  // ─── AI Template Generation ────────────────────────────────────
  const handleAiGenerate = async (type?: string) => {
    setAiGenerating(true);
    try {
      const res = await fetch('/api/courrier/generate-template', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type || 'custom',
          context: {
            bien_adresse: recipients[0]?.bien_adresse || '',
            prospection_type: aiContext || 'proposition générale',
          },
        }),
      });
      const data = await res.json();
      if (data.template) {
        setLetterContent(data.template.body);
        ;
        setAiPromptOpen(false);
        toast.success(data.template.ai_generated ? 'Template IA généré !' : `Template "${data.template.name}" appliqué`);
      }
    } catch { toast.error('Erreur de génération'); }
    finally { setAiGenerating(false); }
  };

  // ─── PDF upload ────────────────────────────────────────────────
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { toast.error('PDF uniquement'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('Max 10 Mo'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setPdfBase64((reader.result as string).split(',')[1]);
      setPdfFileName(file.name);
    };
    reader.readAsDataURL(file);
    ;
    toast.success(`"${file.name}" chargé`);
  };

  // ─── Preview ───────────────────────────────────────────────────
  const handlePreview = async () => {
    // Validate recipients
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      if (!r.adresse_ligne1 || !r.code_postal || !r.ville) {
        toast.error(`Destinataire #${i + 1} : adresse incomplète`);
        return;
      }
    }

    if (!letterContent.trim()) {
      toast.error('Contenu du courrier requis');
      return;
    }
    // PDF mode removed

    setPreviewing(true);
    try {
      if (isBulk) {
        // Bulk preview
        const res = await fetch('/api/courrier/bulk', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template: letterContent,
            recipients: recipients.map(r => ({
              ...r,
              ville: r.ville.toUpperCase(),
            })),
            type_affranchissement: affranchissement,
            couleur,
            recto_verso: rectoVerso,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || 'Erreur de prévisualisation');
          return;
        }
        setBulkPreviewData(data);
        setPreviewDialogOpen(true);
      } else {
        // Single preview
        const recipient = recipients[0];
        const res = await fetch('/api/courrier/preview', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { ...recipient, ville: recipient.ville.toUpperCase() },
            content: letterContent,
            
            variables: {
              prenom: recipient.prenom,
              nom: recipient.nom,
              nom_societe: recipient.nom_societe,
              bien_adresse: recipient.bien_adresse
                ? `${cleanAddress(recipient.bien_adresse)}${recipient.bien_cp ? ', ' + recipient.bien_cp : ''}${recipient.bien_ville ? ' ' + cleanCity(recipient.bien_ville) : ''}`
                : '',
              expediteur_societe: org?.sender_company || org?.name || '',
              expediteur_nom: org?.sender_company || org?.name || '',
            },
            type_affranchissement: affranchissement,
            couleur,
            recto_verso: rectoVerso,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || 'Erreur de prévisualisation');
          return;
        }
        const recipientName = recipient.nom_societe || `${recipient.prenom} ${recipient.nom}`.trim();
        const recipientAddr = `${recipient.adresse_ligne1}, ${recipient.code_postal} ${recipient.ville}`;
        const creditCost = getCredits(affranchissement);
        setBulkPreviewData({
          ...data,
          uids: [data.uid],
          success_count: 1,
          fail_count: 0,
          total: 1,
          total_credits: creditCost,
          remaining_credits: (org?.credits_balance || 0) - creditCost,
          recipients: [{ name: recipientName, address: recipientAddr, success: true }],
        });
        setPreviewDialogOpen(true);
      }
      toast.success('Prévisualisation prête');
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    } finally { setPreviewing(false); }
  };

  // ─── Send (validate all previewed) ─────────────────────────────
  const handleSend = async () => {
    if (!bulkPreviewData?.uids?.length) return;
    setSending(true);
    try {
      const res = await fetch('/api/courrier/bulk/validate', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ uids: bulkPreviewData.uids }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur d'envoi");
        return;
      }
      setSendResult(data);
      toast.success(data.message || 'Courriers envoyés !');
      setPreviewDialogOpen(false);
      checkAuth();
      loadHistory();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    } finally { setSending(false); }
  };

  // ─── Track / Cancel ────────────────────────────────────────────
  const handleTrack = async (uid: string) => {
    try {
      const res = await fetch(`/api/courrier/track/${uid}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) setTrackingData(data);
      else toast.error(data.error || 'Erreur');
    } catch { toast.error('Erreur de suivi'); }
  };

  const handleCancel = async (uid: string) => {
    if (!confirm('Annuler ce courrier ?')) return;
    try {
      const res = await fetch(`/api/courrier/cancel/${uid}`, { method: 'DELETE', headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) { toast.success(data.message); loadHistory(); checkAuth(); }
      else toast.error(data.error || 'Erreur');
    } catch { toast.error("Erreur d'annulation"); }
  };

  // ─── Helpers ───────────────────────────────────────────────────

  const getCredits = (code: string) => AFFRANCHISSEMENT_OPTIONS.find(o => o.value === code)?.credits || 410;
  const getLabel = (code: string) => AFFRANCHISSEMENT_OPTIONS.find(o => o.value === code)?.label || code;
  const totalCredits = getCredits(affranchissement) * recipients.length;

  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { variant: 'secondary', icon: Clock, label: 'En attente' },
      preview: { variant: 'outline', icon: Eye, label: 'Prévisualisé' },
      previewed: { variant: 'outline', icon: Eye, label: 'Prévisualisé' },
      sent: { variant: 'default', icon: Send, label: "En cours d'impression et d'affranchissement" },
      courrier_produit: { variant: 'default', icon: CheckCircle2, label: 'Remis à La Poste' },
      pris_en_charge: { variant: 'default', icon: Truck, label: 'Pris en charge par La Poste' },
      distribue_destinataire: { variant: 'default', icon: CheckCircle2, label: 'Distribué' },
      delivered: { variant: 'default', icon: CheckCircle2, label: 'Distribué' },
      attente_retrait_guichet: { variant: 'default', icon: Clock, label: 'En attente de retrait au guichet' },
      retour_expediteur: { variant: 'destructive', icon: ArrowLeft, label: "Retourné à l'expéditeur" },
      in_transit: { variant: 'default', icon: Truck, label: 'En transit' },
      error: { variant: 'destructive', icon: XCircle, label: 'Erreur' },
      cancelled: { variant: 'secondary', icon: X, label: 'Annulé' },
    };
    const s = map[status] || map.pending;
    return <Badge variant={s.variant}><s.icon className="h-3 w-3 mr-1" />{s.label}</Badge>;
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Retour au tableau de bord
          </Button>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">Courrier postal</h1>
            <p className="text-gray-600 mt-1">Gérez vos envois de courriers et lettres recommandées</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-lg px-4 py-2">
              <CreditCard className="h-4 w-4 mr-2" />
              {org?.credits_balance || 0} crédits
            </Badge>
            <Badge variant="secondary" className="text-lg px-4 py-2">
              <Coins className="h-4 w-4 mr-2" />
              {(org?.credits_balance || 0).toLocaleString("fr-FR")} crédits
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 text-xs sm:text-sm">
          <TabsTrigger value="compose" className="flex items-center gap-2">
            <PenTool className="h-4 w-4" />
            Composer
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Historique
          </TabsTrigger>
        </TabsList>

        {/* Compose Tab */}
        <TabsContent value="compose" className="space-y-6">
          <div className="border rounded-lg bg-card text-card-foreground shadow-sm">
            <button 
              type="button"
              onClick={() => setRecipientsExpanded(!recipientsExpanded)}
              className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                <span className="font-semibold text-lg">Destinataires ({recipients.length})</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {!recipientsExpanded && <span>Cliquez pour voir et modifier les destinataires</span>}
                <ChevronDown className={`h-4 w-4 transition-transform ${recipientsExpanded ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {recipientsExpanded && (
              <div className="border-t px-6 pb-6 pt-4 space-y-4">
              {recipients.map((recipient, index) => (
                <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-4 bg-gray-50">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Destinataire {index + 1}</h4>
                    {recipients.length > 1 && (
                      <Button variant="outline" size="sm" onClick={() => removeRecipient(index)} className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`prenom-${index}`}>Prénom</Label>
                      <Input 
                        id={`prenom-${index}`}
                        value={recipient.prenom}
                        onChange={(e) => updateRecipient(index, 'prenom', e.target.value)}
                        placeholder="Prénom"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`nom-${index}`}>Nom *</Label>
                      <Input 
                        id={`nom-${index}`}
                        value={recipient.nom}
                        onChange={(e) => updateRecipient(index, 'nom', e.target.value)}
                        placeholder="Nom de famille"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`societe-${index}`}>Société</Label>
                      <Input 
                        id={`societe-${index}`}
                        value={recipient.nom_societe}
                        onChange={(e) => updateRecipient(index, 'nom_societe', e.target.value)}
                        placeholder="Nom de la société"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor={`adresse-${index}`}>Adresse *</Label>
                      <Input 
                        id={`adresse-${index}`}
                        value={recipient.adresse_ligne1}
                        onChange={(e) => updateRecipient(index, 'adresse_ligne1', e.target.value)}
                        placeholder="Numéro et nom de rue"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`cp-${index}`}>Code postal *</Label>
                      <Input 
                        id={`cp-${index}`}
                        value={recipient.code_postal}
                        onChange={(e) => updateRecipient(index, 'code_postal', e.target.value)}
                        placeholder="75000"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`ville-${index}`}>Ville *</Label>
                      <Input 
                        id={`ville-${index}`}
                        value={recipient.ville}
                        onChange={(e) => updateRecipient(index, 'ville', e.target.value)}
                        placeholder="Paris"
                        required
                      />
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h5 className="font-medium mb-3 text-sm">Adresse du bien (optionnel)</h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor={`bien_adresse-${index}`}>Adresse du bien</Label>
                        <Input 
                          id={`bien_adresse-${index}`}
                          value={recipient.bien_adresse}
                          onChange={(e) => updateRecipient(index, 'bien_adresse', e.target.value)}
                          placeholder="Adresse du bien"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`bien_cp-${index}`}>Code postal</Label>
                        <Input 
                          id={`bien_cp-${index}`}
                          value={recipient.bien_cp}
                          onChange={(e) => updateRecipient(index, 'bien_cp', e.target.value)}
                          placeholder="75000"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`bien_ville-${index}`}>Ville</Label>
                        <Input 
                          id={`bien_ville-${index}`}
                          value={recipient.bien_ville}
                          onChange={(e) => updateRecipient(index, 'bien_ville', e.target.value)}
                          placeholder="Paris"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              <Button onClick={addRecipient} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un destinataire
              </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Options d&apos;envoi */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Options d&apos;envoi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="affranchissement">Type d&apos;affranchissement</Label>
                  <Select value={affranchissement} onValueChange={setAffranchissement}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un type" />
                    </SelectTrigger>
                    <SelectContent>
                      {AFFRANCHISSEMENT_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label} — {option.credits} crédits
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Couleur</Label>
                  <RadioGroup value={couleur} onValueChange={setCouleur} className="flex gap-4 mt-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="couleur" id="couleur" />
                      <Label htmlFor="couleur">Couleur (+30 crédits)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="nb" id="nb" />
                      <Label htmlFor="nb">Noir & blanc</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div>
                  <Label>Impression</Label>
                  <RadioGroup value={rectoVerso} onValueChange={setRectoVerso} className="flex gap-4 mt-2">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="recto" id="recto" />
                      <Label htmlFor="recto">Recto uniquement</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="rectoverso" id="rectoverso" />
                      <Label htmlFor="rectoverso">Recto-verso</Label>
                    </div>
                  </RadioGroup>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Coût par destinataire :</span>
                    <span className="font-medium">{getCredits(affranchissement)} crédits</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Nombre de destinataires :</span>
                    <span className="font-medium">{recipients.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Ajout couleur :</span>
                    <span className="font-medium">
                      {couleur === 'couleur' ? `+${30 * recipients.length} crédits` : 'Inclus'}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-medium">
                    <span>Total :</span>
                    <span>{totalCredits + (couleur === 'couleur' ? 30 * recipients.length : 0)} crédits</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Solde après envoi :</span>
                    <span>{(org?.credits_balance || 0) - (totalCredits + (couleur === 'couleur' ? 30 * recipients.length : 0))} crédits</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contenu */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Contenu du courrier
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                

                
                  <div>
                    <Label htmlFor="letterContent">Contenu de la lettre</Label>
                    <Textarea 
                      id="letterContent"
                      value={letterContent}
                      onChange={(e) => setLetterContent(e.target.value)}
                      rows={12}
                      placeholder="Rédigez votre courrier..."
                      className="mt-2"
                    />
                    <div className="flex gap-2 mt-3">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setActiveTab('templates')}
                        className="flex-1"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Utiliser un template
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setAiPromptOpen(true)}
                        className="flex-1"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Générer avec IA
                      </Button>
                    </div>
                    <div className="mt-3">
                      <Label className="text-xs text-gray-500 mb-2 block">Variables disponibles (cliquez pour insérer) :</Label>
                      <div className="flex flex-wrap gap-1">
                        {[
                                                    { label: 'Prénom', value: '{{prenom}}' },
                          { label: 'Nom', value: '{{nom}}' },
                          { label: 'Société', value: '{{nom_societe}}' },
                          { label: 'Adresse du bien', value: '{{bien_adresse}}' },
                          { label: 'Expéditeur', value: '{{expediteur_societe}}' },
                        ].map(v => (
                          <button
                            key={v.value}
                            type="button"
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 transition-colors"
                            onClick={() => {
                              const textarea = document.getElementById('letterContent') as HTMLTextAreaElement;
                              if (textarea) {
                                const start = textarea.selectionStart;
                                const end = textarea.selectionEnd;
                                const newContent = letterContent.substring(0, start) + v.value + letterContent.substring(end);
                                setLetterContent(newContent);
                              } else {
                                setLetterContent(letterContent + v.value);
                              }
                            }}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                <div className="flex gap-3 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setSaveTemplateOpen(true)}
                    disabled={!letterContent}
                    className="flex-1"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Sauvegarder comme template
                  </Button>
                  <Button 
                    onClick={handlePreview}
                    disabled={!letterContent || recipients.length === 0 || previewing}
                    className="flex-1"
                  >
                    {previewing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Préparation...
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Prévisualiser et envoyer
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Bibliothèque de templates
              </CardTitle>
              <CardDescription>
                Utilisez des templates prêts à l&apos;emploi ou créez les vôtres
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={templateCategoryFilter} onValueChange={setTemplateCategoryFilter}>
                <TabsList className="flex flex-wrap gap-1">
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <TabsTrigger key={cat.key} value={cat.key} className="text-xs">
                      
                      {cat.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                <div className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {builtInTemplates
                        .filter(t => templateCategoryFilter === 'all' || t.category === templateCategoryFilter)
                        .map(template => (
                          <Card key={template.id} className="hover:shadow-md transition-shadow cursor-pointer">
                            <CardHeader className="pb-3">
                              <div className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-primary" />
                                <CardTitle className="text-sm">{template.title}</CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <p className="text-sm text-gray-600 mb-3 line-clamp-3">{(template.content || template.body || "").substring(0, 100)}...</p>
                              <Button 
                                size="sm" 
                                className="w-full"
                                onClick={() => applyTemplate(template)}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Utiliser ce template
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </div>
              </Tabs>
              
              {templates.length > 0 && (
                <>
                  <Separator className="my-8" />
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Mes templates personnalisés</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {templates.map(template => (
                        <Card key={template.id} className="hover:shadow-md transition-shadow">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm">{template.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-sm text-gray-600 mb-3 line-clamp-3">{(template.content || template.body || "").substring(0, 100)}...</p>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                className="flex-1"
                                onClick={() => applyTemplate(template)}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Utiliser
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={async () => {
                                  if (confirm('Supprimer ce template ?')) {
                                    try {
                                      const res = await fetch(`/api/templates/${template.id}`, { 
                                        method: 'DELETE', 
                                        headers: getAuthHeaders() 
                                      });
                                      if (res.ok) {
                                        toast.success('Template supprimé');
                                        loadTemplates();
                                      } else {
                                        toast.error('Erreur de suppression');
                                      }
                                    } catch {
                                      toast.error('Erreur de suppression');
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Historique des envois
              </CardTitle>
              <CardDescription>
                Consultez l&apos;historique de vos envois de courrier
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Aucun courrier envoyé pour le moment</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map(item => (
                    <div key={item.uid} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.recipient}</span>
                            {getStatusBadge(item.status)}
                          </div>
                          <p className="text-sm text-gray-600">
                            Type : {getLabel(item.type)} • {new Date(item.created_at).toLocaleDateString('fr-FR')} à {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="text-sm text-gray-600">
                            Coût : {item.price} crédits
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!['preview', 'previewed', 'pending'].includes(item.status) && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleTrack(item.uid)}
                            >
                              <Truck className="h-4 w-4 mr-2" />
                              Suivi
                            </Button>
                          )}
                          {['pending', 'preview', 'previewed'].includes(item.status) && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleCancel(item.uid)}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Annuler
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Preview/Send Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prévisualisation de l&apos;envoi</DialogTitle>
            <DialogDescription>
              Vérifiez les détails avant l&apos;envoi définitif
            </DialogDescription>
          </DialogHeader>
          
          {bulkPreviewData && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <div className="text-sm font-medium text-emerald-700">Envois réussis</div>
                  <div className="text-2xl font-bold text-emerald-900">{bulkPreviewData.success_count}</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm font-medium text-blue-700">Crédits total</div>
                  <div className="text-2xl font-bold text-blue-900">{bulkPreviewData.total_credits || bulkPreviewData.total_credit_cost || 0}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm font-medium text-gray-700">Solde après envoi</div>
                  <div className="text-2xl font-bold text-gray-900">{bulkPreviewData.remaining_credits ?? ((org?.credits_balance || 0) - (bulkPreviewData.total_credits || bulkPreviewData.total_credit_cost || 0))}</div>
                </div>
              </div>

              {/* Recipients */}
              <div>
                <h4 className="font-semibold mb-3">Destinataires ({(bulkPreviewData.recipients || bulkPreviewData.results || []).length})</h4>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {(bulkPreviewData.recipients || (bulkPreviewData.results || []).map(r => ({ name: r.recipient_name || r.name, address: r.address || "", success: r.success }))).map((recipient, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      {recipient.success ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{recipient.name}</p>
                        <p className="text-sm text-gray-600">{recipient.address}</p>
                        {!recipient.success && recipient.error && (
                          <p className="text-sm text-red-600">{recipient.error}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview PDF */}
              {(bulkPreviewData.preview_pdf || bulkPreviewData.preview_url) && (
                <div className="space-y-2">
                  <object
                    data={bulkPreviewData.preview_pdf || bulkPreviewData.preview_url}
                    type="application/pdf"
                    className="w-full h-[450px] border rounded-lg"
                  >
                    <p className="p-4 text-center text-gray-500">
                      Impossible d'afficher le PDF ici.{' '}
                      <a 
                        href={bulkPreviewData.preview_pdf || bulkPreviewData.preview_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        Cliquez ici pour le voir
                      </a>
                    </p>
                  </object>
                  <a
                    href={bulkPreviewData.preview_pdf || bulkPreviewData.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
                  >
                    <Eye className="h-4 w-4" />
                    Ouvrir dans un nouvel onglet
                  </a>
                </div>
              )}

              {/* Options Summary */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Résumé des options</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div><strong>Affranchissement :</strong> {getLabel(affranchissement)}</div>
                  <div><strong>Couleur :</strong> {couleur === 'couleur' ? 'Couleur' : 'Noir & blanc'}</div>
                  <div><strong>Impression :</strong> {rectoVerso === 'rectoverso' ? 'Recto-verso' : 'Recto seul'}</div>
                  
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Annuler
            </Button>
            <Button 
              onClick={handleSend}
              disabled={sending || !bulkPreviewData || bulkPreviewData.success_count === 0}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Confirmer l&apos;envoi
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Prompt Dialog */}
      <Dialog open={aiPromptOpen} onOpenChange={setAiPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Génération de contenu par IA</DialogTitle>
            <DialogDescription>
              Décrivez le contexte pour générer automatiquement votre courrier
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value)}
              placeholder="Ex: Lettre de mise en demeure pour loyer impayé, demande de réparation d'un robinet qui fuit, courrier de fin de bail..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiPromptOpen(false)}>
              Annuler
            </Button>
            <Button 
              onClick={() => handleAiGenerate()}
              disabled={!aiContext.trim() || aiGenerating}
            >
              {aiGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Générer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Template Dialog */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sauvegarder comme template</DialogTitle>
            <DialogDescription>
              Donnez un nom à votre template pour le réutiliser plus tard
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={saveTemplateName}
              onChange={(e) => setSaveTemplateName(e.target.value)}
              placeholder="Nom du template"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveTemplate} disabled={!saveTemplateName.trim()}>
              <Save className="h-4 w-4 mr-2" />
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tracking Dialog */}
      <Dialog open={!!trackingData} onOpenChange={() => setTrackingData(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Suivi de courrier</DialogTitle>
            <DialogDescription>
              Suivi en temps réel de votre envoi
            </DialogDescription>
          </DialogHeader>
          {trackingData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {trackingData.numero_suivi && (
                  <div>
                    <Label className="text-xs text-gray-500">N° de suivi La Poste</Label>
                    <p className="font-mono text-sm mt-1">{trackingData.numero_suivi}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-gray-500">Statut actuel</Label>
                  <div className="mt-1">
                    {getStatusBadge(trackingData.status)}
                  </div>
                </div>
              </div>
              
              {trackingData.evenements && trackingData.evenements.length > 0 ? (
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Chronologie</Label>
                  <div className="space-y-0 max-h-64 overflow-y-auto">
                    {trackingData.evenements.map((evt: any, idx: number) => (
                      <div key={idx} className="flex gap-3 py-2">
                        <div className="flex flex-col items-center">
                          <div className={`w-2.5 h-2.5 rounded-full ${idx === 0 ? 'bg-primary' : 'bg-gray-300'}`} />
                          {idx < trackingData.evenements.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                        </div>
                        <div className="pb-2">
                          <p className={`text-sm font-medium ${idx === 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                            {evt.label || evt.message_statut || evt.code_statut}
                          </p>
                          <p className="text-xs text-gray-400">{evt.date_statut}</p>
                          {evt.type_statut && (
                            <span className="text-xs text-gray-400">
                              {evt.type_statut === 'la_poste' ? 'La Poste' : 'Service Postal'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-sm text-gray-500">
                  {trackingData.status === 'sent' 
                    ? 'Votre courrier est en cours de production. Les mises à jour apparaîtront ici.'
                    : "Aucun événement de suivi disponible pour ce type d'envoi."}
                </div>
              )}
              
              {!trackingData.numero_suivi && trackingData.status === 'sent' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Le numéro de suivi sera disponible après l'impression et le dépôt à La Poste (chaque soir à 18h).
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setTrackingData(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CourrierPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <CourrierPageContent />
    </Suspense>
  );
}
