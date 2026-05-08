'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, Loader2, Gift, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { register } from '@/lib/auth-client';

function validatePassword(password: string) {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };
}

function isPasswordValid(password: string) {
  const v = validatePassword(password);
  return v.minLength && v.hasUppercase && v.hasNumber;
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordChecks = useMemo(() => validatePassword(password), [password]);
  const passwordTouched = password.length > 0;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }

    if (!isPasswordValid(password)) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, firstName, lastName);
      toast.success('Compte créé ! Vous recevez 10 crédits gratuits 🎉');
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'inscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <Link href="/" className="flex items-center justify-center mb-4">
            <Building2 className="h-12 w-12 text-primary" />
          </Link>
          <CardTitle className="text-2xl text-center">Créer un compte</CardTitle>
          <CardDescription className="text-center">
            <Badge variant="secondary" className="mt-2">
              <Gift className="h-3 w-3 mr-1" />
              10 crédits offerts + 10 recherches/mois gratuites
            </Badge>
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input
                  id="firstName"
                  placeholder="Jean"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input
                  id="lastName"
                  placeholder="Dupont"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email professionnel</Label>
              <Input
                id="email"
                type="email"
                placeholder="jean@monagence.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              {passwordTouched && (
                <div className="space-y-1 mt-2">
                  {[
                    { ok: passwordChecks.minLength, label: 'Au moins 8 caractères' },
                    { ok: passwordChecks.hasUppercase, label: 'Au moins une majuscule' },
                    { ok: passwordChecks.hasNumber, label: 'Au moins un chiffre' },
                  ].map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {rule.ok ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <X className="h-3 w-3 text-red-400" />
                      )}
                      <span className={rule.ok ? 'text-green-600' : 'text-muted-foreground'}>
                        {rule.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création...
                </>
              ) : (
                'Créer mon compte gratuitement'
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              En créant un compte, vous acceptez nos{' '}
              <Link href="/cgu" className="text-primary hover:underline">conditions d&apos;utilisation</Link>
              {' '}et notre{' '}
              <Link href="/confidentialite" className="text-primary hover:underline">politique de confidentialité</Link>.
            </p>
            <div className="text-sm text-center text-muted-foreground">
              Déjà un compte ?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Se connecter
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
