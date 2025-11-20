'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { ArrowLeft, Calendar, Users, Award, Activity, TrendingUp, Code, Clock, Download, Lock, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/lib/auth'
import { SubscribeModal } from '@/components/strategy/subscribe-modal'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  computeMetrics,
  generateMonthlySummary,
  formatCurrency as formatCurrencyUtil,
  formatPercentage as formatPercentageUtil,
  formatNumber,
  type Trade as TradeType,
} from '@/lib/backtest-metrics'

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
  monthlyReturns?: Record<string, number>
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
  // Support snake_case from Python backend
  pnl_net?: number
  pnl_gross?: number
  net_pnl?: number
  entry_time?: string
  exit_time?: string
  entry_price?: number
  exit_price?: number
  commission?: number
}

// Helper functions to get trade values with fallback for both naming conventions
const getTradePnl = (trade: Trade): number => {
  return trade.profitLoss || trade.pnl_net || trade.net_pnl || 0
}

const getTradeCharges = (trade: Trade): number => {
  return trade.charges || trade.commission || 0
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
  const searchParams = useSearchParams()
  const { token, isQuant, isAdmin } = useAuth()
  const [strategy, setStrategy] = useState<StrategyData | null>(null)
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false)
  const [showingUSD, setShowingUSD] = useState(false)
  const [reportMultiplier, setReportMultiplier] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [errorType, setErrorType] = useState<'not-found' | 'private' | null>(null)
  const [showBacktestBanner, setShowBacktestBanner] = useState(false)
  const [backtestStartTime, setBacktestStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const itemsPerPage = 10

  // Check if user is admin or quant (only they should see backtest status)
  const canSeeBacktestProgress = isQuant() || isAdmin()

  // Check if backtest was just triggered
  useEffect(() => {
    if (searchParams.get('backtestRunning') === 'true' && canSeeBacktestProgress) {
      setShowBacktestBanner(true)
      setBacktestStartTime(Date.now())
    }
  }, [searchParams, canSeeBacktestProgress])

  // Update elapsed time every second when backtest is running
  useEffect(() => {
    if (!showBacktestBanner || !backtestStartTime) return

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - backtestStartTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [showBacktestBanner, backtestStartTime])

  // Poll for backtest completion every 5 seconds
  useEffect(() => {
    if (!showBacktestBanner) return

    const pollInterval = setInterval(async () => {
      // Refresh strategy data to check if backtest updated
      await fetchStrategy()

      // If backtest has been running for more than 2 minutes, auto-dismiss
      if (elapsedTime > 120) {
        setShowBacktestBanner(false)
        setBacktestStartTime(null)
      }
    }, 5000)

    return () => clearInterval(pollInterval)
  }, [showBacktestBanner, elapsedTime])

  useEffect(() => {
    fetchStrategy()
  }, [params.id, token])

  const fetchStrategy = async () => {
    try {
      setLoading(true)
      setErrorType(null)
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
      } else {
        // Determine error type based on status code
        if (response.status === 403) {
          setErrorType('private')
        } else if (response.status === 404) {
          setErrorType('not-found')
        } else {
          // Default to not-found for other errors
          setErrorType('not-found')
        }
      }
    } catch (error) {
      console.error('Failed to fetch strategy:', error)
      setErrorType('not-found')
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
    router.push('/dashboard')
  }

  const handleSubscribe = () => {
    setSubscribeModalOpen(true)
  }

  const handleSubscribeSuccess = () => {
    if (strategy) {
      checkSubscription(strategy.id)
    }
  }

  // Compute metrics from trade history using utility
  const computedMetrics = useMemo(() => {
    if (!strategy?.latestBacktest?.tradeHistory) {
      return null
    }
    return computeMetrics(
      strategy.latestBacktest.tradeHistory as TradeType[],
      strategy.latestBacktest.maxDrawdown || 0
    )
  }, [strategy?.latestBacktest])

  // Generate monthly summary
  const monthlySummary = useMemo(() => {
    if (!strategy?.latestBacktest) return null

    const backtest = strategy.latestBacktest
    // Use monthlyReturns if available, otherwise compute from trades
    return generateMonthlySummary(
      backtest.monthlyReturns as Record<string, number> | undefined,
      backtest.tradeHistory as TradeType[] | undefined
    )
  }, [strategy?.latestBacktest])

  // Parse equity curve for charts
  const equityCurveData = useMemo(() => {
    const backtest = strategy?.latestBacktest
    if (!backtest?.equityCurve) return []

    // Handle different equity curve formats
    const curve = backtest.equityCurve

    // If it's already an array of {time, equity, drawdown}
    if (Array.isArray(curve)) {
      return curve.map((point, index: number) => {
        const p = point as Record<string, unknown>
        return {
          index,
          time: p.time,
          equity: p.equity || 0,
          drawdown: p.drawdown || 0,
        }
      })
    }

    // If it's {data: [...]}
    const curveObj = curve as Record<string, unknown>
    if (curveObj.data && Array.isArray(curveObj.data)) {
      return curveObj.data.map((point, index: number) => {
        const p = point as Record<string, unknown>
        return {
          index,
          time: p.time,
          equity: p.equity || 0,
          drawdown: p.drawdown || 0,
        }
      })
    }

    // Fallback: compute from trade history
    if (backtest.tradeHistory && Array.isArray(backtest.tradeHistory)) {
      let runningPnl = backtest.initialBalance || 10000
      let peak = runningPnl

      return (backtest.tradeHistory as Trade[]).map((trade, index) => {
        runningPnl += getTradePnl(trade)
        peak = Math.max(peak, runningPnl)
        const drawdown = peak - runningPnl

        return {
          index,
          time: trade.exitDate,
          equity: runningPnl,
          drawdown,
        }
      })
    }

    return []
  }, [strategy?.latestBacktest])

  // Calculate dynamic Y-axis domain for better chart visibility
  const yAxisDomain = useMemo(() => {
    if (equityCurveData.length === 0) return [0, 10000]

    const equityValues = equityCurveData.map(d => Number(d.equity)).filter(v => !isNaN(v))
    if (equityValues.length === 0) return [0, 10000]

    const minEquity = Math.min(...equityValues)
    const maxEquity = Math.max(...equityValues)

    // Add 10% padding for better visibility
    const padding = (maxEquity - minEquity) * 0.1
    const paddedMin = Math.max(0, minEquity - padding)
    const paddedMax = maxEquity + padding

    return [Math.floor(paddedMin), Math.ceil(paddedMax)]
  }, [equityCurveData])

  // Calculate dynamic drawdown Y-axis domain
  const drawdownYAxisDomain = useMemo(() => {
    if (equityCurveData.length === 0) return [0, 100]

    const drawdownValues = equityCurveData.map(d => Math.abs(Number(d.drawdown))).filter(v => !isNaN(v))
    if (drawdownValues.length === 0) return [0, 100]

    const maxDrawdown = Math.max(...drawdownValues)

    // Add 20% padding for drawdown chart
    const paddedMax = maxDrawdown * 1.2

    return [0, Math.ceil(paddedMax)]
  }, [equityCurveData])

  // Filter trades based on search query
  const filteredTrades = useMemo(() => {
    const backtest = strategy?.latestBacktest
    if (!backtest?.tradeHistory || !Array.isArray(backtest.tradeHistory)) return []

    const trades = backtest.tradeHistory as Trade[]

    if (!searchQuery.trim()) return trades

    const query = searchQuery.toLowerCase()
    return trades.filter(trade =>
      trade.index.toString().includes(query) ||
      trade.entryTime.toLowerCase().includes(query) ||
      trade.exitTime.toLowerCase().includes(query) ||
      trade.entryDate.toLowerCase().includes(query) ||
      trade.exitDate.toLowerCase().includes(query) ||
      trade.orderType.toLowerCase().includes(query) ||
      trade.strike.toLowerCase().includes(query) ||
      trade.action.toLowerCase().includes(query) ||
      trade.quantity.toString().includes(query) ||
      trade.entryPrice.toString().includes(query) ||
      trade.exitPrice.toString().includes(query) ||
      getTradePnl(trade).toString().includes(query) ||
      getTradeCharges(trade).toString().includes(query) ||
      (trade.remarks && trade.remarks.toLowerCase().includes(query))
    )
  }, [strategy?.latestBacktest, searchQuery])

  // Paginate filtered trades
  const paginatedTrades = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredTrades.slice(startIndex, endIndex)
  }, [filteredTrades, currentPage, itemsPerPage])

  // Calculate total pages
  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage)

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  // Download trades as CSV
  const downloadTradesCSV = () => {
    if (!filteredTrades.length) return

    // CSV headers
    const headers = [
      'Index #',
      'Entry Time',
      'Exit Time',
      'Entry Date',
      'Exit Date',
      'Order Type',
      'Strike',
      'Action',
      'Quantity',
      'Entry Price',
      'Exit Price',
      'Profit Loss',
      'Charges',
      'Remarks'
    ]

    // Convert trades to CSV rows
    const rows = filteredTrades.map(trade => [
      trade.index,
      trade.entryTime,
      trade.exitTime,
      trade.entryDate,
      trade.exitDate,
      trade.orderType,
      trade.strike,
      trade.action,
      trade.quantity,
      trade.entryPrice,
      trade.exitPrice,
      getTradePnl(trade),
      getTradeCharges(trade),
      trade.remarks || ''
    ])

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${strategy?.name || 'strategy'}_trades_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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
        <div className="flex items-center justify-center min-h-[600px]">
          <Card className="max-w-md w-full border-border/50 shadow-lg">
            <CardContent className="pt-8 pb-8">
              {errorType === 'private' ? (
                // Private Strategy Error
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 rounded-full">
                    <Lock className="h-12 w-12 text-yellow-600 dark:text-yellow-500" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-foreground">Private Strategy</h2>
                    <p className="text-muted-foreground leading-relaxed">
                      This strategy is private and only accessible to authorized users.
                    </p>
                  </div>
                  <div className="w-full pt-2 space-y-3">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-left">
                          <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                            Need Access?
                          </p>
                          <p className="text-blue-700 dark:text-blue-300">
                            Contact the strategy creator or check the marketplace for public strategies.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
                    <Button
                      onClick={handleBack}
                      variant="outline"
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Strategies
                    </Button>
                    <Button
                      onClick={() => router.push('/dashboard')}
                      className="flex-1 bg-primary hover:bg-primary/90"
                    >
                      Browse Marketplace
                    </Button>
                  </div>
                </div>
              ) : (
                // Not Found Error
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-full">
                    <Activity className="h-12 w-12 text-red-600 dark:text-red-500" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-foreground">Strategy Not Found</h2>
                    <p className="text-muted-foreground leading-relaxed">
                      The requested strategy could not be found. It may have been removed or the link is incorrect.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full pt-4">
                    <Button
                      onClick={handleBack}
                      variant="outline"
                      className="flex-1"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Strategies
                    </Button>
                    <Button
                      onClick={() => router.push('/dashboard')}
                      className="flex-1 bg-primary hover:bg-primary/90"
                    >
                      Browse Marketplace
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const backtest = strategy.latestBacktest

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-8">
        <StrategyHeader
          strategy={strategy}
          onBack={handleBack}
          onSubscribe={handleSubscribe}
          userSubscription={userSubscription || undefined}
        />

        {/* Backtest Running Banner - Only visible to ADMIN/QUANT */}
        {showBacktestBanner && canSeeBacktestProgress && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Backtest Running • {elapsedTime}s elapsed
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setShowBacktestBanner(false)
                      setBacktestStartTime(null)
                      fetchStrategy()
                    }}
                    variant="outline"
                    size="sm"
                    className="border-blue-300 dark:border-blue-700 text-xs"
                  >
                    Refresh
                  </Button>
                  <Button
                    onClick={() => {
                      setShowBacktestBanner(false)
                      setBacktestStartTime(null)
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                    The backtest report uses the <span className="font-semibold">{strategy.executionConfig?.symbol}</span> ({strategy.executionConfig?.symbol}) with holding {computedMetrics?.totalTrades || 0} Approx 5 to 8k margin of holdings: .
                  </p>

                  {/* Net PNL and Realized PNL */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="border border-primary/30 rounded-lg p-6 text-center">
                      <p className="text-sm text-muted-foreground mb-2">Net PNL</p>
                      <p className="text-3xl font-bold text-green-500">
                        {formatCurrencyUtil(computedMetrics?.netPnl, showingUSD, reportMultiplier)}
                      </p>
                    </div>
                    <div className="border border-primary/30 rounded-lg p-6 text-center">
                      <p className="text-sm text-muted-foreground mb-2">Realized PNL</p>
                      <p className="text-3xl font-bold text-green-500">
                        {formatCurrencyUtil(computedMetrics?.realizedPnl, showingUSD, reportMultiplier)}
                      </p>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Win Percentage</p>
                      <p className="text-xl font-semibold text-green-500">{formatPercentageUtil(computedMetrics?.winRate)}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Number of Trades</p>
                      <p className="text-xl font-semibold">{computedMetrics?.totalTrades || 0}</p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Average Profit on Winning Trades</p>
                      <p className="text-xl font-semibold text-green-500">
                        {formatCurrencyUtil(computedMetrics?.avgWinningTrade, showingUSD, reportMultiplier)}
                      </p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Loss Percentage</p>
                      <p className="text-xl font-semibold text-green-500">
                        {formatPercentageUtil(100 - (computedMetrics?.winRate || 0))}
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Average Profit per Trade</p>
                      <p className="text-xl font-semibold text-green-500">
                        {formatCurrencyUtil(computedMetrics?.avgTrade, showingUSD, reportMultiplier)}
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Average Loss on Losing Trades</p>
                      <p className="text-xl font-semibold text-red-500">
                        {formatCurrencyUtil(computedMetrics?.avgLosingTrade, showingUSD, reportMultiplier)}
                      </p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Total charges</p>
                      <p className="text-xl font-semibold text-red-500">
                        {formatCurrencyUtil(computedMetrics?.totalCharges, showingUSD, reportMultiplier)}
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Profit in Single Trade</p>
                      <p className="text-xl font-semibold text-green-500">
                        {formatCurrencyUtil(computedMetrics?.maxProfit, showingUSD, reportMultiplier)}
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Loss in Single Trade</p>
                      <p className="text-xl font-semibold text-red-500">
                        {formatCurrencyUtil(computedMetrics?.maxLoss, showingUSD, reportMultiplier)}
                      </p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Drawdown</p>
                      <p className="text-xl font-semibold text-red-500">
                        {formatCurrencyUtil(backtest.maxDrawdown, showingUSD, reportMultiplier)}
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Duration of Max Drawdown</p>
                      <p className="text-xl font-semibold">
                        {backtest.maxDrawdownDuration || 'N/A'}
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Return MaxDD</p>
                      <p className="text-xl font-semibold text-green-500">
                        {formatNumber(computedMetrics?.returnMaxDD)}
                      </p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Reward to Risk Ratio</p>
                      <p className="text-xl font-semibold text-green-500">
                        {formatNumber(computedMetrics?.rewardToRiskRatio)}
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Expectancy Ratio</p>
                      <p className="text-xl font-semibold text-green-500">
                        {formatCurrencyUtil(computedMetrics?.expectancyRatio, showingUSD, reportMultiplier)}
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Win Streak</p>
                      <p className="text-xl font-semibold text-green-500">
                        {computedMetrics?.maxWinStreak || 0}
                      </p>
                    </div>

                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Loss Streak</p>
                      <p className="text-xl font-semibold text-red-500">
                        {computedMetrics?.maxLossStreak || 0}
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground mb-1">Max Trades in Drawdown</p>
                      <p className="text-xl font-semibold text-red-500">
                        {computedMetrics?.maxTradesInDrawdown || 0}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Charts: P&L and Drawdown */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Performance Charts</h3>
                    <button className="px-4 py-2 rounded-md border border-input bg-background text-sm hover:bg-accent">
                      📸 Take Snapshot
                    </button>
                  </div>
                  <Tabs defaultValue="pnl" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                      <TabsTrigger value="pnl">Cumulative P&L</TabsTrigger>
                      <TabsTrigger value="drawdown">Drawdown</TabsTrigger>
                    </TabsList>
                    <TabsContent value="pnl" className="mt-4">
                      <div className="h-[400px]">
                        {equityCurveData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={equityCurveData}
                              margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis
                                dataKey="time"
                                stroke="#9CA3AF"
                                tick={{ fontSize: 11 }}
                                angle={-45}
                                textAnchor="end"
                                minTickGap={100}
                                interval="preserveStartEnd"
                                tickFormatter={(value) => {
                                  if (!value) return '';
                                  const date = new Date(value);
                                  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
                                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                  return `${dayOfWeek}, ${dateStr}`;
                                }}
                              />
                              <YAxis
                                stroke="#9CA3AF"
                                domain={yAxisDomain}
                                tickFormatter={(value) => `$${value.toLocaleString()}`}
                                label={{ value: 'Cumulative P&L ($)', angle: -90, position: 'insideLeft', style: { fill: '#9CA3AF' } }}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#1F2937',
                                  border: '1px solid #374151',
                                  borderRadius: '8px',
                                  color: '#F9FAFB'
                                }}
                                labelFormatter={(value) => {
                                  if (!value) return '';
                                  const date = new Date(value);
                                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                }}
                                formatter={(value: number) => [`$${value.toLocaleString()}`, 'P&L']}
                              />
                              <Line type="monotone" dataKey="equity" stroke="#3B82F6" strokeWidth={2} dot={false} name="Cumulative P&L" />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            No equity curve data available
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="drawdown" className="mt-4">
                      <div className="h-[400px]">
                        {equityCurveData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={equityCurveData}
                              margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis
                                dataKey="time"
                                stroke="#9CA3AF"
                                tick={{ fontSize: 11 }}
                                angle={-45}
                                textAnchor="end"
                                minTickGap={100}
                                interval="preserveStartEnd"
                                tickFormatter={(value) => {
                                  if (!value) return '';
                                  const date = new Date(value);
                                  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
                                  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                  return `${dayOfWeek}, ${dateStr}`;
                                }}
                              />
                              <YAxis
                                stroke="#9CA3AF"
                                domain={drawdownYAxisDomain}
                                tickFormatter={(value) => `$${value.toLocaleString()}`}
                                label={{ value: 'Drawdown ($)', angle: -90, position: 'insideLeft', style: { fill: '#9CA3AF' } }}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#1F2937',
                                  border: '1px solid #374151',
                                  borderRadius: '8px',
                                  color: '#F9FAFB'
                                }}
                                labelFormatter={(value) => {
                                  if (!value) return '';
                                  const date = new Date(value);
                                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                }}
                                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Drawdown']}
                              />
                              <Line type="monotone" dataKey="drawdown" stroke="#EF4444" strokeWidth={2} dot={false} name="Drawdown" />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            No drawdown data available
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
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
                                  {value !== 0 ? formatCurrencyUtil(value, showingUSD, reportMultiplier) : formatCurrencyUtil(0, showingUSD)}
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
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">Full Trade Report</h3>
                      <p className="text-sm text-yellow-500">Note: Trade Report is Based on 1x Multiplier</p>
                      {backtest?.tradeHistory && filteredTrades.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Showing {filteredTrades.length > 0 ? ((currentPage - 1) * itemsPerPage + 1) : 0} - {Math.min(currentPage * itemsPerPage, filteredTrades.length)} of {filteredTrades.length} trades
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No trade history available yet
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search trades..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                        disabled={!backtest?.tradeHistory || filteredTrades.length === 0}
                      />
                      <button
                        onClick={downloadTradesCSV}
                        disabled={!backtest?.tradeHistory || filteredTrades.length === 0}
                        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
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
                        {backtest?.tradeHistory && paginatedTrades.length > 0 ? (
                          paginatedTrades.map((trade) => (
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
                              <td className="border border-border/50 px-3 py-2 text-green-500">{formatCurrencyUtil(trade.entryPrice, showingUSD, 1)}</td>
                              <td className="border border-border/50 px-3 py-2 text-green-500">{formatCurrencyUtil(trade.exitPrice, showingUSD, 1)}</td>
                              <td className={`border border-border/50 px-3 py-2 ${getTradePnl(trade) > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {formatCurrencyUtil(getTradePnl(trade), showingUSD, 1)}
                              </td>
                              <td className="border border-border/50 px-3 py-2">{formatCurrencyUtil(getTradeCharges(trade), showingUSD, 1)}</td>
                              <td className="border border-border/50 px-3 py-2">{trade.remarks || '-'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={14} className="border border-border/50 px-3 py-8 text-center text-muted-foreground">
                              No trade data available. Backtest results will appear here once the strategy has been tested.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {backtest?.tradeHistory && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded-md border border-input bg-background text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        &lt;
                      </button>

                      {/* Page numbers */}
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum
                        if (totalPages <= 5) {
                          pageNum = i + 1
                        } else if (currentPage <= 3) {
                          pageNum = i + 1
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i
                        } else {
                          pageNum = currentPage - 2 + i
                        }

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-3 py-1 rounded-md text-sm ${
                              currentPage === pageNum
                                ? 'bg-primary text-primary-foreground'
                                : 'border border-input bg-background hover:bg-accent'
                            }`}
                          >
                            {pageNum}
                          </button>
                        )
                      })}

                      {/* Show ellipsis and last page if needed */}
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <>
                          <span className="px-2 text-muted-foreground">...</span>
                          <button
                            onClick={() => setCurrentPage(totalPages)}
                            className="px-3 py-1 rounded-md border border-input bg-background text-sm hover:bg-accent"
                          >
                            {totalPages}
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded-md border border-input bg-background text-sm hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        &gt;
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        ) : (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg text-muted-foreground">Backtest Results Coming Soon</CardTitle>
              <CardDescription>
                Backtest results will be available shortly. Strategies are automatically backtested when uploaded via the CLI.
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
