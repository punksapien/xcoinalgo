'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  AlertCircle,
  UserCheck,
  UserX,
  Mail,
  Calendar,
  Link as LinkIcon
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface AccessRequest {
  id: string;
  strategy: {
    id: string;
    name: string;
    code: string;
  };
  user: {
    id: string;
    name: string | null;
    email: string;
    createdAt: string;
  };
  inviteCode: string;
  inviteLinkType: 'ONE_TIME' | 'PERMANENT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
}

export default function ClientAccessRequestsPage() {
  const router = useRouter();
  const { hasClientAccess } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

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

      const response = await axios.get('/api/client/access-requests', {
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

  const approveRequest = async (requestId: string) => {
    try {
      setProcessingRequestId(requestId);

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

      // Remove from list
      setRequests(requests.filter(r => r.id !== requestId));
      toast.success('Access request approved');
      setProcessingRequestId(null);
    } catch (err) {
      console.error('Failed to approve request:', err);
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to approve request');
      setProcessingRequestId(null);
    }
  };

  const openRejectDialog = (request: AccessRequest) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const rejectRequest = async () => {
    if (!selectedRequest) return;

    try {
      setProcessingRequestId(selectedRequest.id);

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      await axios.post(
        `/api/client/access-requests/${selectedRequest.id}/reject`,
        { reason: rejectionReason || undefined },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Remove from list
      setRequests(requests.filter(r => r.id !== selectedRequest.id));
      toast.success('Access request rejected');
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      setProcessingRequestId(null);
    } catch (err) {
      console.error('Failed to reject request:', err);
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to reject request');
      setProcessingRequestId(null);
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

        {requests.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                No pending access requests at the moment.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {requests.map((request) => (
              <Card key={request.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {request.user.name || request.user.email}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Requesting access to <span className="font-semibold">{request.strategy.name}</span>
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">
                      {request.inviteLinkType === 'ONE_TIME' ? 'One-Time Link' : 'Permanent Link'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4">
                    {/* User Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Email:</span>
                        <span className="font-medium">{request.user.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Requested:</span>
                        <span className="font-medium">
                          {formatDistanceToNow(new Date(request.requestedAt), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <LinkIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Invite Code:</span>
                        <span className="font-mono text-sm">{request.inviteCode}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Member Since:</span>
                        <span className="font-medium">
                          {formatDistanceToNow(new Date(request.user.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-4 border-t">
                      <Button
                        onClick={() => approveRequest(request.id)}
                        disabled={processingRequestId === request.id}
                        className="flex-1"
                      >
                        {processingRequestId === request.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <UserCheck className="h-4 w-4 mr-2" />
                        )}
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => openRejectDialog(request)}
                        disabled={processingRequestId === request.id}
                        className="flex-1"
                      >
                        <UserX className="h-4 w-4 mr-2" />
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

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Access Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this access request? You can optionally provide a reason.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                placeholder="Enter a reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              disabled={processingRequestId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={rejectRequest}
              disabled={processingRequestId !== null}
            >
              {processingRequestId !== null ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserX className="h-4 w-4 mr-2" />
              )}
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
