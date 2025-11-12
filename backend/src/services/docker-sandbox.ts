/**
 * Docker Sandbox Service
 * Manages isolated Docker containers for safe strategy code execution
 */

import Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('DockerSandbox');

export interface SandboxConfig {
  memoryLimit?: number; // in MB, default 512
  cpuLimit?: number; // CPU shares, default 0.5
  timeout?: number; // in milliseconds, default 30000
  networkDisabled?: boolean; // default true
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  timedOut: boolean;
  error?: string;
  resourceUsage?: {
    memoryUsedMB: number;
    cpuPercent: number;
  };
}

export interface TerminalSession {
  containerId: string;
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
}

export class DockerSandboxService {
  private docker: Docker;
  private imageName = 'strategy-sandbox:latest';
  private dockerfilePath: string;
  private imageBuilt = false;
  private activeSessions: Map<string, TerminalSession> = new Map();

  constructor() {
    this.docker = new Docker();
    this.dockerfilePath = path.join(__dirname, '../../docker/strategy-sandbox');
  }

  /**
   * Ensure Docker image is built
   */
  async ensureImage(): Promise<void> {
    if (this.imageBuilt) {
      return;
    }

    try {
      // Check if image exists
      const images = await this.docker.listImages({
        filters: { reference: [this.imageName] }
      });

      if (images.length > 0) {
        logger.info(`Docker image ${this.imageName} already exists`);
        this.imageBuilt = true;
        return;
      }

      // Build image
      logger.info(`Building Docker image ${this.imageName}...`);
      await this.buildImage();
      this.imageBuilt = true;
      logger.info(`Docker image ${this.imageName} built successfully`);
    } catch (error) {
      logger.error('Failed to ensure Docker image:', error);
      throw new Error(`Failed to prepare sandbox environment: ${error}`);
    }
  }

