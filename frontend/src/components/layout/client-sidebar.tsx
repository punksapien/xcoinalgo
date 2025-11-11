'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  TrendingUp,
  Link2,
  Bell,
  Moon,
  Sun,
  LogOut
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

const navigation = [
  {
    name: 'Overview',
    href: '/client',
    icon: LayoutDashboard,
  },
  {
    name: 'My Strategies',
    href: '/client/strategies',
    icon: TrendingUp,
  },
  {
    name: 'Invite Links',
    href: '/client/invites',
    icon: Link2,
  },
  {
    name: 'Access Requests',
    href: '/client/requests',
    icon: Bell,
  },
];

interface ClientSidebarProps {
  onNavigate?: () => void;
}

export function ClientSidebar({ onNavigate }: ClientSidebarProps = {}) {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const handleLogout = async () => {
    await logout();
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <div>
            <span className="text-lg font-bold text-sidebar-foreground">Client Panel</span>
            <p className="text-xs text-muted-foreground">Strategy Management</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-all duration-200"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'sidebar-item flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="space-y-3">
          {/* Go to Main Dashboard */}
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-sidebar-foreground/80 bg-sidebar-accent hover:bg-primary/20 hover:text-primary rounded-lg transition-all duration-200"
            title="Back to main dashboard"
          >
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Go to Main Dashboard
          </Link>

          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {user?.email}
              </p>
              <p className="text-xs text-muted-foreground">Client</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-sidebar-foreground/80 bg-sidebar-accent hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400 rounded-lg transition-all duration-200"
            title="Sign out"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
