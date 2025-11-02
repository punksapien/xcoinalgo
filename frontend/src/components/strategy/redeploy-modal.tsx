'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth';
import { StrategyExecutionAPI, type Subscription } from '@/lib/api/strategy-execution-api';
import { Loader2, DollarSign, Percent, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { showSuccessToast, showErrorToast } from '@/lib/toast-utils';
import { getUserFriendlyError } from '@/lib/error-messages';

interface RedeployModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription;
  onSuccess?: () => void;
}

export function RedeployModal({
  open,
  onOpenChange,
  subscription,
  onSuccess
}: RedeployModalProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [balanceCurrency, setBalanceCurrency] = useState<'INR' | 'USDT'>('USDT');

  // Capital allocation tracking
  const [otherSubscriptions, setOtherSubscriptions] = useState<Subscription[]>([]);
  const [allocatedCapital, setAllocatedCapital] = useState<number>(0);

  // Form state - pre-filled with current subscription values
  const [capital, setCapital] = useState(subscription.capital.toString());
  const [riskPerTrade, setRiskPerTrade] = useState(subscription.riskPerTrade.toString());
  const [leverage, setLeverage] = useState(subscription.leverage.toString());

  // Reset form when subscription changes
  useEffect(() => {
    if (subscription) {
      setCapital(subscription.capital.toString());
      setRiskPerTrade(subscription.riskPerTrade.toString());
      setLeverage(subscription.leverage.toString());
    }
  }, [subscription]);

  const fetchUserBalance = useCallback(async () => {
    if (!token) {
      console.log('❌ No token, skipping balance fetch');
      return;
    }

    console.log('🔄 Fetching futures balance...');
    try {
      setLoadingBalance(true);
      const balanceData = await StrategyExecutionAPI.getFuturesBalance(token);
      console.log('✅ Balance API response:', balanceData);

      setAvailableBalance(balanceData.totalAvailable);
      setBalanceCurrency(balanceData.currency as 'INR' | 'USDT');

      console.log('✅ State updated - balance:', balanceData.totalAvailable, 'currency:', balanceData.currency);
    } catch (err) {
      console.error('❌ Failed to fetch futures balance:', err);
      setAvailableBalance(null);
      showErrorToast(
        'Balance Fetch Failed',
        'Unable to fetch your wallet balance. Please check your broker connection.'
      );
    } finally {
      setLoadingBalance(false);
    }
  }, [token]);

  const fetchUserSubscriptions = useCallback(async () => {
    if (!token) {
      console.log('❌ No token, skipping subscriptions fetch');
      return;
    }

    console.log('🔄 Fetching user subscriptions...');
    try {
      setLoadingSubscriptions(true);
      const { subscriptions: userSubscriptions } = await StrategyExecutionAPI.getUserSubscriptions(token);
      console.log('✅ Subscriptions API response:', userSubscriptions);

      // Filter active subscriptions EXCLUDING the current one being redeployed
      const activeOtherSubs = userSubscriptions.filter(
        (sub) => sub.isActive && !sub.isPaused && sub.id !== subscription.id
      );
      console.log('📊 Active other subscriptions:', activeOtherSubs.length);

      // Calculate total allocated capital (excluding current subscription)
      const totalAllocated = activeOtherSubs.reduce(
        (sum, sub) => sum + (sub.capital || 0),
        0
      );
      console.log('💰 Total allocated capital (excluding current):', totalAllocated);

      setOtherSubscriptions(activeOtherSubs);
      setAllocatedCapital(totalAllocated);
    } catch (err) {
      console.error('❌ Failed to fetch subscriptions:', err);
      setOtherSubscriptions([]);
      setAllocatedCapital(0);
    } finally {
      setLoadingSubscriptions(false);
    }
  }, [token, subscription.id]);

  useEffect(() => {
    if (open && token) {
      fetchUserBalance();
      fetchUserSubscriptions();
    }
  }, [open, token, fetchUserBalance, fetchUserSubscriptions]);

  const handleRedeploy = async () => {
    if (!token) {
      showErrorToast('Authentication Required', 'Please login to redeploy strategies');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setValidationErrors({});

      // Check required fields
      if (!riskPerTrade || !leverage || !capital) {
        const errors: Record<string, string> = {};
        if (!capital) errors.capital = 'Capital is required';
        if (!riskPerTrade) errors.riskPerTrade = 'Risk per trade is required';
        if (!leverage) errors.leverage = 'Leverage is required';
        setValidationErrors(errors);
        showErrorToast('Required Fields Missing', 'Please fill in all required fields');
        return;
      }

      // Validate numeric values
      const capitalNum = parseFloat(capital);
      const riskPerTradeNum = parseFloat(riskPerTrade);
      const leverageNum = parseInt(leverage);

      if (isNaN(capitalNum) || capitalNum < 100) {
        setValidationErrors({ capital: 'Capital must be at least ₹100' });
        showErrorToast('Invalid Capital', 'Capital must be at least ₹100');
        return;
      }

      if (isNaN(riskPerTradeNum) || riskPerTradeNum < 0.001 || riskPerTradeNum > 0.1) {
        setValidationErrors({ riskPerTrade: 'Risk per trade must be between 0.1% and 10%' });
        showErrorToast('Invalid Risk', 'Risk per trade must be between 0.1% and 10%');
        return;
      }

      if (isNaN(leverageNum) || leverageNum < 1 || leverageNum > 100) {
        setValidationErrors({ leverage: 'Leverage must be between 1x and 100x' });
        showErrorToast('Invalid Leverage', 'Leverage must be between 1x and 100x');
        return;
      }

      // Balance check is mandatory
      if (availableBalance === null) {
        showErrorToast(
          'Balance Unavailable',
          'Unable to verify your wallet balance. Please check your broker connection and try again.'
        );
        return;
      }

      // Calculate available capital (wallet balance - capital allocated to OTHER subscriptions)
      // Current subscription's capital is "freed up" since it's paused
      const availableForRedeploy = availableBalance - allocatedCapital;
      const requestedCapital = capitalNum;

      console.log('💰 Capital check for redeploy:', {
        walletBalance: availableBalance,
        allocatedToOthers: allocatedCapital,
        currentSubscriptionCapital: subscription.capital,
        availableForRedeploy,
        requestedCapital
      });

      // Check if user has enough capital
      if (requestedCapital > availableForRedeploy) {
        const symbol = balanceCurrency === 'INR' ? '₹' : '$';
        showErrorToast(
          'Insufficient Available Capital',
          `You can only allocate ${symbol}${availableForRedeploy.toFixed(2)}. ` +
          `(Wallet: ${symbol}${availableBalance.toFixed(2)} - Allocated to other subscriptions: ${symbol}${allocatedCapital.toFixed(2)})`
        );
        return;
      }

      // Prepare updates (only send changed values)
      const updates: Partial<{ capital: number; riskPerTrade: number; leverage: number }> = {};
      if (capitalNum !== subscription.capital) updates.capital = capitalNum;
      if (riskPerTradeNum !== subscription.riskPerTrade) updates.riskPerTrade = riskPerTradeNum;
      if (leverageNum !== subscription.leverage) updates.leverage = leverageNum;

      console.log('📤 Sending updates:', updates);

      // Update subscription settings if anything changed
      if (Object.keys(updates).length > 0) {
        await StrategyExecutionAPI.updateSubscriptionSettings(subscription.id, updates, token);
      }

      // Resume subscription
      await StrategyExecutionAPI.resumeSubscription(subscription.id, token);

      // Success
      showSuccessToast(
        'Successfully Redeployed!',
        `Your subscription has been updated and resumed.`
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('Redeploy failed:', err);
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
          <DialogTitle>Edit & Redeploy Subscription</DialogTitle>
          <DialogDescription>
            Modify your subscription parameters for <span className="font-semibold">{subscription.strategy?.name || 'this strategy'}</span>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6 py-4">
          {/* Capital Allocation Display */}
          {loadingBalance || loadingSubscriptions ? (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-sm text-blue-700">
                Loading balance and allocations...
              </span>
            </div>
          ) : availableBalance !== null ? (
            <div className="space-y-2">
              {/* Total Wallet Balance */}
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700">
                    Total Wallet Balance:
                  </span>
                </div>
                <span className="text-lg font-bold text-green-700">
                  {balanceCurrency === 'INR' ? '₹' : '$'}{availableBalance.toFixed(2)}
                </span>
              </div>

              {/* Current Subscription Capital (being freed up) */}
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <span className="text-sm font-medium text-purple-700">
                  Current Subscription (paused):
                </span>
                <span className="text-lg font-bold text-purple-700">
                  {balanceCurrency === 'INR' ? '₹' : '$'}{subscription.capital.toFixed(2)}
                </span>
              </div>

              {/* Allocated to Other Subscriptions */}
              {allocatedCapital > 0 && (
                <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                  <span className="text-sm font-medium text-orange-700">
                    Allocated to Other Subscriptions ({otherSubscriptions.length}):
                  </span>
                  <span className="text-lg font-bold text-orange-700">
                    -{balanceCurrency === 'INR' ? '₹' : '$'}{allocatedCapital.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Available for This Subscription */}
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border-2 border-blue-200">
                <span className="text-sm font-semibold text-blue-800">
                  Available for This Subscription:
                </span>
                <span className="text-xl font-bold text-blue-800">
                  {balanceCurrency === 'INR' ? '₹' : '$'}{(availableBalance - allocatedCapital).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Unable to fetch your wallet balance. Please check your broker connection and refresh the page to try again.
              </AlertDescription>
            </Alert>
          )}

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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRedeploy}
            disabled={loading || loadingBalance || loadingSubscriptions || availableBalance === null}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Update & Resume'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
