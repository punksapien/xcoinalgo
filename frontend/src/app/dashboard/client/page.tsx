'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  LayoutDashboard,
  Settings,
  Users,
  Link as LinkIcon,
  AlertCircle,
  Loader2,
  Package,
  UserCheck
} from 'lucide-react';
import axios from 'axios';

interface ClientStats {
  totalStrategies: number;
  publicStrategies: number;
  privateStrategies: number;
  totalSubscribers: number;
  pendingRequests: number;
  activeInviteLinks: number;
}

interface Strategy {
  id: string;
  name: string;
  isPublic: boolean;
  subscriberCount: number;
  activeInviteLinks?: number;
}

export default function ClientDashboardPage() {
  const router = useRouter();
  const { user, hasClientAccess } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<ClientStats>({
    totalStrategies: 0,
    publicStrategies: 0,
    privateStrategies: 0,
    totalSubscribers: 0,
    pendingRequests: 0,
    activeInviteLinks: 0
  });
  const [strategies, setStrategies] = useState<Strategy[]>([]);

  useEffect(() => {
    // Check if user has client access
    if (!hasClientAccess()) {
      router.replace('/dashboard');
      return;
    }

    loadDashboardData();
  }, [hasClientAccess, router]);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      // Fetch strategies and access requests
      const [strategiesRes, requestsRes] = await Promise.all([
        axios.get('/api/client/strategies', {
          headers: { Authorization: `Bearer ${authToken}` }
        }),
        axios.get('/api/client/access-requests', {
          headers: { Authorization: `Bearer ${authToken}` }
        })
      ]);

      const strategiesData = strategiesRes.data.strategies || [];
      const requestsData = requestsRes.data.requests || [];

      setStrategies(strategiesData);

      // Calculate stats
      const totalStrategies = strategiesData.length;
      const publicStrategies = strategiesData.filter((s: { isPublic: boolean }) => s.isPublic).length;
      const privateStrategies = totalStrategies - publicStrategies;
      const totalSubscribers = strategiesData.reduce((sum: number, s: { subscriberCount?: number }) => sum + (s.subscriberCount || 0), 0);
      const pendingRequests = requestsData.length;
      const activeInviteLinks = strategiesData.reduce((sum: number, s: { activeInviteLinks?: number }) => sum + (s.activeInviteLinks || 0), 0);

      setStats({
        totalStrategies,
        publicStrategies,
        privateStrategies,
        totalSubscribers,
        pendingRequests,
        activeInviteLinks
      });

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load dashboard data');
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Client Dashboard
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage your strategies, invite links, and access requests
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Strategies</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalStrategies}</div>
              <p className="text-xs text-muted-foreground">
                {stats.publicStrategies} public, {stats.privateStrategies} private
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Subscribers</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSubscribers}</div>
              <p className="text-xs text-muted-foreground">
                Across all strategies
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingRequests}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting your approval
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Invite Links</CardTitle>
              <LinkIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeInviteLinks}</div>
              <p className="text-xs text-muted-foreground">
                For private strategies
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Manage Strategies</CardTitle>
              <CardDescription>
                View and manage your strategies, toggle visibility, and generate invite links
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {strategies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No strategies found. Contact your quant team to upload strategies to your account.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {strategies.slice(0, 3).map((strategy) => (
                        <div key={strategy.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{strategy.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {strategy.isPublic ? 'Public' : 'Private'} • {strategy.subscriberCount} subscribers
                            </p>
                          </div>
                          <Link href={`/dashboard/client/strategies/${strategy.id}`}>
                            <Button variant="ghost" size="sm">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                    {strategies.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{strategies.length - 3} more strategies
                      </p>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access Requests</CardTitle>
              <CardDescription>
                Review and approve access requests for your private strategies
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats.pendingRequests > 0 ? (
                <div className="space-y-4">
                  <p className="text-sm">
                    You have {stats.pendingRequests} pending access request{stats.pendingRequests !== 1 ? 's' : ''} waiting for your review.
                  </p>
                  <Link href="/dashboard/client/requests">
                    <Button className="w-full">
                      Review Requests
                    </Button>
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No pending access requests at the moment.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
