'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { showErrorToast } from '@/lib/toast-utils';

/**
 * Role guard hook to protect pages that require specific user roles
 *
 * @param requiredRole - The role required to access the page (e.g., 'QUANT')
 * @returns Object with isAuthorized boolean and isChecking boolean
 *
 * @example
 * ```tsx
 * function QuantOnlyPage() {
 *   const { isAuthorized, isChecking } = useRoleGuard('QUANT');
 *
 *   if (isChecking) return <div>Loading...</div>;
 *   if (!isAuthorized) return null; // Will redirect
 *
 *   return <div>Protected content</div>;
 * }
 * ```
 */
export function useRoleGuard(requiredRole: string) {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated, isQuant } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Wait for Zustand to hydrate from localStorage
    if (!hasHydrated) {
      return;
    }

    // If not authenticated, redirect to login
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Check if user has the required role
    let authorized = false;

    if (requiredRole === 'QUANT') {
      authorized = isQuant();
    } else {
      // For other roles, check user.role directly
      authorized = user?.role === requiredRole;
    }

    if (!authorized) {
      showErrorToast(
        'Access Denied',
        `You need ${requiredRole.toLowerCase()} access to view this page.`
      );
      router.push('/dashboard');
      setIsAuthorized(false);
    } else {
      setIsAuthorized(true);
    }

    setIsChecking(false);
  }, [hasHydrated, isAuthenticated, user, requiredRole, router, isQuant]);

  return { isAuthorized, isChecking };
}
