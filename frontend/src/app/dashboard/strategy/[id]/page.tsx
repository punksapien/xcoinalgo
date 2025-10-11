'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Calendar, Users, Award, Info, Activity, TrendingUp, Code, Clock, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/lib/auth'
import { SubscribeModal } from '@/components/strategy/subscribe-modal'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface BacktestResult {
  id: string
  startDate: string
  endDate: string
  initialBalance: number
  finalBalance: number
  totalReturn: number
  totalReturnPct: number
  maxDrawdown: number
  maxDrawdownPct: number
  sharpeRatio: number
  winRate: number
  profitFactor: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  avgTrade: number
  avgWinningTrade: number
  avgLosingTrade: number
  maxProfit: number
  maxLoss: number
  totalCharges: number
  netPnl: number
  realizedPnl: number
  rewardToRiskRatio: number
  expectancyRatio: number
  maxWinStreak: number
  maxLossStreak: number
  maxTradesInDrawdown: number
  maxDrawdownDuration: string
  returnMaxDD: number
  equityCurve: Record<string, unknown>
  tradeHistory: Trade[]
  createdAt: string
}

interface Trade {
  index: number
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
  remarks: string
}

interface StrategyData {
  id: string
  name: string
  code: string
  description?: string
  author: string
  version: string
  isActive: boolean
  isPublic: boolean
  isMarketplace: boolean
  subscriberCount: number
  tags: string
  winRate?: number
  roi?: number
  riskReward?: number
  maxDrawdown?: number
  sharpeRatio?: number
  totalTrades?: number
  profitFactor?: number
  executionConfig?: {
    symbol: string
    resolution: string
    lookbackPeriod?: number
  }
  latestBacktest?: BacktestResult
  createdAt: string
  updatedAt: string
}

interface UserSubscription {
  strategyId: string
  isActive: boolean
  isPaused: boolean
}

