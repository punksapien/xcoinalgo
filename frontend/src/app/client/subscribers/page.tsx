'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  AlertCircle,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Settings,
  Search,
  Filter
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface Subscriber {
  id: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    createdAt: string;
  };
  strategy: {
    id: string;
    name: string;
    code: string;
    isPublic: boolean;
  };
  capital: number;
  riskPerTrade: number;
  leverage: number;
  maxPositions: number;
  maxDailyLoss: number;
  tradingType: string;
  marginCurrency: string;
  isActive: boolean;
  isPaused: boolean;
  subscribedAt: string;
  pausedAt: string | null;
  unsubscribedAt: string | null;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  winRate: number;
}

interface Strategy {
  id: string;
  name: string;
}

export default function SubscribersPage() {
  const router = useRouter();
  const { hasClientAccess } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStrategy, setFilterStrategy] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null);
  const [editForm, setEditForm] = useState({
    capital: '',
    riskPerTrade: '',
    leverage: '',
    maxPositions: '',
    maxDailyLoss: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!hasClientAccess()) {
      router.replace('/dashboard');
      return;
    }

    loadData();
  }, [hasClientAccess, router, filterStrategy, filterStatus]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      // Build query params
      const params = new URLSearchParams();
      if (filterStrategy !== 'all') params.append('strategyId', filterStrategy);
      if (filterStatus !== 'all') params.append('status', filterStatus);

      // Fetch subscribers and strategies in parallel
      const [subscribersRes, strategiesRes] = await Promise.all([
        axios.get(`/api/client/subscribers?${params.toString()}`, {
          headers: { Authorization: `Bearer ${authToken}` }
        }),
        axios.get('/api/client/strategies', {
          headers: { Authorization: `Bearer ${authToken}` }
        })
      ]);

      setSubscribers(subscribersRes.data.subscribers || []);
      setStrategies(strategiesRes.data.strategies || []);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load subscribers:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load subscribers');
      setIsLoading(false);
    }
  };

  const openEditDialog = (subscriber: Subscriber) => {
    setSelectedSubscriber(subscriber);
    setEditForm({
      capital: subscriber.capital.toString(),
      riskPerTrade: (subscriber.riskPerTrade * 100).toString(),
      leverage: subscriber.leverage.toString(),
      maxPositions: subscriber.maxPositions.toString(),
      maxDailyLoss: (subscriber.maxDailyLoss * 100).toString()
    });
    setEditDialogOpen(true);
  };

  const saveParameters = async () => {
    if (!selectedSubscriber) return;

    try {
      setIsSaving(true);

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      await axios.put(
        `/api/client/subscribers/${selectedSubscriber.id}/parameters`,
        {
          capital: parseFloat(editForm.capital),
          riskPerTrade: parseFloat(editForm.riskPerTrade) / 100,
          leverage: parseInt(editForm.leverage),
          maxPositions: parseInt(editForm.maxPositions),
          maxDailyLoss: parseFloat(editForm.maxDailyLoss) / 100
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      toast.success('Parameters updated successfully');
      setEditDialogOpen(false);
      loadData(); // Reload data
      setIsSaving(false);
    } catch (err) {
      console.error('Failed to update parameters:', err);
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to update parameters');
      setIsSaving(false);
    }
  };

  const filteredSubscribers = subscribers.filter(sub => {
    const matchesSearch =
      sub.user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.strategy.name.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  const getStatusBadge = (subscriber: Subscriber) => {
    if (!subscriber.isActive) {
      return <Badge variant="destructive">Inactive</Badge>;
    }
    if (subscriber.isPaused) {
      return <Badge variant="secondary">Paused</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  const formatCurrency = (value: number, currency: string = 'INR') => {
    const symbol = currency === 'USDT' ? '$' : '₹';
    return `${symbol}${value.toLocaleString()}`;
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
            Subscribers
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage and monitor users subscribed to your strategies
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Subscribers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{subscribers.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {subscribers.filter(s => s.isActive && !s.isPaused).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Paused
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {subscribers.filter(s => s.isPaused).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total PnL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${
                subscribers.reduce((sum, s) => sum + s.totalPnl, 0) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {formatCurrency(subscribers.reduce((sum, s) => sum + s.totalPnl, 0))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search by name, email, or strategy..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterStrategy} onValueChange={setFilterStrategy}>
                <SelectTrigger>
                  <SelectValue placeholder="All Strategies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strategies</SelectItem>
                  {strategies.map((strategy) => (
                    <SelectItem key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Subscribers List */}
        {filteredSubscribers.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                No subscribers found. {searchTerm && 'Try adjusting your search or filters.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredSubscribers.map((subscriber) => (
              <Card key={subscriber.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {subscriber.user.name || subscriber.user.email}
                          </CardTitle>
                          <CardDescription>
                            {subscriber.user.email} • {subscriber.strategy.name}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(subscriber)}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(subscriber)}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Edit Parameters
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Trading Parameters */}
                    <div>
                      <p className="text-xs text-muted-foreground">Capital</p>
                      <p className="font-semibold">{formatCurrency(subscriber.capital, subscriber.marginCurrency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Risk/Trade</p>
                      <p className="font-semibold">{(subscriber.riskPerTrade * 100).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Leverage</p>
                      <p className="font-semibold">{subscriber.leverage}x</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Max Positions</p>
                      <p className="font-semibold">{subscriber.maxPositions}</p>
                    </div>

                    {/* Performance Metrics */}
                    <div>
                      <p className="text-xs text-muted-foreground">Total Trades</p>
                      <p className="font-semibold">{subscriber.totalTrades}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Win Rate</p>
                      <p className="font-semibold text-green-600">{subscriber.winRate.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total PnL</p>
                      <p className={`font-semibold ${subscriber.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(subscriber.totalPnl, subscriber.marginCurrency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Subscribed</p>
                      <p className="font-semibold text-sm">
                        {formatDistanceToNow(new Date(subscriber.subscribedAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit Parameters Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Trading Parameters</DialogTitle>
            <DialogDescription>
              Update trading parameters for {selectedSubscriber?.user.name || selectedSubscriber?.user.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="capital">Capital ({selectedSubscriber?.marginCurrency})</Label>
              <Input
                id="capital"
                type="number"
                value={editForm.capital}
                onChange={(e) => setEditForm({ ...editForm, capital: e.target.value })}
                placeholder="10000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="riskPerTrade">Risk Per Trade (%)</Label>
              <Input
                id="riskPerTrade"
                type="number"
                step="0.1"
                value={editForm.riskPerTrade}
                onChange={(e) => setEditForm({ ...editForm, riskPerTrade: e.target.value })}
                placeholder="2.0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="leverage">Leverage</Label>
              <Input
                id="leverage"
                type="number"
                value={editForm.leverage}
                onChange={(e) => setEditForm({ ...editForm, leverage: e.target.value })}
                placeholder="10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxPositions">Max Positions</Label>
              <Input
                id="maxPositions"
                type="number"
                value={editForm.maxPositions}
                onChange={(e) => setEditForm({ ...editForm, maxPositions: e.target.value })}
                placeholder="1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxDailyLoss">Max Daily Loss (%)</Label>
              <Input
                id="maxDailyLoss"
                type="number"
                step="0.1"
                value={editForm.maxDailyLoss}
                onChange={(e) => setEditForm({ ...editForm, maxDailyLoss: e.target.value })}
                placeholder="5.0"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={saveParameters} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
