'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  Bot,
  Activity,
  CreditCard,
  LogOut,
  BarChart3,
  Moon,
  Sun,
  TrendingUp,
  LayoutDashboard,
  Shield,
  Code2,
  User as UserIcon,
  ChevronDown,
  Lock
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navigation = [
  {
    name: 'Ready Bots',
    href: '/dashboard',
    icon: Bot,
  },
  {
    name: 'Deployed & Live',
    href: '/dashboard/subscriptions',
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
  {
    name: 'My Access Requests',
    href: '/dashboard/access-requests',
    icon: Lock,
  },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user, hasClientAccess, isAdmin, hasQuantAccess } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const handleLogout = async () => {
    // Clear Zustand state (will also try to call backend logout endpoint)
    await logout();
    // Clear NextAuth session
    await signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center space-x-2">
          <TrendingUp className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold text-sidebar-foreground">XcoinAlgo</span>
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
          {/* Admin Dashboard Button - Only show for ADMIN users */}
          {isAdmin() && (
            <Link
              href="/admin"
              onClick={onNavigate}
              className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all duration-200"
              title="Platform management and analytics"
            >
              <Shield className="h-4 w-4 mr-2" />
              Go to Admin Dashboard
            </Link>
          )}

          {/* Client Dashboard Button - Only show for CLIENT or ADMIN users */}
          {hasClientAccess() && (
            <Link
              href="/client"
              onClick={onNavigate}
              className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-sidebar-foreground/80 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-all duration-200"
              title="Manage your strategies and access requests"
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Go to Client Dashboard
            </Link>
          )}

          {/* Quant Dashboard Button - Only show for QUANT or ADMIN users */}
          {hasQuantAccess() && (
            <Link
              href="/strategies"
              onClick={onNavigate}
              className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all duration-200"
              title="Upload and manage trading strategies"
            >
              <Code2 className="h-4 w-4 mr-2" />
              Go to Quant Dashboard
            </Link>
          )}

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full outline-none focus:outline-none">
              <div className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-all duration-200 cursor-pointer">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.image} alt={user?.name || user?.email} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user?.name ? user.name.charAt(0).toUpperCase() : user?.email?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">
                    {user?.name || user?.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-sidebar-foreground/60 truncate">
                    {user?.email}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-sidebar-foreground/60" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              sideOffset={5}
            >
              <DropdownMenuItem
                onClick={() => {
                  router.push('/dashboard');
                  onNavigate?.();
                }}
                className="cursor-pointer"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  router.push('/dashboard/settings/profile');
                  onNavigate?.();
                }}
                className="cursor-pointer"
              >
                <UserIcon className="h-4 w-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}