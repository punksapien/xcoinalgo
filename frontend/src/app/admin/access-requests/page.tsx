'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  status: string;
  requestedAt: string;
}

export default function AdminAccessRequestsPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);

  useEffect(() => {
    loadAccessRequests();
  }, [token]);

  const loadAccessRequests = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/access-requests`, {
        headers: { Authorization: authToken }
      });

      setAccessRequests(response.data.requests);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to load access requests');
      console.error('Access requests load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Access Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Strategy access requests awaiting approval
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Access Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Requests ({accessRequests.length})</CardTitle>
          <CardDescription>
            Users who have requested access to private strategies via invite links
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accessRequests.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No pending access requests</p>
              <p className="text-sm text-muted-foreground mt-2">
                When users request access to private strategies, they'll appear here for approval
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {accessRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-foreground">{request.user.email}</p>
                      <Badge variant="outline">Pending</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Requesting access to: <span className="font-medium">{request.strategy.name}</span> ({request.strategy.code})
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Via invite code: {request.inviteCode} • Requested: {new Date(request.requestedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
