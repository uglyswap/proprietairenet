'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/lib/auth-client';
import {
  Users, Trash2, UserPlus, Crown, CreditCard, Tag, X, Shield,
  ArrowLeft, ChevronRight, AlertCircle, CheckCircle2, User, ShieldCheck,
} from 'lucide-react';

interface TeamUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  manager: 'Manager',
  agent: 'Agent',
  viewer: 'Lecteur',
  user: 'Membre',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-700 border-amber-200',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  manager: 'bg-purple-100 text-purple-700 border-purple-200',
  agent: 'bg-green-100 text-green-700 border-green-200',
  viewer: 'bg-gray-100 text-gray-700 border-gray-200',
  user: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function TeamPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [maxUsers, setMaxUsers] = useState(1);
  const [plan, setPlan] = useState('free');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', first_name: '', last_name: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const isOwner = user?.id === ownerId;

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/organization/users', { headers });
      const d = await res.json();
      setUsers(d.users || []);
      setMaxUsers(d.max_users || 1);
      setPlan(d.plan || 'free');
      setOwnerId(d.owner_id || null);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (token) fetchData();
  }, [token, fetchData]);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const addUser = async () => {
    if (!addForm.email || !addForm.password) return showMsg('Email et mot de passe requis', 'error');
    if (addForm.password.length < 6) return showMsg('Le mot de passe doit contenir au moins 6 caractères', 'error');
    setSaving(true);
    try {
      const res = await fetch('/api/organization/users', { method: 'POST', headers, body: JSON.stringify(addForm) });
      const d = await res.json();
      if (res.ok) {
        const billingMsg = d.billing ? ' — ' + d.billing : ''; showMsg('Utilisateur ajouté' + billingMsg, 'success');
        setShowAdd(false);
        setAddForm({ email: '', first_name: '', last_name: '', password: '' });
        fetchData();
      } else {
        showMsg(d.error || 'Erreur lors de l\'ajout', 'error');
      }
    } catch (e: any) {
      showMsg(e.message, 'error');
    }
    setSaving(false);
  };

  const removeUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/organization/users?id=${userId}`, { method: 'DELETE', headers });
      if (res.ok) {
        showMsg('Utilisateur supprimé');
        setDeleteConfirm(null);
        fetchData();
      } else {
        const d = await res.json();
        showMsg(d.error || 'Erreur lors de la suppression', 'error');
      }
    } catch (e: any) {
      showMsg(e.message, 'error');
    }
  };

  const changeRole = async (userId: string, newRole: string) => {
    setChangingRole(userId);
    try {
      const res = await fetch('/api/organization/users', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      const d = await res.json();
      if (res.ok) {
        showMsg(`Rôle mis à jour en ${ROLE_LABELS[newRole] || newRole}`);
        fetchData();
      } else {
        showMsg(d.error || 'Erreur lors du changement de rôle', 'error');
      }
    } catch (e: any) {
      showMsg(e.message, 'error');
    }
    setChangingRole(null);
  };

  const applyPromo = async () => {
    if (!promoCode) return;
    setPromoLoading(true);
    try {
      const res = await fetch('/api/promo/apply', { method: 'POST', headers, body: JSON.stringify({ code: promoCode }) });
      const d = await res.json();
      if (res.ok) {
        showMsg(d.message || 'Code promo appliqué !');
        setPromoCode('');
        fetchData();
      } else {
        showMsg(d.error || 'Code promo invalide', 'error');
      }
    } catch (e: any) {
      showMsg(e.message, 'error');
    }
    setPromoLoading(false);
  };

  const getUserDisplayRole = (u: TeamUser) => {
    if (u.id === ownerId) return 'owner';
    return u.role || 'user';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="text-sm text-muted-foreground">Chargement de l&apos;équipe...</span>
        </div>
      </div>
    );
  }

  const usedSlots = users.length;
  const usagePercent = Math.round((usedSlots / maxUsers) * 100);

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
                  <Users className="h-6 w-6 text-blue-600" />
                  Mon équipe
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Gérez les membres de votre organisation
                </p>
              </div>
            </div>
            {message && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-right-2 ${
                message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {message.text}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Usage bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Utilisation des places</span>
                <Badge variant="secondary" className="capitalize">{plan}</Badge>
              </div>
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{usedSlots}</span> / {maxUsers} utilisateur{maxUsers > 1 ? 's' : ''}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  usagePercent >= 100 ? 'bg-red-500' : usagePercent >= 80 ? 'bg-amber-500' : 'bg-blue-600'
                }`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
            {usedSlots >= maxUsers && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Toutes les places sont utilisées.
                {plan === 'free' ? ' Passez au plan Pro pour en ajouter.' : ' Ajoutez un utilisateur supplémentaire (20€/mois, sans engagement).'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Membres
              </CardTitle>
              <CardDescription>
                {usedSlots} membre{usedSlots > 1 ? 's' : ''} dans votre organisation
              </CardDescription>
            </div>
            {isOwner && plan === 'free' && usedSlots >= maxUsers && (
              <Button size="sm" variant="outline" onClick={() => router.push('/pricing')} className="gap-1">
                <CreditCard className="h-4 w-4" />
                Passer au Pro
              </Button>
            )}
            {isOwner && (plan !== 'free' || usedSlots < maxUsers) && (
              <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
                <UserPlus className="h-4 w-4" />
                Ajouter un membre
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Add User Form */}
            {showAdd && (
              <div className="mb-4 p-5 border-2 border-dashed border-blue-200 rounded-lg bg-blue-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-blue-600" />
                    Nouvel utilisateur
                  </h4>
                  <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {usedSlots >= 1 && plan !== 'free' && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                    <CreditCard className="h-4 w-4 text-blue-600 shrink-0" />
                    <span className="text-blue-800">
                      Utilisateur supplémentaire : <strong>20€/mois</strong>, sans engagement. Facturation mensuelle automatique via Stripe.
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Prénom</Label>
                    <Input
                      placeholder="Jean"
                      value={addForm.first_name}
                      onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Nom</Label>
                    <Input
                      placeholder="Dupont"
                      value={addForm.last_name}
                      onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Email *</Label>
                    <Input
                      type="email"
                      placeholder="jean@exemple.fr"
                      value={addForm.email}
                      onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Mot de passe *</Label>
                    <Input
                      type="password"
                      placeholder="Min. 6 caractères"
                      value={addForm.password}
                      onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={addUser} disabled={saving} className="flex-1">
                    {saving ? 'Ajout en cours...' : 'Ajouter à l\'équipe'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAdd(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}

            {/* User list */}
            {users.map((u) => {
              const displayRole = getUserDisplayRole(u);
              const isCurrentUser = u.id === user?.id;
              const isUserOwner = u.id === ownerId;
              const canManage = isOwner && !isCurrentUser && !isUserOwner;

              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between py-3 px-4 bg-white border rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                      isUserOwner
                        ? 'bg-amber-100 text-amber-700'
                        : displayRole === 'admin'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                    }`}>
                      {isUserOwner ? (
                        <Crown className="h-4 w-4" />
                      ) : (
                        (u.first_name?.[0] || u.email[0]).toUpperCase()
                      )}
                    </div>

                    {/* User info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {u.first_name || u.last_name
                            ? `${u.first_name || ''} ${u.last_name || ''}`.trim()
                            : u.email.split('@')[0]}
                        </span>
                        {isCurrentUser && (
                          <Badge variant="secondary" className="text-xs py-0">Vous</Badge>
                        )}
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${ROLE_COLORS[displayRole] || ROLE_COLORS.user}`}>
                          {isUserOwner && <Crown className="h-3 w-3" />}
                          {displayRole === 'admin' && !isUserOwner && <ShieldCheck className="h-3 w-3" />}
                          {displayRole === 'user' && <User className="h-3 w-3" />}
                          {ROLE_LABELS[displayRole] || displayRole}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          Ajouté le {new Date(u.created_at).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Last login */}
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {u.last_login_at
                        ? `Vu le ${new Date(u.last_login_at).toLocaleDateString('fr-FR')}`
                        : 'Jamais connecté'}
                    </span>

                    {/* Role change */}
                    {canManage && (
                      <Select
                        value={u.role}
                        onValueChange={(value) => changeRole(u.id, value)}
                        disabled={changingRole === u.id}
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Roles alignes sur ceux acceptes par le serveur (PATCH /api/organization/users : admin, user) */}
                          <SelectItem value="admin">
                            <div className="flex items-center gap-1.5">
                              <ShieldCheck className="h-3 w-3 text-blue-600" />
                              Administrateur
                            </div>
                          </SelectItem>
                          <SelectItem value="user">
                            <div className="flex items-center gap-1.5">
                              <User className="h-3 w-3 text-gray-600" />
                              Membre
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {/* Delete button */}
                    {canManage && (
                      <>
                        {deleteConfirm === u.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs"
                              onClick={() => removeUser(u.id)}
                            >
                              Confirmer
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              Annuler
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setDeleteConfirm(u.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {users.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Aucun membre dans votre organisation</p>
              </div>
            )}

            {/* Upgrade CTA for free plan */}
            {plan === 'free' && usedSlots >= maxUsers && (
              <div className="mt-4 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Crown className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">Passez au plan Pro pour agrandir votre équipe</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      1 utilisateur inclus. Ajoutez des membres à votre équipe depuis votre espace. Recherches illimitées pour toute l’équipe.
                    </p>
                    <Button size="sm" className="mt-3" onClick={() => router.push('/pricing')}>
                      <CreditCard className="h-4 w-4 mr-1" />
                      Voir les plans
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Abonnement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium capitalize">Plan {plan}</span>
                {plan === 'free' && (
                  <span className="text-sm text-muted-foreground ml-2">— 10 recherches/mois</span>
                )}
                {plan !== 'free' && (
                  <span className="text-sm text-muted-foreground ml-2">— Recherche illimitée</span>
                )}
              </div>
              {plan !== 'free' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const res = await fetch('/api/stripe/portal', { method: 'POST', headers });
                    const d = await res.json();
                    if (d.url) window.location.href = d.url;
                  }}
                >
                  Gérer l&apos;abonnement
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => router.push('/pricing')}>
                  <Crown className="h-4 w-4 mr-1" />
                  Passer au Pro
                </Button>
              )}
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
                onKeyDown={(e) => { if (e.key === 'Enter') applyPromo(); }}
              />
              <Button onClick={applyPromo} disabled={promoLoading || !promoCode}>
                {promoLoading ? 'Application...' : 'Appliquer'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Role legend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Rôles et permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg border bg-amber-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-sm">Propriétaire</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Contrôle total : équipe, rôles, abonnement, facturation, audit.
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-blue-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-sm">Administrateur</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Accès complet aux recherches, paramètres, et gestion d&apos;équipe. Audit visible.
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-purple-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  <span className="font-medium text-sm">Manager</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Recherches, courriers, CRM, export. Peut envoyer des campagnes.
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-green-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-sm">Agent</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Recherches et courriers individuels. Accès CRM en lecture.
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-gray-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-sm">Lecteur</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Consultation uniquement. Aucune action de modification.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

