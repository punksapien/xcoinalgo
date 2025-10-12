'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAuth } from '@/lib/auth';

/**
 * AuthSyncManager bridges NextAuth sessions with the Zustand auth store.
 * After Google OAuth completes, this syncs the token and user data to Zustand.
 */
export function AuthSyncManager() {
  const { data: session, status } = useSession();
  const { login, token, hasHydrated } = useAuth();
  const [syncAttempted, setSyncAttempted] = useState(false);

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

      // Sync if we have a token from NextAuth and Zustand is empty or has different token
      if (accessToken && accessToken !== token && !syncAttempted) {
        console.log('[AuthSync] Syncing NextAuth session to Zustand store', {
          hasNextAuthToken: !!accessToken,
          hasZustandToken: !!token,
          tokensMatch: accessToken === token
        });

        login(
          {
            id: sessionUser.id || '',
            email: sessionUser.email || '',
            createdAt: new Date().toISOString(),
          },
          accessToken
        );

        setSyncAttempted(true);
        console.log('[AuthSync] Sync completed successfully');
      } else if (accessToken === token && token) {
        console.log('[AuthSync] Tokens already in sync');
      }
    }

    // Reset sync flag if session is gone
    if (status === 'unauthenticated') {
      console.log('[AuthSync] Session unauthenticated, resetting sync state');
      setSyncAttempted(false);
    }
  }, [session, status, login, token, hasHydrated, syncAttempted]);

  // This component doesn't render anything
  return null;
}
