'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Bot,
  Activity,
  CreditCard,
  LogOut,
  BarChart3,
  Moon,
  Sun
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

const navigation = [
  {
    name: 'Ready Bots',
    href: '/dashboard',
    icon: Bot,
  },
  {
    name: 'Deployed & Live',
    href: '/dashboard/deployed',
    icon: Activity,
  },
  {
    name: 'Broker Setup',
    href: '/dashboard/broker',
    icon: CreditCard,
  },
  {
    name: 'Positions & Orders',
    href: '/dashboard/positions',
    icon: BarChart3,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center space-x-2">
          <Bot className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold text-sidebar-foreground">CryptoBot</span>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg transition-all duration-200"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
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
            </div>
          </div>
          <button
            onClick={logout}
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