/**
 * Time Utilities for Candle-Close Alignment
 *
 * Provides utilities for aligning strategy execution with exchange candle boundaries
 * to prevent look-ahead bias and ensure consistent indicator calculations.
 */

// Supported resolutions (in minutes)
const SUPPORTED_RESOLUTIONS: Record<string, number> = {
  '1': 1,      // 1 minute
  '3': 3,      // 3 minutes
  '5': 5,      // 5 minutes
  '10': 10,    // 10 minutes
  '15': 15,    // 15 minutes
  '30': 30,    // 30 minutes
  '60': 60,    // 1 hour
  '120': 120,  // 2 hours
  '240': 240,  // 4 hours
  '360': 360,  // 6 hours
  '720': 720,  // 12 hours
  'D': 1440,   // 1 day
  '1D': 1440,  // 1 day (alternative format)
}

/**
 * Convert resolution string to minutes
 */
export function resolutionToMinutes(resolution: string): number {
  if (!(resolution in SUPPORTED_RESOLUTIONS)) {
    throw new Error(
      `Unsupported resolution: ${resolution}. ` +
      `Supported: ${Object.keys(SUPPORTED_RESOLUTIONS).join(', ')}`
    )
  }
  return SUPPORTED_RESOLUTIONS[resolution]
}

/**
 * Convert resolution to cron expression for APScheduler/node-cron
 */
export function resolutionToCron(resolution: string): string {
  const minutes = resolutionToMinutes(resolution)

  // Special cases
  if (minutes >= 1440) { // Daily or longer
    return '0 0 * * *' // Midnight UTC every day
  } else if (minutes >= 60) { // Hourly or longer
    const hours = minutes / 60
    if (hours === 1) {
      return '0 * * * *' // Every hour at :00
    } else if (24 % hours === 0) { // Evenly divides into day
      return `0 */${hours} * * *` // Every N hours at :00
    } else {
      console.warn(
        `Resolution ${resolution} (${minutes}min) doesn't divide evenly into 24h. ` +
        `Defaulting to daily execution.`
      )
      return '0 0 * * *'
    }
  } else if (60 % minutes === 0) { // Divides evenly into an hour
    return `*/${minutes} * * * *` // Every N minutes
  } else {
    console.warn(
      `Resolution ${resolution} (${minutes}min) doesn't divide evenly into 60min. ` +
      `Using ${minutes}-minute interval; may not align perfectly with exchange candles.`
    )
    return `*/${minutes} * * * *`
  }
}

/**
 * Compute the next candle close time aligned to resolution boundary
 */
export function computeNextCandleClose(
  currentTime: Date = new Date(),
  resolution: string = '5'
): Date {
  const minutes = resolutionToMinutes(resolution)

  // For daily or longer intervals
  if (minutes >= 1440) {
    // Next midnight UTC
    const nextClose = new Date(currentTime)
    nextClose.setUTCHours(0, 0, 0, 0)
    if (nextClose <= currentTime) {
      nextClose.setUTCDate(nextClose.getUTCDate() + 1)
    }
    return nextClose
  }

  // For intraday intervals
  const minutesSinceMidnight = currentTime.getUTCHours() * 60 + currentTime.getUTCMinutes()
  const intervalsElapsed = Math.floor(minutesSinceMidnight / minutes)
  const nextIntervalStart = (intervalsElapsed + 1) * minutes

  // Handle day rollover
  if (nextIntervalStart >= 1440) {
    const nextClose = new Date(currentTime)
    nextClose.setUTCHours(0, 0, 0, 0)
    nextClose.setUTCDate(nextClose.getUTCDate() + 1)
    return nextClose
  }

  const nextHour = Math.floor(nextIntervalStart / 60)
  const nextMinute = nextIntervalStart % 60

  const nextClose = new Date(currentTime)
  nextClose.setUTCHours(nextHour, nextMinute, 0, 0)

  // If we're exactly on a boundary, move to next
  if (nextClose <= currentTime) {
    nextClose.setUTCMinutes(nextClose.getUTCMinutes() + minutes)
  }

  return nextClose
}

