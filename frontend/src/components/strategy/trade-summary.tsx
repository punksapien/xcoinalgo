'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Calendar, Download, Search, Filter, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface TradeSummaryData {
  [year: string]: {
    [month: string]: number
  }
}

interface Trade {
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
}

interface TradeSummaryProps {
  tradeSummary: TradeSummaryData
  trades: Trade[]
}

export function TradeSummary({ tradeSummary, trades }: TradeSummaryProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'report'>('summary')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAction, setFilterAction] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('id')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return value.toFixed(3)
  }

  const getMonthName = (monthKey: string) => {
    const monthNames = {
      'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
      'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',
      'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
    }
    return monthNames[monthKey as keyof typeof monthNames] || monthKey
  }

  // Filter and sort trades
  const filteredTrades = trades
    .filter(trade => {
      const matchesSearch = searchTerm === '' ||
        trade.id.toString().includes(searchTerm) ||
        trade.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trade.entryDate.includes(searchTerm)

      const matchesAction = filterAction === 'all' || trade.action === filterAction

      return matchesSearch && matchesAction
    })
    .sort((a, b) => {
      const aVal = a[sortBy as keyof Trade]
      const bVal = b[sortBy as keyof Trade]

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })

  // Calculate summary stats
  const totalTrades = trades.length
  const winningTrades = trades.filter(t => t.profitLoss > 0).length
  const losingTrades = trades.filter(t => t.profitLoss < 0).length
  const totalPnL = trades.reduce((sum, trade) => sum + trade.profitLoss, 0)
  const totalCharges = trades.reduce((sum, trade) => sum + trade.charges, 0)
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Tab Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Trade Analysis
              </CardTitle>
              <CardDescription>
                Comprehensive breakdown of trading performance and individual trades
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={activeTab === 'summary' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('summary')}
                className="flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Trade Summary
              </Button>
              <Button
                variant={activeTab === 'report' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('report')}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                Full Trade Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Total Trades</p>
              <p className="text-xl font-bold text-foreground">{totalTrades}</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-xl font-bold text-emerald-500">{winRate.toFixed(1)}%</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Total P&L</p>
              <p className={`text-xl font-bold ${totalPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {formatCurrency(totalPnL)}
              </p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">Total Charges</p>
              <p className="text-xl font-bold text-muted-foreground">{formatCurrency(totalCharges)}</p>
            </div>
          </div>

          {activeTab === 'summary' ? (
            /* Trade Summary Table */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Monthly Performance Summary</h3>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export Summary
                </Button>
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Year</TableHead>
                      <TableHead>Jan</TableHead>
                      <TableHead>Feb</TableHead>
                      <TableHead>Mar</TableHead>
                      <TableHead>Apr</TableHead>
                      <TableHead>May</TableHead>
                      <TableHead>Jun</TableHead>
                      <TableHead>Jul</TableHead>
                      <TableHead>Aug</TableHead>
                      <TableHead>Sep</TableHead>
                      <TableHead>Oct</TableHead>
                      <TableHead>Nov</TableHead>
                      <TableHead>Dec</TableHead>
                      <TableHead className="font-semibold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(tradeSummary).map(([year, monthData]) => (
                      <TableRow key={year}>
                        <TableCell className="font-semibold">{year}</TableCell>
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => {
                          const value = monthData[month] || 0
                          return (
                            <TableCell
                              key={month}
                              className={`${value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-muted-foreground'}`}
                            >
                              {value === 0 ? '-' : formatCurrency(value)}
                            </TableCell>
                          )
                        })}
                        <TableCell className={`font-semibold ${
                          monthData.Total > 0 ? 'text-emerald-600' :
                          monthData.Total < 0 ? 'text-red-600' : 'text-muted-foreground'
                        }`}>
                          {formatCurrency(monthData.Total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            /* Full Trade Report */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    placeholder="Search trades by ID, action, or date..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterAction} onValueChange={setFilterAction}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="id">ID</SelectItem>
                    <SelectItem value="entryDate">Date</SelectItem>
                    <SelectItem value="profitLoss">P&L</SelectItem>
                    <SelectItem value="quantity">Quantity</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                Showing {filteredTrades.length} of {totalTrades} trades
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trade #</TableHead>
                      <TableHead>Entry Time</TableHead>
                      <TableHead>Exit Time</TableHead>
                      <TableHead>Entry Date</TableHead>
                      <TableHead>Exit Date</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Entry Price</TableHead>
                      <TableHead>Exit Price</TableHead>
                      <TableHead>P&L</TableHead>
                      <TableHead>Charges</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="font-semibold">{trade.id}</TableCell>
                        <TableCell>{trade.entryTime}</TableCell>
                        <TableCell>{trade.exitTime}</TableCell>
                        <TableCell>{new Date(trade.entryDate).toLocaleDateString()}</TableCell>
                        <TableCell>{new Date(trade.exitDate).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge
                            variant={trade.action === 'buy' ? 'default' : 'secondary'}
                            className={trade.action === 'buy' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}
                          >
                            {trade.action.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatNumber(trade.quantity)}</TableCell>
                        <TableCell>{formatCurrency(trade.entryPrice)}</TableCell>
                        <TableCell>{formatCurrency(trade.exitPrice)}</TableCell>
                        <TableCell className={`font-semibold ${trade.profitLoss >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {formatCurrency(trade.profitLoss)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatCurrency(trade.charges)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {filteredTrades.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No trades match your search criteria</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}