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

interface LogEntry {
  timestamp: string
  level: string
  message: string
  function?: string
  line?: string
}

interface LogData {
  success: boolean
  logs: LogEntry[]
  errors: LogEntry[]
  metadata?: {
    totalLogFiles: number
    latestLogFile: string
    latestLogTime: string
    logFilesAvailable: Array<{
      name: string
      timestamp: string
      size: number
    }>
  }
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
  const [selectedTab, setSelectedTab] = useState<"logs" | "errors">("logs")
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)

  const fetchLogs = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(
        `/api/strategy-upload/${strategyId}/logs?limit=100`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`)
      }

      const data: LogData = await response.json()
      setLogData(data)

      // Auto-scroll to bottom if enabled
      if (shouldAutoScroll && scrollContainerRef.current) {
        setTimeout(() => {
          scrollContainerRef.current?.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: 'smooth',
          })
        }, 100)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs')
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
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      setShouldAutoScroll(isNearBottom)
    }
  }

  const scrollToBottom = () => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: 'smooth',
    })
    setShouldAutoScroll(true)
  }

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'ERROR':
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
      return new Date(timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return timestamp
    }
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
                {new Date(logData.metadata.latestLogTime).toLocaleString()}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={selectedTab}
          onValueChange={(value) => setSelectedTab(value as "logs" | "errors")}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList>
            <TabsTrigger value="logs">
              Logs ({logData?.logs.length || 0})
            </TabsTrigger>
            <TabsTrigger value="errors">
              Errors ({logData?.errors.length || 0})
            </TabsTrigger>
          </TabsList>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-4 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-semibold text-red-500">Error loading logs</p>
                <p className="text-xs text-red-500/80">{error}</p>
              </div>
            </div>
          )}

          <TabsContent value="logs" className="flex-1 flex flex-col overflow-hidden mt-4">
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto bg-black/5 dark:bg-white/5 rounded-lg p-4 font-mono text-sm"
            >
              {loading && !logData && (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading logs...
                </div>
              )}

              {!loading && logData && logData.logs.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No logs available yet. Strategy may not have been executed.
                </div>
              )}

              {logData && logData.logs.length > 0 && (
                <div className="space-y-1">
                  {logData.logs.map((log, index) => (
                    <div
                      key={index}
                      className="flex gap-4 hover:bg-white/5 dark:hover:bg-black/5 px-2 py-1 rounded"
                    >
                      <span className="text-muted-foreground shrink-0">
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <span className={cn('shrink-0 font-semibold w-16', getLevelColor(log.level))}>
                        {log.level}
                      </span>
                      <span className="flex-1 break-words">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

          <TabsContent value="errors" className="flex-1 flex flex-col overflow-hidden mt-4">
            <div className="flex-1 overflow-y-auto bg-black/5 dark:bg-white/5 rounded-lg p-4 font-mono text-sm">
              {logData && logData.errors.length === 0 && (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                    <p>No errors recorded</p>
                    <p className="text-xs mt-1">Strategy is running smoothly</p>
                  </div>
                </div>
              )}

              {logData && logData.errors.length > 0 && (
                <div className="space-y-2">
                  {logData.errors.map((error, index) => (
                    <div
                      key={index}
                      className="bg-red-500/10 border border-red-500/50 rounded-lg p-3"
                    >
                      <div className="flex gap-4 mb-1">
                        <span className="text-muted-foreground text-xs">
                          {formatTimestamp(error.timestamp)}
                        </span>
                        <span className="text-red-500 font-semibold text-xs">
                          {error.level}
                        </span>
                        {error.function && (
                          <span className="text-muted-foreground text-xs">
                            {error.function}:{error.line}
                          </span>
                        )}
                      </div>
                      <p className="text-red-500 text-sm break-words">{error.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
