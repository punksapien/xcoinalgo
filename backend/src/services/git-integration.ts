import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import prisma from '../utils/database';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface GitRepository {
  url: string;
  branch: string;
  accessToken?: string;
}

export interface StrategyFiles {
  strategyCode: string;
  configData: any;
  requirements: string;
  readme?: string;
}

export class GitIntegrationService {
  private readonly workspaceDir = process.env.GIT_WORKSPACE_DIR || '/tmp/strategy-workspace';

  constructor() {
    this.ensureWorkspaceDir();
  }

  private async ensureWorkspaceDir(): Promise<void> {
    try {
      await fs.mkdir(this.workspaceDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create workspace directory:', error);
      throw error;
    }
  }

  /**
   * Clone or pull the latest changes from a Git repository
   */
  async syncRepository(repo: GitRepository): Promise<string> {
    const repoName = this.getRepositoryName(repo.url);
    const localPath = path.join(this.workspaceDir, repoName);

    try {
      // Check if repo already exists
      const exists = await this.pathExists(localPath);

      if (exists) {
        // Pull latest changes
        await this.pullRepository(localPath, repo.branch);
      } else {
        // Clone repository
        await this.cloneRepository(repo, localPath);
      }

      return localPath;
    } catch (error) {
      logger.error(`Failed to sync repository ${repo.url}:`, error);
      throw new Error(`Git sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract strategy files from a repository
   */
  async extractStrategyFiles(repositoryPath: string, strategyPath?: string): Promise<StrategyFiles> {
    try {
      const basePath = strategyPath ? path.join(repositoryPath, strategyPath) : repositoryPath;

      // Look for strategy files
      const strategyFile = await this.findFile(basePath, ['strategy.py', 'main.py', 'bot.py']);
      const configFile = await this.findFile(basePath, ['config.yaml', 'config.yml', 'config.json']);
      const requirementsFile = await this.findFile(basePath, ['requirements.txt']);
      const readmeFile = await this.findFile(basePath, ['README.md', 'readme.md']);

      if (!strategyFile) {
        throw new Error('No strategy file found (expected strategy.py, main.py, or bot.py)');
      }

      const strategyCode = await fs.readFile(strategyFile, 'utf-8');
      const requirements = requirementsFile ? await fs.readFile(requirementsFile, 'utf-8') : '';
      const readme = readmeFile ? await fs.readFile(readmeFile, 'utf-8') : undefined;

      let configData: any = {};
      if (configFile) {
        const configContent = await fs.readFile(configFile, 'utf-8');
        if (configFile.endsWith('.json')) {
          configData = JSON.parse(configContent);
        } else {
          // For YAML, we'll need to parse it (assuming yaml is available)
          const yaml = require('yaml');
          configData = yaml.parse(configContent);
        }
      }

      return {
        strategyCode,
        configData,
        requirements,
        readme
      };
    } catch (error) {
      logger.error('Failed to extract strategy files:', error);
      throw error;
    }
  }

  /**
   * Get the latest commit hash from a repository
   */
  async getLatestCommitHash(repositoryPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', { cwd: repositoryPath });
      return stdout.trim();
    } catch (error) {
      logger.error('Failed to get commit hash:', error);
      throw error;
    }
  }

  /**
   * Validate strategy code using the Python SDK
   */
  async validateStrategy(strategyCode: string, configData: any, requirements: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const tempDir = path.join(this.workspaceDir, 'validation', Date.now().toString());

    try {
      await fs.mkdir(tempDir, { recursive: true });

      // Write files to temporary directory
      await fs.writeFile(path.join(tempDir, 'strategy.py'), strategyCode);
      await fs.writeFile(path.join(tempDir, 'config.json'), JSON.stringify(configData, null, 2));
      await fs.writeFile(path.join(tempDir, 'requirements.txt'), requirements);

      // Run validation script
      const validationResult = await this.runPythonValidation(tempDir);

      return validationResult;
    } catch (error) {
      logger.error('Strategy validation failed:', error);
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        warnings: []
      };
    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warn('Failed to cleanup validation directory:', cleanupError);
      }
    }
  }

  /**
   * Process a webhook from Git provider (GitHub, GitLab, etc.)
   */
  async processWebhook(payload: any, provider: 'github' | 'gitlab'): Promise<void> {
    try {
      const repoUrl = this.extractRepositoryUrl(payload, provider);
      const branch = this.extractBranch(payload, provider);
      const commitHash = this.extractCommitHash(payload, provider);

      // Find strategy in database
      const strategy = await prisma.strategy.findFirst({
        where: {
          gitRepository: repoUrl,
          gitBranch: branch
        }
      });

      if (!strategy) {
        logger.warn(`No strategy found for repository ${repoUrl}, branch ${branch}`);
        return;
      }

      // Sync repository and validate
      await this.syncAndValidateStrategy(strategy.id, {
        url: repoUrl,
        branch: branch
      }, commitHash);

    } catch (error) {
      logger.error('Webhook processing failed:', error);
      throw error;
    }
  }

  /**
   * Sync repository and validate strategy
   */
  async syncAndValidateStrategy(strategyId: string, repo: GitRepository, commitHash?: string): Promise<void> {
    try {
      // Update strategy status to validating
      await prisma.strategy.update({
        where: { id: strategyId },
        data: {
          validationStatus: 'VALIDATING',
          gitCommitHash: commitHash
        }
      });

      // Sync repository
      const localPath = await this.syncRepository(repo);

      // Extract strategy files
      const strategyFiles = await this.extractStrategyFiles(localPath);

      // Validate strategy
      const validationResult = await this.validateStrategy(
        strategyFiles.strategyCode,
        strategyFiles.configData,
        strategyFiles.requirements
      );

      // Update strategy with validation results
      const updateData: any = {
        validationStatus: validationResult.isValid ? 'VALID' : 'INVALID',
        validationErrors: validationResult.errors.length > 0 ? JSON.stringify({
          errors: validationResult.errors,
          warnings: validationResult.warnings
        }) : null,
        lastValidatedAt: new Date(),
        gitCommitHash: commitHash || await this.getLatestCommitHash(localPath)
      };

      // If validation passed, update strategy to be active
      if (validationResult.isValid) {
        updateData.isActive = true;
      }

      await prisma.strategy.update({
        where: { id: strategyId },
        data: updateData
      });

      // Create new version if validation passed
      if (validationResult.isValid) {
        const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } });
        if (strategy) {
          await prisma.strategyVersion.create({
            data: {
              strategyId: strategyId,
              version: strategy.version,
              strategyCode: strategyFiles.strategyCode,
              configData: strategyFiles.configData,
              requirements: strategyFiles.requirements,
              gitCommitHash: updateData.gitCommitHash,
              isValidated: true
            }
          });
        }
      }

      logger.info(`Strategy ${strategyId} validation completed: ${validationResult.isValid ? 'PASSED' : 'FAILED'}`);
    } catch (error) {
      // Update strategy with error status
      await prisma.strategy.update({
        where: { id: strategyId },
        data: {
          validationStatus: 'INVALID',
          validationErrors: JSON.stringify({
            errors: [error instanceof Error ? error.message : 'Validation pipeline failed'],
            warnings: []
          }),
          lastValidatedAt: new Date()
        }
      });

      throw error;
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async cloneRepository(repo: GitRepository, localPath: string): Promise<void> {
    const authUrl = repo.accessToken
      ? repo.url.replace('https://', `https://${repo.accessToken}@`)
      : repo.url;

    await execAsync(`git clone -b ${repo.branch} ${authUrl} ${localPath}`);
  }

  private async pullRepository(localPath: string, branch: string): Promise<void> {
    await execAsync(`git checkout ${branch}`, { cwd: localPath });
    await execAsync('git pull origin', { cwd: localPath });
  }

  private getRepositoryName(url: string): string {
    return url.split('/').pop()?.replace('.git', '') || 'unknown-repo';
  }

  private async findFile(basePath: string, fileNames: string[]): Promise<string | null> {
    for (const fileName of fileNames) {
      const filePath = path.join(basePath, fileName);
      if (await this.pathExists(filePath)) {
        return filePath;
      }
    }
    return null;
  }

  private async runPythonValidation(strategyDir: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    try {
      const sdkPath = process.env.PYTHON_SDK_PATH || '/Users/macintosh/Developer/coindcx_client/coindcx-trading-platform/python-sdk';
      const validationScript = path.join(sdkPath, 'coindcx_sdk', 'validation.py');

      // Run the validation script
      const { stdout, stderr } = await execAsync(`python3 ${validationScript} ${strategyDir}`);

      // Parse the JSON output from the validation script
      const result = JSON.parse(stdout);

      return {
        isValid: result.is_valid,
        errors: result.errors || [],
        warnings: result.warnings || []
      };
    } catch (error: any) {
      // If the validation script itself fails, fall back to basic checks
      logger.warn('Python validation script failed, falling back to basic checks:', error);

      try {
        // Basic syntax check as fallback
        const { stdout, stderr } = await execAsync(`python3 -m py_compile strategy.py`, { cwd: strategyDir });
        return {
          isValid: true,
          errors: [],
          warnings: ['Advanced validation unavailable, basic syntax check passed']
        };
      } catch (syntaxError: any) {
        return {
          isValid: false,
          errors: [syntaxError.stderr || syntaxError.message || 'Python compilation failed'],
          warnings: []
        };
      }
    }
  }

  private extractRepositoryUrl(payload: any, provider: 'github' | 'gitlab'): string {
    if (provider === 'github') {
      return payload.repository?.clone_url || payload.repository?.html_url;
    } else if (provider === 'gitlab') {
      return payload.project?.http_url_to_repo || payload.project?.web_url;
    }
    throw new Error('Unsupported Git provider');
  }

  private extractBranch(payload: any, provider: 'github' | 'gitlab'): string {
    if (provider === 'github') {
      return payload.ref?.replace('refs/heads/', '') || 'main';
    } else if (provider === 'gitlab') {
      return payload.ref?.replace('refs/heads/', '') || 'main';
    }
    return 'main';
  }

  private extractCommitHash(payload: any, provider: 'github' | 'gitlab'): string {
    if (provider === 'github') {
      return payload.head_commit?.id || payload.after;
    } else if (provider === 'gitlab') {
      return payload.checkout_sha || payload.after;
    }
    throw new Error('Could not extract commit hash');
  }
}

export const gitIntegrationService = new GitIntegrationService();