'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, BarChart3, Calendar } from 'lucide-react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface ChartDataPoint {
  date: string
  value: number
}

interface PerformanceChartsProps {
  cumulativePnl: ChartDataPoint[]
  drawdown: ChartDataPoint[]
}

export function PerformanceCharts({ cumulativePnl, drawdown }: PerformanceChartsProps) {
  const [activeChart, setActiveChart] = useState<'pnl' | 'drawdown'>('pnl')

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) => {
    if (active && payload && payload.length && label) {
      const value = payload[0].value
      const formattedDate = new Date(label).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

      return (
        <div className="bg-background/95 backdrop-blur border rounded-lg shadow-lg p-3">
          <p className="text-sm text-muted-foreground">{formattedDate}</p>
          <p className={`text-lg font-semibold ${
            activeChart === 'pnl'
              ? value >= 0 ? 'text-emerald-500' : 'text-red-500'
              : 'text-red-500'
          }`}>
            {activeChart === 'pnl'
              ? `P&L: ${formatCurrency(value)}`
              : `Drawdown: ${formatCurrency(value)}`
            }
          </p>
        </div>
      )
    }
    return null
  }

  const maxPnl = Math.max(...cumulativePnl.map(d => d.value))
  const minPnl = Math.min(...cumulativePnl.map(d => d.value))
  const maxDrawdown = Math.min(...drawdown.map(d => d.value))
  const totalReturn = cumulativePnl[cumulativePnl.length - 1]?.value || 0

  return (
    <div className="space-y-6">
      {/* Chart Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Performance Charts
              </CardTitle>
              <CardDescription>
                Interactive visualization of strategy performance over time
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={activeChart === 'pnl' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveChart('pnl')}
                className="flex items-center gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                Cumulative P&L
              </Button>
              <Button
                variant={activeChart === 'drawdown' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveChart('drawdown')}
                className="flex items-center gap-2"
              >
                <TrendingDown className="h-4 w-4" />
                Drawdown
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Key Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Total Return</p>
              <p className={`text-xl font-bold ${totalReturn >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {formatCurrency(totalReturn)}
              </p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Max P&L</p>
              <p className="text-xl font-bold text-emerald-500">
                {formatCurrency(maxPnl)}
              </p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Min P&L</p>
              <p className="text-xl font-bold text-red-500">
                {formatCurrency(minPnl)}
              </p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Max Drawdown</p>
              <p className="text-xl font-bold text-red-500">
                {formatCurrency(maxDrawdown)}
              </p>
            </div>
          </div>

          {/* Chart Container */}
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {activeChart === 'pnl' ? (
                <AreaChart
                  data={cumulativePnl}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 20,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    className="text-xs"
                    stroke="currentColor"
                  />
                  <YAxis
                    tickFormatter={(value) => formatCurrency(value)}
                    className="text-xs"
                    stroke="currentColor"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="currentColor" strokeDasharray="2 2" className="opacity-50" />
                  <defs>
                    <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#pnlGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#10b981" }}
                  />
                </AreaChart>
              ) : (
                <AreaChart
                  data={drawdown}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 20,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    className="text-xs"
                    stroke="currentColor"
                  />
                  <YAxis
                    tickFormatter={(value) => formatCurrency(value)}
                    className="text-xs"
                    stroke="currentColor"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="currentColor" strokeDasharray="2 2" className="opacity-50" />
                  <defs>
                    <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#drawdownGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#ef4444" }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Chart Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>Data from {formatDate(cumulativePnl[0]?.date)} to {formatDate(cumulativePnl[cumulativePnl.length - 1]?.date)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Chart Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Chart Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Cumulative P&L Insights
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Shows overall profitability trend over time</li>
                <li>• Green areas indicate profitable periods</li>
                <li>• Steep upward slopes show rapid profit generation</li>
                <li>• Flat areas indicate consolidation periods</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                Drawdown Analysis
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Measures peak-to-trough decline in account value</li>
                <li>• Deeper valleys indicate higher risk periods</li>
                <li>• Recovery time shows strategy resilience</li>
                <li>• Helps assess risk tolerance requirements</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}