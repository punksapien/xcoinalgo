'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { showSuccessToast, showErrorToast, showInfoToast } from '@/lib/toast-utils';
import { getUserFriendlyError } from '@/lib/error-messages';
import {
  Shield,
  Globe,
  Wallet,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
  Trash2,
  RefreshCw
} from 'lucide-react';

interface BrokerStatus {
  connected: boolean;
  brokerName?: string;
  connectedAt?: string;
  lastUpdated?: string;
  message?: string;
}

export default function BrokerSetupPage() {
  const [connectionName, setConnectionName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Clear error/success states when modal closes
  const handleModalChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      setError(null);
      setSuccess(null);
    }
  };

  const { token, isAuthenticated, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user?.email) {
      setConnectionName('My CoinDCX Connection');
    }
    fetchBrokerStatus();
  }, [isAuthenticated, user, token]);

  const fetchBrokerStatus = async () => {
    if (!token) return;

    try {
      setLoadingStatus(true);
      const data = await apiClient.get<BrokerStatus>('/api/broker/status');
      setBrokerStatus(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 401 is handled automatically by apiClient (redirects to login)
        return;
      }
      console.error('Failed to fetch broker status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!apiKey.trim() || !secretKey.trim()) {
      setError('Please enter both API Key and Secret Key');
      setLoading(false);
      return;
    }

    try {
      // First test the connection
      await apiClient.post('/api/broker/test', {
        apiKey: apiKey.trim(),
        apiSecret: secretKey.trim(),
      });

      // If test successful, store the credentials
      await apiClient.post('/api/broker/keys', {
        apiKey: apiKey.trim(),
        apiSecret: secretKey.trim(),
      });

      showSuccessToast('Broker Connected!', 'Your CoinDCX credentials have been connected successfully');
      setSuccess('CoinDCX credentials connected successfully!');
      setApiKey('');
      setSecretKey('');
      handleModalChange(false); // Close modal on success
      await fetchBrokerStatus(); // Refresh status
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 401 is handled automatically by apiClient (redirects to login)
        return;
      }
      const friendlyError = getUserFriendlyError(err as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!token || !apiKey.trim() || !secretKey.trim()) return;

    setTesting(true);
    setError(null);

    try {
      await apiClient.post('/api/broker/test', {
        apiKey: apiKey.trim(),
        apiSecret: secretKey.trim(),
      });

      showSuccessToast('Connection Test Successful!', 'Your CoinDCX credentials are valid and working');
      setSuccess('Connection test successful! ✅');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 401 is handled automatically by apiClient (redirects to login)
        return;
      }
      const friendlyError = getUserFriendlyError(err as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!token || !window.confirm('Are you sure you want to disconnect CoinDCX? This will stop all running bots.')) {
      return;
    }

    setLoading(true);
    try {
      await apiClient.delete('/api/broker/keys');

      showSuccessToast('Broker Disconnected', 'Your CoinDCX credentials have been removed');
      setSuccess('CoinDCX disconnected successfully');
      await fetchBrokerStatus();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // 401 is handled automatically by apiClient (redirects to login)
        return;
      }
      const friendlyError = getUserFriendlyError(err as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
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
    <div className="container mx-auto p-6">
      <div className="space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 p-8 rounded-lg">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Shield className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Welcome to Broker Setup & Live Execution</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Trade legally with an FIU-registered (Govt. of India) broker** Secure INR deposits, withdrawals & 24/7 F&O trading on Bitcoin & Ether.
          </p>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <Card className="border-blue-200 dark:border-blue-800">
              <CardContent className="p-6 text-center">
                <Shield className="h-8 w-8 text-blue-500 mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-2">Secure Trading</h3>
                <p className="text-sm text-muted-foreground">
                  Connect to regulated brokers with enterprise-grade security for your crypto trading.
                </p>
              </CardContent>
            </Card>

            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="p-6 text-center">
                <Globe className="h-8 w-8 text-green-500 mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-2">Global Access</h3>
                <p className="text-sm text-muted-foreground">
                  Trade cryptocurrencies from anywhere with our globally accessible broker network.
                </p>
              </CardContent>
            </Card>

            <Card className="border-purple-200 dark:border-purple-800">
              <CardContent className="p-6 text-center">
                <Wallet className="h-8 w-8 text-purple-500 mx-auto mb-3" />
                <h3 className="font-semibold text-foreground mb-2">Easy Deposits</h3>
                <p className="text-sm text-muted-foreground">
                  Seamless INR deposits and withdrawals with our integrated broker solutions.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Broker Selection */}
        <div className="space-y-6">
          <Tabs defaultValue={brokerStatus?.connected ? "my" : "all"} className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="all">All Brokers</TabsTrigger>
              <TabsTrigger value="my">My Brokers</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-6">
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-bold text-foreground">Connect Your Trading Broker</h2>
                <p className="text-muted-foreground">Choose your preferred broker to start trading</p>
              </div>

              {/* CoinDCX Broker Card */}
              <div className="max-w-md mx-auto">
                <Card className={`border-2 transition-all duration-200 ${
                  brokerStatus?.connected
                    ? 'border-primary/30 hover:border-primary/50'
                    : 'border-border/50 hover:border-primary/30'
                } hover:shadow-lg`}>
                  <CardHeader className="pb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${
                        brokerStatus?.connected
                          ? 'bg-primary/10'
                          : 'bg-primary/5'
                      }`}>
                        <img
                          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🪙%3C/text%3E%3C/svg%3E"
                          alt="CoinDCX"
                          className="h-8 w-8"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <CardTitle className="text-foreground">CoinDCX</CardTitle>
                          {brokerStatus?.connected ? (
                            <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-full flex items-center">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Connected
                            </span>
                          ) : (
                            <span className="bg-accent/10 text-accent text-xs font-medium px-2 py-1 rounded-full">
                              ⭐ Popular
                            </span>
                          )}
                        </div>
                        {brokerStatus?.connected && brokerStatus.connectedAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Connected: {new Date(brokerStatus.connectedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {brokerStatus?.connected
                        ? 'Your CoinDCX account is connected and ready for trading.'
                        : 'Connect with CoinDCX to access their trading platform and services.'
                      }
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm space-y-1">
                      <p className="text-muted-foreground">Features:</p>
                      <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 ml-2">
                        <li>Crypto Trading</li>
                        <li>Margin Trading</li>
                        <li>24/7 Support</li>
                      </ul>
                    </div>
                    {brokerStatus?.connected ? (
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          onClick={fetchBrokerStatus}
                          disabled={loadingStatus}
                          className="w-full hover:bg-primary/5 hover:border-primary/50 transition-all"
                        >
                          {loadingStatus ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Refresh Status
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleDisconnect}
                          disabled={loading}
                          className="w-full hover:scale-105 transition-all"
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Disconnect
                        </Button>
                      </div>
                    ) : (
                      <Dialog open={isModalOpen} onOpenChange={handleModalChange}>
                        <DialogTrigger asChild>
                          <Button className="w-full bg-primary hover:bg-primary/90 transition-all hover:scale-105">
                            Connect to CoinDCX →
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="text-2xl text-center">Setup CoinDCX Connection</DialogTitle>
                            <DialogDescription className="text-center">
                              Connect your CoinDCX account to start automated trading with our platform.
                            </DialogDescription>
                          </DialogHeader>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 py-4">
                            {/* Setup Instructions */}
                            <div className="space-y-6">
                              <div>
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                                  <div className="bg-primary/10 p-1 rounded-full mr-2">
                                    <ExternalLink className="h-4 w-4 text-primary" />
                                  </div>
                                  Setup Instructions
                                </h3>

                                <div className="space-y-4">
                                  {[
                                    {
                                      step: '1',
                                      title: 'Go to coindcx.com/api-dashboard',
                                      content: 'Visit the CoinDCX API dashboard to manage your API keys.',
                                      link: 'https://coindcx.com/api-dashboard'
                                    },
                                    {
                                      step: '2',
                                      title: 'How to Get Your API Key & Secret for XcoinAlgo',
                                      content: 'Navigate to the API section and generate new credentials.'
                                    },
                                    {
                                      step: '3',
                                      title: 'Log in to your trading account where API access is provided',
                                      content: 'Ensure you have proper access to create API keys.'
                                    },
                                    {
                                      step: '4',
                                      title: 'Navigate to the "APIs" section',
                                      content: 'Look for API settings in your account dashboard.'
                                    },
                                    {
                                      step: '5',
                                      title: 'Click "Create New API" or similar',
                                      content: 'Generate a new API key pair for trading.'
                                    },
                                    {
                                      step: '6',
                                      title: 'Enter the following Label: XcoinAlgo',
                                      content: 'Use this specific label for identification.'
                                    },
                                    {
                                      step: '7',
                                      title: '✅ Do NOT select "Bind IP Address"',
                                      content: 'Leave IP binding disabled for flexibility.'
                                    }
                                  ].map((instruction, index) => (
                                    <div key={index} className="flex space-x-3">
                                      <div className="flex-shrink-0">
                                        <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-xs font-semibold text-primary">
                                          {instruction.step}
                                        </div>
                                      </div>
                                      <div className="flex-1">
                                        <h4 className="text-sm font-medium text-foreground">{instruction.title}</h4>
                                        <p className="text-xs text-muted-foreground mt-1">{instruction.content}</p>
                                        {instruction.link && (
                                          <a
                                            href={instruction.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-primary hover:underline inline-flex items-center mt-1"
                                          >
                                            Open API Dashboard <ExternalLink className="h-3 w-3 ml-1" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Connection Details Form */}
                            <div className="space-y-6">
                              <div>
                                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                                  <div className="bg-primary/10 p-1 rounded-full mr-2">
                                    <Shield className="h-4 w-4 text-primary" />
                                  </div>
                                  Connection Details
                                </h3>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="connectionName">Connection Name</Label>
                                    <Input
                                      id="connectionName"
                                      type="text"
                                      value={connectionName}
                                      onChange={(e) => setConnectionName(e.target.value)}
                                      placeholder="My CoinDCX Connection"
                                      className="border-border/50 focus:border-primary"
                                      required
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label htmlFor="apiKey">API KEY</Label>
                                    <Input
                                      id="apiKey"
                                      type="password"
                                      value={apiKey}
                                      onChange={(e) => setApiKey(e.target.value)}
                                      placeholder="Enter your API KEY"
                                      className="border-border/50 focus:border-primary"
                                      required
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label htmlFor="secretKey">SECRET KEY</Label>
                                    <div className="relative">
                                      <Input
                                        id="secretKey"
                                        type={showSecretKey ? 'text' : 'password'}
                                        value={secretKey}
                                        onChange={(e) => setSecretKey(e.target.value)}
                                        placeholder="Enter the SECRET KEY"
                                        className="pr-10 border-border/50 focus:border-primary"
                                        required
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowSecretKey(!showSecretKey)}
                                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                                      >
                                        {showSecretKey ? (
                                          <EyeOff className="h-4 w-4" />
                                        ) : (
                                          <Eye className="h-4 w-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                                    <div className="flex items-start space-x-2">
                                      <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
                                      <div className="text-xs text-foreground">
                                        <p className="font-medium">Security Notice:</p>
                                        <p>Make sure you do not use the same API key and secret pair for live trades from anywhere else, otherwise your executions would run into unexpected errors.</p>
                                      </div>
                                    </div>
                                  </div>

                                  {error && (
                                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                                      <div className="flex items-start space-x-2">
                                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                                        <p className="text-sm text-destructive">{error}</p>
                                      </div>
                                    </div>
                                  )}

                                  {success && (
                                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                                      <div className="flex items-start space-x-2">
                                        <CheckCircle className="h-4 w-4 text-primary mt-0.5" />
                                        <p className="text-sm text-primary">{success}</p>
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex space-x-3 pt-4">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={handleTestConnection}
                                      disabled={!apiKey.trim() || !secretKey.trim() || testing || loading}
                                      className="flex-1 hover:bg-primary/5 hover:border-primary/50 transition-all"
                                    >
                                      {testing ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      ) : (
                                        <Shield className="h-4 w-4 mr-2" />
                                      )}
                                      Test Connection
                                    </Button>

                                    <Button
                                      type="submit"
                                      disabled={loading || testing}
                                      className="flex-1 bg-primary hover:bg-primary/90 transition-all hover:scale-105"
                                    >
                                      {loading ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      ) : (
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                      )}
                                      Add CoinDCX
                                    </Button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="my" className="space-y-6">
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-bold text-foreground">My Connected Brokers</h2>
                <p className="text-muted-foreground">Manage your broker connections</p>
              </div>

              {loadingStatus ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : brokerStatus?.connected ? (
                <div className="max-w-md mx-auto">
                  <Card className="border-green-200 dark:border-green-800">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <CheckCircle className="h-6 w-6 text-green-500" />
                          <div>
                            <h3 className="font-semibold text-foreground">CoinDCX</h3>
                            <p className="text-sm text-green-600 dark:text-green-400">Connected</p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchBrokerStatus}
                          disabled={loadingStatus}
                        >
                          <RefreshCw className={`h-4 w-4 ${loadingStatus ? 'animate-spin' : ''}`} />
                        </Button>
                      </div>

                      {brokerStatus.connectedAt && (
                        <p className="text-xs text-muted-foreground mb-4">
                          Connected: {new Date(brokerStatus.connectedAt).toLocaleString()}
                        </p>
                      )}

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDisconnect}
                        disabled={loading}
                        className="w-full"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Disconnect
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Connected Brokers</h3>
                  <p className="text-muted-foreground">Connect to a broker to start trading</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

      </div>
    </div>
  );
}