/**
 * Round timestamp down to the most recent interval boundary
 * Used for generating lock keys
 */
export function roundToIntervalBoundary(
  timestamp: Date,
  resolution: string = '5'
): Date {
  const minutes = resolutionToMinutes(resolution)

  // For daily or longer
  if (minutes >= 1440) {
    const rounded = new Date(timestamp)
    rounded.setUTCHours(0, 0, 0, 0)
    return rounded
  }

  // For intraday
  const minutesSinceMidnight = timestamp.getUTCHours() * 60 + timestamp.getUTCMinutes()
  const intervalsElapsed = Math.floor(minutesSinceMidnight / minutes)
  const boundaryMinutes = intervalsElapsed * minutes

  const boundaryHour = Math.floor(boundaryMinutes / 60)
  const boundaryMinute = boundaryMinutes % 60

  const rounded = new Date(timestamp)
  rounded.setUTCHours(boundaryHour, boundaryMinute, 0, 0)

  return rounded
}

/**
 * Format timestamp as interval key for Redis locks
 */
export function formatIntervalKey(
  timestamp: Date,
  resolution: string = '5'
): string {
  const rounded = roundToIntervalBoundary(timestamp, resolution)
  return rounded.toISOString()
}

/**
 * Compute appropriate TTL for execution lock
 * TTL should be slightly less than interval duration to prevent deadlocks
 */
export function computeLockTTL(
  resolution: string,
  safetyMarginSeconds: number = 5
): number {
  const minutes = resolutionToMinutes(resolution)
  const intervalSeconds = minutes * 60
  return Math.max(intervalSeconds - safetyMarginSeconds, 1)
}

/**
 * Validate that execution happened close to scheduled candle close
 */
export function validateExecutionTiming(
  scheduledTime: Date,
  actualTime: Date,
  maxDriftSeconds: number = 2.0
): { isValid: boolean; driftSeconds: number } {
  const driftMs = Math.abs(actualTime.getTime() - scheduledTime.getTime())
  const driftSeconds = driftMs / 1000
  const isValid = driftSeconds <= maxDriftSeconds

  return { isValid, driftSeconds }
}

/**
 * Get the [start, end) range for the candle interval containing the timestamp
 */
export function getCandleIntervalRange(
  timestamp: Date,
  resolution: string = '5'
): { start: Date; end: Date } {
  const start = roundToIntervalBoundary(timestamp, resolution)
  const minutes = resolutionToMinutes(resolution)

  const end = new Date(start)
  end.setUTCMinutes(end.getUTCMinutes() + minutes)

  return { start, end }
}

/**
 * Log execution timing information for observability
 */
export function logExecutionTiming(
  strategyId: string,
  resolution: string,
  scheduledTime: Date,
  actualStartTime: Date,
  executionDuration: number
): void {
  const { isValid, driftSeconds } = validateExecutionTiming(scheduledTime, actualStartTime)

  const logData = {
    strategy_id: strategyId,
    resolution,
    scheduled: scheduledTime.toISOString(),
    actual_start: actualStartTime.toISOString(),
    drift_seconds: driftSeconds.toFixed(3),
    duration_seconds: executionDuration.toFixed(3),
    on_time: isValid,
  }

  if (isValid) {
    console.log('Strategy execution timing:', JSON.stringify(logData))
  } else {
    console.warn('Strategy execution drift exceeded threshold:', JSON.stringify(logData))
  }
}

/**
 * Parse candle event from exchange WebSocket
 * Format expected: { symbol: 'BTCUSDT', resolution: '5', closeTime: number }
 */
export interface CandleEvent {
  symbol: string
  resolution: string
  closeTime: number // Unix timestamp in milliseconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Check if a candle event represents a candle close
 */
export function isCandleCloseEvent(event: CandleEvent, now: Date = new Date()): boolean {
  const closeTime = new Date(event.closeTime)
  const timeDiff = Math.abs(now.getTime() - closeTime.getTime())

  // Allow 1 second tolerance
  return timeDiff < 1000
}
