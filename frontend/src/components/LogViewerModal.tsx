"use client"

import * as React from "react"
import { useEffect, useState, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { RefreshCw, ArrowDown, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiClient, ApiError } from "@/lib/api-client"

interface LogEntry {
  timestamp: string
  level: string
  message: string
  function?: string
  line?: string
}

interface LogFile {
  name: string
  displayName: string
  type: 'log' | 'csv' | 'text'
  content: LogEntry[]
  size: number
  mtime: string
}

interface LogData {
  success: boolean
  logFiles: LogFile[]
  metadata?: {
    totalLogFiles: number
    latestUpdate: string
  }
  message?: string
}

interface LogViewerModalProps {
  isOpen: boolean
  onClose: () => void
  strategyId: string
  strategyName: string
}

export function LogViewerModal({
  isOpen,
  onClose,
  strategyId,
  strategyName,
}: LogViewerModalProps) {
  const [logData, setLogData] = useState<LogData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedTab, setSelectedTab] = useState<string>("")
  const scrollContainerRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  const fetchLogs = async () => {
    try {
      setLoading(true)
      setError(null)

      const data = await apiClient.get<LogData>(
        `/api/strategy-upload/${strategyId}/logs?limit=100`
      )

      setLogData(data)

      // Set default tab to first log file ONLY on initial load (when selectedTab is empty string)
      // Don't reset it on subsequent fetches to preserve user's tab selection
      if (selectedTab === "" && data.logFiles && data.logFiles.length > 0) {
        // Find Trading Bot tab first, otherwise use first available
        const tradingBotFile = data.logFiles.find(f => f.name === 'trading_bot.log')
        setSelectedTab(tradingBotFile?.name || data.logFiles[0].name)
      }

      // Auto-scroll to bottom if enabled
      if (shouldAutoScroll) {
        setTimeout(() => {
          const currentRef = scrollContainerRefs.current[selectedTab]
          if (currentRef) {
            currentRef.scrollTo({
              top: currentRef.scrollHeight,
              behavior: 'smooth',
            })
          }
        }, 100)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Failed to fetch logs')
      }
      console.error('Log fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (isOpen && strategyId) {
      fetchLogs()

      if (autoRefresh) {
        const interval = setInterval(fetchLogs, 5000) // Refresh every 5 seconds
        return () => clearInterval(interval)
      }
    }
  }, [isOpen, strategyId, autoRefresh])

  // Handle scroll detection for auto-scroll
  const handleScroll = (tabName: string) => {
    const container = scrollContainerRefs.current[tabName]
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      setShouldAutoScroll(isNearBottom)
    }
  }

  const scrollToBottom = () => {
    const currentRef = scrollContainerRefs.current[selectedTab]
    if (currentRef) {
      currentRef.scrollTo({
        top: currentRef.scrollHeight,
        behavior: 'smooth',
      })
      setShouldAutoScroll(true)
    }
  }

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
      case 'CRITICAL':
        return 'text-red-500'
      case 'WARNING':
      case 'WARN':
        return 'text-yellow-500'
      case 'INFO':
        return 'text-blue-500'
      case 'DEBUG':
        return 'text-gray-500'
      default:
        return 'text-foreground'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return ''
    try {
      // Try parsing as date first
      const date = new Date(timestamp)
      if (!isNaN(date.getTime())) {
        return date.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      }
      // If already in HH:MM:SS format, return as is
      return timestamp
    } catch {
      return timestamp
    }
  }

  const renderLogContent = (logFile: LogFile) => {
    const tabName = logFile.name

    return (
      <div
        ref={(el) => { scrollContainerRefs.current[tabName] = el }}
        onScroll={() => handleScroll(tabName)}
        className="flex-1 overflow-y-auto bg-black/5 dark:bg-white/5 rounded-lg p-4 font-mono text-sm"
      >
        {loading && !logData && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading logs...
          </div>
        )}

        {!loading && logFile.content.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No logs available in this file yet.
          </div>
        )}

        {logFile.content.length > 0 && (
          <div className="space-y-1">
            {logFile.content.map((log, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-4 hover:bg-white/5 dark:hover:bg-black/5 px-2 py-1 rounded",
                  log.level.toUpperCase() === 'ERROR' || log.level.toUpperCase() === 'CRITICAL'
                    ? 'bg-red-500/10 border-l-2 border-red-500'
                    : ''
                )}
              >
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={cn('shrink-0 font-semibold w-20 text-xs', getLevelColor(log.level))}>
                  {log.level}
                </span>
                <span className="flex-1 break-words text-xs">{log.message}</span>
                {log.function && (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {log.function}:{log.line}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Strategy Logs - {strategyName}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={cn(
                  autoRefresh && 'bg-green-500/10 border-green-500/50'
                )}
              >
                <RefreshCw
                  className={cn(
                    'h-4 w-4 mr-2',
                    autoRefresh && 'animate-spin'
                  )}
                />
                {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                disabled={loading}
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            Real-time logs from strategy execution
            {logData?.metadata && (
              <span className="ml-2 text-xs">
                • {logData.metadata.totalLogFiles} log file(s) • Last updated:{' '}
                {new Date(logData.metadata.latestUpdate).toLocaleString()}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-500">Error loading logs</p>
              <p className="text-xs text-red-500/80">{error}</p>
            </div>
          </div>
        )}

        {logData && logData.logFiles && logData.logFiles.length > 0 ? (
          <Tabs
            value={selectedTab}
            onValueChange={setSelectedTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="w-full justify-start">
              {logData.logFiles.map((logFile) => (
                <TabsTrigger key={logFile.name} value={logFile.name} className="flex-1 min-w-[140px]">
                  {logFile.displayName} ({logFile.content.length})
                </TabsTrigger>
              ))}
            </TabsList>

            {logData.logFiles.map((logFile) => (
              <TabsContent
                key={logFile.name}
                value={logFile.name}
                className="flex-1 flex flex-col overflow-hidden mt-4"
              >
                {renderLogContent(logFile)}

                {!shouldAutoScroll && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={scrollToBottom}
                    className="mt-2 mx-auto"
                  >
                    <ArrowDown className="h-4 w-4 mr-2" />
                    Scroll to bottom
                  </Button>
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {loading ? (
              <>
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Loading logs...
              </>
            ) : logData?.message ? (
              <div className="text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                <p>{logData.message}</p>
              </div>
            ) : (
              <div className="text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                <p>No logs found for this strategy</p>
                <p className="text-xs mt-1">Strategy may not have been executed yet</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
