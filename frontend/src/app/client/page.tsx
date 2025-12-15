'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  Loader2,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Power,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Clock,
  Target,
  Pause,
  Play,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface StrategyHealth {
  status: 'healthy' | 'warning' | 'error';
  message: string;
  errors: string[];
}

interface DailyPnL {
  date: string;
  pnl: number;
  cumulativePnl: number;
}

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string;
  isPublic: boolean;
  isActive: boolean;
  subscriberCount: number;
  activeSubscribers: number;
  pausedSubscribers: number;
  // Live P&L data
  todayPnl: number;
  todayPnlPercent: number;
  unrealizedPnl: number;
  totalPnl: number;
  // Health status
  health: StrategyHealth;
  // Performance data (last 7 days)
  sparklineData: DailyPnL[];
  // KPIs
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgTradeDuration: string;
  // Positions
  openPositions: number;
  lastSignalTime: string | null;
}

interface Subscriber {
  id: string;
  userName: string;
  userEmail: string;
  capital: number;
  leverage: number;
  isActive: boolean;
  isPaused: boolean;
  totalPnl: number;
  todayPnl: number;
  openPositions: number;
  health: 'synced' | 'slippage' | 'error';
  errorMessage?: string;
}

// API response types
interface ApiStrategy {
  id: string;
  name: string;
  code: string;
  description?: string;
  isPublic: boolean;
  isActive: boolean;
  subscriberCount: number;
  activeSubscribers: number;
  pausedSubscribers: number;
  todayPnl?: number;
  todayPnlPercent?: number;
  unrealizedPnl?: number;
  totalPnl?: number;
  health?: StrategyHealth;
  sparklineData?: DailyPnL[];
  totalTrades?: number;
  winRate?: number;
  maxDrawdown?: number;
  sharpeRatio?: number;
  avgTradeDuration?: string;
  openPositions?: number;
  lastSignalTime?: string | null;
}

interface ApiSubscriber {
  id: string;
  user: { name?: string; email: string };
  capital: number;
  leverage: number;
  isActive: boolean;
  isPaused: boolean;
  totalPnl?: number;
}

// ============================================================================
// Main Component
// ============================================================================

