'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/lib/auth';
import { StrategyExecutionAPI } from '@/lib/api/strategy-execution-api';
import { SubscribeModal } from '@/components/strategy/subscribe-modal';
import { showErrorToast, showSuccessToast } from '@/lib/toast-utils';
import { getUserFriendlyError } from '@/lib/error-messages';
import {
  Upload,
  Search,
  Plus,
  FileText,
  Users
} from "lucide-react";

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string;
  author: string;
  version: string;
  isActive: boolean;
  tags: string;
  createdAt: string;
  updatedAt: string;
  subscriberCount: number;
  winRate?: number;
  roi?: number;
  riskReward?: number;
  maxDrawdown?: number;
  marginRequired?: number;
  executionConfig?: {
    symbol: string;
    resolution: string;
  };
}

interface UserSubscription {
  strategyId: string;
  isActive: boolean;
  isPaused: boolean;
}

export default function StrategiesPage() {
  const { token } = useAuth();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [userSubscriptions, setUserSubscriptions] = useState<Map<string, UserSubscription>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);

  useEffect(() => {
    fetchStrategies();
    if (token) {
      fetchUserSubscriptions();
    }
  }, [searchTerm, statusFilter, token]);

  const fetchStrategies = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`/api/strategy-upload/my-strategies?${params}`, {
        headers: token ? {
          'Authorization': `Bearer ${token}`,
        } : {},
      });

      if (!response.ok) {
        throw new Error('Failed to fetch strategies');
      }

      const data = await response.json();
      setStrategies(data.strategies || []);
    } catch (error) {
      console.error('Failed to fetch strategies:', error);
      const friendlyError = getUserFriendlyError(error as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserSubscriptions = async () => {
    if (!token) return;

    try {
      const response = await StrategyExecutionAPI.getUserSubscriptions(token);
      const subsMap = new Map<string, UserSubscription>();

      response.subscriptions.forEach(sub => {
        subsMap.set(sub.strategyId, {
          strategyId: sub.strategyId,
          isActive: sub.isActive,
          isPaused: sub.isPaused,
        });
      });

      setUserSubscriptions(subsMap);
    } catch (error) {
      console.error('Failed to fetch user subscriptions:', error);
      const friendlyError = getUserFriendlyError(error as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
    }
  };

  const handleSubscribe = (strategy: Strategy) => {
    setSelectedStrategy(strategy);
    setSubscribeModalOpen(true);
  };

  const handleSubscribeSuccess = () => {
    showSuccessToast('Successfully Subscribed', 'You can now manage your subscription from the Subscriptions page');
    fetchUserSubscriptions();
    fetchStrategies();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'DEPLOYING': return 'bg-blue-100 text-blue-800';
      case 'STOPPED': return 'bg-gray-100 text-gray-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredStrategies = strategies.filter(strategy => {
    const tagsString = typeof strategy.tags === 'string' ? strategy.tags : '';
    const matchesSearch = searchTerm === '' ||
      strategy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (strategy.description && strategy.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      strategy.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tagsString.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && strategy.isActive) ||
      (statusFilter === 'inactive' && !strategy.isActive);

    return matchesSearch && matchesStatus;
  });

  const getUserSubscriptionStatus = (strategyId: string) => {
    return userSubscriptions.get(strategyId);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 dark:text-white">My Strategies</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage and deploy your trading strategies
          </p>
        </div>
        <Link href="/dashboard/strategies/upload">
          <Button className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Strategy
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
          <Input
            placeholder="Search strategies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
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

      {/* Strategy Grid */}
      {filteredStrategies.length === 0 ? (
        <Card className="text-center py-12 dark:bg-gray-800 dark:border-gray-700">
          <CardContent>
            <FileText className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2 dark:text-white">No strategies found</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {strategies.length === 0
                ? "Upload your first trading strategy to get started"
                : "No strategies match your current filters"
              }
            </p>
            {strategies.length === 0 && (
              <Link href="/dashboard/strategies/upload">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload Your First Strategy
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStrategies.map((strategy) => (
            <Card key={strategy.id} className="hover:shadow-lg transition-shadow dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1 dark:text-white">{strategy.name}</CardTitle>
                    <CardDescription className="line-clamp-2 dark:text-gray-400">
                      {strategy.description || 'No description provided'}
                    </CardDescription>
                  </div>
                  {strategy.isActive ? (
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Author */}
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{strategy.author}</span>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Win Rate</p>
                    <p className="font-semibold text-primary">
                      {strategy.winRate ? `${strategy.winRate.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ROI</p>
                    <p className="font-semibold text-accent">
                      {strategy.roi ? `${strategy.roi.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Risk/Reward</p>
                    <p className="font-semibold text-foreground">{strategy.riskReward?.toFixed(1) || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Max Drawdown</p>
                    <p className="font-semibold text-destructive">
                      {strategy.maxDrawdown ? `${strategy.maxDrawdown.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Margin Required */}
                <div className="border-t border-border/50 pt-3">
                  <p className="text-xs text-muted-foreground">Margin Required</p>
                  <p className="font-semibold text-foreground">
                    {strategy.marginRequired ? `₹${strategy.marginRequired.toLocaleString()}` : 'N/A'}
                  </p>
                </div>

                {/* Subscription Status */}
                {getUserSubscriptionStatus(strategy.id) && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Your Subscription</span>
                      <Badge
                        className={getUserSubscriptionStatus(strategy.id)?.isPaused ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}
                        variant="secondary"
                      >
                        {getUserSubscriptionStatus(strategy.id)?.isPaused ? 'Paused' : 'Active'}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Tags */}
                {strategy.tags && typeof strategy.tags === 'string' && strategy.tags.trim() && (
                  <div className="flex flex-wrap gap-1">
                    {strategy.tags.split(',').slice(0, 3).map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {tag.trim()}
                      </Badge>
                    ))}
                    {strategy.tags.split(',').length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{strategy.tags.split(',').length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Link href={`/dashboard/strategy/${strategy.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <FileText className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </Link>

                  {getUserSubscriptionStatus(strategy.id) ? (
                    <Link href="/dashboard/subscriptions" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Users className="h-4 w-4 mr-1" />
                        Manage
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleSubscribe(strategy)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Subscribe
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Subscribe Modal */}
      {selectedStrategy && (
        <SubscribeModal
          open={subscribeModalOpen}
          onOpenChange={setSubscribeModalOpen}
          strategyId={selectedStrategy.id}
          strategyName={selectedStrategy.name}
          onSuccess={handleSubscribeSuccess}
        />
      )}
    </div>
  );
}