'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { StrategyExecutionAPI, type SubscriptionConfig } from '@/lib/api/strategy-execution-api';
import { Loader2, DollarSign, Percent, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/lib/toast-utils';
import { getUserFriendlyError } from '@/lib/error-messages';
import { validateSubscriptionConfig, validateSufficientBalance } from '@/lib/validation/subscription-schema';

interface SubscribeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategyId: string;
  strategyName: string;
  onSuccess?: () => void;
}

interface BrokerCredential {
  id: string;
  brokerName: string;
  isActive: boolean;
}

export function SubscribeModal({
  open,
  onOpenChange,
  strategyId,
  strategyName,
  onSuccess
}: SubscribeModalProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [brokerCredentials, setBrokerCredentials] = useState<BrokerCredential[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [balanceCurrency, setBalanceCurrency] = useState<'INR' | 'USDT'>('USDT');

  // Form state
  const [capital, setCapital] = useState('10000');
  const [riskPerTrade, setRiskPerTrade] = useState(''); // No default - user must enter
  const [leverage, setLeverage] = useState(''); // No default - user must enter
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('');

  const fetchBrokerCredentials = useCallback(async () => {
    if (!token) return;

    try {
      setLoadingCredentials(true);
      const response = await fetch(`/api/broker/credentials`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const activeCredentials = data.credentials?.filter((c: BrokerCredential) => c.isActive) || [];
        setBrokerCredentials(activeCredentials);

        // Auto-select first credential if available
        if (activeCredentials.length > 0) {
          setSelectedCredentialId(activeCredentials[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch broker credentials:', err);
      const friendlyError = getUserFriendlyError(err as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
    } finally {
      setLoadingCredentials(false);
    }
  }, [token]);

  const fetchUserBalance = useCallback(async () => {
    if (!token) {
      console.log('❌ No token, skipping balance fetch');
      return;
    }

    console.log('🔄 Fetching futures balance...');
    try {
      setLoadingBalance(true);
      // Fetch futures balance (USDT or INR wallet) - all strategies use futures
      const balanceData = await StrategyExecutionAPI.getFuturesBalance(token);
      console.log('✅ Balance API response:', balanceData);
      console.log('💰 Total available:', balanceData.totalAvailable);
      console.log('💵 Currency:', balanceData.currency);

      setAvailableBalance(balanceData.totalAvailable);
      // Store currency for display (₹ for INR, $ for USDT)
      setBalanceCurrency(balanceData.currency as 'INR' | 'USDT');

      console.log('✅ State updated - balance:', balanceData.totalAvailable, 'currency:', balanceData.currency);
    } catch (err) {
      console.error('❌ Failed to fetch futures balance:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      // Don't show error toast for balance fetch failure, just log it
      setAvailableBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [token]);

  // Fetch broker credentials and balance
  useEffect(() => {
    if (open && token) {
      fetchBrokerCredentials();
      fetchUserBalance();
    }
  }, [open, token, fetchBrokerCredentials, fetchUserBalance]);

  const handleSubscribe = async () => {
    if (!token) {
      showErrorToast('Authentication Required', 'Please login to subscribe to strategies');
      return;
    }

    if (!selectedCredentialId) {
      setError('Please select a broker credential');
      showErrorToast('Broker Required', 'Please select a broker credential to continue');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setValidationErrors({});

      // Check required fields (no defaults allowed)
      if (!riskPerTrade || !leverage) {
        const errors: Record<string, string> = {};
        if (!riskPerTrade) errors.riskPerTrade = 'Risk per trade is required';
        if (!leverage) errors.leverage = 'Leverage is required';
        setValidationErrors(errors);
        showErrorToast('Required Fields Missing', 'Please enter Risk Per Trade and Leverage values');
        return;
      }

      // Prepare config for validation
      const configData = {
        capital: parseFloat(capital),
        riskPerTrade: parseFloat(riskPerTrade),
        leverage: parseInt(leverage),
        brokerCredentialId: selectedCredentialId,
      };

      // Validate configuration
      const validation = validateSubscriptionConfig(configData);
      if (!validation.success) {
        setValidationErrors(validation.errors || {});
        showErrorToast('Validation Failed', 'Please check your input and fix the errors highlighted below');
        return;
      }

      // Check balance if available
      if (availableBalance !== null) {
        const balanceCheck = validateSufficientBalance(configData.capital, availableBalance);
        if (!balanceCheck.isValid) {
          showErrorToast('Insufficient Balance', balanceCheck.error || 'You don\'t have enough balance');
          return;
        }
        if (balanceCheck.error) {
          // Show warning but allow to proceed
          showWarningToast('High Capital Allocation', balanceCheck.error);
        }
      }

      // Subscribe to strategy
      await StrategyExecutionAPI.subscribeToStrategy(strategyId, validation.data!, token);

      // Success
      showSuccessToast(
        'Successfully Subscribed!',
        `You are now subscribed to ${strategyName}. Your strategy will start executing automatically.`
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('Subscription failed:', err);
      const friendlyError = getUserFriendlyError(err as Error);
      showErrorToast(friendlyError.title, friendlyError.message);
      setError(friendlyError.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateMaxRisk = () => {
    const cap = parseFloat(capital) || 0;
    const risk = parseFloat(riskPerTrade) || 0;
    return (cap * risk).toFixed(2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subscribe to Strategy</DialogTitle>
          <DialogDescription>
            Configure your subscription parameters for <span className="font-semibold">{strategyName}</span>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loadingCredentials ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : brokerCredentials.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No active broker credentials found. Please set up your broker connection first.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6 py-4">
            {/* Available Balance Display */}
            {loadingBalance ? (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-700">Fetching your available balance...</span>
              </div>
            ) : availableBalance !== null ? (
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">
                    Available Futures Balance ({balanceCurrency}):
                  </span>
                </div>
                <span className="text-lg font-bold text-green-700">
                  {balanceCurrency === 'INR' ? '₹' : '$'}{availableBalance.toFixed(2)}
                </span>
              </div>
            ) : null}
            {/* Broker Credential Selection */}
            <div className="space-y-2">
              <Label htmlFor="broker">Broker Credential</Label>
              <Select value={selectedCredentialId} onValueChange={setSelectedCredentialId}>
                <SelectTrigger id="broker">
                  <SelectValue placeholder="Select broker credential" />
                </SelectTrigger>
                <SelectContent>
                  {brokerCredentials.map((credential) => (
                    <SelectItem key={credential.id} value={credential.id}>
                      {credential.brokerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Capital */}
            <div className="space-y-2">
              <Label htmlFor="capital" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Capital (₹)
              </Label>
              <Input
                id="capital"
                type="number"
                min="100"
                step="100"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="10000"
                className={validationErrors.capital ? 'border-red-500' : ''}
              />
              {validationErrors.capital ? (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.capital}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Amount of capital to allocate to this strategy (Min: ₹100)
                </p>
              )}
            </div>

            {/* Risk Per Trade */}
            <div className="space-y-2">
              <Label htmlFor="riskPerTrade" className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Risk Per Trade *
              </Label>
              <div className="flex gap-2">
                <Input
                  id="riskPerTrade"
                  type="number"
                  min="0.001"
                  max="0.1"
                  step="0.001"
                  value={riskPerTrade}
                  onChange={(e) => setRiskPerTrade(e.target.value)}
                  placeholder="0.02"
                  className={validationErrors.riskPerTrade ? 'border-red-500' : ''}
                  required
                />
                <span className="flex items-center px-3 bg-secondary rounded-md">
                  {riskPerTrade ? (parseFloat(riskPerTrade) * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
              {validationErrors.riskPerTrade ? (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.riskPerTrade}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Maximum risk: ₹{calculateMaxRisk()} per trade
                </p>
              )}
            </div>

            {/* Leverage */}
            <div className="space-y-2">
              <Label htmlFor="leverage" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Leverage *
              </Label>
              <div className="flex gap-2">
                <Input
                  id="leverage"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={leverage}
                  onChange={(e) => setLeverage(e.target.value)}
                  placeholder="10"
                  className={validationErrors.leverage ? 'border-red-500' : ''}
                  required
                />
                <span className="flex items-center px-3 bg-secondary rounded-md">
                  {leverage || '0'}x
                </span>
              </div>
              {validationErrors.leverage ? (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validationErrors.leverage}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Trading leverage multiplier (1-100x)
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubscribe}
            disabled={loading || loadingCredentials || brokerCredentials.length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Subscribing...
              </>
            ) : (
              'Subscribe'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