const StrategyHeader = ({
  strategy,
  onBack,
  onSubscribe,
  userSubscription
}: {
  strategy: StrategyData
  onBack: () => void
  onSubscribe: () => void
  userSubscription?: UserSubscription
}) => {
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
          Back
        </Button>
      </div>

      {/* Hero Section */}
      <Card className="border-border/50 shadow-lg hover:shadow-xl transition-all duration-300">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold text-foreground">
                    {strategy.name}
                  </h1>
                  <p className="text-muted-foreground font-mono text-sm">{strategy.code}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {strategy.isActive ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                  {strategy.isPublic && (
                    <Badge variant="outline">Public</Badge>
                  )}
                  {strategy.isMarketplace && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      Marketplace
                    </Badge>
                  )}
                </div>
              </div>

              <p className="text-muted-foreground leading-relaxed">
                {strategy.description || 'No description provided'}
              </p>

              {strategy.tags && (
                <div className="flex flex-wrap gap-2">
                  {strategy.tags.split(',').map((tag, index) => (
                    <Badge key={index} variant="secondary" className="text-xs hover:bg-primary/10 transition-colors">
                      {tag.trim()}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground pt-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Created {new Date(strategy.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{strategy.subscriberCount} subscriber{strategy.subscriberCount !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  <span>By {strategy.author}</span>
                </div>
              </div>
            </div>

            {/* Quick Info & Actions */}
            <div className="space-y-4">
              <div className="space-y-3 bg-secondary/20 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Version</span>
                </div>
                <p className="text-xl font-semibold">v{strategy.version}</p>
              </div>

              {strategy.executionConfig && (
                <div className="space-y-3 bg-secondary/20 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Trading Pair</span>
                  </div>
                  <p className="text-xl font-semibold">{strategy.executionConfig.symbol}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{strategy.executionConfig.resolution}m candles</span>
                  </div>
                </div>
              )}

              <Separator />

              {/* Subscription Status */}
              {userSubscription && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Your Subscription</span>
                    <Badge
                      className={userSubscription.isPaused ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}
                      variant="secondary"
                    >
                      {userSubscription.isPaused ? 'Paused' : 'Active'}
                    </Badge>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2">
                {userSubscription ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => window.location.href = '/dashboard/subscriptions'}
                  >
                    Manage Subscription
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-primary hover:bg-primary/90 transition-all hover:scale-105"
                    onClick={onSubscribe}
                  >
                    Deploy Bot Now 🚀
                  </Button>
                )}
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
  const { token } = useAuth()
  const [strategy, setStrategy] = useState<StrategyData | null>(null)
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false)
  const [showingUSD, setShowingUSD] = useState(true)
  const [reportMultiplier, setReportMultiplier] = useState(1)

  useEffect(() => {
    fetchStrategy()
  }, [params.id, token])

  const fetchStrategy = async () => {
    try {
      setLoading(true)
      const strategyId = params.id as string

      // Fetch strategy details from marketplace API
      const response = await fetch(
        `/api/marketplace/${strategyId}`,
        {
          headers: token ? {
            'Authorization': `Bearer ${token}`,
          } : {},
        }
      )

      if (response.ok) {
        const data = await response.json()
        setStrategy(data.strategy)

        // Check if user is subscribed to this strategy
        if (token && data.strategy) {
          await checkSubscription(data.strategy.id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch strategy:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkSubscription = async (strategyId: string) => {
    if (!token) return

    try {
      const response = await fetch(
        `/api/strategies/subscriptions`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      )

      if (response.ok) {
        const data = await response.json()
        const subscription = data.subscriptions?.find((sub: { strategyId: string; isActive: boolean; isPaused: boolean }) => sub.strategyId === strategyId)

        if (subscription) {
          setUserSubscription({
            strategyId: subscription.strategyId,
            isActive: subscription.isActive,
            isPaused: subscription.isPaused,
          })
        }
      }
    } catch (error) {
      console.error('Failed to check subscription:', error)
    }
  }

  const handleBack = () => {
    router.push('/dashboard/strategies')
  }

  const handleSubscribe = () => {
    setSubscribeModalOpen(true)
  }

  const handleSubscribeSuccess = () => {
    if (strategy) {
      checkSubscription(strategy.id)
    }
  }

  const formatCurrency = (value: number) => {
    return showingUSD ? `$${value.toFixed(2)}` : `₹${(value * 83).toFixed(2)}`
  }

  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  // Generate monthly trade summary
  const generateMonthlySummary = (trades: Trade[]) => {
    const summary: Record<string, Record<string, number>> = {
      '2024': {},
      '2025': {}
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Total']

    months.forEach(month => {
      summary['2024'][month] = 0
      summary['2025'][month] = 0
    })

    trades.forEach(trade => {
      const date = new Date(trade.exitDate)
      const year = date.getFullYear().toString()
      const monthIndex = date.getMonth()
      const monthName = months[monthIndex]

      if (summary[year]) {
        summary[year][monthName] = (summary[year][monthName] || 0) + trade.profitLoss
        summary[year]['Total'] = (summary[year]['Total'] || 0) + trade.profitLoss
      }
    })

    return summary
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    )
  }

  if (!strategy) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          <h2 className="text-xl font-semibold">Strategy Not Found</h2>
          <p className="text-muted-foreground">The requested strategy could not be found.</p>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Strategies
          </Button>
        </div>
      </div>
    )
  }

  const backtest = strategy.latestBacktest
  const monthlySummary = backtest?.tradeHistory ? generateMonthlySummary(backtest.tradeHistory) : null

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-8">
        <StrategyHeader
          strategy={strategy}
          onBack={handleBack}
          onSubscribe={handleSubscribe}
          userSubscription={userSubscription || undefined}
        />

        {/* Backtest Results Section */}
        {backtest ? (
          <section id="backtest-results" className="scroll-mt-6">
            <Card className="border-border/50 shadow-md">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Activity className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">Backtest Results</CardTitle>
                      <CardDescription>
                        <span className="text-red-500">
                          Following results are backtested results on historical data. These historical simulations do not represent actual trading and have not been executed in the live market.
                        </span>
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={reportMultiplier}
                      onChange={(e) => setReportMultiplier(Number(e.target.value))}
                      className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                    >
                      <option value={1}>1x multiply</option>
                      <option value={2}>2x multiply</option>
                      <option value={5}>5x multiply</option>
                      <option value={10}>10x multiply</option>
                    </select>
                    <button
                      onClick={() => setShowingUSD(!showingUSD)}
                      className="px-4 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent"
                    >
                      💲 Showing in {showingUSD ? 'USD' : 'INR'}
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Curve Fitting Analysis */}
                <div>
                  <h3 className="text-lg font-semibold mb-2">Curve Fitting Analysis</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    The backtest report uses the <span className="font-semibold">{strategy.executionConfig?.symbol}</span> ({strategy.executionConfig?.symbol}) with holding {backtest.totalTrades} Approx 5 to 8k margin of holdings: .
                  </p>

                  {/* Net PNL and Realized PNL */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="border border-primary/30 rounded-lg p-6 text-center">
                      <p className="text-sm text-muted-foreground mb-2">Net PNL</p>
                      <p className="text-3xl font-bold text-green-500">{formatCurrency(backtest.netPnl * reportMultiplier)}</p>
                    </div>
                    <div className="border border-primary/30 rounded-lg p-6 text-center">
                      <p className="text-sm text-muted-foreground mb-2">Realized PNL</p>
                      <p className="text-3xl font-bold text-green-500">{formatCurrency(backtest.realizedPnl * reportMultiplier)}</p>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Win Percentage</p>
                      <p className="text-xl font-semibold text-green-500">{backtest.winRate.toFixed(2)}%</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Number of Trades</p>
                      <p className="text-xl font-semibold">{backtest.totalTrades}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Average Profit on Winning Trades</p>
                      <p className="text-xl font-semibold text-green-500">{formatCurrency(backtest.avgWinningTrade * reportMultiplier)}</p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Loss Percentage</p>
                      <p className="text-xl font-semibold text-green-500">{(100 - backtest.winRate).toFixed(2)}%</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Average Profit per Trade</p>
                      <p className="text-xl font-semibold text-green-500">{formatCurrency(backtest.avgTrade * reportMultiplier)}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Average Loss on Losing Trades</p>
                      <p className="text-xl font-semibold text-red-500">{formatCurrency(backtest.avgLosingTrade * reportMultiplier)}</p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Total charges</p>
                      <p className="text-xl font-semibold text-red-500">{formatCurrency(backtest.totalCharges * reportMultiplier)}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Profit in Single Trade</p>
                      <p className="text-xl font-semibold text-green-500">{formatCurrency(backtest.maxProfit * reportMultiplier)}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Loss in Single Trade</p>
                      <p className="text-xl font-semibold text-red-500">{formatCurrency(backtest.maxLoss * reportMultiplier)}</p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Drawdown</p>
                      <p className="text-xl font-semibold text-red-500">{formatCurrency(backtest.maxDrawdown * reportMultiplier)}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Duration of Max Drawdown</p>
                      <p className="text-xl font-semibold">{backtest.maxDrawdownDuration || 'N/A'}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Return MaxDD</p>
                      <p className="text-xl font-semibold text-green-500">{formatCurrency(backtest.returnMaxDD * reportMultiplier)}</p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Reward to Risk Ratio</p>
                      <p className="text-xl font-semibold text-green-500">{formatCurrency(backtest.rewardToRiskRatio * reportMultiplier)}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Expectancy Ratio</p>
                      <p className="text-xl font-semibold text-green-500">{formatCurrency(backtest.expectancyRatio * reportMultiplier)}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Win Streak</p>
                      <p className="text-xl font-semibold text-green-500">{formatCurrency(backtest.maxWinStreak * reportMultiplier)}</p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Loss Streak</p>
                      <p className="text-xl font-semibold text-green-500">{formatCurrency(backtest.maxLossStreak * reportMultiplier)}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Trades in Drawdown</p>
                      <p className="text-xl font-semibold text-green-500">{formatCurrency(backtest.maxTradesInDrawdown * reportMultiplier)}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Cumulative P&L Chart */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Cumulative P&L</h3>
                    <button className="px-4 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent">
                      📸 Take Snapshot
                    </button>
                  </div>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={backtest.tradeHistory?.map((trade, index) => ({
                          index,
                          pnl: backtest.tradeHistory.slice(0, index + 1).reduce((sum, t) => sum + t.profitLoss, 0)
                        })) || []}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="index" stroke="#9CA3AF" />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1F2937',
                            border: '1px solid #374151',
                            borderRadius: '8px',
                            color: '#F9FAFB'
                          }}
                        />
                        <Line type="monotone" dataKey="pnl" stroke="#3B82F6" strokeWidth={2} dot={false} name="Cumulative P&L" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <Separator />

                {/* Trade Summary */}
                {monthlySummary && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">Trade Summary</h3>
                      <button
                        onClick={() => setShowingUSD(!showingUSD)}
                        className="px-4 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent"
                      >
                        💲 Showing in {showingUSD ? 'USD' : 'INR'}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-primary/10">
                            <th className="border border-border/50 px-4 py-2 text-left">Year</th>
                            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Total'].map(month => (
                              <th key={month} className="border border-border/50 px-4 py-2 text-left">{month}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(monthlySummary).map(([year, months]) => (
                            <tr key={year} className="hover:bg-secondary/20">
                              <td className="border border-border/50 px-4 py-2 font-semibold">{year}</td>
                              {Object.entries(months).map(([month, value]) => (
                                <td
                                  key={month}
                                  className={`border border-border/50 px-4 py-2 ${value > 0 ? 'text-green-500' : value < 0 ? 'text-red-500' : ''}`}
                                >
                                  {value !== 0 ? formatCurrency(value * reportMultiplier) : '$0.00'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        Include Brokerage
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="rounded" />
                        Taxes & Charges
                      </label>
                      <p className="ml-auto text-blue-500">ℹ Returns are annualized for calculation</p>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Full Trade Report */}
                {backtest.tradeHistory && backtest.tradeHistory.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Full Trade Report</h3>
                        <p className="text-sm text-yellow-500">Note: Trade Report is Based on 1x Multiplier</p>
                        <p className="text-sm text-muted-foreground">Showing 1 - {Math.min(10, backtest.tradeHistory.length)} of {backtest.tradeHistory.length} trades</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Search trades..."
                          className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                        />
                        <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          Download Report
                        </button>
                        <button
                          onClick={() => setShowingUSD(!showingUSD)}
                          className="px-4 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent"
                        >
                          💲 Showing in {showingUSD ? 'USD' : 'INR'}
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-primary/10">
                            <th className="border border-border/50 px-3 py-2 text-left">Index #</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Entry Time</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Exit Time</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Entry Date</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Exit Date</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Order Type</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Strike</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Action</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Quantity</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Entry Price</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Exit Price</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Profit Loss</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Charges</th>
                            <th className="border border-border/50 px-3 py-2 text-left">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backtest.tradeHistory.slice(0, 10).map((trade) => (
                            <tr key={trade.index} className="hover:bg-secondary/20">
                              <td className="border border-border/50 px-3 py-2">{trade.index}</td>
                              <td className="border border-border/50 px-3 py-2">{trade.entryTime}</td>
                              <td className="border border-border/50 px-3 py-2">{trade.exitTime}</td>
                              <td className="border border-border/50 px-3 py-2">{trade.entryDate}</td>
                              <td className="border border-border/50 px-3 py-2">{trade.exitDate}</td>
                              <td className="border border-border/50 px-3 py-2">{trade.orderType}</td>
                              <td className="border border-border/50 px-3 py-2">{trade.strike}</td>
                              <td className="border border-border/50 px-3 py-2">
                                <span className={trade.action === 'buy' ? 'text-green-500' : 'text-red-500'}>
                                  {trade.action}
                                </span>
                              </td>
                              <td className="border border-border/50 px-3 py-2">{trade.quantity}</td>
                              <td className="border border-border/50 px-3 py-2 text-green-500">{formatCurrency(trade.entryPrice)}</td>
                              <td className="border border-border/50 px-3 py-2 text-green-500">{formatCurrency(trade.exitPrice)}</td>
                              <td className={`border border-border/50 px-3 py-2 ${trade.profitLoss > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {formatCurrency(trade.profitLoss)}
                              </td>
                              <td className="border border-border/50 px-3 py-2">{formatCurrency(trade.charges)}</td>
                              <td className="border border-border/50 px-3 py-2">{trade.remarks || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg text-muted-foreground">Backtest Results Coming Soon</CardTitle>
              <CardDescription>
                Backtest results will be available once the strategy has been backtested. Run backtest to populate metrics.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {/* Subscribe Modal */}
      {strategy && (
        <SubscribeModal
          open={subscribeModalOpen}
          onOpenChange={setSubscribeModalOpen}
          strategyId={strategy.id}
          strategyName={strategy.name}
          onSuccess={handleSubscribeSuccess}
        />
      )}
    </div>
  )
}
