/**
 * Full NextAuth setup (Node runtime): credentials provider with bcrypt
 * password verification against the app's user store.
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from '@/auth.config';
import { getStore } from '@/lib/store';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      /**
       * Verifies email + password against the stored bcrypt hash.
       * @param credentials - Raw form values from the login request.
       * @returns The session user or null on invalid credentials.
       */
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').trim().toLowerCase();
        const password = String(credentials?.password ?? '');
        if (!email || !password) return null;
        const user = await getStore().getUserByEmail(email);
        if (!user) return null;
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
