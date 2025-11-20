'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Link as LinkIcon
} from 'lucide-react';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';

interface AccessRequest {
  id: string;
  strategy: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    author: string;
  };
  inviteCode: string;
  inviteLinkActive: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  respondedAt: string | null;
  respondedBy: string | null;
  rejectionReason: string | null;
}

export default function MyAccessRequestsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    loadRequests();
  }, [isAuthenticated, router]);

  const loadRequests = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      const response = await axios.get('/api/strategies/my-requests', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      setRequests(response.data.requests || []);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load access requests:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load access requests');
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'APPROVED':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'REJECTED':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      PENDING: 'secondary',
      APPROVED: 'default',
      REJECTED: 'destructive'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status}
      </Badge>
    );
  };

  const filterRequests = (status?: string) => {
    if (!status || status === 'all') return requests;
    return requests.filter(req => req.status === status.toUpperCase());
  };

  const filteredRequests = filterRequests(activeTab);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            My Access Requests
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            View the status of your private strategy access requests
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              All ({requests.length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending ({requests.filter(r => r.status === 'PENDING').length})
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved ({requests.filter(r => r.status === 'APPROVED').length})
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected ({requests.filter(r => r.status === 'REJECTED').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {filteredRequests.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    {activeTab === 'all'
                      ? 'No access requests yet. Use invite links to request access to private strategies.'
                      : `No ${activeTab} requests.`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredRequests.map((request) => (
                  <Card key={request.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {getStatusIcon(request.status)}
                            <CardTitle className="text-lg">
                              {request.strategy.name}
                            </CardTitle>
                            {getStatusBadge(request.status)}
                          </div>
                          <p className="text-sm font-mono text-muted-foreground">
                            {request.strategy.code}
                          </p>
                          {request.strategy.description && (
                            <CardDescription className="mt-2">
                              {request.strategy.description}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <div className="space-y-4">
                        {/* Request Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Strategy Owner</p>
                            <p className="font-medium">{request.strategy.author}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Requested</p>
                            <p className="font-medium">
                              {formatDistanceToNow(new Date(request.requestedAt), { addSuffix: true })}
                            </p>
                          </div>
                          {request.respondedAt && (
                            <div>
                              <p className="text-muted-foreground">Responded</p>
                              <p className="font-medium">
                                {formatDistanceToNow(new Date(request.respondedAt), { addSuffix: true })}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-muted-foreground">Invite Link</p>
                            <div className="flex items-center gap-2">
                              <p className="font-mono text-xs">{request.inviteCode}</p>
                              {!request.inviteLinkActive && (
                                <Badge variant="destructive" className="text-xs">
                                  Revoked
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Rejection Reason */}
                        {request.status === 'REJECTED' && request.rejectionReason && (
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              <strong>Reason for rejection:</strong> {request.rejectionReason}
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-4 border-t">
                          {request.status === 'APPROVED' && (
                            <Button
                              onClick={() => router.push(`/dashboard/strategy/${request.strategy.id}`)}
                              className="flex-1"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Strategy
                            </Button>
                          )}
                          {request.status === 'PENDING' && (
                            <div className="flex-1">
                              <p className="text-sm text-muted-foreground text-center">
                                Waiting for approval from the strategy owner
                              </p>
                            </div>
                          )}
                          {request.status === 'REJECTED' && request.inviteLinkActive && (
                            <Button
                              variant="outline"
                              onClick={() => router.push(`/invite/${request.inviteCode}`)}
                              className="flex-1"
                            >
                              <LinkIcon className="h-4 w-4 mr-2" />
                              Request Again
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
