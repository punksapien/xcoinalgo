'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/lib/auth';
import { showErrorToast, showSuccessToast } from '@/lib/toast-utils';
import {
  Upload,
  FileCode,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  TrendingUp,
  Target,
  Clock
} from "lucide-react";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detected: {
    liveTrader: boolean;
    backtester: boolean;
    generateSignals: boolean;
  };
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

      // Client-side validation
      const detected = {
        liveTrader: code.includes('class LiveTrader'),
        backtester: code.includes('class Backtester'),
        generateSignals: code.includes('def generate_signals_from_strategy'),
      };

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!detected.liveTrader) {
        errors.push('Strategy must contain "class LiveTrader"');
      }

      if (!detected.generateSignals) {
        errors.push('Strategy must contain "def generate_signals_from_strategy(df, params)"');
      }

      if (!detected.backtester) {
        warnings.push('No Backtester class found - backtest will be skipped');
      }

      // Check for CoinDCXClient
      if (!code.includes('class CoinDCXClient')) {
        warnings.push('No CoinDCXClient class found - make sure your strategy is self-contained');
      }

      setValidation({
        isValid: errors.length === 0,
        errors,
        warnings,
        detected,
      });

    } catch (error) {
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

    try {
      const formData = new FormData();
      formData.append('strategyFile', file);
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

      setUploadResult({
        success: true,
        strategyId: data.strategy.id,
        backtest: data.backtest,
        message: data.message,
      });

      showSuccessToast(
        'Strategy Uploaded!',
        data.backtest
          ? `Backtest complete: ${data.backtest.winRate.toFixed(1)}% win rate, ${data.backtest.totalTrades} trades`
          : 'Strategy uploaded successfully'
      );

      // Reset form
      setTimeout(() => {
        router.push(`/dashboard/strategy/${data.strategy.id}`);
      }, 2000);

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

      {/* Upload Result */}
      {uploadResult && (
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

                {uploadResult.backtest && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <div className="bg-secondary/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                      <p className="text-lg font-semibold text-green-500">
                        {uploadResult.backtest.winRate.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">ROI</p>
                      <p className="text-lg font-semibold text-green-500">
                        {uploadResult.backtest.roi.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Max DD</p>
                      <p className="text-lg font-semibold text-red-500">
                        {uploadResult.backtest.maxDrawdown.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-secondary/20 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Trades</p>
                      <p className="text-lg font-semibold">
                        {uploadResult.backtest.totalTrades}
                      </p>
                    </div>
                  </div>
                )}

                {uploadResult.success && uploadResult.strategyId && (
                  <Button
                    className="mt-4"
                    onClick={() => router.push(`/dashboard/strategy/${uploadResult.strategyId}`)}
                  >
                    View Strategy Details
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
              <Label htmlFor="file">Python Strategy File</Label>
              <div className="mt-2">
                <Input
                  id="file"
                  type="file"
                  accept=".py"
                  onChange={handleFileChange}
                  disabled={uploading}
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
                    <Badge variant={validation.detected.generateSignals ? "default" : "secondary"}>
                      {validation.detected.generateSignals ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      generate_signals_from_strategy
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
                        Validation passed! Ready to upload.
                      </p>
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
              disabled={uploading}
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
              disabled={uploading}
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
                disabled={uploading}
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
                disabled={uploading}
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
              disabled={uploading}
            />
          </div>

          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={config.tags}
              onChange={(e) => setConfig({ ...config, tags: e.target.value })}
              placeholder="e.g., momentum, scalping, high-frequency"
              disabled={uploading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/strategies')}
          disabled={uploading}
        >
          Cancel
        </Button>

        <Button
          onClick={handleUpload}
          disabled={!file || !validation?.isValid || uploading || !config.name.trim()}
          className="min-w-[150px]"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
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
                <li>• Must include <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">class LiveTrader</code> with check_for_new_signal method</li>
                <li>• Must include <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">def generate_signals_from_strategy(df, params)</code></li>
                <li>• Should include <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">class Backtester</code> with run() method for auto-backtesting</li>
                <li>• Must be self-contained (include CoinDCXClient if needed)</li>
                <li>• Will be stored in <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">strategies/</code> directory</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
