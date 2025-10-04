'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, CheckCircle, AlertCircle, Code, Play } from "lucide-react";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedMemory?: number;
  estimatedCpu?: number;
}

export default function StrategyUploadPage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    config: JSON.stringify({
      name: '',
      code: '',
      author: '',
      pair: 'BTC_USDT',
      leverage: 10,
      risk_per_trade: 0.01,
      resolution: '5',
      lookback_period: 200,
      sl_atr_multiplier: 2.0,
      tp_atr_multiplier: 2.5,
      max_positions: 1,
      max_daily_loss: 0.05
    }, null, 2)
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.py')) {
        setSelectedFile(file);
        setUploadStatus('idle');
      } else {
        setUploadStatus('error');
        setMessage('Please select a Python (.py) file');
      }
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedFile) {
      setUploadStatus('error');
      setMessage('Please select a strategy file');
      return;
    }

    // Validate JSON config
    try {
      JSON.parse(formData.config);
    } catch {
      setUploadStatus('error');
      setMessage('Invalid JSON configuration');
      return;
    }

    setIsUploading(true);
    setUploadStatus('idle');

    try {
      const form = new FormData();
      form.append('strategyFile', selectedFile);
      form.append('name', formData.name);
      form.append('description', formData.description);
      form.append('config', formData.config);

      const response = await fetch('/api/strategy-upload/upload', {
        method: 'POST',
        body: form,
      });

      const result = await response.json();

      if (response.ok) {
        setUploadStatus('success');
        setMessage(`Strategy "${result.strategy.name}" uploaded successfully!`);
        setValidationResult(result.validation);

        // Redirect to strategy details after 2 seconds
        setTimeout(() => {
          router.push(`/dashboard/strategies/${result.strategy.id}`);
        }, 2000);
      } else {
        setUploadStatus('error');
        setMessage(result.error || 'Upload failed');
        setValidationResult(null);
      }
    } catch (error) {
      setUploadStatus('error');
      setMessage('Network error occurred');
      setValidationResult(null);
    } finally {
      setIsUploading(false);
    }
  };

  const updateConfigField = (field: string, value: any) => {
    try {
      const config = JSON.parse(formData.config);
      config[field] = value;
      setFormData(prev => ({
        ...prev,
        config: JSON.stringify(config, null, 2)
      }));
    } catch {
      // Invalid JSON, ignore update
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Upload Strategy</h1>
        <p className="text-gray-600">
          Upload your Python trading strategy built with the crypto-strategy-sdk
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Strategy Upload
              </CardTitle>
              <CardDescription>
                Upload your .py file and configure deployment settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Strategy Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, name: e.target.value }));
                        updateConfigField('name', e.target.value);
                      }}
                      placeholder="e.g., SMA Crossover Strategy"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe your strategy..."
                      rows={3}
                    />
                  </div>
                </div>

                {/* File Upload */}
                <div>
                  <Label htmlFor="file">Strategy File *</Label>
                  <div className="mt-2">
                    <div className="flex items-center justify-center w-full">
                      <label
                        htmlFor="file"
                        className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          {selectedFile ? (
                            <>
                              <FileText className="w-8 h-8 mb-2 text-green-500" />
                              <p className="text-sm text-gray-600 font-medium">
                                {selectedFile.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {(selectedFile.size / 1024).toFixed(1)} KB
                              </p>
                            </>
                          ) : (
                            <>
                              <Upload className="w-8 h-8 mb-2 text-gray-500" />
                              <p className="text-sm text-gray-600">
                                <span className="font-semibold">Click to upload</span> or drag and drop
                              </p>
                              <p className="text-xs text-gray-500">Python files (.py) only</p>
                            </>
                          )}
                        </div>
                        <input
                          id="file"
                          type="file"
                          accept=".py"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Quick Config */}
                <div className="space-y-4">
                  <Label>Quick Configuration</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="author">Author</Label>
                      <Input
                        id="author"
                        placeholder="Your name"
                        onChange={(e) => updateConfigField('author', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="pair">Trading Pair</Label>
                      <Input
                        id="pair"
                        placeholder="BTC_USDT"
                        defaultValue="BTC_USDT"
                        onChange={(e) => updateConfigField('pair', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="leverage">Leverage</Label>
                      <Input
                        id="leverage"
                        type="number"
                        min="1"
                        max="100"
                        defaultValue="10"
                        onChange={(e) => updateConfigField('leverage', parseInt(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="risk">Risk Per Trade</Label>
                      <Input
                        id="risk"
                        type="number"
                        step="0.001"
                        min="0.001"
                        max="0.1"
                        defaultValue="0.01"
                        onChange={(e) => updateConfigField('risk_per_trade', parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                </div>

                {/* Advanced Config JSON */}
                <div>
                  <Label htmlFor="config">Advanced Configuration (JSON)</Label>
                  <Textarea
                    id="config"
                    value={formData.config}
                    onChange={(e) => setFormData(prev => ({ ...prev, config: e.target.value }))}
                    rows={10}
                    className="font-mono text-sm"
                    placeholder="Strategy configuration in JSON format..."
                  />
                </div>

                {/* Status Messages */}
                {uploadStatus === 'success' && (
                  <Alert className="border-green-200 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      {message}
                    </AlertDescription>
                  </Alert>
                )}

                {uploadStatus === 'error' && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      {message}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Validation Results */}
                {validationResult && (
                  <div className="space-y-3">
                    {validationResult.errors.length > 0 && (
                      <Alert className="border-red-200 bg-red-50">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <AlertDescription>
                          <div className="font-medium text-red-800 mb-1">Validation Errors:</div>
                          <ul className="list-disc list-inside space-y-1 text-red-700">
                            {validationResult.errors.map((error, index) => (
                              <li key={index} className="text-sm">{error}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    {validationResult.warnings.length > 0 && (
                      <Alert className="border-yellow-200 bg-yellow-50">
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <AlertDescription>
                          <div className="font-medium text-yellow-800 mb-1">Warnings:</div>
                          <ul className="list-disc list-inside space-y-1 text-yellow-700">
                            {validationResult.warnings.map((warning, index) => (
                              <li key={index} className="text-sm">{warning}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isUploading || !selectedFile}
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Strategy
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Help Panel */}
        <div className="space-y-6">
          {/* Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Python (.py) file</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Inherits from BaseStrategy</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Implements generate_signals()</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Maximum file size: 5MB</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Example Code */}
          <Card>
            <CardHeader>
              <CardTitle>Example Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto">
{`from crypto_strategy_sdk import BaseStrategy

class MyStrategy(BaseStrategy):
    def initialize(self):
        self.sma_fast = 10
        self.sma_slow = 20

    def generate_signals(self, df):
        df['sma_fast'] = self.indicators.sma(df, self.sma_fast)
        df['sma_slow'] = self.indicators.sma(df, self.sma_slow)

        latest = df.iloc[-1]
        if latest['sma_fast'] > latest['sma_slow']:
            return {'signal': 'LONG', 'confidence': 0.8}
        return {'signal': 'HOLD', 'confidence': 0.0}`}
              </pre>
            </CardContent>
          </Card>

          {/* Next Steps */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="h-5 w-5" />
                After Upload
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm space-y-2">
                <div>1. Strategy will be validated</div>
                <div>2. Review validation results</div>
                <div>3. Deploy to trading environment</div>
                <div>4. Monitor performance</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}