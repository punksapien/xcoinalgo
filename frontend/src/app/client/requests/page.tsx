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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Link as LinkIcon,
  Clock,
  User
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';

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
  respondedAt: string | null;
  respondedBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  rejectionReason: string | null;
}

export default function ClientAccessRequestsPage() {
  const router = useRouter();
  const { hasClientAccess } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [activeTab, setActiveTab] = useState<string>('all');
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

  const loadRequests = async (status?: string) => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      const params = new URLSearchParams();
      if (status && status !== 'all') {
        params.append('status', status.toUpperCase());
      }

      const response = await axios.get(`/api/client/access-requests?${params.toString()}`, {
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

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    loadRequests(value);
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

      // Reload requests
      await loadRequests(activeTab);
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

      // Reload requests
      await loadRequests(activeTab);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Pending</Badge>;
      case 'APPROVED':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const renderRequest = (request: AccessRequest) => (
    <Card key={request.id} className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">
                {request.user.name || request.user.email}
              </CardTitle>
              {getStatusBadge(request.status)}
            </div>
            <CardDescription className="mt-1">
              Requested access to <span className="font-semibold">{request.strategy.name}</span> ({request.strategy.code})
            </CardDescription>
          </div>
          <Badge variant="outline">
            {request.inviteLinkType === 'ONE_TIME' ? 'One-Time Link' : 'Permanent Link'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* User Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
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
                {format(new Date(request.user.createdAt), 'MMM d, yyyy')}
              </span>
            </div>
          </div>

          {/* Response Info - Show for approved/rejected requests */}
          {request.status !== 'PENDING' && request.respondedAt && (
            <div className="pt-3 border-t space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Responded:</span>
                  <span className="font-medium">
                    {formatDistanceToNow(new Date(request.respondedAt), { addSuffix: true })}
                  </span>
                </div>
                {request.respondedBy && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Responded By:</span>
                    <span className="font-medium">
                      {request.respondedBy.name || request.respondedBy.email}
                    </span>
                  </div>
                )}
              </div>

              {request.status === 'REJECTED' && request.rejectionReason && (
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground mb-1">Rejection Reason:</p>
                  <div className="bg-muted p-3 rounded-md">
                    <p className="text-sm">{request.rejectionReason}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions - Only show for pending requests */}
          {request.status === 'PENDING' && (
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
          )}
        </div>
      </CardContent>
    </Card>
  );

  const filteredRequests = requests.filter(request => {
    if (activeTab === 'all') return true;
    return request.status === activeTab.toUpperCase();
  });

  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = requests.filter(r => r.status === 'REJECTED').length;

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
            Manage access requests for your private strategies
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{requests.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({rejectedCount})</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {filteredRequests.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-muted-foreground">
                    {activeTab === 'all'
                      ? 'No access requests yet.'
                      : `No ${activeTab} requests.`}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredRequests.map(renderRequest)}
              </div>
            )}
          </TabsContent>
        </Tabs>
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
