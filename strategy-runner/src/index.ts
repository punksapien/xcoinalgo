import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import axios from 'axios';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8002;
const PYTHON_EXECUTOR_URL = process.env.PYTHON_EXECUTOR_URL || 'http://localhost:8003';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Create axios client for Python executor
const pythonExecutor = axios.create({
  baseURL: PYTHON_EXECUTOR_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Health check endpoint - checks both this service and Python executor
app.get('/health', async (req, res) => {
  try {
    const pythonHealth = await pythonExecutor.get('/health');
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'strategy-runner-proxy',
      version: '2.0.0',
      python_executor: {
        status: pythonHealth.data.status,
        active_strategies: pythonHealth.data.active_strategies
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'strategy-runner-proxy',
      error: 'Python executor unavailable'
    });
  }
});

// Proxy all strategy management endpoints to Python executor
app.post('/strategies/deploy', async (req, res) => {
  try {
    const response = await pythonExecutor.post('/strategies/deploy', req.body);
    res.json(response.data);
  } catch (error: any) {
    logger.error('Failed to deploy strategy:', error);
    res.status(error.response?.status || 500).json(
      error.response?.data || { success: false, message: 'Unknown error' }
    );
  }
});

app.get('/strategies/:strategyId/status', async (req, res) => {
  try {
    const { strategyId } = req.params;
    const response = await pythonExecutor.get(`/strategies/${strategyId}/status`);
    res.json(response.data);
  } catch (error: any) {
    logger.error('Failed to get strategy status:', error);
    res.status(error.response?.status || 500).json(
      error.response?.data || { success: false, message: 'Unknown error' }
    );
  }
});

app.post('/strategies/:strategyId/stop', async (req, res) => {
  try {
    const { strategyId } = req.params;
    const response = await pythonExecutor.post(`/strategies/${strategyId}/stop`);
    res.json(response.data);
  } catch (error: any) {
    logger.error('Failed to stop strategy:', error);
    res.status(error.response?.status || 500).json(
      error.response?.data || { success: false, message: 'Unknown error' }
    );
  }
});

app.delete('/strategies/:strategyId', async (req, res) => {
  try {
    const { strategyId } = req.params;
    const response = await pythonExecutor.delete(`/strategies/${strategyId}`);
    res.json(response.data);
  } catch (error: any) {
    logger.error('Failed to delete strategy:', error);
    res.status(error.response?.status || 500).json(
      error.response?.data || { success: false, message: 'Unknown error' }
    );
  }
});

app.get('/strategies', async (req, res) => {
  try {
    const response = await pythonExecutor.get('/strategies');
    res.json(response.data);
  } catch (error: any) {
    logger.error('Failed to list strategies:', error);
    res.status(error.response?.status || 500).json(
      error.response?.data || { success: false, message: 'Unknown error' }
    );
  }
});

app.post('/strategies/:strategyId/execute', async (req, res) => {
  try {
    const { strategyId } = req.params;
    const response = await pythonExecutor.post(`/strategies/${strategyId}/execute`);
    res.json(response.data);
  } catch (error: any) {
    logger.error('Failed to execute strategy:', error);
    res.status(error.response?.status || 500).json(
      error.response?.data || { success: false, message: 'Unknown error' }
    );
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, async () => {
  logger.info(`🚀 Strategy Runner Proxy service running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🐍 Proxying to Python Executor at ${PYTHON_EXECUTOR_URL}`);

  // Check Python executor health
  try {
    const health = await pythonExecutor.get('/health');
    logger.info(`✅ Python Executor is healthy: ${health.data.status}`);
  } catch (error) {
    logger.error('❌ Python Executor is unreachable!');
    logger.error('Please ensure the Python executor is running at ' + PYTHON_EXECUTOR_URL);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

export default app;