import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/**
 * Custom hook to check if user needs to complete their profile
 * Redirects to /profile/complete if user is authenticated but has no name
 * Uses localStorage to prevent bypassing the completion flow
 */
export function useProfileCompletion() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, hasHydrated } = useAuth();

  useEffect(() => {
    // Only run after hydration
    if (!hasHydrated) return;

    // Skip if not authenticated
    if (!isAuthenticated || !user) return;

    // Skip if already on profile completion page
    if (pathname === '/profile/complete') return;

    // Skip if user already has a name
    if (user.name) {
      // Clear any stale localStorage flag if user has name
      localStorage.removeItem(`profile_incomplete_${user.id}`);
      return;
    }

    // User doesn't have a name - check if they need to complete profile
    const hasCompletedProfile = localStorage.getItem(`profile_complete_${user.id}`);

    // If user doesn't have a name and hasn't completed profile, redirect
    if (!hasCompletedProfile) {
      // Set flag to track that user needs to complete profile
      localStorage.setItem(`profile_incomplete_${user.id}`, 'true');
      router.push('/profile/complete');
    }
  }, [hasHydrated, isAuthenticated, user, pathname, router]);

  return {
    needsProfileCompletion: isAuthenticated && user && !user.name,
  };
}