  /**
   * Build Docker image from Dockerfile
   */
  private async buildImage(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.buildImage(
        {
          context: this.dockerfilePath,
          src: ['Dockerfile']
        },
        { t: this.imageName },
        (err, stream) => {
          if (err) {
            return reject(err);
          }

          // Parse build output
          stream?.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
            lines.forEach((line: string) => {
              try {
                const parsed = JSON.parse(line);
                if (parsed.stream) {
                  logger.debug(`Build: ${parsed.stream.trim()}`);
                } else if (parsed.error) {
                  logger.error(`Build error: ${parsed.error}`);
                }
              } catch (e) {
                // Ignore parse errors
              }
            });
          });

          stream?.on('end', () => {
            resolve();
          });

          stream?.on('error', (error) => {
            reject(error);
          });
        }
      );
    });
  }

  /**
   * Execute Python code in a sandboxed container
   */
  async executeCode(
    code: string,
    requirements: string = '',
    config: SandboxConfig = {}
  ): Promise<ExecutionResult> {
    await this.ensureImage();

    const startTime = Date.now();
    const {
      memoryLimit = 512,
      cpuLimit = 0.5,
      timeout = 30000,
      networkDisabled = true
    } = config;

    let container: Docker.Container | null = null;

    try {
      // Create container
      const containerConfig: Docker.ContainerCreateOptions = {
        Image: this.imageName,
        Cmd: ['/bin/bash', '-c', 'python3 /workspace/strategy.py'],
        HostConfig: {
          Memory: memoryLimit * 1024 * 1024,
          MemorySwap: memoryLimit * 1024 * 1024, // No swap
          NanoCpus: cpuLimit * 1000000000,
          NetworkMode: networkDisabled ? 'none' : 'bridge',
          ReadonlyRootfs: true,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges']
        },
        AttachStdout: true,
        AttachStderr: true,
        OpenStdin: false,
        Tty: false
      };

      container = await this.docker.createContainer(containerConfig);

      // Write code to container
      const tarStream = await this.createCodeTar(code, requirements);
      await container.putArchive(tarStream, { path: '/workspace' });

      // Start container
      await container.start();

      // Wait for execution with timeout
      const waitPromise = container.wait();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeout)
      );

      let timedOut = false;
      let waitResult: any;

      try {
        waitResult = await Promise.race([waitPromise, timeoutPromise]);
      } catch (error) {
        if ((error as Error).message === 'TIMEOUT') {
          timedOut = true;
          await container.kill();
          waitResult = { StatusCode: 124 }; // Timeout exit code
        } else {
          throw error;
        }
      }

      // Get logs
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        timestamps: false
      });

      const output = this.parseLogs(logs);

      // Get resource usage stats
      const stats = await container.stats({ stream: false });
      const resourceUsage = this.parseStats(stats as any);

      // Cleanup
      await container.remove({ force: true });

      const executionTime = Date.now() - startTime;

      return {
        success: waitResult.StatusCode === 0 && !timedOut,
        stdout: output.stdout,
        stderr: output.stderr,
        exitCode: waitResult.StatusCode,
        executionTime,
        timedOut,
        resourceUsage
      };
    } catch (error) {
      logger.error('Code execution failed:', error);

      // Cleanup container if exists
      if (container) {
        try {
          await container.remove({ force: true });
        } catch (cleanupError) {
          logger.error('Failed to cleanup container:', cleanupError);
        }
      }

      return {
        success: false,
        stdout: '',
        stderr: '',
        exitCode: -1,
        executionTime: Date.now() - startTime,
        timedOut: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create an interactive terminal session
   */
  async createTerminalSession(
    strategyCode: string,
    requirements: string = ''
  ): Promise<TerminalSession> {
    await this.ensureImage();

    const sessionId = uuidv4();

    try {
      // Create long-running container
      const containerConfig: Docker.ContainerCreateOptions = {
        Image: this.imageName,
        Cmd: ['/bin/bash'],
        HostConfig: {
          Memory: 512 * 1024 * 1024,
          MemorySwap: 512 * 1024 * 1024,
          NanoCpus: 0.5 * 1000000000,
          NetworkMode: 'none',
          ReadonlyRootfs: false, // Allow writes for interactive session
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges'],
          Tmpfs: {
            '/workspace': 'rw,noexec,nosuid,size=100m'
          }
        },
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        OpenStdin: true,
        Tty: true
      };

      const container = await this.docker.createContainer(containerConfig);

      // Write code and requirements to container
      const tarStream = await this.createCodeTar(strategyCode, requirements);
      await container.putArchive(tarStream, { path: '/workspace' });

      // Start container
      await container.start();

      const session: TerminalSession = {
        containerId: container.id,
        sessionId,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      this.activeSessions.set(sessionId, session);

      logger.info(`Created terminal session: ${sessionId}`);
      return session;
    } catch (error) {
      logger.error('Failed to create terminal session:', error);
      throw error;
    }
  }

  /**
   * Execute command in terminal session
   */
  async execInSession(
    sessionId: string,
    command: string
  ): Promise<{ stdout: string; stderr: string }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const container = this.docker.getContainer(session.containerId);

    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await exec.start({ Detach: false });
    const output = this.parseLogs(stream);

    session.lastActivity = new Date();

    return output;
  }

  /**
   * Attach to terminal session for streaming I/O
   */
  async attachToSession(sessionId: string): Promise<NodeJS.ReadWriteStream> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const container = this.docker.getContainer(session.containerId);
    const stream = await container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true
    });

    session.lastActivity = new Date();

    return stream;
  }

  /**
   * Terminate terminal session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      const container = this.docker.getContainer(session.containerId);
      await container.stop({ t: 5 });
      await container.remove();
      this.activeSessions.delete(sessionId);
      logger.info(`Terminated terminal session: ${sessionId}`);
    } catch (error) {
      logger.error(`Failed to terminate session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup stale sessions (older than 30 minutes)
   */
  async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.activeSessions.entries()) {
      const age = now - session.lastActivity.getTime();
      if (age > staleThreshold) {
        logger.info(`Cleaning up stale session: ${sessionId}`);
        await this.terminateSession(sessionId);
      }
    }
  }

  /**
   * Create tar archive with code and requirements
   */
  private async createCodeTar(code: string, requirements: string): Promise<NodeJS.ReadableStream> {
    const tar = require('tar-stream');
    const pack = tar.pack();

    // Add strategy.py
    pack.entry({ name: 'strategy.py', size: Buffer.byteLength(code) }, code);

    // Add requirements.txt if provided
    if (requirements) {
      pack.entry(
        { name: 'requirements.txt', size: Buffer.byteLength(requirements) },
        requirements
      );
    }

    pack.finalize();
    return pack;
  }

  /**
   * Parse Docker logs stream
   */
  private parseLogs(logs: Buffer | NodeJS.ReadableStream): { stdout: string; stderr: string } {
    let stdout = '';
    let stderr = '';

    if (Buffer.isBuffer(logs)) {
      // Docker multiplexes stdout/stderr with 8-byte header
      let offset = 0;
      while (offset < logs.length) {
        const header = logs.slice(offset, offset + 8);
        if (header.length < 8) break;

        const stream = header[0]; // 1 = stdout, 2 = stderr
        const size = header.readUInt32BE(4);

        const data = logs.slice(offset + 8, offset + 8 + size).toString('utf-8');

        if (stream === 1) {
          stdout += data;
        } else if (stream === 2) {
          stderr += data;
        }

        offset += 8 + size;
      }
    }

    return { stdout, stderr };
  }

  /**
   * Parse container stats
   */
  private parseStats(stats: any): { memoryUsedMB: number; cpuPercent: number } {
    const memoryUsedMB = Math.round((stats.memory_stats?.usage || 0) / (1024 * 1024));

    // Calculate CPU percentage
    const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
      (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) -
      (stats.precpu_stats?.system_cpu_usage || 0);
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

    return { memoryUsedMB, cpuPercent: Math.round(cpuPercent * 100) / 100 };
  }

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (error) {
      logger.error('Docker is not available:', error);
      return false;
    }
  }
}

// Singleton instance
export const dockerSandbox = new DockerSandboxService();

// Cleanup stale sessions every 10 minutes
setInterval(() => {
  dockerSandbox.cleanupStaleSessions().catch((error) => {
    logger.error('Failed to cleanup stale sessions:', error);
  });
}, 10 * 60 * 1000);
