'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useAuth } from '@/lib/auth';

/**
 * AuthSyncManager bridges NextAuth sessions with the Zustand auth store.
 * After Google OAuth completes, this syncs the token and user data to Zustand.
 */
export function AuthSyncManager() {
  const { data: session, status } = useSession();
  const { login, token, hasHydrated } = useAuth();
  const lastSyncedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    // Wait for both NextAuth and Zustand to be ready
    if (status === 'loading' || !hasHydrated) {
      console.log('[AuthSync] Waiting for initialization...', { status, hasHydrated });
      return;
    }

    // If user is authenticated with NextAuth but Zustand doesn't have token
    if (status === 'authenticated' && session?.user) {
      const sessionUser = session.user as { id?: string; email?: string; accessToken?: string };
      const accessToken = sessionUser.accessToken;

      // Log token comparison details (first 20 chars only for security)
      console.log('[AuthSync] Token comparison:', {
        nextAuthToken: accessToken ? `${accessToken.substring(0, 20)}...` : 'null',
        zustandToken: token ? `${token.substring(0, 20)}...` : 'null',
        lastSyncedToken: lastSyncedTokenRef.current ? `${lastSyncedTokenRef.current.substring(0, 20)}...` : 'null',
        tokensMatch: accessToken === token,
        willSync: !!(accessToken && accessToken !== token && accessToken !== lastSyncedTokenRef.current)
      });

      // Sync if:
      // 1. We have a NextAuth token
      // 2. AND it's different from Zustand token
      // 3. AND we haven't already synced this exact token (prevent loops)
      if (accessToken && accessToken !== token && accessToken !== lastSyncedTokenRef.current) {
        console.log('[AuthSync] Syncing NextAuth session to Zustand store - tokens differ or Zustand is empty');

        login(
          {
            id: sessionUser.id || '',
            email: sessionUser.email || '',
            createdAt: new Date().toISOString(),
          },
          accessToken
        );

        lastSyncedTokenRef.current = accessToken;
        console.log('[AuthSync] Sync completed successfully');
      } else if (accessToken && accessToken === token) {
        console.log('[AuthSync] Tokens already in sync - no action needed');
        lastSyncedTokenRef.current = accessToken;
      } else if (!accessToken) {
        console.warn('[AuthSync] NextAuth session has no accessToken!');
      }
    }

    // Reset sync tracking if session is gone
    if (status === 'unauthenticated') {
      console.log('[AuthSync] Session unauthenticated, resetting sync state');
      lastSyncedTokenRef.current = null;
    }
  }, [session, status, login, token, hasHydrated]);

  // This component doesn't render anything
  return null;
}
