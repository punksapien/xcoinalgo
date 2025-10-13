'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { StrategyExecutionAPI, type SubscriptionConfig } from '@/lib/api/strategy-execution-api';
import { Loader2, DollarSign, Percent, TrendingUp, Shield, AlertCircle, CheckCircle } from 'lucide-react';
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

  // Form state
  const [capital, setCapital] = useState('10000');
  const [riskPerTrade, setRiskPerTrade] = useState('0.02'); // 2%
  const [leverage, setLeverage] = useState('10');
  const [maxPositions, setMaxPositions] = useState('1');
  const [maxDailyLoss, setMaxDailyLoss] = useState('0.05'); // 5%
  const [slAtrMultiplier, setSlAtrMultiplier] = useState('2.0');
  const [tpAtrMultiplier, setTpAtrMultiplier] = useState('2.5');
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('');

  // Fetch broker credentials and balance
  useEffect(() => {
    if (open && token) {
      fetchBrokerCredentials();
      fetchUserBalance();
    }
  }, [open, token]);

  const fetchBrokerCredentials = async () => {
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
  };

  const fetchUserBalance = async () => {
    if (!token) return;

    try {
      setLoadingBalance(true);
      // For futures strategies (B- pairs), fetch futures balance; otherwise spot balance
      // We'll always fetch futures balance since most strategies use futures
      const balanceData = await StrategyExecutionAPI.getFuturesBalance(token);
      setAvailableBalance(balanceData.totalAvailable);
    } catch (err) {
      console.error('Failed to fetch futures balance:', err);
      // Fallback to spot balance if futures fails
      try {
        const spotBalanceData = await StrategyExecutionAPI.getUserBalance(token);
        setAvailableBalance(spotBalanceData.totalAvailable);
      } catch (spotErr) {
        console.error('Failed to fetch spot balance:', spotErr);
        // Don't show error toast for balance fetch failure, just log it
        setAvailableBalance(null);
      }
    } finally {
      setLoadingBalance(false);
    }
  };

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

      // Prepare config for validation
      const configData = {
        capital: parseFloat(capital),
        riskPerTrade: parseFloat(riskPerTrade),
        leverage: parseInt(leverage),
        maxPositions: parseInt(maxPositions),
        maxDailyLoss: parseFloat(maxDailyLoss),
        slAtrMultiplier: slAtrMultiplier ? parseFloat(slAtrMultiplier) : undefined,
        tpAtrMultiplier: tpAtrMultiplier ? parseFloat(tpAtrMultiplier) : undefined,
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

  const calculateMaxDailyRisk = () => {
    const cap = parseFloat(capital) || 0;
    const dailyLoss = parseFloat(maxDailyLoss) || 0;
    return (cap * dailyLoss).toFixed(2);
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
                  <span className="text-sm font-medium text-green-700">Available Futures Balance (USDT):</span>
                </div>
                <span className="text-lg font-bold text-green-700">
                  ${availableBalance.toFixed(2)}
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
                Risk Per Trade
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
                />
                <span className="flex items-center px-3 bg-secondary rounded-md">
                  {(parseFloat(riskPerTrade) * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Maximum risk: ₹{calculateMaxRisk()} per trade
              </p>
            </div>

            {/* Leverage */}
            <div className="space-y-2">
              <Label htmlFor="leverage" className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Leverage
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
                />
                <span className="flex items-center px-3 bg-secondary rounded-md">
                  {leverage}x
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Trading leverage multiplier (1-100x)
              </p>
            </div>

            {/* Max Positions */}
            <div className="space-y-2">
              <Label htmlFor="maxPositions">Max Concurrent Positions</Label>
              <Input
                id="maxPositions"
                type="number"
                min="1"
                max="10"
                value={maxPositions}
                onChange={(e) => setMaxPositions(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Maximum number of positions open at once
              </p>
            </div>

            {/* Max Daily Loss */}
            <div className="space-y-2">
              <Label htmlFor="maxDailyLoss" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Max Daily Loss
              </Label>
              <div className="flex gap-2">
                <Input
                  id="maxDailyLoss"
                  type="number"
                  min="0.01"
                  max="0.2"
                  step="0.01"
                  value={maxDailyLoss}
                  onChange={(e) => setMaxDailyLoss(e.target.value)}
                />
                <span className="flex items-center px-3 bg-secondary rounded-md">
                  {(parseFloat(maxDailyLoss) * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Stop trading after ₹{calculateMaxDailyRisk()} loss in one day
              </p>
            </div>

            {/* Optional: SL/TP ATR Multipliers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="slAtr">Stop Loss ATR (Optional)</Label>
                <Input
                  id="slAtr"
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.1"
                  value={slAtrMultiplier}
                  onChange={(e) => setSlAtrMultiplier(e.target.value)}
                  placeholder="2.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpAtr">Take Profit ATR (Optional)</Label>
                <Input
                  id="tpAtr"
                  type="number"
                  min="0.5"
                  max="10"
                  step="0.1"
                  value={tpAtrMultiplier}
                  onChange={(e) => setTpAtrMultiplier(e.target.value)}
                  placeholder="2.5"
                />
              </div>
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
