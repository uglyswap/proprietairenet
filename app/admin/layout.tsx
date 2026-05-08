'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, LayoutDashboard, Users, Settings, CreditCard, ArrowLeft, Loader2, Eye, Tag, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getMe, ClientUser, setAdminPreviewMode, isAdminPreviewMode } from '@/lib/auth-client';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      const data = await getMe();
      if (!data || !data.user.is_admin) {
        router.push('/dashboard');
        return;
      }
      // If admin lands on /admin, make sure preview mode is off
      setAdminPreviewMode(false);
      setUser(data.user);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewMode = () => {
    setAdminPreviewMode(true);
    router.push('/dashboard');
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white flex flex-col shrink-0 h-screen sticky top-0">
        <div className="p-6 border-b border-slate-700">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-blue-400" />
            <div>
              <div className="font-bold">Proprietaire.net</div>
              <div className="text-xs text-slate-400">Administration</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {[
            { href: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
            { href: '/admin/users', icon: Users, label: 'Utilisateurs' },
            { href: '/admin/organizations', icon: Building2, label: 'Organisations' },
            { href: '/admin/pricing', icon: CreditCard, label: 'Plans & Crédits' },
            { href: '/admin/promo-codes', icon: Tag, label: 'Codes Promo' },
            { href: '/admin/ai', icon: Bot, label: 'Intelligence Artificielle' },
            { href: '/admin/settings', icon: Settings, label: 'Paramètres' },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Button variant="ghost" className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800">
                <item.icon className="mr-3 h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="p-4 space-y-2 border-t border-slate-700">
          {/* Preview as user button */}
          <Button
            onClick={handlePreviewMode}
            className="w-full justify-start bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Eye className="mr-3 h-4 w-4" />
            Voir comme un utilisateur
          </Button>

          <Link href="/dashboard">
            <Button variant="ghost" className="w-full justify-start text-slate-400 hover:text-white">
              <ArrowLeft className="mr-3 h-4 w-4" />
              Retour au dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 bg-gray-50 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
