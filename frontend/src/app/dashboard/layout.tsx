'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Sidebar } from '@/components/layout/sidebar';
import { useAuth } from '@/lib/auth';
import { useProfileCompletion } from '@/lib/hooks/useProfileCompletion';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, hasHydrated, checkAuth, startPeriodicRefresh, stopPeriodicRefresh } = useAuth();
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // Check if user needs to complete their profile
  useProfileCompletion();

  // Check if we're in a sub-dashboard (admin or client) which has its own layout
  const isSubDashboard = pathname?.startsWith('/dashboard/admin') || pathname?.startsWith('/dashboard/client');

  useEffect(() => {
    // Wait for Zustand to hydrate before checking auth
    if (!hasHydrated || sessionStatus === 'loading') {
      return;
    }

    // Check auth status on mount - allow time for AuthSyncManager to sync
    const timer = setTimeout(() => {
      // Check both NextAuth session and Zustand store
      const hasNextAuthSession = sessionStatus === 'authenticated' && session?.user;
      const hasZustandAuth = isAuthenticated && user;

      if (!hasNextAuthSession && !hasZustandAuth) {
        router.replace('/login');
      }
      setIsChecking(false);
    }, 1000); // Increased timeout to 1s to allow auth sync to complete

    return () => clearTimeout(timer);
  }, [user, isAuthenticated, session, sessionStatus, router, hasHydrated]);

  // Periodic refresh: Check auth on mount and start periodic refresh
  useEffect(() => {
    if (isAuthenticated) {
      // Check auth immediately on mount to get fresh user data
      checkAuth();
      // Start periodic refresh (every 5 minutes)
      startPeriodicRefresh();
    }

    // Cleanup: stop periodic refresh when component unmounts
    return () => {
      stopPeriodicRefresh();
    };
  }, [isAuthenticated, checkAuth, startPeriodicRefresh, stopPeriodicRefresh]);

  if (isChecking || sessionStatus === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Allow access if either auth system confirms authentication
  const hasNextAuthSession = sessionStatus === 'authenticated' && session?.user;
  const hasZustandAuth = isAuthenticated && user;

  if (!hasNextAuthSession && !hasZustandAuth) {
    return null;
  }

  // If we're in a sub-dashboard (admin or client), just render children (they have their own layout)
  if (isSubDashboard) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar for desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r lg:border-border">
        <Sidebar />
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative h-full">
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute top-4 right-4 z-10 p-2 text-sidebar-foreground hover:bg-sidebar-accent rounded-lg lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 border-b border-border bg-background">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="p-2"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <div className="flex items-center space-x-2">
            <span className="text-xl font-bold text-primary">XcoinAlgo</span>
          </div>
          <div className="w-10" /> {/* Spacer for centering */}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
