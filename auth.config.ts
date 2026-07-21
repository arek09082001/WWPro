/**
 * Edge-safe NextAuth configuration shared by the middleware and the full
 * server config: JWT sessions, German login page and the route-authorization
 * rule (everything requires login except the auth pages and auth APIs).
 */

import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? 'wwpro-dev-secret-nur-lokal',
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);
      const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
      const isAuthApi = pathname.startsWith('/api/auth') || pathname === '/api/register';
      if (isAuthApi) return true;
      if (isAuthPage) {
        if (isLoggedIn) return Response.redirect(new URL('/projects', request.nextUrl));
        return true;
      }
      return isLoggedIn;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
