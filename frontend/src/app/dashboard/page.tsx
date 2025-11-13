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
import { Search, Filter, TrendingUp, Users, Bot, Clock, Target, TrendingDown, Zap, RefreshCw } from 'lucide-react';

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
              className="card-hover cursor-pointer border-border/50 hover:border-primary/30 transition-all duration-200"
              onClick={() => handleStrategyClick(strategy.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {getStrategyTypeIcon(strategy.tags)}
                      <CardTitle className="text-lg text-foreground leading-tight">{strategy.name}</CardTitle>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{strategy.code}</p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                      {strategy.instrument}
                    </Badge>
                    {/* Visibility Badge */}
                    {strategy.isPublic === false && (
                      <Badge variant="secondary" className="text-xs">
                        Private
                      </Badge>
                    )}
                    {/* Owner Badge */}
                    {strategy.isOwned && (
                      <Badge variant="default" className="text-xs bg-blue-600">
                        Your Strategy
                      </Badge>
                    )}
                    {/* Access Status Badge */}
                    {strategy.accessStatus === 'PENDING' && (
                      <Badge variant="outline" className="text-xs border-yellow-600 text-yellow-600">
                        Access Pending
                      </Badge>
                    )}
                    {strategy.accessStatus === 'APPROVED' && strategy.isPublic === false && (
                      <Badge variant="outline" className="text-xs border-green-600 text-green-600">
                        Access Granted
                      </Badge>
                    )}
                  </div>
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
                  <p className="text-xs text-muted-foreground">Min Margin</p>
                  <p className="font-semibold text-foreground">{formatCurrency(strategy.marginRequired, strategy.marginCurrency)}</p>
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
                    <span>{strategy.deploymentCount} active</span>
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 hover:bg-primary/5 hover:border-primary/50 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/dashboard/strategy/${strategy.id}`);
                    }}
                  >
                    View Details
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-primary hover:bg-primary/90 transition-all hover:scale-105"
                    onClick={(e) => handleDeployBot(strategy, e)}
                    disabled={strategy.isSubscribed}
                  >
                    {strategy.isSubscribed ? 'Deployed' : 'Deploy Bot Now'}
                  </Button>
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
            onSuccess={handleSubscribeSuccess}
          />
        )}
    </div>
  );
}

export default function DashboardPage() {
  return <DashboardContent />;
}
