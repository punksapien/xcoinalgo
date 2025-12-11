'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  DollarSign,
  Activity,
  X,
  BarChart3,
  Clock,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  IndianRupee
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ============================================================================
// Types
// ============================================================================

interface Position {
  id: string;
  deploymentId: string;
  strategyName: string;
  strategyCode: string;
  strategyId?: string;
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
  stopLoss?: number;
  takeProfit?: number;
}

interface Order {
  id: string;
  deploymentId: string;
  strategyName: string;
  strategyCode: string;
  strategyId?: string;
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
  // Additional fields for transparency
  exitPrice?: number;
  exitReason?: string;
  pnl?: number;
  pnlPercentage?: number;
  slippage?: number;
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

// Aggregated strategy summary for cards
interface StrategySummary {
  strategyId: string;
  strategyName: string;
  strategyCode: string;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPct: number;
  openPositions: number;
  capitalAllocated: number;
  isActive: boolean;
  positions: Position[];
  orders: Order[];
  // Performance metrics
  realizedPnl: number;
  totalTrades: number;
  winRate: number;
}

// ============================================================================
// Main Component
// ============================================================================

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pnlData, setPnlData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Main page tabs: Strategy Cards vs Global Order History
  const [mainTab, setMainTab] = useState<'strategies' | 'global-orders'>('strategies');

  // Modal state
  const [selectedStrategy, setSelectedStrategy] = useState<StrategySummary | null>(null);
  const [modalTab, setModalTab] = useState<'positions' | 'orders' | 'pnl'>('positions');

  // Global order filter
  const [orderFilter, setOrderFilter] = useState<'all' | 'open' | 'closed'>('all');

  // Currency toggle: USD or INR
  const [currency, setCurrency] = useState<'USD' | 'INR'>('INR');
  // USDT/INR rate - update this value every few months from CoinDCX ticker API
  // Last updated: Dec 2025 (fetch from: https://api.coindcx.com/exchange/ticker -> USDTINR)
  const USDT_INR_RATE = 91.43;

