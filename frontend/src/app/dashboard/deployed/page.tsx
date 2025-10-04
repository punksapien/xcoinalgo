'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { useAuth } from '@/lib/auth';
import {
  Play,
  Square,
  Trash2,
  MoreVertical,
  Clock,
  Activity,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';

interface ProcessInfo {
  pid: number;
  pm2Id: number;
  name: string;
  status: string;
  uptime?: number;
  memory?: number;
  cpu?: number;
}

interface BotDeployment {
  id: string;
  status: 'STOPPED' | 'DEPLOYING' | 'STARTING' | 'ACTIVE' | 'UNHEALTHY' | 'CRASHED' | 'ERROR';
  leverage: number;
  riskPerTrade: number;
  marginCurrency: string;
  deployedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeat?: string;
  restartCount: number;
  errorMessage?: string;
  processInfo?: ProcessInfo;
  strategy: {
    name: string;
    code: string;
    author: string;
    instrument: string;
  };
}

interface DeploymentResponse {
  deployments: BotDeployment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function DeployedBotsPage() {
  const [deployments, setDeployments] = useState<BotDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'stopped'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const { token, isAuthenticated } = useAuth();
  const router = useRouter();

  const fetchDeployments = async () => {
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.set('status', filter.toUpperCase());
      }

      const response = await fetch(`/api/bot/deployments?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to fetch deployments');
      }

      const data: DeploymentResponse = await response.json();
      setDeployments(data.deployments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deployments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (token) {
      fetchDeployments();
    }
  }, [filter, token, isAuthenticated]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDeployments();
  };

  const handleStop = async (deploymentId: string) => {
    if (!token) {
      setError('Not authenticated');
      return;
    }

    try {
      const response = await fetch('/api/bot/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ deploymentId }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to stop bot');
      }

      fetchDeployments(); // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop bot');
    }
  };

  const handleStart = async (strategyId: string) => {
    if (!token) {
      setError('Not authenticated');
      return;
    }

    try {
      const response = await fetch('/api/bot/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ strategyId }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to start bot');
      }

      fetchDeployments(); // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start bot');
    }
  };

  const handleDelete = async (deploymentId: string) => {
    if (!confirm('Are you sure you want to delete this deployment?')) {
      return;
    }

    if (!token) {
      setError('Not authenticated');
      return;
    }

    try {
      const response = await fetch(`/api/bot/deployments/${deploymentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error('Failed to delete deployment');
      }

      fetchDeployments(); // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete deployment');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'STARTING':
      case 'DEPLOYING':
        return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case 'STOPPED':
        return <Square className="h-4 w-4 text-gray-500" />;
      case 'ERROR':
      case 'CRASHED':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'UNHEALTHY':
        return <Activity className="h-4 w-4 text-orange-500" />;
      default:
        return <Square className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'STARTING':
      case 'DEPLOYING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'STOPPED':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'ERROR':
      case 'CRASHED':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'UNHEALTHY':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatUptime = (uptime?: number) => {
    if (!uptime) return 'N/A';
    const seconds = Math.floor((Date.now() - uptime) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatMemory = (bytes?: number) => {
    if (!bytes) return 'N/A';
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Show loading while checking authentication
  if (!isAuthenticated || !token) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Deployed & Live Bots</h1>
            <p className="text-muted-foreground mt-1">
              Manage your trading bots and monitor their performance
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
          {(['all', 'active', 'stopped'] as const).map((filterOption) => (
            <button
              key={filterOption}
              onClick={() => setFilter(filterOption)}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                filter === filterOption
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {filterOption === 'all' ? 'All' :
               filterOption === 'active' ? 'Active' : 'Stopped'}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive/15 border border-destructive/20 text-destructive px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Deployments Table */}
        <div className="bg-card rounded-lg border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-card-foreground">
              Bot Deployments
            </h2>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading deployments...</p>
            </div>
          ) : deployments.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No deployed bots</h3>
              <p className="text-muted-foreground">
                Deploy a bot from the Ready Bots section to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Bot Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Performance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Configuration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Deployed
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deployments.map((deployment) => (
                    <tr key={deployment.id} className="hover:bg-muted/25">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <div className="text-sm font-medium text-foreground">
                            {deployment.strategy.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {deployment.strategy.code} • by {deployment.strategy.author}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {deployment.strategy.instrument}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(deployment.status)}
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-md border ${getStatusColor(deployment.status)}`}>
                              {deployment.status}
                            </span>
                          </div>
                          {deployment.errorMessage && (
                            <div className="text-xs text-red-600 max-w-xs truncate" title={deployment.errorMessage}>
                              {deployment.errorMessage}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs space-y-1">
                          <div>Uptime: {formatUptime(deployment.processInfo?.uptime)}</div>
                          <div>Memory: {formatMemory(deployment.processInfo?.memory)}</div>
                          <div>CPU: {deployment.processInfo?.cpu?.toFixed(1) || 'N/A'}%</div>
                          <div>Restarts: {deployment.restartCount}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs space-y-1">
                          <div>Leverage: {deployment.leverage}x</div>
                          <div>Risk: {(deployment.riskPerTrade * 100).toFixed(2)}%</div>
                          <div>Margin: {deployment.marginCurrency}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs text-muted-foreground">
                          {new Date(deployment.deployedAt).toLocaleString()}
                        </div>
                        {deployment.lastHeartbeat && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Last beat: {new Date(deployment.lastHeartbeat).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {deployment.status === 'STOPPED' || deployment.status === 'ERROR' || deployment.status === 'CRASHED' ? (
                            <button
                              onClick={() => handleStart(deployment.strategy.code)}
                              className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-md transition-colors"
                              title="Start bot"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStop(deployment.id)}
                              className="p-2 text-orange-600 hover:text-orange-900 hover:bg-orange-50 rounded-md transition-colors"
                              title="Stop bot"
                            >
                              <Square className="h-4 w-4" />
                            </button>
                          )}

                          {(deployment.status === 'STOPPED' || deployment.status === 'ERROR') && (
                            <button
                              onClick={() => handleDelete(deployment.id)}
                              className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete deployment"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        {deployments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-card p-6 rounded-lg border">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-muted-foreground">Active Bots</p>
                  <p className="text-2xl font-bold text-foreground">
                    {deployments.filter(d => d.status === 'ACTIVE').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <div className="flex items-center">
                <Square className="h-5 w-5 text-gray-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-muted-foreground">Stopped Bots</p>
                  <p className="text-2xl font-bold text-foreground">
                    {deployments.filter(d => d.status === 'STOPPED').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-muted-foreground">Error Bots</p>
                  <p className="text-2xl font-bold text-foreground">
                    {deployments.filter(d => d.status === 'ERROR' || d.status === 'CRASHED').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card p-6 rounded-lg border">
              <div className="flex items-center">
                <Activity className="h-5 w-5 text-blue-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-muted-foreground">Total Deployments</p>
                  <p className="text-2xl font-bold text-foreground">
                    {deployments.length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}