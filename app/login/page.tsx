import AuthCard from '@/features/shell/components/auth-card';

/**
 * Route: login page (email + password via Supabase Auth).
 * @returns The login card.
 */
export default function Page() {
  return <AuthCard mode="login" />;
}
