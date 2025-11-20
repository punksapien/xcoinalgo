'use client';

import React from 'react';
import { CheckCircle2, XCircle, Clock, Cpu, HardDrive, AlertTriangle } from 'lucide-react';

export interface SandboxValidationResult {
  success: boolean;
  errors: Array<{
    severity: string;
    message: string;
    details?: string;
    traceback?: string;
  }>;
  warnings: Array<{
    severity: string;
    message: string;
  }>;
  info: Array<{
    message: string;
  }>;
  classesFound: string[];
  methodsFound: Record<string, string[]>;
  executionTime: number;
  timedOut: boolean;
  resourceUsage?: {
    memoryUsedMB: number;
    cpuPercent: number;
  };
}

interface SandboxOutputPanelProps {
  result: SandboxValidationResult | null;
  isRunning: boolean;
}

export const SandboxOutputPanel: React.FC<SandboxOutputPanelProps> = ({
  result,
  isRunning
}) => {
  if (isRunning) {
    return (
      <div className="border border-gray-700 rounded-lg bg-gray-900 p-6">
        <div className="flex flex-col items-center gap-3 text-blue-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
          <div className="text-center">
            <p className="text-sm font-medium mb-1">Running in Sandbox...</p>
            <p className="text-xs text-gray-400">Executing code in isolated Docker container</p>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 border-b flex items-center justify-between ${
        result.success && !result.timedOut
          ? 'bg-green-900/20 border-green-700'
          : 'bg-red-900/20 border-red-700'
      }`}>
        <div className="flex items-center gap-2">
          {result.success && !result.timedOut ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="font-medium text-green-400">Sandbox Execution Successful</span>
            </>
          ) : result.timedOut ? (
            <>
              <Clock className="w-5 h-5 text-yellow-500" />
              <span className="font-medium text-yellow-400">Execution Timed Out</span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="font-medium text-red-400">Execution Failed</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {result.executionTime}ms
          </span>
          {result.resourceUsage && (
            <>
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                {result.resourceUsage.memoryUsedMB}MB
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                {result.resourceUsage.cpuPercent}%
              </span>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Errors */}
        {result.errors.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Errors ({result.errors.length})
            </h4>
            <div className="space-y-2">
              {result.errors.map((error, index) => (
                <div key={index} className="bg-red-900/10 border border-red-700/50 rounded p-3">
                  <p className="text-sm text-red-300 font-medium">{error.message}</p>
                  {error.details && (
                    <pre className="mt-2 text-xs text-gray-400 font-mono overflow-x-auto">
                      {error.details}
                    </pre>
                  )}
                  {error.traceback && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                        Show traceback
                      </summary>
                      <pre className="mt-2 text-xs text-gray-400 font-mono overflow-x-auto">
                        {error.traceback}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-yellow-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Warnings ({result.warnings.length})
            </h4>
            <div className="space-y-2">
              {result.warnings.map((warning, index) => (
                <div key={index} className="bg-yellow-900/10 border border-yellow-700/50 rounded p-3">
                  <p className="text-sm text-yellow-300">{warning.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Classes Found */}
        {result.classesFound.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-blue-400">
              Classes Found ({result.classesFound.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {result.classesFound.map((className) => (
                <div key={className} className="bg-blue-900/10 border border-blue-700/50 rounded p-3">
                  <p className="text-sm font-mono text-blue-300 font-semibold mb-2">
                    {className}
                  </p>
                  {result.methodsFound[className] && result.methodsFound[className].length > 0 && (
                    <div className="text-xs text-gray-400">
                      <p className="mb-1">Methods ({result.methodsFound[className].length}):</p>
                      <div className="flex flex-wrap gap-1">
                        {result.methodsFound[className].slice(0, 5).map((method) => (
                          <span
                            key={method}
                            className="px-2 py-0.5 bg-gray-800 rounded text-gray-300 font-mono"
                          >
                            {method}()
                          </span>
                        ))}
                        {result.methodsFound[className].length > 5 && (
                          <span className="px-2 py-0.5 text-gray-500">
                            +{result.methodsFound[className].length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Messages */}
        {result.info.length > 0 && result.errors.length === 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-400">Information</h4>
            <div className="space-y-1">
              {result.info.map((info, index) => (
                <div key={index} className="text-sm text-gray-400">
                  • {info.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success Message */}
        {result.success && result.errors.length === 0 && result.warnings.length === 0 && (
          <div className="bg-green-900/10 border border-green-700/50 rounded p-4 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-green-400 font-medium">
              Strategy code executed successfully in sandbox
            </p>
            <p className="text-xs text-gray-400 mt-1">
              All required classes found and instantiable
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SandboxOutputPanel;
