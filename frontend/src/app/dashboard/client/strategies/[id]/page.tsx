'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  Loader2,
  Link as LinkIcon,
  Copy,
  Trash2,
  Plus,
  Globe,
  Lock
} from 'lucide-react';
import axios from 'axios';

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string;
  author: string;
  isPublic: boolean;
  subscriberCount: number;
}

interface InviteLink {
  id: string;
  inviteCode: string;
  inviteUrl: string;
  isActive: boolean;
  usageCount: number;
  requestCount: number;
  revokedAt: string | null;
  createdAt: string;
}

export default function StrategyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const strategyId = params.id as string;
  const { hasClientAccess } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [inviteLinks, setInviteLinks] = useState<InviteLink[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!hasClientAccess()) {
      router.replace('/dashboard');
      return;
    }

    loadStrategyData();
  }, [strategyId, hasClientAccess, router]);

  const loadStrategyData = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      // Fetch strategies and find the one we need
      const strategiesRes = await axios.get('/api/client/strategies', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      const strategyData = strategiesRes.data.strategies.find((s: any) => s.id === strategyId);
      if (!strategyData) {
        throw new Error('Strategy not found or you do not have access to it');
      }

      setStrategy(strategyData);

      // Fetch invite links
      const inviteLinksRes = await axios.get(`/api/client/strategies/${strategyId}/invite-links`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      setInviteLinks(inviteLinksRes.data.inviteLinks || []);
      setIsLoading(false);
    } catch (err: any) {
      console.error('Failed to load strategy data:', err);
      setError(err.response?.data?.error || 'Failed to load strategy data');
      setIsLoading(false);
    }
  };

  const toggleVisibility = async () => {
    if (!strategy) return;

    try {
      setIsUpdating(true);
      setError('');
      setSuccess('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      await axios.put(
        `/api/client/strategies/${strategyId}/visibility`,
        { isPublic: !strategy.isPublic },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setStrategy({ ...strategy, isPublic: !strategy.isPublic });
      setSuccess(`Strategy is now ${!strategy.isPublic ? 'public' : 'private'}`);
    } catch (err: any) {
      console.error('Failed to update visibility:', err);
      setError(err.response?.data?.error || 'Failed to update visibility');
    } finally {
      setIsUpdating(false);
    }
  };

  const generateInviteLink = async () => {
    try {
      setIsUpdating(true);
      setError('');
      setSuccess('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      const res = await axios.post(
        `/api/client/strategies/${strategyId}/invite-links`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setInviteLinks([res.data.inviteLink, ...inviteLinks]);
      setSuccess('Invite link generated successfully');
    } catch (err: any) {
      console.error('Failed to generate invite link:', err);
      setError(err.response?.data?.error || 'Failed to generate invite link');
    } finally {
      setIsUpdating(false);
    }
  };

  const revokeInviteLink = async (linkId: string) => {
    try {
      setIsUpdating(true);
      setError('');
      setSuccess('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      await axios.delete(`/api/client/invite-links/${linkId}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      // Reload invite links
      await loadStrategyData();
      setSuccess('Invite link revoked successfully');
    } catch (err: any) {
      console.error('Failed to revoke invite link:', err);
      setError(err.response?.data?.error || 'Failed to revoke invite link');
    } finally {
      setIsUpdating(false);
    }
  };

  const copyToClipboard = (text: string, code: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {strategy.name}
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {strategy.description || strategy.code}
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
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Strategy Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Strategy Settings</CardTitle>
            <CardDescription>
              Configure who can access and deploy this strategy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="visibility" className="text-base">
                  {strategy.isPublic ? (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Public Strategy
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Private Strategy
                    </div>
                  )}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {strategy.isPublic
                    ? 'Anyone can discover and deploy this strategy'
                    : 'Only users with approved access can deploy this strategy'}
                </p>
              </div>
              <Switch
                id="visibility"
                checked={strategy.isPublic}
                onCheckedChange={toggleVisibility}
                disabled={isUpdating}
              />
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Subscribers</p>
                  <p className="text-sm text-muted-foreground">
                    {strategy.subscriberCount} active subscriber{strategy.subscriberCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <Badge variant="outline">{strategy.subscriberCount}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invite Links */}
        {!strategy.isPublic && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Invite Links</CardTitle>
                  <CardDescription>
                    Generate shareable links for users to request access
                  </CardDescription>
                </div>
                <Button onClick={generateInviteLink} disabled={isUpdating}>
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Link
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {inviteLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No invite links generated yet. Click &quot;Generate Link&quot; to create one.
                </p>
              ) : (
                <div className="space-y-4">
                  {inviteLinks.map((link) => (
                    <div key={link.id} className={`p-4 border rounded-lg ${link.isActive ? '' : 'opacity-50'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <LinkIcon className="h-4 w-4" />
                            <code className="text-sm bg-muted px-2 py-1 rounded">
                              {link.inviteCode}
                            </code>
                            <Badge variant={link.isActive ? 'default' : 'secondary'}>
                              {link.isActive ? 'Active' : 'Revoked'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {link.requestCount} request{link.requestCount !== 1 ? 's' : ''} •
                            Created {new Date(link.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {link.isActive && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(link.inviteUrl, link.inviteCode)}
                              >
                                {copiedCode === link.inviteCode ? 'Copied!' : <Copy className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => revokeInviteLink(link.id)}
                                disabled={isUpdating}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
