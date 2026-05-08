'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Users, ArrowLeft, Search, Plus, Loader2, Mail, Phone, Building2,
  MapPin, Calendar, FileText, Trash2, Download, LayoutGrid, List,
  ChevronDown, ChevronUp, X, Edit3, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { getMe, getAuthHeaders, ClientUser, ClientOrganization } from '@/lib/auth-client';

interface Contact {
  id: string;
  civilite: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  property_address: string | null;
  property_postal_code: string | null;
  property_city: string | null;
  status: string;
  notes: string | null;
  next_follow_up: string | null;
  tags: string | null;
  last_contacted_at: string | null;
  mail_count: number;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new: { label: 'Nouveau', color: 'text-gray-700', bg: 'bg-gray-100 border-gray-300' },
  contacted: { label: 'Contacté', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-300' },
  interested: { label: 'Intéressé', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-300' },
  negotiation: { label: 'Négociation', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-300' },
  won: { label: 'Gagné', color: 'text-green-700', bg: 'bg-green-50 border-green-300' },
  lost: { label: 'Perdu', color: 'text-red-700', bg: 'bg-red-50 border-red-300' },
};

const STATUS_ORDER = ['new', 'contacted', 'interested', 'negotiation', 'won', 'lost'];

export default function CRMPage() {
  const router = useRouter();
  const [user, setUser] = useState<ClientUser | null>(null);
  const [org, setOrg] = useState<ClientOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [contactsLoading, setContactsLoading] = useState(false);

  // Contact dialog
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<Contact>>({});
  const [saving, setSaving] = useState(false);

  // New contact dialog
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContact, setNewContact] = useState({
    civilite: '', first_name: '', last_name: '', company_name: '',
    address: '', postal_code: '', city: '', phone: '', email: '',
    property_address: '', property_postal_code: '', property_city: '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const data = await getMe();
      if (!data) { router.push('/login'); return; }
      setUser(data.user);
      setOrg(data.organization);
    } catch { router.push('/login'); }
    finally { setLoading(false); }
  };

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm) params.set('search', searchTerm);

      const res = await fetch(`/api/crm/contacts?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
        setTotal(data.total || 0);
        setStatusCounts(data.status_counts || {});
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally { setContactsLoading(false); }
  }, [statusFilter, searchTerm]);

  useEffect(() => {
    if (!loading && user) loadContacts();
  }, [loading, user, loadContacts]);

  // Debounced search
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => loadContacts(), 300));
  };

  const handleCreateContact = async () => {
    if (!newContact.last_name && !newContact.company_name) {
      toast.error('Nom ou société requis');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/crm/contacts', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact),
      });
      if (res.ok) {
        toast.success('Contact créé !');
        setNewContactOpen(false);
        setNewContact({
          civilite: '', first_name: '', last_name: '', company_name: '',
          address: '', postal_code: '', city: '', phone: '', email: '',
          property_address: '', property_postal_code: '', property_city: '',
          notes: '',
        });
        loadContacts();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur');
      }
    } catch { toast.error('Erreur de création'); }
    finally { setCreating(false); }
  };

  const handleUpdateContact = async (contactId: string, updates: Partial<Contact>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(prev => prev.map(c => c.id === contactId ? data.contact : c));
        if (selectedContact?.id === contactId) setSelectedContact(data.contact);
        toast.success('Contact mis à jour');
        setEditMode(false);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erreur');
      }
    } catch { toast.error('Erreur de mise à jour'); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (contactId: string, newStatus: string) => {
    await handleUpdateContact(contactId, { status: newStatus } as any);
    loadContacts();
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Supprimer ce contact ?')) return;
    try {
      const res = await fetch(`/api/crm/contacts/${contactId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        toast.success('Contact supprimé');
        setContactDialogOpen(false);
        loadContacts();
      }
    } catch { toast.error('Erreur de suppression'); }
  };

