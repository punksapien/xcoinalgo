'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, UserCheck, UserX, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface User {
  id: string;
  email: string;
  role: string;
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

export default function AdminStrategiesPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      const [strategiesRes, usersRes] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/strategies`, {
          headers: { Authorization: authToken }
        }),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
          headers: { Authorization: authToken }
        })
      ]);

      setStrategies(strategiesRes.data.strategies);
      setUsers(usersRes.data.users);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to load strategies');
      console.error('Strategies load error:', err);
    } finally {
      setLoading(false);
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

      loadData();
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

      loadData();
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

      loadData();
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
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Strategy Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage strategies, assignments, and visibility
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

      {/* Strategies Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Strategies ({strategies.length})</CardTitle>
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
                        by {strategy.author} • {strategy.description || 'No description provided'}
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
    </div>
  );
}
