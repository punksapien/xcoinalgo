/**
 * Terminal Session Manager
 * Manages WebSocket connections to Docker sandbox terminals
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { dockerSandbox, TerminalSession } from './docker-sandbox';
import { Logger } from '../utils/logger';
import { verify } from 'jsonwebtoken';

const logger = new Logger('TerminalSessionManager');

export class TerminalSessionManager {
  private io: SocketIOServer | null = null;
  private activeSessions: Map<string, {
    session: TerminalSession;
    socket: Socket;
    userId: string;
    strategyId: string;
  }> = new Map();

  /**
   * Initialize Socket.IO server
   */
  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true
      },
      path: '/socket.io'
    });

    this.setupConnectionHandlers();
    this.startCleanupInterval();

    logger.info('Terminal session manager initialized');
  }

  /**
   * Setup connection handlers
   */
  private setupConnectionHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Authenticate socket connection
      socket.on('authenticate', async (data: { token: string }) => {
        try {
          const { token } = data;

          if (!token) {
            socket.emit('error', { message: 'No token provided' });
            socket.disconnect();
            return;
          }

          // Verify JWT token
          const secret = process.env.JWT_SECRET || 'your-secret-key';
          const decoded = verify(token, secret) as { userId: string };

          if (!decoded.userId) {
            socket.emit('error', { message: 'Invalid token' });
            socket.disconnect();
            return;
          }

          // Store user info on socket
          (socket as any).userId = decoded.userId;
          socket.emit('authenticated', { success: true });

          logger.info(`Socket authenticated for user: ${decoded.userId}`);
        } catch (error) {
          logger.error('Authentication failed:', error);
          socket.emit('error', { message: 'Authentication failed' });
          socket.disconnect();
        }
      });

      // Start terminal session
      socket.on('terminal:start', async (data: {
        strategyId: string;
        code: string;
        requirements: string;
      }) => {
        try {
          const userId = (socket as any).userId;
          if (!userId) {
            socket.emit('terminal:error', { message: 'Not authenticated' });
            return;
          }

          const { strategyId, code, requirements } = data;

          logger.info(`Starting terminal session for strategy ${strategyId} (user: ${userId})`);

          // Check if user already has an active session for this strategy
          const existingSession = Array.from(this.activeSessions.values()).find(
            s => s.userId === userId && s.strategyId === strategyId
          );

          if (existingSession) {
            // Reuse existing session
            socket.emit('terminal:ready', {
              sessionId: existingSession.session.sessionId,
              message: 'Reconnected to existing session'
            });

            // Update socket reference
            this.activeSessions.set(existingSession.session.sessionId, {
              ...existingSession,
              socket
            });

            return;
          }

          // Create new terminal session
          socket.emit('terminal:status', {
            status: 'initializing',
            message: 'Securing compute resources...'
          });

          const session = await dockerSandbox.createTerminalSession(code, requirements);

          socket.emit('terminal:status', {
            status: 'connecting',
            message: 'Establishing connection...'
          });

          // Store session
          this.activeSessions.set(session.sessionId, {
            session,
            socket,
            userId,
            strategyId
          });

          // Attach to container
          const stream = await dockerSandbox.attachToSession(session.sessionId);

          // Forward data from container to client
          stream.on('data', (chunk: Buffer) => {
            socket.emit('terminal:data', chunk.toString('utf-8'));
          });

          // Handle stream errors
          stream.on('error', (error) => {
            logger.error(`Stream error for session ${session.sessionId}:`, error);
            socket.emit('terminal:error', { message: 'Stream error occurred' });
          });

          // Notify client that terminal is ready
          socket.emit('terminal:ready', {
            sessionId: session.sessionId,
            message: 'Terminal ready'
          });

          logger.info(`Terminal session started: ${session.sessionId}`);
        } catch (error) {
          logger.error('Failed to start terminal session:', error);
          socket.emit('terminal:error', {
            message: error instanceof Error ? error.message : 'Failed to start terminal'
          });
        }
      });

      // Send data to terminal
      socket.on('terminal:input', async (data: { sessionId: string; input: string }) => {
        try {
          const { sessionId, input } = data;
          const sessionData = this.activeSessions.get(sessionId);

          if (!sessionData) {
            socket.emit('terminal:error', { message: 'Session not found' });
            return;
          }

          // Verify ownership
          const userId = (socket as any).userId;
          if (sessionData.userId !== userId) {
            socket.emit('terminal:error', { message: 'Unauthorized' });
            return;
          }

          // Get stream and write input
          const stream = await dockerSandbox.attachToSession(sessionId);
          stream.write(input);
        } catch (error) {
          logger.error('Failed to send terminal input:', error);
          socket.emit('terminal:error', {
            message: 'Failed to send input'
          });
        }
      });

      // Execute command in session
      socket.on('terminal:exec', async (data: { sessionId: string; command: string }) => {
        try {
          const { sessionId, command } = data;
          const sessionData = this.activeSessions.get(sessionId);

          if (!sessionData) {
            socket.emit('terminal:error', { message: 'Session not found' });
            return;
          }

          // Verify ownership
          const userId = (socket as any).userId;
          if (sessionData.userId !== userId) {
            socket.emit('terminal:error', { message: 'Unauthorized' });
            return;
          }

          // Execute command
          const result = await dockerSandbox.execInSession(sessionId, command);
          socket.emit('terminal:data', result.stdout);
          if (result.stderr) {
            socket.emit('terminal:data', result.stderr);
          }
        } catch (error) {
          logger.error('Failed to execute command:', error);
          socket.emit('terminal:error', {
            message: 'Failed to execute command'
          });
        }
      });

      // Terminate terminal session
      socket.on('terminal:stop', async (data: { sessionId: string }) => {
        try {
          const { sessionId } = data;
          await this.terminateSession(sessionId, socket);
          socket.emit('terminal:stopped', { sessionId });
        } catch (error) {
          logger.error('Failed to stop terminal session:', error);
          socket.emit('terminal:error', {
            message: 'Failed to stop terminal'
          });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);

        // Find and cleanup sessions for this socket
        for (const [sessionId, sessionData] of this.activeSessions.entries()) {
          if (sessionData.socket.id === socket.id) {
            // Don't immediately terminate - allow reconnection
            logger.info(`Socket disconnected for session ${sessionId}, keeping session alive`);
          }
        }
      });
    });
  }

  /**
   * Terminate a terminal session
   */
  private async terminateSession(sessionId: string, socket: Socket) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) {
      return;
    }

    // Verify ownership
    const userId = (socket as any).userId;
    if (sessionData.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Terminate Docker container
    await dockerSandbox.terminateSession(sessionId);

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    logger.info(`Terminal session terminated: ${sessionId}`);
  }

  /**
   * Cleanup stale sessions periodically
   */
  private startCleanupInterval() {
    setInterval(async () => {
      const now = Date.now();
      const staleThreshold = 30 * 60 * 1000; // 30 minutes

      for (const [sessionId, sessionData] of this.activeSessions.entries()) {
        const age = now - sessionData.session.lastActivity.getTime();

        if (age > staleThreshold) {
          logger.info(`Cleaning up stale session: ${sessionId}`);

          try {
            await dockerSandbox.terminateSession(sessionId);
            this.activeSessions.delete(sessionId);

            // Notify client if still connected
            if (sessionData.socket.connected) {
              sessionData.socket.emit('terminal:timeout', {
                message: 'Session timed out due to inactivity'
              });
            }
          } catch (error) {
            logger.error(`Failed to cleanup session ${sessionId}:`, error);
          }
        }
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get sessions for a user
   */
  getUserSessions(userId: string): string[] {
    const sessions: string[] = [];

    for (const [sessionId, sessionData] of this.activeSessions.entries()) {
      if (sessionData.userId === userId) {
        sessions.push(sessionId);
      }
    }

    return sessions;
  }
}

// Singleton instance
export const terminalSessionManager = new TerminalSessionManager();
