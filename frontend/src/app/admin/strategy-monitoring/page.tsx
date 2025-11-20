'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  TrendingUp,
  Users,
  XCircle,
  Zap,
  AlertTriangle,
  Server,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface StrategyHealth {
  id: string;
  name: string;
  code: string;
  symbol: string;
  resolution: string;
  isActive: boolean;
  healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
  metrics: {
    subscriberCount: number;
    activeSubscribers: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    skippedExecutions: number;
    successRate: number;
    lastExecutedAt: string | null;
    minutesSinceLastExecution: number | null;
    lastExecutionStatus: string | null;
    lastExecutionDuration: number | null;
    lastExecutionError: string | null;
    avgDuration: number;
  };
  recentFailures: Array<{
    executedAt: string;
    error: string | null;
    duration: number | null;
  }>;
}

interface PlatformStats {
  totalStrategies: number;
  healthyStrategies: number;
  warningStrategies: number;
  criticalStrategies: number;
  unknownStrategies: number;
  totalSubscribers: number;
  totalExecutions: number;
  avgSuccessRate: number;
}

interface Execution {
  id: string;
  executedAt: string;
  status: string;
  duration: number | null;
  subscribersCount: number;
  tradesGenerated: number | null;
  error: string | null;
  strategy: {
    id: string;
    name: string;
    code: string;
  };
}

interface SchedulerHealth {
  isHealthy: boolean;
  recentExecutions: number;
  lastChecked: string;
  status: string;
  message: string;
}

export default function StrategyMonitoringPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<StrategyHealth[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [schedulerHealth, setSchedulerHealth] = useState<SchedulerHealth | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [timeRange, setTimeRange] = useState('24');
  const [executionFilter, setExecutionFilter] = useState<string>('all');

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, timeRange]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData(true); // Silent refresh
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, token, timeRange]);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const authToken = token?.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const baseURL = process.env.NEXT_PUBLIC_API_URL;

      const [healthRes, executionsRes, schedulerRes] = await Promise.all([
        axios.get(`${baseURL}/api/admin/strategy-health?hours=${timeRange}`, {
          headers: { Authorization: authToken }
        }),
        axios.get(`${baseURL}/api/admin/strategy-executions?hours=${timeRange}&limit=100`, {
          headers: { Authorization: authToken }
        }),
        axios.get(`${baseURL}/api/admin/scheduler-health`, {
          headers: { Authorization: authToken }
        })
      ]);

      setStrategies(healthRes.data.strategies);
      setPlatformStats(healthRes.data.platformStats);
      setExecutions(executionsRes.data.executions);
      setSchedulerHealth(schedulerRes.data.scheduler);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to load monitoring data');
      console.error('Strategy monitoring load error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getHealthStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getHealthStatusBadge = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'healthy':
        return 'default';
      case 'warning':
        return 'secondary';
      case 'critical':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getExecutionStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'SKIPPED':
        return <Clock className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getExecutionStatusBadge = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'SUCCESS':
        return 'default';
      case 'FAILED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const filteredExecutions = executions.filter(exec => {
    if (executionFilter === 'all') return true;
    return exec.status === executionFilter;
  });

  if (loading) {
    return (
      <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Strategy Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time health monitoring for all active strategies
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 1 hour</SelectItem>
              <SelectItem value="6">Last 6 hours</SelectItem>
              <SelectItem value="24">Last 24 hours</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => loadData()}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            className="gap-2"
          >
            <Activity className="h-4 w-4" />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Scheduler Health Alert */}
      {schedulerHealth && !schedulerHealth.isHealthy && (
        <Alert variant="destructive">
          <Server className="h-4 w-4" />
          <AlertTitle>Scheduler Warning</AlertTitle>
          <AlertDescription>{schedulerHealth.message}</AlertDescription>
        </Alert>
      )}

      {/* Platform Stats */}
      {platformStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Strategies
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {platformStats.totalStrategies}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {platformStats.healthyStrategies} healthy, {platformStats.criticalStrategies} critical
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Subscribers
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {platformStats.totalSubscribers}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Active strategy subscriptions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Executions
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {platformStats.totalExecutions}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                in selected period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Success Rate
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {platformStats.avgSuccessRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Platform-wide average
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Strategy Health Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Strategy Health Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {strategies.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No active strategies found
              </div>
            ) : (
              strategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className="flex items-start justify-between p-4 border border-border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      {getHealthStatusIcon(strategy.healthStatus)}
                      <div>
                        <h3 className="font-semibold text-foreground">{strategy.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {strategy.code} • {strategy.symbol} • {strategy.resolution}
                        </p>
                      </div>
                      <Badge variant={getHealthStatusBadge(strategy.healthStatus)} className="ml-2">
                        {strategy.healthStatus.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Subscribers</p>
                        <p className="font-medium text-foreground">{strategy.metrics.subscriberCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Success Rate</p>
                        <p className="font-medium text-foreground">{strategy.metrics.successRate}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Executions (24h)</p>
                        <p className="font-medium text-foreground">
                          {strategy.metrics.successfulExecutions}/{strategy.metrics.totalExecutions}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Last Execution</p>
                        <p className="font-medium text-foreground">
                          {strategy.metrics.lastExecutedAt
                            ? formatDistanceToNow(new Date(strategy.metrics.lastExecutedAt), {
                                addSuffix: true,
                              })
                            : 'Never'}
                        </p>
                      </div>
                    </div>

                    {strategy.metrics.lastExecutionStatus === 'FAILED' && strategy.metrics.lastExecutionError && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded text-sm">
                        <p className="text-red-600 dark:text-red-400 font-medium">Last Error:</p>
                        <p className="text-red-700 dark:text-red-300 text-xs mt-1">
                          {strategy.metrics.lastExecutionError}
                        </p>
                      </div>
                    )}

                    {strategy.recentFailures.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          Recent Failures: {strategy.recentFailures.length}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="text-right text-sm">
                    <Badge variant="outline" className="mb-2">
                      {strategy.metrics.lastExecutionStatus || 'N/A'}
                    </Badge>
                    {strategy.metrics.minutesSinceLastExecution !== null && (
                      <p className="text-xs text-muted-foreground">
                        {strategy.metrics.minutesSinceLastExecution}m ago
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Execution Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center">
              <Zap className="h-5 w-5 mr-2" />
              Recent Executions
            </CardTitle>
            <Select value={executionFilter} onValueChange={setExecutionFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="SKIPPED">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Executed At</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Subscribers</TableHead>
                  <TableHead>Trades</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExecutions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No executions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExecutions.map((exec) => (
                    <TableRow key={exec.id}>
                      <TableCell className="font-medium">
                        <div>
                          <p className="text-sm">{exec.strategy.name}</p>
                          <p className="text-xs text-muted-foreground">{exec.strategy.code}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getExecutionStatusIcon(exec.status)}
                          <Badge variant={getExecutionStatusBadge(exec.status)} className="text-xs">
                            {exec.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(exec.executedAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {exec.duration ? `${exec.duration.toFixed(1)}s` : 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm">{exec.subscribersCount || 0}</TableCell>
                      <TableCell className="text-sm">{exec.tradesGenerated || 0}</TableCell>
                      <TableCell>
                        {exec.error && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => alert(exec.error)}
                            className="text-xs h-7"
                          >
                            View Error
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {filteredExecutions.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {filteredExecutions.length} of {executions.length} executions
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
