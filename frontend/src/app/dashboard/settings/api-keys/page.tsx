'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { showSuccessToast, showErrorToast } from '@/lib/toast-utils';
import { getUserFriendlyError } from '@/lib/error-messages';
import {
  Key,
  Copy,
  Trash2,
  Plus,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Terminal,
  Loader2,
  Clock
} from 'lucide-react';

interface ApiKey {
  _id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { token, isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    fetchApiKeys();
  }, [isAuthenticated, token]);

  const fetchApiKeys = async () => {
    if (!token) return;

    try {
      setLoading(true);
      const response = await fetch('/api/settings/api-keys', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.apiKeys || []);
      } else {
        throw new Error('Failed to fetch API keys');
      }
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
      showErrorToast('Error', 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !keyName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: keyName.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create API key');
      }

      const data = await response.json();
      setNewApiKey(data.apiKey);
      setKeyName('');
      await fetchApiKeys();
      showSuccessToast('API Key Created', 'Your new API key has been generated');
    } catch (err) {
      const friendlyError = getUserFriendlyError(err as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!token || !window.confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    setDeletingId(keyId);
    try {
      const response = await fetch(`/api/settings/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete API key');
      }

      await fetchApiKeys();
      showSuccessToast('API Key Revoked', 'The API key has been deleted');
    } catch (err) {
      const friendlyError = getUserFriendlyError(err as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
    } finally {
      setDeletingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSuccessToast('Copied!', 'API key copied to clipboard');
  };

  const handleModalClose = () => {
    setIsCreateModalOpen(false);
    setNewApiKey(null);
    setKeyName('');
    setShowNewKey(false);
  };

  if (!isAuthenticated || !token) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Key className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">API Keys</h1>
              <p className="text-muted-foreground">
                Manage API keys for CLI authentication and programmatic access
              </p>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-6">
            <div className="flex items-start space-x-3">
              <Terminal className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-foreground">Using API Keys with xcoin CLI</h3>
                <p className="text-sm text-muted-foreground">
                  Generate an API key to authenticate the xcoin command-line tool with your account.
                </p>
                <div className="bg-background/50 rounded-lg p-3 font-mono text-sm space-y-1 mt-2">
                  <div className="text-muted-foreground"># Install CLI</div>
                  <div>git clone https://github.com/punksapien/xcoinalgo.git</div>
                  <div>cd xcoinalgo/cli && pip install -e .</div>
                  <div className="text-muted-foreground mt-2"># Authenticate</div>
                  <div>xcoin login</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Keys List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Your API Keys</CardTitle>
                <CardDescription>
                  API keys allow you to authenticate with the xcoinalgo platform
                </CardDescription>
              </div>
              <Dialog open={isCreateModalOpen} onOpenChange={handleModalClose}>
                <DialogTrigger asChild>
                  <Button onClick={() => setIsCreateModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Generate New Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  {!newApiKey ? (
                    <>
                      <DialogHeader>
                        <DialogTitle>Generate New API Key</DialogTitle>
                        <DialogDescription>
                          Create a new API key for CLI authentication or programmatic access
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleCreateKey} className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="keyName">Key Name</Label>
                          <Input
                            id="keyName"
                            value={keyName}
                            onChange={(e) => setKeyName(e.target.value)}
                            placeholder="e.g., My Laptop CLI"
                            required
                            className="border-border/50 focus:border-primary"
                          />
                          <p className="text-xs text-muted-foreground">
                            Choose a descriptive name to identify where this key is used
                          </p>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleModalClose}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" disabled={creating || !keyName.trim()}>
                            {creating ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Key className="h-4 w-4 mr-2" />
                            )}
                            Generate Key
                          </Button>
                        </DialogFooter>
                      </form>
                    </>
                  ) : (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center space-x-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          <span>API Key Created</span>
                        </DialogTitle>
                        <DialogDescription>
                          Copy your API key now. For security reasons, you won't be able to see it again.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4 space-y-4">
                        <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                          <div className="flex items-start space-x-2">
                            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                            <div className="text-sm text-foreground">
                              <p className="font-medium">Save this key immediately</p>
                              <p className="text-muted-foreground mt-1">
                                You won't be able to view this key again. Store it in a secure location.
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Your API Key</Label>
                          <div className="relative">
                            <Input
                              value={newApiKey}
                              type={showNewKey ? 'text' : 'password'}
                              readOnly
                              className="pr-20 font-mono text-sm"
                            />
                            <div className="absolute inset-y-0 right-0 flex items-center space-x-1 pr-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowNewKey(!showNewKey)}
                                className="h-8 w-8 p-0"
                              >
                                {showNewKey ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(newApiKey)}
                                className="h-8 w-8 p-0"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleModalClose} className="w-full">
                          Done - I've Saved My Key
                        </Button>
                      </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-12">
                <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No API Keys</h3>
                <p className="text-muted-foreground mb-4">
                  Generate an API key to start using the xcoin CLI
                </p>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Your First Key
                </Button>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeys.map((key) => (
                      <TableRow key={key._id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell>
                          <code className="text-sm bg-muted px-2 py-1 rounded">
                            {key.keyPrefix}••••••••••••
                          </code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {key.lastUsedAt ? (
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(key.lastUsedAt).toLocaleDateString()}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">Never</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteKey(key._id)}
                            disabled={deletingId === key._id}
                            className="text-destructive hover:text-destructive"
                          >
                            {deletingId === key._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security Notice */}
        <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
          <CardContent className="p-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-foreground">Security Best Practices</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Treat API keys like passwords - never share them publicly</li>
                  <li>Store keys securely (use environment variables, not in code)</li>
                  <li>Revoke unused keys immediately</li>
                  <li>Create separate keys for different environments (dev, prod)</li>
                  <li>If a key is compromised, revoke it and generate a new one</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
