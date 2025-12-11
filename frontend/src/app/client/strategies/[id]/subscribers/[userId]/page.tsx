'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileDown, TrendingUp, TrendingDown, Clock, Target } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TradeOrder {
  id: string;
  orderType: string;
  side: string;
  quantity: number;
  filledPrice: number | null;
  expectedPrice: number | null;
  slippage: number | null;
  status: string;
  signalGeneratedAt: string;
  orderPlacedAt: string | null;
  orderFilledAt: string | null;
  exchangeOrderId: string | null;
  clientOrderId: string | null;
  fees: number;
}

interface TradeCycle {
  id: string;
  cycleNumber: number;
  strategySignal: string | null;
  symbol: string;
  openedAt: string;
  closedAt: string | null;
  status: string;
  entryPrice: number;
  exitPrice: number | null;
  totalQuantity: number;
  grossPnl: number | null;
  netPnl: number | null;
  fees: number;
  pnlPercentage: number | null;
  holdingTime: number | null;
  exitReason: string | null;
  orders: TradeOrder[];
}

interface SubscriberSummary {
  totalCycles: number;
  winningCycles: number;
  losingCycles: number;
  winRate: number;
  totalPnl: number;
  avgHoldingTime: number;
}

interface EquityCurvePoint {
  date: string;
  cumulative_pnl: number;
}

export default function SubscriberAuditView({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SubscriberSummary | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityCurvePoint[]>([]);
  const [tradeCycles, setTradeCycles] = useState<TradeCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<TradeCycle | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    fetchSubscriberData();
  }, [resolvedParams.id, resolvedParams.userId]);

  const fetchSubscriberData = async () => {
    try {
      setLoading(true);

      // Find subscription ID for this user + strategy
      const subsResponse = await fetch('/api/strategies/subscriptions', {
        credentials: 'include'
      });
      const subsData = await subsResponse.json();
      const sub = subsData.subscriptions?.find(
        (s: any) => s.strategyId === resolvedParams.id && s.userId === resolvedParams.userId
      );

      if (!sub) {
        throw new Error('Subscription not found');
      }

      setSubscription(sub);

      // Fetch summary and equity curve
      const summaryResponse = await fetch(`/api/trade-cycles/subscriber/${sub.id}/summary`, {
        credentials: 'include'
      });
      const summaryData = await summaryResponse.json();
      setSummary(summaryData.summary);
      setEquityCurve(summaryData.equityCurve || []);

      // Fetch trade cycles
      const cyclesResponse = await fetch(`/api/trade-cycles/subscription/${sub.id}?limit=50`, {
        credentials: 'include'
      });
      const cyclesData = await cyclesResponse.json();
      setTradeCycles(cyclesData.tradeCycles || []);
    } catch (error) {
      console.error('Error fetching subscriber data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/trade-cycles/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subscriptionId: subscription?.id,
          format: 'csv'
        })
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trade-cycles-${subscription?.id}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting CSV:', error);
    }
  };

  const handleViewLogs = (cycle: TradeCycle) => {
    setSelectedCycle(cycle);
    setShowOrderModal(true);
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Chart data
  const chartData = {
    labels: equityCurve.map(point => new Date(point.date).toLocaleDateString()),
    datasets: [
      {
        label: 'Cumulative P&L',
        data: equityCurve.map(point => point.cumulative_pnl),
        borderColor: equityCurve[equityCurve.length - 1]?.cumulative_pnl >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
        backgroundColor: equityCurve[equityCurve.length - 1]?.cumulative_pnl >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (context: any) => `P&L: ${formatCurrency(context.parsed.y)}`
        }
      }
    },
    scales: {
      y: {
        ticks: {
          callback: (value: any) => formatCurrency(value)
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading subscriber data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Strategy
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Subscriber Performance Audit</h1>
        <p className="text-gray-600 mt-1">Detailed trade cycle analysis and execution logs</p>
      </div>

      {/* Equity Curve */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
          Equity Curve
        </h2>
        <div className="h-64">
          {equityCurve.length > 0 ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              No closed trades yet
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Performance Summary</h2>
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Total Cycles</div>
            <div className="text-2xl font-bold">{summary?.totalCycles || 0}</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Winning</div>
            <div className="text-2xl font-bold text-green-600">{summary?.winningCycles || 0}</div>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Losing</div>
            <div className="text-2xl font-bold text-red-600">{summary?.losingCycles || 0}</div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Win Rate</div>
            <div className="text-2xl font-bold text-blue-600">{summary?.winRate.toFixed(1)}%</div>
          </div>
          <div className={`p-4 rounded-lg ${(summary?.totalPnl || 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="text-sm text-gray-600 mb-1">Total P&L</div>
            <div className={`text-2xl font-bold ${(summary?.totalPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(summary?.totalPnl || 0)}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Avg Hold Time</div>
            <div className="text-2xl font-bold">{summary?.avgHoldingTime.toFixed(0)}m</div>
          </div>
        </div>
      </div>

      {/* Trade Cycle History */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4">Trade Cycle History</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Cycle #</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Opened</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Closed</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Signal</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Net P&L</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tradeCycles.map((cycle) => (
                <tr key={cycle.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">#{cycle.cycleNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatTime(cycle.openedAt)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {cycle.closedAt ? formatTime(cycle.closedAt) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{cycle.strategySignal || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      cycle.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' :
                      cycle.status === 'OPEN' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {cycle.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm font-semibold text-right ${
                    (cycle.netPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {cycle.netPnl !== null ? formatCurrency(cycle.netPnl) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleViewLogs(cycle)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      View Logs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Audit Modal (will be implemented next) */}
      {showOrderModal && selectedCycle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">
                  Cycle #{selectedCycle.cycleNumber} - Order Execution Timeline
                </h2>
                <button
                  onClick={() => setShowOrderModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">Order audit modal - Coming next!</p>
              <pre className="bg-gray-50 p-4 rounded text-xs overflow-x-auto">
                {JSON.stringify(selectedCycle, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
