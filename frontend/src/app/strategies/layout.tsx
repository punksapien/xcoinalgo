'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { QuantSidebar } from '@/components/layout/quant-sidebar';
import { useAuth } from '@/lib/auth';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function QuantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, hasHydrated, isQuant, checkAuth } = useAuth();
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!hasHydrated || sessionStatus === 'loading') {
      return;
    }

    const checkQuantAccess = async () => {
      const hasNextAuthSession = sessionStatus === 'authenticated' && session?.user;
      const hasZustandAuth = isAuthenticated && user;

      // Check if user is authenticated
      if (!hasNextAuthSession && !hasZustandAuth) {
        router.replace('/login');
        return;
      }

      // Refresh user data from backend to ensure we have latest role info
      await checkAuth();

      // Wait a bit for checkAuth to complete and state to update
      setTimeout(() => {
        // Check if user has QUANT role
        if (!isQuant()) {
          // Not a quant, redirect to dashboard
          router.replace('/dashboard');
          return;
        }

        setIsChecking(false);
      }, 500);
    };

    checkQuantAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, sessionStatus]);

  if (isChecking || sessionStatus === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const hasNextAuthSession = sessionStatus === 'authenticated' && session?.user;
  const hasZustandAuth = isAuthenticated && user;

  if (!hasNextAuthSession && !hasZustandAuth) {
    return null;
  }

  if (!isQuant()) {
    return null;
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
        <QuantSidebar />
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
          <QuantSidebar onNavigate={() => setSidebarOpen(false)} />
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
            <span className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">Quant Panel</span>
          </div>
          <div className="w-10" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
