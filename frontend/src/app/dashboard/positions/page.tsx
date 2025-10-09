'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  RefreshCw,
  ExternalLink,
  X,
  Eye,
  BarChart3,
  Clock,
  Target,
  AlertTriangle
} from 'lucide-react';

interface Position {
  id: string;
  deploymentId: string;
  strategyName: string;
  strategyCode: string;
  instrument: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  leverage: number;
  marginUsed: number;
  openTime: string;
  lastUpdate: string;
}

interface Order {
  id: string;
  deploymentId: string;
  strategyName: string;
  strategyCode: string;
  instrument: string;
  type: string;
  side: string;
  amount: number;
  price: number;
  filled: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  fees: number;
}

interface PnLData {
  summary: {
    totalRealizedPnl: number;
    totalUnrealizedPnl: number;
    totalPnl: number;
    totalTrades: number;
    winRate: number;
    activeStrategies: number;
  };
  dailyPnl: Array<{
    date: string;
    pnl: number;
    cumulativePnl: number;
  }>;
  strategyPerformance: Array<{
    strategyId: string;
    strategyName: string;
    strategyCode: string;
    realizedPnl: number;
    trades: number;
    winRate: number;
    isActive: boolean;
  }>;
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'pnl'>('positions');
  const [orderFilter, setOrderFilter] = useState<'all' | 'filled' | 'pending' | 'cancelled'>('all');

  const { token, isAuthenticated } = useAuth();
  const router = useRouter();

