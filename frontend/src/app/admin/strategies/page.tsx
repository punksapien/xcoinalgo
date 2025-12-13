'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import axios from 'axios';
import { StrategySubscribersModal } from '@/components/admin/strategy-subscribers-modal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, UserCheck, UserX, Trash2, Edit, Settings, Save, X, RefreshCw, Power } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

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
  executionConfig?: {
    minMargin?: number;
  };
}

interface Subscriber {
  id: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  settings: {
    capital: number;
    riskPerTrade: number | null;
    leverage: number | null;
    maxPositions: number | null;
    maxDailyLoss: number | null;
  };
  effectiveSettings: {
    riskPerTrade: number;
    leverage: number;
    maxPositions: number;
    maxDailyLoss: number;
  };
  usingDefaults: {
    riskPerTrade: boolean;
    leverage: boolean;
    maxPositions: boolean;
    maxDailyLoss: boolean;
  };
  tradingType: string;
  marginCurrency: string;
  isPaused: boolean;
  subscribedAt: string;
  stats: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnl: number;
  };
}

interface SubscriberData {
  strategy: {
    id: string;
    name: string;
    defaults: {
      riskPerTrade: number;
      leverage: number;
      maxPositions: number;
      maxDailyLoss: number;
    };
  };
  subscribers: Subscriber[];
  count: number;
}

export default function AdminStrategiesPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    code: '',
    description: '',
    author: '',
    minMargin: ''
  });

  // Subscriber management modal state
  const [subscribersModalOpen, setSubscribersModalOpen] = useState(false);
  const [selectedStrategyForSubscribers, setSelectedStrategyForSubscribers] = useState<Strategy | null>(null);

  // Calculate pagination
  const totalPages = Math.ceil(strategies.length / itemsPerPage);
  const paginatedStrategies = strategies.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users?limit=1000`, {
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

  const forceExitAllPositions = async (strategyId: string, strategyName: string, subscriberCount: number) => {
    if (!token) return;

    if (subscriberCount === 0) {
      toast.warning('No subscribers to force exit');
      return;
    }

    const confirmed = confirm(
      `⚠️ EMERGENCY: Force close ALL positions for ${subscriberCount} subscribers of "${strategyName}"?\n\nThis will:\n- Exit all open positions on the exchange\n- Pause all subscriptions\n\nAre you absolutely sure?`
    );
    if (!confirmed) return;

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/positions/force-close-all`,
        { strategyId, pauseStrategy: true },
        { headers: { Authorization: authToken } }
      );

      const { successfulClosures, failedClosures, totalSubscriptions } = response.data;

      if (successfulClosures > 0) {
        toast.success(`✅ Successfully closed positions for ${successfulClosures}/${totalSubscriptions} subscribers`);
      }

      if (failedClosures > 0) {
        toast.warning(`⚠️ Failed to close positions for ${failedClosures} subscribers`);
      }

      loadData();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error?.response?.data?.error || 'Failed to force close positions');
    }
  };

  const openEditModal = (strategy: Strategy) => {
    setEditingStrategy(strategy);
    setEditForm({
      name: strategy.name,
      code: strategy.code,
      description: strategy.description || '',
      author: strategy.author,
      minMargin: strategy.executionConfig?.minMargin?.toString() || '10000'
    });
    setEditModalOpen(true);
  };

  const updateStrategy = async () => {
    if (!token || !editingStrategy) return;

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      console.log('[Admin] Updating strategy:', {
        strategyId: editingStrategy.id,
        payload: editForm
      });

      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/strategies/${editingStrategy.id}`,
        editForm,
        { headers: { Authorization: authToken } }
      );

      console.log('[Admin] Update response:', response.data);

      // Invalidate strategy cache to force refresh on dashboard
      const { strategyService } = await import('@/lib/strategy-service');
      strategyService.invalidateCache();

      setEditModalOpen(false);
      setEditingStrategy(null);
      loadData();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      console.error('[Admin] Update failed:', error);
      setError(error?.response?.data?.error || 'Failed to update strategy');
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
          <CardDescription>
            Assign strategies to clients and manage visibility (Page {currentPage} of {totalPages || 1})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {strategies.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No strategies found. Contact your quant team to upload strategies.
            </p>
          ) : (
            <div className="space-y-4">
              {paginatedStrategies.map((strategy) => (
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
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedStrategyForSubscribers(strategy);
                          setSubscribersModalOpen(true);
                        }}
                        title="Manage subscribers"
                        disabled={strategy.subscriberCount === 0}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => forceExitAllPositions(strategy.id, strategy.name, strategy.subscriberCount)}
                        title="Force close all positions for all subscribers"
                        disabled={strategy.subscriberCount === 0}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditModal(strategy)}
                        title="Edit strategy metadata"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
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

              {/* Pagination */}
              {strategies.length > itemsPerPage && (
                <Pagination className="mt-6">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage(currentPage - 1);
                        }}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage(page);
                              }}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }
                      if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }
                      return null;
                    })}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                        }}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Strategy Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Edit Strategy</DialogTitle>
            <DialogDescription>
              Update strategy metadata. These changes will be reflected on the marketplace cards.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Strategy Name</Label>
              <Input
                id="name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="e.g., ETH Scalper by Manish"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="code">Strategy Code</Label>
              <Input
                id="code"
                value={editForm.code}
                onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                placeholder="e.g., ETH_SCALPER_BY_MANISH_V1"
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="author">Author Name</Label>
              <Input
                id="author"
                value={editForm.author}
                onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                placeholder="e.g., Manish"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Brief description of the strategy..."
                rows={3}
              />
            </div>

            {/* Execution Config Section */}
            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-semibold mb-3">Minimum Margin Configuration</h4>
              <div className="grid gap-2">
                <Label htmlFor="minMargin">Minimum Margin (₹)</Label>
                <Input
                  id="minMargin"
                  type="number"
                  value={editForm.minMargin}
                  onChange={(e) => setEditForm({ ...editForm, minMargin: e.target.value })}
                  placeholder="e.g., 10000"
                  min="1000"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum investment amount required to subscribe to this strategy
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={updateStrategy}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscriber Management Modal */}
      {selectedStrategyForSubscribers && token && (
        <StrategySubscribersModal
          open={subscribersModalOpen}
          onClose={() => {
            setSubscribersModalOpen(false);
            setSelectedStrategyForSubscribers(null);
            // Reload data to refresh subscriber counts
            loadData();
          }}
          strategyId={selectedStrategyForSubscribers.id}
          strategyName={selectedStrategyForSubscribers.name}
          token={token}
        />
      )}
    </div>
  );
}
