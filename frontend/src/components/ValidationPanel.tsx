'use client';

import React from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react';

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface ValidationResult {
  valid: boolean;
  syntaxErrors: ValidationIssue[];
  warnings: ValidationIssue[];
  dangerousImports: ValidationIssue[];
  info: ValidationIssue[];
  codeStats?: {
    lines: number;
    classes: number;
    functions: number;
    imports: number;
    complexity_score?: number;
  };
}

interface ValidationPanelProps {
  result: ValidationResult | null;
  isValidating: boolean;
  onJumpToLine?: (line: number) => void;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  result,
  isValidating,
  onJumpToLine
}) => {
  if (isValidating) {
    return (
      <div className="border border-gray-700 rounded-lg bg-gray-900 p-4">
        <div className="flex items-center gap-2 text-blue-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400" />
          <span className="text-sm font-medium">Validating code...</span>
        </div>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const allIssues = [
    ...result.syntaxErrors,
    ...result.dangerousImports,
    ...result.warnings,
    ...result.info
  ];

  const errorCount = result.syntaxErrors.length + result.dangerousImports.length;
  const warningCount = result.warnings.length;
  const infoCount = result.info.length;

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
      case 'info':
        return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'border-red-500 bg-red-500/10';
      case 'warning':
        return 'border-yellow-500 bg-yellow-500/10';
      case 'info':
        return 'border-blue-500 bg-blue-500/10';
      default:
        return 'border-gray-500 bg-gray-500/10';
    }
  };

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 border-b flex items-center justify-between ${
        result.valid && errorCount === 0
          ? 'bg-green-900/20 border-green-700'
          : 'bg-gray-800 border-gray-700'
      }`}>
        <div className="flex items-center gap-2">
          {result.valid && errorCount === 0 ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="font-medium text-green-400">Validation Passed</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="font-medium text-red-400">Validation Failed</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm">
          {errorCount > 0 && (
            <span className="text-red-400 font-medium">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-yellow-400 font-medium">
              {warningCount} warning{warningCount !== 1 ? 's' : ''}
            </span>
          )}
          {infoCount > 0 && (
            <span className="text-blue-400 font-medium">
              {infoCount} info
            </span>
          )}
        </div>
      </div>

      {/* Code Stats */}
      {result.codeStats && allIssues.length === 0 && (
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-6 text-xs text-gray-400">
            <span>{result.codeStats.lines} lines</span>
            <span>{result.codeStats.classes} classes</span>
            <span>{result.codeStats.functions} functions</span>
            <span>{result.codeStats.imports} imports</span>
          </div>
        </div>
      )}

      {/* Issues List */}
      {allIssues.length > 0 && (
        <div className="max-h-[400px] overflow-y-auto">
          {allIssues.map((issue, index) => (
            <div
              key={index}
              className={`px-4 py-3 border-b border-gray-700 hover:bg-gray-800/50 transition-colors ${
                issue.line && onJumpToLine ? 'cursor-pointer' : ''
              }`}
              onClick={() => {
                if (issue.line && onJumpToLine) {
                  onJumpToLine(issue.line);
                }
              }}
            >
              <div className="flex items-start gap-3">
                {getSeverityIcon(issue.severity)}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {issue.line && (
                      <span className="text-xs font-mono text-gray-500">
                        Line {issue.line}{issue.column ? `:${issue.column}` : ''}
                      </span>
                    )}
                    {issue.code && (
                      <span className={`text-xs px-2 py-0.5 rounded border ${getSeverityColor(issue.severity)}`}>
                        {issue.code}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-200 break-words">
                    {issue.message}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {allIssues.length === 0 && result.valid && (
        <div className="px-4 py-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No issues found</p>
          {result.codeStats && (
            <div className="mt-4 flex justify-center gap-6 text-xs text-gray-500">
              <span>{result.codeStats.lines} lines</span>
              <span>{result.codeStats.classes} classes</span>
              <span>{result.codeStats.functions} functions</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ValidationPanel;
