'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { TrendingUp, TrendingDown, Target, BarChart3, DollarSign, Clock, AlertTriangle } from 'lucide-react'

interface BacktestMetrics {
  winPercentage: number
  lossPercentage: number
  numberOfTrades: number
  averageProfitPerTrade: number
  averageProfitOnWinningTrades: number
  averageLossOnLosingTrades: number
  maxProfitInSingleTrade: number
  maxLossInSingleTrade: number
  totalCharges: number
  maxDrawdown: number
  durationOfMaxDrawdown: {
    start: string
    end: string
    duration: string
  }
  returnMaxDD: number
  rewardToRiskRatio: number
  expectancyRatio: number
  maxWinStreak: number
  maxLossStreak: number
  maxTradesInDrawdown: number
}

interface BacktestResults {
  disclaimerText: string
  curveFittingAnalysis: {
    instrument: string
    ticker: string
    created: string
    holdings: string
    marketValue: string
  }
  reportMultiplier: string
  currency: string
  netPnl: number
  realizedPnl: number
  metrics: BacktestMetrics
}

interface BacktestResultsProps {
  data: BacktestResults
}

export function BacktestResults({ data }: BacktestResultsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`
  }

  const formatNumber = (value: number) => {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const MetricCard = ({
    icon: Icon,
    title,
    value,
    subValue,
    trend,
    className = ""
  }: {
    icon: any,
    title: string,
    value: string,
    subValue?: string,
    trend?: 'positive' | 'negative' | 'neutral',
    className?: string
  }) => (
    <div className={`bg-secondary/30 rounded-lg p-4 space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{title}</span>
      </div>
      <div className="space-y-1">
        <p className={`text-xl font-bold ${
          trend === 'positive' ? 'text-emerald-500' :
          trend === 'negative' ? 'text-red-500' :
          'text-foreground'
        }`}>
          {value}
        </p>
        {subValue && (
          <p className="text-sm text-muted-foreground">{subValue}</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              {data.disclaimerText}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Overall Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={DollarSign}
          title="Net P&L"
          value={formatCurrency(data.netPnl)}
          trend={data.netPnl > 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          icon={DollarSign}
          title="Realized P&L"
          value={formatCurrency(data.realizedPnl)}
          trend={data.realizedPnl > 0 ? 'positive' : 'negative'}
        />
        <MetricCard
          icon={TrendingUp}
          title="Win Rate"
          value={formatPercentage(data.metrics.winPercentage)}
          subValue={`Loss: ${formatPercentage(data.metrics.lossPercentage)}`}
          trend="positive"
        />
        <MetricCard
          icon={BarChart3}
          title="Total Trades"
          value={data.metrics.numberOfTrades.toString()}
          trend="neutral"
        />
      </div>

      {/* Detailed Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Detailed Performance Metrics
          </CardTitle>
          <CardDescription>
            Comprehensive analysis of backtest results from {data.curveFittingAnalysis.created}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trading Performance */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Trading Performance
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Profit/Trade</p>
                  <p className="text-lg font-semibold text-emerald-500">
                    {formatCurrency(data.metrics.averageProfitPerTrade)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expectancy Ratio</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatPercentage(data.metrics.expectancyRatio)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Win</p>
                  <p className="text-lg font-semibold text-emerald-500">
                    {formatCurrency(data.metrics.averageProfitOnWinningTrades)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Loss</p>
                  <p className="text-lg font-semibold text-red-500">
                    {formatCurrency(data.metrics.averageLossOnLosingTrades)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Max Win</p>
                  <p className="text-lg font-semibold text-emerald-500">
                    {formatCurrency(data.metrics.maxProfitInSingleTrade)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Max Loss</p>
                  <p className="text-lg font-semibold text-red-500">
                    {formatCurrency(data.metrics.maxLossInSingleTrade)}
                  </p>
                </div>
              </div>
            </div>

            {/* Risk Metrics */}
            <div className="space-y-4">
              <h4 className="font-semibold text-lg flex items-center gap-2">
                <TrendingDown className="h-4 w-4" />
                Risk Metrics
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Max Drawdown</p>
                  <p className="text-lg font-semibold text-red-500">
                    {formatCurrency(Math.abs(data.metrics.maxDrawdown))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Return/Max DD</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatNumber(data.metrics.returnMaxDD)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reward/Risk</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatNumber(data.metrics.rewardToRiskRatio)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Charges</p>
                  <p className="text-lg font-semibold text-muted-foreground">
                    {formatCurrency(data.metrics.totalCharges)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Max Win Streak</p>
                  <p className="text-lg font-semibold text-emerald-500">
                    {data.metrics.maxWinStreak}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Max Loss Streak</p>
                  <p className="text-lg font-semibold text-red-500">
                    {data.metrics.maxLossStreak}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Drawdown Analysis */}
          <div className="space-y-4">
            <h4 className="font-semibold text-lg flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Drawdown Analysis
            </h4>
            <div className="bg-secondary/20 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="text-lg font-semibold text-foreground">
                    {data.metrics.durationOfMaxDrawdown.duration}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Start Date</p>
                  <p className="text-lg font-semibold text-foreground">
                    {new Date(data.metrics.durationOfMaxDrawdown.start).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">End Date</p>
                  <p className="text-lg font-semibold text-foreground">
                    {new Date(data.metrics.durationOfMaxDrawdown.end).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Trades in Drawdown</p>
                <p className="text-lg font-semibold text-foreground">
                  {data.metrics.maxTradesInDrawdown} trades
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Strategy Info */}
          <div className="space-y-4">
            <h4 className="font-semibold text-lg">Strategy Configuration</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Instrument</p>
                <p className="font-semibold">{data.curveFittingAnalysis.instrument}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ticker</p>
                <p className="font-semibold">{data.curveFittingAnalysis.ticker}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Holdings</p>
                <p className="font-semibold">{data.curveFittingAnalysis.holdings}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Market Value</p>
                <p className="font-semibold">{data.curveFittingAnalysis.marketValue}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}