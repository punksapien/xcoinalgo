'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/lib/auth';
import { StrategyExecutionAPI, type SubscriptionConfig, type Subscription } from '@/lib/api/strategy-execution-api';
import { Loader2, DollarSign, Percent, TrendingUp, AlertCircle, CheckCircle, Award, TrendingDown, Target, ChevronRight, ArrowLeft, Info, Shield } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { showSuccessToast, showErrorToast, showWarningToast } from '@/lib/toast-utils';
import { getUserFriendlyError } from '@/lib/error-messages';
import { validateSubscriptionConfig, validateSufficientBalance } from '@/lib/validation/subscription-schema';

interface SubscribeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategyId: string;
  strategyName: string;
  strategyMetrics?: {
    minMargin?: number;
    winRate?: number;
    roi?: number;
    riskReward?: number;
    maxDrawdown?: number;
  };
  strategyConfig?: Record<string, unknown>; // Strategy executionConfig for defaults
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
  strategyMetrics,
  strategyConfig,
  onSuccess
}: SubscribeModalProps) {
  const { token } = useAuth();
  const [step, setStep] = useState<'overview' | 'deploy'>('overview');
  const [loading, setLoading] = useState(false);
  const [brokerCredentials, setBrokerCredentials] = useState<BrokerCredential[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [balanceCurrency, setBalanceCurrency] = useState<'INR' | 'USDT'>('USDT');

  // Capital allocation tracking
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [allocatedCapital, setAllocatedCapital] = useState<number>(0);

  // Get strategy config defaults
  const minMargin = strategyMetrics?.minMargin || 10000;
  const strategyDefaultRisk = Number(strategyConfig?.risk_per_trade) || 0.04;
  const strategyDefaultLeverage = Number(strategyConfig?.leverage) || 10;

  // Form state
  const [capital, setCapital] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [riskPerTrade, setRiskPerTrade] = useState(''); // Empty = use strategy default
  const [leverage, setLeverage] = useState(''); // Empty = use strategy default
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
      const balanceData = await StrategyExecutionAPI.getFuturesBalance(token);
      console.log('✅ Balance API response:', balanceData);
      setAvailableBalance(balanceData.totalAvailable);
      setBalanceCurrency(balanceData.currency as 'INR' | 'USDT');
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
    if (!token) return;

    try {
      setLoadingSubscriptions(true);
      const { subscriptions: userSubscriptions } = await StrategyExecutionAPI.getUserSubscriptions(token);
      const activeSubscriptions = userSubscriptions.filter(
        (sub) => sub.isActive && !sub.isPaused
      );
      const totalAllocated = activeSubscriptions.reduce(
        (sum, sub) => sum + (sub.capital || 0),
        0
      );
      setSubscriptions(activeSubscriptions);
      setAllocatedCapital(totalAllocated);
    } catch (err) {
      console.error('❌ Failed to fetch subscriptions:', err);
      setSubscriptions([]);
      setAllocatedCapital(0);
    } finally {
      setLoadingSubscriptions(false);
    }
  }, [token]);

  // Fetch data when modal opens
  useEffect(() => {
    if (open && token) {
      fetchBrokerCredentials();
      fetchUserBalance();
      fetchUserSubscriptions();
      // Reset to overview step when opening
      setStep('overview');
    }
  }, [open, token, fetchBrokerCredentials, fetchUserBalance, fetchUserSubscriptions]);

  // Real-time validation for capital
  const validateCapital = (value: string) => {
    const errors = { ...validationErrors };

    if (!value || value.trim() === '') {
      errors.capital = 'Investment amount is required';
    } else if (isNaN(Number(value))) {
      errors.capital = 'Please enter a valid number';
    } else {
      const amount = parseFloat(value);
      if (amount < minMargin) {
        errors.capital = `Minimum investment amount is ₹${minMargin.toLocaleString()}`;
      } else if (amount > 10000000) {
        errors.capital = 'Maximum investment amount is ₹10,000,000';
      } else {
        delete errors.capital;
      }
    }

    setValidationErrors(errors);
  };

  const handleCapitalChange = (value: string) => {
    // Only allow numbers and decimal point
    const sanitized = value.replace(/[^0-9.]/g, '');
    setCapital(sanitized);
    validateCapital(sanitized);
  };

  // Validation for leverage
  const handleLeverageChange = (value: string) => {
    // Only allow numbers
    const sanitized = value.replace(/[^0-9]/g, '');
    setLeverage(sanitized);

    const errors = { ...validationErrors };
    if (sanitized && (isNaN(Number(sanitized)) || Number(sanitized) < 1 || Number(sanitized) > 100)) {
      errors.leverage = 'Leverage must be between 1x and 100x';
    } else {
      delete errors.leverage;
    }
    setValidationErrors(errors);
  };

  // Validation for risk per trade
  const handleRiskPerTradeChange = (value: string) => {
    // Only allow numbers and decimal point
    const sanitized = value.replace(/[^0-9.]/g, '');
    setRiskPerTrade(sanitized);

    const errors = { ...validationErrors };
    if (sanitized) {
      const risk = parseFloat(sanitized);
      if (isNaN(risk) || risk < 0.01 || risk > 0.55) {
        errors.riskPerTrade = 'Risk per trade must be between 0.01 and 0.55';
      } else {
        delete errors.riskPerTrade;
      }
    } else {
      delete errors.riskPerTrade;
    }
    setValidationErrors(errors);
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

    // Validate capital before proceeding
    if (!capital || capital.trim() === '') {
      setValidationErrors({ ...validationErrors, capital: 'Investment amount is required' });
      showErrorToast('Investment Amount Required', 'Please enter an investment amount');
      return;
    }

    const capitalAmount = parseFloat(capital);
    if (isNaN(capitalAmount)) {
      setValidationErrors({ ...validationErrors, capital: 'Please enter a valid number' });
      showErrorToast('Invalid Amount', 'Please enter a valid investment amount');
      return;
    }

    if (capitalAmount < minMargin) {
      setValidationErrors({ ...validationErrors, capital: `Minimum investment amount is ₹${minMargin.toLocaleString()}` });
      showErrorToast('Amount Too Low', `Minimum investment amount is ₹${minMargin.toLocaleString()}`);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setValidationErrors({});

      // Prepare config for validation
      // Empty values = use strategy defaults (sent as undefined to backend)
      const configData: Record<string, unknown> = {
        capital: capitalAmount,
        brokerCredentialId: selectedCredentialId,
      };

      // Only include if user explicitly set them (not using strategy default)
      if (riskPerTrade && riskPerTrade.trim() !== '') {
        configData.riskPerTrade = parseFloat(riskPerTrade);
      }
      if (leverage && leverage.trim() !== '') {
        configData.leverage = parseInt(leverage);
      }

      // Validate configuration
      const validation = validateSubscriptionConfig(configData);
      if (!validation.success) {
        setValidationErrors(validation.errors || {});
        showErrorToast('Validation Failed', 'Please check your input and fix the errors highlighted below');
        return;
      }

      // Balance check
      if (availableBalance === null) {
        showErrorToast(
          'Balance Unavailable',
          'Unable to verify your wallet balance. Please check your broker connection and try again.'
        );
        return;
      }

      // Calculate available capital (use validated data)
      const availableForAllocation = availableBalance - allocatedCapital;
      const requestedCapital = validation.data?.capital ?? 0;

      if (availableForAllocation <= 0) {
        showErrorToast(
          'No Capital Available',
          `All your capital is allocated to ${subscriptions.length} active subscription(s). ` +
          'Please cancel or pause existing subscriptions to free up capital.'
        );
        return;
      }

      if (requestedCapital > availableForAllocation) {
        const symbol = balanceCurrency === 'INR' ? '₹' : '$';
        showErrorToast(
          'Insufficient Available Capital',
          `You can only allocate ${symbol}${availableForAllocation.toFixed(2)}. ` +
          `(Wallet: ${symbol}${availableBalance.toFixed(2)} - Already Allocated: ${symbol}${allocatedCapital.toFixed(2)})`
        );
        return;
      }

      // Subscribe to strategy
      await StrategyExecutionAPI.subscribeToStrategy(strategyId, validation.data as never, token);

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

  const availableForNewSubscription = availableBalance !== null ? availableBalance - allocatedCapital : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {step === 'overview' ? (
          <>
            {/* STEP 1: OVERVIEW */}
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Award className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Expert-Crafted Strategy</DialogTitle>
                  <DialogDescription className="text-sm">
                    This trading bot was designed by industry experts with years of experience in the crypto markets.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Trading Bot Overview */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Target className="h-5 w-5 text-yellow-600" />
                  <h3 className="text-lg font-semibold">Trading Bot Overview</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Strategy Name */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2 text-blue-700">
                      <Shield className="h-4 w-4" />
                      <p className="text-xs font-medium">Strategy Name</p>
                    </div>
                    <p className="font-semibold text-blue-900">{strategyName}</p>
                  </div>

                  {/* Min Margin */}
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2 text-purple-700">
                      <DollarSign className="h-4 w-4" />
                      <p className="text-xs font-medium">Min Margin</p>
                    </div>
                    <p className="text-2xl font-bold text-purple-900">₹{minMargin}</p>
                  </div>

                  {/* Win Rate */}
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2 text-green-700">
                      <Award className="h-4 w-4" />
                      <p className="text-xs font-medium">Win Rate</p>
                    </div>
                    <p className="text-2xl font-bold text-green-900">
                      {strategyMetrics?.winRate ? `${strategyMetrics.winRate.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>

                  {/* Risk/Reward */}
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2 text-indigo-700">
                      <Target className="h-4 w-4" />
                      <p className="text-xs font-medium">Risk/Reward</p>
                    </div>
                    <p className="text-2xl font-bold text-indigo-900">
                      {strategyMetrics?.riskReward ? `${strategyMetrics.riskReward.toFixed(1)}:1` : 'N/A'}
                    </p>
                  </div>

                  {/* Max Drawdown */}
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2 text-red-700">
                      <TrendingDown className="h-4 w-4" />
                      <p className="text-xs font-medium">Max Drawdown</p>
                    </div>
                    <p className="text-2xl font-bold text-red-900">
                      ₹{strategyMetrics?.maxDrawdown ? (strategyMetrics.maxDrawdown * 100).toFixed(2) : 'N/A'}
                    </p>
                  </div>

                  {/* ROI */}
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2 text-yellow-700">
                      <TrendingUp className="h-4 w-4" />
                      <p className="text-xs font-medium">ROI</p>
                    </div>
                    <p className="text-2xl font-bold text-yellow-900">
                      {strategyMetrics?.roi ? `${strategyMetrics.roi.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => setStep('deploy')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                size="lg"
              >
                Proceed to Deploy
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* STEP 2: DEPLOY */}
            <DialogHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Target className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Deploy Trading Bot</DialogTitle>
                  <DialogDescription className="text-sm">
                    Configure your investment parameters for {strategyName}
                  </DialogDescription>
                </div>
              </div>
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
                {/* Balance Information */}
                {loadingBalance || loadingSubscriptions ? (
                  <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span className="text-sm text-blue-700">Loading balance...</span>
                  </div>
                ) : availableBalance !== null ? (
                  <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-lg space-y-3">
                    {/* Total Wallet Balance */}
                    <div className="flex items-center justify-between pb-2">
                      <span className="text-sm font-medium text-blue-700">Total Wallet Balance:</span>
                      <span className="text-lg font-semibold text-blue-900">
                        {balanceCurrency === 'INR' ? '₹' : '$'}{availableBalance.toFixed(2)}
                      </span>
                    </div>

                    {/* Already Allocated (if any) */}
                    {allocatedCapital > 0 && (
                      <div className="flex items-center justify-between pb-2 border-t border-blue-200 pt-2">
                        <span className="text-sm font-medium text-orange-700">Already Allocated ({subscriptions.length} {subscriptions.length === 1 ? 'bot' : 'bots'}):</span>
                        <span className="text-lg font-semibold text-orange-900">
                          - {balanceCurrency === 'INR' ? '₹' : '$'}{allocatedCapital.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {/* Available for This Strategy */}
                    <div className="flex items-center justify-between pt-2 border-t-2 border-blue-300">
                      <span className="text-sm font-bold text-green-800">Available for This Strategy:</span>
                      <span className="text-2xl font-bold text-green-900">
                        {balanceCurrency === 'INR' ? '₹' : '$'}{availableForNewSubscription.toFixed(2)}
                      </span>
                    </div>

                    <Alert className="mt-2 bg-blue-100 border-blue-300">
                      <Info className="h-4 w-4 text-blue-700" />
                      <AlertDescription className="text-xs text-blue-800">
                        <strong>Note:</strong> The available balance in your broker wallet must cover the margin for this new bot, plus the total margin required for any other bots you have already deployed.
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Unable to fetch your wallet balance. Please check your broker connection.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Broker Selection */}
                <div className="space-y-2">
                  <Label htmlFor="broker">Trading Account:</Label>
                  <Select value={selectedCredentialId} onValueChange={setSelectedCredentialId}>
                    <SelectTrigger id="broker">
                      <SelectValue placeholder="Select trading account" />
                    </SelectTrigger>
                    <SelectContent>
                      {brokerCredentials.map((credential) => (
                        <SelectItem key={credential.id} value={credential.id}>
                          {credential.brokerName} (CoinDCX)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Investment Amount */}
                <div className="space-y-2">
                  <Label htmlFor="capital">Investment Amount (₹):</Label>
                  <Input
                    id="capital"
                    type="text"
                    value={capital}
                    onChange={(e) => handleCapitalChange(e.target.value)}
                    onBlur={() => validateCapital(capital)}
                    placeholder="Enter amount"
                    className={validationErrors.capital ? 'border-red-500 text-lg font-semibold' : 'text-lg font-semibold'}
                  />
                  {validationErrors.capital ? (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {validationErrors.capital}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Minimum required: ₹{minMargin.toLocaleString()}</p>
                  )}
                </div>

                {/* Advanced Settings Toggle */}
                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="advanced-settings" className="text-sm font-semibold cursor-pointer">
                        Advanced Settings
                      </Label>
                      <span className="text-xs text-muted-foreground">(Optional)</span>
                    </div>
                    <Switch
                      id="advanced-settings"
                      checked={showAdvancedSettings}
                      onCheckedChange={setShowAdvancedSettings}
                    />
                  </div>

                  {showAdvancedSettings && (
                    <div className="space-y-4 p-4 bg-gray-50 border border-gray-200 rounded-lg animate-in slide-in-from-top">
                      <Alert className="bg-yellow-50 border-yellow-300">
                        <Info className="h-4 w-4 text-yellow-700" />
                        <AlertDescription className="text-xs text-yellow-800">
                          <strong>Warning:</strong> Modifying these settings will override the strategy&apos;s default configuration. Only change these if you understand the risks.
                        </AlertDescription>
                      </Alert>

                      {/* Leverage */}
                      <div className="space-y-2">
                        <Label htmlFor="leverage" className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          Leverage (X):
                        </Label>
                        <Input
                          id="leverage"
                          type="text"
                          value={leverage}
                          onChange={(e) => handleLeverageChange(e.target.value)}
                          placeholder={`Leave empty to use strategy default (${strategyDefaultLeverage}x)`}
                          className={validationErrors.leverage ? 'border-red-500' : ''}
                        />
                        {validationErrors.leverage ? (
                          <p className="text-sm text-red-500 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {validationErrors.leverage}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Range: 1-100x. Strategy default: {strategyDefaultLeverage}x</p>
                        )}
                      </div>

                      {/* Risk Per Trade */}
                      <div className="space-y-2">
                        <Label htmlFor="riskPerTrade" className="flex items-center gap-2">
                          <Percent className="h-4 w-4" />
                          Risk Per Trade (0.01 to 0.55):
                        </Label>
                        <Input
                          id="riskPerTrade"
                          type="text"
                          value={riskPerTrade}
                          onChange={(e) => handleRiskPerTradeChange(e.target.value)}
                          placeholder={`Leave empty to use strategy default (${strategyDefaultRisk})`}
                          className={validationErrors.riskPerTrade ? 'border-red-500' : ''}
                        />
                        {validationErrors.riskPerTrade ? (
                          <p className="text-sm text-red-500 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {validationErrors.riskPerTrade}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Range: 0.01-0.55. Strategy default: {strategyDefaultRisk} ({(strategyDefaultRisk * 100).toFixed(0)}%)
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('overview')}
                disabled={loading}
                className="flex-1"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleSubscribe}
                disabled={loading || loadingCredentials || loadingBalance || loadingSubscriptions || brokerCredentials.length === 0 || availableBalance === null}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deploying Bot...
                  </>
                ) : (
                  <>
                    <Target className="mr-2 h-4 w-4" />
                    Deploy Bot
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
