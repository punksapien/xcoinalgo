'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Users,
  Settings,
  Share2
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

interface Strategy {
  id: string;
  name: string;
  code: string;
  description: string | null;
  author: string;
  isPublic: boolean;
  isActive: boolean;
  subscriberCount: number;
  activeInviteLinks: number;
  pendingRequests: number;
  createdAt: string;
  updatedAt: string;
}

export default function ClientStrategiesPage() {
  const router = useRouter();
  const { hasClientAccess } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [togglingVisibility, setTogglingVisibility] = useState<string | null>(null);

  useEffect(() => {
    if (!hasClientAccess()) {
      router.replace('/dashboard');
      return;
    }

    loadStrategies();
  }, [hasClientAccess, router]);

  const loadStrategies = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      const response = await axios.get('/api/client/strategies', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      setStrategies(response.data.strategies || []);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load strategies:', err);
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Failed to load strategies');
      setIsLoading(false);
    }
  };

  const toggleVisibility = async (strategyId: string, currentIsPublic: boolean) => {
    try {
      setTogglingVisibility(strategyId);

      const token = localStorage.getItem('auth-storage');
      const authData = token ? JSON.parse(token) : null;
      const authToken = authData?.state?.token;

      if (!authToken) {
        throw new Error('No authentication token found');
      }

      await axios.put(
        `/api/client/strategies/${strategyId}/visibility`,
        { isPublic: !currentIsPublic },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Update local state
      setStrategies(strategies.map(s =>
        s.id === strategyId ? { ...s, isPublic: !currentIsPublic } : s
      ));

      toast.success(
        `Strategy is now ${!currentIsPublic ? 'public' : 'private'}`
      );

      setTogglingVisibility(null);
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
      const error = err as { response?: { data?: { error?: string } } };
      toast.error(error.response?.data?.error || 'Failed to toggle visibility');
      setTogglingVisibility(null);
    }
  };

  const handleShareStrategy = (strategy: Strategy) => {
    router.push(`/client/strategies/${strategy.id}/share`);
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
            My Strategies
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage your strategies, toggle visibility, and generate invite links
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {strategies.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                No strategies found. Contact your quant team to upload strategies to your account.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {strategies.map((strategy) => (
              <Card key={strategy.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-xl">{strategy.name}</CardTitle>
                        <Badge variant={strategy.isPublic ? 'default' : 'secondary'}>
                          {strategy.isPublic ? 'Public' : 'Private'}
                        </Badge>
                        <Badge variant={strategy.isActive ? 'default' : 'outline'}>
                          {strategy.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono mt-1">
                        {strategy.code}
                      </p>
                      {strategy.description && (
                        <CardDescription className="mt-2">
                          {strategy.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{strategy.subscriberCount}</p>
                          <p className="text-xs text-muted-foreground">Subscribers</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <LinkIcon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{strategy.activeInviteLinks}</p>
                          <p className="text-xs text-muted-foreground">Invite Links</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{strategy.pendingRequests}</p>
                          <p className="text-xs text-muted-foreground">Pending Requests</p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Switch
                            checked={strategy.isPublic}
                            onCheckedChange={() => toggleVisibility(strategy.id, strategy.isPublic)}
                            disabled={togglingVisibility === strategy.id}
                          />
                          <span className="text-sm font-medium">
                            {strategy.isPublic ? (
                              <span className="flex items-center gap-1">
                                <Eye className="h-4 w-4" />
                                Public
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <EyeOff className="h-4 w-4" />
                                Private
                              </span>
                            )}
                          </span>
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        {!strategy.isPublic && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleShareStrategy(strategy)}
                          >
                            <Share2 className="h-4 w-4 mr-2" />
                            Share
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/dashboard/strategy/${strategy.id}`)}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Details
                        </Button>
                      </div>
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
