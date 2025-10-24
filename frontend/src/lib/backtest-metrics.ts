/**
 * Backtest Metrics Calculator
 *
 * Pure functions to compute derived metrics from trade history.
 * All calculations are guarded against null/undefined/zero values.
 */

export interface Trade {
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
  // Support snake_case field names from Python backend
  pnl_net?: number
  pnl_gross?: number
  net_pnl?: number
  entry_time?: string
  exit_time?: string
  entry_price?: number
  exit_price?: number
  charges: number
  commission?: number
  remarks: string
}

export interface ComputedMetrics {
  winningTrades: number
  losingTrades: number
  totalTrades: number
  winRate: number
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
  returnMaxDD: number
}

/**
 * Safe division - returns 0 if divider is 0
 */
function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || denominator === 0) return fallback
  return numerator / denominator
}

/**
 * Get PNL value from trade - handles both camelCase and snake_case field names
 */
function getPnl(trade: Trade): number {
  return trade.profitLoss || trade.pnl_net || trade.net_pnl || 0
}

/**
 * Get charges value from trade - handles both field name formats
 */
function getCharges(trade: Trade): number {
  return trade.charges || trade.commission || 0
}

/**
 * Compute all derived metrics from trade history
 */
export function computeMetrics(
  trades: Trade[],
  baseMaxDrawdown: number = 0
): ComputedMetrics {
  // Handle empty trades
  if (!trades || trades.length === 0) {
    return {
      winningTrades: 0,
      losingTrades: 0,
      totalTrades: 0,
      winRate: 0,
      avgTrade: 0,
      avgWinningTrade: 0,
      avgLosingTrade: 0,
      maxProfit: 0,
      maxLoss: 0,
      totalCharges: 0,
      netPnl: 0,
      realizedPnl: 0,
      rewardToRiskRatio: 0,
      expectancyRatio: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      maxTradesInDrawdown: 0,
      returnMaxDD: 0,
    }
  }

  // Separate wins and losses
  const winningTrades = trades.filter(t => getPnl(t) > 0)
  const losingTrades = trades.filter(t => getPnl(t) < 0)

  // Calculate averages
  const totalWins = winningTrades.reduce((sum, t) => sum + getPnl(t), 0)
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + getPnl(t), 0))
  const avgWinningTrade = safeDivide(totalWins, winningTrades.length)
  const avgLosingTrade = safeDivide(totalLosses, losingTrades.length)

  // Find max profit and loss
  const maxProfit = winningTrades.length > 0
    ? Math.max(...winningTrades.map(t => getPnl(t)))
    : 0
  const maxLoss = losingTrades.length > 0
    ? Math.min(...losingTrades.map(t => getPnl(t)))
    : 0

  // Calculate totals
  const totalCharges = trades.reduce((sum, t) => sum + getCharges(t), 0)
  const realizedPnl = trades.reduce((sum, t) => sum + getPnl(t), 0)
  const netPnl = realizedPnl - totalCharges

  // Reward to risk ratio (avg win / avg loss)
  const rewardToRiskRatio = safeDivide(avgWinningTrade, avgLosingTrade, 0)

  // Expectancy ratio ((win rate * avg win) - (loss rate * avg loss))
  const winRate = safeDivide(winningTrades.length, trades.length)
  const lossRate = safeDivide(losingTrades.length, trades.length)
  const expectancyRatio = (winRate * avgWinningTrade) - (lossRate * avgLosingTrade)

  // Calculate streaks
  let currentStreak = 0
  let maxWinStreak = 0
  let maxLossStreak = 0

  trades.forEach(trade => {
    const pnl = getPnl(trade)
    if (pnl > 0) {
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1
      maxWinStreak = Math.max(maxWinStreak, currentStreak)
    } else {
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1
      maxLossStreak = Math.max(maxLossStreak, Math.abs(currentStreak))
    }
  })

  // Calculate max trades in drawdown (simplified - count consecutive losing trades)
  let currentDrawdownTrades = 0
  let maxTradesInDrawdown = 0

  trades.forEach(trade => {
    const pnl = getPnl(trade)
    if (pnl < 0) {
      currentDrawdownTrades++
      maxTradesInDrawdown = Math.max(maxTradesInDrawdown, currentDrawdownTrades)
    } else {
      currentDrawdownTrades = 0
    }
  })

  // Return / Max Drawdown ratio
  const returnMaxDD = safeDivide(realizedPnl, Math.abs(baseMaxDrawdown), 0)

  // Total trades and win rate
  const totalTrades = trades.length
  const winRateCalc = safeDivide(winningTrades.length, totalTrades) * 100
  const avgTradeCalc = safeDivide(realizedPnl, totalTrades)

  return {
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    totalTrades,
    winRate: winRateCalc,
    avgTrade: avgTradeCalc,
    avgWinningTrade,
    avgLosingTrade,
    maxProfit,
    maxLoss,
    totalCharges,
    netPnl,
    realizedPnl,
    rewardToRiskRatio,
    expectancyRatio,
    maxWinStreak,
    maxLossStreak,
    maxTradesInDrawdown,
    returnMaxDD,
  }
}

/**
 * Generate monthly summary from monthlyReturns or trade history
 */
export function generateMonthlySummary(
  monthlyReturns?: Record<string, number>,
  trades?: Trade[]
): Record<string, Record<string, number>> {
  const summary: Record<string, Record<string, number>> = {}
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const years = ['2024', '2025']

  // Initialize summary
  years.forEach(year => {
    summary[year] = {}
    months.forEach(month => {
      summary[year][month] = 0
    })
    summary[year]['Total'] = 0
  })

  // If monthlyReturns provided, use it
  if (monthlyReturns) {
    Object.entries(monthlyReturns).forEach(([key, value]) => {
      const [year, monthNum] = key.split('-')
      const monthIndex = parseInt(monthNum) - 1
      const monthName = months[monthIndex]

      if (summary[year]) {
        summary[year][monthName] = value
        summary[year]['Total'] += value
      }
    })
  }
  // Otherwise compute from trades
  else if (trades && trades.length > 0) {
    trades.forEach(trade => {
      const exitDate = trade.exitDate || trade.exit_time || ''
      const date = new Date(exitDate)
      const year = date.getFullYear().toString()
      const monthIndex = date.getMonth()
      const monthName = months[monthIndex]

      if (summary[year]) {
        const pnl = getPnl(trade)
        summary[year][monthName] += pnl
        summary[year]['Total'] += pnl
      }
    })
  }

  return summary
}

/**
 * Format currency value
 */
export function formatCurrency(value: number | undefined, showingUSD: boolean, multiplier = 1): string {
  if (value === undefined || value === null || isNaN(value)) {
    return showingUSD ? '$0.00' : '₹0.00'
  }

  const finalValue = value * multiplier
  const currency = showingUSD ? '$' : '₹'
  const conversion = showingUSD ? 1 : 83 // USD to INR conversion

  return `${currency}${(finalValue * conversion).toFixed(2)}`
}

/**
 * Format percentage value
 */
export function formatPercentage(value: number | undefined): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'N/A'
  }
  return `${value.toFixed(2)}%`
}

/**
 * Format number value
 */
export function formatNumber(value: number | undefined, decimals = 2): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'N/A'
  }
  return value.toFixed(decimals)
}
