/**
 * Strategy Structure Validator Service
 *
 * Validates that uploaded strategy files contain all required classes and methods.
 * Uses Python AST parser to check structural integrity without caring about logic.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { Logger } from '../utils/logger';

const logger = new Logger('StrategyStructureValidator');

export interface ValidationError {
  class_name: string | null;
  method_name: string | null;
  error_type: string;
  message: string;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  found_classes: string[];
  found_methods: { [className: string]: string[] };
  summary: {
    total_errors: number;
    total_warnings: number;
    classes_found: number;
    classes_expected: number;
  };
}

export class StrategyStructureValidatorService {
  private validatorScriptPath: string;

  constructor() {
    this.validatorScriptPath = path.join(
      __dirname,
      '../../python/strategy_structure_validator.py'
    );
  }

  /**
   * Validate strategy structure
   *
   * @param code - Python strategy code to validate
   * @returns Validation result with errors and warnings
   */
  async validate(code: string): Promise<ValidationResult> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [this.validatorScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          logger.error(`Validation process failed with code ${code}`);
          logger.error(`Stderr: ${stderr}`);
          return reject(new Error(`Validation process failed: ${stderr}`));
        }

        try {
          const result: ValidationResult = JSON.parse(stdout);
          resolve(result);
        } catch (parseError) {
          logger.error('Failed to parse validation result:', parseError);
          logger.error('Stdout:', stdout);
          reject(new Error('Failed to parse validation result'));
        }
      });

      pythonProcess.on('error', (error) => {
        logger.error('Failed to start validation process:', error);
        reject(error);
      });

      // Send strategy code to validator via stdin
      pythonProcess.stdin.write(code);
      pythonProcess.stdin.end();

      // Timeout after 30 seconds
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Validation timeout (30 seconds)'));
      }, 30000);
    });
  }

  /**
   * Format validation errors for user-friendly display
   *
   * @param result - Validation result
   * @returns Formatted error messages
   */
  formatErrors(result: ValidationResult): string[] {
    const formatted: string[] = [];

    // Group errors by type
    const errorsByType: { [type: string]: ValidationError[] } = {};

    for (const error of result.errors) {
      if (!errorsByType[error.error_type]) {
        errorsByType[error.error_type] = [];
      }
      errorsByType[error.error_type].push(error);
    }

    // Format each error type
    for (const [errorType, errors] of Object.entries(errorsByType)) {
      if (errorType === 'MISSING_CLASS') {
        const missingClasses = errors.map(e => e.class_name).filter(Boolean);
        formatted.push(`Missing required classes: ${missingClasses.join(', ')}`);
      } else if (errorType === 'MISSING_METHOD') {
        for (const error of errors) {
          formatted.push(`Class '${error.class_name}' is missing method '${error.method_name}'`);
        }
      } else if (errorType === 'MISSING_INHERITANCE') {
        for (const error of errors) {
          formatted.push(error.message);
        }
      } else if (errorType === 'SIGNATURE_MISMATCH') {
        for (const error of errors) {
          formatted.push(error.message);
        }
      } else {
        for (const error of errors) {
          formatted.push(error.message);
        }
      }
    }

    return formatted;
  }

  /**
   * Get a summary report of validation
   *
   * @param result - Validation result
   * @returns Human-readable summary
   */
  getSummary(result: ValidationResult): string {
    if (result.is_valid) {
      return `✅ Strategy structure is valid. Found ${result.found_classes.length} classes with all required methods.`;
    }

    const summary = [
      `❌ Strategy structure validation failed:`,
      `  - Found ${result.summary.classes_found} of ${result.summary.classes_expected} required classes`,
      `  - ${result.summary.total_errors} structural error(s)`,
    ];

    if (result.summary.total_warnings > 0) {
      summary.push(`  - ${result.summary.total_warnings} warning(s)`);
    }

    return summary.join('\n');
  }

  /**
   * Quick validation check - returns boolean
   *
   * @param code - Python strategy code
   * @returns True if valid, false otherwise
   */
  async isValid(code: string): Promise<boolean> {
    try {
      const result = await this.validate(code);
      return result.is_valid;
    } catch (error) {
      logger.error('Validation check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const strategyStructureValidator = new StrategyStructureValidatorService();
