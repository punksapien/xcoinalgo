'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  AlertCircle,
  Link as LinkIcon,
  Copy,
  Trash2,
  Plus,
  Check,
  ExternalLink
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface InviteLink {
  id: string;
  inviteCode: string;
  type: 'ONE_TIME' | 'PERMANENT';
  inviteUrl: string;
  isActive: boolean;
  usageCount: number;
  requestCount: number;
  revokedAt: string | null;
  createdAt: string;
}

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string | null;
}

export default function ShareStrategyPage() {
  const router = useRouter();
  const params = useParams();
  const strategyId = params.id as string;
  const { hasClientAccess } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasClientAccess()) {
      router.replace('/dashboard');
      return;
    }

    loadData();
  }, [hasClientAccess, router, strategyId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      // Fetch strategy and invite links in parallel
      const [strategiesRes, linksRes] = await Promise.all([
        axios.get('/api/client/strategies', {
          headers: { Authorization: `Bearer ${authToken}` }
        }),
        axios.get(`/api/client/strategies/${strategyId}/invite-links`, {
          headers: { Authorization: `Bearer ${authToken}` }
        })
      ]);

      const strategyData = strategiesRes.data.strategies?.find((s: Strategy) => s.id === strategyId);
      if (!strategyData) {
        throw new Error('Strategy not found');
      }

      setStrategy(strategyData);
      setInviteLinks(linksRes.data.inviteLinks || []);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load data:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load data');
      setIsLoading(false);
    }
  };

  const generateInviteLink = async (type: 'ONE_TIME' | 'PERMANENT') => {
    try {
      setGeneratingLink(true);

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      const response = await axios.post(
        `/api/client/strategies/${strategyId}/invite-links`,
        { type },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setInviteLinks([response.data.inviteLink, ...inviteLinks]);
      toast.success(`${type === 'ONE_TIME' ? 'One-time' : 'Permanent'} invite link created`);
      setGeneratingLink(false);
    } catch (err) {
      console.error('Failed to generate invite link:', err);
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to generate invite link');
      setGeneratingLink(false);
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

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Strategy not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mb-4"
          >
            ← Back
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Share Strategy
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {strategy.name} ({strategy.code})
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Generate Links Section */}
        <Card>
          <CardHeader>
            <CardTitle>Generate Invite Links</CardTitle>
            <CardDescription>
              Create invite links to share this private strategy with specific users
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                onClick={() => generateInviteLink('PERMANENT')}
                disabled={generatingLink}
                className="h-24 flex flex-col items-center justify-center gap-2"
              >
                {generatingLink ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <LinkIcon className="h-6 w-6" />
                    <div>
                      <p className="font-semibold">Permanent Link</p>
                      <p className="text-xs opacity-80">Can be used multiple times</p>
                    </div>
                  </>
                )}
              </Button>

              <Button
                onClick={() => generateInviteLink('ONE_TIME')}
                disabled={generatingLink}
                variant="outline"
                className="h-24 flex flex-col items-center justify-center gap-2"
              >
                {generatingLink ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <LinkIcon className="h-6 w-6" />
                    <div>
                      <p className="font-semibold">One-Time Link</p>
                      <p className="text-xs opacity-80">Deactivates after first use</p>
                    </div>
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Active Links Section */}
        <Card>
          <CardHeader>
            <CardTitle>Invite Links ({inviteLinks.length})</CardTitle>
            <CardDescription>
              Manage and share your invite links
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inviteLinks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No invite links created yet. Generate one above to get started.
              </p>
            ) : (
              <div className="space-y-4">
                {inviteLinks.map((link) => (
                  <div
                    key={link.id}
                    className={`p-4 border rounded-lg ${
                      link.isActive ? 'bg-card' : 'bg-muted opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={link.type === 'ONE_TIME' ? 'secondary' : 'default'}>
                            {link.type === 'ONE_TIME' ? 'One-Time' : 'Permanent'}
                          </Badge>
                          {!link.isActive && (
                            <Badge variant="destructive">Revoked</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Created {formatDistanceToNow(new Date(link.createdAt), { addSuffix: true })}
                          </span>
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
                        </div>
                      </div>

                      {link.isActive && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revokeLink(link.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
