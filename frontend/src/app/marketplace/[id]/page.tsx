'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/lib/auth';
import { SubscribeModal } from '@/components/strategy/subscribe-modal';
import { showErrorToast, showSuccessToast } from '@/lib/toast-utils';
import { getUserFriendlyError } from '@/lib/error-messages';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  User,
  Target,
  Shield,
  Zap,
  BarChart3,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Lock
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

  latestVersion?: {
    version: string;
    createdAt: string;
    configData: Record<string, unknown>;
  };
}

export default function StrategyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { token } = useAuth();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);

  useEffect(() => {
    fetchStrategyDetails();
  }, [resolvedParams.id]);

  const fetchStrategyDetails = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/marketplace/${resolvedParams.id}`
      );

      if (!response.ok) {
        throw new Error('Strategy not found');
      }

      const data = await response.json();
      setStrategy(data.strategy);
    } catch (error) {
      console.error('Failed to fetch strategy:', error);
      const friendlyError = getUserFriendlyError(error as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
      setTimeout(() => router.push('/marketplace'), 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribeSuccess = () => {
    showSuccessToast(
      'Successfully Subscribed!',
      'You can now manage your subscription from the dashboard'
    );
    fetchStrategyDetails();
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

  if (!strategy) {
    return (
      <div className="container mx-auto p-6">
        <Card className="text-center py-12">
          <CardContent>
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Strategy Not Found</h3>
            <p className="text-gray-600 mb-4">
              The strategy you&apos;re looking for doesn&apos;t exist or has been removed
            </p>
            <Button onClick={() => router.push('/marketplace')}>
              Back to Marketplace
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => router.push('/marketplace')}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Marketplace
      </Button>

      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-6 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-2 dark:text-white">{strategy.name}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{strategy.description}</p>

          <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>By {strategy.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Version {strategy.version}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>{strategy.subscriberCount || 0} Subscribers</span>
            </div>
          </div>

          {strategy.tags && typeof strategy.tags === 'string' && strategy.tags.trim() && (
            <div className="flex flex-wrap gap-2 mt-4">
              {strategy.tags.split(',').map((tag, index) => (
                <Badge key={index} variant="outline">
                  {tag.trim()}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="lg:w-80">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-6">
              <div className="text-center mb-4">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
                  Subscribe Now
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Start executing this strategy
                </div>
              </div>

              {token ? (
                <Button
                  className="w-full flex items-center justify-center gap-2"
                  size="lg"
                  onClick={() => setSubscribeModalOpen(true)}
                >
                  <Zap className="h-5 w-5" />
                  Subscribe & Deploy
                </Button>
              ) : (
                <div>
                  <Button
                    className="w-full mb-2"
                    size="lg"
                    onClick={() => router.push('/login?redirect=/marketplace/' + strategy.id)}
                  >
                    Login to Subscribe
                  </Button>
                  <p className="text-xs text-center text-gray-500">
                    New here?{' '}
                    <a href="/register" className="text-blue-600 hover:underline">
                      Create account
                    </a>
                  </p>
                </div>
              )}

              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <div className="flex items-start gap-2 text-xs text-blue-800 dark:text-blue-300">
                  <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Strategy code is protected. You execute the strategy without seeing the implementation.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 dark:text-gray-400">Win Rate</div>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div className={`text-2xl font-bold ${getPerformanceColor(strategy.winRate)}`}>
              {strategy.winRate !== null ? `${strategy.winRate.toFixed(1)}%` : 'N/A'}
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 dark:text-gray-400">ROI</div>
              <TrendingUp className="h-5 w-5 text-blue-500" />
            </div>
            <div className={`text-2xl font-bold ${getPerformanceColor(strategy.roi)}`}>
              {strategy.roi !== null ? `${strategy.roi >= 0 ? '+' : ''}${strategy.roi.toFixed(1)}%` : 'N/A'}
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 dark:text-gray-400">Max Drawdown</div>
              <TrendingDown className="h-5 w-5 text-red-500" />
            </div>
            <div className={`text-2xl font-bold ${getPerformanceColor(strategy.maxDrawdown, false)}`}>
              {strategy.maxDrawdown !== null ? `${strategy.maxDrawdown.toFixed(1)}%` : 'N/A'}
            </div>
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-600 dark:text-gray-400">Risk:Reward</div>
              <Target className="h-5 w-5 text-purple-500" />
            </div>
            <div className="text-2xl font-bold dark:text-white">
              {strategy.riskReward !== null ? strategy.riskReward.toFixed(1) : 'N/A'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Strategy Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {strategy.detailedDescription && (
              <div>
                <h4 className="font-medium mb-2 dark:text-white">Description</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {strategy.detailedDescription}
                </p>
              </div>
            )}

            <div>
              <h4 className="font-medium mb-2 dark:text-white">Trading Configuration</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Instrument:</span>
                  <span className="font-medium dark:text-white">{strategy.instrument}</span>
                </div>
                {strategy.strategyType && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Type:</span>
                    <span className="font-medium dark:text-white">{strategy.strategyType}</span>
                  </div>
                )}
                {strategy.marginRequired && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Min. Margin:</span>
                    <span className="font-medium dark:text-white">${strategy.marginRequired}</span>
                  </div>
                )}
              </div>
            </div>

            {strategy.supportedPairs && strategy.supportedPairs.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 dark:text-white">Supported Pairs</h4>
                <div className="flex flex-wrap gap-2">
                  {strategy.supportedPairs.map((pair, index) => (
                    <Badge key={index} variant="secondary">
                      {pair}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {strategy.timeframes && strategy.timeframes.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 dark:text-white">Timeframes</h4>
                <div className="flex flex-wrap gap-2">
                  {strategy.timeframes.map((tf, index) => (
                    <Badge key={index} variant="secondary">
                      {tf}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                  1
                </div>
                <div>
                  <h5 className="font-medium mb-1 dark:text-white">Subscribe</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Connect your broker account and set your risk parameters
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                  2
                </div>
                <div>
                  <h5 className="font-medium mb-1 dark:text-white">Auto-Execute</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    The strategy executes trades automatically in your account
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                  3
                </div>
                <div>
                  <h5 className="font-medium mb-1 dark:text-white">Monitor</h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Track performance, adjust settings, or pause anytime
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg mt-6">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-300">
                  <strong>Risk Disclaimer:</strong> Past performance does not guarantee future results.
                  Trading involves risk of loss. Only trade with capital you can afford to lose.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscribe Modal */}
      <SubscribeModal
        open={subscribeModalOpen}
        onOpenChange={setSubscribeModalOpen}
        strategyId={strategy.id}
        strategyName={strategy.name}
        onSuccess={handleSubscribeSuccess}
      />
    </div>
  );
}
