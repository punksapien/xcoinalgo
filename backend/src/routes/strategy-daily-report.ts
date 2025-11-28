/**
 * Strategy Daily Report Routes - Generate daily analytics from strategy logs
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
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

      // Execute Python analyzer with --log flag
      logger.info(`Running log analyzer on ${logPath}`);

      const pythonProcess = spawn('python3', [analyzerScript, '--log', logPath], {
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
          // The Python script with --log flag outputs a formatted table to stdout
          // We need to parse it and convert to CSV

          // Check if output contains "No data found"
          if (stdout.includes('No data found in logs')) {
            return res.status(404).json({
              success: false,
              error: 'No trading data found in logs',
            });
          }

          // Parse the table output and extract data
          const lines = stdout.split('\n').filter(line => line.trim());

          // Find the header and separator lines
          let headerIndex = -1;
          let separatorIndex = -1;

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Date') && lines[i].includes('Bot Signals')) {
              headerIndex = i;
              separatorIndex = i + 1;
              break;
            }
          }

          if (headerIndex === -1) {
            logger.error('Could not find header in output');
            return res.status(500).json({
              success: false,
              error: 'Invalid output format from analyzer',
            });
          }

          // Extract headers
          const headers = lines[headerIndex]
            .split('|')
            .map(h => h.trim())
            .filter(h => h);

          // Extract data rows (skip header, separator, and summary)
          const dataRows = [];
          for (let i = separatorIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            // Stop if we hit the summary line
            if (line.includes('Summary:')) break;
            if (!line.includes('|')) continue;

            const values = line.split('|').map(v => v.trim()).filter(v => v);
            if (values.length === headers.length) {
              dataRows.push(values);
            }
          }

          if (dataRows.length === 0) {
            return res.status(404).json({
              success: false,
              error: 'No trading data found in logs',
            });
          }

          // Convert to CSV
          const csvRows = [
            headers.join(','),
            ...dataRows.map(row =>
              row.map(value => {
                // Escape commas and quotes
                if (value.includes(',') || value.includes('"')) {
                  return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
              }).join(',')
            )
          ];

          const csv = csvRows.join('\n');

          // Get strategy code from path for filename
          const filename = `strategy_${strategyId}_daily_report_${new Date().toISOString().split('T')[0]}.csv`;

          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(csv);

          logger.info(`Daily report generated successfully for strategy ${strategyId}: ${dataRows.length} days`);

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