  const fetchData = async () => {
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      // Fetch positions, orders, and P&L data in parallel
      const [positionsRes, ordersRes, pnlRes] = await Promise.all([
        fetch('/api/positions/current', { headers }),
        fetch('/api/positions/orders', { headers }),
        fetch('/api/positions/pnl', { headers })
      ]);

      if (!positionsRes.ok || !ordersRes.ok || !pnlRes.ok) {
        if (positionsRes.status === 401 || ordersRes.status === 401 || pnlRes.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch data');
      }

      const [positionsData, ordersData, pnlDataRes] = await Promise.all([
        positionsRes.json(),
        ordersRes.json(),
        pnlRes.json()
      ]);

      setPositions(positionsData.positions || []);
      setOrders(ordersData.orders || []);
      setPnlData(pnlDataRes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (token) {
      fetchData();
    }
  }, [token, isAuthenticated]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (token && !loading) {
        setRefreshing(true);
        fetchData();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [token, loading]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleClosePosition = async (positionId: string) => {
    if (!confirm('Are you sure you want to close this position?')) {
      return;
    }

    try {
      const response = await fetch('/api/positions/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ positionId, reason: 'Manual close' }),
      });

      if (!response.ok) {
        throw new Error('Failed to close position');
      }

      // Refresh data
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close position');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'filled': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'partially_filled': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredOrders = orderFilter === 'all'
    ? orders
    : orders.filter(order => order.status.toLowerCase() === orderFilter.toLowerCase());

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
            <h1 className="text-3xl font-bold text-foreground">Positions & Orders</h1>
            <p className="text-muted-foreground mt-1">
              Monitor your active positions, orders, and trading performance
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

        {/* P&L Summary Cards */}
        {pnlData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-card p-6 rounded-lg border">
              <div className="flex items-center">
                <DollarSign className="h-5 w-5 text-green-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-muted-foreground">Total P&L</p>
                  <p className={`text-2xl font-bold ${pnlData.summary.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(pnlData.summary.totalPnl)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <div className="flex items-center">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-muted-foreground">Unrealized P&L</p>
                  <p className={`text-2xl font-bold ${pnlData.summary.totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(pnlData.summary.totalUnrealizedPnl)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <div className="flex items-center">
                <Target className="h-5 w-5 text-purple-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-muted-foreground">Win Rate</p>
                  <p className="text-2xl font-bold text-foreground">
                    {pnlData.summary.winRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <div className="flex items-center">
                <Activity className="h-5 w-5 text-orange-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-muted-foreground">Active Positions</p>
                  <p className="text-2xl font-bold text-foreground">
                    {positions.length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
          {(['positions', 'orders', 'pnl'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'positions' ? 'Active Positions' :
               tab === 'orders' ? 'Order History' : 'P&L Analysis'}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive/15 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'positions' && (
          <div className="bg-card rounded-lg border">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-card-foreground">
                Active Positions
              </h2>
            </div>

            {loading ? (
              <div className="px-6 py-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-2">Loading positions...</p>
              </div>
            ) : positions.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No active positions</h3>
                <p className="text-muted-foreground">
                  Start a trading bot to see active positions here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Strategy
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Position
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Entry Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Current Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        P&L
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Margin
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {positions.map((position) => (
                      <tr key={position.id} className="hover:bg-muted/25">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <div className="text-sm font-medium text-foreground">
                              {position.strategyName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {position.strategyCode}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <div className="text-sm font-medium text-foreground">
                              {position.instrument}
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-md ${
                                position.side === 'LONG'
                                  ? 'bg-green-100 text-green-800 border border-green-200'
                                  : 'bg-red-100 text-red-800 border border-red-200'
                              }`}>
                                {position.side}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {position.leverage}x
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-foreground">
                            {formatCurrency(position.entryPrice)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Size: {position.size.toFixed(4)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-foreground">
                            {formatCurrency(position.currentPrice)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(position.lastUpdate).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`text-sm font-medium ${
                            position.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(position.unrealizedPnl)}
                          </div>
                          <div className={`text-xs ${
                            position.unrealizedPnlPct >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatPercent(position.unrealizedPnlPct)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-foreground">
                            {formatCurrency(position.marginUsed)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Open: {new Date(position.openTime).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => router.push(`/dashboard/deployed`)}
                              className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-md transition-colors"
                              title="View strategy"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleClosePosition(position.id)}
                              className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-md transition-colors"
                              title="Close position"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="bg-card rounded-lg border">
            <div className="px-6 py-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-card-foreground">
                  Order History
                </h2>
                <div className="flex space-x-2">
                  {(['all', 'filled', 'pending', 'cancelled'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setOrderFilter(filter)}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        orderFilter === filter
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="px-6 py-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-2">Loading orders...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No orders found</h3>
                <p className="text-muted-foreground">
                  {orderFilter === 'all'
                    ? 'No trading orders to display.'
                    : `No ${orderFilter} orders to display.`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Strategy
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Order
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Type/Side
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Amount/Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-muted/25">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <div className="text-sm font-medium text-foreground">
                              {order.strategyName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {order.strategyCode}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-foreground">
                            {order.instrument}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ID: {order.id.slice(-8)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-foreground">
                            {order.type}
                          </div>
                          <div className={`text-xs font-medium ${
                            order.side === 'BUY' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {order.side}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-foreground">
                            {order.amount.toFixed(4)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            @ {formatCurrency(order.price)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-md border ${getStatusColor(order.status)}`}>
                            {order.status}
                          </span>
                          {order.filled > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Filled: {((order.filled / order.amount) * 100).toFixed(1)}%
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs text-muted-foreground">
                            {new Date(order.createdAt).toLocaleString()}
                          </div>
                          {order.fees > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Fee: {formatCurrency(order.fees)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pnl' && pnlData && (
          <div className="space-y-6">
            {/* Strategy Performance */}
            <div className="bg-card rounded-lg border">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-card-foreground">
                  Strategy Performance
                </h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pnlData.strategyPerformance.map((strategy) => (
                    <div key={strategy.strategyId} className="bg-muted/50 p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-foreground">{strategy.strategyName}</h3>
                        {strategy.isActive && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-md bg-green-100 text-green-800 border border-green-200">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">P&L:</span>
                          <span className={strategy.realizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency(strategy.realizedPnl)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trades:</span>
                          <span className="text-foreground">{strategy.trades}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Win Rate:</span>
                          <span className="text-foreground">{strategy.winRate.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}