import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Database, TrendingUp, Calculator } from "lucide-react";
import type { BacktestProgress } from "@/hooks/useBacktestProgress";

interface BacktestProgressBarProps {
  progress: BacktestProgress;
  eta?: number | null;
}

const stageInfo = {
  fetching_data: {
    label: "Fetching Data",
    icon: Database,
    color: "text-blue-500"
  },
  data_fetched: {
    label: "Data Fetched",
    icon: CheckCircle2,
    color: "text-green-500"
  },
  running_backtest: {
    label: "Running Backtest",
    icon: TrendingUp,
    color: "text-purple-500"
  },
  calculating_metrics: {
    label: "Calculating Metrics",
    icon: Calculator,
    color: "text-orange-500"
  },
  complete: {
    label: "Complete",
    icon: CheckCircle2,
    color: "text-green-500"
  },
  error: {
    label: "Error",
    icon: XCircle,
    color: "text-red-500"
  }
};

function formatETA(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

export function BacktestProgressBar({ progress, eta }: BacktestProgressBarProps) {
  const info = stageInfo[progress.stage];
  const Icon = info.icon;
  const progressPercent = Math.round(progress.progress * 100);

  const isComplete = progress.stage === 'complete';
  const isError = progress.stage === 'error';
  const isRunning = !isComplete && !isError;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && <Loader2 className={`h-5 w-5 animate-spin ${info.color}`} />}
          {!isRunning && <Icon className={`h-5 w-5 ${info.color}`} />}
          <span className="font-semibold">{info.label}</span>
        </div>
        <Badge variant={isComplete ? "default" : isError ? "destructive" : "secondary"}>
          {progressPercent}%
        </Badge>
      </div>

      {/* Progress Bar */}
      <Progress value={progressPercent} className="h-2" />

      {/* Message and Stats */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{progress.message}</p>

        {/* Stats Grid */}
        {(progress.totalCandles || progress.fetchDuration || progress.backtestDuration || eta) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {progress.totalCandles && (
              <div className="bg-secondary/20 rounded px-2 py-1">
                <span className="text-muted-foreground">Candles: </span>
                <span className="font-medium">{progress.totalCandles.toLocaleString()}</span>
              </div>
            )}
            {progress.fetchDuration && (
              <div className="bg-secondary/20 rounded px-2 py-1">
                <span className="text-muted-foreground">Fetch: </span>
                <span className="font-medium">{progress.fetchDuration.toFixed(1)}s</span>
              </div>
            )}
            {progress.backtestDuration && (
              <div className="bg-secondary/20 rounded px-2 py-1">
                <span className="text-muted-foreground">Backtest: </span>
                <span className="font-medium">{progress.backtestDuration.toFixed(1)}s</span>
              </div>
            )}
            {eta && isRunning && (
              <div className="bg-blue-500/10 rounded px-2 py-1">
                <span className="text-muted-foreground">ETA: </span>
                <span className="font-medium text-blue-600 dark:text-blue-400">{formatETA(eta)}</span>
              </div>
            )}
          </div>
        )}

        {/* Completion Metrics */}
        {isComplete && progress.metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t">
            <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                {progress.metrics.winRate?.toFixed(1)}%
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">ROI</p>
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                {progress.metrics.roi?.toFixed(1)}%
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Max DD</p>
              <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                {progress.metrics.maxDrawdown?.toFixed(1)}%
              </p>
            </div>
            <div className="bg-secondary/20 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Trades</p>
              <p className="text-lg font-semibold">
                {progress.totalTrades}
              </p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {isError && progress.error && (
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-500 rounded-lg p-3">
            <p className="text-sm text-red-600 dark:text-red-400">
              {progress.error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
