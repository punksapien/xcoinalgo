'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Loader2,
  CheckCircle,
  XCircle,
  Mail,
  Package
} from 'lucide-react';
import axios from 'axios';

interface AccessRequest {
  id: string;
  strategy: {
    id: string;
    name: string;
    code: string;
  };
  user: {
    id: string;
    email: string;
    createdAt: string;
  };
  inviteCode: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
}

export default function AccessRequestsPage() {
  const router = useRouter();
  const { hasClientAccess } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasClientAccess()) {
      router.replace('/dashboard');
      return;
    }

    loadRequests();
  }, [hasClientAccess, router]);

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

      const res = await axios.get('/api/client/access-requests', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      setRequests(res.data.requests || []);
      setIsLoading(false);
    } catch (err: any) {
      console.error('Failed to load access requests:', err);
      setError(err.response?.data?.error || 'Failed to load access requests');
      setIsLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      setProcessingId(requestId);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      await axios.post(
        `/api/client/access-requests/${requestId}/approve`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Reload requests
      await loadRequests();
    } catch (err: any) {
      console.error('Failed to approve request:', err);
      setError(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      setProcessingId(requestId);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      await axios.post(
        `/api/client/access-requests/${requestId}/reject`,
        { reason: 'Request denied by strategy owner' },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Reload requests
      await loadRequests();
    } catch (err: any) {
      console.error('Failed to reject request:', err);
      setError(err.response?.data?.error || 'Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

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
            Access Requests
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Review and approve access requests for your private strategies
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Requests List */}
        {requests.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  No pending requests
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  When users request access to your private strategies, they will appear here.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <Card key={request.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{request.strategy.name}</CardTitle>
                      <CardDescription>
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {request.user.email}
                        </span>
                      </CardDescription>
                    </div>
                    <Badge variant="outline">{request.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      <p>
                        <strong>Strategy Code:</strong> {request.strategy.code}
                      </p>
                      <p>
                        <strong>Requested:</strong> {new Date(request.requestedAt).toLocaleString()}
                      </p>
                      <p>
                        <strong>User Joined:</strong> {new Date(request.user.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(request.id)}
                        disabled={processingId === request.id}
                        className="flex-1"
                      >
                        {processingId === request.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleReject(request.id)}
                        disabled={processingId === request.id}
                        className="flex-1"
                      >
                        {processingId === request.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4 mr-2" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