  const { token, isAuthenticated } = useAuth();
  const router = useRouter();

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchData = async (silent = false) => {
    if (!token) {
      setError('Not authenticated');
      if (!silent) setLoading(false);
      return;
    }

    try {
      const [positionsData, ordersData, pnlDataRes] = await Promise.all([
        apiClient.get<{ positions: Position[] }>('/api/positions/current'),
        apiClient.get<{ orders: Order[] }>('/api/positions/orders'),
        apiClient.get<PnLData>('/api/positions/pnl')
      ]);

      setPositions(positionsData.positions || []);
      setOrders(ordersData.orders || []);
      setPnlData(pnlDataRes);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return;
      }
      // Only show error on initial load, not on silent refreshes
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    } finally {
      if (!silent) setLoading(false);
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

  // Auto-refresh every 10 seconds (silent)
  useEffect(() => {
    const interval = setInterval(() => {
      if (token && !loading) {
        fetchData(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [token, loading]);

  // ============================================================================
  // Aggregate positions/orders into strategy summaries
  // ============================================================================

  const strategySummaries = useMemo((): StrategySummary[] => {
    const summaryMap = new Map<string, StrategySummary>();

    // Group positions by strategy
    positions.forEach(pos => {
      const key = pos.strategyCode || pos.strategyName;
      if (!summaryMap.has(key)) {
        // Find performance data for this strategy
        const perfData = pnlData?.strategyPerformance.find(
          p => p.strategyCode === pos.strategyCode || p.strategyName === pos.strategyName
        );

        summaryMap.set(key, {
          strategyId: pos.strategyId || pos.deploymentId,
          strategyName: pos.strategyName,
          strategyCode: pos.strategyCode,
          totalUnrealizedPnl: 0,
          totalUnrealizedPnlPct: 0,
          openPositions: 0,
          capitalAllocated: 0,
          isActive: true,
          positions: [],
          orders: [],
          realizedPnl: perfData?.realizedPnl || 0,
          totalTrades: perfData?.trades || 0,
          winRate: perfData?.winRate || 0,
        });
      }

      const summary = summaryMap.get(key)!;
      summary.positions.push(pos);
      summary.openPositions++;
      summary.totalUnrealizedPnl += pos.unrealizedPnl;
      summary.capitalAllocated += pos.marginUsed;
    });

    // Calculate average unrealized P&L percentage
    summaryMap.forEach(summary => {
      if (summary.capitalAllocated > 0) {
        summary.totalUnrealizedPnlPct = (summary.totalUnrealizedPnl / summary.capitalAllocated) * 100;
      }
    });

    // Add orders to each strategy
    orders.forEach(order => {
      const key = order.strategyCode || order.strategyName;
      if (summaryMap.has(key)) {
        summaryMap.get(key)!.orders.push(order);
      }
    });

    // Also add strategies from P&L data that might not have open positions
    pnlData?.strategyPerformance.forEach(perf => {
      const key = perf.strategyCode || perf.strategyName;
      if (!summaryMap.has(key) && perf.trades > 0) {
        summaryMap.set(key, {
          strategyId: perf.strategyId,
          strategyName: perf.strategyName,
          strategyCode: perf.strategyCode,
          totalUnrealizedPnl: 0,
          totalUnrealizedPnlPct: 0,
          openPositions: 0,
          capitalAllocated: 0,
          isActive: perf.isActive,
          positions: [],
          orders: orders.filter(o => o.strategyCode === perf.strategyCode),
          realizedPnl: perf.realizedPnl,
          totalTrades: perf.trades,
          winRate: perf.winRate,
        });
      }
    });

    return Array.from(summaryMap.values()).sort((a, b) => {
      // Sort by open positions first, then by total trades
      if (a.openPositions !== b.openPositions) return b.openPositions - a.openPositions;
      return b.totalTrades - a.totalTrades;
    });
  }, [positions, orders, pnlData]);

  // Filter global orders
  const filteredGlobalOrders = useMemo(() => {
    if (orderFilter === 'all') return orders;
    if (orderFilter === 'open') return orders.filter(o => o.status === 'OPEN');
    return orders.filter(o => o.status === 'CLOSED');
  }, [orders, orderFilter]);

  // ============================================================================
  // Helpers
  // ============================================================================

  const formatCurrency = (valueInUsdt: number) => {
    if (currency === 'INR') {
      const valueInInr = valueInUsdt * USDT_INR_RATE;
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(valueInInr);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valueInUsdt);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'OPEN': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'CLOSED': return 'bg-green-100 text-green-800 border-green-200';
      case 'FILLED': return 'bg-green-100 text-green-800 border-green-200';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'CANCELLED': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleClosePosition = async (positionId: string) => {
    if (!confirm('Are you sure you want to close this position?')) return;
    try {
      await apiClient.post('/api/positions/close', { positionId, reason: 'Manual close' });
      fetchData();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(err instanceof Error ? err.message : 'Failed to close position');
    }
  };

  // ============================================================================
  // Loading / Auth Check
  // ============================================================================

  if (!isAuthenticated || !token) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render
  // ============================================================================

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
          {/* Currency Toggle */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
            <button
              onClick={() => setCurrency('INR')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                currency === 'INR'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <IndianRupee className="h-4 w-4" />
              INR
            </button>
            <button
              onClick={() => setCurrency('USD')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                currency === 'USD'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <DollarSign className="h-4 w-4" />
              USD
            </button>
          </div>
        </div>

        {/* Main Tab Navigation */}
        <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
          <button
            onClick={() => setMainTab('strategies')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              mainTab === 'strategies'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="h-4 w-4 inline-block mr-2" />
            Strategy Overview
          </button>
          <button
            onClick={() => setMainTab('global-orders')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              mainTab === 'global-orders'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="h-4 w-4 inline-block mr-2" />
            Global Order History
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive/15 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* ================================================================== */}
        {/* Strategy Cards View */}
        {/* ================================================================== */}
        {mainTab === 'strategies' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading strategies...</span>
              </div>
            ) : strategySummaries.length === 0 ? (
              <div className="bg-card rounded-lg border p-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No strategies found</h3>
                <p className="text-muted-foreground">
                  Subscribe to a strategy and start trading to see your positions here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {strategySummaries.map((strategy) => (
                  <StrategyCard
                    key={strategy.strategyCode}
                    strategy={strategy}
                    onClick={() => {
                      setSelectedStrategy(strategy);
                      setModalTab('positions');
                    }}
                    formatCurrency={formatCurrency}
                    formatPercent={formatPercent}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* ================================================================== */}
        {/* Global Order History View */}
        {/* ================================================================== */}
        {mainTab === 'global-orders' && (
          <div className="bg-card rounded-lg border">
            <div className="px-6 py-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-card-foreground">
                  All Orders Across Strategies
                </h2>
                <div className="flex space-x-2">
                  {(['all', 'open', 'closed'] as const).map((filter) => (
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
              </div>
            ) : filteredGlobalOrders.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No orders found</h3>
              </div>
            ) : (
              <GlobalOrdersTable
                orders={filteredGlobalOrders}
                formatCurrency={formatCurrency}
                getStatusColor={getStatusColor}
              />
            )}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Strategy Detail Modal */}
      {/* ================================================================== */}
      <Dialog open={!!selectedStrategy} onOpenChange={(open) => !open && setSelectedStrategy(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="flex-1">
                <span className="text-xl">{selectedStrategy?.strategyName}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  ({selectedStrategy?.strategyCode})
                </span>
              </div>
              {selectedStrategy?.isActive && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  Active
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Modal Tabs */}
          <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
            {(['positions', 'orders', 'pnl'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setModalTab(tab)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  modalTab === tab
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'positions' ? `Active Positions (${selectedStrategy?.openPositions || 0})` :
                 tab === 'orders' ? `Order History (${selectedStrategy?.orders.length || 0})` :
                 'P&L Analysis'}
              </button>
            ))}
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto mt-4">
            {selectedStrategy && modalTab === 'positions' && (
              <StrategyPositionsTable
                positions={selectedStrategy.positions}
                formatCurrency={formatCurrency}
                formatPercent={formatPercent}
                onClosePosition={handleClosePosition}
              />
            )}

            {selectedStrategy && modalTab === 'orders' && (
              <StrategyOrdersTable
                orders={selectedStrategy.orders}
                formatCurrency={formatCurrency}
                getStatusColor={getStatusColor}
              />
            )}

            {selectedStrategy && modalTab === 'pnl' && (
              <StrategyPnLAnalysis
                strategy={selectedStrategy}
                formatCurrency={formatCurrency}
                formatPercent={formatPercent}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Strategy Card Component
// ============================================================================

function StrategyCard({
  strategy,
  onClick,
  formatCurrency,
  formatPercent
}: {
  strategy: StrategySummary;
  onClick: () => void;
  formatCurrency: (v: number) => string;
  formatPercent: (v: number) => string;
}) {
  const pnlPositive = strategy.totalUnrealizedPnl >= 0;

  return (
    <div
      onClick={onClick}
      className="bg-card rounded-lg border p-5 cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
            {strategy.strategyName}
          </h3>
          <p className="text-xs text-muted-foreground">{strategy.strategyCode}</p>
        </div>
        <div className="flex items-center gap-2">
          {strategy.isActive && strategy.openPositions > 0 && (
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
              {strategy.openPositions} Open
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </div>

      {/* Unrealized P&L - Main Metric */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-1">Unrealized P&L</p>
        <div className="flex items-center gap-2">
          {pnlPositive ? (
            <ArrowUpRight className="h-5 w-5 text-green-600" />
          ) : (
            <ArrowDownRight className="h-5 w-5 text-red-600" />
          )}
          <span className={`text-2xl font-bold ${pnlPositive ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(strategy.totalUnrealizedPnl)}
          </span>
          <span className={`text-sm ${pnlPositive ? 'text-green-600' : 'text-red-600'}`}>
            {formatPercent(strategy.totalUnrealizedPnlPct)}
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
        <div>
          <p className="text-xs text-muted-foreground">Capital</p>
          <p className="text-sm font-medium text-foreground">
            {formatCurrency(strategy.capitalAllocated)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Trades</p>
          <p className="text-sm font-medium text-foreground">{strategy.totalTrades}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="text-sm font-medium text-foreground">{strategy.winRate.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Strategy Positions Table (Modal)
// ============================================================================

function StrategyPositionsTable({
  positions,
  formatCurrency,
  formatPercent,
  onClosePosition
}: {
  positions: Position[];
  formatCurrency: (v: number) => string;
  formatPercent: (v: number) => string;
  onClosePosition: (id: string) => void;
}) {
  if (positions.length === 0) {
    return (
      <div className="text-center py-8">
        <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No active positions for this strategy</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Instrument</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Side</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Size</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Entry</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Current</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">P&L</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">SL / TP</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {positions.map((pos) => (
            <tr key={pos.id} className="hover:bg-muted/25">
              <td className="px-4 py-3 font-medium">{pos.instrument}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${
                  pos.side === 'LONG' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {pos.side}
                </span>
                <span className="text-xs text-muted-foreground ml-2">{pos.leverage}x</span>
              </td>
              <td className="px-4 py-3">{pos.size.toFixed(4)}</td>
              <td className="px-4 py-3">{formatCurrency(pos.entryPrice)}</td>
              <td className="px-4 py-3">{formatCurrency(pos.currentPrice)}</td>
              <td className="px-4 py-3">
                <div className={pos.unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                  <div className="font-medium">{formatCurrency(pos.unrealizedPnl)}</div>
                  <div className="text-xs">{formatPercent(pos.unrealizedPnlPct)}</div>
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                <div>SL: {pos.stopLoss ? formatCurrency(pos.stopLoss) : '-'}</div>
                <div>TP: {pos.takeProfit ? formatCurrency(pos.takeProfit) : '-'}</div>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onClosePosition(pos.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                  title="Close position"
                >
                  <X className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Strategy Orders Table (Modal) - with detailed info
// ============================================================================

function StrategyOrdersTable({
  orders,
  formatCurrency,
  getStatusColor
}: {
  orders: Order[];
  formatCurrency: (v: number) => string;
  getStatusColor: (s: string) => string;
}) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">No order history for this strategy</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Time</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Instrument</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Side</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Qty / Price</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Fees</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">P&L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-muted/25">
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {new Date(order.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-3 font-medium">{order.instrument}</td>
              <td className="px-4 py-3 text-xs">{order.type}</td>
              <td className="px-4 py-3">
                <span className={order.side === 'BUY' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {order.side}
                </span>
              </td>
              <td className="px-4 py-3">
                <div>{order.amount.toFixed(4)}</div>
                <div className="text-xs text-muted-foreground">@ {formatCurrency(order.price)}</div>
                {order.exitPrice && (
                  <div className="text-xs text-muted-foreground">Exit: {formatCurrency(order.exitPrice)}</div>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded border ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
                {order.exitReason && (
                  <div className="text-xs text-muted-foreground mt-1">{order.exitReason}</div>
                )}
              </td>
              <td className="px-4 py-3 text-xs">
                {order.fees > 0 ? formatCurrency(order.fees) : '-'}
              </td>
              <td className="px-4 py-3">
                {order.pnl !== undefined && order.pnl !== null ? (
                  <span className={order.pnl >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                    {formatCurrency(order.pnl)}
                  </span>
                ) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Strategy P&L Analysis (Modal)
// ============================================================================

function StrategyPnLAnalysis({
  strategy,
  formatCurrency,
  formatPercent
}: {
  strategy: StrategySummary;
  formatCurrency: (v: number) => string;
  formatPercent: (v: number) => string;
}) {
  // Calculate additional metrics from orders
  const closedOrders = strategy.orders.filter(o => o.status === 'CLOSED');
  const totalFees = closedOrders.reduce((sum, o) => sum + (o.fees || 0), 0);
  const winningTrades = closedOrders.filter(o => (o.pnl || 0) > 0).length;
  const losingTrades = closedOrders.filter(o => (o.pnl || 0) < 0).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Realized P&L</p>
          <p className={`text-xl font-bold ${strategy.realizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(strategy.realizedPnl)}
          </p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Unrealized P&L</p>
          <p className={`text-xl font-bold ${strategy.totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(strategy.totalUnrealizedPnl)}
          </p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
          <p className="text-xl font-bold text-foreground">{strategy.winRate.toFixed(1)}%</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Fees</p>
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalFees)}</p>
        </div>
      </div>

      {/* Trade Breakdown */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-3">Trade Breakdown</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total Trades</p>
            <p className="text-lg font-semibold">{strategy.totalTrades}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Winning</p>
            <p className="text-lg font-semibold text-green-600">{winningTrades}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Losing</p>
            <p className="text-lg font-semibold text-red-600">{losingTrades}</p>
          </div>
        </div>
      </div>

      {/* Open Positions Summary */}
      {strategy.openPositions > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-800 mb-2">Open Positions</h4>
          <p className="text-sm text-blue-700">
            {strategy.openPositions} position(s) currently open with {formatCurrency(strategy.capitalAllocated)} capital allocated.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Global Orders Table
// ============================================================================

function GlobalOrdersTable({
  orders,
  formatCurrency,
  getStatusColor
}: {
  orders: Order[];
  formatCurrency: (v: number) => string;
  getStatusColor: (s: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Strategy</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Instrument</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Type / Side</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Amount / Price</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Fees</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-muted/25">
              <td className="px-6 py-4">
                <div className="font-medium text-foreground">{order.strategyName}</div>
                <div className="text-xs text-muted-foreground">{order.strategyCode}</div>
              </td>
              <td className="px-6 py-4">
                <div className="text-foreground">{order.instrument}</div>
                <div className="text-xs text-muted-foreground">ID: {order.id.slice(-8)}</div>
              </td>
              <td className="px-6 py-4">
                <div className="text-foreground">{order.type}</div>
                <div className={`text-xs font-medium ${order.side === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                  {order.side}
                </div>
              </td>
              <td className="px-6 py-4">
                <div>{order.amount.toFixed(4)}</div>
                <div className="text-xs text-muted-foreground">@ {formatCurrency(order.price)}</div>
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded border ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
                {order.filled > 0 && order.filled < order.amount && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Filled: {((order.filled / order.amount) * 100).toFixed(1)}%
                  </div>
                )}
              </td>
              <td className="px-6 py-4 text-xs">
                {order.fees > 0 ? formatCurrency(order.fees) : '-'}
              </td>
              <td className="px-6 py-4 text-xs text-muted-foreground">
                {new Date(order.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
