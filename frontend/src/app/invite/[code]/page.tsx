'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  AlertCircle,
  Shield,
  TrendingUp,
  TrendingDown,
  Users,
  Lock,
  CheckCircle,
  Clock
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string | null;
  author: string;
  instrument: string;
  tags: string;
  winRate: number | null;
  roi: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
  totalTrades: number | null;
  subscriberCount: number;
  isActive: boolean;
  isPublic: boolean;
  createdAt: string;
}

interface InviteLinkData {
  inviteCode: string;
  linkType: 'ONE_TIME' | 'PERMANENT';
  strategy: Strategy;
  message: string;
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const inviteCode = params.code as string;
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteData, setInviteData] = useState<InviteLinkData | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);

  useEffect(() => {
    loadInviteData();
  }, [inviteCode]);

  const loadInviteData = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Fetch invite link data (no auth required to preview)
      const response = await axios.get(`/api/strategies/join/${inviteCode}`);
      setInviteData(response.data);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load invite data:', err);
      const error = err as { response?: { status?: number; data?: { error?: string } } };
      if (error.response?.status === 404) {
        setError('Invalid or expired invite link');
      } else if (error.response?.status === 410) {
        setError('This invite link has been revoked');
      } else if (error.response?.data?.error) {
        setError(error.response.data.error);
      } else {
        setError('Failed to load invite link');
      }
      setIsLoading(false);
    }
  };

  const requestAccess = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      router.push(`/login?redirect=/invite/${inviteCode}`);
      return;
    }

    try {
      setIsRequesting(true);

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        router.push(`/login?redirect=/invite/${inviteCode}`);
        return;
      }

      const response = await axios.post(
        `/api/strategies/join/${inviteCode}`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      toast.success('Access request submitted successfully');
      setRequestStatus('pending');
      setIsRequesting(false);
    } catch (err) {
      console.error('Failed to request access:', err);
      const error = err as { response?: { data?: { error?: string } } };
      const errorMsg = error.response?.data?.error || 'Failed to request access';

      // Check if the error indicates existing request or subscription
      if (errorMsg.includes('already requested')) {
        setRequestStatus('pending');
        toast.info(errorMsg);
      } else if (errorMsg.includes('already have access') || errorMsg.includes('already approved')) {
        setRequestStatus('approved');
        toast.success(errorMsg);
      } else {
        toast.error(errorMsg);
      }

      setIsRequesting(false);
    }
  };

  const formatPercentage = (value: number | null) => {
    if (value === null) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !inviteData) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <Card>
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error || 'Failed to load invite link'}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const strategy = inviteData.strategy;

  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="h-8 w-8 text-primary" />
            <Badge variant="secondary" className="text-lg px-4 py-1">
              Private Strategy
            </Badge>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
            {strategy.name}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 font-mono">
            {strategy.code}
          </p>
          <p className="text-muted-foreground">
            Invited by <span className="font-semibold">{strategy.author}</span>
          </p>
        </div>

        {/* Invite Type Badge */}
        <div className="flex justify-center">
          <Badge variant={inviteData.linkType === 'ONE_TIME' ? 'destructive' : 'default'}>
            {inviteData.linkType === 'ONE_TIME'
              ? '⚡ One-Time Invite Link'
              : '🔗 Permanent Invite Link'}
          </Badge>
        </div>

        {/* Strategy Details */}
        <Card>
          <CardHeader>
            <CardTitle>Strategy Overview</CardTitle>
            <CardDescription>
              {strategy.description || 'A private trading strategy'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Performance Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-center mb-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    {formatPercentage(strategy.winRate)}
                  </p>
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                </div>

                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-center mb-2">
                    <TrendingUp className="h-5 w-5 text-blue-500" />
                  </div>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatPercentage(strategy.roi)}
                  </p>
                  <p className="text-xs text-muted-foreground">ROI</p>
                </div>

                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-center mb-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  </div>
                  <p className="text-2xl font-bold text-red-600">
                    {formatPercentage(strategy.maxDrawdown)}
                  </p>
                  <p className="text-xs text-muted-foreground">Max Drawdown</p>
                </div>

                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-center mb-2">
                    <Users className="h-5 w-5 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold text-purple-600">
                    {strategy.subscriberCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Subscribers</p>
                </div>
              </div>

              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Instrument</p>
                  <p className="font-semibold">{strategy.instrument}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Trades</p>
                  <p className="font-semibold">{strategy.totalTrades || 'N/A'}</p>
                </div>
              </div>

              {/* Tags */}
              {strategy.tags && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {strategy.tags.split(',').map((tag, index) => (
                      <Badge key={index} variant="secondary">
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Request Access Section */}
        <Card className="border-2 border-primary/20">
          <CardContent className="pt-6">
            {requestStatus === 'pending' ? (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center">
                  <div className="rounded-full bg-yellow-100 dark:bg-yellow-900 p-4">
                    <Clock className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold">Access Request Pending</h3>
                  <p className="text-muted-foreground mt-2">
                    Your access request has been submitted. The strategy owner will review it shortly.
                  </p>
                </div>
                <Button onClick={() => router.push('/dashboard/access-requests')}>
                  View My Requests
                </Button>
              </div>
            ) : requestStatus === 'approved' ? (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center">
                  <div className="rounded-full bg-green-100 dark:bg-green-900 p-4">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold">Access Granted!</h3>
                  <p className="text-muted-foreground mt-2">
                    You already have access to this strategy. You can deploy it now.
                  </p>
                </div>
                <Button onClick={() => router.push(`/dashboard/strategy/${strategy.id}`)}>
                  View Strategy
                </Button>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center">
                  <div className="rounded-full bg-primary/10 p-4">
                    <Lock className="h-8 w-8 text-primary" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold">Request Access</h3>
                  <p className="text-muted-foreground mt-2">
                    This is a private strategy. Click below to request access from the strategy owner.
                  </p>
                  {!isAuthenticated && (
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
                      You need to sign in to request access
                    </p>
                  )}
                </div>
                <Button
                  size="lg"
                  onClick={requestAccess}
                  disabled={isRequesting}
                  className="min-w-[200px]"
                >
                  {isRequesting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Requesting...
                    </>
                  ) : !isAuthenticated ? (
                    'Sign In to Request Access'
                  ) : (
                    'Request Access'
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
