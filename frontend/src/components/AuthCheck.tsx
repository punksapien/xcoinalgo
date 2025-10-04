'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

interface AuthCheckProps {
  children: React.ReactNode;
}

export default function AuthCheck({ children }: AuthCheckProps) {
  const { isAuthenticated, checkAuth } = useAuth();
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
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}