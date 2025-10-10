'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { showErrorToast } from '@/lib/toast-utils';
import { getUserFriendlyError } from '@/lib/error-messages';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  User,
  Target,
  Shield,
  Zap,
  ArrowRight
} from "lucide-react";

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string;
  detailedDescription: string;
  author: string;
  version: string;
  tags: string;
  createdAt: string;
  updatedAt: string;

  // Performance metrics
  winRate: number | null;
  roi: number | null;
  riskReward: number | null;
  maxDrawdown: number | null;
  marginRequired: number | null;

  // Trading config
  instrument: string;
  supportedPairs: string[] | null;
  timeframes: string[] | null;
  strategyType: string | null;

  subscriberCount: number;
}

export default function MarketplacePage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'popularity' | 'performance' | 'newest'>('popularity');

  useEffect(() => {
    fetchStrategies();
  }, [searchTerm, sortBy]);

  const fetchStrategies = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      params.append('sortBy', sortBy);

      const response = await fetch(`/api/marketplace?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch marketplace strategies');
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

  const getPerformanceColor = (value: number | null, isNegativeBad: boolean = true) => {
    if (value === null) return 'text-gray-500';
    if (isNegativeBad) {
      return value >= 0 ? 'text-green-600' : 'text-red-600';
    } else {
      return value <= 0 ? 'text-green-600' : 'text-red-600';
    }
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
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4 dark:text-white">Strategy Marketplace</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Discover and subscribe to proven trading strategies from expert quant teams
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
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
          {[
            { value: 'popularity', label: 'Most Popular', icon: Users },
            { value: 'performance', label: 'Best Performance', icon: TrendingUp },
            { value: 'newest', label: 'Newest', icon: Clock }
          ].map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.value}
                variant={sortBy === option.value ? 'default' : 'outline'}
                onClick={() => setSortBy(option.value as 'popularity' | 'performance' | 'newest')}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{option.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Strategy Grid */}
      {strategies.length === 0 ? (
        <Card className="text-center py-12 dark:bg-gray-800 dark:border-gray-700">
          <CardContent>
            <TrendingUp className="h-16 w-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2 dark:text-white">No strategies found</h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchTerm ? "Try a different search term" : "Check back soon for new strategies"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {strategies.map((strategy) => (
            <Card key={strategy.id} className="hover:shadow-lg transition-shadow dark:bg-gray-800 dark:border-gray-700 flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between mb-2">
                  <CardTitle className="text-lg dark:text-white">{strategy.name}</CardTitle>
                  <Badge className="bg-blue-100 text-blue-800 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {strategy.subscriberCount || 0}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2 dark:text-gray-400">
                  {strategy.description || 'No description provided'}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 flex-1 flex flex-col">
                {/* Author */}
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <User className="h-4 w-4" />
                  <span>{strategy.author}</span>
                </div>

                {/* Performance Metrics */}
                {(strategy.winRate !== null || strategy.roi !== null || strategy.maxDrawdown !== null) && (
                  <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    {strategy.winRate !== null && (
                      <div className="text-center">
                        <div className={`text-lg font-bold ${getPerformanceColor(strategy.winRate)}`}>
                          {strategy.winRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Win Rate</div>
                      </div>
                    )}
                    {strategy.roi !== null && (
                      <div className="text-center">
                        <div className={`text-lg font-bold ${getPerformanceColor(strategy.roi)}`}>
                          {strategy.roi >= 0 ? '+' : ''}{strategy.roi.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">ROI</div>
                      </div>
                    )}
                    {strategy.maxDrawdown !== null && (
                      <div className="text-center">
                        <div className={`text-lg font-bold ${getPerformanceColor(strategy.maxDrawdown, false)}`}>
                          {strategy.maxDrawdown.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Max DD</div>
                      </div>
                    )}
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
                  </div>
                )}

                {/* Risk Indicators */}
                <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400 mt-auto">
                  {strategy.riskReward && (
                    <div className="flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      <span>R:R {strategy.riskReward.toFixed(1)}</span>
                    </div>
                  )}
                  {strategy.marginRequired && (
                    <div className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      <span>${strategy.marginRequired}</span>
                    </div>
                  )}
                </div>

                {/* View Details Button */}
                <Link href={`/marketplace/${strategy.id}`} className="w-full mt-4">
                  <Button className="w-full flex items-center justify-center gap-2">
                    <Zap className="h-4 w-4" />
                    View & Subscribe
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Stats Footer */}
      {strategies.length > 0 && (
        <div className="mt-12 text-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                  {strategies.length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Available Strategies</div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">
                  {strategies.reduce((sum, s) => sum + (s.subscriberCount || 0), 0)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Subscribers</div>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-6">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                  {new Set(strategies.map(s => s.author)).size}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Expert Quants</div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
