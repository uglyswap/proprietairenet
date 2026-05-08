'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-client';
import {
  ArrowLeft, Star, Plus, X, Trash2, ChevronRight, Loader2, Building2, MapPin,
  Mail, UserPlus, CheckCircle2, AlertCircle, Palette,
} from 'lucide-react';

interface PropertyList {
  id: string;
  name: string;
  description: string | null;
  color: string;
  item_count: number;
  created_at: string;
  updated_at: string;
}

interface ListItem {
  id: string;
  company_name: string | null;
  director_name: string | null;
  property_address: string | null;
  property_postal_code: string | null;
  property_city: string | null;
  siren: string | null;
  data: any;
  notes: string | null;
  created_at: string;
}

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export default function ListsPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [lists, setLists] = useState<PropertyList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [listItemsLoading, setListItemsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const fetchLists = useCallback(async () => {
    try {
      const res = await fetch('/api/lists', { headers });
      if (res.ok) {
        const data = await res.json();
        setLists(data.lists || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (token) fetchLists();
  }, [token, fetchLists]);

  const createList = async () => {
    if (!form.name) { showMsg('Nom requis', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/lists', { method: 'POST', headers, body: JSON.stringify(form) });
      if (res.ok) {
        showMsg('Liste créée !');
        setShowCreate(false);
        setForm({ name: '', description: '', color: '#3B82F6' });
        fetchLists();
      } else {
        const d = await res.json();
        showMsg(d.error || 'Erreur', 'error');
      }
    } catch (e: any) { showMsg(e.message, 'error'); }
    setSaving(false);
  };

  const deleteList = async (id: string) => {
    try {
      const res = await fetch(`/api/lists?id=${id}`, { method: 'DELETE', headers });
      if (res.ok) {
        showMsg('Liste supprimée');
        setDeleteConfirm(null);
        if (selectedList === id) { setSelectedList(null); setListItems([]); }
        fetchLists();
      }
    } catch (e: any) { showMsg(e.message, 'error'); }
  };

  const fetchListItems = async (listId: string) => {
    setSelectedList(listId);
    setListItemsLoading(true);
    try {
      const res = await fetch(`/api/lists/detail?id=${listId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setListItems(data.items || []);
      }
    } catch (e) { console.error(e); }
    setListItemsLoading(false);
  };

  const removeItem = async (itemId: string) => {
    if (!selectedList) return;
    try {
      const res = await fetch(`/api/lists/items?list_id=${selectedList}&item_id=${itemId}`, { method: 'DELETE', headers });
      if (res.ok) {
        setListItems(prev => prev.filter(i => i.id !== itemId));
        fetchLists(); // refresh counts
      }
    } catch (e) { console.error(e); }
  };

  const handleSendCourrier = (item: ListItem) => {
    const recipient = {
      civilite: '',
      prenom: '',
      nom: item.director_name || '',
      nom_societe: item.company_name || '',
      adresse_ligne1: item.property_address || '',
      code_postal: item.property_postal_code || '',
      ville: item.property_city || '',
      pays: 'France',
    };
    sessionStorage.setItem('courrier_recipients', JSON.stringify([recipient]));
    router.push('/dashboard/courrier');
  };

  const handleAddCrm = async (item: ListItem) => {
    try {
      const res = await fetch('/api/crm/contacts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          company_name: item.company_name,
          last_name: item.director_name || item.company_name,
          property_address: item.property_address,
          property_postal_code: item.property_postal_code,
          property_city: item.property_city,
          status: 'new',
        }),
      });
      if (res.ok) showMsg('Contact ajouté au CRM !');
      else {
        const d = await res.json();
        showMsg(d.error || 'Erreur', 'error');
      }
    } catch (e: any) { showMsg(e.message, 'error'); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const selectedListData = lists.find(l => l.id === selectedList);

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
                  <Star className="h-6 w-6 text-amber-500" />
                  Mes listes
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Sauvegardez et organisez vos propriétaires favoris
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
                Nouvelle liste
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Lists */}
          <div className="space-y-4">
            {showCreate && (
              <Card className="border-2 border-dashed border-blue-200 bg-blue-50/30">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Nouvelle liste</span>
                    <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}><X className="h-4 w-4" /></Button>
                  </div>
                  <Input placeholder="Nom de la liste" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <Input placeholder="Description (optionnel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <div>
                    <Label className="text-xs flex items-center gap-1 mb-1"><Palette className="h-3 w-3" /> Couleur</Label>
                    <div className="flex gap-1.5">
                      {COLORS.map(c => (
                        <button
                          key={c}
                          className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                          onClick={() => setForm({ ...form, color: c })}
                        />
                      ))}
                    </div>
                  </div>
                  <Button onClick={createList} disabled={saving} className="w-full" size="sm">
                    {saving ? 'Création...' : 'Créer'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {lists.length === 0 && !showCreate ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Star className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-30" />
                  <p className="text-sm text-muted-foreground">Aucune liste</p>
                </CardContent>
              </Card>
            ) : (
              lists.map(list => (
                <Card
                  key={list.id}
                  className={`cursor-pointer hover:shadow-md transition-all ${selectedList === list.id ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => fetchListItems(list.id)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{list.name}</div>
                        {list.description && <p className="text-xs text-muted-foreground truncate">{list.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{list.item_count}</Badge>
                        {deleteConfirm === list.id ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="destructive" className="h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); deleteList(list.id); }}>Oui</Button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}>Non</Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(list.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Right: Items */}
          <div className="lg:col-span-2">
            {!selectedList ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <ChevronRight className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-20" />
                  <p className="text-muted-foreground">Sélectionnez une liste pour voir son contenu</p>
                </CardContent>
              </Card>
            ) : listItemsLoading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedListData?.color }} />
                    {selectedListData?.name}
                    <Badge variant="secondary" className="ml-2">{listItems.length} propriétaire{listItems.length > 1 ? 's' : ''}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {listItems.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucun propriétaire dans cette liste</p>
                      <p className="text-xs mt-1">Utilisez le bouton ⭐ sur les résultats de recherche pour en ajouter</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {listItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between py-3 px-3 border rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{item.company_name || 'Sans nom'}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {item.director_name && <span className="text-xs text-muted-foreground">{item.director_name}</span>}
                              {item.siren && (
                                <>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-xs text-muted-foreground">SIREN {item.siren}</span>
                                </>
                              )}
                            </div>
                            {item.property_address && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{item.property_address}, {item.property_postal_code} {item.property_city}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2 flex-wrap">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSendCourrier(item)}>
                              <Mail className="h-3 w-3 mr-1" />
                              Courrier
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAddCrm(item)}>
                              <UserPlus className="h-3 w-3 mr-1" />
                              CRM
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
