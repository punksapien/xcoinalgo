'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

interface AuthCheckProps {
  children: React.ReactNode;
}

export default function AuthCheck({ children }: AuthCheckProps) {
  const { isAuthenticated, checkAuth, startPeriodicRefresh, stopPeriodicRefresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const initAuth = async () => {
      await checkAuth();
    };
    initAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    } else {
      // Start periodic refresh when authenticated
      startPeriodicRefresh();
    }

    // Cleanup: stop periodic refresh when component unmounts
    return () => {
      stopPeriodicRefresh();
    };
  }, [isAuthenticated, router, startPeriodicRefresh, stopPeriodicRefresh]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}