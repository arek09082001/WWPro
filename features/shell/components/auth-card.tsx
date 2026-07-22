'use client';

/**
 * Shared login/registration card for the NextAuth credentials flow:
 * email + password with bcrypt-hashed storage, German labels, error display
 * and a link to the sibling page.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Props of {@link AuthCard}. */
interface AuthCardProps {
  mode: 'login' | 'register';
}

/**
 * Renders the auth card for login or registration.
 * @param props - AuthCardProps containing the mode.
 * @param props.mode - 'login' renders sign-in, 'register' renders sign-up.
 * @returns A JSX element with the centered auth form.
 */
export default function AuthCard({ mode }: AuthCardProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isLogin = mode === 'login';

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (!isLogin) {
        await api('/api/register', { method: 'POST', json: { email, password, name } });
      }
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError('E-Mail oder Passwort ist falsch.');
        return;
      }
      router.push('/projects');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Es ist ein Fehler aufgetreten.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm gap-5 p-7">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            W
          </span>
          <div>
            <h1 className="font-heading text-lg font-semibold">WWPro</h1>
            <p className="text-sm text-muted-foreground">
              {isLogin ? 'Melde dich an, um weiterzuplanen.' : 'Erstelle dein Konto — E-Mail und Passwort genügen.'}
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          {!isLogin && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">Name</Label>
              <Input
                id="auth-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">E-Mail</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Passwort</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {isLogin ? 'Anmelden' : 'Registrieren'}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? (
            <>
              Noch kein Konto?{' '}
              <Link href="/register" className="font-medium text-foreground underline">
                Registrieren
              </Link>
            </>
          ) : (
            <>
              Bereits registriert?{' '}
              <Link href="/login" className="font-medium text-foreground underline">
                Anmelden
              </Link>
            </>
          )}
        </p>
      </Card>
    </div>
  );
}
