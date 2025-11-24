'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/lib/auth';

interface EquityCurveData {
  date: string;
  dailyPnl: number;
  cumulativePnl: number;
}

interface EquityCurveProps {
  subscriptionId: string;
  height?: number;
}

export function EquityCurve({ subscriptionId, height = 60 }: EquityCurveProps) {
  const [data, setData] = useState<EquityCurveData[]>([]);
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
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chart');
        setData([]);
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

  // Determine if overall P&L is positive or negative
  const finalPnl = data[data.length - 1]?.cumulativePnl || 0;
  const lineColor = finalPnl >= 0 ? '#22c55e' : '#ef4444'; // green-500 or red-500

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <XAxis
            dataKey="date"
            hide={true}
          />
          <YAxis
            hide={true}
            domain={['auto', 'auto']}
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
          <Line
            type="monotone"
            dataKey="cumulativePnl"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
