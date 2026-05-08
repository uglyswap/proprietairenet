'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth, getAuthHeaders } from '@/lib/auth-client';
import {
  ArrowLeft, Settings, Send, CheckCircle2, AlertCircle, Save, Tag, Image, FileText, BookOpen,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface SenderProfile {
  sender_civilite: string | null;
  sender_first_name: string | null;
  sender_last_name: string | null;
  sender_company: string | null;
  sender_address: string | null;
  sender_address2: string | null;
  sender_postal_code: string | null;
  sender_city: string | null;
  sender_country: string | null;
  sender_phone: string | null;
}

const emptySender: SenderProfile = {
  sender_civilite: '',
  sender_first_name: '',
  sender_last_name: '',
  sender_company: '',
  sender_address: '',
  sender_address2: '',
  sender_postal_code: '',
  sender_city: '',
  sender_country: 'FRANCE',
  sender_phone: '',
};

export default function SettingsPage() {
  const { token } = useAuth();
  const [sender, setSender] = useState<SenderProfile>(emptySender);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [branding, setBranding] = useState({ logo_courrier_url: '', courrier_header: '', courrier_footer: '' });
  const [savingBranding, setSavingBranding] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchSender = useCallback(async () => {
    try {
      const res = await fetch('/api/organization/sender', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.sender) {
          setSender({
            sender_civilite: data.sender.sender_civilite || '',
            sender_first_name: data.sender.sender_first_name || '',
            sender_last_name: data.sender.sender_last_name || '',
            sender_company: data.sender.sender_company || '',
            sender_address: data.sender.sender_address || '',
            sender_address2: data.sender.sender_address2 || '',
            sender_postal_code: data.sender.sender_postal_code || '',
            sender_city: data.sender.sender_city || '',
            sender_country: data.sender.sender_country || 'FRANCE',
            sender_phone: data.sender.sender_phone || '',
          });
        }
      }
    } catch (e) {
      console.error('Error fetching sender profile:', e);
    }
    setLoading(false);
  }, [token]);

  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch('/api/organization/branding', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.branding) {
          setBranding({
            logo_courrier_url: data.branding.logo_courrier_url || '',
            courrier_header: data.branding.courrier_header || '',
            courrier_footer: data.branding.courrier_footer || '',
          });
        }
      }
    } catch (e) {
      console.error('Error fetching branding:', e);
    }
  }, [token]);

  useEffect(() => {
    if (token) { fetchSender(); fetchBranding(); }
  }, [token, fetchSender, fetchBranding]);

  const saveBranding = async () => {
    setSavingBranding(true);
    try {
      const res = await fetch('/api/organization/branding', {
        method: 'PUT',
        headers,
        body: JSON.stringify(branding),
      });
      const data = await res.json();
      if (res.ok) showMsg('Personnalisation courriers sauvegardée !');
      else showMsg(data.error || 'Erreur lors de la sauvegarde', 'error');
    } catch (e: any) {
      showMsg(e.message || 'Erreur réseau', 'error');
    }
    setSavingBranding(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      showMsg('Logo trop volumineux (max 500KB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBranding(prev => ({ ...prev, logo_courrier_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const saveSender = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/organization/sender', {
        method: 'PUT',
        headers,
        body: JSON.stringify(sender),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('Profil expéditeur sauvegardé !');
      } else {
        showMsg(data.error || 'Erreur lors de la sauvegarde', 'error');
      }
    } catch (e: any) {
      showMsg(e.message || 'Erreur réseau', 'error');
    }
    setSaving(false);
  };

  const applyPromo = async () => {
    if (!promoCode) return;
    setPromoLoading(true);
    try {
      const res = await fetch('/api/promo/apply', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: promoCode }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(data.message || 'Code promo appliqué !');
        setPromoCode('');
      } else {
        showMsg(data.error || 'Code promo invalide', 'error');
      }
    } catch (e: any) {
      showMsg(e.message || 'Erreur réseau', 'error');
    }
    setPromoLoading(false);
  };

  const updateField = (field: keyof SenderProfile, value: string) => {
    setSender((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="text-sm text-muted-foreground">Chargement des paramètres...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-4">
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
                  <Settings className="h-6 w-6 text-blue-600" />
                  Paramètres
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Configurez votre organisation
                </p>
              </div>
            </div>
            {message && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-right-2 ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {message.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {message.text}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Sender Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="h-5 w-5" />
              Profil expéditeur
            </CardTitle>
            <CardDescription>
              Ces informations seront utilisées comme adresse d&apos;expédition pour vos courriers postaux
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="civilite" className="text-xs">Civilité</Label>
                <Select
                  value={sender.sender_civilite || ''}
                  onValueChange={(v) => updateField('sender_civilite', v)}
                >
                  <SelectTrigger id="civilite">
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M.">M.</SelectItem>
                    <SelectItem value="Mme">Mme</SelectItem>
                    <SelectItem value="Mme/M.">Mme/M.</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="firstName" className="text-xs">Prénom</Label>
                <Input
                  id="firstName"
                  placeholder="Jean"
                  value={sender.sender_first_name || ''}
                  onChange={(e) => updateField('sender_first_name', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="lastName" className="text-xs">Nom</Label>
                <Input
                  id="lastName"
                  placeholder="Dupont"
                  value={sender.sender_last_name || ''}
                  onChange={(e) => updateField('sender_last_name', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="company" className="text-xs">Société</Label>
              <Input
                id="company"
                placeholder="SCI Dupont"
                value={sender.sender_company || ''}
                onChange={(e) => updateField('sender_company', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="address" className="text-xs">Adresse (ligne 1)</Label>
              <Input
                id="address"
                placeholder="10 avenue des Champs Élysées"
                value={sender.sender_address || ''}
                onChange={(e) => updateField('sender_address', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="address2" className="text-xs">Adresse (ligne 2)</Label>
              <Input
                id="address2"
                placeholder="Bâtiment A, 3ème étage"
                value={sender.sender_address2 || ''}
                onChange={(e) => updateField('sender_address2', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="postalCode" className="text-xs">Code postal</Label>
                <Input
                  id="postalCode"
                  placeholder="75008"
                  value={sender.sender_postal_code || ''}
                  onChange={(e) => updateField('sender_postal_code', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="city" className="text-xs">Ville</Label>
                <Input
                  id="city"
                  placeholder="PARIS"
                  value={sender.sender_city || ''}
                  onChange={(e) => updateField('sender_city', e.target.value.toUpperCase())}
                />
              </div>
              <div>
                <Label htmlFor="country" className="text-xs">Pays</Label>
                <Input
                  id="country"
                  placeholder="FRANCE"
                  value={sender.sender_country || 'FRANCE'}
                  onChange={(e) => updateField('sender_country', e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="md:w-1/3">
              <Label htmlFor="phone" className="text-xs">Téléphone</Label>
              <Input
                id="phone"
                placeholder="+33 6 12 34 56 78"
                value={sender.sender_phone || ''}
                onChange={(e) => updateField('sender_phone', e.target.value)}
              />
            </div>

            <div className="pt-2">
              <Button onClick={saveSender} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? 'Sauvegarde en cours...' : 'Sauvegarder le profil expéditeur'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Promo Code */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Code promo
            </CardTitle>
            <CardDescription>
              Appliquez un code promotionnel pour bénéficier d&apos;avantages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Entrez votre code promo"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyPromo();
                }}
              />
              <Button onClick={applyPromo} disabled={promoLoading || !promoCode}>
                {promoLoading ? 'Application...' : 'Appliquer'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Branding / Courrier Customization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Personnalisation courriers
            </CardTitle>
            <CardDescription>
              Personnalisez l&apos;apparence de vos courriers postaux avec votre logo et vos textes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs flex items-center gap-1 mb-2">
                <Image className="h-3 w-3" />
                Logo (affiché sur les courriers)
              </Label>
              <div className="flex items-center gap-4">
                {branding.logo_courrier_url && (
                  <div className="w-24 h-24 border rounded-lg flex items-center justify-center overflow-hidden bg-gray-50">
                    <img src={branding.logo_courrier_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                )}
                <div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou SVG. Max 500KB.</p>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="courrier_header" className="text-xs">En-tête courrier</Label>
              <Textarea
                id="courrier_header"
                placeholder="Texte affiché en haut de chaque courrier (ex: votre slogan, numéro de référence...)"
                value={branding.courrier_header}
                onChange={(e) => setBranding(prev => ({ ...prev, courrier_header: e.target.value }))}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="courrier_footer" className="text-xs">Pied de page courrier</Label>
              <Textarea
                id="courrier_footer"
                placeholder="Texte affiché en bas de chaque courrier (ex: mentions légales, SIRET...)"
                value={branding.courrier_footer}
                onChange={(e) => setBranding(prev => ({ ...prev, courrier_footer: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="pt-2">
              <Button onClick={saveBranding} disabled={savingBranding} className="gap-2">
                <Save className="h-4 w-4" />
                {savingBranding ? 'Sauvegarde...' : 'Sauvegarder la personnalisation'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tutoriel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Tutoriel
            </CardTitle>
            <CardDescription>
              Revoyez le guide de démarrage pour découvrir ou redécouvrir les fonctionnalités de Proprietaire.net
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                try {
                  await fetch('/api/user/onboarding', {
                    method: 'PUT',
                    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ step: 0, completed: false }),
                  });
                  window.location.href = '/dashboard';
                } catch {}
              }}
            >
              <BookOpen className="h-4 w-4" />
              Revoir le tutoriel
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

