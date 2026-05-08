'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAuthHeaders } from '@/lib/auth-client';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<any>(null);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        const data = await response.json();
        setHealthData(data);
      }
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Paramètres</h2>
        <p className="text-gray-600 mt-2">
          Configuration et état du système
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>État du système</CardTitle>
          <CardDescription>Vérification des services connectés</CardDescription>
        </CardHeader>
        <CardContent>
          {healthData ? (
            <div className="space-y-3">
              {Object.entries(healthData.services || {}).map(([service, status]: [string, any]) => (
                <div key={service} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="font-medium capitalize">{service.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-2">
                    {status === 'ok' || status === true ? (
                      <>
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="text-green-600 text-sm">Connecté</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        <span className="text-red-600 text-sm">{String(status)}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Impossible de vérifier l&apos;état du système</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Les paramètres sensibles sont gérés via les variables d&apos;environnement du serveur</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-gray-600">
            <p>• <strong>Stripe</strong> : Clés API configurées via variables d&apos;environnement</p>
            <p>• <strong>Service Postal</strong> : URL et clé API configurées via variables d&apos;environnement</p>
            <p>• <strong>Resend</strong> : Clé API configurée via variables d&apos;environnement</p>
            <p>• <strong>Base de données</strong> : Connexion configurée via variables d&apos;environnement</p>
            <p className="mt-4 text-gray-400 italic">
              Pour modifier ces paramètres, contactez l&apos;administrateur système.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
