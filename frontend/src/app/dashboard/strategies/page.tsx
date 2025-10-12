'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/lib/auth';
import { StrategyExecutionAPI } from '@/lib/api/strategy-execution-api';
import { SubscribeModal } from '@/components/strategy/subscribe-modal';
import { showErrorToast, showSuccessToast } from '@/lib/toast-utils';
import { getUserFriendlyError } from '@/lib/error-messages';
import {
  Search,
  FileText,
  Users,
  TrendingUp,
  Bot,
  Zap,
  Target,
  Clock
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
  instrument: string;
  createdAt: string;
  updatedAt: string;
  subscriberCount: number;
  deploymentCount: number;
  winRate?: number;
  roi?: number;
  riskReward?: number;
  maxDrawdown?: number;
  marginRequired?: number;
  features?: {
    timeframes: string[];
    leverage: number;
  };
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

      const response = await fetch(`/api/strategy-upload/strategies?${params}`, {
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

  const formatPercentage = (value?: number) => {
    if (value == null) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  const formatCurrency = (value?: number) => {
    if (value == null) return 'N/A';
    return `₹${value.toLocaleString()}`;
  };

  const getStrategyTypeIcon = (tags: string) => {
    const tagLower = tags.toLowerCase();
    if (tagLower.includes('scalping') || tagLower.includes('high-frequency')) {
      return <Zap className="h-4 w-4 text-yellow-500" />;
    } else if (tagLower.includes('swing') || tagLower.includes('trend')) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    } else if (tagLower.includes('arbitrage')) {
      return <Target className="h-4 w-4 text-blue-500" />;
    }
    return <Bot className="h-4 w-4 text-primary" />;
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
          <h1 className="text-3xl font-bold mb-2 dark:text-white">Available Strategies</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Browse and subscribe to trading strategies from our quant team
          </p>
        </div>
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
                ? "No strategies are currently available. Our quant team is working on adding new strategies. Check back soon!"
                : "No strategies match your current filters"
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStrategies.map((strategy) => (
            <Card key={strategy.id} className="hover:shadow-lg transition-shadow dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStrategyTypeIcon(strategy.tags)}
                      <CardTitle className="text-lg text-foreground leading-tight">{strategy.name}</CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{strategy.code}</p>
                  </div>
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                    {strategy.instrument}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                  {strategy.description}
                </p>
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
                      {formatPercentage(strategy.winRate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ROI</p>
                    <p className="font-semibold text-accent">
                      {formatPercentage(strategy.roi)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Risk/Reward</p>
                    <p className="font-semibold text-foreground">{strategy.riskReward?.toFixed(1) || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Max Drawdown</p>
                    <p className="font-semibold text-destructive">
                      {formatPercentage(strategy.maxDrawdown)}
                    </p>
                  </div>
                </div>

                {/* Additional Features */}
                {strategy.features && (
                  <div className="border-t border-border/50 pt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Timeframes:</span>
                      <span className="text-xs text-foreground">{strategy.features.timeframes.join(', ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Leverage:</span>
                      <span className="text-xs text-foreground">{strategy.features.leverage}x</span>
                    </div>
                  </div>
                )}

                {/* Margin Required */}
                <div className="border-t border-border/50 pt-3">
                  <p className="text-xs text-muted-foreground">Margin Required</p>
                  <p className="font-semibold text-foreground">{formatCurrency(strategy.marginRequired)}</p>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {strategy.tags && strategy.tags.trim() ? (
                    <>
                      {strategy.tags.split(',').map(tag => tag.trim()).filter(tag => tag).slice(0, 3).map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs hover:bg-primary/10 transition-colors">
                          {tag}
                        </Badge>
                      ))}
                      {strategy.tags.split(',').length > 3 && (
                        <Badge variant="secondary" className="text-xs hover:bg-primary/10 transition-colors">
                          +{strategy.tags.split(',').length - 3}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      No tags
                    </Badge>
                  )}
                </div>

                {/* Deployment Count */}
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center space-x-1 text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    <span>{strategy.deploymentCount || 0} active</span>
                  </span>
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

                {/* Action Buttons */}
                <div className="flex space-x-2 pt-2">
                  <Link href={`/dashboard/strategy/${strategy.id}`} className="flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full hover:bg-primary/5 hover:border-primary/50 transition-all"
                    >
                      View Details
                    </Button>
                  </Link>
                  {getUserSubscriptionStatus(strategy.id) ? (
                    <Link href="/dashboard/subscriptions" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        Manage
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1 bg-primary hover:bg-primary/90 transition-all hover:scale-105"
                      onClick={() => handleSubscribe(strategy)}
                    >
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