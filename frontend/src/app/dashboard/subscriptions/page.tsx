'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { StrategyExecutionAPI, type Subscription } from '@/lib/api/strategy-execution-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Settings,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  DollarSign,
  TrendingUp,
  Users,
  Clock,
  Activity
} from 'lucide-react';

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const { token, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (token) {
      fetchSubscriptions();
    }
  }, [token, isAuthenticated, router]);

  const fetchSubscriptions = async () => {
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const response = await StrategyExecutionAPI.getUserSubscriptions(token);
      setSubscriptions(response.subscriptions || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSubscriptions();
  };

  const handlePause = async (subscriptionId: string) => {
    if (!token) return;

    try {
      await StrategyExecutionAPI.pauseSubscription(subscriptionId, token);
      fetchSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause subscription');
    }
  };

  const handleResume = async (subscriptionId: string) => {
    if (!token) return;

    try {
      await StrategyExecutionAPI.resumeSubscription(subscriptionId, token);
      fetchSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume subscription');
    }
  };

  const handleCancel = async (subscriptionId: string) => {
    if (!confirm('Are you sure you want to cancel this subscription? This action cannot be undone.')) {
      return;
    }

    if (!token) return;

    try {
      await StrategyExecutionAPI.cancelSubscription(subscriptionId, token);
      fetchSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    }
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    if (filter === 'all') return true;
    if (filter === 'active') return sub.isActive && !sub.isPaused;
    if (filter === 'paused') return sub.isPaused;
    return true;
  });

  const getStatusBadge = (subscription: Subscription) => {
    if (!subscription.isActive) {
      return <Badge variant="secondary">Cancelled</Badge>;
    }
    if (subscription.isPaused) {
      return <Badge className="bg-yellow-100 text-yellow-800">Paused</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">Active</Badge>;
  };

  if (!isAuthenticated || !token) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Subscriptions</h1>
            <p className="text-muted-foreground mt-1">
              Manage your active strategy subscriptions
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
          {(['all', 'active', 'paused'] as const).map((filterOption) => (
            <button
              key={filterOption}
              onClick={() => setFilter(filterOption)}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                filter === filterOption
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {filterOption === 'all' ? 'All' :
               filterOption === 'active' ? 'Active' : 'Paused'}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive/15 border border-destructive/20 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Subscriptions Grid */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {subscriptions.length === 0 ? 'No subscriptions yet' : 'No subscriptions match your filter'}
              </h3>
              <p className="text-muted-foreground mb-4">
                {subscriptions.length === 0
                  ? 'Subscribe to a strategy to start trading'
                  : 'Try changing your filter to see other subscriptions'}
              </p>
              {subscriptions.length === 0 && (
                <Button onClick={() => router.push('/dashboard/strategies')}>
                  Browse Strategies
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredSubscriptions.map((subscription) => (
              <Card key={subscription.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-1">
                        {subscription.strategy?.name || 'Unknown Strategy'}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        {subscription.strategy?.executionConfig && (
                          <>
                            <TrendingUp className="h-3 w-3" />
                            {subscription.strategy.executionConfig.symbol}
                          </>
                        )}
                      </CardDescription>
                    </div>
                    {getStatusBadge(subscription)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Configuration */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-secondary/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <DollarSign className="h-3 w-3" />
                        <span className="text-xs">Capital</span>
                      </div>
                      <p className="font-semibold">${subscription.capital.toLocaleString()}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Activity className="h-3 w-3" />
                        <span className="text-xs">Risk/Trade</span>
                      </div>
                      <p className="font-semibold">{(subscription.riskPerTrade * 100).toFixed(1)}%</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <TrendingUp className="h-3 w-3" />
                        <span className="text-xs">Leverage</span>
                      </div>
                      <p className="font-semibold">{subscription.leverage}x</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Users className="h-3 w-3" />
                        <span className="text-xs">Max Positions</span>
                      </div>
                      <p className="font-semibold">{subscription.maxPositions}</p>
                    </div>
                  </div>

                  {/* Performance */}
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Trades</p>
                        <p className="font-semibold">{subscription.totalTrades}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Win Rate</p>
                        <p className="font-semibold text-green-600">
                          {subscription.totalTrades > 0
                            ? ((subscription.winningTrades / subscription.totalTrades) * 100).toFixed(1)
                            : '0'}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total P&L</p>
                        <p className={`font-semibold ${subscription.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${subscription.totalPnl.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Subscribed {new Date(subscription.subscribedAt).toLocaleDateString()}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    {subscription.isActive && !subscription.isPaused && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePause(subscription.id)}
                        className="flex-1"
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </Button>
                    )}
                    {subscription.isActive && subscription.isPaused && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResume(subscription.id)}
                        className="flex-1"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Resume
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/dashboard/subscription/${subscription.id}`)}
                      className="flex-1"
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Stats Cards */}
        {subscriptions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="text-2xl font-bold">
                      {subscriptions.filter(s => s.isActive && !s.isPaused).length}
                    </div>
                    <div className="text-sm text-gray-600">Active</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Pause className="h-5 w-5 text-yellow-500" />
                  <div>
                    <div className="text-2xl font-bold">
                      {subscriptions.filter(s => s.isPaused).length}
                    </div>
                    <div className="text-sm text-gray-600">Paused</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  <div>
                    <div className="text-2xl font-bold">
                      {subscriptions.reduce((sum, s) => sum + s.totalTrades, 0)}
                    </div>
                    <div className="text-sm text-gray-600">Total Trades</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-purple-500" />
                  <div>
                    <div className={`text-2xl font-bold ${subscriptions.reduce((sum, s) => sum + s.totalPnl, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${subscriptions.reduce((sum, s) => sum + s.totalPnl, 0).toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600">Total P&L</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
