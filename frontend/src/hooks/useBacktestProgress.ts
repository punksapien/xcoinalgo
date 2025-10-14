import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';

export interface BacktestMetrics {
  winRate?: number;
  roi?: number;
  maxDrawdown?: number;
  profitFactor?: number;
  sharpeRatio?: number;
  totalReturn?: number;
  [key: string]: number | undefined; // Allow additional metric fields
}

export interface BacktestProgress {
  stage: 'fetching_data' | 'data_fetched' | 'running_backtest' | 'calculating_metrics' | 'complete' | 'error';
  progress: number; // 0.0 to 1.0
  message: string;
  totalCandles?: number;
  fetchDuration?: number;
  backtestDuration?: number;
  totalDuration?: number;
  error?: string;
  metrics?: BacktestMetrics;
  totalTrades?: number;
}

interface UseBacktestProgressOptions {
  strategyId: string | null;
  onComplete?: (progress: BacktestProgress) => void;
  onError?: (error: string) => void;
}

export function useBacktestProgress({
  strategyId,
  onComplete,
  onError
}: UseBacktestProgressOptions) {
  const { token } = useAuth();
  const [progress, setProgress] = useState<BacktestProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Calculate ETA based on progress
  const calculateETA = useCallback((currentProgress: BacktestProgress): number | null => {
    if (!currentProgress.totalDuration || currentProgress.progress === 0) {
      return null;
    }

    // Estimate remaining time: elapsed / progress * (1 - progress)
    const estimated = (currentProgress.totalDuration / currentProgress.progress) * (1 - currentProgress.progress);
    return Math.round(estimated);
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!strategyId || !token) {
      disconnect();
      return;
    }

    // Create SSE connection
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
    // Pass token as query param since EventSource doesn't support custom headers
    const url = `${backendUrl}/api/strategies/${strategyId}/backtest/progress?token=${encodeURIComponent(token)}`;

    let eventSource: EventSource;

    try {
      eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened for strategy:', strategyId);
        setIsConnected(true);
        setConnectionError(null);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'connected') {
            console.log('SSE connected:', data);
          } else if (data.type === 'progress') {
            const progressData: BacktestProgress = {
              stage: data.stage,
              progress: data.progress,
              message: data.message,
              totalCandles: data.totalCandles,
              fetchDuration: data.fetchDuration,
              backtestDuration: data.backtestDuration,
              totalDuration: data.totalDuration,
              error: data.error,
              metrics: data.metrics,
              totalTrades: data.totalTrades
            };

            setProgress(progressData);

            // Call callbacks
            if (progressData.stage === 'complete') {
              onComplete?.(progressData);
              // Auto-disconnect after completion
              setTimeout(() => disconnect(), 2000);
            } else if (progressData.stage === 'error') {
              onError?.(progressData.error || 'Backtest failed');
              setTimeout(() => disconnect(), 2000);
            }
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        setConnectionError('Connection lost');
        setIsConnected(false);

        // Try to reconnect after 5 seconds
        setTimeout(() => {
          if (strategyId && token) {
            console.log('Attempting SSE reconnection...');
          }
        }, 5000);
      };

    } catch (error) {
      console.error('Failed to create SSE connection:', error);
      setConnectionError('Failed to connect');
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [strategyId, token, disconnect, onComplete, onError]);

  // Polling fallback
  const fetchStatus = useCallback(async () => {
    if (!strategyId || !token) return;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(
        `${backendUrl}/api/strategies/${strategyId}/backtest/status`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.progress) {
          const progressData: BacktestProgress = data.progress;
          setProgress(progressData);

          if (progressData.stage === 'complete') {
            onComplete?.(progressData);
          } else if (progressData.stage === 'error') {
            onError?.(progressData.error || 'Backtest failed');
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch backtest status:', error);
    }
  }, [strategyId, token, onComplete, onError]);

  // Use polling if SSE fails
  useEffect(() => {
    if (connectionError && strategyId && token) {
      console.log('SSE failed, falling back to polling...');
      const interval = setInterval(fetchStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [connectionError, strategyId, token, fetchStatus]);

  return {
    progress,
    isConnected,
    connectionError,
    disconnect,
    eta: progress ? calculateETA(progress) : null,
    fetchStatus // Manual refresh function
  };
}
