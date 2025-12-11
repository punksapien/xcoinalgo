'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
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
  Copy,
  Trash2,
  Check,
  ExternalLink,
  UserCheck,
  UserX,
  Mail,
  Calendar,
  Link as LinkIcon,
  Clock,
  User,
  Shield,
  Link2,
  Bell
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface InviteLink {
  id: string;
  strategyId: string;
  strategyName: string;
  inviteCode: string;
  type: 'ONE_TIME' | 'PERMANENT';
  inviteUrl: string;
  isActive: boolean;
  usageCount: number;
  requestCount: number;
  revokedAt: string | null;
  createdAt: string;
}

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

// ============================================================================
// Main Component
// ============================================================================

export default function AccessManagementPage() {
  const router = useRouter();
  const { hasClientAccess } = useAuth();

  // Main tab state
  const [mainTab, setMainTab] = useState<'invite-links' | 'access-requests'>('invite-links');

  // Invite Links state
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [inviteLinksLoading, setInviteLinksLoading] = useState(true);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Access Requests state
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsTab, setRequestsTab] = useState<string>('all');
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Common state
  const [error, setError] = useState('');

  // ============================================================================
  // Auth Check
  // ============================================================================

  useEffect(() => {
    if (!hasClientAccess()) {
      router.replace('/dashboard');
      return;
    }

    // Load both on mount
    loadInviteLinks();
    loadRequests();
  }, [hasClientAccess, router]);

  // ============================================================================
  // Get Auth Token Helper
  // ============================================================================

  const getAuthToken = () => {
    const token = localStorage.getItem('auth-storage');
    const authData = token ? JSON.parse(token) : null;
    return authData?.state?.token;
  };

  // ============================================================================
  // Invite Links Functions
  // ============================================================================

  const loadInviteLinks = async () => {
    try {
      setInviteLinksLoading(true);
      const authToken = getAuthToken();

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      // Fetch all strategies first
      const strategiesRes = await axios.get('/api/client/strategies', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      const strategies = strategiesRes.data.strategies || [];

      // Fetch invite links for each strategy
      const allInviteLinksPromises = strategies.map(async (strategy: { id: string; name: string }) => {
        const linksRes = await axios.get(`/api/client/strategies/${strategy.id}/invite-links`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });

        return (linksRes.data.inviteLinks || []).map((link: Partial<InviteLink>) => ({
          ...link,
          strategyId: strategy.id,
          strategyName: strategy.name
        }));
      });

      const allInviteLinksArrays = await Promise.all(allInviteLinksPromises);
      setInviteLinks(allInviteLinksArrays.flat());
    } catch (err) {
      console.error('Failed to load invite links:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load invite links');
    } finally {
      setInviteLinksLoading(false);
    }
  };

  const copyToClipboard = async (link: InviteLink) => {
    try {
      await navigator.clipboard.writeText(link.inviteUrl);
      setCopiedLinkId(link.id);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const revokeLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to revoke this invite link? Users with this link will no longer be able to request access.')) {
      return;
    }

    try {
      const authToken = getAuthToken();
      if (!authToken) throw new Error('No authentication token found');

      await axios.delete(`/api/client/invite-links/${linkId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      setInviteLinks(inviteLinks.map(link =>
        link.id === linkId ? { ...link, isActive: false, revokedAt: new Date().toISOString() } : link
      ));

      toast.success('Invite link revoked');
    } catch (err) {
      console.error('Failed to revoke link:', err);
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to revoke link');
    }
  };

  // ============================================================================
  // Access Requests Functions
  // ============================================================================

  const loadRequests = async (status?: string) => {
    try {
      setRequestsLoading(true);
      const authToken = getAuthToken();

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
    } catch (err) {
      console.error('Failed to load access requests:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load access requests');
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleRequestsTabChange = (value: string) => {
    setRequestsTab(value);
    loadRequests(value);
  };

  const approveRequest = async (requestId: string) => {
    try {
      setProcessingRequestId(requestId);
      const authToken = getAuthToken();
      if (!authToken) throw new Error('No authentication token found');

      await axios.post(
        `/api/client/access-requests/${requestId}/approve`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      await loadRequests(requestsTab);
      toast.success('Access request approved');
    } catch (err) {
      console.error('Failed to approve request:', err);
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to approve request');
    } finally {
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
      const authToken = getAuthToken();
      if (!authToken) throw new Error('No authentication token found');

      await axios.post(
        `/api/client/access-requests/${selectedRequest.id}/reject`,
        { reason: rejectionReason || undefined },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      await loadRequests(requestsTab);
      toast.success('Access request rejected');
      setRejectDialogOpen(false);
      setSelectedRequest(null);
    } catch (err) {
      console.error('Failed to reject request:', err);
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to reject request');
    } finally {
      setProcessingRequestId(null);
    }
  };

  // ============================================================================
  // Computed Values
  // ============================================================================

  const activeLinks = inviteLinks.filter(link => link.isActive);
  const revokedLinks = inviteLinks.filter(link => !link.isActive);
  const totalLinkUsage = inviteLinks.reduce((sum, link) => sum + link.usageCount, 0);

  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = requests.filter(r => r.status === 'REJECTED').length;

  const filteredRequests = requests.filter(request => {
    if (requestsTab === 'all') return true;
    return request.status === requestsTab.toUpperCase();
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

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

  // ============================================================================
  // Loading State
  // ============================================================================

  const isLoading = (mainTab === 'invite-links' && inviteLinksLoading) ||
                   (mainTab === 'access-requests' && requestsLoading);

  if (isLoading && !inviteLinks.length && !requests.length) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Access Management
              </h1>
            </div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Manage invite links and access requests for your strategies
            </p>
          </div>
          <Button onClick={() => router.push('/client/strategies')}>
            Create Invite Link
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Main Tabs */}
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'invite-links' | 'access-requests')}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="invite-links" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Invite Links
              {activeLinks.length > 0 && (
                <Badge variant="secondary" className="ml-1">{activeLinks.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="access-requests" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Access Requests
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-1">{pendingCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ================================================================ */}
          {/* Invite Links Tab */}
          {/* ================================================================ */}
          <TabsContent value="invite-links" className="mt-6 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Links
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{inviteLinks.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Active Links
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{activeLinks.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalLinkUsage}</div>
                </CardContent>
              </Card>
            </div>

            {/* Active Links */}
            <Card>
              <CardHeader>
                <CardTitle>Active Invite Links ({activeLinks.length})</CardTitle>
                <CardDescription>
                  Links that are currently active and can be used to request access
                </CardDescription>
              </CardHeader>
              <CardContent>
                {inviteLinksLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : activeLinks.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No active invite links. Create one from the My Strategies page.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {activeLinks.map((link) => (
                      <div key={link.id} className="p-4 border rounded-lg">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={link.type === 'ONE_TIME' ? 'secondary' : 'default'}>
                                {link.type === 'ONE_TIME' ? 'One-Time' : 'Permanent'}
                              </Badge>
                              <span className="text-sm font-semibold">{link.strategyName}</span>
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                              <Input
                                value={link.inviteUrl}
                                readOnly
                                className="font-mono text-sm"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(link)}
                              >
                                {copiedLinkId === link.id ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Used: {link.usageCount} time{link.usageCount !== 1 ? 's' : ''}</span>
                              <span>Requests: {link.requestCount}</span>
                              <span>Created {formatDistanceToNow(new Date(link.createdAt), { addSuffix: true })}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => router.push(`/client/strategies/${link.strategyId}/share`)}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => revokeLink(link.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Revoked Links */}
            {revokedLinks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Revoked Links ({revokedLinks.length})</CardTitle>
                  <CardDescription>
                    Links that have been deactivated and can no longer be used
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {revokedLinks.map((link) => (
                      <div key={link.id} className="p-4 border rounded-lg bg-muted opacity-60">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="destructive">Revoked</Badge>
                              <Badge variant={link.type === 'ONE_TIME' ? 'secondary' : 'default'}>
                                {link.type === 'ONE_TIME' ? 'One-Time' : 'Permanent'}
                              </Badge>
                              <span className="text-sm font-semibold">{link.strategyName}</span>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Used: {link.usageCount} time{link.usageCount !== 1 ? 's' : ''}</span>
                              <span>Requests: {link.requestCount}</span>
                              <span>Revoked {formatDistanceToNow(new Date(link.revokedAt!), { addSuffix: true })}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ================================================================ */}
          {/* Access Requests Tab */}
          {/* ================================================================ */}
          <TabsContent value="access-requests" className="mt-6 space-y-6">
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

            {/* Requests Tabs */}
            <Tabs value={requestsTab} onValueChange={handleRequestsTabChange}>
              <TabsList>
                <TabsTrigger value="all">All ({requests.length})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
                <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
                <TabsTrigger value="rejected">Rejected ({rejectedCount})</TabsTrigger>
              </TabsList>

              <TabsContent value={requestsTab} className="mt-6">
                {requestsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredRequests.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-center text-muted-foreground">
                        {requestsTab === 'all'
                          ? 'No access requests yet.'
                          : `No ${requestsTab} requests.`}
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

                            {/* Response Info */}
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

                            {/* Actions */}
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
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
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