export default function ClientDashboardPage() {
  const router = useRouter();
  const { hasClientAccess } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ============================================================================
  // Auth Check & Data Loading
  // ============================================================================

  useEffect(() => {
    if (!hasClientAccess()) {
      router.replace('/dashboard');
      return;
    }
    loadDashboardData();
  }, [hasClientAccess, router]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLoading) {
        loadDashboardData(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const getAuthToken = () => {
    const token = localStorage.getItem('auth-storage');
    const authData = token ? JSON.parse(token) : null;
    return authData?.state?.token;
  };

  const loadDashboardData = async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      else setRefreshing(true);
      setError('');

      const authToken = getAuthToken();
      if (!authToken) throw new Error('No authentication token found');

      // Fetch enhanced dashboard data with real P&L calculations
      const response = await axios.get('/api/client/dashboard', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      const dashboardData = response.data;
      const strategiesData = dashboardData.strategies || [];

      // Map API response to Strategy interface
      const enhancedStrategies: Strategy[] = strategiesData.map((s: ApiStrategy) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        description: s.description || '',
        isPublic: s.isPublic,
        isActive: s.isActive,
        subscriberCount: s.subscriberCount,
        activeSubscribers: s.activeSubscribers,
        pausedSubscribers: s.pausedSubscribers,
        // Real P&L data from API
        todayPnl: s.todayPnl || 0,
        todayPnlPercent: s.todayPnlPercent || 0,
        unrealizedPnl: s.unrealizedPnl || 0,
        totalPnl: s.totalPnl || 0,
        // Health status from API
        health: s.health || { status: 'healthy', message: 'All systems normal', errors: [] },
        // Real sparkline data from API
        sparklineData: s.sparklineData || [],
        // Real KPIs from API
        totalTrades: s.totalTrades || 0,
        winRate: s.winRate || 0,
        maxDrawdown: s.maxDrawdown || 0,
        sharpeRatio: s.sharpeRatio || 0,
        avgTradeDuration: s.avgTradeDuration || '0m',
        openPositions: s.openPositions || 0,
        lastSignalTime: s.lastSignalTime,
      }));

      setStrategies(enhancedStrategies);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const loadStrategySubscribers = async (strategyId: string) => {
    try {
      setSubscribersLoading(true);
      const authToken = getAuthToken();
      if (!authToken) throw new Error('No authentication token found');

      const response = await axios.get(`/api/client/subscribers?strategyId=${strategyId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      const subs = response.data.subscribers || [];
      setSubscribers(subs.map((sub: ApiSubscriber) => ({
        id: sub.id,
        userName: sub.user.name || sub.user.email,
        userEmail: sub.user.email,
        capital: sub.capital,
        leverage: sub.leverage,
        isActive: sub.isActive,
        isPaused: sub.isPaused,
        totalPnl: sub.totalPnl || 0,
        todayPnl: 0, // TODO: Calculate from trades API when available
        openPositions: 0, // TODO: Get from trades API when available
        health: sub.isActive && !sub.isPaused ? 'synced' : 'slippage',
        errorMessage: undefined,
      })));
    } catch (err) {
      console.error('Failed to load subscribers:', err);
      toast.error('Failed to load subscriber details');
    } finally {
      setSubscribersLoading(false);
    }
  };

  // ============================================================================
  // Actions
  // ============================================================================

  const handleToggleStrategy = async (_strategyId: string, currentState: boolean) => {
    try {
      const authToken = getAuthToken();
      if (!authToken) throw new Error('No authentication token found');

      // TODO: Implement actual API call to toggle strategy
      toast.success(`Strategy ${currentState ? 'paused' : 'activated'}`);
      loadDashboardData(true);
    } catch (_err) {
      toast.error('Failed to toggle strategy');
    }
  };

  const handleEmergencyFlatten = async (strategyId: string) => {
    if (!confirm('⚠️ EMERGENCY: This will close ALL positions for ALL subscribers of this strategy and pause all subscriptions. Are you absolutely sure?')) {
      return;
    }

    try {
      const authToken = getAuthToken();
      if (!authToken) throw new Error('No authentication token found');

      const response = await axios.post(
        '/api/positions/force-close-all',
        { strategyId, pauseStrategy: true },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      const { successfulClosures, failedClosures, totalSubscriptions } = response.data;

      if (successfulClosures > 0) {
        toast.success(`✅ Successfully closed positions for ${successfulClosures}/${totalSubscriptions} subscribers`);
      }

      if (failedClosures > 0) {
        toast.warning(`⚠️ Failed to close positions for ${failedClosures} subscribers. Check logs for details.`);
      }

      loadDashboardData(true);
    } catch (_err) {
      toast.error('Failed to force close positions');
    }
  };

  const handleForceCloseSubscriber = async (subscriptionId: string, subscriberName: string) => {
    if (!confirm(`⚠️ Force close position for ${subscriberName}? This will immediately exit their position on the exchange.`)) {
      return;
    }

    try {
      const authToken = getAuthToken();
      if (!authToken) throw new Error('No authentication token found');

      await axios.post(
        '/api/positions/force-close',
        { subscriptionId },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      toast.success(`✅ Position closed for ${subscriberName}`);

      // Reload subscribers list
      if (selectedStrategy) {
        loadStrategySubscribers(selectedStrategy.id);
      }
    } catch (err) {
      const errorMsg = axios.isAxiosError(err) && err.response?.data?.error
        ? err.response.data.error
        : 'Failed to force close position';
      toast.error(errorMsg);
    }
  };

  const openStrategyDetail = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    loadStrategySubscribers(strategy.id);
  };

  // ============================================================================
  // Helpers
  // ============================================================================

  const formatCurrency = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}₹${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
  };

  // ============================================================================
  // Loading State
  // ============================================================================

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Strategy Command Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor and manage your strategies in real-time
            </p>
          </div>
          <div className="flex items-center gap-3">
            {refreshing && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating...
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDashboardData(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Strategy Command Cards Grid */}
        {strategies.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Strategies Found</h3>
              <p className="text-muted-foreground mb-4">
                Contact your quant team to upload strategies to your account.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {strategies.map((strategy) => (
              <StrategyCommandCard
                key={strategy.id}
                strategy={strategy}
                onToggle={() => handleToggleStrategy(strategy.id, strategy.isActive)}
                onClick={() => openStrategyDetail(strategy)}
                formatCurrency={formatCurrency}
                formatPercent={formatPercent}
              />
            ))}
          </div>
        )}
      </div>

      {/* Strategy Detail Dialog */}
      <Dialog open={!!selectedStrategy} onOpenChange={(open) => !open && setSelectedStrategy(null)}>
        <DialogContent className="w-[98vw] max-w-[1400px] max-h-[90vh] overflow-y-auto">
          {selectedStrategy && (
            <StrategyDetailPanel
              strategy={selectedStrategy}
              subscribers={subscribers}
              subscribersLoading={subscribersLoading}
              onExitAll={() => handleEmergencyFlatten(selectedStrategy.id)}
              onForceCloseSubscriber={handleForceCloseSubscriber}
              formatCurrency={formatCurrency}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Strategy Command Card Component
// ============================================================================

function StrategyCommandCard({
  strategy,
  onToggle,
  onClick,
  formatCurrency,
  formatPercent,
}: {
  strategy: Strategy;
  onToggle: () => void;
  onClick: () => void;
  formatCurrency: (v: number) => string;
  formatPercent: (v: number) => string;
}) {
  const pnlPositive = strategy.todayPnl >= 0;
  const healthColors = {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500 animate-pulse',
  };

  return (
    <Card
      className={`relative overflow-hidden transition-all hover:shadow-lg cursor-pointer border-l-4 ${
        strategy.health.status === 'error' ? 'border-l-red-500' :
        strategy.health.status === 'warning' ? 'border-l-yellow-500' :
        'border-l-green-500'
      }`}
      onClick={onClick}
    >
      {/* Header */}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold truncate">
                {strategy.name}
              </CardTitle>
              {strategy.health.status === 'error' && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">{strategy.code}</p>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={strategy.isActive}
              onCheckedChange={onToggle}
              className="data-[state=checked]:bg-green-500"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Mini Sparkline Chart */}
        <div className="h-12">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={strategy.sparklineData}>
              <defs>
                <linearGradient id={`gradient-${strategy.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={pnlPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={pnlPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="cumulativePnl"
                stroke={pnlPositive ? '#22c55e' : '#ef4444'}
                strokeWidth={2}
                fill={`url(#gradient-${strategy.id})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Today&apos;s P&L - Main Metric */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Today&apos;s P&L</p>
            <div className="flex items-center gap-2">
              {pnlPositive ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
              <span className={`text-xl font-bold ${pnlPositive ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(strategy.todayPnl)}
              </span>
              <span className={`text-sm ${pnlPositive ? 'text-green-500' : 'text-red-500'}`}>
                {formatPercent(strategy.todayPnlPercent)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Subscribers</p>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-semibold">{strategy.activeSubscribers}</span>
              <span className="text-xs text-muted-foreground">/{strategy.subscriberCount}</span>
            </div>
          </div>
        </div>

        {/* Health Status Footer */}
        <div className={`-mx-6 -mb-6 px-4 py-2 flex items-center justify-between ${
          strategy.health.status === 'error' ? 'bg-red-50 dark:bg-red-950/30' :
          strategy.health.status === 'warning' ? 'bg-yellow-50 dark:bg-yellow-950/30' :
          'bg-green-50 dark:bg-green-950/30'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${healthColors[strategy.health.status]}`} />
            <span className={`text-xs font-medium ${
              strategy.health.status === 'error' ? 'text-red-700 dark:text-red-400' :
              strategy.health.status === 'warning' ? 'text-yellow-700 dark:text-yellow-400' :
              'text-green-700 dark:text-green-400'
            }`}>
              {strategy.health.message}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Strategy Detail Panel Component
// ============================================================================

interface Trade {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  status: string;
  pnl?: number;
  createdAt: string;
  exitedAt?: string;
}

function StrategyDetailPanel({
  strategy,
  subscribers,
  subscribersLoading,
  onExitAll,
  onForceCloseSubscriber,
  formatCurrency,
}: {
  strategy: Strategy;
  subscribers: Subscriber[];
  subscribersLoading: boolean;
  onExitAll: () => void;
  onForceCloseSubscriber: (subscriptionId: string, subscriberName: string) => void;
  formatCurrency: (v: number) => string;
}) {
  const pnlPositive = strategy.totalPnl >= 0;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [tradesData, setTradesData] = useState<Record<string, {
    trades: Trade[];
    pagination: { page: number; totalPages: number; totalCount: number; hasMore: boolean };
    meta: { source: string; dbCount: number; exchangeCount: number };
  }>>({});
  const [loadingTrades, setLoadingTrades] = useState<Set<string>>(new Set());

  const fetchTrades = async (subscriptionId: string, page: number = 1) => {
    setLoadingTrades(prev => new Set(prev).add(subscriptionId));
    try {
      const tokenStorage = localStorage.getItem('auth-storage');
      const authData = tokenStorage ? JSON.parse(tokenStorage) : null;
      const authToken = authData?.state?.token;
      if (!authToken) throw new Error('No authentication token');
      const response = await axios.get(
        `/api/client/subscribers/${subscriptionId}/trades?page=${page}&limit=20`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setTradesData(prev => ({
        ...prev,
        [subscriptionId]: {
          trades: response.data.trades || [],
          pagination: response.data.pagination || { page: 1, totalPages: 1, totalCount: 0, hasMore: false },
          meta: response.data.meta || { source: 'database', dbCount: 0, exchangeCount: 0 }
        }
      }));
    } catch (err) {
      console.error('Failed to load trades:', err);
      toast.error('Failed to load trades');
    } finally {
      setLoadingTrades(prev => {
        const newSet = new Set(prev);
        newSet.delete(subscriptionId);
        return newSet;
      });
    }
  };

  const toggleRow = async (subscriptionId: string) => {
    const newExpanded = new Set(expandedRows);

    if (newExpanded.has(subscriptionId)) {
      newExpanded.delete(subscriptionId);
    } else {
      newExpanded.add(subscriptionId);
      // Fetch trades if not already loaded
      if (!tradesData[subscriptionId]) {
        await fetchTrades(subscriptionId, 1);
      }
    }

    setExpandedRows(newExpanded);
  };

  return (
    <div className="space-y-6">
      <DialogHeader>
        <div className="flex items-center justify-between">
          <div>
            <DialogTitle className="text-xl">{strategy.name}</DialogTitle>
            <p className="text-sm text-muted-foreground font-mono">{strategy.code}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={strategy.isActive ? 'default' : 'secondary'}>
              {strategy.isActive ? 'Active' : 'Paused'}
            </Badge>
            <Button variant="destructive" size="sm" onClick={onExitAll}>
              <Power className="h-4 w-4 mr-2" />
              Exit All
            </Button>
          </div>
        </div>
      </DialogHeader>

      {/* Equity Curve Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Performance (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={strategy.sparklineData}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={pnlPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={pnlPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  formatter={(value: number) => [formatCurrency(value), 'P&L']}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativePnl"
                  stroke={pnlPositive ? '#22c55e' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#equityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Win Rate</span>
          </div>
          <p className="text-lg font-bold">{strategy.winRate.toFixed(1)}%</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Max Drawdown</span>
          </div>
          <p className="text-lg font-bold text-red-500">-{strategy.maxDrawdown.toFixed(2)}%</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Sharpe Ratio</span>
          </div>
          <p className="text-lg font-bold">{strategy.sharpeRatio.toFixed(2)}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Avg Trade Duration</span>
          </div>
          <p className="text-lg font-bold">{strategy.avgTradeDuration}</p>
        </div>
      </div>

      {/* Execution Health */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Execution Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`p-3 rounded-lg ${
            strategy.health.status === 'error' ? 'bg-red-50 dark:bg-red-950/30' :
            strategy.health.status === 'warning' ? 'bg-yellow-50 dark:bg-yellow-950/30' :
            'bg-green-50 dark:bg-green-950/30'
          }`}>
            <div className="flex items-center gap-2">
              {strategy.health.status === 'healthy' && <CheckCircle className="h-5 w-5 text-green-500" />}
              {strategy.health.status === 'warning' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
              {strategy.health.status === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
              <span className={`font-medium ${
                strategy.health.status === 'error' ? 'text-red-700 dark:text-red-400' :
                strategy.health.status === 'warning' ? 'text-yellow-700 dark:text-yellow-400' :
                'text-green-700 dark:text-green-400'
              }`}>
                {strategy.health.message}
              </span>
            </div>
            {strategy.health.errors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {strategy.health.errors.map((err, i) => (
                  <li key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-red-500" />
                    {err}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Subscribers Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Subscribers ({subscribers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscribersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : subscribers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No subscribers yet
            </p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-8"></th>
                    <th className="text-left py-2 px-3 font-medium">User</th>
                    <th className="text-right py-2 px-3 font-medium">Capital</th>
                    <th className="text-right py-2 px-3 font-medium">Leverage</th>
                    <th className="text-right py-2 px-3 font-medium">Total PnL</th>
                    <th className="text-center py-2 px-3 font-medium">Status</th>
                    <th className="text-center py-2 px-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscribers.map((sub) => {
                    const isExpanded = expandedRows.has(sub.id);
                    const isLoadingTrades = loadingTrades.has(sub.id);
                    const tradeInfo = tradesData[sub.id];
                    const trades = tradeInfo?.trades || [];
                    const pagination = tradeInfo?.pagination;
                    const meta = tradeInfo?.meta;

                    return (
                      <React.Fragment key={sub.id}>
                        <tr className="hover:bg-muted/30">
                          <td className="py-2 px-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => toggleRow(sub.id)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </td>
                          <td className="py-2 px-3">
                            <div>
                              <p className="font-medium">{sub.userName}</p>
                              <p className="text-xs text-muted-foreground">{sub.userEmail}</p>
                            </div>
                          </td>
                          <td className="text-right py-2 px-3">
                            ₹{sub.capital.toLocaleString()}
                          </td>
                          <td className="text-right py-2 px-3">
                            {sub.leverage}x
                          </td>
                          <td className={`text-right py-2 px-3 font-medium ${sub.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(sub.totalPnl)}
                          </td>
                          <td className="text-center py-2 px-3">
                            {sub.isPaused ? (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                <Pause className="h-3 w-3 mr-1" />
                                Paused
                              </Badge>
                            ) : sub.isActive ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                <Play className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                Inactive
                              </Badge>
                            )}
                          </td>
                          <td className="text-center py-2 px-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => onForceCloseSubscriber(sub.id, sub.userName)}
                              title="Exit position"
                            >
                              <Power className="h-4 w-4 mr-1" />
                              Exit
                            </Button>
                          </td>
                        </tr>
                        {/* Expanded Trades Row */}
                        {isExpanded && (
                          <tr key={`${sub.id}-trades`}>
                            <td colSpan={7} className="bg-muted/30 p-3">
                              {isLoadingTrades ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                  <span className="ml-2 text-sm text-muted-foreground">Loading trades...</span>
                                </div>
                              ) : trades.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                  No trades found for this subscriber
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium text-muted-foreground">
                                      Recent Trades ({pagination?.totalCount || trades.length})
                                    </p>
                                    {meta && (
                                      <span className={`text-xs px-2 py-0.5 rounded ${
                                        meta.source === 'exchange' ? 'bg-orange-100 text-orange-700' :
                                        meta.source === 'database+exchange' ? 'bg-purple-100 text-purple-700' :
                                        'bg-blue-100 text-blue-700'
                                      }`}>
                                        {meta.source === 'exchange' ? '📡 Exchange' :
                                         meta.source === 'database+exchange' ? '🔄 DB + Exchange' :
                                         '💾 Database'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="border rounded bg-background">
                                    <table className="w-full text-xs">
                                      <thead className="bg-muted/50">
                                        <tr>
                                          <th className="text-left py-1.5 px-2 font-medium">Symbol</th>
                                          <th className="text-center py-1.5 px-2 font-medium">Side</th>
                                          <th className="text-right py-1.5 px-2 font-medium">Qty</th>
                                          <th className="text-right py-1.5 px-2 font-medium">Entry</th>
                                          <th className="text-right py-1.5 px-2 font-medium">Exit</th>
                                          <th className="text-right py-1.5 px-2 font-medium">PnL</th>
                                          <th className="text-center py-1.5 px-2 font-medium">Status</th>
                                          <th className="text-right py-1.5 px-2 font-medium">Date</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border">
                                        {trades.map((trade) => (
                                          <tr key={trade.id}>
                                            <td className="py-1.5 px-2 font-mono">{trade.symbol}</td>
                                            <td className="text-center py-1.5 px-2">
                                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                                trade.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                              }`}>
                                                {trade.side}
                                              </span>
                                            </td>
                                            <td className="text-right py-1.5 px-2">{trade.quantity}</td>
                                            <td className="text-right py-1.5 px-2">{trade.entryPrice?.toFixed(2) || '-'}</td>
                                            <td className="text-right py-1.5 px-2">{trade.exitPrice?.toFixed(2) || '-'}</td>
                                            <td className={`text-right py-1.5 px-2 font-medium ${
                                              (trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                              {trade.pnl ? formatCurrency(trade.pnl) : '-'}
                                            </td>
                                            <td className="text-center py-1.5 px-2">
                                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                                trade.status === 'OPEN' ? 'bg-blue-100 text-blue-700' :
                                                trade.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' :
                                                'bg-yellow-100 text-yellow-700'
                                              }`}>
                                                {trade.status}
                                              </span>
                                            </td>
                                            <td className="text-right py-1.5 px-2 text-muted-foreground">
                                              {new Date(trade.createdAt).toLocaleDateString()}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  {/* Pagination Controls */}
                                  {pagination && pagination.totalPages > 1 && (
                                    <div className="flex items-center justify-between pt-2">
                                      <p className="text-xs text-muted-foreground">
                                        Page {pagination.page} of {pagination.totalPages}
                                      </p>
                                      <div className="flex gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-2 text-xs"
                                          disabled={pagination.page <= 1 || isLoadingTrades}
                                          onClick={() => fetchTrades(sub.id, pagination.page - 1)}
                                        >
                                          ← Prev
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-2 text-xs"
                                          disabled={!pagination.hasMore || isLoadingTrades}
                                          onClick={() => fetchTrades(sub.id, pagination.page + 1)}
                                        >
                                          Next →
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
