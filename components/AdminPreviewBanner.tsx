'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCachedUser, isAdminPreviewMode, setAdminPreviewMode } from '@/lib/auth-client';

export default function AdminPreviewBanner() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const check = () => {
      const user = getCachedUser();
      setVisible(!!user?.is_admin && isAdminPreviewMode());
    };

    check();

    // Listen for preview mode changes
    const handler = () => check();
    window.addEventListener('admin-preview-change', handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener('admin-preview-change', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  if (!visible) return null;

  const handleExitPreview = () => {
    setAdminPreviewMode(false);
    router.push('/admin');
  };

  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 flex items-center justify-between z-50 relative shadow-md">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Eye className="h-4 w-4" />
        <span>Mode Aperçu Admin</span>
        <span className="hidden sm:inline text-amber-100">— Vous voyez l&apos;application comme un utilisateur</span>
        <span className="hidden md:inline text-amber-100">• Crédits illimités</span>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="bg-white/20 hover:bg-white/30 text-white border-white/30 text-xs"
        onClick={handleExitPreview}
      >
        <ArrowLeft className="mr-1 h-3 w-3" />
        Retour Admin
      </Button>
    </div>
  );
}