  const handleExportCSV = async () => {
    try {
      const res = await fetch('/api/export/contacts', { headers: getAuthHeaders() });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('Export CSV réussi !');
      }
    } catch { toast.error('Erreur d\'export'); }
  };

  const openContactDetail = (contact: Contact) => {
    setSelectedContact(contact);
    setEditData(contact);
    setEditMode(false);
    setContactDialogOpen(true);
  };

  const getDisplayName = (c: Contact) => {
    if (c.company_name) return c.company_name;
    return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Sans nom';
  };

  const getSubName = (c: Contact) => {
    if (c.company_name && (c.first_name || c.last_name)) {
      return [c.civilite, c.first_name, c.last_name].filter(Boolean).join(' ');
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const contactsByStatus = STATUS_ORDER.reduce((acc, st) => {
    acc[st] = contacts.filter(c => c.status === st);
    return acc;
  }, {} as Record<string, Contact[]>);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Dashboard</Button>
            </Link>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              <h1 className="text-lg font-semibold">CRM</h1>
              <Badge variant="secondary" className="text-xs">{total} contacts</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" />Exporter
            </Button>
            <Button size="sm" onClick={() => setNewContactOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />Nouveau
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="max-w-[1600px] mx-auto px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un contact..."
              value={searchTerm}
              onChange={e => handleSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {STATUS_ORDER.map(st => (
                <SelectItem key={st} value={st}>
                  {STATUS_CONFIG[st].label} ({statusCounts[st] || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none h-9"
              onClick={() => setViewMode('kanban')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none h-9"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {contactsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-4 pb-8">
        {viewMode === 'kanban' ? (
          /* ═══ KANBAN VIEW ═══ */
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STATUS_ORDER.map(st => (
              <div key={st} className="flex-shrink-0 w-[270px]">
                <div className={`rounded-t-lg px-3 py-2 border-b-2 ${STATUS_CONFIG[st].bg}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-semibold ${STATUS_CONFIG[st].color}`}>
                      {STATUS_CONFIG[st].label}
                    </span>
                    <Badge variant="secondary" className="text-xs h-5">
                      {contactsByStatus[st]?.length || 0}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2 pt-2 min-h-[200px]">
                  {(contactsByStatus[st] || []).map(contact => (
                    <Card
                      key={contact.id}
                      className="cursor-pointer hover:shadow-md transition-shadow border"
                      onClick={() => openContactDetail(contact)}
                    >
                      <CardContent className="p-3">
                        <p className="font-medium text-sm truncate">{getDisplayName(contact)}</p>
                        {getSubName(contact) && (
                          <p className="text-xs text-muted-foreground truncate">{getSubName(contact)}</p>
                        )}
                        {(contact.property_address || contact.property_city) && (
                          <p className="text-xs text-blue-600 mt-1 truncate">
                            🏠 {[contact.property_address, contact.property_postal_code, contact.property_city].filter(Boolean).join(', ')}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          {contact.mail_count > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Mail className="h-3 w-3" />{contact.mail_count}
                            </span>
                          )}
                          {contact.next_follow_up && (
                            <span className="flex items-center gap-0.5">
                              <Calendar className="h-3 w-3" />
                              {new Date(contact.next_follow_up).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {(contactsByStatus[st] || []).length === 0 && (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                      Aucun contact
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ═══ LIST VIEW ═══ */
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bien immobilier</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Relance</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Courriers</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(contact => (
                    <tr key={contact.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openContactDetail(contact)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{getDisplayName(contact)}</p>
                        {getSubName(contact) && <p className="text-xs text-muted-foreground">{getSubName(contact)}</p>}
                        {contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {contact.property_address && <p>{contact.property_address}</p>}
                        <p className="text-muted-foreground">{[contact.property_postal_code, contact.property_city].filter(Boolean).join(' ')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={contact.status}
                          onValueChange={(v) => { handleStatusChange(contact.id, v); }}
                        >
                          <SelectTrigger className="h-7 text-xs w-[130px]" onClick={e => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_ORDER.map(st => (
                              <SelectItem key={st} value={st}>{STATUS_CONFIG[st].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {contact.next_follow_up
                          ? new Date(contact.next_follow_up).toLocaleDateString('fr-FR')
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs">{contact.mail_count}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openContactDetail(contact)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteContact(contact.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {contacts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground">
                        {contactsLoading ? 'Chargement...' : 'Aucun contact'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* ═══ CONTACT DETAIL DIALOG ═══ */}
      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              {selectedContact ? getDisplayName(selectedContact) : 'Contact'}
            </DialogTitle>
          </DialogHeader>

          {selectedContact && (
            <div className="space-y-4">
              {/* Status + Actions bar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <Select
                  value={selectedContact.status}
                  onValueChange={(v) => handleStatusChange(selectedContact.id, v)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map(st => (
                      <SelectItem key={st} value={st}>{STATUS_CONFIG[st].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => setEditMode(!editMode)}>
                    <Edit3 className="h-4 w-4 mr-1" />{editMode ? 'Annuler' : 'Modifier'}
                  </Button>
                  <Link href={`/dashboard/courrier?dest_societe=${encodeURIComponent(selectedContact.company_name || '')}&dest_nom=${encodeURIComponent(selectedContact.last_name || '')}&dest_prenom=${encodeURIComponent(selectedContact.first_name || '')}&dest_adresse=${encodeURIComponent(selectedContact.address || '')}&dest_cp=${encodeURIComponent(selectedContact.postal_code || '')}&dest_ville=${encodeURIComponent(selectedContact.city || '')}&bien_adresse=${encodeURIComponent(selectedContact.property_address || '')}&bien_cp=${encodeURIComponent(selectedContact.property_postal_code || '')}&bien_ville=${encodeURIComponent(selectedContact.property_city || '')}`}>
                    <Button size="sm">
                      <Mail className="h-4 w-4 mr-1" />Envoyer un courrier
                    </Button>
                  </Link>
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDeleteContact(selectedContact.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Infos propriétaire */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4" />Propriétaire
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {editMode ? (
                      <>
                        <div className="grid grid-cols-3 gap-1.5">
                          <Select value={editData.civilite || ''} onValueChange={v => setEditData(p => ({ ...p, civilite: v }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Civ." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="M.">M.</SelectItem>
                              <SelectItem value="Mme">Mme</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input className="h-8 text-xs" placeholder="Prénom" value={editData.first_name || ''} onChange={e => setEditData(p => ({ ...p, first_name: e.target.value }))} />
                          <Input className="h-8 text-xs" placeholder="Nom" value={editData.last_name || ''} onChange={e => setEditData(p => ({ ...p, last_name: e.target.value }))} />
                        </div>
                        <Input className="h-8 text-xs" placeholder="Société" value={editData.company_name || ''} onChange={e => setEditData(p => ({ ...p, company_name: e.target.value }))} />
                        <Input className="h-8 text-xs" placeholder="Adresse" value={editData.address || ''} onChange={e => setEditData(p => ({ ...p, address: e.target.value }))} />
                        <div className="grid grid-cols-3 gap-1.5">
                          <Input className="h-8 text-xs" placeholder="CP" value={editData.postal_code || ''} onChange={e => setEditData(p => ({ ...p, postal_code: e.target.value }))} />
                          <Input className="h-8 text-xs col-span-2" placeholder="Ville" value={editData.city || ''} onChange={e => setEditData(p => ({ ...p, city: e.target.value }))} />
                        </div>
                        <Input className="h-8 text-xs" placeholder="Téléphone" value={editData.phone || ''} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} />
                        <Input className="h-8 text-xs" placeholder="Email" value={editData.email || ''} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))} />
                      </>
                    ) : (
                      <>
                        {selectedContact.company_name && <p className="font-medium">{selectedContact.company_name}</p>}
                        <p>{[selectedContact.civilite, selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(' ') || '—'}</p>
                        {selectedContact.address && (
                          <p className="text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {selectedContact.address}, {selectedContact.postal_code} {selectedContact.city}
                          </p>
                        )}
                        {selectedContact.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{selectedContact.phone}</p>}
                        {selectedContact.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{selectedContact.email}</p>}
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Infos bien immobilier */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-600" />Bien immobilier
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {editMode ? (
                      <>
                        <Input className="h-8 text-xs" placeholder="Adresse du bien" value={editData.property_address || ''} onChange={e => setEditData(p => ({ ...p, property_address: e.target.value }))} />
                        <div className="grid grid-cols-3 gap-1.5">
                          <Input className="h-8 text-xs" placeholder="CP" value={editData.property_postal_code || ''} onChange={e => setEditData(p => ({ ...p, property_postal_code: e.target.value }))} />
                          <Input className="h-8 text-xs col-span-2" placeholder="Ville" value={editData.property_city || ''} onChange={e => setEditData(p => ({ ...p, property_city: e.target.value }))} />
                        </div>
                      </>
                    ) : (
                      <>
                        {selectedContact.property_address ? (
                          <>
                            <p>{selectedContact.property_address}</p>
                            <p className="text-muted-foreground">{selectedContact.property_postal_code} {selectedContact.property_city}</p>
                          </>
                        ) : (
                          <p className="text-muted-foreground">Aucun bien lié</p>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Notes + Follow-up */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />Notes & Suivi
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Date de relance</Label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={editMode ? (editData.next_follow_up || '') : (selectedContact.next_follow_up ? selectedContact.next_follow_up.split('T')[0] : '')}
                        onChange={e => {
                          if (editMode) {
                            setEditData(p => ({ ...p, next_follow_up: e.target.value }));
                          } else {
                            handleUpdateContact(selectedContact.id, { next_follow_up: e.target.value } as any);
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Courriers envoyés</Label>
                      <p className="text-sm font-medium mt-1">{selectedContact.mail_count} courrier{selectedContact.mail_count > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      className="text-sm min-h-[100px] mt-1"
                      placeholder="Ajouter des notes..."
                      value={editMode ? (editData.notes || '') : (selectedContact.notes || '')}
                      onChange={e => {
                        if (editMode) {
                          setEditData(p => ({ ...p, notes: e.target.value }));
                        }
                      }}
                      readOnly={!editMode}
                    />
                    {!editMode && (
                      <Button
                        variant="outline" size="sm" className="mt-2"
                        onClick={() => { setEditMode(true); setEditData(selectedContact); }}
                      >
                        <Edit3 className="h-3 w-3 mr-1" />Modifier les notes
                      </Button>
                    )}
                  </div>
                  {editMode && (
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Annuler</Button>
                      <Button size="sm" disabled={saving} onClick={() => handleUpdateContact(selectedContact.id, editData)}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                        Sauvegarder
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Meta */}
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Créé le {new Date(selectedContact.created_at).toLocaleDateString('fr-FR')}</span>
                {selectedContact.last_contacted_at && (
                  <span>Dernier contact le {new Date(selectedContact.last_contacted_at).toLocaleDateString('fr-FR')}</span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ NEW CONTACT DIALOG ═══ */}
      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-600" />
              Nouveau contact
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Select value={newContact.civilite} onValueChange={v => setNewContact(p => ({ ...p, civilite: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Civ." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M.">M.</SelectItem>
                  <SelectItem value="Mme">Mme</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Prénom" value={newContact.first_name} onChange={e => setNewContact(p => ({ ...p, first_name: e.target.value }))} />
              <Input placeholder="Nom *" value={newContact.last_name} onChange={e => setNewContact(p => ({ ...p, last_name: e.target.value }))} />
            </div>
            <Input placeholder="Société *" value={newContact.company_name} onChange={e => setNewContact(p => ({ ...p, company_name: e.target.value }))} />
            <Input placeholder="Adresse" value={newContact.address} onChange={e => setNewContact(p => ({ ...p, address: e.target.value }))} />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="CP" value={newContact.postal_code} onChange={e => setNewContact(p => ({ ...p, postal_code: e.target.value }))} />
              <Input className="col-span-2" placeholder="Ville" value={newContact.city} onChange={e => setNewContact(p => ({ ...p, city: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Téléphone" value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} />
              <Input placeholder="Email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="border-t pt-3">
              <Label className="text-xs font-medium text-blue-600">🏠 Bien immobilier lié</Label>
              <Input className="mt-1" placeholder="Adresse du bien" value={newContact.property_address} onChange={e => setNewContact(p => ({ ...p, property_address: e.target.value }))} />
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                <Input placeholder="CP" value={newContact.property_postal_code} onChange={e => setNewContact(p => ({ ...p, property_postal_code: e.target.value }))} />
                <Input className="col-span-2" placeholder="Ville" value={newContact.property_city} onChange={e => setNewContact(p => ({ ...p, property_city: e.target.value }))} />
              </div>
            </div>
            <Textarea placeholder="Notes..." value={newContact.notes} onChange={e => setNewContact(p => ({ ...p, notes: e.target.value }))} className="min-h-[60px]" />
            <p className="text-xs text-muted-foreground">* Nom ou société requis</p>
            <Button className="w-full" onClick={handleCreateContact} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Créer le contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
