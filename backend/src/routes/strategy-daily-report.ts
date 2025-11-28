/**
 * Strategy Daily Report Routes - Generate daily analytics from strategy logs
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import prisma from '../utils/database';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const logger = new Logger('StrategyDailyReport');
const router = Router();

/**
 * GET /strategies/:strategyId/daily-report
 * Generate daily report CSV from trading bot logs
 */
router.get(
  '/:strategyId/daily-report',
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    const { strategyId } = req.params;
    const userId = req.userId!;

    try {
      logger.info(`Generating daily report for strategy ${strategyId} by user ${userId}`);

      // Verify strategy exists and user has access
      const strategy = await prisma.strategy.findUnique({
        where: { id: strategyId },
        select: {
          id: true,
          code: true,
          name: true,
          userId: true,
          isPublic: true,
        },
      });

      if (!strategy) {
        return res.status(404).json({
          success: false,
          error: 'Strategy not found',
        });
      }

      // Check access: owner or public strategy
      if (strategy.userId !== userId && !strategy.isPublic) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to access this strategy',
        });
      }

      // Path to trading bot logs
      const logPath = path.join(
        __dirname,
        '../../strategies',
        strategyId,
        'logs',
        'trading_bot.log'
      );

      // Check if log file exists
      if (!fs.existsSync(logPath)) {
        return res.status(404).json({
          success: false,
          error: 'No trading logs found for this strategy. The strategy may not have been executed yet.',
        });
      }

      // Path to Python analyzer script
      const analyzerScript = path.join(__dirname, '../../python/log_analyzer.py');

      if (!fs.existsSync(analyzerScript)) {
        logger.error(`Log analyzer script not found: ${analyzerScript}`);
        return res.status(500).json({
          success: false,
          error: 'Log analyzer script not found on server',
        });
      }

      // Execute Python analyzer
      logger.info(`Running log analyzer on ${logPath}`);

      const pythonProcess = spawn('python3', [analyzerScript, logPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
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
          logger.error(`Python analyzer failed with code ${code}: ${stderr}`);
          return res.status(500).json({
            success: false,
            error: 'Failed to analyze logs',
            details: stderr,
          });
        }

        try {
          // Parse JSON output from Python script
          const results = JSON.parse(stdout);

          // Check if error was returned from Python
          if (results.error) {
            logger.error(`Analyzer error: ${results.error}`);
            return res.status(500).json({
              success: false,
              error: results.error,
            });
          }

          // Check if we have data
          if (!Array.isArray(results) || results.length === 0) {
            return res.status(404).json({
              success: false,
              error: 'No trading data found in logs (or all data is from today)',
            });
          }

          // Convert to CSV
          const headers = Object.keys(results[0]);
          const csvRows = [
            headers.join(','),
            ...results.map((row: any) =>
              headers.map((header) => {
                const value = row[header];
                // Escape commas and quotes in CSV
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                  return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
              }).join(',')
            ),
          ];

          const csv = csvRows.join('\n');

          // Set CSV headers
          const filename = `strategy_${strategy.code}_daily_report_${new Date().toISOString().split('T')[0]}.csv`;

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(csv);

          logger.info(`Daily report generated successfully for strategy ${strategyId}: ${results.length} days`);

        } catch (parseError: any) {
          logger.error(`Failed to parse Python output: ${parseError.message}`);
          logger.error(`Python stdout: ${stdout}`);
          return res.status(500).json({
            success: false,
            error: 'Failed to parse analysis results',
            details: parseError.message,
          });
        }
      });

      pythonProcess.on('error', (error) => {
        logger.error(`Failed to spawn Python process: ${error.message}`);
        return res.status(500).json({
          success: false,
          error: 'Failed to execute log analyzer',
          details: error.message,
        });
      });

    } catch (error: any) {
      logger.error(`Error generating daily report: ${error.message}`, error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error while generating report',
        details: error.message,
      });
    }
  }
);

export default router;
