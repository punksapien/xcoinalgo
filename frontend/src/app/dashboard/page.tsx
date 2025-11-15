'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { strategyService, Strategy } from '@/lib/strategy-service';
import { SubscribeModal } from '@/components/strategy/subscribe-modal';
import { Search, Filter, TrendingUp, Users, Bot, Clock, Target, TrendingDown, Zap, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';

function DashboardContent() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<{tag: string, count: number}[]>([]);
  const [sortBy, setSortBy] = useState('deploymentCount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [displayedCount, setDisplayedCount] = useState(12);
  const [itemsPerPage] = useState(12);

  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, token } = useAuth();

  // Handle OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const token = searchParams.get('token');
      const email = searchParams.get('email');

      if (token && email) {
        login({ id: '', email, createdAt: new Date().toISOString() }, token);
        router.replace('/dashboard');
      }
    };

    handleOAuthCallback();
  }, [searchParams, login, router]);

  // Debounced search function
  const debouncedSearch = useCallback((searchValue: string) => {
    setSearchTerm(searchValue);
  }, []);

  // Fetch strategies with optimized caching
  const fetchStrategies = useCallback(async () => {
    try {
      setLoading(true);
      const result = await strategyService.getStrategies({
        search: searchTerm,
        tags: selectedTags.join(','),
        sortBy,
        sortOrder
      }, token || undefined);
      setStrategies(result.strategies);
    } catch (error) {
      console.error('Error fetching strategies:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedTags, sortBy, sortOrder, token]);

  // Fetch tags
  const fetchTags = useCallback(async () => {
    try {
      const result = await strategyService.getTags();
      setAvailableTags(result.tags);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  }, []);

  // Effect for fetching strategies
  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  // Effect for fetching tags (only once)
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Debounced search input handler
  const handleSearchChange = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    return (value: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        debouncedSearch(value);
      }, 150); // 150ms debounce for very fast response
    };
  }, [debouncedSearch]);

  // Calculate displayed strategies (for "Load More" pattern)
  const displayedStrategies = strategies.slice(0, displayedCount);
  const hasMore = displayedCount < strategies.length;

  // Reset displayed count when filters change
  useEffect(() => {
    setDisplayedCount(12);
  }, [searchTerm, selectedTags, sortBy, sortOrder]);

  // Load more handler
  const handleLoadMore = () => {
    setDisplayedCount(prev => Math.min(prev + itemsPerPage, strategies.length));
  };

  // Manual refresh handler - forces cache invalidation
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    // Force re-fetch by clearing the service cache
    strategyService.invalidateCache();
    await fetchStrategies();
    setLoading(false);
  }, [fetchStrategies]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  }, []);

  const formatPercentage = useCallback((value?: number) => {
    if (!value) return 'N/A';
    return `${value.toFixed(1)}%`;
  }, []);

  const formatCurrency = useCallback((value?: number, currency: string = 'INR') => {
    if (!value) return 'N/A';
    const symbol = currency === 'USDT' ? '$' : '₹';
    return `${symbol}${value.toLocaleString()}`;
  }, []);

  const getStrategyTypeIcon = useCallback((tags: string) => {
    const tagLower = tags.toLowerCase();
    if (tagLower.includes('scalping') || tagLower.includes('high-frequency')) {
      return <Zap className="h-4 w-4 text-yellow-500" />;
    } else if (tagLower.includes('swing') || tagLower.includes('trend')) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    } else if (tagLower.includes('arbitrage')) {
      return <Target className="h-4 w-4 text-blue-500" />;
    }
    return <Bot className="h-4 w-4 text-primary" />;
  }, []);

  const getTimeAgo = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    const diffInMonths = Math.floor(diffInDays / 30);

    if (diffInDays < 1) return 'today';
    if (diffInDays === 1) return 'yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    if (diffInMonths === 1) return 'about 1 month ago';
    if (diffInMonths < 12) return `about ${diffInMonths} months ago`;
    const diffInYears = Math.floor(diffInMonths / 12);
    return diffInYears === 1 ? 'about 1 year ago' : `about ${diffInYears} years ago`;
  }, []);

  const isNewStrategy = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    return diffInDays <= 30;
  }, []);

  const handleStrategyClick = useCallback((strategyId: string) => {
    router.push(`/dashboard/strategy/${strategyId}`);
  }, [router]);

  const handleViewDetails = useCallback((strategyId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click when clicking the button
    router.push(`/dashboard/strategy/${strategyId}`);
  }, [router]);

  const handleDeployBot = useCallback((strategy: Strategy, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click when clicking the button
    setSelectedStrategy(strategy);
    setSubscribeModalOpen(true);
  }, []);

  const handleSubscribeSuccess = useCallback(() => {
    // Redirect to subscriptions page after successful subscription
    router.push('/dashboard/subscriptions');
  }, [router]);

  if (loading && strategies.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ready Bots</h1>
          <p className="mt-2 text-muted-foreground">
            Discover and deploy proven trading strategies from our marketplace
          </p>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
              <Input
                placeholder="Search strategies by name, code, description, or indicators..."
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Sort Controls */}
            <div className="flex gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deploymentCount">Popularity</SelectItem>
                  <SelectItem value="winRate">Win Rate</SelectItem>
                  <SelectItem value="roi">ROI</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="createdAt">Date</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortOrder} onValueChange={(value: 'asc' | 'desc') => setSortOrder(value)}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">High to Low</SelectItem>
                  <SelectItem value="asc">Low to High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tag Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Filter by tags:</span>
            {availableTags.slice(0, 12).map((tagObj) => (
              <Badge
                key={tagObj.tag}
                variant={selectedTags.includes(tagObj.tag) ? 'default' : 'secondary'}
                className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-all duration-200 hover:scale-105"
                onClick={() => toggleTag(tagObj.tag)}
              >
                {tagObj.tag} ({tagObj.count})
              </Badge>
            ))}
            {selectedTags.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTags([])}
                className="ml-2"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Results Counter */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? 'Searching...' : `Found ${strategies.length} strategies${strategies.length !== displayedStrategies.length ? ` (Showing ${displayedStrategies.length})` : ''}`}
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {loading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            )}
          </div>
        </div>

        {/* Strategy Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedStrategies.map((strategy) => (
            <Card
              key={strategy.id}
              className="group card-hover cursor-pointer border-border/50 hover:border-primary/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 relative overflow-visible"
              onClick={() => handleStrategyClick(strategy.id)}
            >
              {/* Public/Private Badge Overlay - Positioned absolutely at top-right, protruding from card */}
              <div className="absolute -top-2 -right-2 z-10">
                {strategy.isPublic ? (
                  <Badge className="text-xs px-3 py-1 bg-green-600 text-white border-2 border-background shadow-lg font-semibold">
                    PUBLIC
                  </Badge>
                ) : (
                  <Badge className="text-xs px-3 py-1 bg-yellow-600 text-white border-2 border-background shadow-lg font-semibold">
                    PRIVATE
                  </Badge>
                )}
              </div>

              <CardHeader className="pb-3">
                {/* Top Row: Strategy Code Badge */}
                <div className="mb-3">
                  <Badge className="text-xs px-2 py-1 bg-primary/10 text-primary border border-primary/30 font-mono uppercase">
                    {strategy.code}
                  </Badge>
                </div>

                {/* Strategy Title with Icon */}
                <div className="flex items-center gap-2 mb-3">
                  {getStrategyTypeIcon(strategy.tags)}
                  <CardTitle className="text-lg text-foreground leading-tight group-hover:text-primary transition-colors">{strategy.name}</CardTitle>
                </div>

                {/* Author and Timestamp Row */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>{strategy.author}</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{getTimeAgo(strategy.createdAt)}</span>
                  </div>
                  {isNewStrategy(strategy.createdAt) && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 animate-pulse">
                      <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                      NEW
                    </Badge>
                  )}
                </div>

                {/* Trading Pair and Deployments */}
                <div className="flex items-center gap-3 text-xs mb-3">
                  <span className="text-muted-foreground">• {strategy.instrument}</span>
                  <div className="flex items-center gap-1 text-green-600">
                    <Zap className="h-3 w-3" />
                    <span className="font-medium">{strategy.deploymentCount} deployments</span>
                  </div>
                </div>

                {/* Description (optional - keeping it minimal) */}
                {strategy.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {strategy.description}
                  </p>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Key Metrics Grid (2x2) */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingUp className="h-3 w-3 text-green-600" />
                      <p className="text-muted-foreground text-xs">Win Rate</p>
                    </div>
                    <p className="font-semibold text-green-600 text-base">
                      {formatPercentage(strategy.winRate)}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Target className="h-3 w-3 text-yellow-600" />
                      <p className="text-muted-foreground text-xs">ROI</p>
                    </div>
                    <p className="font-semibold text-yellow-600 text-base">
                      {formatPercentage(strategy.roi)}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingUp className="h-3 w-3 text-muted-foreground" />
                      <p className="text-muted-foreground text-xs">Risk/Reward</p>
                    </div>
                    <p className="font-semibold text-foreground text-base">
                      {strategy.riskReward?.toFixed(2) || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <AlertTriangle className="h-3 w-3 text-red-600" />
                      <p className="text-muted-foreground text-xs">Max Drawdown</p>
                    </div>
                    <p className="font-semibold text-red-600 text-base">
                      {strategy.maxDrawdown ? `₹${(strategy.maxDrawdown * 100).toFixed(2)}` : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Min Margin - Hardcoded */}
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground">Min Margin</p>
                  <p className="font-semibold text-foreground">₹10000</p>
                </div>

                {/* Tags - Compact */}
                {strategy.tags && strategy.tags.trim() && (
                  <div className="flex flex-wrap gap-1.5">
                    {strategy.tags.split(',').map(tag => tag.trim()).filter(tag => tag).slice(0, 3).map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-[10px] py-0 px-1.5">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Active Deployments Footer */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2">
                  <Zap className="h-3 w-3 text-yellow-500" />
                  <span>{strategy.deploymentCount} active deployments</span>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 hover:bg-primary/5 hover:border-primary/50 transition-all duration-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/dashboard/strategy/${strategy.id}`);
                    }}
                  >
                    View Details
                  </Button>
                  {strategy.isSubscribed ? (
                    <Button
                      size="sm"
                      className="flex-1 bg-muted text-muted-foreground cursor-not-allowed"
                      disabled
                    >
                      Deployed
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white transition-all duration-200 hover:scale-105 hover:shadow-lg"
                      onClick={(e) => handleDeployBot(strategy, e)}
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Deploy Now
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Load More Button */}
        {hasMore && (
          <div className="flex justify-center mt-8">
            <Button
              onClick={handleLoadMore}
              variant="outline"
              size="lg"
              className="min-w-[200px] hover:bg-primary/10 hover:border-primary transition-all"
            >
              Load More Strategies
            </Button>
          </div>
        )}

        {/* Empty State */}
        {strategies.length === 0 && !loading && (
          <div className="text-center py-12">
            <Bot className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No strategies found</h3>
            <p className="mt-2 text-muted-foreground">
              Try adjusting your search terms or filters to find strategies.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchTerm('');
                setSelectedTags([]);
                // Trigger search input clear
                const searchInput = document.querySelector('input[placeholder*="Search strategies"]') as HTMLInputElement;
                if (searchInput) searchInput.value = '';
              }}
              className="mt-4"
            >
              Clear All Filters
            </Button>
          </div>
        )}

        {/* Subscribe Modal */}
        {selectedStrategy && (
          <SubscribeModal
            open={subscribeModalOpen}
            onOpenChange={setSubscribeModalOpen}
            strategyId={selectedStrategy.id}
            strategyName={selectedStrategy.name}
            strategyMetrics={{
              minMargin: (selectedStrategy.executionConfig as Record<string, unknown>)?.minMargin as number ?? 10000,
              defaultLeverage: (selectedStrategy.executionConfig as Record<string, unknown>)?.defaultLeverage as number ?? 10,
              defaultRiskPerTrade: (selectedStrategy.executionConfig as Record<string, unknown>)?.defaultRiskPerTrade as number ?? 0.4,
              winRate: selectedStrategy.winRate,
              roi: selectedStrategy.roi,
              riskReward: selectedStrategy.riskReward,
              maxDrawdown: selectedStrategy.maxDrawdown,
            }}
            onSuccess={handleSubscribeSuccess}
          />
        )}
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
