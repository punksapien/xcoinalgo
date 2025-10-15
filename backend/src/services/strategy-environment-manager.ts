/**
 * Strategy Environment Manager
 * Manages isolated uv virtual environments for each strategy
 * Each strategy runs in its own Python 3.12.12 environment with fixed dependencies
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { logger } from '../utils/logger';

const exec = promisify(execCallback);

// Base directory for all strategy environments
const ENVIRONMENTS_BASE_DIR = process.env.STRATEGY_ENVIRONMENTS_DIR ||
  path.join(process.cwd(), 'strategy_environments');

// Path to requirements file (relative to this file: src/services -> ../../python)
const REQUIREMENTS_FILE = path.join(__dirname, '../../python/strategy_requirements.txt');

// Required Python version
const REQUIRED_PYTHON_VERSION = '3.12.12';

// UV binary path - try common locations
const UV_PATHS = [
  process.env.UV_PATH,
  '/home/ubuntu/.local/bin/uv',
  path.join(process.env.HOME || '', '.local', 'bin', 'uv'),
  'uv', // fallback to PATH
].filter(Boolean);

export interface EnvironmentInfo {
  strategyId: string;
  environmentPath: string;
  pythonPath: string;
  createdAt: Date;
  status: 'ready' | 'creating' | 'error';
}

export class StrategyEnvironmentManager {
  private environmentCache: Map<string, EnvironmentInfo> = new Map();
  private uvPath: string | null = null;

  constructor() {
    this.initializeBaseDirectory();
    this.findUvBinary();
  }

  /**
   * Find the uv binary in common locations
   */
  private async findUvBinary(): Promise<void> {
    for (const uvPath of UV_PATHS) {
      try {
        const { stdout } = await exec(`${uvPath} --version`);
        logger.info(`Found uv at: ${uvPath} (${stdout.trim()})`);
        this.uvPath = uvPath as string;
        return;
      } catch (error) {
        // Try next path
        continue;
      }
    }
    logger.warn('uv binary not found in common locations. Environment creation will fail.');
  }

  /**
   * Initialize the base directory for environments
   */
  private async initializeBaseDirectory(): Promise<void> {
    try {
      await fs.mkdir(ENVIRONMENTS_BASE_DIR, { recursive: true });
      logger.info(`Strategy environments directory initialized at: ${ENVIRONMENTS_BASE_DIR}`);
    } catch (error) {
      logger.error('Failed to initialize environments directory:', error);
      throw error;
    }
  }

  /**
   * Get the environment directory path for a strategy
   */
  private getEnvironmentPath(strategyId: string): string {
    return path.join(ENVIRONMENTS_BASE_DIR, `strategy-${strategyId}`);
  }

  /**
   * Get the Python interpreter path for a strategy's environment
   */
  private getPythonPath(strategyId: string): string {
    const envPath = this.getEnvironmentPath(strategyId);
    return path.join(envPath, '.venv', 'bin', 'python3');
  }

  /**
   * Check if uv is installed
   */
  async checkUvInstalled(): Promise<boolean> {
    if (!this.uvPath) {
      // Try to find it again
      await this.findUvBinary();
    }

    if (this.uvPath) {
      return true;
    }

    logger.error('uv is not installed. Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh');
    return false;
  }

  /**
   * Check if an environment exists for a strategy
   */
  async environmentExists(strategyId: string): Promise<boolean> {
    const envPath = this.getEnvironmentPath(strategyId);
    const pythonPath = this.getPythonPath(strategyId);

    try {
      await fs.access(pythonPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new isolated environment for a strategy
   */
  async createEnvironment(strategyId: string): Promise<EnvironmentInfo> {
    const envPath = this.getEnvironmentPath(strategyId);
    const pythonPath = this.getPythonPath(strategyId);

    logger.info(`Creating environment for strategy ${strategyId} at ${envPath}`);

    // Check if uv is installed
    const uvInstalled = await this.checkUvInstalled();
    if (!uvInstalled) {
      throw new Error('uv is not installed. Please install uv first.');
    }

    // Check if environment already exists
    if (await this.environmentExists(strategyId)) {
      logger.info(`Environment already exists for strategy ${strategyId}`);
      return this.getEnvironmentInfo(strategyId);
    }

    const envInfo: EnvironmentInfo = {
      strategyId,
      environmentPath: envPath,
      pythonPath,
      createdAt: new Date(),
      status: 'creating',
    };

    this.environmentCache.set(strategyId, envInfo);

    try {
      // Create environment directory
      await fs.mkdir(envPath, { recursive: true });

      // Step 1: Create uv virtual environment with Python 3.12.12
      logger.info(`Creating uv venv with Python ${REQUIRED_PYTHON_VERSION}...`);
      await this.runCommand('uv', ['venv', '--python', REQUIRED_PYTHON_VERSION, '.venv'], envPath);

      // Step 2: Install dependencies
      logger.info('Installing dependencies...');
      await this.runCommand('uv', ['pip', 'install', '-r', REQUIREMENTS_FILE], envPath);

      // Step 3: Verify installation
      logger.info('Verifying Python installation...');
      const { stdout } = await exec(`${pythonPath} --version`);
      logger.info(`Python version: ${stdout.trim()}`);

      // Update status
      envInfo.status = 'ready';
      this.environmentCache.set(strategyId, envInfo);

      logger.info(`Environment created successfully for strategy ${strategyId}`);
      return envInfo;
    } catch (error) {
      envInfo.status = 'error';
      this.environmentCache.set(strategyId, envInfo);
      logger.error(`Failed to create environment for strategy ${strategyId}:`, error);

      // Cleanup on failure
      try {
        await this.deleteEnvironment(strategyId);
      } catch (cleanupError) {
        logger.error('Failed to cleanup failed environment:', cleanupError);
      }

      throw new Error(`Failed to create environment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get information about a strategy's environment
   */
  async getEnvironmentInfo(strategyId: string): Promise<EnvironmentInfo> {
    // Check cache first
    if (this.environmentCache.has(strategyId)) {
      return this.environmentCache.get(strategyId)!;
    }

    // Check if environment exists on disk
    if (await this.environmentExists(strategyId)) {
      const envInfo: EnvironmentInfo = {
        strategyId,
        environmentPath: this.getEnvironmentPath(strategyId),
        pythonPath: this.getPythonPath(strategyId),
        createdAt: new Date(), // We don't track this, so use current date
        status: 'ready',
      };
      this.environmentCache.set(strategyId, envInfo);
      return envInfo;
    }

    throw new Error(`Environment does not exist for strategy ${strategyId}`);
  }

  /**
   * Delete an environment for a strategy
   */
  async deleteEnvironment(strategyId: string): Promise<void> {
    const envPath = this.getEnvironmentPath(strategyId);

    logger.info(`Deleting environment for strategy ${strategyId}`);

    try {
      await fs.rm(envPath, { recursive: true, force: true });
      this.environmentCache.delete(strategyId);
      logger.info(`Environment deleted for strategy ${strategyId}`);
    } catch (error) {
      logger.error(`Failed to delete environment for strategy ${strategyId}:`, error);
      throw error;
    }
  }

  /**
   * Execute a Python script in a strategy's environment
   */
  async executeInEnvironment(
    strategyId: string,
    scriptPath: string,
    args: string[] = [],
    env: Record<string, string> = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const envInfo = await this.getEnvironmentInfo(strategyId);

    if (envInfo.status !== 'ready') {
      throw new Error(`Environment is not ready for strategy ${strategyId}`);
    }

    const pythonPath = envInfo.pythonPath;

    logger.info(`Executing script ${scriptPath} in environment for strategy ${strategyId}`);

    return new Promise((resolve, reject) => {
      const childProcess = spawn(pythonPath, [scriptPath, ...args], {
        env: { ...process.env, ...env },
        cwd: path.dirname(scriptPath),
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Process exited with code ${code}\nStderr: ${stderr}`));
        }
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * List all environments
   */
  async listEnvironments(): Promise<string[]> {
    try {
      const entries = await fs.readdir(ENVIRONMENTS_BASE_DIR);
      return entries
        .filter(entry => entry.startsWith('strategy-'))
        .map(entry => entry.replace('strategy-', ''));
    } catch (error) {
      logger.error('Failed to list environments:', error);
      return [];
    }
  }

  /**
   * Cleanup all environments (use with caution!)
   */
  async cleanupAllEnvironments(): Promise<void> {
    logger.warn('Cleaning up all strategy environments...');

    const strategyIds = await this.listEnvironments();

    for (const strategyId of strategyIds) {
      await this.deleteEnvironment(strategyId);
    }

    this.environmentCache.clear();
    logger.info('All environments cleaned up');
  }

  /**
   * Helper method to run a command
   */
  private runCommand(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use the found uv path if command is 'uv'
      const actualCommand = command === 'uv' && this.uvPath ? this.uvPath : command;

      const childProcess = spawn(actualCommand, args, { cwd });

      let stderr = '';

      childProcess.stdout.on('data', (data) => {
        logger.debug(data.toString());
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.debug(data.toString());
      });

      childProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}\nStderr: ${stderr}`));
        }
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }
}

// Export singleton instance
export const strategyEnvironmentManager = new StrategyEnvironmentManager();
