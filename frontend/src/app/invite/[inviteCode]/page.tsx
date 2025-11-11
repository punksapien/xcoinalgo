'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Loader2,
  CheckCircle,
  TrendingUp,
  Activity,
  Shield,
  Users,
  Lock
} from 'lucide-react';
import axios from 'axios';
import Link from 'next/link';

interface StrategyPreview {
  id: string;
  name: string;
  code: string;
  description: string;
  detailedDescription: string;
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
  createdAt: string;
}

export default function InviteLandingPage() {
  const router = useRouter();
  const params = useParams();
  const inviteCode = params.inviteCode as string;
  const { isAuthenticated } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [strategy, setStrategy] = useState<StrategyPreview | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');

  useEffect(() => {
    loadInviteData();
  }, [inviteCode]);

  const loadInviteData = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Fetch invite link preview (no auth required)
      const res = await axios.get(`/api/strategies/join/${inviteCode}`);
      setStrategy(res.data.strategy);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load invite:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Invalid or expired invite link');
      setIsLoading(false);
    }
  };

  const handleRequestAccess = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      router.push(`/login?redirect=/invite/${inviteCode}`);
      return;
    }

    try {
      setIsRequesting(true);
      setError('');
      setSuccess('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        router.push(`/login?redirect=/invite/${inviteCode}`);
        return;
      }

      const res = await axios.post(
        `/api/strategies/join/${inviteCode}`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setSuccess('Access request submitted successfully! You will be notified when approved.');
      setRequestStatus('pending');
    } catch (err) {
      console.error('Failed to request access:', err);
      const error = err as { response?: { data?: { error?: string } } };
      const errorMsg = error.response?.data?.error || 'Failed to submit access request';
      setError(errorMsg);

      // Check if already requested
      if (errorMsg.includes('already requested')) {
        setRequestStatus('pending');
      } else if (errorMsg.includes('already approved')) {
        setRequestStatus('approved');
      } else if (errorMsg.includes('rejected')) {
        setRequestStatus('rejected');
      }
    } finally {
      setIsRequesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !strategy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-red-100 p-3">
                  <AlertCircle className="h-12 w-12 text-red-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Invalid Invite</h2>
              <p className="text-gray-600">{error}</p>
              <Link href="/dashboard">
                <Button className="w-full">Go to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <TrendingUp className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold text-gray-900">XcoinAlgo</span>
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Lock className="h-5 w-5 text-gray-500" />
            <h1 className="text-3xl font-bold text-gray-900">Private Strategy Invite</h1>
          </div>
          <p className="text-gray-600">
            You&apos;ve been invited to access a private trading strategy
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Strategy Preview */}
        {strategy && (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{strategy.name}</CardTitle>
                    <CardDescription className="mt-2">
                      {strategy.description || strategy.detailedDescription}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="ml-4">
                    {strategy.instrument}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {strategy.winRate !== null && (
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Win Rate</p>
                        <p className="text-2xl font-bold text-green-600">{strategy.winRate.toFixed(1)}%</p>
                      </div>
                    )}
                    {strategy.roi !== null && (
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">ROI</p>
                        <p className="text-2xl font-bold text-blue-600">{strategy.roi.toFixed(1)}%</p>
                      </div>
                    )}
                    {strategy.maxDrawdown !== null && (
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Max Drawdown</p>
                        <p className="text-2xl font-bold text-red-600">{strategy.maxDrawdown.toFixed(1)}%</p>
                      </div>
                    )}
                    {strategy.sharpeRatio !== null && (
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Sharpe Ratio</p>
                        <p className="text-2xl font-bold text-purple-600">{strategy.sharpeRatio.toFixed(2)}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="h-4 w-4" />
                      <span>{strategy.subscriberCount} active subscriber{strategy.subscriberCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Activity className="h-4 w-4" />
                      <span>Created by {strategy.author}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Request Access Card */}
            <Card>
              <CardHeader>
                <CardTitle>Request Access</CardTitle>
                <CardDescription>
                  {requestStatus === 'pending'
                    ? 'Your access request is pending approval'
                    : requestStatus === 'approved'
                    ? 'Your access has been approved! You can now deploy this strategy.'
                    : requestStatus === 'rejected'
                    ? 'Your previous access request was rejected'
                    : 'Submit a request to get access to this private strategy'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {requestStatus === 'approved' ? (
                  <Link href="/dashboard">
                    <Button className="w-full">
                      Go to Dashboard
                    </Button>
                  </Link>
                ) : requestStatus === 'pending' ? (
                  <div className="space-y-4">
                    <Alert>
                      <Shield className="h-4 w-4" />
                      <AlertDescription>
                        Your request is being reviewed. You&apos;ll receive a notification when it&apos;s approved.
                      </AlertDescription>
                    </Alert>
                    <Link href="/dashboard">
                      <Button variant="outline" className="w-full">
                        Return to Dashboard
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <Button
                    onClick={handleRequestAccess}
                    disabled={isRequesting}
                    className="w-full"
                  >
                    {isRequesting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting Request...
                      </>
                    ) : (
                      <>
                        {isAuthenticated ? 'Request Access' : 'Sign In to Request Access'}
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
