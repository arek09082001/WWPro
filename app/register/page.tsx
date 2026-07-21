import AuthCard from '@/features/shell/components/auth-card';

/**
 * Route: registration page (email + password via Supabase Auth).
 * @returns The registration card.
 */
export default function Page() {
  return <AuthCard mode="register" />;
}
