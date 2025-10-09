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
  const { login, user, token } = useAuth();
  const syncedRef = useRef(false);

  useEffect(() => {
    // Only sync if we have a NextAuth session but Zustand doesn't have auth yet
    if (status === 'authenticated' && session?.user && !syncedRef.current) {
      const sessionUser = session.user as { id?: string; email?: string; accessToken?: string };
      const accessToken = sessionUser.accessToken;

      // If we have a token from NextAuth and it's different from Zustand, sync it
      if (accessToken && accessToken !== token) {
        console.log('[AuthSync] Syncing NextAuth session to Zustand store');

        login(
          {
            id: sessionUser.id || '',
            email: sessionUser.email || '',
            createdAt: new Date().toISOString(),
          },
          accessToken
        );

        syncedRef.current = true;
      }
    }

    // Reset sync flag if session is gone
    if (status === 'unauthenticated') {
      syncedRef.current = false;
    }
  }, [session, status, login, token, user]);

  // This component doesn't render anything
  return null;
}
