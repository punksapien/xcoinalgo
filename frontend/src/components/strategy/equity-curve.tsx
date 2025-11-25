'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/lib/auth';

interface EquityCurveData {
  date: string;
  dailyPnl: number;
  cumulativePnl: number;
}

interface Stats {
  grossPnl: number;
  netPnl: number;
  totalFees: number;
  totalTrades: number;
  winRate: number;
  maxDrawdownPct: number;
}

interface EquityCurveProps {
  subscriptionId: string;
  height?: number;
  showStats?: boolean;
}

export function EquityCurve({ subscriptionId, height = 60, showStats = false }: EquityCurveProps) {
  const [data, setData] = useState<EquityCurveData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    const fetchEquityCurve = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/strategies/subscriptions/${subscriptionId}/equity-curve`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch equity curve data');
        }

        const result = await response.json();
        setData(result.equityCurve || []);
        setStats(result.stats || null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chart');
        setData([]);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEquityCurve();
  }, [subscriptionId, token]);

  if (loading) {
    return (
      <div className="w-full" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full" style={{ height }}>
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          Chart unavailable
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full" style={{ height }}>
        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
          No trading data yet
        </div>
      </div>
    );
  }

  // Calculate Y-axis domain to always include 0
  const pnlValues = data.map(d => d.cumulativePnl);
  const minPnl = Math.min(0, ...pnlValues);
  const maxPnl = Math.max(0, ...pnlValues);

  // Calculate where zero line falls as a percentage (for gradient split)
  const range = maxPnl - minPnl;
  const zeroPercent = range > 0 ? ((maxPnl - 0) / range) * 100 : 50;

  // Determine overall trend for line color
  const finalPnl = data[data.length - 1]?.cumulativePnl || 0;
  const lineColor = finalPnl >= 0 ? '#22c55e' : '#ef4444';

  // Unique gradient IDs per subscription
  const gradientId = `gradient-${subscriptionId}`;

  return (
    <div className="w-full space-y-3">
      {/* Stats Section */}
      {showStats && stats && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          <div className="bg-secondary/20 rounded p-2">
            <p className="text-muted-foreground">Gross P&L</p>
            <p className={`font-bold ${stats.grossPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{stats.grossPnl.toFixed(2)}
            </p>
          </div>
          <div className="bg-secondary/20 rounded p-2">
            <p className="text-muted-foreground">Net P&L</p>
            <p className={`font-bold ${stats.netPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{stats.netPnl.toFixed(2)}
            </p>
          </div>
          <div className="bg-secondary/20 rounded p-2">
            <p className="text-muted-foreground">Total Fees</p>
            <p className="font-semibold text-amber-600">₹{stats.totalFees.toFixed(2)}</p>
          </div>
          <div className="bg-secondary/20 rounded p-2">
            <p className="text-muted-foreground">Total Trades</p>
            <p className="font-semibold">{stats.totalTrades}</p>
          </div>
          <div className="bg-secondary/20 rounded p-2">
            <p className="text-muted-foreground">Win Rate</p>
            <p className="font-semibold text-green-600">{stats.winRate.toFixed(1)}%</p>
          </div>
          <div className="bg-secondary/20 rounded p-2">
            <p className="text-muted-foreground">Max DD</p>
            <p className="font-semibold text-red-600">{stats.maxDrawdownPct.toFixed(2)}%</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              {/* Split gradient: green above zero line, red below */}
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                {/* Green zone (above zero) */}
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset={`${zeroPercent}%`} stopColor="#22c55e" stopOpacity={0.1} />
                {/* Red zone (below zero) */}
                <stop offset={`${zeroPercent}%`} stopColor="#ef4444" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              hide={true}
            />
            <YAxis
              hide={true}
              domain={[minPnl, maxPnl]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [`₹${value.toFixed(2)}`, 'P&L']}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Area
              type="monotone"
              dataKey="cumulativePnl"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
