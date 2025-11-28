'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from '@/lib/auth';
import { useRoleGuard } from '@/lib/use-role-guard';
import { showErrorToast, showSuccessToast } from '@/lib/toast-utils';
import { apiClient, ApiError } from '@/lib/api-client';
import { LogViewerModal } from '@/components/LogViewerModal';
import {
  Plus,
  Search,
  Trash2,
  Power,
  PowerOff,
  Eye,
  EyeOff,
  Loader2,
  FileCode,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  FileDown
} from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string;
  author: string;
  version: string;
  isActive: boolean;
  isMarketplace: boolean;
  isPublic: boolean;
  tags: string;
  instrument: string;
  createdAt: string;
  updatedAt: string;
  winRate?: number;
  roi?: number;
  maxDrawdown?: number;
  totalTrades?: number;
  deploymentCount: number;
  backtestStatus?: 'PROCESSING' | 'DONE' | 'FAILED';
  backtestError?: string;
}

export default function StrategyManagementPage() {
  const router = useRouter();
  const { token, hasHydrated } = useAuth();
  const { isAuthorized, isChecking } = useRoleGuard('QUANT');

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [logViewerStrategy, setLogViewerStrategy] = useState<Strategy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const fetchStrategies = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('all', 'true'); // Get both active and inactive
      params.append('limit', '1000'); // Get all strategies (increase from default 10)
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const data = await apiClient.get<{ strategies: Strategy[] }>(
        `/api/strategy-upload/strategies?${params}`
      );
      setStrategies(data.strategies || []);
    } catch (error) {
      console.error('Failed to fetch strategies:', error);
      if (error instanceof ApiError) {
        // 401 is handled automatically by apiClient (redirects to login)
        if (error.status !== 401) {
          showErrorToast('Error', error.message);
        }
      } else {
        showErrorToast('Error', 'Failed to load strategies');
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    // Wait for Zustand to hydrate and for token to be available
    if (!hasHydrated) {
      return;
    }

    // If no token after hydration, redirect to login
    if (!token) {
      router.replace('/login');
      return;
    }

    fetchStrategies();
  }, [fetchStrategies, hasHydrated, token, router]);

  // Poll for strategies with PROCESSING status
  useEffect(() => {
    const hasProcessingStrategies = strategies.some(s =>
      !s.isActive && !s.isMarketplace && (s.winRate == null || s.winRate === undefined)
    );

    if (!hasProcessingStrategies) {
      return;
    }

    // Poll every 5 seconds if there are processing strategies
    const intervalId = setInterval(() => {
      fetchStrategies();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [strategies, fetchStrategies]);

  const handleDelete = async (strategyId: string) => {
    if (!token) return;

    setActionLoading(strategyId);
    try {
      await apiClient.delete(`/api/strategy-upload/${strategyId}`);

      showSuccessToast('Deleted', 'Strategy deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedStrategy(null);
      fetchStrategies();
    } catch (error) {
      console.error('Delete failed:', error);
      if (error instanceof ApiError && error.status !== 401) {
        showErrorToast('Delete Failed', error.message);
      } else if (!(error instanceof ApiError)) {
        showErrorToast('Delete Failed', 'Failed to delete strategy');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (strategy: Strategy) => {
    if (!token) return;

    setActionLoading(strategy.id);
    const endpoint = strategy.isActive ? 'deactivate' : 'activate';

    try {
      const data = await apiClient.patch<{ message?: string }>(
        `/api/strategy-upload/${strategy.id}/${endpoint}`
      );

      showSuccessToast(
        strategy.isActive ? 'Deactivated' : 'Activated',
        data.message || `Strategy ${strategy.isActive ? 'deactivated' : 'activated'} successfully`
      );
      fetchStrategies();
    } catch (error) {
      console.error('Toggle active failed:', error);
      if (error instanceof ApiError && error.status !== 401) {
        showErrorToast('Action Failed', error.message);
      } else if (!(error instanceof ApiError)) {
        showErrorToast('Action Failed', 'Failed to update strategy status');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleVisibility = async (strategy: Strategy) => {
    if (!token) return;

    setActionLoading(strategy.id);

    try {
      const data = await apiClient.patch<{ message?: string; isPublic: boolean }>(
        `/api/strategy-upload/${strategy.id}/toggle-visibility`
      );

      showSuccessToast(
        'Visibility Updated',
        data.message || `Strategy is now ${data.isPublic ? 'PUBLIC' : 'PRIVATE'}`
      );
      fetchStrategies();
    } catch (error) {
      console.error('Toggle visibility failed:', error);
      if (error instanceof ApiError && error.status !== 401) {
        showErrorToast('Action Failed', error.message);
      } else if (!(error instanceof ApiError)) {
        showErrorToast('Action Failed', 'Failed to update strategy visibility');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setDeleteDialogOpen(true);
  };

  const openLogViewer = (strategy: Strategy) => {
    setLogViewerStrategy(strategy);
    setLogViewerOpen(true);
  };

  const handleDownloadReport = async (strategy: Strategy) => {
    if (!token) return;

    setActionLoading(strategy.id);
    try {
      // Call API endpoint to generate report
      const response = await fetch(`/api/strategies/${strategy.id}/daily-report`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate report' }));
        throw new Error(errorData.error || 'Failed to generate report');
      }

      // Download the CSV
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `strategy_${strategy.code}_daily_report_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showSuccessToast('Success', 'Daily report downloaded successfully');
    } catch (error) {
      console.error('Download report failed:', error);
      if (error instanceof Error) {
        showErrorToast('Download Failed', error.message);
      } else {
        showErrorToast('Download Failed', 'Failed to download daily report');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const filteredStrategies = strategies.filter(strategy => {
    const matchesSearch = searchTerm === '' ||
      strategy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      strategy.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      strategy.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (strategy.description && strategy.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && strategy.isActive) ||
      (statusFilter === 'inactive' && !strategy.isActive);

    return matchesSearch && matchesStatus;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredStrategies.length / itemsPerPage);
  const paginatedStrategies = filteredStrategies.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatPercentage = (value?: number) => {
    if (value == null) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  const getBacktestStatusBadge = (strategy: Strategy) => {
    // Strategy is backtesting if it's inactive and not in marketplace and has no metrics
    const isBacktesting = !strategy.isActive && !strategy.isMarketplace && (strategy.winRate == null || strategy.winRate === undefined);

    if (isBacktesting) {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Backtesting...
        </Badge>
      );
    }

    // Check if backtest failed
    if (!strategy.isMarketplace && strategy.winRate === undefined) {
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <AlertCircle className="h-3 w-3 mr-1" />
          Backtest Failed
        </Badge>
      );
    }

    // Normal status badge
    return (
      <Badge
        variant={strategy.isActive ? "default" : "secondary"}
        className={strategy.isActive ? "bg-green-500" : ""}
      >
        {strategy.isActive ? 'Active' : 'Inactive'}
      </Badge>
    );
  };

  // Show loading while checking role or hydrating or fetching
  if (isChecking || !hasHydrated || loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // If not authorized, don't render anything (role guard will redirect)
  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Strategy Management</h1>
          <p className="text-muted-foreground">
            Manage your uploaded strategies - view, edit, activate, or delete
          </p>
        </div>
        <Link href="/strategies/upload">
          <Button className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Upload New Strategy
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Strategies</p>
                <p className="text-2xl font-bold">{strategies.length}</p>
              </div>
              <FileCode className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-500">
                  {strategies.filter(s => s.isActive).length}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inactive</p>
                <p className="text-2xl font-bold text-yellow-500">
                  {strategies.filter(s => !s.isActive).length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Subscribers</p>
                <p className="text-2xl font-bold text-blue-500">
                  {strategies.reduce((sum, s) => sum + (s.deploymentCount || 0), 0)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search strategies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              onClick={() => setStatusFilter(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* Strategies Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Strategies</CardTitle>
          <CardDescription>
            {filteredStrategies.length} {filteredStrategies.length === 1 ? 'strategy' : 'strategies'} found (Page {currentPage} of {totalPages || 1})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredStrategies.length === 0 ? (
            <div className="text-center py-12">
              <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No strategies found</h3>
              <p className="text-muted-foreground mb-4">
                {strategies.length === 0
                  ? "Upload your first strategy to get started"
                  : "No strategies match your current filters"
                }
              </p>
              {strategies.length === 0 && (
                <Link href="/strategies/upload">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Upload Strategy
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Strategy</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Performance</th>
                    <th className="text-left py-3 px-4 font-medium">Subscribers</th>
                    <th className="text-left py-3 px-4 font-medium">Updated</th>
                    <th className="text-right py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStrategies.map((strategy) => (
                    <tr key={strategy.id} className="border-b hover:bg-secondary/20">
                      <td className="py-4 px-4">
                        <div>
                          <p className="font-medium">{strategy.name}</p>
                          <p className="text-sm text-muted-foreground">{strategy.code}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              v{strategy.version}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {strategy.instrument}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1">
                          {getBacktestStatusBadge(strategy)}
                          <Badge
                            variant={strategy.isPublic ? 'default' : 'secondary'}
                            className="text-xs w-fit"
                          >
                            {strategy.isPublic ? 'Public' : 'Private'}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Win Rate:</span>
                            <span className="font-medium text-green-500">
                              {formatPercentage(strategy.winRate)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">ROI:</span>
                            <span className="font-medium text-green-500">
                              {formatPercentage(strategy.roi)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{strategy.deploymentCount || 0}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDate(strategy.updatedAt)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/strategies/${strategy.id}/edit`)}
                            title="Edit Code"
                          >
                            <FileCode className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(strategy)}
                            disabled={actionLoading === strategy.id}
                            title={strategy.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {actionLoading === strategy.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : strategy.isActive ? (
                              <PowerOff className="h-4 w-4 text-yellow-500" />
                            ) : (
                              <Power className="h-4 w-4 text-green-500" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleVisibility(strategy)}
                            disabled={actionLoading === strategy.id}
                            title={strategy.isPublic ? 'Make Private' : 'Make Public'}
                          >
                            {actionLoading === strategy.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : strategy.isPublic ? (
                              <Eye className="h-4 w-4 text-blue-500" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-gray-500" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadReport(strategy)}
                            disabled={actionLoading === strategy.id}
                            title="Download Daily Report (till yesterday)"
                          >
                            {actionLoading === strategy.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileDown className="h-4 w-4 text-purple-500" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => confirmDelete(strategy)}
                            disabled={actionLoading === strategy.id || strategy.deploymentCount > 0}
                            title={
                              strategy.deploymentCount > 0
                                ? 'Cannot delete - has active subscribers'
                                : 'Delete Strategy'
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {filteredStrategies.length > itemsPerPage && (
                <Pagination className="mt-6">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage(currentPage - 1);
                        }}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage(page);
                              }}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }
                      if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }
                      return null;
                    })}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                        }}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{selectedStrategy?.name}</strong>.
              This action cannot be undone.
              {selectedStrategy?.deploymentCount && selectedStrategy.deploymentCount > 0 && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-red-700 dark:text-red-400 font-medium">
                    ⚠️ This strategy has {selectedStrategy.deploymentCount} active subscriber(s).
                    Please contact subscribers to stop their deployments before deleting.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedStrategy && handleDelete(selectedStrategy.id)}
              disabled={actionLoading !== null}
              className="bg-red-500 hover:bg-red-600"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Log Viewer Modal */}
      {logViewerStrategy && (
        <LogViewerModal
          isOpen={logViewerOpen}
          onClose={() => {
            setLogViewerOpen(false);
            setLogViewerStrategy(null);
          }}
          strategyId={logViewerStrategy.id}
          strategyName={logViewerStrategy.name}
        />
      )}
    </div>
  );
}
