'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, BarChart3, TrendingUp, Target, DollarSign, Calendar, Users, Award, Info, Activity, LineChart, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import strategyDetailsData from '@/data/strategy-details.json'
import { BacktestResults } from '@/components/strategy/backtest-results'
import { PerformanceCharts } from '@/components/strategy/performance-charts'
import { TradeSummary } from '@/components/strategy/trade-summary'

interface StrategyData {
  id: string
  name: string
  code: string
  description: string
  detailedDescription: string
  author: string
  instrument: string
  tags: string
  winRate: number
  riskReward: number
  maxDrawdown: number
  roi: number
  marginRequired: number
  deploymentCount: number
  createdAt: string
  isFree: boolean
  supportedCryptocurrencies: Array<{
    symbol: string
    name: string
    pair: string
    marketCap: number
    price: number
    volume24h: number
  }>
  backtestResults: {
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
    metrics: {
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
  }
  chartData: {
    cumulativePnl: Array<{ date: string; value: number }>
    drawdown: Array<{ date: string; value: number }>
  }
  tradeSummary: {
    [year: string]: {
      [month: string]: number
    }
  }
  trades: Array<{
    id: number
    entryTime: string
    exitTime: string
    entryDate: string
    exitDate: string
    orderType: string
    strike: string
    action: string
    quantity: number
    entryPrice: number
    exitPrice: number
    profitLoss: number
    charges: number
  }>
  features: {
    indicators: string[]
    timeframes: string[]
    riskManagement: string
    leverage: number
    riskPerTrade: number
  }
}

const StrategyHeader = ({ strategy, onBack }: { strategy: StrategyData; onBack: () => void }) => {
  return (
    <div className="space-y-6">
      {/* Navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="hover:bg-secondary/80 transition-all duration-200 hover:scale-105"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      {/* Hero Section */}
      <Card className="border-border/50 shadow-lg hover:shadow-xl transition-all duration-300">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold text-foreground bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    {strategy.name}
                  </h1>
                  <p className="text-muted-foreground font-mono text-sm">{strategy.code}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {strategy.isFree ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1">
                      🎉 Free Strategy
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 px-3 py-1">
                      ⭐ Premium Strategy
                    </Badge>
                  )}
                </div>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                {strategy.description}
              </p>

              <div className="flex flex-wrap gap-2">
                {strategy.tags.split(',').map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs hover:bg-primary/10 transition-colors">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground pt-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Created {new Date(strategy.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{strategy.deploymentCount} deployments</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  <span>By {strategy.author}</span>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/20 rounded-lg p-3 text-center hover:bg-secondary/30 transition-colors">
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                  <p className="text-2xl font-bold text-emerald-500">{strategy.winRate}%</p>
                </div>
                <div className="bg-secondary/20 rounded-lg p-3 text-center hover:bg-secondary/30 transition-colors">
                  <p className="text-xs text-muted-foreground">ROI</p>
                  <p className="text-2xl font-bold text-emerald-500">{strategy.roi}%</p>
                </div>
                <div className="bg-secondary/20 rounded-lg p-3 text-center hover:bg-secondary/30 transition-colors">
                  <p className="text-xs text-muted-foreground">Risk/Reward</p>
                  <p className="text-2xl font-bold text-foreground">{strategy.riskReward}</p>
                </div>
                <div className="bg-secondary/20 rounded-lg p-3 text-center hover:bg-secondary/30 transition-colors">
                  <p className="text-xs text-muted-foreground">Max DD</p>
                  <p className="text-2xl font-bold text-red-500">{strategy.maxDrawdown}%</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Margin Required</span>
                  <span className="font-semibold">${strategy.marginRequired.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Instrument</span>
                  <span className="font-semibold">{strategy.instrument}</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Button className="w-full bg-primary hover:bg-primary/90 transition-all hover:scale-105">
                  Deploy Strategy
                </Button>
                <Button variant="outline" className="w-full hover:bg-secondary/50 transition-all">
                  Simulate with Paper Trading
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function StrategyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [strategy, setStrategy] = useState<StrategyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const strategyId = params.id as string
    const strategyData = (strategyDetailsData as Record<string, unknown>)[strategyId]

    if (strategyData && typeof strategyData === 'object' && 'id' in strategyData) {
      setStrategy(strategyData as StrategyData)
    }

    setLoading(false)
  }, [params.id])

  const handleBack = () => {
    router.push('/dashboard')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!strategy) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <h2 className="text-xl font-semibold">Strategy Not Found</h2>
        <p className="text-muted-foreground">The requested strategy could not be found.</p>
        <Button onClick={handleBack} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <StrategyHeader strategy={strategy} onBack={handleBack} />

        {/* Strategy Overview Section */}
        <section id="overview" className="scroll-mt-6">
          <Card className="border-border/50 shadow-md hover:shadow-lg transition-all duration-300">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Info className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">About This Strategy</CardTitle>
                  <CardDescription>Detailed information and technical specifications</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div>
                    <p className="text-muted-foreground leading-relaxed">
                      {strategy.detailedDescription}
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-semibold flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Strategy Features
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Indicators</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {strategy.features.indicators.map((indicator, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {indicator}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Timeframes</p>
                          <p className="font-medium">{strategy.features.timeframes.join(', ')}</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Risk Management</p>
                          <p className="font-medium">{strategy.features.riskManagement}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Risk per Trade</p>
                          <p className="font-medium">{(strategy.features.riskPerTrade * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-semibold">Supported Cryptocurrencies</h4>
                    {strategy.supportedCryptocurrencies.map((crypto, index) => (
                      <div key={index} className="bg-secondary/20 rounded-lg p-4 hover:bg-secondary/30 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold">{crypto.name} ({crypto.symbol})</h5>
                          <Badge variant="outline">{crypto.pair}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Price</p>
                            <p className="font-medium">${crypto.price.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">24h Volume</p>
                            <p className="font-medium">${(crypto.volume24h / 1000000000).toFixed(1)}B</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Market Cap</p>
                            <p className="font-medium">${(crypto.marketCap / 1000000000000).toFixed(1)}T</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Card className="sticky top-6">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Key Performance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-center py-2">
                        <p className="text-4xl font-bold text-emerald-500">{strategy.winRate}%</p>
                        <p className="text-sm text-muted-foreground">Win Rate</p>
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ROI</span>
                          <span className="font-semibold text-emerald-500">{strategy.roi}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Risk/Reward</span>
                          <span className="font-semibold">{strategy.riskReward}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max Drawdown</span>
                          <span className="font-semibold text-red-500">{strategy.maxDrawdown}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Leverage</span>
                          <span className="font-semibold">{strategy.features.leverage}x</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Backtest Results Section */}
        <section id="backtest" className="scroll-mt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Backtest Results</h2>
              <p className="text-muted-foreground">Historical performance metrics and analysis</p>
            </div>
          </div>
          <BacktestResults data={strategy.backtestResults} />
        </section>

        {/* Performance Charts Section */}
        <section id="charts" className="scroll-mt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <LineChart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Performance Charts</h2>
              <p className="text-muted-foreground">Interactive visualization of P&L and drawdown</p>
            </div>
          </div>
          <PerformanceCharts
            cumulativePnl={strategy.chartData.cumulativePnl}
            drawdown={strategy.chartData.drawdown}
          />
        </section>

        {/* Trade Analysis Section */}
        <section id="trades" className="scroll-mt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Trade Analysis</h2>
              <p className="text-muted-foreground">Detailed trading history and summary reports</p>
            </div>
          </div>
          <TradeSummary
            tradeSummary={strategy.tradeSummary}
            trades={strategy.trades}
          />
        </section>
      </div>
    </DashboardLayout>
  )
}