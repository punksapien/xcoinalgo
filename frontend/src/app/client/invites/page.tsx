'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  AlertCircle,
  Copy,
  Trash2,
  Check,
  ExternalLink
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

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

export default function InviteLinksPage() {
  const router = useRouter();
  const { hasClientAccess } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasClientAccess()) {
      router.replace('/dashboard');
      return;
    }

    loadInviteLinks();
  }, [hasClientAccess, router]);

  const loadInviteLinks = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

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
      const allInviteLinks = allInviteLinksArrays.flat();

      setInviteLinks(allInviteLinks);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load invite links:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load invite links');
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (link: InviteLink) => {
    try {
      await navigator.clipboard.writeText(link.inviteUrl);
      setCopiedLinkId(link.id);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const revokeLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to revoke this invite link? Users with this link will no longer be able to request access.')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

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

  const activeLinks = inviteLinks.filter(link => link.isActive);
  const revokedLinks = inviteLinks.filter(link => !link.isActive);

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Invite Links
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Manage all your strategy invite links in one place
            </p>
          </div>
          <Button onClick={() => router.push('/client/strategies')}>
            Create New Link
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

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
              <div className="text-2xl font-bold">
                {inviteLinks.reduce((sum, link) => sum + link.usageCount, 0)}
              </div>
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
            {activeLinks.length === 0 ? (
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
      </div>
    </div>
  );
}
