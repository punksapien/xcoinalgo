'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Users, TrendingUp, Activity, Bell, UserCheck, UserX, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  strategiesOwned: number;
  subscriptions: number;
}

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string;
  author: string;
  isPublic: boolean;
  isActive: boolean;
  client: {
    id: string;
    email: string;
  } | null;
  subscriberCount: number;
  activeInviteLinks: number;
  pendingRequests: number;
  createdAt: string;
}

interface AccessRequest {
  id: string;
  strategy: {
    id: string;
    name: string;
    code: string;
  };
  user: {
    id: string;
    email: string;
    createdAt: string;
  };
  inviteCode: string;
  status: string;
  requestedAt: string;
}

interface PlatformStats {
  totalUsers: number;
  totalStrategies: number;
  totalDeployments: number;
  pendingRequests: number;
  usersByRole: Record<string, number>;
}

export default function AdminDashboard() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [token]);

  const loadDashboardData = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      const [statsRes, usersRes, strategiesRes, requestsRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/stats`, {
          headers: { Authorization: authToken }
        }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
          headers: { Authorization: authToken }
        }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/strategies`, {
          headers: { Authorization: authToken }
        }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/access-requests`, {
          headers: { Authorization: authToken }
        })
      ]);

      setStats(statsRes.data);
      setUsers(usersRes.data.users);
      setStrategies(strategiesRes.data.strategies);
      setAccessRequests(requestsRes.data.requests);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to load dashboard data');
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!token) return;

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/role`,
        { role: newRole },
        { headers: { Authorization: authToken } }
      );

      // Reload users
      loadDashboardData();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to update user role');
    }
  };

  const assignStrategy = async (strategyId: string, clientId: string) => {
    if (!token) return;

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/strategies/${strategyId}/assign`,
        { clientId },
        { headers: { Authorization: authToken } }
      );

      // Reload strategies
      loadDashboardData();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to assign strategy');
    }
  };

  const unassignStrategy = async (strategyId: string) => {
    if (!token) return;

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/strategies/${strategyId}/unassign`,
        { headers: { Authorization: authToken } }
      );

      // Reload strategies
      loadDashboardData();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to unassign strategy');
    }
  };

  const deleteStrategy = async (strategyId: string, strategyName: string) => {
    if (!token) return;

    const confirmed = confirm(`Are you sure you want to delete "${strategyName}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/strategies/${strategyId}`,
        { headers: { Authorization: authToken } }
      );

      // Reload strategies
      loadDashboardData();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to delete strategy');
    }
  };

  if (loading) {
    return (
      <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform-wide management and analytics
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Platform Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Users
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all roles
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Strategies
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stats.totalStrategies}</div>
              <p className="text-xs text-muted-foreground mt-1">
                In the platform
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Deployments
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stats.totalDeployments}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Currently running
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Requests
              </CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stats.pendingRequests}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Awaiting approval
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users Section */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Users</CardTitle>
          <CardDescription>Manage user roles and permissions</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No users found in the platform.
            </p>
          ) : (
            <div className="space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-foreground">{user.email}</p>
                      <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Strategies: {user.strategiesOwned} • Subscriptions: {user.subscriptions}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <select
                      className="px-3 py-1.5 text-sm border border-border rounded-md bg-background"
                      value={user.role}
                      onChange={(e) => updateUserRole(user.id, e.target.value)}
                    >
                      <option value="REGULAR">REGULAR</option>
                      <option value="QUANT">QUANT</option>
                      <option value="CLIENT">CLIENT</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategies Section */}
      <Card>
        <CardHeader>
          <CardTitle>All Strategies</CardTitle>
          <CardDescription>Assign strategies to clients and manage visibility</CardDescription>
        </CardHeader>
        <CardContent>
          {strategies.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No strategies found. Contact your quant team to upload strategies.
            </p>
          ) : (
            <div className="space-y-4">
              {strategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className="flex flex-col gap-3 p-4 border border-border rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-foreground">{strategy.name}</h3>
                        <Badge variant="outline">{strategy.code}</Badge>
                        <Badge variant={strategy.isPublic ? 'default' : 'secondary'}>
                          {strategy.isPublic ? 'Public' : 'Private'}
                        </Badge>
                        <Badge
                          variant={strategy.isActive ? 'default' : 'secondary'}
                          className={strategy.isActive ? 'bg-green-600' : 'bg-gray-500'}
                        >
                          {strategy.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {strategy.description || 'No description provided'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Subscribers: {strategy.subscriberCount} • Pending: {strategy.pendingRequests}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteStrategy(strategy.id, strategy.name)}
                      disabled={strategy.subscriberCount > 0}
                      title={strategy.subscriberCount > 0 ? 'Cannot delete strategy with active subscribers' : 'Delete strategy'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-border">
                    {strategy.client ? (
                      <div className="flex items-center gap-3">
                        <UserCheck className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-muted-foreground">
                          Assigned to: <span className="font-medium text-foreground">{strategy.client.email}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => unassignStrategy(strategy.id)}
                        >
                          <UserX className="h-3 w-3 mr-1" />
                          Unassign
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <UserX className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Not assigned to any client</span>
                        <select
                          className="px-3 py-1.5 text-sm border border-border rounded-md bg-background"
                          onChange={(e) => {
                            if (e.target.value) {
                              assignStrategy(strategy.id, e.target.value);
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="">Assign to client...</option>
                          {users
                            .filter((u) => u.role === 'CLIENT' || u.role === 'ADMIN')
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.email}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Access Requests Section */}
      {accessRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Access Requests</CardTitle>
            <CardDescription>Strategy access requests awaiting approval</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {accessRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div>
                    <p className="font-medium text-foreground">{request.user.email}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Requesting access to: <span className="font-medium">{request.strategy.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Via invite code: {request.inviteCode}
                    </p>
                  </div>
                  <Badge variant="outline">Pending</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
