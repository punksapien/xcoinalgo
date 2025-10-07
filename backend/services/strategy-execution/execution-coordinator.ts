/**
 * Execution Coordinator
 *
 * Orchestrates multi-tenant strategy execution:
 * 1. Acquire distributed lock
 * 2. Execute strategy ONCE for all subscribers
 * 3. Fan-out signal to each subscriber
 * 4. Calculate position sizes and place orders
 * 5. Log execution metadata
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { strategyRegistry } from './strategy-registry'
import { settingsService } from './settings-service'
import { subscriptionService } from './subscription-service'
import { eventBus } from '../../lib/event-bus'
import { formatIntervalKey, computeLockTTL, validateExecutionTiming } from '../../lib/time-utils'
import { spawn } from 'child_process'
import path from 'path'

const prisma = new PrismaClient()

interface ExecutionResult {
  success: boolean
  signal?: 'LONG' | 'SHORT' | 'HOLD' | 'EXIT_LONG' | 'EXIT_SHORT'
  subscribersProcessed: number
  tradesGenerated: number
  executionTime: number
  error?: string
}

interface StrategySignal {
  signal: 'LONG' | 'SHORT' | 'HOLD' | 'EXIT_LONG' | 'EXIT_SHORT'
  price: number
  quantity?: number
  stopLoss?: number
  takeProfit?: number
  metadata?: Record<string, any>
}

interface PythonExecutionResult {
  success: boolean
  signal: StrategySignal | null
  error?: string
  logs?: string[]
}

class ExecutionCoordinator {
  /**
   * Main execution entry point - called by cron or event trigger
   */
  async executeStrategy(
    strategyId: string,
    scheduledTime: Date,
    workerId: string = process.env.WORKER_ID || 'worker-default'
  ): Promise<ExecutionResult> {
    const startTime = Date.now()
    const actualTime = new Date()

    console.log(
      `\n${'='.repeat(80)}\n` +
      `Strategy Execution Started: ${strategyId}\n` +
      `Scheduled: ${scheduledTime.toISOString()}\n` +
      `Actual: ${actualTime.toISOString()}\n` +
      `Worker: ${workerId}\n` +
      `${'='.repeat(80)}`
    )

    try {
      // Validate execution timing
      validateExecutionTiming(scheduledTime, actualTime, 2.0)

      // Get strategy settings
      const strategySettings = await settingsService.getStrategySettings(strategyId)
      if (!strategySettings) {
        throw new Error(`Strategy ${strategyId} settings not found`)
      }

      const { symbol, resolution } = strategySettings
      const intervalKey = formatIntervalKey(scheduledTime, resolution)

      // Acquire distributed lock
      const lockTTL = computeLockTTL(resolution, 10)
      const lockAcquired = await settingsService.acquireExecutionLock(
        strategyId,
        intervalKey,
        lockTTL,
        workerId
      )

      if (!lockAcquired) {
        console.log(
          `Lock already held for ${strategyId} at ${intervalKey}, skipping execution`
        )
        return {
          success: false,
          subscribersProcessed: 0,
          tradesGenerated: 0,
          executionTime: Date.now() - startTime,
          error: 'Lock already held by another worker',
        }
      }

      // Emit execution start event
      eventBus.emit('strategy.execution.start', {
        strategyId,
        intervalKey,
        workerId,
        scheduledTime: scheduledTime.toISOString(),
      })

      // Get active subscribers
      const subscribers = await subscriptionService.getActiveSubscribers(strategyId)

      if (subscribers.length === 0) {
        console.log(`No active subscribers for strategy ${strategyId}, skipping execution`)

        await this.logExecution(strategyId, intervalKey, {
          status: 'SKIPPED',
          subscribersCount: 0,
          tradesGenerated: 0,
          duration: Date.now() - startTime,
          workerId,
        })

        return {
          success: true,
          subscribersProcessed: 0,
          tradesGenerated: 0,
          executionTime: Date.now() - startTime,
        }
      }

      console.log(`Executing strategy for ${subscribers.length} active subscribers`)

      // Execute Python strategy ONCE for all subscribers
      const pythonResult = await this.executePythonStrategy(
        strategyId,
        strategySettings,
        scheduledTime
      )

      if (!pythonResult.success || !pythonResult.signal) {
        console.warn(`Strategy execution failed or returned no signal`)

        await this.logExecution(strategyId, intervalKey, {
          status: pythonResult.success ? 'NO_SIGNAL' : 'FAILED',
          subscribersCount: subscribers.length,
          tradesGenerated: 0,
          duration: Date.now() - startTime,
          workerId,
          error: pythonResult.error,
        })

        return {
          success: pythonResult.success,
          subscribersProcessed: subscribers.length,
          tradesGenerated: 0,
          executionTime: Date.now() - startTime,
          error: pythonResult.error,
        }
      }

      const signal = pythonResult.signal

      console.log(
        `Strategy returned signal: ${signal.signal} at price ${signal.price}`
      )

      // Fan-out signal to all subscribers
      let tradesGenerated = 0
      const fanoutPromises = subscribers.map(async (subscriber) => {
        try {
          const tradeCreated = await this.processSignalForSubscriber(
            subscriber,
            signal,
            strategySettings
          )
          if (tradeCreated) {
            tradesGenerated++
          }
        } catch (error) {
          console.error(
            `Failed to process signal for subscriber ${subscriber.id}:`,
            error
          )
        }
      })

      await Promise.all(fanoutPromises)

      console.log(`Signal processed for ${subscribers.length} subscribers, ${tradesGenerated} trades generated`)

      // Log execution to database
      await this.logExecution(strategyId, intervalKey, {
        status: 'SUCCESS',
        signalType: signal.signal,
        subscribersCount: subscribers.length,
        tradesGenerated,
        duration: Date.now() - startTime,
        workerId,
      })

      // Update execution status in Redis
      await settingsService.updateExecutionStatus(strategyId, {
        last_run: actualTime.toISOString(),
        subscribers: subscribers.length,
        duration: (Date.now() - startTime) / 1000,
        last_signal: signal.signal,
        worker_id: workerId,
        execution_count: 1, // Will be incremented in Redis
      })

      // Emit completion event
      eventBus.emit('strategy.execution.complete', {
        strategyId,
        intervalKey,
        success: true,
        signal: signal.signal,
        subscribersProcessed: subscribers.length,
        tradesGenerated,
      })

      console.log(
        `\n${'='.repeat(80)}\n` +
        `Execution Complete: ${strategyId}\n` +
        `Signal: ${signal.signal}\n` +
        `Subscribers: ${subscribers.length}\n` +
        `Trades: ${tradesGenerated}\n` +
        `Duration: ${Date.now() - startTime}ms\n` +
        `${'='.repeat(80)}\n`
      )

      return {
        success: true,
        signal: signal.signal,
        subscribersProcessed: subscribers.length,
        tradesGenerated,
        executionTime: Date.now() - startTime,
      }
    } catch (error) {
      console.error(`Strategy execution failed for ${strategyId}:`, error)

      // Emit error event
      eventBus.emit('strategy.execution.error', {
        strategyId,
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        success: false,
        subscribersProcessed: 0,
        tradesGenerated: 0,
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Execute Python strategy subprocess
   */
  private async executePythonStrategy(
    strategyId: string,
    strategySettings: any,
    executionTime: Date
  ): Promise<PythonExecutionResult> {
    return new Promise((resolve) => {
      const pythonScriptPath = path.join(
        __dirname,
        '../../../python/strategy_runner.py'
      )

      // Prepare input for Python script
      const input = JSON.stringify({
        strategy_id: strategyId,
        execution_time: executionTime.toISOString(),
        settings: strategySettings,
      })

      console.log(`Spawning Python subprocess: ${pythonScriptPath}`)

      const pythonProcess = spawn('python3', [pythonScriptPath], {
        env: { ...process.env },
      })

      let stdout = ''
      let stderr = ''

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`)
          console.error(`stderr: ${stderr}`)
          resolve({
            success: false,
            signal: null,
            error: `Python process exited with code ${code}: ${stderr}`,
          })
          return
        }

        try {
          const result = JSON.parse(stdout)
          resolve({
            success: true,
            signal: result.signal || null,
            logs: result.logs || [],
          })
        } catch (error) {
          console.error(`Failed to parse Python output:`, error)
          console.error(`stdout: ${stdout}`)
          resolve({
            success: false,
            signal: null,
            error: `Failed to parse Python output: ${error}`,
          })
        }
      })

      // Send input to Python process
      pythonProcess.stdin.write(input)
      pythonProcess.stdin.end()

      // Timeout after 30 seconds
      setTimeout(() => {
        pythonProcess.kill()
        resolve({
          success: false,
          signal: null,
          error: 'Python execution timeout (30s)',
        })
      }, 30000)
    })
  }

  /**
   * Process signal for individual subscriber
   */
  private async processSignalForSubscriber(
    subscription: any,
    signal: StrategySignal,
    strategySettings: any
  ): Promise<boolean> {
    // Skip if paused or inactive
    if (subscription.isPaused || !subscription.isActive) {
      console.log(`Skipping subscriber ${subscription.id} (paused or inactive)`)
      return false
    }

    // Get subscription settings from Redis
    const userSettings = await settingsService.getSubscriptionSettings(
      subscription.userId,
      subscription.strategyId
    )

    if (!userSettings || !userSettings.is_active) {
      console.log(`Skipping subscriber ${subscription.id} (no active settings)`)
      return false
    }

    // Skip HOLD signals
    if (signal.signal === 'HOLD') {
      return false
    }

    try {
      // Calculate position size based on user's risk parameters
      const positionSize = this.calculatePositionSize(
        userSettings.capital,
        userSettings.risk_per_trade,
        signal.price,
        signal.stopLoss,
        userSettings.leverage
      )

      if (positionSize <= 0) {
        console.warn(`Invalid position size for subscriber ${subscription.id}`)
        return false
      }

      // Get broker credentials
      if (!subscription.brokerCredential) {
        console.warn(`No broker credentials for subscriber ${subscription.id}`)
        return false
      }

      const { apiKey, apiSecret } = subscription.brokerCredential

      // Place order via exchange API (placeholder - will be implemented separately)
      const orderPlaced = await this.placeOrder(
        strategySettings.symbol,
        signal.signal,
        positionSize,
        signal.price,
        signal.stopLoss,
        signal.takeProfit,
        apiKey,
        apiSecret
      )

      if (!orderPlaced) {
        console.warn(`Failed to place order for subscriber ${subscription.id}`)
        return false
      }

      // Create trade record in database
      const trade = await prisma.trade.create({
        data: {
          subscriptionId: subscription.id,
          strategyId: subscription.strategyId,
          symbol: strategySettings.symbol,
          side: signal.signal.includes('LONG') ? 'LONG' : 'SHORT',
          quantity: positionSize,
          entryPrice: signal.price,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          status: 'OPEN',
          entryTime: new Date(),
          metadata: signal.metadata || {},
        },
      })

      console.log(
        `Created trade ${trade.id} for subscriber ${subscription.id}: ` +
        `${signal.signal} ${positionSize} @ ${signal.price}`
      )

      // Emit trade created event
      eventBus.emit('trade.created', {
        tradeId: trade.id,
        subscriptionId: subscription.id,
        strategyId: subscription.strategyId,
        signal: signal.signal,
      })

      return true
    } catch (error) {
      console.error(
        `Failed to process signal for subscriber ${subscription.id}:`,
        error
      )
      return false
    }
  }

  /**
   * Calculate position size based on risk parameters
   */
  private calculatePositionSize(
    capital: number,
    riskPerTrade: number,
    entryPrice: number,
    stopLoss?: number,
    leverage: number = 1
  ): number {
    // If no stop loss, use fixed percentage of capital
    if (!stopLoss) {
      const riskAmount = capital * riskPerTrade
      return (riskAmount * leverage) / entryPrice
    }

    // Calculate position size based on stop loss distance
    const riskAmount = capital * riskPerTrade
    const stopLossDistance = Math.abs(entryPrice - stopLoss)
    const riskPerUnit = stopLossDistance

    if (riskPerUnit === 0) {
      return 0
    }

    const positionSize = (riskAmount / riskPerUnit) * leverage

    return positionSize
  }

  /**
   * Place order via exchange API
   * TODO: Implement actual exchange integration
   */
  private async placeOrder(
    symbol: string,
    side: string,
    quantity: number,
    price: number,
    stopLoss?: number,
    takeProfit?: number,
    apiKey?: string,
    apiSecret?: string
  ): Promise<boolean> {
    // Placeholder - will be implemented with actual exchange API
    console.log(
      `[PLACEHOLDER] Placing order: ${side} ${quantity} ${symbol} @ ${price}`
    )

    // TODO: Integrate with exchange API service
    // - Create market/limit order
    // - Set stop loss if provided
    // - Set take profit if provided
    // - Return order ID and status

    return true
  }

  /**
   * Log execution to database
   */
  private async logExecution(
    strategyId: string,
    intervalKey: string,
    metadata: {
      status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'NO_SIGNAL'
      signalType?: string
      subscribersCount: number
      tradesGenerated: number
      duration: number
      workerId: string
      error?: string
    }
  ): Promise<void> {
    try {
      await prisma.strategyExecution.create({
        data: {
          strategyId,
          intervalKey,
          executedAt: new Date(),
          status: metadata.status,
          signalType: metadata.signalType,
          subscribersCount: metadata.subscribersCount,
          tradesGenerated: metadata.tradesGenerated,
          durationMs: metadata.duration,
          workerId: metadata.workerId,
          error: metadata.error,
        },
      })
    } catch (error) {
      console.error(`Failed to log execution:`, error)
    }
  }

  /**
   * Execute all strategies for a specific candle close event
   * Called by WebSocket or cron when candle closes
   */
  async executeCandleStrategies(
    symbol: string,
    resolution: string,
    closeTime: Date
  ): Promise<void> {
    console.log(
      `\nCandle closed: ${symbol} ${resolution} at ${closeTime.toISOString()}`
    )

    // Get all strategies registered for this candle
    const strategies = await strategyRegistry.getStrategiesForCandle(
      symbol,
      resolution
    )

    if (strategies.length === 0) {
      console.log(`No strategies registered for ${symbol} ${resolution}`)
      return
    }

    console.log(
      `Found ${strategies.length} strategies for ${symbol} ${resolution}`
    )

    // Execute each strategy in parallel
    const executionPromises = strategies.map((strategyId) =>
      this.executeStrategy(strategyId, closeTime)
    )

    await Promise.all(executionPromises)
  }

  /**
   * Get execution statistics for a strategy
   */
  async getExecutionStats(strategyId: string): Promise<{
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    totalTrades: number
    avgDuration: number
    lastExecution: Date | null
  }> {
    try {
      const executions = await prisma.strategyExecution.findMany({
        where: { strategyId },
        orderBy: { executedAt: 'desc' },
        take: 100,
      })

      const totalExecutions = executions.length
      const successfulExecutions = executions.filter(
        (e) => e.status === 'SUCCESS'
      ).length
      const failedExecutions = executions.filter(
        (e) => e.status === 'FAILED'
      ).length
      const totalTrades = executions.reduce(
        (sum, e) => sum + e.tradesGenerated,
        0
      )
      const avgDuration =
        executions.reduce((sum, e) => sum + e.durationMs, 0) / totalExecutions

      return {
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        totalTrades,
        avgDuration,
        lastExecution: executions[0]?.executedAt || null,
      }
    } catch (error) {
      console.error(`Failed to get execution stats:`, error)
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalTrades: 0,
        avgDuration: 0,
        lastExecution: null,
      }
    }
  }
}

// Singleton instance
export const executionCoordinator = new ExecutionCoordinator()
