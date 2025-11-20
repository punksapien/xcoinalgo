'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useAuth } from '@/lib/auth';

/**
 * AuthSyncManager synchronizes NextAuth sessions with Zustand store
 *
 * NextAuth is the source of truth for authentication.
 * This component syncs user data to Zustand for backward compatibility.
 *
 * Note: apiClient now uses NextAuth directly, so this sync is optional
 * but helpful for components still using useAuth() hook.
 */
export function AuthSyncManager() {
  const { data: session, status } = useSession();
  const { login, logout, hasHydrated } = useAuth();
  const lastSyncedTokenRef = useRef<string | null>(null);
  const syncAttemptedRef = useRef(false);

  useEffect(() => {
    // Don't wait for hasHydrated - sync immediately when session is ready
    // This prevents race conditions where pages load before sync completes
    if (status === 'loading') {
      return; // Still loading session from NextAuth
    }

    // User is authenticated - sync to Zustand
    if (status === 'authenticated' && session?.user) {
      const sessionUser = session.user as {
        id?: string;
        email?: string;
        accessToken?: string;
        role?: string;
      };
      const accessToken = sessionUser.accessToken;

      // Skip if no token in session
      if (!accessToken) {
        console.error('[AuthSync] NextAuth session has no accessToken!');
        return;
      }

      // Only sync if token has changed (prevent unnecessary updates)
      if (accessToken !== lastSyncedTokenRef.current) {
        console.log('[AuthSync] Syncing NextAuth session to Zustand');

        // Sync user data and token to Zustand
        login(
          {
            id: sessionUser.id || '',
            email: sessionUser.email || '',
            createdAt: new Date().toISOString(),
            role: sessionUser.role,
          },
          accessToken
        );

        lastSyncedTokenRef.current = accessToken;
        syncAttemptedRef.current = true;
        console.log('[AuthSync] Sync completed');
      }
    }

    // User is not authenticated - clear Zustand
    if (status === 'unauthenticated' && syncAttemptedRef.current) {
      console.log('[AuthSync] Session unauthenticated - clearing Zustand');
      logout();
      lastSyncedTokenRef.current = null;
      syncAttemptedRef.current = false;
    }
  }, [session, status, login, logout, hasHydrated]);

  // This component doesn't render anything
  return null;
}
