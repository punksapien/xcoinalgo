'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/lib/auth';
import { showErrorToast, showSuccessToast, showInfoToast } from '@/lib/toast-utils';
import { useBacktestProgress } from '@/hooks/useBacktestProgress';
import { BacktestProgressBar } from '@/components/BacktestProgressBar';
import {
  Upload,
  FileCode,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  TrendingUp
} from "lucide-react";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detected: {
    liveTrader: boolean;
    backtester: boolean;
    trader: boolean;
  };
  details?: {
    found_classes: string[];
    found_methods: { [key: string]: string[] };
    total_errors: number;
    total_warnings: number;
    classes_expected: number;
    classes_found: number;
  };
  summary?: string;
}

interface BacktestMetrics {
  winRate: number;
  roi: number;
  maxDrawdown: number;
  profitFactor: number;
  totalTrades: number;
}

export default function StrategyUploadPage() {
  const router = useRouter();
  const { token } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [requirementsFile, setRequirementsFile] = useState<File | null>(null);
  const [config, setConfig] = useState({
    name: '',
    description: '',
    pair: 'B-BTC_USDT',
    resolution: '5',
    author: '',
    tags: '',
  });

  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    strategyId?: string;
    backtest?: BacktestMetrics;
    message?: string;
  } | null>(null);
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null);
  const [backtestRunning, setBacktestRunning] = useState(false);

  // Use backtest progress hook
  const { progress, isConnected, eta, disconnect } = useBacktestProgress({
    strategyId: activeStrategyId,
    onComplete: (finalProgress) => {
      showSuccessToast(
        'Backtest Complete!',
        `${finalProgress.totalTrades} trades executed. Win Rate: ${finalProgress.metrics?.winRate?.toFixed(1)}%`
      );

      // Redirect to marketplace after a short delay
      setTimeout(() => {
        router.push('/strategies');
      }, 2000);
    },
    onError: (error) => {
      showErrorToast('Backtest Failed', error);
      setBacktestRunning(false);
    }
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.py')) {
      showErrorToast('Invalid File', 'Please upload a Python (.py) file');
      return;
    }

    setFile(selectedFile);
    setValidation(null);
    setUploadResult(null);

    // Auto-extract strategy name from filename if not set
    if (!config.name) {
      const name = selectedFile.name.replace('.py', '').replace(/_/g, ' ');
      setConfig(prev => ({ ...prev, name }));
    }

    // Auto-validate
    await validateStrategy(selectedFile);
  };

  const validateStrategy = async (fileToValidate: File) => {
    setValidating(true);
    try {
      const code = await fileToValidate.text();

      // Quick client-side check for basic components
      const detected = {
        liveTrader: code.includes('class LiveTrader'),
        backtester: code.includes('class Backtester'),
        trader: code.includes('class Trader'),
      };

      // Check if this is the new multi-tenant format
      const hasAllClasses = code.includes('class CoinDCXClient') &&
                            code.includes('class Trader') &&
                            code.includes('class LiveTrader') &&
                            code.includes('class Backtester');

      let errors: string[] = [];
      let warnings: string[] = [];
      let details = undefined;
      let summary = undefined;

      if (hasAllClasses) {
        // NEW FORMAT: Use backend structural validator
        try {
          const formData = new FormData();
          formData.append('strategyFile', fileToValidate);

          const response = await fetch('/api/strategy-upload/validate', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            errors = data.validation.errors || [];
            warnings = data.validation.warnings || [];
            details = data.validation.details;
            summary = data.validation.summary;
          } else {
            // Fallback to client-side if backend fails
            warnings.push('Backend validation unavailable, using basic checks');
          }
        } catch (err) {
          console.error('Backend validation failed:', err);
          warnings.push('Backend validation unavailable, using basic checks');
        }
      } else {
        // OLD FORMAT: Basic client-side checks
        if (!detected.liveTrader) {
          errors.push('Strategy must contain "class LiveTrader"');
        }

        if (!detected.trader) {
          errors.push('Strategy must contain "class Trader" with generate_signals method');
        }

        if (!detected.backtester) {
          warnings.push('No Backtester class found - backtest will be skipped');
        }

        // Check for CoinDCXClient
        if (!code.includes('class CoinDCXClient')) {
          warnings.push('No CoinDCXClient class found - make sure your strategy is self-contained');
        }

        // Check for hardcoded config.json (multi-tenant issue)
        if (code.includes("open('config.json'") || code.includes('open("config.json"')) {
          errors.push(
            'Strategy reads from config.json - this won\'t work for multiple subscribers. ' +
            'Use settings parameter instead: self.api_key = settings[\'api_key\']'
          );
        }

        // Check for hardcoded API keys
        if (code.match(/api_key\s*=\s*['"][^'"]+['"]/i) || code.match(/api_secret\s*=\s*['"][^'"]+['"]/i)) {
          errors.push(
            'Strategy contains hardcoded API keys. For multi-tenant support, ' +
            'accept keys from settings parameter: self.api_key = settings[\'api_key\']'
          );
        }

        // Check if strategy uses settings parameter
        if (detected.liveTrader && !code.includes('def __init__(self, settings') && !code.includes('def __init__(self,settings')) {
          warnings.push(
            'LiveTrader.__init__ should accept "settings" parameter for multi-tenant support. ' +
            'Example: def __init__(self, settings: dict)'
          );
        }
      }

      setValidation({
        isValid: errors.length === 0,
        errors,
        warnings,
        detected,
        details,
        summary,
      });

    } catch (_error) {
      showErrorToast('Validation Failed', 'Failed to read strategy file');
    } finally {
      setValidating(false);
    }
  };

  const handleUpload = async () => {
    if (!file || !token) return;

    if (!validation?.isValid) {
      showErrorToast('Validation Error', 'Please fix validation errors before uploading');
      return;
    }

    if (!config.name.trim()) {
      showErrorToast('Missing Name', 'Please provide a strategy name');
      return;
    }

    setUploading(true);
    setUploadResult(null);
    setBacktestRunning(false);

    try {
      // Show uploading toast
      showInfoToast('Uploading...', 'Uploading strategy file and creating environment');

      const formData = new FormData();
      formData.append('strategyFile', file);
      if (requirementsFile) {
        formData.append('requirementsFile', requirementsFile);
      }
      formData.append('config', JSON.stringify({
        name: config.name,
        description: config.description,
        pair: config.pair,
        resolution: config.resolution,
        author: config.author || 'Quant Team',
        tags: config.tags.split(',').map(t => t.trim()).filter(t => t),
      }));

      const response = await fetch('/api/strategy-upload/upload-simple', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      // Upload succeeded! Show success and start backtest tracking
      showSuccessToast(
        'Upload Complete!',
        data.message || 'Strategy uploaded successfully'
      );

      // Check if backtest is running
      const backtestStatus = data.backtest?.status;

      if (backtestStatus === 'running' && data.strategy.id) {
        // Start tracking backtest progress
        setActiveStrategyId(data.strategy.id);
        setBacktestRunning(true);
        showInfoToast('Running Backtest...', 'Backtest is running in background. Please wait...');
      } else {
        // No backtest or already complete
        setUploadResult({
          success: true,
          strategyId: data.strategy.id,
          message: data.message,
        });

        // Redirect to strategies page
        setTimeout(() => {
          router.push('/strategies');
        }, 2000);
      }

    } catch (error) {
      console.error('Upload failed:', error);
      showErrorToast(
        'Upload Failed',
        error instanceof Error ? error.message : 'Failed to upload strategy'
      );
      setUploadResult({
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Upload Strategy</h1>
        <p className="text-muted-foreground">
          Upload a self-contained Python strategy with LiveTrader and Backtester classes
        </p>
      </div>

      {/* Backtest Progress */}
      {backtestRunning && progress && (
        <Card className="border-blue-500 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Running Backtest
            </CardTitle>
            <CardDescription>
              Testing strategy performance on historical data...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BacktestProgressBar progress={progress} eta={eta} />
            {isConnected && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                <span>Live updates connected</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upload Result (only show if not backtesting) */}
      {uploadResult && !backtestRunning && (
        <Card className={uploadResult.success ? 'border-green-500 mb-6' : 'border-red-500 mb-6'}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {uploadResult.success ? (
                <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h3 className="font-semibold mb-1">
                  {uploadResult.success ? 'Strategy Uploaded Successfully!' : 'Upload Failed'}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {uploadResult.message}
                </p>

                {uploadResult.success && uploadResult.strategyId && (
                  <Button
                    className="mt-4"
                    onClick={() => router.push(`/strategies`)}
                  >
                    View in Marketplace
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Upload */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            Strategy File
          </CardTitle>
          <CardDescription>
            Upload your Python (.py) file containing LiveTrader and Backtester classes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="file">Python Strategy File *</Label>
              <div className="mt-2">
                <Input
                  id="file"
                  type="file"
                  accept=".py"
                  onChange={handleFileChange}
                  disabled={uploading || backtestRunning}
                  className="cursor-pointer"
                />
              </div>
              {file && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <FileCode className="h-4 w-4" />
                  <span>{file.name}</span>
                  <span>({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="requirements">requirements.txt (Optional)</Label>
              <div className="mt-2">
                <Input
                  id="requirements"
                  type="file"
                  accept=".txt"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile && selectedFile.name === 'requirements.txt') {
                      setRequirementsFile(selectedFile);
                    } else if (selectedFile) {
                      showErrorToast('Invalid File', 'Please upload a file named requirements.txt');
                      e.target.value = '';
                    }
                  }}
                  disabled={uploading || backtestRunning}
                  className="cursor-pointer"
                />
              </div>
              {requirementsFile && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <FileCode className="h-4 w-4" />
                  <span>{requirementsFile.name}</span>
                  <span>({(requirementsFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                List Python packages required by your strategy. If not provided, defaults will be used.
              </p>
            </div>

            {/* Validation Status */}
            {validating && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Validating strategy...</span>
              </div>
            )}

            {validation && (
              <div className="space-y-3">
                {/* Detected Components */}
                <div>
                  <p className="text-sm font-medium mb-2">Detected Components:</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={validation.detected.liveTrader ? "default" : "secondary"}>
                      {validation.detected.liveTrader ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      LiveTrader
                    </Badge>
                    <Badge variant={validation.detected.backtester ? "default" : "secondary"}>
                      {validation.detected.backtester ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      Backtester
                    </Badge>
                    <Badge variant={validation.detected.trader ? "default" : "secondary"}>
                      {validation.detected.trader ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      Trader
                    </Badge>
                  </div>
                </div>

                {/* Errors */}
                {validation.errors.length > 0 && (
                  <div className="border border-red-500 rounded-lg p-3 bg-red-50 dark:bg-red-900/10">
                    <div className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
                          Validation Errors:
                        </p>
                        <ul className="text-sm text-red-600 dark:text-red-300 space-y-1">
                          {validation.errors.map((error, idx) => (
                            <li key={idx}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {validation.warnings.length > 0 && (
                  <div className="border border-yellow-500 rounded-lg p-3 bg-yellow-50 dark:bg-yellow-900/10">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                          Warnings:
                        </p>
                        <ul className="text-sm text-yellow-600 dark:text-yellow-300 space-y-1">
                          {validation.warnings.map((warning, idx) => (
                            <li key={idx}>• {warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Success */}
                {validation.isValid && validation.errors.length === 0 && (
                  <div className="border border-green-500 rounded-lg p-3 bg-green-50 dark:bg-green-900/10">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {validation.summary || 'Validation passed! Ready to upload.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Detailed Structural Validation Results */}
                {validation.details && (
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <p className="text-sm font-semibold mb-3">Structural Validation Details:</p>

                    <div className="space-y-3">
                      <div className="text-sm">
                        <p className="text-muted-foreground mb-1">
                          Found {validation.details.classes_found} of {validation.details.classes_expected} required classes
                        </p>

                        {validation.details.found_classes.length > 0 && (
                          <div className="mt-2">
                            <p className="font-medium mb-1">Classes Found:</p>
                            <div className="flex flex-wrap gap-1">
                              {validation.details.found_classes.map((cls) => (
                                <Badge key={cls} variant="outline" className="text-xs">
                                  {cls}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {validation.details.found_methods && Object.keys(validation.details.found_methods).length > 0 && (
                          <div className="mt-3 max-h-40 overflow-y-auto">
                            <p className="font-medium mb-1">Methods by Class:</p>
                            {Object.entries(validation.details.found_methods).map(([className, methods]) => (
                              <div key={className} className="mb-2">
                                <p className="text-xs font-medium text-muted-foreground">{className}:</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {methods.slice(0, 5).map((method) => (
                                    <Badge key={method} variant="secondary" className="text-xs">
                                      {method}()
                                    </Badge>
                                  ))}
                                  {methods.length > 5 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{methods.length - 5} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Strategy Configuration</CardTitle>
          <CardDescription>
            Provide details about your strategy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">Strategy Name *</Label>
            <Input
              id="name"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              placeholder="e.g., SOL Momentum Strategy"
              disabled={uploading || backtestRunning}
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={config.description}
              onChange={(e) => setConfig({ ...config, description: e.target.value })}
              placeholder="Brief description of your strategy..."
              rows={3}
              disabled={uploading || backtestRunning}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pair">Trading Pair</Label>
              <Input
                id="pair"
                value={config.pair}
                onChange={(e) => setConfig({ ...config, pair: e.target.value })}
                placeholder="e.g., B-BTC_USDT"
                disabled={uploading || backtestRunning}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Format: B-SYMBOL_USDT for futures
              </p>
            </div>

            <div>
              <Label htmlFor="resolution">Resolution (minutes)</Label>
              <Input
                id="resolution"
                value={config.resolution}
                onChange={(e) => setConfig({ ...config, resolution: e.target.value })}
                placeholder="e.g., 5"
                disabled={uploading || backtestRunning}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Common: 1, 5, 15, 30, 60
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              value={config.author}
              onChange={(e) => setConfig({ ...config, author: e.target.value })}
              placeholder="Your name or team"
              disabled={uploading || backtestRunning}
            />
          </div>

          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={config.tags}
              onChange={(e) => setConfig({ ...config, tags: e.target.value })}
              placeholder="e.g., momentum, scalping, high-frequency"
              disabled={uploading || backtestRunning}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => router.push('/strategies')}
          disabled={uploading || backtestRunning}
        >
          Cancel
        </Button>

        <Button
          onClick={handleUpload}
          disabled={!file || !validation?.isValid || uploading || backtestRunning || !config.name.trim()}
          className="min-w-[150px]"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : backtestRunning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Backtesting...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload Strategy
            </>
          )}
        </Button>
      </div>

      {/* Info Box */}
      <Card className="mt-6 border-blue-500 bg-blue-50 dark:bg-blue-900/10">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-700 dark:text-blue-400 mb-2">
                Strategy Requirements:
              </p>
              <ul className="text-blue-600 dark:text-blue-300 space-y-1">
                <li>• Must include <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">class Trader</code> with generate_signals(df, params) method</li>
                <li>• Must include <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">class LiveTrader(Trader)</code> with check_for_new_signal method</li>
                <li>• Should include <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">class Backtester(Trader)</code> for auto-backtesting</li>
                <li>• Must be self-contained (include CoinDCXClient if needed)</li>
                <li>• Upload <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">requirements.txt</code> to specify Python packages and version</li>
                <li>• Strategies run in isolated uv environments for reproducibility</li>
                <li>• Will be stored in <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">strategies/</code> directory</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
