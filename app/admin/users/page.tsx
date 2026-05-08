'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/lib/auth-client';
import { Users, Search, Shield, ShieldCheck, ShieldOff, Building2 } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
  org_name: string | null;
  subscription_plan: string | null;
  organization_id: string | null;
  search_count: number;
}

export default function AdminUsersPage() {
  const { token, user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AdminUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [promoting, setPromoting] = useState<string | null>(null);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users', { headers });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setFilteredUsers(data.users || []);
      }
    } catch (e) {
      console.error('Error loading users:', e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (token) fetchUsers();
  }, [token, fetchUsers]);

  useEffect(() => {
    const filtered = users.filter((u) => {
      const s = searchTerm.toLowerCase();
      return (
        u.email.toLowerCase().includes(s) ||
        (u.first_name || '').toLowerCase().includes(s) ||
        (u.last_name || '').toLowerCase().includes(s) ||
        (u.org_name || '').toLowerCase().includes(s) ||
        u.id.toLowerCase().includes(s)
      );
    });
    setFilteredUsers(filtered);
  }, [searchTerm, users]);

  const toggleAdmin = async (userId: string) => {
    setPromoting(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/promote`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        await fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur');
      }
    } catch (e: any) {
      alert(e.message || 'Erreur réseau');
    }
    setPromoting(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Chargement des utilisateurs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">Gestion des utilisateurs</h2>
        <p className="text-gray-600 mt-1">Gérer tous les utilisateurs de la plateforme</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Tous les utilisateurs ({filteredUsers.length})
          </CardTitle>
          <CardDescription>Liste complète des utilisateurs inscrits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Rechercher par email, nom ou organisation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Recherches</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Inscription</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => {
                  const isCurrentUser = u.id === currentUser?.id;
                  const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ');

                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {fullName || u.email.split('@')[0]}
                            </span>
                            {u.is_admin && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Shield className="w-3 h-3" />
                                Admin
                              </Badge>
                            )}
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-xs">Vous</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.org_name ? (
                          <div className="flex items-center gap-1 text-sm">
                            <Building2 className="w-3 h-3 text-gray-400" />
                            {u.org_name}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.subscription_plan === 'free' ? 'outline' : 'default'}
                          className="capitalize text-xs"
                        >
                          {u.subscription_plan || 'free'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{u.search_count}</TableCell>
                      <TableCell>
                        {u.last_login_at ? (
                          <span className="text-xs text-green-600">
                            Vu le {new Date(u.last_login_at).toLocaleDateString('fr-FR')}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Jamais connecté</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {new Date(u.created_at).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell>
                        {!isCurrentUser && (
                          <Button
                            size="sm"
                            variant={u.is_admin ? 'destructive' : 'outline'}
                            onClick={() => toggleAdmin(u.id)}
                            disabled={promoting === u.id}
                            className="gap-1 text-xs"
                          >
                            {promoting === u.id ? (
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                            ) : u.is_admin ? (
                              <>
                                <ShieldOff className="w-3 h-3" />
                                Retirer admin
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="w-3 h-3" />
                                Promouvoir admin
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Aucun utilisateur trouvé
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
