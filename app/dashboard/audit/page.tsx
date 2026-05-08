'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  ArrowLeft, ClipboardList, Search as SearchIcon, ChevronLeft, ChevronRight,
  Mail, UserPlus, Settings, Trash2, FileText, BarChart3,
} from 'lucide-react';

interface AuditEvent {
  id: string;
  user_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: any;
  ip_address: string | null;
  created_at: string;
}

const ACTION_ICONS: Record<string, any> = {
  'search': SearchIcon,
  'courrier.send': Mail,
  'courrier.cancel': Trash2,
  'contact.create': UserPlus,
  'user.add': UserPlus,
  'user.remove': Trash2,
  'settings.update': Settings,
  'settings.branding_update': Settings,
  'campaign.create': FileText,
  'campaign.send': Mail,
  'export': BarChart3,
};

const ACTION_LABELS: Record<string, string> = {
  'search': 'Recherche',
  'courrier.send': 'Courrier envoyé',
  'courrier.cancel': 'Courrier annulé',
  'courrier.bulk': 'Envoi en masse',
  'contact.create': 'Contact créé',
  'contact.update': 'Contact modifié',
  'user.add': 'Utilisateur ajouté',
  'user.remove': 'Utilisateur supprimé',
  'user.role_change': 'Rôle modifié',
  'settings.update': 'Paramètres modifiés',
  'settings.branding_update': 'Branding modifié',
  'campaign.create': 'Campagne créée',
  'campaign.send': 'Campagne envoyée',
  'export': 'Export',
};

const ACTION_COLORS: Record<string, string> = {
  'search': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'courrier.send': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'courrier.cancel': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'contact.create': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'user.add': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'user.remove': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'settings.update': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'campaign.create': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'campaign.send': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export default function AuditPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('all');
  const limit = 30;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), page: String(page) });
      if (actionFilter && actionFilter !== 'all') params.set('action', actionFilter);

      const res = await fetch(`/api/audit?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 0);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [token, page, actionFilter]);

  useEffect(() => {
    if (token) fetchEvents();
  }, [token, fetchEvents]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1 dark:text-gray-300 dark:hover:bg-gray-700">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 dark:text-white">
                <ClipboardList className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                Logs
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Historique de toutes les actions de votre organisation
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[200px] dark:bg-gray-700 dark:border-gray-600">
                  <SelectValue placeholder="Toutes les actions" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-700">
                  <SelectItem value="all">Toutes les actions</SelectItem>
                  <SelectItem value="search">Recherches</SelectItem>
                  <SelectItem value="courrier.send">Courriers envoyés</SelectItem>
                  <SelectItem value="courrier.bulk">Envois en masse</SelectItem>
                  <SelectItem value="contact.create">Contacts créés</SelectItem>
                  <SelectItem value="user.add">Utilisateurs ajoutés</SelectItem>
                  <SelectItem value="user.remove">Utilisateurs supprimés</SelectItem>
                  <SelectItem value="settings.update">Paramètres modifiés</SelectItem>
                  <SelectItem value="campaign.create">Campagnes créées</SelectItem>
                  <SelectItem value="campaign.send">Campagnes envoyées</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground ml-auto">{total} événement{total > 1 ? 's' : ''}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Aucun événement trouvé</p>
              </div>
            ) : (
              <div className="space-y-1">
                {events.map((event) => {
                  const Icon = ACTION_ICONS[event.action] || ClipboardList;
                  const colorClass = ACTION_COLORS[event.action] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
                  return (
                    <div key={event.id} className="flex items-center gap-3 py-2.5 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate dark:text-white">
                            {ACTION_LABELS[event.action] || event.action}
                          </span>
                          {event.target_type && (
                            <Badge variant="outline" className="text-xs dark:border-gray-600">
                              {event.target_type}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{event.user_email}</span>
                          {event.ip_address && event.ip_address !== 'unknown' && (
                            <>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">{event.ip_address}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(event.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t dark:border-gray-700 mt-4">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="dark:border-gray-600 dark:text-gray-300">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Précédent
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="dark:border-gray-600 dark:text-gray-300">
                  Suivant
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
