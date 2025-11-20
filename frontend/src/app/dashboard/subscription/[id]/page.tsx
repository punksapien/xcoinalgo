'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { StrategyExecutionAPI, type Subscription, type SubscriptionStats } from '@/lib/api/strategy-execution-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RedeployModal } from '@/components/strategy/redeploy-modal';
import {
  ArrowLeft,
  Play,
  Pause,
  Settings,
  Trash2,
  RefreshCw,
  DollarSign,
  TrendingUp,
  Users,
  Activity,
  Shield,
  BarChart3,
  AlertCircle
} from 'lucide-react';

export default function SubscriptionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [redeployModalOpen, setRedeployModalOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (token) {
      fetchSubscriptionDetails();
    }
  }, [params.id, token, isAuthenticated, router]);

  const fetchSubscriptionDetails = async () => {
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const subscriptionId = params.id as string;
      const response = await StrategyExecutionAPI.getSubscriptionStats(subscriptionId, token);

      setSubscription(response.subscription);
      setStats(response.stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription details');
      setSubscription(null); // Clear subscription on error to prevent showing stale/partial data
      setStats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSubscriptionDetails();
  };

  const handlePause = async () => {
    if (!token || !subscription) return;

    try {
      await StrategyExecutionAPI.pauseSubscription(subscription.id, token);
      fetchSubscriptionDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause subscription');
    }
  };

  const handleResume = () => {
    if (!subscription) return;
    setRedeployModalOpen(true);
  };

  const handleRedeploySuccess = () => {
    setRedeployModalOpen(false);
    fetchSubscriptionDetails();
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this subscription? This action cannot be undone.')) {
      return;
    }

    if (!token || !subscription) return;

    try {
      await StrategyExecutionAPI.cancelSubscription(subscription.id, token);
      router.push('/dashboard/subscriptions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    }
  };

  const handleBack = () => {
    router.push('/dashboard/subscriptions');
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

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          {error ? (
            <>
              <AlertCircle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Failed to Load Subscription</h2>
              <p className="text-muted-foreground text-center max-w-md">{error}</p>
              <div className="flex gap-2">
                <Button onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Retry
                </Button>
                <Button onClick={handleBack} variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Subscriptions
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold">Subscription Not Found</h2>
              <p className="text-muted-foreground">The requested subscription could not be found.</p>
              <Button onClick={handleBack} variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Subscriptions
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  const getStatusBadge = () => {
    if (!subscription.isActive) {
      return <Badge variant="secondary">Cancelled</Badge>;
    }
    if (subscription.isPaused) {
      return <Badge className="bg-yellow-100 text-yellow-800">Paused</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">Active</Badge>;
  };

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="hover:bg-secondary/80 transition-all"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {subscription.strategy?.name || 'Subscription Details'}
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage settings and view performance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {getStatusBadge()}
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive/15 border border-destructive/20 text-destructive px-4 py-3 rounded-md flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Configuration Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuration
                </CardTitle>
                <CardDescription>Your subscription settings and parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-secondary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-sm">Capital</span>
                    </div>
                    <p className="text-2xl font-bold">${(subscription.capital || 0).toLocaleString()}</p>
                  </div>

                  <div className="bg-secondary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm">Risk Per Trade</span>
                    </div>
                    <p className="text-2xl font-bold">{((subscription.riskPerTrade || 0) * 100).toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ${((subscription.capital || 0) * (subscription.riskPerTrade || 0)).toFixed(2)} per trade
                    </p>
                  </div>

                  <div className="bg-secondary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-sm">Leverage</span>
                    </div>
                    <p className="text-2xl font-bold">{subscription.leverage}x</p>
                  </div>

                  <div className="bg-secondary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Users className="h-4 w-4" />
                      <span className="text-sm">Max Positions</span>
                    </div>
                    <p className="text-2xl font-bold">{subscription.maxPositions}</p>
                  </div>

                  <div className="bg-secondary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Shield className="h-4 w-4" />
                      <span className="text-sm">Max Daily Loss</span>
                    </div>
                    <p className="text-2xl font-bold">{((subscription.maxDailyLoss || 0) * 100).toFixed(0)}%</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ${((subscription.capital || 0) * (subscription.maxDailyLoss || 0)).toFixed(2)} max loss
                    </p>
                  </div>

                  <div className="bg-secondary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <BarChart3 className="h-4 w-4" />
                      <span className="text-sm">ATR Multipliers</span>
                    </div>
                    <p className="text-sm">
                      <span className="font-semibold">SL:</span> {subscription.slAtrMultiplier || 'N/A'}
                      {' · '}
                      <span className="font-semibold">TP:</span> {subscription.tpAtrMultiplier || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Performance Metrics
                </CardTitle>
                <CardDescription>Trading statistics and performance</CardDescription>
              </CardHeader>
              <CardContent>
                {stats ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Total Trades</p>
                        <p className="text-3xl font-bold">{stats.totalTrades}</p>
                      </div>
                      <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Winning</p>
                        <p className="text-3xl font-bold text-green-600">{stats.winningTrades}</p>
                      </div>
                      <div className="text-center p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-1">Losing</p>
                        <p className="text-3xl font-bold text-red-600">{stats.losingTrades}</p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-secondary/20 rounded-lg p-4">
                        <p className="text-sm text-muted-foreground mb-2">Win Rate</p>
                        <p className="text-2xl font-bold text-green-600">
                          {(stats.winRate * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="bg-secondary/20 rounded-lg p-4">
                        <p className="text-sm text-muted-foreground mb-2">Total P&L</p>
                        <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${stats.totalPnl.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No performance data available yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Actions & Info */}
          <div className="space-y-6">
            {/* Actions Card */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {subscription.isActive && !subscription.isPaused && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handlePause}
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Pause Subscription
                  </Button>
                )}
                {subscription.isActive && subscription.isPaused && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleResume}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Resume Subscription
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push(`/dashboard/strategy/${subscription.strategyId}`)}
                >
                  View Strategy Details
                </Button>
                {subscription.isActive && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleCancel}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Cancel Subscription
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Strategy</p>
                  <p className="font-semibold">{subscription.strategy?.name || 'N/A'}</p>
                </div>
                {subscription.strategy?.executionConfig && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-muted-foreground">Trading Pair</p>
                      <p className="font-semibold">{String(subscription.strategy.executionConfig.symbol)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Resolution</p>
                      <p className="font-semibold">{String(subscription.strategy.executionConfig.resolution)} minutes</p>
                    </div>
                  </>
                )}
                <Separator />
                <div>
                  <p className="text-muted-foreground">Subscribed At</p>
                  <p className="font-semibold">{new Date(subscription.subscribedAt).toLocaleString()}</p>
                </div>
                {subscription.pausedAt && (
                  <div>
                    <p className="text-muted-foreground">Paused At</p>
                    <p className="font-semibold">{new Date(subscription.pausedAt).toLocaleString()}</p>
                  </div>
                )}
                {subscription.unsubscribedAt && (
                  <div>
                    <p className="text-muted-foreground">Cancelled At</p>
                    <p className="font-semibold">{new Date(subscription.unsubscribedAt).toLocaleString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Trades - Coming Soon */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">Trade History Coming Soon</CardTitle>
            <CardDescription>
              Detailed trade history and analysis will be available in a future update.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Redeploy Modal */}
        {subscription && (
          <RedeployModal
            open={redeployModalOpen}
            onOpenChange={setRedeployModalOpen}
            subscription={subscription}
            onSuccess={handleRedeploySuccess}
          />
        )}
      </div>
    </div>
  );
}
